"use client";
import { landingHref } from "@/lib/site-links";
import { useEffect, useState, ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
type Item = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  stock: number;
  image: string;
  active: number;
  version: number;
  seller_name: string;
  legal_name: string;
  tax_id: string;
  seller_contact: string;
  warehouse: string;
  rating: number;
  reviews: number;
};
type Seller = {
  name: string;
  legal_name: string;
  tax_id: string;
  contact: string;
  warehouse: string;
};
type Order = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  contact: string;
  area: string;
  proposal: string;
  status: string;
  created: number;
  role: "buyer" | "seller";
  seller_name: string;
  seller_contact: string;
  rating: number;
  comment: string;
};
const categories = ["Для дома", "Аксессуары", "Свет", "Одежда", "Другое"];
const money = (n: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(n / 100);
const statuses: Record<string, string> = {
  requested: "Ожидает согласования",
  proposed: "Условия предложены",
  confirmed: "Подтверждён покупателем",
  shipped: "В пути до поинта",
  ready: "Готов к выдаче",
  completed: "Получен",
  cancelled: "Отменён",
};
async function api(body: unknown) {
  const r = await fetch("/api/market", {
    method: "POST",
    headers:
      body instanceof FormData ? {} : { "content-type": "application/json" },
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
  const v: any = await r.json();
  if (!r.ok) throw new Error(v.error || "Не удалось сохранить");
  return v;
}
function Choice({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[][];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => (
          <SelectItem value={v} key={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Modal({
  title,
  description,
  children,
  close,
}: {
  title: string;
  description: string;
  children: ReactNode;
  close: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <DialogContent showCloseButton={false}>
        <div className="dialog-head">
          <DialogTitle>{title}</DialogTitle>
          <DialogClose className="close" aria-label="Закрыть">
            ×
          </DialogClose>
        </div>
        <DialogDescription>{description}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export default function Market({
  user,
  signIn,
}: {
  user: { email: string; name: string } | null;
  signIn: string;
}) {
  const [tab, setTab] = useState("catalog"),
    [items, setItems] = useState<Item[]>([]),
    [mine, setMine] = useState<Item[]>([]),
    [seller, setSeller] = useState<Seller | null>(null),
    [orders, setOrders] = useState<Order[]>([]),
    [loading, setLoading] = useState(true),
    [accountLoading, setAccountLoading] = useState(false),
    [error, setError] = useState(""),
    [accountError, setAccountError] = useState(""),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("Все"),
    [sort, setSort] = useState("new"),
    [stock, setStock] = useState(false),
    [detail, setDetail] = useState<Item | null>(null),
    [reviews, setReviews] = useState<any[]>([]),
    [reviewError, setReviewError] = useState(""),
    [edit, setEdit] = useState<Item | "new" | null>(null),
    [buy, setBuy] = useState<Item | null>(null),
    [profile, setProfile] = useState(false),
    [act, setAct] = useState<{ o: Order; status: string } | null>(null),
    [review, setReview] = useState<Order | null>(null),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState(""),
    [photo, setPhoto] = useState<File | null>(null),
    [editCategory, setEditCategory] = useState("Для дома"),
    [active, setActive] = useState("yes"),
    [rating, setRating] = useState("5"),
    [orderKey, setOrderKey] = useState("");
  async function loadCatalog() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/market");
      const v: any = await r.json();
      if (!r.ok) throw new Error(v.error);
      setItems(v.results);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function loadAccount() {
    if (!user) return;
    setAccountLoading(true);
    setAccountError("");
    try {
      const r = await fetch("/api/market?mode=account");
      const v: any = await r.json();
      if (!r.ok) throw new Error(v.error);
      setSeller(v.seller);
      setMine(v.products);
      setOrders(v.orders);
    } catch (e) {
      setAccountError((e as Error).message);
    } finally {
      setAccountLoading(false);
    }
  }
  useEffect(() => {
    loadCatalog();
    loadAccount();
  }, []);
  useEffect(() => {
    if (!detail) return;
    let ignore = false;
    setReviews([]);
    setReviewError("");
    fetch("/api/market?mode=reviews&id=" + detail.id)
      .then(async (r) => {
        const v: any = await r.json();
        if (!r.ok) throw new Error(v.error);
        if (!ignore) setReviews(v.results);
      })
      .catch(() => {
        if (!ignore) setReviewError("Не удалось загрузить отзывы");
      });
    return () => {
      ignore = true;
    };
  }, [detail]);
  const visible = items
    .filter(
      (p) =>
        (category === "Все" || p.category === category) &&
        (!stock || p.stock > 0) &&
        `${p.name} ${p.seller_name}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "low"
        ? a.price - b.price
        : sort === "high"
          ? b.price - a.price
          : sort === "rating"
            ? b.rating - a.rating
            : 0,
    );
  function startEdit(p: Item | "new") {
    setEdit(p);
    setPhoto(null);
    setEditCategory(p === "new" ? "Для дома" : p.category);
    setActive(p === "new" || p.active ? "yes" : "no");
    setFormError("");
  }
  function startBuy(p: Item) {
    if (!user) {
      window.location.assign(signIn);
      return;
    }
    setDetail(null);
    setBuy(p);
    setOrderKey(crypto.randomUUID());
    setFormError("");
  }
  async function save(
    fn: () => Promise<unknown>,
    close: () => void,
    message = "Сохранено",
  ) {
    if (busy) return;
    setBusy(true);
    setFormError("");
    try {
      await fn();
      close();
      toast.success(message);
      await Promise.all([loadCatalog(), loadAccount()]);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const signInCard = (
    <div className="empty">
      <h2>Твоя витрина начинается здесь</h2>
      <p>
        Войди в Point, чтобы добавлять товары, оформлять заказы и следить за
        ними.
      </p>
      <a className="button" href={signIn} target="_top">
        Войти в Point
      </a>
    </div>
  );
  const orderCards = (role: "buyer" | "seller") => (
    <>
      {orders.filter((o) => o.role === role).length === 0 ? (
        <div className="orders-empty">Заказов пока нет.</div>
      ) : (
        orders
          .filter((o) => o.role === role)
          .map((o) => (
            <article className="order" key={o.id}>
              <div className="order-top">
                <strong>
                  {o.name} × {o.quantity}
                </strong>
                <span className="status">{statuses[o.status]}</span>
              </div>
              <p>
                № {o.id.slice(0, 8)} ·{" "}
                {new Date(o.created).toLocaleDateString("ru-RU")} · Товары:{" "}
                <strong>{money(o.price * o.quantity)}</strong>
              </p>
              <p>
                {role === "seller" ? "Контакт покупателя" : "Продавец"}:{" "}
                {role === "seller"
                  ? o.contact
                  : `${o.seller_name} · ${o.seller_contact}`}
                <br />
                Желаемое место получения: {o.area}
              </p>
              {o.proposal && (
                <div className="proposal">
                  <strong>Адрес выдачи, доставка и оплата</strong>
                  <p>{o.proposal}</p>
                </div>
              )}
              <div className="actions">
                {role === "seller" &&
                  ["requested", "proposed"].includes(o.status) && (
                    <button
                      className="button"
                      onClick={() => {
                        setAct({ o, status: "proposed" });
                        setFormError("");
                      }}
                    >
                      {o.status === "proposed"
                        ? "Изменить условия"
                        : "Предложить условия"}
                    </button>
                  )}
                {role === "buyer" && o.status === "proposed" && (
                  <button
                    className="button"
                    onClick={() => {
                      setAct({ o, status: "confirmed" });
                      setFormError("");
                    }}
                  >
                    Принять условия
                  </button>
                )}
                {role === "seller" && o.status === "confirmed" && (
                  <button
                    className="button"
                    onClick={() => {
                      setAct({ o, status: "shipped" });
                      setFormError("");
                    }}
                  >
                    Товар отправлен
                  </button>
                )}
                {role === "seller" && o.status === "shipped" && (
                  <button
                    className="button"
                    onClick={() => {
                      setAct({ o, status: "ready" });
                      setFormError("");
                    }}
                  >
                    Прибыл в поинт
                  </button>
                )}
                {role === "buyer" && o.status === "ready" && (
                  <button
                    className="button"
                    onClick={() => {
                      setAct({ o, status: "completed" });
                      setFormError("");
                    }}
                  >
                    Подтвердить получение
                  </button>
                )}
                {["requested", "proposed", "confirmed"].includes(o.status) && (
                  <button
                    className="add-cart"
                    onClick={() => {
                      setAct({ o, status: "cancelled" });
                      setFormError("");
                    }}
                  >
                    Отменить заказ
                  </button>
                )}
                {role === "buyer" && o.status === "completed" && !o.rating && (
                  <button
                    className="button"
                    onClick={() => {
                      setReview(o);
                      setRating("5");
                      setFormError("");
                    }}
                  >
                    Оценить товар
                  </button>
                )}
                {!!o.rating && <span>Оценка покупателя: {o.rating} / 5</span>}
              </div>
              {o.status === "shipped" && role === "buyer" && (
                <p>Продавец сообщит, когда заказ будет готов к выдаче.</p>
              )}
              {o.status === "ready" && role === "seller" && (
                <p>Ожидаем подтверждение получения от покупателя.</p>
              )}
            </article>
          ))
      )}
    </>
  );
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => {
        setTab(v);
        if (v !== "catalog") loadAccount();
      }}
    >
      <Toaster />
      <header>
        <a className="brand" href={landingHref("/")}>
          point
          <span className="dot" />
          <small>market</small>
        </a>
        <TabsList aria-label="Разделы маркета">
          <TabsTrigger value="catalog">Каталог</TabsTrigger>
          <TabsTrigger value="seller">Кабинет селлера</TabsTrigger>
          <TabsTrigger value="orders">Мои покупки</TabsTrigger>
        </TabsList>
        {user ? (
          <a
            className="account-link"
            href="/logout"
            target="_top"
            title={user.email}
          >
            Выйти
          </a>
        ) : (
          <a className="cart-button" href={signIn} target="_top">
            Войти в Point
          </a>
        )}
      </header>
      <main>
        <TabsContent value="catalog">
          <div className="intro">
            <div>
              <p className="eyebrow">НЕЗАВИСИМЫЕ ПРОДАВЦЫ. ОДНА ПЛОЩАДКА.</p>
              <h1>
                Твои находки.
                <br />В твоём поинте.
              </h1>
            </div>
            <div className="intro-right">
              <p>
                Покупай у селлеров напрямую.
                <br />
                Товар хранит фулфилмент.
                <br />
                Заказ получай в поинте.
              </p>
              <span className="micro">
                Адрес выдачи, срок, доставку и оплату согласовываем с продавцом
                для каждого заказа.
              </span>
            </div>
          </div>
          <div className="search-row">
            <label className="search-box">
              <span aria-hidden>⌕</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Найти товар или продавца"
                aria-label="Поиск товаров"
              />
            </label>
            <Choice
              label="Сортировка"
              value={sort}
              onChange={setSort}
              options={[
                ["new", "Сначала новые"],
                ["low", "Сначала дешевле"],
                ["high", "Сначала дороже"],
                ["rating", "По оценке"],
              ]}
            />
          </div>
          <div className="filters">
            <div id="categories">
              {["Все", ...categories].map((c) => (
                <button
                  key={c}
                  className={"chip " + (category === c ? "selected" : "")}
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                >
                  {c === "Все" ? "Все товары" : c}
                </button>
              ))}
            </div>
            <label className="stock-filter">
              <Checkbox
                checked={stock}
                onCheckedChange={(v) => setStock(v === true)}
              />{" "}
              Только в наличии
            </label>
          </div>
          <div className="catalog-heading">
            <h2>Товары на маркете</h2>
            <span aria-live="polite">
              {!loading && `Товаров: ${visible.length}`}
            </span>
          </div>
          {loading ? (
            <div className="empty" role="status">
              Загружаем товары…
            </div>
          ) : error ? (
            <div className="empty" role="alert">
              <p>{error}</p>
              <button className="button" onClick={loadCatalog}>
                Повторить загрузку
              </button>
            </div>
          ) : visible.length ? (
            <div className="product-grid">
              {visible.map((p) => (
                <article className="product-card" key={p.id}>
                  <button
                    className="photo-button"
                    onClick={() => setDetail(p)}
                    aria-label={"Открыть " + p.name}
                  >
                    <img
                      src={"/api/photo/" + p.image}
                      alt={p.name}
                      loading="lazy"
                    />
                    <span className="stock-label">
                      {p.stock > 0
                        ? `В наличии · ${p.stock} шт.`
                        : "Нет в наличии"}
                    </span>
                  </button>
                  <div className="product-meta">
                    <span>{p.seller_name}</span>
                    <span className="rating">
                      {p.reviews
                        ? `★ ${Number(p.rating).toFixed(1)} · ${p.reviews}`
                        : "Пока без оценок"}
                    </span>
                  </div>
                  <button className="product-name" onClick={() => setDetail(p)}>
                    {p.name}
                  </button>
                  <div className="product-bottom">
                    <span className="price">{money(p.price)}</span>
                    <button
                      className="add-cart"
                      disabled={!p.stock}
                      onClick={() => startBuy(p)}
                    >
                      Заказать
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty">
              <div className="empty-mark" aria-hidden>
                p.
              </div>
              <h2>
                {items.length
                  ? "Ничего не нашлось"
                  : "Здесь начинается новый выбор"}
              </h2>
              <p>
                {items.length
                  ? "Попробуй другой запрос или категорию."
                  : "Стань первым селлером: создай витрину и добавь свои товары."}
              </p>
              <button
                className="button"
                onClick={() => {
                  if (items.length) {
                    setQuery("");
                    setCategory("Все");
                    setStock(false);
                  } else setTab("seller");
                }}
              >
                {items.length ? "Сбросить фильтры" : "Открыть свою витрину"}
              </button>
            </div>
          )}
          <section className="roles">
            <h2>
              Продаёт селлер.
              <br />
              Соединяет point.
            </h2>
            <div>
              <article>
                <span>01 / ПРОДАВЕЦ</span>
                <p>
                  Загружает товары, устанавливает цены и остатки. Принимает
                  оплату и отвечает за товар.
                </p>
              </article>
              <article>
                <span>02 / ФУЛФИЛМЕНТ И ПОИНТ</span>
                <p>
                  Продавец организует хранение и отгрузку с фулфилмента. Адрес
                  поинта согласовывается до отправки.
                </p>
              </article>
              <article>
                <span>03 / ПЛОЩАДКА</span>
                <p>
                  Point даёт доступ к маркету. Подключение — отдельный тариф.
                  Стоимость будет определена позже.
                </p>
              </article>
            </div>
          </section>
        </TabsContent>
        <TabsContent value="seller">
          <div className="seller-head">
            <div>
              <p className="eyebrow">ТВОЯ ВИТРИНА НА POINT</p>
              <h1>
                Твой товар.
                <br />
                Твои продажи.
              </h1>
            </div>
            <p>
              Управляй карточками и наличием. Получай заказы и веди их от
              фулфилмента до выдачи.
            </p>
          </div>
          <div className="seller-toolbar">
            <div>
              <h2>Партнёры для твоего бизнеса</h2>
              <p className="micro">
                География поинтов, предложения фулфилментов и расчёт расходов.
                Пока на примерах.
              </p>
            </div>
            <a className="button" href={landingHref("/partners")}>
              Открыть конструктор ↗
            </a>
          </div>
          <div className="seller-notice">
            <strong>Маркет — отдельный тариф</strong>
            <span>
              Не входит в подписку Point 5 000 ₽/месяц. Цена подключения будет
              определена позже. Оплата подключения на сайте пока не подключена.
            </span>
          </div>
          {!user ? (
            signInCard
          ) : accountLoading ? (
            <div className="empty" role="status">
              Загружаем кабинет…
            </div>
          ) : accountError ? (
            <div className="empty" role="alert">
              {accountError}
              <button onClick={loadAccount} className="button">
                Повторить
              </button>
            </div>
          ) : !seller ? (
            <div className="empty">
              <h2>Расскажи о своём бизнесе</h2>
              <p>
                Название витрины, реквизиты продавца и фулфилмент — всё, чтобы
                добавить первый товар.
              </p>
              <button
                className="button"
                onClick={() => {
                  setProfile(true);
                  setFormError("");
                }}
              >
                Создать профиль селлера
              </button>
            </div>
          ) : (
            <>
              <div className="profile-strip">
                <div>
                  <strong>{seller.name}</strong>
                  <p>
                    {seller.legal_name} · ИНН {seller.tax_id}
                    <br />
                    Фулфилмент: {seller.warehouse}
                  </p>
                </div>
                <button
                  className="add-cart"
                  onClick={() => {
                    setProfile(true);
                    setFormError("");
                  }}
                >
                  Изменить профиль
                </button>
              </div>
              <div className="seller-toolbar">
                <h2>Твои товары</h2>
                <button className="button" onClick={() => startEdit("new")}>
                  Добавить товар +
                </button>
              </div>
              <p className="micro">
                Остаток — количество, доступное для новых заказов.
                Зарезервированные товары в него уже не входят.
              </p>
              {mine.length ? (
                mine.map((p) => (
                  <div className="seller-row" key={p.id}>
                    <img src={"/api/photo/" + p.image} alt="" />
                    <div>
                      {p.name}
                      <small>{p.active ? "В каталоге" : "Скрыт"}</small>
                    </div>
                    <span>{money(p.price)}</span>
                    <span>{p.stock} шт. доступно</span>
                    <button onClick={() => startEdit(p)}>Редактировать</button>
                  </div>
                ))
              ) : (
                <div className="orders-empty">
                  Добавь первый товар с фотографией — он появится в общем
                  каталоге.
                </div>
              )}
              <div className="seller-toolbar">
                <h2>Заказы покупателей</h2>
                <button className="add-cart" onClick={loadAccount}>
                  Обновить
                </button>
              </div>
              <p className="micro">
                Согласуй адрес поинта с сервисом и покупателем. Статусы
                обновляются тобой вручную; автоматическое подключение складов и
                логистики пока отсутствует.
              </p>
              {orderCards("seller")}
            </>
          )}
        </TabsContent>
        <TabsContent value="orders">
          <div className="seller-head">
            <h1>Твои покупки.</h1>
            <p>Все договорённости с продавцом и путь заказа до получения.</p>
          </div>
          {!user ? (
            signInCard
          ) : accountLoading ? (
            <div className="empty">Загружаем заказы…</div>
          ) : accountError ? (
            <div className="empty" role="alert">
              {accountError}
              <button onClick={loadAccount}>Повторить</button>
            </div>
          ) : (
            <>
              <div className="seller-toolbar">
                <p>
                  Оплата согласовывается с продавцом и производится вне Point.
                </p>
                <button className="add-cart" onClick={loadAccount}>
                  Обновить
                </button>
              </div>
              {orderCards("buyer")}
            </>
          )}
        </TabsContent>
      </main>
      <footer>
        <a className="brand" href={landingHref("/")}>
          point
          <span className="dot" />
        </a>
        <p>Площадка для твоего бизнеса.</p>
        <a href={landingHref("/sellers/")}>Условия для селлеров ↗</a>
      </footer>
      {detail && (
        <Modal
          title={detail.name}
          description={`Продавец: ${detail.seller_name}`}
          close={() => setDetail(null)}
        >
          <div className="detail-grid">
            <img src={"/api/photo/" + detail.image} alt={detail.name} />
            <div className="detail-text">
              <p className="prewrap">{detail.description}</p>
              <span className="price">{money(detail.price)}</span>
              <div className="detail-line">{detail.stock} шт. в наличии</div>
              <div className="detail-line">
                Продавец: {detail.legal_name}
                <br />
                ИНН {detail.tax_id}
                <br />
                {detail.seller_contact}
              </div>
              <div className="detail-line">Фулфилмент: {detail.warehouse}</div>
              <p>
                Доставку, адрес выдачи и оплату согласуем с продавцом до
                подтверждения заказа.
              </p>
              <button
                className="button"
                disabled={!detail.stock}
                onClick={() => startBuy(detail)}
              >
                Заказать
              </button>
            </div>
          </div>
          <section className="review">
            <h3>
              Отзывы покупателей{" "}
              {detail.reviews
                ? `· ${Number(detail.rating).toFixed(1)} / 5`
                : ""}
            </h3>
            {reviewError ? (
              <p>{reviewError}</p>
            ) : reviews.length ? (
              reviews.map((r, i) => (
                <div key={i}>
                  <strong>{r.rating} / 5</strong>
                  <span className="micro">
                    Подтверждённое получение ·{" "}
                    {new Date(r.created).toLocaleDateString("ru-RU")}
                  </span>
                  <p>
                    {r.comment || "Покупатель оставил оценку без комментария."}
                  </p>
                </div>
              ))
            ) : (
              <p>
                Отзывов пока нет. Оценить товар можно после получения заказа.
              </p>
            )}
          </section>
        </Modal>
      )}
      {profile && (
        <Modal
          title={seller ? "Профиль селлера" : "Новая витрина"}
          description="Эти данные видны покупателям в карточках товаров."
          close={() => {
            if (!busy) setProfile(false);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              save(
                () =>
                  api({
                    action: "profile",
                    name: f.get("name"),
                    legalName: f.get("legalName"),
                    taxId: f.get("taxId"),
                    contact: f.get("contact"),
                    warehouse: f.get("warehouse"),
                  }),
                () => setProfile(false),
              );
            }}
          >
            <label>
              Название витрины
              <input
                name="name"
                required
                minLength={2}
                maxLength={80}
                defaultValue={seller?.name}
              />
            </label>
            <label>
              Наименование продавца / ИП / самозанятый
              <input
                name="legalName"
                required
                minLength={2}
                maxLength={180}
                defaultValue={seller?.legal_name}
              />
            </label>
            <label>
              ИНН
              <input
                name="taxId"
                required
                inputMode="numeric"
                pattern="[0-9]{10}|[0-9]{12}"
                maxLength={12}
                defaultValue={seller?.tax_id}
              />
            </label>
            <label>
              Контакт для покупателей: телефон или email
              <input
                name="contact"
                required
                minLength={5}
                maxLength={180}
                defaultValue={seller?.contact}
              />
            </label>
            <label>
              Фулфилмент: название и город
              <input
                name="warehouse"
                required
                minLength={3}
                maxLength={240}
                defaultValue={seller?.warehouse}
              />
            </label>
            <p className="micro">
              Указывай действительные данные. Продавец отвечает за товар,
              документы, оплату и возвраты. Point предоставляет площадку.
            </p>
            <p className="error" role="alert">
              {formError}
            </p>
            <button className="button" disabled={busy}>
              {busy ? "Сохраняем…" : "Сохранить профиль"}
            </button>
          </form>
        </Modal>
      )}
      {edit && (
        <Modal
          title={edit === "new" ? "Новый товар" : "Редактировать товар"}
          description="Фото и карточка сохранятся в твоей витрине."
          close={() => {
            if (!busy) setEdit(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              save(
                async () => {
                  let image = edit === "new" ? "" : edit.image;
                  if (photo) {
                    const upload = new FormData();
                    upload.set("photo", photo);
                    image = (await api(upload)).id;
                  }
                  if (!image) throw new Error("Добавьте фотографию товара");
                  await api({
                    action: "product",
                    id: edit === "new" ? undefined : edit.id,
                    version: edit === "new" ? undefined : edit.version,
                    name: f.get("name"),
                    description: f.get("description"),
                    category: editCategory,
                    price: Math.round(Number(f.get("price")) * 100),
                    stock: Number(f.get("stock")),
                    image,
                    active: active === "yes",
                  });
                },
                () => setEdit(null),
              );
            }}
          >
            <label>
              Название
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                defaultValue={edit === "new" ? "" : edit.name}
              />
            </label>
            <div className="form-pair">
              <label>
                Цена, ₽
                <input
                  name="price"
                  type="number"
                  min="1"
                  max="1000000"
                  step="0.01"
                  required
                  defaultValue={edit === "new" ? "" : edit.price / 100}
                />
              </label>
              <label>
                Доступно для новых заказов, шт.
                <input
                  name="stock"
                  type="number"
                  min="0"
                  max="100000"
                  step="1"
                  required
                  defaultValue={edit === "new" ? "" : edit.stock}
                />
              </label>
            </div>
            <label>
              Категория
              <Choice
                value={editCategory}
                onChange={setEditCategory}
                options={categories.map((c) => [c, c])}
                label="Категория товара"
              />
            </label>
            <label>
              Описание
              <textarea
                name="description"
                required
                minLength={5}
                maxLength={2000}
                rows={4}
                defaultValue={edit === "new" ? "" : edit.description}
              />
            </label>
            <label>
              Фото товара
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required={edit === "new"}
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="micro">
              JPG, PNG или WebP до 5 МБ. Загружай фотографии своего товара.
            </p>
            <label>
              Публикация
              <Choice
                value={active}
                onChange={setActive}
                options={[
                  ["yes", "Показать в каталоге"],
                  ["no", "Скрыть из каталога"],
                ]}
                label="Публикация товара"
              />
            </label>
            <p className="error" role="alert">
              {formError}
            </p>
            <button className="button" disabled={busy}>
              {busy ? "Сохраняем…" : "Сохранить товар"}
            </button>
          </form>
        </Modal>
      )}
      {buy && (
        <Modal
          title="Заказать у селлера"
          description={`${buy.name} · ${money(buy.price)} за штуку`}
          close={() => {
            if (!busy) setBuy(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              save(
                () =>
                  api({
                    action: "order",
                    id: orderKey,
                    productId: buy.id,
                    price: buy.price,
                    quantity: Number(f.get("quantity")),
                    contact: f.get("contact"),
                    area: f.get("area"),
                  }),
                () => {
                  setBuy(null);
                  setTab("orders");
                },
                "Заказ передан продавцу",
              );
            }}
          >
            <label>
              Количество
              <input
                name="quantity"
                type="number"
                required
                min="1"
                max={Math.min(buy.stock, 100)}
                defaultValue="1"
              />
            </label>
            <label>
              Контакт для связи с продавцом
              <input
                name="contact"
                required
                minLength={5}
                maxLength={180}
                defaultValue={user?.email}
              />
            </label>
            <label>
              Город и удобный район получения
              <input
                name="area"
                required
                minLength={3}
                maxLength={240}
                placeholder="Например: Москва, район Сокол"
              />
            </label>
            <p>
              Продавец предложит адрес поинта, срок и стоимость доставки, способ
              оплаты. Ты сможешь принять условия или отменить заказ до отправки.
            </p>
            <p className="micro">
              Контакт получит продавец для исполнения заказа. Point не принимает
              оплату за товары. Итоговая стоимость включает товары и отдельно
              согласованную доставку.
            </p>
            <p className="error" role="alert">
              {formError}
            </p>
            <button disabled={busy} className="button">
              {busy ? "Отправляем…" : "Отправить заказ продавцу"}
            </button>
          </form>
        </Modal>
      )}
      {act && (
        <Modal
          title={
            act.status === "proposed"
              ? "Условия заказа"
              : act.status === "cancelled"
                ? "Отменить заказ?"
                : statuses[act.status]
          }
          description={act.o.name}
          close={() => {
            if (!busy) setAct(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              save(
                () =>
                  api({
                    action: "status",
                    id: act.o.id,
                    status: act.status,
                    proposal:
                      act.status === "proposed" ? f.get("proposal") : undefined,
                  }),
                () => setAct(null),
                "Заказ обновлён",
              );
            }}
          >
            {act.status === "proposed" ? (
              <label>
                Адрес поинта, дата, стоимость доставки и условия оплаты
                <textarea
                  name="proposal"
                  required
                  minLength={10}
                  maxLength={1500}
                  rows={6}
                  defaultValue={act.o.proposal}
                  placeholder="Укажите полный адрес поинта, дату получения, стоимость доставки и способ оплаты продавцу."
                />
              </label>
            ) : (
              <p className="prewrap">
                {act.status === "cancelled"
                  ? "Заказ будет отменён, а товары вернутся в доступный остаток."
                  : act.status === "completed"
                    ? "Подтверди, что ты действительно получил товар. После подтверждения можно оставить отзыв."
                    : act.status === "confirmed"
                      ? `Принимаю условия продавца:\n${act.o.proposal}`
                      : "Подтверди фактический этап доставки заказа."}
              </p>
            )}
            <p className="error" role="alert">
              {formError}
            </p>
            <button disabled={busy} className="button">
              {busy ? "Сохраняем…" : "Подтвердить"}
            </button>
          </form>
        </Modal>
      )}
      {review && (
        <Modal
          title="Твоя оценка"
          description={review.name}
          close={() => {
            if (!busy) setReview(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              save(
                () =>
                  api({
                    action: "review",
                    id: review.id,
                    rating: Number(rating),
                    comment: f.get("comment"),
                  }),
                () => setReview(null),
                "Спасибо за отзыв",
              );
            }}
          >
            <label>
              Оценка
              <Choice
                label="Оценка товара"
                value={rating}
                onChange={setRating}
                options={["5", "4", "3", "2", "1"].map((v) => [v, v + " / 5"])}
              />
            </label>
            <label>
              Расскажи о товаре
              <textarea name="comment" maxLength={1000} rows={4} />
            </label>
            <p className="micro">
              Отзыв публикуется без твоих контактов. Для этого заказа его можно
              оставить один раз.
            </p>
            <p className="error" role="alert">
              {formError}
            </p>
            <button className="button" disabled={busy}>
              Опубликовать отзыв
            </button>
          </form>
        </Modal>
      )}
    </Tabs>
  );
}
