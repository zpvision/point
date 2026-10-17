package app

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"strings"
	"testing"
)

func (h *harness) acceptDesignConsent() {
	h.request("POST", "/point-consent", map[string]any{"accepted": true, "readToEnd": true, "version": designVersion("consent")}, 200)
}
func TestIntegrationDesignUsesNativeRegistration(t *testing.T) {
	h := integration(t)
	h.signup("design@example.test")
	s := h.start("POINT_REGISTRATION")
	draft := map[string]any{"id": s.ID, "status": "draft", "data": map[string]any{"step": 0, "photos": []any{}}}
	h.request("PUT", "/cabinet/points", draft, 403)
	h.acceptDesignConsent()
	h.request("PUT", "/cabinet/points", draft, 200)
	h.request("POST", "/registration/sessions/"+s.ID+"/complete", map[string]any{}, 403)
	h.request("POST", "/cabinet/offer", map[string]any{"pointId": s.ID, "version": designVersion("offer"), "reviewed": true, "readToEnd": true}, 200)
	h.request("POST", "/registration/sessions/"+s.ID+"/complete", map[string]any{}, 422)
	s = h.fillPoint(s)
	h.request("POST", "/registration/sessions/"+s.ID+"/complete", map[string]any{}, 200)
	var application string
	if e := h.a.db.QueryRow("SELECT status FROM point_applications WHERE session_id=$1", s.ID).Scan(&application); e != nil || application != "IN_REVIEW" {
		t.Fatalf("native moderation missing: %s %v", application, e)
	}
	h.request("PUT", "/cabinet/points", draft, 409)
	var items []map[string]any
	_ = json.Unmarshal(h.request("GET", "/cabinet/points", nil, 200), &items)
	if len(items) != 1 || items[0]["status"] != "ready" {
		t.Fatal(items)
	}
}
func TestIntegrationDesignOwnershipAndPlans(t *testing.T) {
	h := integration(t)
	h.signup("design-owner@example.test")
	h.acceptDesignConsent()
	id := newID()
	draft := map[string]any{"id": id, "status": "draft", "data": map[string]any{"step": 0, "photos": []any{}}}
	h.request("PUT", "/cabinet/points", draft, 200)
	forged := map[string]any{"id": id, "status": "ready", "data": map[string]any{"step": 12, "photos": []any{}}}
	h.request("PUT", "/cabinet/points", forged, 409)
	plan := map[string]any{"pointId": id, "month": "2026-02", "workingDays": 29, "acceptPerDay": 20, "issuePerDay": 20, "storageSlots": 50, "averageStorageDays": 3}
	h.request("PUT", "/cabinet/plans", plan, 422)
	plan["workingDays"] = 20
	h.request("PUT", "/cabinet/plans", plan, 200)
	h.request("GET", "/cabinet/plans?pointId="+id+"&month=2026-02", nil, 200)
	jar, _ := cookiejar.New(nil)
	other := *h
	other.client = &http.Client{Jar: jar}
	other.signup("design-other@example.test")
	other.acceptDesignConsent()
	other.request("PUT", "/cabinet/points", draft, 404)
	other.request("GET", "/cabinet/offer?pointId="+id, nil, 404)
	other.request("GET", "/cabinet/operations?pointId="+id+"&month=2026-02", nil, 404)
	h.request("POST", "/integrations/point-events", map[string]any{}, 401)
}
func TestIntegrationMarketAtomicReservationAndCancellation(t *testing.T) {
	h := integration(t)
	seller := h.signup("market-seller@example.test")
	_, e := h.a.db.Exec("INSERT INTO market_sellers(id,name,legal_name,tax_id,contact,warehouse,created) VALUES($1,'Витрина','ИП','500100732259','Контакт','Москва',0)", seller)
	if e != nil {
		t.Fatal(e)
	}
	image, product := newID(), newID()
	if _, e = h.a.db.Exec("INSERT INTO market_uploads VALUES($1,$2,'fixture.png','image/png',0)", image, seller); e != nil {
		t.Fatal(e)
	}
	if _, e = h.a.db.Exec("INSERT INTO market_products(id,seller_id,name,description,category,price,stock,image,created) VALUES($1,$2,'Товар','Описание товара','Для дома',1000,1,$3,0)", product, seller, image); e != nil {
		t.Fatal(e)
	}
	jar, _ := cookiejar.New(nil)
	buyer := *h
	buyer.client = &http.Client{Jar: jar}
	buyer.signup("market-buyer@example.test")
	order := map[string]any{"action": "order", "id": newID(), "productId": product, "price": 1000, "quantity": 1, "contact": "buyer@example.test", "area": "Москва"}
	buyer.request("POST", "/market", order, 200)
	buyer.request("POST", "/market", order, 200)
	var stock int
	_ = h.a.db.QueryRow("SELECT stock FROM market_products WHERE id=$1", product).Scan(&stock)
	if stock != 0 {
		t.Fatal("reservation not idempotent", stock)
	}
	order2 := map[string]any{}
	for k, v := range order {
		order2[k] = v
	}
	order2["id"] = newID()
	buyer.request("POST", "/market", order2, 409)
	cancel := map[string]any{"action": "status", "id": order["id"], "status": "cancelled"}
	buyer.request("POST", "/market", cancel, 200)
	buyer.request("POST", "/market", cancel, 409)
	_ = h.a.db.QueryRow("SELECT stock FROM market_products WHERE id=$1", product).Scan(&stock)
	if stock != 1 {
		t.Fatal("cancellation restored wrong quantity", stock)
	}
	buyer.request("POST", "/market", map[string]any{"action": "review", "id": order["id"], "rating": 5, "comment": "Хорошо"}, 409)
}

func TestIntegrationDesignTrustedLedgerIsIdempotent(t *testing.T) {
	h := integration(t)
	h.signup("design-ledger@example.test")
	s := h.fillPoint(h.start("POINT_REGISTRATION"))
	h.request("POST", "/registration/sessions/"+s.ID+"/complete", map[string]any{}, 200)
	secret := "test-only-ledger-" + strings.Repeat("a", 48)
	t.Setenv("POINT_EVENTS_SECRET", secret)
	event := map[string]any{"id": newID(), "pointId": s.ID, "kind": "issued", "reference": "parcel-1", "amount_kopecks": 1500, "occurred_at": "2026-10-18T00:00:00Z"}
	send := func(expected int) {
		t.Helper()
		b, _ := json.Marshal(event)
		req, _ := http.NewRequest("POST", h.server.URL+"/api/integrations/point-events", bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+secret)
		response, err := h.client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(response.Body)
		_ = response.Body.Close()
		if response.StatusCode != expected {
			t.Fatalf("event %d: %s", response.StatusCode, body)
		}
	}
	send(200)
	send(200)
	event["amount_kopecks"] = 2000
	send(409)
	var out struct {
		Totals struct {
			Balance int64 `json:"balance"`
		} `json:"totals"`
		Period struct {
			Issued int64 `json:"issued"`
		} `json:"period"`
	}
	_ = json.Unmarshal(h.request("GET", "/cabinet/operations?pointId="+s.ID+"&month=2026-10", nil, 200), &out)
	if out.Totals.Balance != 1500 || out.Period.Issued != 1 {
		t.Fatalf("duplicate or conflicting event affected balance: %+v", out)
	}
}
