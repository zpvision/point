package app

import (
	"encoding/json"
	"testing"
)

func TestIntegrationDashboardDraftsPhotosAndOwnership(t *testing.T) {
	h := integration(t)
	h.signup("dashboard-owner@example.com")
	s := h.start("POINT_REGISTRATION")
	list := func() []map[string]any {
		t.Helper()
		var items []map[string]any
		if e := json.Unmarshal(h.request("GET", "/points", nil, 200), &items); e != nil {
			t.Fatal(e)
		}
		return items
	}
	items := list()
	if len(items) != 1 || items[0]["status"] != "DRAFT" || items[0]["session_id"] != s.ID || items[0]["cover_id"] != "" {
		t.Fatalf("new draft not listed correctly: %v", items)
	}
	s = h.fillPoint(s)
	items = list()
	if len(items) != 1 || items[0]["cover_id"] == "" || items[0]["organization_name"] != "Тестовая организация" || items[0]["formatted_address"] != fixtureAnswers()["point_address"].(Address).Address {
		t.Fatalf("draft preview not populated: %v", items)
	}
	cover := items[0]["cover_id"].(string)
	var category string
	if e := h.a.db.QueryRow("SELECT category FROM attachments WHERE id=$1", cover).Scan(&category); e != nil || category != "facade" {
		t.Fatalf("wrong cover: %s %v", category, e)
	}
	if _, ok := items[0]["answers"]; ok {
		t.Fatal("raw answers exposed")
	}
	h.request("POST", "/registration/sessions/"+s.ID+"/complete", map[string]any{}, 200)
	items = list()
	if len(items) != 1 || items[0]["status"] != "IN_REVIEW" || items[0]["application_id"] == "" || items[0]["cover_id"] != cover {
		t.Fatalf("submitted point duplicated or cover missing: %v", items)
	}
	h.request("POST", "/auth/logout", map[string]any{}, 200)
	h.signup("dashboard-other@example.com")
	if len(list()) != 0 {
		t.Fatal("other user's points leaked")
	}
	other := h.start("POINT_REGISTRATION")
	items = list()
	if len(items) != 1 || items[0]["session_id"] != other.ID {
		t.Fatal("other user's draft leaked")
	}
	h.request("GET", "/attachments/"+cover, nil, 404)
	h.request("POST", "/registration/sessions/"+other.ID+"/cancel", map[string]any{}, 200)
	if len(list()) != 0 {
		t.Fatal("cancelled draft still listed")
	}
}
