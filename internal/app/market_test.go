package app

import (
	"bytes"
	"encoding/json"
	"image"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"testing"
)

func TestIntegrationMarketFullWorkflow(t *testing.T) {
	h := integration(t)
	h.signup("market-workflow-seller@example.test")
	h.request("POST", "/market", map[string]any{"action": "profile", "name": "Витрина", "legalName": "ИП Тестовый", "taxId": "500100732259", "contact": "seller@example.test", "warehouse": "Москва"}, 200)
	var buffer bytes.Buffer
	form := multipart.NewWriter(&buffer)
	file, e := form.CreateFormFile("photo", "product.png")
	if e != nil {
		t.Fatal(e)
	}
	if e = png.Encode(file, image.NewRGBA(image.Rect(0, 0, 4, 4))); e != nil {
		t.Fatal(e)
	}
	_ = form.Close()
	req, _ := http.NewRequest("POST", h.server.URL+"/api/market", &buffer)
	req.Header.Set("Origin", h.server.URL)
	req.Header.Set("Content-Type", form.FormDataContentType())
	response, e := h.client.Do(req)
	if e != nil {
		t.Fatal(e)
	}
	data, _ := io.ReadAll(response.Body)
	_ = response.Body.Close()
	if response.StatusCode != 200 {
		t.Fatalf("upload %d %s", response.StatusCode, data)
	}
	var upload struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(data, &upload)
	var product struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(h.request("POST", "/market", map[string]any{"action": "product", "name": "Тестовый товар", "description": "Описание тестового товара", "category": "Для дома", "price": 1500, "stock": 2, "image": upload.ID, "active": true}, 200), &product)
	jar, _ := cookiejar.New(nil)
	buyer := *h
	buyer.client = &http.Client{Jar: jar}
	buyer.signup("market-workflow-buyer@example.test")
	order := newID()
	buyer.request("POST", "/market", map[string]any{"action": "order", "id": order, "productId": product.ID, "quantity": 1, "price": 1500, "contact": "buyer@example.test", "area": "Москва"}, 200)
	buyer.request("POST", "/market", map[string]any{"action": "status", "id": order, "status": "shipped"}, 409)
	h.request("POST", "/market", map[string]any{"action": "status", "id": order, "status": "proposed", "proposal": "Москва, выдача завтра. Доставка 100 руб., оплата продавцу."}, 200)
	buyer.request("POST", "/market", map[string]any{"action": "status", "id": order, "status": "confirmed"}, 200)
	h.request("POST", "/market", map[string]any{"action": "status", "id": order, "status": "shipped"}, 200)
	h.request("POST", "/market", map[string]any{"action": "status", "id": order, "status": "ready"}, 200)
	buyer.request("POST", "/market", map[string]any{"action": "status", "id": order, "status": "completed"}, 200)
	buyer.request("POST", "/market", map[string]any{"action": "review", "id": order, "rating": 5, "comment": "Отличный товар"}, 200)
	buyer.request("POST", "/market", map[string]any{"action": "review", "id": order, "rating": 4, "comment": "Дубликат"}, 409)
	var catalog struct {
		Results []map[string]any `json:"results"`
	}
	_ = json.Unmarshal(h.request("GET", "/market", nil, 200), &catalog)
	if len(catalog.Results) != 1 || catalog.Results[0]["reviews"] != float64(1) || catalog.Results[0]["stock"] != float64(1) {
		t.Fatalf("catalog: %s", h.request("GET", "/market", nil, 200))
	}
}
