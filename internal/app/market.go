package app

import (
	"bytes"
	"database/sql"
	"errors"
	"image"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"
)

func marketText(s string, min, max int) bool {
	n := utf8.RuneCountInString(strings.TrimSpace(s))
	return n >= min && n <= max
}
func (a *App) marketGet(w http.ResponseWriter, r *http.Request) error {
	mode := r.URL.Query().Get("mode")
	if mode == "reviews" {
		rows, e := a.db.QueryContext(r.Context(), "SELECT rating,comment,created FROM market_reviews WHERE product_id=$1 ORDER BY created DESC LIMIT 100", r.URL.Query().Get("id"))
		if e != nil {
			return e
		}
		out, e := rowsJSON(rows)
		if e != nil {
			return e
		}
		jsonResponse(w, map[string]any{"results": out})
		return nil
	}
	if mode == "account" {
		u, e := a.user(r)
		if e != nil {
			return e
		}
		var seller any
		rows, e := a.db.QueryContext(r.Context(), "SELECT name,legal_name,tax_id,contact,warehouse FROM market_sellers WHERE id=$1", u.ID)
		if e != nil {
			return e
		}
		s, e := rowsJSON(rows)
		if e != nil {
			return e
		}
		if len(s) > 0 {
			seller = s[0]
		}
		rows, e = a.db.QueryContext(r.Context(), "SELECT id,name,description,category,price,stock,image,active,version FROM market_products WHERE seller_id=$1 ORDER BY created DESC", u.ID)
		if e != nil {
			return e
		}
		products, e := rowsJSON(rows)
		if e != nil {
			return e
		}
		rows, e = a.db.QueryContext(r.Context(), `SELECT o.id,o.name,o.price,o.quantity,o.contact,o.area,o.proposal,o.status,o.created,s.name seller_name,s.contact seller_contact,COALESCE(rev.rating,0) rating,COALESCE(rev.comment,'') comment,CASE WHEN o.seller_id=$1 THEN 'seller' ELSE 'buyer' END role FROM market_orders o JOIN market_sellers s ON s.id=o.seller_id LEFT JOIN market_reviews rev ON rev.order_id=o.id WHERE o.buyer=$1 OR o.seller_id=$1 ORDER BY o.created DESC LIMIT 500`, u.ID)
		if e != nil {
			return e
		}
		orders, e := rowsJSON(rows)
		if e != nil {
			return e
		}
		jsonResponse(w, map[string]any{"seller": seller, "products": products, "orders": orders})
		return nil
	}
	rows, e := a.db.QueryContext(r.Context(), `SELECT p.id,p.name,p.description,p.category,p.price,p.stock,p.image,p.created,s.name seller_name,s.legal_name,s.tax_id,s.contact seller_contact,s.warehouse,COALESCE(rev.rating,0) rating,COALESCE(rev.reviews,0) reviews FROM market_products p JOIN market_sellers s ON s.id=p.seller_id LEFT JOIN(SELECT product_id,avg(rating) rating,count(*) reviews FROM market_reviews GROUP BY product_id) rev ON rev.product_id=p.id WHERE p.active ORDER BY p.created DESC LIMIT 1000`)
	if e != nil {
		return e
	}
	out, e := rowsJSON(rows)
	if e != nil {
		return e
	}
	jsonResponse(w, map[string]any{"results": out})
	return nil
}

type marketInput struct {
	Action      string `json:"action"`
	ID          string `json:"id"`
	Name        string `json:"name"`
	LegalName   string `json:"legalName"`
	TaxID       string `json:"taxId"`
	Contact     string `json:"contact"`
	Warehouse   string `json:"warehouse"`
	Description string `json:"description"`
	Category    string `json:"category"`
	Price       int64  `json:"price"`
	Stock       int    `json:"stock"`
	Image       string `json:"image"`
	Active      bool   `json:"active"`
	Version     int    `json:"version"`
	ProductID   string `json:"productId"`
	Quantity    int    `json:"quantity"`
	Area        string `json:"area"`
	Status      string `json:"status"`
	Proposal    string `json:"proposal"`
	Rating      int    `json:"rating"`
	Comment     string `json:"comment"`
}

func (a *App) marketPost(w http.ResponseWriter, r *http.Request) error {
	u, e := a.user(r)
	if e != nil {
		return e
	}
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		return a.marketUpload(w, r, u)
	}
	r.Body = http.MaxBytesReader(w, r.Body, 24000)
	var in marketInput
	if e = readJSON(w, r, &in); e != nil {
		return e
	}
	now := time.Now().UnixMilli()
	switch in.Action {
	case "profile":
		if !marketText(in.Name, 2, 80) || !marketText(in.LegalName, 2, 180) || !validINN(in.TaxID) || !marketText(in.Contact, 5, 180) || !marketText(in.Warehouse, 3, 240) {
			return fail(422, "INVALID_SELLER", "Проверьте название, реквизиты, ИНН и контакты продавца")
		}
		_, e = a.db.ExecContext(r.Context(), "INSERT INTO market_sellers(id,name,legal_name,tax_id,contact,warehouse,created) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET name=excluded.name,legal_name=excluded.legal_name,tax_id=excluded.tax_id,contact=excluded.contact,warehouse=excluded.warehouse", u.ID, strings.TrimSpace(in.Name), strings.TrimSpace(in.LegalName), in.TaxID, strings.TrimSpace(in.Contact), strings.TrimSpace(in.Warehouse), now)
	case "product":
		if !marketText(in.Name, 2, 100) || !marketText(in.Description, 5, 2000) || !includes([]string{"Для дома", "Аксессуары", "Свет", "Одежда", "Другое"}, in.Category) || in.Price < 100 || in.Price > 100000000 || in.Stock < 0 || in.Stock > 100000 {
			return fail(422, "INVALID_PRODUCT", "Проверьте поля товара, цену и остаток")
		}
		var own bool
		e = a.db.QueryRowContext(r.Context(), "SELECT EXISTS(SELECT 1 FROM market_uploads f JOIN market_sellers s ON s.id=f.owner_id WHERE f.id=$1 AND f.owner_id=$2)", in.Image, u.ID).Scan(&own)
		if e != nil {
			return e
		}
		if !own {
			return fail(403, "IMAGE_REQUIRED", "Создайте профиль селлера и загрузите собственную фотографию")
		}
		if in.ID == "" {
			in.ID = newID()
			_, e = a.db.ExecContext(r.Context(), "INSERT INTO market_products(id,seller_id,name,description,category,price,stock,image,active,created) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", in.ID, u.ID, in.Name, in.Description, in.Category, in.Price, in.Stock, in.Image, in.Active, now)
		} else {
			var result sql.Result
			result, e = a.db.ExecContext(r.Context(), "UPDATE market_products SET name=$1,description=$2,category=$3,price=$4,stock=$5,image=$6,active=$7,version=version+1 WHERE id=$8 AND seller_id=$9 AND version=$10", in.Name, in.Description, in.Category, in.Price, in.Stock, in.Image, in.Active, in.ID, u.ID, in.Version)
			if e == nil {
				n, _ := result.RowsAffected()
				if n == 0 {
					return fail(409, "PRODUCT_CHANGED", "Товар изменился. Обновите кабинет и откройте карточку заново.")
				}
			}
		}
	case "order":
		return a.marketOrder(w, r, u, in)
	case "status":
		return a.marketStatus(w, r, u, in)
	case "review":
		if in.Rating < 1 || in.Rating > 5 || !marketText(in.Comment, 0, 1000) {
			return fail(422, "INVALID_REVIEW", "Проверьте оценку и отзыв")
		}
		var result sql.Result
		result, e = a.db.ExecContext(r.Context(), "INSERT INTO market_reviews(order_id,product_id,rating,comment,created) SELECT id,product_id,$1,$2,$3 FROM market_orders WHERE id=$4 AND buyer=$5 AND status='completed' ON CONFLICT DO NOTHING", in.Rating, strings.TrimSpace(in.Comment), now, in.ID, u.ID)
		if e == nil {
			n, _ := result.RowsAffected()
			if n == 0 {
				return fail(409, "REVIEW_UNAVAILABLE", "Отзыв доступен один раз после получения своего заказа")
			}
		}
	default:
		return fail(400, "UNKNOWN_ACTION", "Неизвестное действие")
	}
	if e != nil {
		return e
	}
	jsonResponse(w, map[string]any{"ok": true, "id": in.ID})
	return nil
}
func (a *App) marketOrder(w http.ResponseWriter, r *http.Request, u *User, in marketInput) error {
	if !regexpID.MatchString(in.ID) || in.Quantity < 1 || in.Quantity > 100 || !marketText(in.Contact, 5, 180) || !marketText(in.Area, 3, 240) {
		return fail(422, "INVALID_ORDER", "Проверьте количество и данные заказа")
	}
	tx, e := a.db.BeginTx(r.Context(), nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	if _, e = tx.ExecContext(r.Context(), "SELECT pg_advisory_xact_lock(hashtext($1))", "market-order:"+in.ID); e != nil {
		return e
	}
	var buyer, product string
	var quantity int
	e = tx.QueryRowContext(r.Context(), "SELECT buyer,product_id,quantity FROM market_orders WHERE id=$1", in.ID).Scan(&buyer, &product, &quantity)
	if e == nil {
		if buyer != u.ID || product != in.ProductID || quantity != in.Quantity {
			return fail(409, "ORDER_CONFLICT", "Повторите оформление заказа")
		}
		jsonResponse(w, map[string]any{"ok": true, "id": in.ID})
		return nil
	}
	if !errors.Is(e, sql.ErrNoRows) {
		return e
	}
	if !a.allow("market-orders:"+u.ID, 20) {
		return fail(429, "RATE_LIMIT", "Слишком много заказов. Попробуйте позже.")
	}
	var seller, name string
	var price int64
	var stock int
	var active bool
	e = tx.QueryRowContext(r.Context(), "SELECT seller_id,name,price,stock,active FROM market_products WHERE id=$1 FOR UPDATE", in.ProductID).Scan(&seller, &name, &price, &stock, &active)
	if errors.Is(e, sql.ErrNoRows) {
		return fail(404, "NOT_FOUND", "Товар не найден")
	}
	if e != nil {
		return e
	}
	if !active || stock < in.Quantity || price != in.Price || seller == u.ID {
		return fail(409, "PRODUCT_CHANGED", "Цена или остаток изменились, либо это ваш товар. Обновите каталог.")
	}
	if _, e = tx.ExecContext(r.Context(), "UPDATE market_products SET stock=stock-$1,version=version+1 WHERE id=$2", in.Quantity, in.ProductID); e != nil {
		return e
	}
	if _, e = tx.ExecContext(r.Context(), "INSERT INTO market_orders(id,buyer,seller_id,product_id,name,price,quantity,contact,area,created) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", in.ID, u.ID, seller, in.ProductID, name, price, in.Quantity, in.Contact, in.Area, time.Now().UnixMilli()); e != nil {
		return e
	}
	if e = tx.Commit(); e != nil {
		return e
	}
	jsonResponse(w, map[string]any{"ok": true, "id": in.ID})
	return nil
}
func (a *App) marketStatus(w http.ResponseWriter, r *http.Request, u *User, in marketInput) error {
	tx, e := a.db.BeginTx(r.Context(), nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	var buyer, seller, product, status, proposal string
	var quantity int
	e = tx.QueryRowContext(r.Context(), "SELECT buyer,seller_id,product_id,status,proposal,quantity FROM market_orders WHERE id=$1 AND (buyer=$2 OR seller_id=$2) FOR UPDATE", in.ID, u.ID).Scan(&buyer, &seller, &product, &status, &proposal, &quantity)
	if errors.Is(e, sql.ErrNoRows) {
		return fail(404, "NOT_FOUND", "Заказ не найден")
	}
	if e != nil {
		return e
	}
	allowed := false
	isSeller := seller == u.ID
	switch status {
	case "requested":
		allowed = in.Status == "cancelled" || (isSeller && in.Status == "proposed")
	case "proposed":
		allowed = in.Status == "cancelled" || (isSeller && in.Status == "proposed") || (!isSeller && in.Status == "confirmed")
	case "confirmed":
		allowed = in.Status == "cancelled" || (isSeller && in.Status == "shipped")
	case "shipped":
		allowed = isSeller && in.Status == "ready"
	case "ready":
		allowed = !isSeller && in.Status == "completed"
	}
	if !allowed {
		return fail(409, "STATUS_CHANGED", "Статус уже изменился. Обновите заказы.")
	}
	if in.Status == "proposed" {
		if !marketText(in.Proposal, 10, 1500) {
			return fail(422, "PROPOSAL_REQUIRED", "Укажите адрес, срок, стоимость доставки и условия оплаты")
		}
		proposal = in.Proposal
	}
	if in.Status == "cancelled" {
		if _, e = tx.ExecContext(r.Context(), "UPDATE market_products SET stock=stock+$1,version=version+1 WHERE id=$2", quantity, product); e != nil {
			return e
		}
	}
	if _, e = tx.ExecContext(r.Context(), "UPDATE market_orders SET status=$1,proposal=$2 WHERE id=$3", in.Status, proposal, in.ID); e != nil {
		return e
	}
	if e = tx.Commit(); e != nil {
		return e
	}
	jsonResponse(w, map[string]bool{"ok": true})
	return nil
}
func (a *App) marketUpload(w http.ResponseWriter, r *http.Request, u *User) error {
	ip, _, _ := net.SplitHostPort(r.RemoteAddr)
	if !a.allow("market-upload-user:"+u.ID, 20) || !a.allow("market-upload-ip:"+ip, 30) {
		return fail(429, "RATE_LIMIT", "Слишком много загрузок. Попробуйте через минуту")
	}
	var seller bool
	if e := a.db.QueryRowContext(r.Context(), "SELECT EXISTS(SELECT 1 FROM market_sellers WHERE id=$1)", u.ID).Scan(&seller); e != nil {
		return e
	}
	if !seller {
		return fail(403, "SELLER_REQUIRED", "Сначала создайте профиль селлера")
	}
	const limit = 5 << 20
	r.Body = http.MaxBytesReader(w, r.Body, limit+(1<<20))
	if e := r.ParseMultipartForm(1 << 20); e != nil {
		return fail(413, "FILE_TOO_LARGE", "Фото должно быть меньше 5 МБ")
	}
	defer r.MultipartForm.RemoveAll()
	f, h, e := r.FormFile("photo")
	if e != nil {
		return fail(422, "PHOTO_REQUIRED", "Выберите фото товара")
	}
	defer f.Close()
	b, e := io.ReadAll(io.LimitReader(f, limit+1))
	if e != nil {
		return e
	}
	if len(b) < 12 || len(b) > limit {
		return fail(413, "FILE_TOO_LARGE", "Выберите фото до 5 МБ")
	}
	mime := http.DetectContentType(b)
	ext := strings.ToLower(filepath.Ext(h.Filename))
	allowed := map[string][]string{"image/jpeg": {".jpg", ".jpeg"}, "image/png": {".png"}, "image/webp": {".webp"}}
	if !includes(allowed[mime], ext) {
		return fail(422, "INVALID_IMAGE", "Поддерживаются JPG, PNG и WebP")
	}
	cfg, _, e := image.DecodeConfig(bytes.NewReader(b))
	if e != nil || cfg.Width <= 0 || cfg.Height <= 0 || int64(cfg.Width)*int64(cfg.Height) > 40000000 {
		return fail(422, "INVALID_IMAGE", "Изображение повреждено или слишком большое")
	}
	if _, _, e = image.Decode(bytes.NewReader(b)); e != nil {
		return fail(422, "INVALID_IMAGE", "Изображение повреждено")
	}
	var count int
	if e = a.db.QueryRowContext(r.Context(), "SELECT count(*) FROM market_uploads WHERE owner_id=$1 AND created>$2", u.ID, time.Now().Add(-24*time.Hour).UnixMilli()).Scan(&count); e != nil {
		return e
	}
	if count >= 100 {
		return fail(429, "RATE_LIMIT", "Лимит 100 фотографий в день")
	}
	id := newID()
	name := "market-" + id + ext
	file := filepath.Join(a.uploadDir, name)
	if e = os.WriteFile(file, b, 0600); e != nil {
		return e
	}
	_, e = a.db.ExecContext(r.Context(), "INSERT INTO market_uploads(id,owner_id,storage_name,mime,created) VALUES($1,$2,$3,$4,$5)", id, u.ID, name, mime, time.Now().UnixMilli())
	if e != nil {
		_ = os.Remove(file)
		return e
	}
	jsonResponse(w, map[string]string{"id": id})
	return nil
}
func (a *App) marketPhoto(w http.ResponseWriter, r *http.Request) error {
	uid := ""
	if u, _ := a.user(r); u != nil {
		uid = u.ID
	}
	var file, mime string
	e := a.db.QueryRowContext(r.Context(), "SELECT f.storage_name,f.mime FROM market_uploads f WHERE f.id=$1 AND (f.owner_id=$2 OR EXISTS(SELECT 1 FROM market_products p WHERE p.image=f.id AND p.active))", r.PathValue("id"), uid).Scan(&file, &mime)
	if errors.Is(e, sql.ErrNoRows) {
		return fail(404, "NOT_FOUND", "Фото не найдено")
	}
	if e != nil {
		return e
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Cache-Control", "private, no-store")
	http.ServeFile(w, r, filepath.Join(a.uploadDir, file))
	return nil
}
