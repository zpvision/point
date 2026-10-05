import { useEffect, useRef, useState } from "react";
import type { Address } from "./types";
import { api, errorText } from "./api";
import { useApp, ErrorNotice } from "./ui";

declare global {
  interface Window {
    ymaps?: any;
  }
}
let loading: Promise<any> | null = null;
function loadMaps(key: string): Promise<any> {
  if (!key)
    return Promise.reject(
      new Error("Карта не подключена. Можно указать координаты вручную."),
    );
  if (!loading)
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(key)}&lang=ru_RU`;
      const timer = window.setTimeout(
        () => reject(new Error("Карта не загрузилась. Проверьте соединение.")),
        15000,
      );
      script.onerror = () => {
        clearTimeout(timer);
        loading = null;
        script.remove();
        reject(new Error("Не удалось загрузить карту"));
      };
      script.onload = () =>
        window.ymaps.ready(() => {
          clearTimeout(timer);
          resolve(window.ymaps);
        });
      document.head.appendChild(script);
    });
  return loading;
}
export function MapView({
  address,
  onMove,
  both = false,
}: {
  address: Address;
  onMove?: (lat: number, lng: number) => void;
  both?: boolean;
}) {
  const { mapsKey } = useApp();
  const container = useRef<HTMLDivElement>(null);
  const move = useRef(onMove);
  move.current = onMove;
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let map: any;
    setError("");
    loadMaps(mapsKey)
      .then((ymaps) => {
        if (cancelled || !container.current) return;
        const pos = [address.entranceLatitude, address.entranceLongitude];
        map = new ymaps.Map(container.current, {
          center: pos,
          zoom: 17,
          controls: ["zoomControl"],
        });
        const marker = new ymaps.Placemark(
          pos,
          { iconCaption: "Вход в Point" },
          { draggable: !!move.current, preset: "islands#darkBlueDotIcon" },
        );
        marker.events.add("dragend", () => {
          const p = marker.geometry.getCoordinates();
          move.current?.(p[0], p[1]);
        });
        map.geoObjects.add(marker);
        if (both)
          map.geoObjects.add(
            new ymaps.Placemark(
              [address.addressLatitude, address.addressLongitude],
              { iconCaption: "Адрес" },
              { preset: "islands#grayDotIcon" },
            ),
          );
      })
      .catch((e) => {
        if (!cancelled) setError(errorText(e));
      });
    return () => {
      cancelled = true;
      map?.destroy();
    };
  }, [mapsKey, address.addressLatitude, address.addressLongitude, both]);
  return (
    <>
      <div
        className="map"
        ref={container}
        aria-label="Карта расположения Point"
      />
      <ErrorNotice text={error} />
    </>
  );
}
export function distance(a: Address) {
  const rad = Math.PI / 180;
  const dlat = (a.entranceLatitude - a.addressLatitude) * rad;
  const dlng = (a.entranceLongitude - a.addressLongitude) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.addressLatitude * rad) *
      Math.cos(a.entranceLatitude * rad) *
      Math.sin(dlng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
const blankAddress: Address = {
  address: "",
  components: {
    country: "",
    region: "",
    city: "",
    street: "",
    house: "",
    building: "",
    postal_code: "",
  },
  addressLatitude: 0,
  addressLongitude: 0,
  entranceLatitude: 0,
  entranceLongitude: 0,
  markerAdjusted: false,
  confirmed: false,
};
export function AddressMapQuestion({
  value,
  onChange,
  confirmationAttempt = 0,
}: {
  value: Address | undefined;
  onChange: (value: Address) => void;
  confirmationAttempt?: number;
}) {
  const confirmButton = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState(value?.address || "");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [reverse, setReverse] = useState("");
  const [draft, setDraft] = useState<Address>(value || blankAddress);
  const [located, setLocated] = useState(!!value);
  useEffect(() => {
    if (!confirmationAttempt) return;
    const button = confirmButton.current;
    button?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "center",
    });
    button?.focus({ preventScroll: true });
  }, [confirmationAttempt]);
  useEffect(() => {
    if (query.trim().length < 3) return;
    let active = true;
    const timer = setTimeout(
      () =>
        api<string[]>("/geo/suggest?q=" + encodeURIComponent(query))
          .then((v) => {
            if (active) setSuggestions(v);
          })
          .catch(() => {
            if (active) setSuggestions([]);
          }),
      350,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);
  async function locate(text: string) {
    setBusy(true);
    setError("");
    setSuggestions([]);
    try {
      const a = await api<Address>(
        "/geo/geocode?q=" + encodeURIComponent(text),
      );
      setDraft(a);
      setQuery(a.address);
      setLocated(true);
      onChange({ ...a, confirmed: false });
    } catch (e) {
      setError(errorText(e));
      setManual(true);
    } finally {
      setBusy(false);
    }
  }
  function move(lat: number, lng: number) {
    setError("");
    const next = {
      ...draft,
      entranceLatitude: lat,
      entranceLongitude: lng,
      markerAdjusted: true,
      confirmed: false,
    };
    setDraft(next);
    onChange(next);
    api<Address>("/geo/geocode?q=" + encodeURIComponent(`${lng},${lat}`))
      .then((a) => setReverse(a.address))
      .catch(() =>
        setReverse(
          "Обратное геокодирование недоступно; координаты входа сохранены.",
        ),
      );
  }
  function update(next: Address) {
    setError("");
    setDraft(next);
    onChange({ ...next, confirmed: false });
  }
  return (
    <div className="address-question">
      <label>
        Адрес
        <input
          value={query}
          placeholder="Город, улица, дом"
          onChange={(e) => {
            setError("");
            setQuery(e.target.value);
            onChange({ ...draft, confirmed: false });
          }}
        />
      </label>
      <button
        type="button"
        onClick={() => locate(query)}
        disabled={busy || query.length < 3}
      >
        {busy ? "Поиск…" : "Найти адрес"}
      </button>
      {suggestions.length > 0 && (
        <section aria-label="Подходящие адреса">
          <h3 className="suggestions-title">Выберите, если что-то подходит</h3>
          <div className="suggestions">
            {suggestions.map((s) => (
              <button type="button" key={s} onClick={() => locate(s)}>
                {s}
              </button>
            ))}
          </div>
        </section>
      )}
      <ErrorNotice text={error} />
      <button
        type="button"
        className="text-button"
        onClick={() => {
          setManual(!manual);
          setDraft({ ...draft, address: query });
        }}
      >
        Указать адрес и координаты вручную
      </button>
      {manual && (
        <div className="form-grid">
          <label>
            Полный адрес
            <input
              value={draft.address}
              onChange={(e) => update({ ...draft, address: e.target.value })}
            />
          </label>
          {(
            [
              "country",
              "region",
              "city",
              "street",
              "house",
              "building",
              "postal_code",
            ] as const
          ).map((k, i) => (
            <label key={k}>
              {
                [
                  "Страна",
                  "Регион",
                  "Город",
                  "Улица",
                  "Дом",
                  "Корпус",
                  "Индекс",
                ][i]
              }
              <input
                value={draft.components[k]}
                onChange={(e) =>
                  update({
                    ...draft,
                    components: { ...draft.components, [k]: e.target.value },
                  })
                }
              />
            </label>
          ))}
          {(
            [
              "addressLatitude",
              "addressLongitude",
              "entranceLatitude",
              "entranceLongitude",
            ] as const
          ).map((k, i) => (
            <label key={k}>
              {
                [
                  "Широта адреса",
                  "Долгота адреса",
                  "Широта входа",
                  "Долгота входа",
                ][i]
              }
              <input
                type="number"
                step="any"
                min={i % 2 ? -180 : -90}
                max={i % 2 ? 180 : 90}
                value={draft[k]}
                onChange={(e) =>
                  update({
                    ...draft,
                    [k]: Number(e.target.value),
                    markerAdjusted: true,
                  })
                }
              />
            </label>
          ))}
          <button
            type="button"
            onClick={() => {
              setLocated(true);
              onChange({ ...draft, confirmed: false });
            }}
          >
            Показать расположение
          </button>
        </div>
      )}
      {located && (
        <div className="map-card">
          <h3>Проверьте расположение Point</h3>
          <p>{draft.address}</p>
          <MapView address={draft} onMove={move} />
          <p className="muted">Перетащите маркер к реальному входу.</p>
          {reverse && <small>{reverse}</small>}
          {distance(draft) > 1000 && (
            <p className="warning">
              Похоже, выбранная точка находится далеко от указанного адреса.
              Проверьте расположение.
            </p>
          )}
          <div className="actions">
            <button
              ref={confirmButton}
              key={confirmationAttempt}
              className={`confirm-button${value?.confirmed ? " is-confirmed" : confirmationAttempt ? " confirmation-attention" : ""}`}
              aria-pressed={Boolean(value?.confirmed)}
              type="button"
              onClick={() => {
                setError("");
                onChange({ ...draft, confirmed: true });
              }}
            >
              {value?.confirmed ? "✓ Расположение подтверждено" : "Всё верно"}
            </button>
            <button
              type="button"
              className="edit-button"
              onClick={() => {
                setManual(true);
                onChange({ ...draft, confirmed: false });
              }}
            >
              Изменить точку
            </button>
          </div>
          {confirmationAttempt > 0 && !value?.confirmed && (
            <p className="confirmation-hint" role="status">
              Проверьте маркер на карте и нажмите «Всё верно», затем продолжите.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
