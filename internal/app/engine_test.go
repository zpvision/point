package app

import (
	"encoding/json"
	"testing"
)

func TestInitialGraphs(t *testing.T) {
	for code, g := range initialGraphs() {
		if e := g.Validate(code); e != nil {
			t.Fatalf("%s: %v", code, e)
		}
	}
}
func TestConditions(t *testing.T) {
	cases := []struct {
		op   string
		v, w any
		want bool
	}{{"equals", "OTHER", "OTHER", true}, {"not_equals", "SELF", "OTHER", true}, {"not_equals", nil, "OTHER", false}, {"contains", []any{"pickup", "returns"}, "returns", true}, {"not_contains", []any{"pickup"}, "returns", true}, {"greater_than", float64(20), float64(10), true}, {"less_than", float64(2), float64(10), true}, {"is_empty", "", nil, true}, {"is_not_empty", false, nil, true}, {"equals", false, false, true}, {"eval", "1+1", nil, false}}
	for _, tt := range cases {
		t.Run(tt.op+stringValue(tt.v), func(t *testing.T) {
			if got := condition(Condition{Source: "x", Operator: tt.op, Value: tt.w}, map[string]any{"x": tt.v}); got != tt.want {
				t.Fatalf("got %v", got)
			}
		})
	}
}
func TestConditionalFlowRemovesStaleContact(t *testing.T) {
	g := initialGraphs()["POINT_REGISTRATION"]
	raw := map[string]any{"contact_owner": "OTHER", "contact_name": "Иван", "contact_phone": "+79991234567"}
	_, active := g.Effective(raw)
	if active["contact_phone"] == nil {
		t.Fatal("contact missing")
	}
	raw["contact_owner"] = "SELF"
	questions, active := g.Effective(raw)
	if active["contact_phone"] != nil || g.Bound(active)["point.contact_phone"] != nil {
		t.Fatal("stale contact leaked")
	}
	for _, q := range questions {
		if q.Key == "contact_name" {
			t.Fatal("hidden question visible")
		}
	}
}
func TestConditionGroups(t *testing.T) {
	q := Question{Enabled: true, Conditions: []Condition{{Source: "a", Operator: "equals", Value: "yes", Group: 0}, {Source: "b", Operator: "equals", Value: true, Group: 0}, {Source: "c", Operator: "equals", Value: "alternate", Group: 1}}}
	if visible(q, map[string]any{"a": "yes", "b": false}) {
		t.Fatal("AND ignored")
	}
	if !visible(q, map[string]any{"c": "alternate"}) {
		t.Fatal("OR ignored")
	}
}
func TestValidation(t *testing.T) {
	tests := []struct {
		name string
		q    Question
		v    any
		ok   bool
	}{
		{"required", Question{Type: "TEXT", Required: true}, "", false},
		{"select forged", Question{Type: "SINGLE_SELECT", Options: []Option{{"a", "A", true}}}, "b", false},
		{"disabled option", Question{Type: "SINGLE_SELECT", Options: []Option{{"a", "A", false}}}, "a", false},
		{"multi", Question{Type: "MULTI_SELECT", Options: []Option{{"a", "A", true}}}, []any{"a"}, true},
		{"duplicate multi", Question{Type: "MULTI_SELECT", Options: []Option{{"a", "A", true}}}, []any{"a", "a"}, false},
		{"consent false", Question{Type: "CONSENT", Required: true}, false, false},
		{"yesno false", Question{Type: "YES_NO", Required: true}, false, true},
		{"email", Question{Type: "EMAIL"}, "Name <a@example.com>", false},
		{"phone", Question{Type: "PHONE"}, "8 (999) 123-45-67", true},
		{"password short", Question{Type: "PASSWORD"}, "123", false},
		{"password short unicode", Question{Type: "PASSWORD"}, "пароль", false},
		{"password ten characters", Question{Type: "PASSWORD"}, "пароль1234", true},
		{"password too many bytes", Question{Type: "PASSWORD"}, "😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀", false},
		{"time", Question{Type: "TIME"}, "25:00", false},
		{"number wrong type", Question{Type: "NUMBER"}, "5", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, e := validateAnswer(tt.q, tt.v)
			if (e == nil) != tt.ok {
				t.Fatalf("error=%v", e)
			}
		})
	}
}
func TestINN(t *testing.T) {
	for _, s := range []string{"7707083893", "500100732259"} {
		if !validINN(s) {
			t.Fatalf("valid INN rejected: %s", s)
		}
	}
	for _, s := range []string{"7707083894", "123", "500100732250", "aaaaaaaaaa"} {
		if validINN(s) {
			t.Fatalf("invalid INN accepted: %s", s)
		}
	}
}
func TestAddressCoordinates(t *testing.T) {
	a := Address{Address: "Москва", AddressLatitude: 55.75, AddressLongitude: 37.6, EntranceLatitude: 55.751, EntranceLongitude: 37.601, MarkerAdjusted: true, Confirmed: true}
	b, _ := json.Marshal(a)
	var raw any
	_ = json.Unmarshal(b, &raw)
	v, e := validateAnswer(Question{Type: "ADDRESS_MAP", Required: true}, raw)
	if e != nil {
		t.Fatal(e)
	}
	got := v.(Address)
	if got.AddressLatitude == got.EntranceLatitude {
		t.Fatal("entrance lost")
	}
	a.MarkerAdjusted = false
	b, _ = json.Marshal(a)
	_ = json.Unmarshal(b, &raw)
	v, e = validateAnswer(Question{Type: "ADDRESS_MAP"}, raw)
	if e != nil {
		t.Fatal(e)
	}
	if v.(Address).EntranceLatitude != a.AddressLatitude {
		t.Fatal("default entrance mismatch")
	}
}
func TestPublishRejectsBrokenGraph(t *testing.T) {
	g := initialGraphs()["POINT_REGISTRATION"]
	g.Questions = append(g.Questions, g.Questions[0])
	if g.Validate("POINT_REGISTRATION") == nil {
		t.Fatal("duplicate accepted")
	}
	g = initialGraphs()["POINT_REGISTRATION"]
	g.Questions[0].Binding = "user.role"
	if g.Validate("POINT_REGISTRATION") == nil {
		t.Fatal("dangerous binding accepted")
	}
	g = initialGraphs()["POINT_REGISTRATION"]
	g.Questions[0].Conditions = []Condition{{Source: "contact_owner", Operator: "equals", Value: "OTHER"}}
	if g.Validate("POINT_REGISTRATION") == nil {
		t.Fatal("forward reference accepted")
	}
	g = initialGraphs()["USER_REGISTRATION"]
	g.Questions[4].Enabled = false
	if g.Validate("USER_REGISTRATION") == nil {
		t.Fatal("missing password accepted")
	}
}
