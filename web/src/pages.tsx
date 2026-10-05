import { useEffect, useState } from "react";
import { api, errorText } from "./api";
import type {
  Address,
  Session,
  ApplicationRow,
  ApplicationDetailData,
  AuditEvent,
} from "./types";
import { statusLabel } from "./types";
import { ErrorNotice, Header, useApp } from "./ui";
import { AdminNav } from "./admin";
import { Summary } from "./chat";
import { MapView } from "./maps";
import { answerLabel, scheduleLines } from "./questions";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Header title="Вход" />
      <main className="auth-page">
        <form
          className="card"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api("/auth/login", "POST", { email, password });
              location.href = "/points";
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="eyebrow">POINT · ПАРТНЁРАМ</div>
          <h1>С возвращением</h1>
          <p className="muted">Войдите, чтобы управлять своими точками.</p>
          <label>
            E-mail
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Пароль
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <ErrorNotice text={error} />
          <button className="primary full" disabled={busy}>
            {busy ? "Входим…" : "Войти"}
          </button>
          <p>
            Нет аккаунта? <a href="/register">Зарегистрироваться</a>
          </p>
        </form>
      </main>
    </>
  );
}
type PointItem = {
  id: string;
  name: string;
  formatted_address: string;
  city: string;
  status: string;
  point_status: string;
  created_at: string;
  application_id: string;
  session_id: string;
};
export function MyPoints() {
  const [items, setItems] = useState<PointItem[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const { user } = useApp();
  useEffect(() => {
    api<PointItem[]>("/points")
      .then(setItems)
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoaded(true));
  }, []);
  return (
    <>
      <Header title="Партнёрский кабинет" />
      <main className="page">
        <div className="page-heading">
          <div>
            <div className="eyebrow">ВАШИ ТОЧКИ</div>
            <h1>Мои Point</h1>
            <p className="muted">
              Здравствуйте, {user?.first_name}. Здесь находятся ваши точки и
              заявки.
            </p>
          </div>
          <a className="button primary" href="/points/new">
            + Добавить Point
          </a>
        </div>
        {user?.role === "admin" && <AdminNav />}
        <ErrorNotice text={error} />
        {loaded && !error && items.length === 0 && (
          <div className="empty-state">
            <div className="pin-symbol">P</div>
            <h2>Теперь давайте подключим ваш первый Point</h2>
            <p className="muted">
              Подготовьте реквизиты организации и фотографии точки.
            </p>
            <a href="/points/new" className="button primary">
              Создать Point
            </a>
          </div>
        )}
        <div className="point-grid">
          {items.map((p) => (
            <article className="card point-tile" key={p.id}>
              <span className={`badge status-${p.status}`}>
                {statusLabel[p.status]}
              </span>
              <h2>{p.name}</h2>
              <p>{p.formatted_address}</p>
              <small className="muted">
                Создан {new Date(p.created_at).toLocaleDateString("ru")} ·{" "}
                {statusLabel[p.point_status]}
              </small>
              <a className="button" href={`/applications/${p.application_id}`}>
                Открыть →
              </a>
            </article>
          ))}
        </div>
      </main>
    </>
  );
}
export function Applications() {
  const [items, setItems] = useState<ApplicationRow[]>([]);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    status: "",
    city: "",
    search: "",
    from: "",
    to: "",
  });
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      api<ApplicationRow[]>(
        "/admin/applications?" + new URLSearchParams(filters),
      )
        .then((v) => {
          if (active) {
            setItems(v);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(errorText(e));
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [filters]);
  return (
    <>
      <Header title="Администрирование" />
      <AdminNav />
      <main className="page">
        <div className="eyebrow">РЕГИСТРАЦИИ</div>
        <h1>Заявки Point</h1>
        <div className="filters">
          <label>
            Поиск
            <input
              placeholder="Адрес, ИНН, организация, контакт…"
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
            />
          </label>
          <label>
            Статус
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value })
              }
            >
              <option value="">Все</option>
              {["IN_REVIEW", "NEEDS_CHANGES", "APPROVED", "REJECTED"].map(
                (s) => (
                  <option key={s} value={s}>
                    {statusLabel[s]}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            Город
            <input
              value={filters.city}
              onChange={(e) => setFilters({ ...filters, city: e.target.value })}
            />
          </label>
          <label>
            С даты
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </label>
          <label>
            По дату
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </label>
        </div>
        <ErrorNotice text={error} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID / Point</th>
                <th>Организация</th>
                <th>Город</th>
                <th>Владелец</th>
                <th>Дата</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td>
                    <a href={"/applications/" + a.id}>{a.name}</a>
                    <small>{a.id.slice(0, 10)}</small>
                  </td>
                  <td>
                    {a.short_name}
                    <small>ИНН {a.inn}</small>
                  </td>
                  <td>{a.city}</td>
                  <td>
                    {a.first_name} {a.last_name}
                    <small>{a.email}</small>
                    <small>{a.phone}</small>
                  </td>
                  <td>{new Date(a.created_at).toLocaleDateString("ru")}</td>
                  <td>
                    <span className={`badge status-${a.status}`}>
                      {statusLabel[a.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && (
            <p className="empty-state">Заявки не найдены</p>
          )}
        </div>
        <small className="muted">
          Показаны последние 200 заявок. Используйте фильтры для поиска.
        </small>
      </main>
    </>
  );
}
type Detail = {
  data: ApplicationDetailData;
  session: Session;
  events: AuditEvent[];
  files: {
    id: string;
    mime: string;
    category: string;
    original_name: string;
  }[];
};
export function ApplicationDetail({ id }: { id: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const { user } = useApp();
  async function load() {
    try {
      setDetail(await api<Detail>("/applications/" + id));
    } catch (e) {
      setError(errorText(e));
    }
  }
  useEffect(() => {
    void load();
  }, [id]);
  async function moderate(status: string) {
    setBusy(true);
    setError("");
    try {
      await api(`/admin/applications/${id}/moderate`, "POST", {
        status,
        comment,
      });
      setComment("");
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  if (!detail)
    return (
      <>
        <Header title="Заявка Point" />
        <main className="page">
          <ErrorNotice text={error} />
          {!error && <p className="muted">Загрузка заявки…</p>}
        </main>
      </>
    );
  const p = detail.data.point;
  const o = detail.data.organization;
  const owner = detail.data.owner;
  const a = detail.data.application;
  const address: Address | undefined = p
    ? {
        address: p.formatted_address,
        components: {
          country: p.country,
          region: p.region,
          city: p.city,
          street: p.street,
          house: p.house,
          building: p.building,
          postal_code: p.postal_code,
        },
        addressLatitude: Number(p.address_latitude),
        addressLongitude: Number(p.address_longitude),
        entranceLatitude: Number(p.entrance_latitude),
        entranceLongitude: Number(p.entrance_longitude),
        markerAdjusted: true,
        confirmed: true,
      }
    : undefined;
  return (
    <>
      <Header title="Заявка Point" />
      {user?.role === "admin" && <AdminNav />}
      <main className="page">
        <a href={user?.role === "admin" ? "/admin/applications" : "/points"}>
          ← К списку
        </a>
        <ErrorNotice text={error} />
        {detail && (
          <>
            <div className="page-heading">
              <div>
                <h1>{p.name}</h1>
                <p className="muted">
                  Сценарий {detail.session.code} · v{detail.session.version}
                </p>
              </div>
              <span className={`badge status-${a.status}`}>
                {statusLabel[a.status]}
              </span>
            </div>
            {a.status === "NEEDS_CHANGES" && user?.id === owner.id && (
              <div className="card">
                <h2>Исправьте заявку</h2>
                <p>
                  {
                    detail.events
                      .filter((e) => e.action === "NEEDS_CHANGES")
                      .at(-1)?.comment
                  }
                </p>
                <button
                  className="primary"
                  onClick={async () => {
                    try {
                      const result = await api<{ session_id: string }>(
                        `/applications/${id}/reopen`,
                        "POST",
                        {},
                      );
                      location.href =
                        "/points/new?session=" + result.session_id;
                    } catch (e) {
                      setError(errorText(e));
                    }
                  }}
                >
                  Изменить данные
                </button>
              </div>
            )}
            <div className="detail-grid">
              <section className="card">
                <h2>Организация</h2>
                <h3>{o.short_name}</h3>
                <p>ИНН {o.inn}</p>
                <p>
                  {o.ogrnip
                    ? `ОГРНИП ${o.ogrnip}`
                    : `КПП ${o.kpp} · ОГРН ${o.ogrn}`}
                </p>
                <p>{o.legal_address}</p>
                <p>{o.director_name}</p>
                <hr />
                <h3>Владелец</h3>
                <p>
                  {owner.first_name} {owner.last_name}
                </p>
                <p>
                  {owner.phone} · {owner.email}
                </p>
                <h3>Контактное лицо</h3>
                <p>{p.contact_name}</p>
                <p>
                  {p.contact_phone} · {p.contact_email}
                </p>
              </section>
              <section className="card">
                <h2>Расположение</h2>
                <p>{p.formatted_address}</p>
                {address && <MapView address={address} both />}
                <p className="muted">
                  Адрес: {p.address_latitude}, {p.address_longitude}
                  <br />
                  Вход: {p.entrance_latitude}, {p.entrance_longitude}
                </p>
                <p>{p.courier_comment}</p>
              </section>
              <section className="card">
                <h2>Режим работы и возможности</h2>
                {scheduleLines(p.schedule).map((s) => (
                  <p key={s}>{s}</p>
                ))}
                {detail.session.questions
                  .filter((q) =>
                    [
                      "point.operations",
                      "point.storage_capacity",
                      "point.max_parcel_weight",
                      "point.entrance_type",
                      "point.premise_type",
                    ].includes(q.binding),
                  )
                  .map((q) => (
                    <p key={q.key}>
                      <span className="muted">{q.title}</span>
                      <br />
                      {answerLabel(q, detail.session.answers[q.key])}
                    </p>
                  ))}
              </section>
              <section className="card">
                <h2>Фотографии и документы</h2>
                <div className="upload-grid">
                  {detail.files.map((f) => (
                    <a
                      key={f.id}
                      href={`/api/attachments/${f.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {f.mime.startsWith("image/") && (
                        <img
                          src={`/api/attachments/${f.id}`}
                          alt={f.category}
                        />
                      )}
                      <small>{f.original_name}</small>
                    </a>
                  ))}
                </div>
              </section>
            </div>
            <details className="card">
              <summary>Дополнительные ответы</summary>
              <dl className="summary-list">
                {detail.session.questions
                  .filter((q) => !q.binding)
                  .map((q) => (
                    <div key={q.key}>
                      <dt>{q.title}</dt>
                      <dd>{answerLabel(q, detail.session.answers[q.key])}</dd>
                    </div>
                  ))}
              </dl>
            </details>
            <details className="card">
              <summary>Все ответы · v{detail.session.version}</summary>
              <Summary session={detail.session} />
            </details>
            <section className="card">
              <h2>История заявки</h2>
              {detail.events.map((event, i) => (
                <div className="audit-event" key={i}>
                  <strong>{statusLabel[event.action] || event.action}</strong>
                  <small>
                    {new Date(event.created_at).toLocaleString("ru")} ·{" "}
                    {event.first_name} {event.last_name}
                  </small>
                  {event.comment && <p>{event.comment}</p>}
                </div>
              ))}
            </section>
            {user?.role === "admin" && a.status === "IN_REVIEW" && (
              <section className="card">
                <h2>Решение по заявке</h2>
                <label>
                  Комментарий
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Обязателен при запросе изменений или отклонении"
                  />
                </label>
                <div className="actions">
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => moderate("APPROVED")}
                  >
                    Одобрить
                  </button>
                  <button
                    disabled={busy || !comment.trim()}
                    onClick={() => moderate("NEEDS_CHANGES")}
                  >
                    Запросить изменения
                  </button>
                  <button
                    className="danger"
                    disabled={busy || !comment.trim()}
                    onClick={() => moderate("REJECTED")}
                  >
                    Отклонить
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
export function Account() {
  const { user, refresh } = useApp();
  const [profilePhone, setProfilePhone] = useState(user?.phone || "");
  const [savingPhone, setSavingPhone] = useState(false);
  const [channel, setChannel] = useState("email");
  const [challenge, setChallenge] = useState<{
    id: string;
    development_code?: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return (
    <>
      <Header title="Подтверждение контактов" />
      <main className="auth-page">
        <form
          className="card"
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            setSavingPhone(true);
            try {
              await api("/me/phone", "PATCH", { phone: profilePhone });
              await refresh();
              setMessage("Телефон сохранён в профиле");
            } catch (e) {
              setError(errorText(e));
            } finally {
              setSavingPhone(false);
            }
          }}
        >
          <h2>Мой телефон</h2>
          <p className="muted">
            Если вы указаны контактным лицом Point, этот номер будет доступен
            модератору.
          </p>
          <label>
            Номер телефона
            <input
              type="tel"
              autoComplete="tel"
              value={profilePhone}
              onChange={(event) => setProfilePhone(event.target.value)}
              placeholder="+7 999 123-45-67"
              required
            />
          </label>
          <button type="submit" disabled={savingPhone}>
            {savingPhone ? "Сохраняем…" : "Сохранить номер"}
          </button>
        </form>
        <div className="card">
          <h1>Подтвердите контакт</h1>
          <label>
            Канал
            <select
              value={channel}
              onChange={(e) => {
                setChannel(e.target.value);
                setChallenge(null);
              }}
            >
              <option value="email">E-mail</option>
              <option value="phone">Телефон</option>
            </select>
          </label>
          <ErrorNotice text={error} />
          {message && <p className="success-text">{message}</p>}
          <button
            disabled={channel === "phone" && !user?.phone}
            onClick={async () => {
              setError("");
              try {
                setChallenge(
                  await api("/verification/start", "POST", { channel }),
                );
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            Получить код
          </button>
          {channel === "phone" && !user?.phone && (
            <p className="muted">Сначала сохраните номер телефона выше.</p>
          )}
          {challenge && (
            <>
              <label>
                Код
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                />
              </label>
              {challenge.development_code && (
                <p className="warning">
                  Development provider: {challenge.development_code}
                </p>
              )}
              <button
                className="primary"
                onClick={async () => {
                  try {
                    await api("/verification/confirm", "POST", {
                      id: challenge.id,
                      code,
                    });
                    setMessage("Контакт подтверждён");
                    setChallenge(null);
                  } catch (e) {
                    setError(errorText(e));
                  }
                }}
              >
                Подтвердить
              </button>
            </>
          )}
        </div>
      </main>
    </>
  );
}
