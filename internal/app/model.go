package app

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
)

type Section struct {
	Code        string `json:"code"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Order       int    `json:"order"`
}
type Option struct {
	Value   string `json:"value"`
	Label   string `json:"label"`
	Enabled bool   `json:"enabled"`
}
type Condition struct {
	Source   string `json:"source"`
	Operator string `json:"operator"`
	Value    any    `json:"value"`
	Group    int    `json:"group"`
}
type Validation struct {
	Min       *float64 `json:"min,omitempty"`
	Max       *float64 `json:"max,omitempty"`
	MinLength int      `json:"min_length,omitempty"`
	MaxLength int      `json:"max_length,omitempty"`
}
type Settings struct {
	Categories         []Option `json:"categories,omitempty"`
	RequiredCategories []string `json:"required_categories,omitempty"`
	MaxFiles           int      `json:"max_files,omitempty"`
}
type Question struct {
	Key          string      `json:"key"`
	InternalName string      `json:"internal_name"`
	Title        string      `json:"title"`
	Description  string      `json:"description"`
	Type         string      `json:"type"`
	Required     bool        `json:"required"`
	Enabled      bool        `json:"enabled"`
	Order        int         `json:"order"`
	Section      string      `json:"section"`
	Placeholder  string      `json:"placeholder"`
	Binding      string      `json:"binding"`
	AdminNote    string      `json:"admin_note,omitempty"`
	Options      []Option    `json:"options"`
	Conditions   []Condition `json:"conditions"`
	Validation   Validation  `json:"validation"`
	Settings     Settings    `json:"settings"`
}
type Graph struct {
	Sections   []Section  `json:"sections"`
	Questions  []Question `json:"questions"`
	ShowReview bool       `json:"show_review"`
}
type Address struct {
	Address           string            `json:"address"`
	Components        AddressComponents `json:"components"`
	AddressLatitude   float64           `json:"addressLatitude"`
	AddressLongitude  float64           `json:"addressLongitude"`
	EntranceLatitude  float64           `json:"entranceLatitude"`
	EntranceLongitude float64           `json:"entranceLongitude"`
	MarkerAdjusted    bool              `json:"markerAdjusted"`
	Confirmed         bool              `json:"confirmed"`
}
type AddressComponents struct {
	Country    string `json:"country"`
	Region     string `json:"region"`
	City       string `json:"city"`
	Street     string `json:"street"`
	House      string `json:"house"`
	Building   string `json:"building"`
	PostalCode string `json:"postal_code"`
}
type Day struct {
	Enabled      bool   `json:"enabled"`
	Opening      string `json:"opening_time"`
	Closing      string `json:"closing_time"`
	BreakEnabled bool   `json:"break_enabled"`
	BreakFrom    string `json:"break_from"`
	BreakTo      string `json:"break_to"`
}
type Schedule struct {
	Days map[string]Day `json:"days"`
}
type OrganizationData struct {
	INN          string `json:"inn"`
	KPP          string `json:"kpp"`
	OGRN         string `json:"ogrn"`
	OGRNIP       string `json:"ogrnip"`
	ShortName    string `json:"short_name"`
	FullName     string `json:"full_name"`
	LegalAddress string `json:"legal_address"`
	DirectorName string `json:"director_name"`
	EntityType   string `json:"entity_type"`
	Confirmed    bool   `json:"confirmed"`
}
type FileRef struct {
	ID       string `json:"id"`
	Category string `json:"category"`
}
type User struct {
	ID        string `json:"id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Phone     string `json:"phone"`
	Email     string `json:"email"`
	Role      string `json:"role"`
}

var Types = []string{"TEXT", "TEXTAREA", "PHONE", "EMAIL", "PASSWORD", "NUMBER", "YES_NO", "SINGLE_SELECT", "MULTI_SELECT", "CHECKBOX", "CONSENT", "DATE", "TIME", "SCHEDULE", "ADDRESS_MAP", "PHOTO_UPLOAD", "FILE_UPLOAD", "INN_LOOKUP", "INFO", "CONFIRMATION"}
var Bindings = map[string][]string{
	"user.first_name": {"TEXT"}, "user.last_name": {"TEXT"}, "user.phone": {"PHONE"}, "user.email": {"EMAIL"}, "user.password": {"PASSWORD"}, "user.consent": {"CONSENT"},
	"organization.type": {"SINGLE_SELECT"}, "organization.inn": {"INN_LOOKUP"}, "organization.kpp": {"TEXT"}, "organization.ogrn": {"TEXT"}, "organization.ogrnip": {"TEXT"}, "organization.name": {"TEXT"}, "organization.director_name": {"TEXT"},
	"point.address": {"ADDRESS_MAP"}, "point.entrance_type": {"SINGLE_SELECT"}, "point.courier_comment": {"TEXTAREA"}, "point.premise_type": {"SINGLE_SELECT"}, "point.operations": {"MULTI_SELECT"}, "point.storage_capacity": {"SINGLE_SELECT"}, "point.max_parcel_weight": {"SINGLE_SELECT"}, "point.schedule": {"SCHEDULE"}, "point.photos": {"PHOTO_UPLOAD"}, "point.contact_is_owner": {"SINGLE_SELECT", "YES_NO"}, "point.contact_name": {"TEXT"}, "point.contact_phone": {"PHONE"}, "point.contact_email": {"EMAIL"},
}
var keyPattern = regexp.MustCompile(`^[a-z][a-z0-9_]{0,63}$`)

func includes(a []string, s string) bool {
	for _, v := range a {
		if v == s {
			return true
		}
	}
	return false
}
func stringValue(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return fmt.Sprint(v)
}
func empty(v any) bool {
	if v == nil {
		return true
	}
	switch x := v.(type) {
	case string:
		return strings.TrimSpace(x) == ""
	case []any:
		return len(x) == 0
	case []FileRef:
		return len(x) == 0
	}
	return false
}
func equal(a, b any) bool {
	aa, _ := json.Marshal(a)
	bb, _ := json.Marshal(b)
	return string(aa) == string(bb)
}
func condition(c Condition, answers map[string]any) bool {
	v := answers[c.Source]
	switch c.Operator {
	case "is_empty":
		return empty(v)
	case "is_not_empty":
		return !empty(v)
	case "equals":
		return equal(v, c.Value)
	case "not_equals":
		return !empty(v) && !equal(v, c.Value)
	case "contains", "not_contains":
		found := false
		if values, ok := v.([]any); ok {
			for _, x := range values {
				if equal(x, c.Value) {
					found = true
				}
			}
		}
		if c.Operator == "not_contains" {
			return !empty(v) && !found
		}
		return found
	case "greater_than", "less_than":
		a, aok := v.(float64)
		b, bok := c.Value.(float64)
		if !aok || !bok {
			return false
		}
		if c.Operator == "greater_than" {
			return a > b
		}
		return a < b
	}
	return false
}
func visible(q Question, answers map[string]any) bool {
	if !q.Enabled {
		return false
	}
	if len(q.Conditions) == 0 {
		return true
	}
	groups := map[int]bool{}
	for _, c := range q.Conditions {
		if _, ok := groups[c.Group]; !ok {
			groups[c.Group] = true
		}
		groups[c.Group] = groups[c.Group] && condition(c, answers)
	}
	for _, v := range groups {
		if v {
			return true
		}
	}
	return false
}
func (g Graph) ordered() []Question {
	out := append([]Question(nil), g.Questions...)
	sections := map[string]int{}
	for _, s := range g.Sections {
		sections[s.Code] = s.Order
	}
	sort.SliceStable(out, func(i, j int) bool {
		if sections[out[i].Section] != sections[out[j].Section] {
			return sections[out[i].Section] < sections[out[j].Section]
		}
		return out[i].Order < out[j].Order
	})
	return out
}

// Conditions can only reference earlier questions. This makes evaluation deterministic and eliminates cycles.
func (g Graph) Effective(raw map[string]any) ([]Question, map[string]any) {
	out := []Question{}
	active := map[string]any{}
	for _, q := range g.ordered() {
		if visible(q, active) {
			out = append(out, q)
			if v, ok := raw[q.Key]; ok {
				active[q.Key] = v
			}
		}
	}
	return out, active
}
func (g Graph) Validate(code string) error {
	if len(g.Questions) == 0 || len(g.Questions) > 200 {
		return fmt.Errorf("Сценарий должен содержать от 1 до 200 вопросов")
	}
	sections := map[string]bool{}
	for _, s := range g.Sections {
		if !keyPattern.MatchString(s.Code) || sections[s.Code] || s.Name == "" {
			return fmt.Errorf("Некорректный или повторяющийся раздел")
		}
		sections[s.Code] = true
	}
	keys := map[string]Question{}
	bound := map[string]bool{}
	for _, q := range g.ordered() {
		if !keyPattern.MatchString(q.Key) || keys[q.Key].Key != "" {
			return fmt.Errorf("Некорректный или повторяющийся key: %s", q.Key)
		}
		if !includes(Types, q.Type) || strings.TrimSpace(q.Title) == "" || !sections[q.Section] {
			return fmt.Errorf("Проверьте тип, текст и раздел: %s", q.Key)
		}
		if q.Type == "PASSWORD" && q.Binding != "user.password" {
			return fmt.Errorf("PASSWORD допускается только для user.password")
		}
		if q.Binding != "" {
			if !includes(Bindings[q.Binding], q.Type) || bound[q.Binding] {
				return fmt.Errorf("Недопустимый или повторный binding: %s", q.Binding)
			}
			if (code == "USER_REGISTRATION" && !strings.HasPrefix(q.Binding, "user.")) || (code != "USER_REGISTRATION" && strings.HasPrefix(q.Binding, "user.")) {
				return fmt.Errorf("Binding не соответствует сценарию")
			}
			if q.Enabled {
				bound[q.Binding] = true
			}
		}
		options := map[string]bool{}
		enabledOptions := 0
		for _, o := range q.Options {
			if o.Value == "" || o.Label == "" || options[o.Value] {
				return fmt.Errorf("Повторный или пустой вариант: %s", q.Key)
			}
			options[o.Value] = true
			if o.Enabled {
				enabledOptions++
			}
		}
		if (q.Type == "SINGLE_SELECT" || q.Type == "MULTI_SELECT") && enabledOptions == 0 {
			return fmt.Errorf("Добавьте варианты: %s", q.Key)
		}
		if q.Binding == "point.contact_is_owner" && q.Type == "SINGLE_SELECT" {
			for _, o := range q.Options {
				if o.Value != "SELF" && o.Value != "OTHER" {
					return fmt.Errorf("Контактное лицо: используйте значения SELF / OTHER")
				}
			}
		}
		for _, c := range q.Conditions {
			source, ok := keys[c.Source]
			if !ok || !source.Enabled || source.Type == "PASSWORD" || !includes([]string{"equals", "not_equals", "contains", "not_contains", "is_empty", "is_not_empty", "greater_than", "less_than"}, c.Operator) {
				return fmt.Errorf("Условие должно ссылаться на предыдущий включённый вопрос: %s", q.Key)
			}
			if c.Group < 0 {
				return fmt.Errorf("Группа условий не может быть отрицательной")
			}
			if (c.Operator == "contains" || c.Operator == "not_contains") && source.Type != "MULTI_SELECT" {
				return fmt.Errorf("contains / not_contains применяются к MULTI_SELECT: %s", q.Key)
			}
			if c.Operator == "greater_than" || c.Operator == "less_than" {
				if _, ok := c.Value.(float64); !ok || source.Type != "NUMBER" {
					return fmt.Errorf("Числовое условие требует вопрос NUMBER и число: %s", q.Key)
				}
			}
			if c.Operator == "equals" || c.Operator == "not_equals" || c.Operator == "contains" || c.Operator == "not_contains" {
				if source.Type == "SINGLE_SELECT" || source.Type == "MULTI_SELECT" {
					found := false
					for _, o := range source.Options {
						if o.Enabled && equal(o.Value, c.Value) {
							found = true
						}
					}
					if !found {
						return fmt.Errorf("Условие ссылается на отсутствующий вариант: %s", q.Key)
					}
				}
				if includes([]string{"YES_NO", "CHECKBOX", "CONSENT", "CONFIRMATION"}, source.Type) {
					if _, ok := c.Value.(bool); !ok {
						return fmt.Errorf("Условие требует значение да/нет: %s", q.Key)
					}
				}
			}
		}
		if q.Validation.Min != nil && q.Validation.Max != nil && *q.Validation.Min > *q.Validation.Max {
			return fmt.Errorf("Минимум больше максимума")
		}
		if q.Validation.MinLength < 0 || q.Validation.MaxLength < 0 || (q.Validation.MaxLength > 0 && q.Validation.MinLength > q.Validation.MaxLength) {
			return fmt.Errorf("Некорректные ограничения длины: %s", q.Key)
		}
		if q.Type == "PHOTO_UPLOAD" || q.Type == "FILE_UPLOAD" {
			if q.Settings.MaxFiles < 0 || q.Settings.MaxFiles > 30 {
				return fmt.Errorf("Лимит файлов должен быть от 1 до 30")
			}
			categories := map[string]bool{}
			for _, c := range q.Settings.Categories {
				if c.Value == "" || c.Label == "" || categories[c.Value] {
					return fmt.Errorf("Некорректная категория файла: %s", q.Key)
				}
				categories[c.Value] = c.Enabled
			}
			for _, c := range q.Settings.RequiredCategories {
				if !categories[c] {
					return fmt.Errorf("Обязательная категория не включена: %s", q.Key)
				}
			}
			limit := q.Settings.MaxFiles
			if limit == 0 {
				limit = 8
			}
			if len(q.Settings.RequiredCategories) > limit {
				return fmt.Errorf("Лимит файлов меньше числа обязательных категорий: %s", q.Key)
			}
		}
		keys[q.Key] = q
	}
	required := []string{}
	if code == "USER_REGISTRATION" {
		required = []string{"user.first_name", "user.last_name", "user.phone", "user.email", "user.password", "user.consent"}
	}
	if code == "POINT_REGISTRATION" {
		required = []string{"organization.type", "organization.inn", "point.address", "point.operations", "point.storage_capacity", "point.max_parcel_weight", "point.schedule", "point.photos", "point.premise_type", "point.entrance_type", "point.contact_is_owner"}
	}
	for _, b := range required {
		found := false
		for _, q := range g.Questions {
			if q.Binding == b && q.Enabled && q.Required && len(q.Conditions) == 0 {
				found = true
			}
		}
		if !found {
			return fmt.Errorf("Обязательный системный вопрос отсутствует или условный: %s", b)
		}
	}
	return nil
}
func (g Graph) Bound(active map[string]any) map[string]any {
	out := map[string]any{}
	for _, q := range g.Questions {
		if q.Binding != "" && q.Type != "PASSWORD" {
			if v, ok := active[q.Key]; ok {
				out[q.Binding] = v
			}
		}
	}
	return out
}
func decodeValue[T any](v any) (T, error) {
	var out T
	b, e := json.Marshal(v)
	if e == nil {
		e = json.Unmarshal(b, &out)
	}
	return out, e
}
