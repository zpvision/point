package app

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"math/big"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type OrganizationLookupProvider interface {
	Lookup(context.Context, string) (*OrganizationData, error)
}
type GeoProvider interface {
	Suggest(context.Context, string) ([]string, error)
	Geocode(context.Context, string) (Address, error)
}

// FallbackGeoProvider keeps address entry available when the primary map API
// rejects a key or is temporarily unavailable. Cancellation is never retried.
type FallbackGeoProvider struct{ Primary, Backup GeoProvider }

func (p FallbackGeoProvider) Suggest(ctx context.Context, query string) ([]string, error) {
	items, err := p.Primary.Suggest(ctx, query)
	if err == nil || p.Backup == nil || ctx.Err() != nil {
		return items, err
	}
	backupItems, backupErr := p.Backup.Suggest(ctx, query)
	if backupErr == nil {
		return backupItems, nil
	}
	var apiErr *apiError
	if errors.As(backupErr, &apiErr) && apiErr.Status < 500 {
		return nil, backupErr
	}
	return nil, errors.Join(err, backupErr)
}

func (p FallbackGeoProvider) Geocode(ctx context.Context, query string) (Address, error) {
	address, err := p.Primary.Geocode(ctx, query)
	if err == nil || p.Backup == nil || ctx.Err() != nil {
		return address, err
	}
	backupAddress, backupErr := p.Backup.Geocode(ctx, query)
	if backupErr == nil {
		return backupAddress, nil
	}
	var apiErr *apiError
	if errors.As(backupErr, &apiErr) && apiErr.Status < 500 {
		return Address{}, backupErr
	}
	return Address{}, errors.Join(err, backupErr)
}

const daDataAddressURL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address"

// Floor, room and office details do not change the building coordinates.
// Some address providers cannot match an address with these details attached.
var subPremiseSuffix = regexp.MustCompile(`(?i),\s*(?:эт(?:аж)?\.?|комн(?:ата)?\.?|оф(?:ис)?\.?|пом(?:ещение)?\.?|кв(?:артира)?\.?)\s*`)

func buildingAddress(query string) string {
	if match := subPremiseSuffix.FindStringIndex(query); match != nil {
		return strings.TrimSpace(query[:match[0]])
	}
	return strings.TrimSpace(query)
}

type DaDataGeoProvider struct {
	Key string
	URL string // Optional endpoint override for tests.
}

type daDataAddressResult struct {
	Suggestions []struct {
		Value string `json:"value"`
		Data  struct {
			Country    string `json:"country"`
			Region     string `json:"region_with_type"`
			City       string `json:"city"`
			Settlement string `json:"settlement"`
			Street     string `json:"street_with_type"`
			House      string `json:"house"`
			Building   string `json:"block"`
			PostalCode string `json:"postal_code"`
			Latitude   string `json:"geo_lat"`
			Longitude  string `json:"geo_lon"`
		} `json:"data"`
	} `json:"suggestions"`
}

func (p DaDataGeoProvider) search(ctx context.Context, query string, count int) (daDataAddressResult, error) {
	var result daDataAddressResult
	if p.Key == "" {
		return result, fail(503, "ADDRESS_LOOKUP_NOT_CONFIGURED", "Поиск адресов не настроен")
	}
	endpoint := p.URL
	if endpoint == "" {
		endpoint = daDataAddressURL
	}
	err := providerJSON(ctx, http.MethodPost, endpoint, p.Key, map[string]any{"query": query, "count": count}, &result)
	if err == nil && len(result.Suggestions) == 0 {
		shorter := buildingAddress(query)
		if shorter != "" && shorter != strings.TrimSpace(query) {
			err = providerJSON(ctx, http.MethodPost, endpoint, p.Key, map[string]any{"query": shorter, "count": count}, &result)
		}
	}
	return result, err
}

func (p DaDataGeoProvider) Suggest(ctx context.Context, query string) ([]string, error) {
	result, err := p.search(ctx, query, 5)
	if err != nil {
		return nil, err
	}
	items := make([]string, 0, len(result.Suggestions))
	if len(result.Suggestions) > 0 && buildingAddress(query) != strings.TrimSpace(query) {
		items = append(items, strings.TrimSpace(query))
	}
	for _, suggestion := range result.Suggestions {
		if suggestion.Value != "" {
			items = append(items, suggestion.Value)
		}
	}
	return items, nil
}

func (p DaDataGeoProvider) Geocode(ctx context.Context, query string) (Address, error) {
	result, err := p.search(ctx, query, 1)
	if err != nil {
		return Address{}, err
	}
	if len(result.Suggestions) == 0 {
		return Address{}, fail(404, "ADDRESS_NOT_FOUND", "Адрес не найден. Уточните запрос.")
	}
	suggestion := result.Suggestions[0]
	lat, latErr := strconv.ParseFloat(suggestion.Data.Latitude, 64)
	lon, lonErr := strconv.ParseFloat(suggestion.Data.Longitude, 64)
	if latErr != nil || lonErr != nil || math.IsNaN(lat) || math.IsNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180 {
		return Address{}, fail(422, "ADDRESS_COORDINATES_UNAVAILABLE", "Не удалось определить координаты. Уточните адрес или укажите координаты вручную.")
	}
	city := suggestion.Data.City
	if city == "" {
		city = suggestion.Data.Settlement
	}
	formatted := suggestion.Value
	if buildingAddress(query) != strings.TrimSpace(query) {
		formatted = strings.TrimSpace(query)
	}
	return Address{
		Address:         formatted,
		Components:      AddressComponents{Country: suggestion.Data.Country, Region: suggestion.Data.Region, City: city, Street: suggestion.Data.Street, House: suggestion.Data.House, Building: suggestion.Data.Building, PostalCode: suggestion.Data.PostalCode},
		AddressLatitude: lat, AddressLongitude: lon, EntranceLatitude: lat, EntranceLongitude: lon,
	}, nil
}

type VerificationProvider interface {
	Send(context.Context, string, string, string) error
}
type DisabledVerification struct{}

func (DisabledVerification) Send(context.Context, string, string, string) error {
	return fail(503, "VERIFICATION_UNAVAILABLE", "Подтверждение контактов пока недоступно")
}

type DevelopmentVerification struct{}

func (DevelopmentVerification) Send(context.Context, string, string, string) error { return nil }

var providerClient = &http.Client{Timeout: 10 * time.Second}

func providerJSON(ctx context.Context, method, endpoint, key string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		reader = bytes.NewReader(b)
	}
	r, e := http.NewRequestWithContext(ctx, method, endpoint, reader)
	if e != nil {
		return e
	}
	r.Header.Set("Content-Type", "application/json")
	if key != "" {
		r.Header.Set("Authorization", "Token "+key)
	}
	res, e := providerClient.Do(r)
	if e != nil {
		return fail(503, "PROVIDER_UNAVAILABLE", "Сервис временно недоступен. Попробуйте позже или заполните вручную.")
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return fail(503, "PROVIDER_UNAVAILABLE", "Сервис временно недоступен. Проверьте настройки интеграции.")
	}
	if e = json.NewDecoder(io.LimitReader(res.Body, 2<<20)).Decode(out); e != nil {
		return fail(503, "PROVIDER_RESPONSE", "Не удалось обработать ответ сервиса")
	}
	return nil
}

type DaDataProvider struct{ Key string }

func (p DaDataProvider) Lookup(ctx context.Context, inn string) (*OrganizationData, error) {
	if p.Key == "" {
		return nil, fail(503, "LOOKUP_NOT_CONFIGURED", "Поиск организаций не подключён. Заполните реквизиты вручную.")
	}
	var out struct {
		Suggestions []struct {
			Value string `json:"value"`
			Data  struct {
				INN  string `json:"inn"`
				KPP  string `json:"kpp"`
				OGRN string `json:"ogrn"`
				Type string `json:"type"`
				Name struct {
					Short string `json:"short_with_opf"`
					Full  string `json:"full_with_opf"`
				} `json:"name"`
				Address struct {
					Value string `json:"value"`
				} `json:"address"`
				Management struct {
					Name string `json:"name"`
				} `json:"management"`
			} `json:"data"`
		} `json:"suggestions"`
	}
	if e := providerJSON(ctx, "POST", "https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party", p.Key, map[string]any{"query": inn, "branch_type": "MAIN", "count": 1}, &out); e != nil {
		return nil, e
	}
	if len(out.Suggestions) == 0 {
		return nil, fail(404, "ORGANIZATION_NOT_FOUND", "Организация не найдена. Проверьте ИНН или заполните вручную.")
	}
	d := out.Suggestions[0].Data
	o := &OrganizationData{INN: d.INN, KPP: d.KPP, ShortName: d.Name.Short, FullName: d.Name.Full, LegalAddress: d.Address.Value, DirectorName: d.Management.Name, EntityType: d.Type}
	if d.Type == "INDIVIDUAL" {
		o.OGRNIP = d.OGRN
		o.DirectorName = d.Name.Full
	} else {
		o.OGRN = d.OGRN
	}
	return o, nil
}

type YandexProvider struct{ GeocoderKey, SuggestKey string }

func (p YandexProvider) Suggest(ctx context.Context, text string) ([]string, error) {
	if p.SuggestKey == "" {
		return nil, fail(503, "SUGGEST_NOT_CONFIGURED", "Подсказки адресов не подключены. Введите полный адрес и нажмите «Найти».")
	}
	var out struct {
		Results []struct {
			Title struct {
				Text string `json:"text"`
			} `json:"title"`
			Subtitle struct {
				Text string `json:"text"`
			} `json:"subtitle"`
		} `json:"results"`
	}
	q := url.Values{"apikey": {p.SuggestKey}, "text": {text}, "lang": {"ru"}, "results": {"5"}}
	if e := providerJSON(ctx, "GET", "https://suggest-maps.yandex.ru/v1/suggest?"+q.Encode(), "", nil, &out); e != nil {
		return nil, e
	}
	results := []string{}
	for _, r := range out.Results {
		v := r.Title.Text
		if r.Subtitle.Text != "" {
			v = r.Subtitle.Text + ", " + v
		}
		results = append(results, v)
	}
	return results, nil
}
func (p YandexProvider) Geocode(ctx context.Context, text string) (Address, error) {
	a := Address{}
	if p.GeocoderKey == "" {
		return a, fail(503, "GEOCODER_NOT_CONFIGURED", "Геокодер не подключён. Можно указать адрес и координаты вручную.")
	}
	var out struct {
		Response struct {
			Collection struct {
				Members []struct {
					Object struct {
						Point struct {
							Pos string `json:"pos"`
						} `json:"Point"`
						Meta struct {
							Data struct {
								Text    string `json:"text"`
								Address struct {
									Postal     string `json:"postal_code"`
									Components []struct {
										Kind string `json:"kind"`
										Name string `json:"name"`
									} `json:"Components"`
								} `json:"Address"`
							} `json:"GeocoderMetaData"`
						} `json:"metaDataProperty"`
					} `json:"GeoObject"`
				} `json:"featureMember"`
			} `json:"GeoObjectCollection"`
		} `json:"response"`
	}
	q := url.Values{"apikey": {p.GeocoderKey}, "geocode": {text}, "format": {"json"}, "results": {"1"}, "lang": {"ru_RU"}}
	if e := providerJSON(ctx, "GET", "https://geocode-maps.yandex.ru/v1/?"+q.Encode(), "", nil, &out); e != nil {
		return a, e
	}
	if len(out.Response.Collection.Members) == 0 {
		return a, fail(404, "ADDRESS_NOT_FOUND", "Адрес не найден. Уточните запрос.")
	}
	o := out.Response.Collection.Members[0].Object
	pos := strings.Fields(o.Point.Pos)
	if len(pos) != 2 {
		return a, fail(503, "INVALID_GEOCODE", "Не удалось получить координаты")
	}
	var e error
	a.AddressLongitude, e = strconv.ParseFloat(pos[0], 64)
	if e != nil {
		return a, e
	}
	a.AddressLatitude, e = strconv.ParseFloat(pos[1], 64)
	if e != nil {
		return a, e
	}
	a.EntranceLatitude = a.AddressLatitude
	a.EntranceLongitude = a.AddressLongitude
	a.Address = o.Meta.Data.Text
	a.Components.PostalCode = o.Meta.Data.Address.Postal
	for _, c := range o.Meta.Data.Address.Components {
		switch c.Kind {
		case "country":
			a.Components.Country = c.Name
		case "province":
			if a.Components.Region == "" {
				a.Components.Region = c.Name
			}
		case "locality":
			a.Components.City = c.Name
		case "street":
			a.Components.Street = c.Name
		case "house":
			a.Components.House = c.Name
		}
	}
	return a, nil
}
func (a *App) providerAccess(r *http.Request) error {
	u, _ := a.user(r)
	if u == nil {
		return fail(401, "AUTH_REQUIRED", "Войдите в аккаунт")
	}
	if !a.allow("provider:"+u.ID, 60) {
		return fail(429, "RATE_LIMIT", "Слишком много запросов. Попробуйте позже.")
	}
	return nil
}
func (a *App) organizationLookup(w http.ResponseWriter, r *http.Request) error {
	if e := a.providerAccess(r); e != nil {
		return e
	}
	var in struct {
		INN string `json:"inn"`
	}
	if e := readJSON(w, r, &in); e != nil {
		return e
	}
	if !validINN(in.INN) {
		return fail(422, "INVALID_INN", "Проверьте ИНН")
	}
	o, e := a.lookup.Lookup(r.Context(), in.INN)
	if e != nil {
		return e
	}
	jsonResponse(w, o)
	return nil
}
func (a *App) suggest(w http.ResponseWriter, r *http.Request) error {
	if e := a.providerAccess(r); e != nil {
		return e
	}
	s := r.URL.Query().Get("q")
	if len(s) < 3 || len(s) > 500 {
		return fail(422, "INVALID_QUERY", "Уточните адрес")
	}
	out, e := a.geo.Suggest(r.Context(), s)
	if e != nil {
		return e
	}
	jsonResponse(w, out)
	return nil
}
func (a *App) geocode(w http.ResponseWriter, r *http.Request) error {
	if e := a.providerAccess(r); e != nil {
		return e
	}
	s := r.URL.Query().Get("q")
	if len(s) < 3 || len(s) > 500 {
		return fail(422, "INVALID_QUERY", "Уточните адрес")
	}
	out, e := a.geo.Geocode(r.Context(), s)
	if e != nil {
		return e
	}
	jsonResponse(w, out)
	return nil
}
func (a *App) startVerification(w http.ResponseWriter, r *http.Request) error {
	u, e := a.user(r)
	if e != nil {
		return e
	}
	if !a.allow("verify:"+u.ID, 3) {
		return fail(429, "RATE_LIMIT", "Попробуйте через минуту")
	}
	var in struct {
		Channel string `json:"channel"`
	}
	if e = readJSON(w, r, &in); e != nil {
		return e
	}
	target := u.Email
	if in.Channel == "phone" {
		target = u.Phone
		if target == "" {
			return fail(422, "PROFILE_PHONE_REQUIRED", "Добавьте номер телефона в профиле перед подтверждением")
		}
	} else if in.Channel != "email" {
		return fail(422, "INVALID_CHANNEL", "Недопустимый канал")
	}
	n, e := rand.Int(rand.Reader, big.NewInt(1000000))
	if e != nil {
		return e
	}
	code := fmt.Sprintf("%06d", n.Int64())
	if e = a.verification.Send(r.Context(), in.Channel, target, code); e != nil {
		return e
	}
	id := newID()
	if _, e = a.db.ExecContext(r.Context(), "INSERT INTO verification_challenges(id,user_id,channel,target,code_hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '10 minutes')", id, u.ID, in.Channel, target, digest(id+code)); e != nil {
		return e
	}
	out := map[string]string{"id": id}
	if _, ok := a.verification.(DevelopmentVerification); ok && a.env == "development" {
		out["development_code"] = code
	}
	jsonResponse(w, out)
	return nil
}
func (a *App) confirmVerification(w http.ResponseWriter, r *http.Request) error {
	u, e := a.user(r)
	if e != nil {
		return e
	}
	var in struct {
		ID   string `json:"id"`
		Code string `json:"code"`
	}
	if e = readJSON(w, r, &in); e != nil {
		return e
	}
	tx, e := a.db.BeginTx(r.Context(), nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	var hash, channel, target string
	var attempts int
	e = tx.QueryRowContext(r.Context(), "SELECT code_hash,channel,target,attempts FROM verification_challenges WHERE id=$1 AND user_id=$2 AND used_at IS NULL AND expires_at>now() FOR UPDATE", in.ID, u.ID).Scan(&hash, &channel, &target, &attempts)
	if e != nil || attempts >= 5 {
		return fail(422, "VERIFICATION_EXPIRED", "Код истёк или число попыток исчерпано")
	}
	if _, e = tx.ExecContext(r.Context(), "UPDATE verification_challenges SET attempts=attempts+1 WHERE id=$1", in.ID); e != nil {
		return e
	}
	if subtle.ConstantTimeCompare([]byte(hash), []byte(digest(in.ID+in.Code))) != 1 {
		if e = tx.Commit(); e != nil {
			return e
		}
		return fail(422, "INVALID_CODE", "Неверный код")
	}
	query := "UPDATE users SET email_verified_at=now() WHERE id=$1 AND email=$2"
	if channel == "phone" {
		query = "UPDATE users SET phone_verified_at=now() WHERE id=$1 AND phone=$2"
	}
	if _, e = tx.ExecContext(r.Context(), query, u.ID, target); e != nil {
		return e
	}
	if _, e = tx.ExecContext(r.Context(), "UPDATE verification_challenges SET used_at=now() WHERE id=$1", in.ID); e != nil {
		return e
	}
	if e = tx.Commit(); e != nil {
		return e
	}
	jsonResponse(w, map[string]bool{"ok": true})
	return nil
}
