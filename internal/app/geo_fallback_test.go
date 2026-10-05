package app

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

type stubGeo struct {
	suggestions []string
	address     Address
	err         error
}

func (s stubGeo) Suggest(context.Context, string) ([]string, error) { return s.suggestions, s.err }
func (s stubGeo) Geocode(context.Context, string) (Address, error)  { return s.address, s.err }

func TestGeoFallback(t *testing.T) {
	primary := stubGeo{err: fail(503, "PROVIDER_UNAVAILABLE", "unavailable")}
	backup := stubGeo{suggestions: []string{"Москва, улица, 1"}, address: Address{Address: "Москва, улица, 1", AddressLatitude: 55, AddressLongitude: 37}}
	geo := FallbackGeoProvider{Primary: primary, Backup: backup}
	suggestions, err := geo.Suggest(context.Background(), "Москва")
	if err != nil || len(suggestions) != 1 {
		t.Fatalf("suggest fallback: %v, %v", suggestions, err)
	}
	address, err := geo.Geocode(context.Background(), "Москва")
	if err != nil || address.AddressLatitude != 55 {
		t.Fatalf("geocode fallback: %+v, %v", address, err)
	}
	geo.Primary = stubGeo{suggestions: []string{"primary"}, address: Address{Address: "primary"}}
	suggestions, err = geo.Suggest(context.Background(), "Москва")
	if err != nil || suggestions[0] != "primary" {
		t.Fatalf("primary result replaced: %v, %v", suggestions, err)
	}
}

func TestDaDataGeoProvider(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.Header.Get("Authorization") != "Token test-key" {
			t.Errorf("unexpected request: %s, authorization present: %v", r.Method, r.Header.Get("Authorization") != "")
		}
		var body struct {
			Count int `json:"count"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if body.Count != 1 && body.Count != 5 {
			t.Errorf("unexpected count: %d", body.Count)
		}
		_, _ = w.Write([]byte(`{"suggestions":[{"value":"г Москва, ул Тверская, д 1","data":{"country":"Россия","region_with_type":"г Москва","city":"Москва","street_with_type":"ул Тверская","house":"1","postal_code":"125009","geo_lat":"55.757","geo_lon":"37.614"}}]}`))
	}))
	defer server.Close()
	p := DaDataGeoProvider{Key: "test-key", URL: server.URL}
	suggestions, err := p.Suggest(context.Background(), "Тверская")
	if err != nil || len(suggestions) != 1 {
		t.Fatalf("suggest: %v, %v", suggestions, err)
	}
	address, err := p.Geocode(context.Background(), suggestions[0])
	if err != nil || address.AddressLatitude != 55.757 || address.EntranceLongitude != 37.614 || address.Components.House != "1" {
		t.Fatalf("geocode: %+v, %v", address, err)
	}
}

func TestDaDataGeocodesBuildingWithoutLosingOfficeDetails(t *testing.T) {
	const full = "107564, Россия, г. Москва, ул. Краснобогатырская, д. 38, стр. 2, эт 2 комн, 17, оф 8"
	const building = "107564, Россия, г. Москва, ул. Краснобогатырская, д. 38, стр. 2"
	var queries []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Query string `json:"query"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		queries = append(queries, body.Query)
		if body.Query == building {
			_, _ = w.Write([]byte(`{"suggestions":[{"value":"г Москва, ул Краснобогатырская, д 38 стр 2","data":{"city":"Москва","house":"38","block":"2","geo_lat":"55.814","geo_lon":"37.686"}}]}`))
			return
		}
		_, _ = w.Write([]byte(`{"suggestions":[]}`))
	}))
	defer server.Close()
	p := DaDataGeoProvider{Key: "test-key", URL: server.URL}
	suggestions, suggestErr := p.Suggest(context.Background(), full)
	if suggestErr != nil || len(suggestions) == 0 || suggestions[0] != full {
		t.Fatalf("office detail suggestion lost: %v, %v", suggestions, suggestErr)
	}
	queries = nil
	address, err := p.Geocode(context.Background(), full)
	if err != nil || address.Address != full || address.AddressLatitude != 55.814 || address.EntranceLongitude != 37.686 || len(queries) != 2 || queries[1] != building {
		t.Fatalf("address=%+v err=%v queries=%v", address, err, queries)
	}

	geo := FallbackGeoProvider{Primary: stubGeo{err: fail(503, "PROVIDER_UNAVAILABLE", "unavailable")}, Backup: p}
	_, err = geo.Geocode(context.Background(), "несуществующий адрес")
	var apiErr *apiError
	if !errors.As(err, &apiErr) || apiErr.Code != "ADDRESS_NOT_FOUND" {
		t.Fatalf("expected address not found, got %v", err)
	}
}
