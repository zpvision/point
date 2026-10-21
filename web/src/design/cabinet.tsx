"use client";
import { landingHref } from "@/lib/site-links";
import Operations from "./operations";
import { statusLabel, type Graph } from "../types";
import {
  designRequest,
  saveDesignPoint,
  uploadDesignPhoto,
  sessionFor,
} from "./bridge";
import { organizationChoices, organizationFields } from "./organization";
import NativeDetails from "./native-details";
import OrganizationInput from "./organization-input";
import Offer from "./offer";
import { useEffect, useRef, useState } from "react";
import {
  Plus,
  MapPin,
  Store,
  Check,
  ChevronDown,
  Building2,
  Package,
  Clock,
  Camera,
  User,
  CheckCheck,
  Upload,
  X,
  Mail,
  Phone,
  LogOut,
  Save,
  Loader2,
  FileCheck2,
  Send,
  Pencil,
  Download,
} from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Toaster, toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  blank,
  groups,
  steps,
  issue,
  summary,
  PointData,
  RecordPoint,
} from "@/lib/cabinet-point";
const icons = [Building2, MapPin, Package, Clock, Camera, User, CheckCheck];
const api = designRequest;
const put = (path: string, data: unknown) =>
  api(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
export default function Cabinet({
  user,
}: {
  user: { name: string; email: string; role?: string };
}) {
  useEffect(() => {
    if (!document.querySelector("script[data-point-consent]")) {
      const script = document.createElement("script");
      script.src = "/point-consent.js?v=16";
      script.dataset.pointConsent = "true";
      document.body.appendChild(script);
    }
  }, []);
  const [photoCategory, setPhotoCategory] = useState("facade");
  const [assistantTyping, setAssistantTyping] = useState(false);
  const [offerReviewed, setOfferReviewed] = useState(false);
  const [submissionComplete, setSubmissionComplete] = useState(false);
  const [legalOptions, setLegalOptions] = useState<
    ReturnType<typeof organizationChoices>
  >([]);
  const [view, setView] = useState("points"),
    [list, setList] = useState<RecordPoint[]>([]),
    [record, setRecord] = useState<RecordPoint | null>(null),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [saveState, setSaveState] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [selectedPoint, setSelectedPoint] = useState(""),
    [legacyApplication, setLegacyApplication] = useState<any>(null),
    [profile, setProfile] = useState({
      name: user.name,
      phone: "",
      email: user.email,
    });
  const current = useRef<RecordPoint | null>(null),
    dirty = useRef(false),
    queue = useRef<Promise<unknown>>(Promise.resolve()),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const d = record?.data;
  const profileName = profile.name.trim() || user.name.trim() || user.email;
  const step = d?.step || 0;
  const submitted = record?.status === "ready";
  const orgFields = organizationFields(d?.legal || "");
  const questionTitle = (index: number) =>
    index === 1 ? orgFields.title : steps[index];
  useEffect(() => {
    if (view !== "editor" || loading) return;
    setAssistantTyping(true);
    const timeout = setTimeout(() => setAssistantTyping(false), 650);
    return () => clearTimeout(timeout);
  }, [step, view, loading]);
  const chatStream = useRef<HTMLDivElement | null>(null),
    activeQuestion = useRef<HTMLDivElement | null>(null);
  const answered = d?.answered ?? Array.from({ length: step }, (_, i) => i);
  const firstUnanswered =
    Array.from({ length: 12 }, (_, i) => i).find(
      (i) => !answered.includes(i),
    ) ?? 12;
  const editing = answered.includes(step);
  useEffect(() => {
    if (view !== "editor" || loading || assistantTyping) return;
    const node = activeQuestion.current,
      stream = chatStream.current;
    if (node && stream) {
      stream.scrollTo({
        top: answered.length
          ? node.getBoundingClientRect().top -
            stream.getBoundingClientRect().top +
            stream.scrollTop -
            18
          : 0,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    }
  }, [step, view, loading, assistantTyping]);
  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const [items, p, legacy] = await Promise.all([
        api("/api/cabinet/points"),
        api("/api/cabinet/profile"),
        api("/api/point-registration"),
      ]);
      setLegacyApplication(legacy.application);
      setList(items);
      setProfile(p);
      const path = window.location.pathname;
      if (path === "/account" || path === "/account/points" || path === "/")
        setView("account");
      else if (path.startsWith("/account/points/")) {
        setView("editor");
        const id = path.split("/")[3];
        const found =
          id === "new"
            ? {
                id: crypto.randomUUID(),
                data: blank(),
                status: "draft",
                updated: "",
              }
            : items.find((v: RecordPoint) => v.id === id);
        if (!found)
          throw new Error("Точка не найдена. Вернитесь к списку точек.");
        const graph: Graph =
          id === "new"
            ? (await api("/api/scenarios/POINT_REGISTRATION")).graph
            : (await sessionFor(found.id)).graph;
        const options = organizationChoices(graph);
        if (!options.length)
          throw new Error(
            "В сценарии регистрации нет доступных форм организации.",
          );
        setLegalOptions(options);
        if (id === "new") {
          found.data.contactName = p.name || user.name;
          found.data.contactPhone = p.phone || "";
        }
        found.data.answered ??= Array.from(
          { length: found.data.step },
          (_, i) => i,
        );
        current.current = found;
        setRecord(found);
      } else setView("points");
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const warning = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warning);
    return () => {
      window.removeEventListener("beforeunload", warning);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  function save(r: RecordPoint, notify = false) {
    setSaveState("Сохраняем…");
    const task = queue.current.catch(() => {}).then(() => saveDesignPoint(r));
    queue.current = task;
    return task
      .then((saved: RecordPoint) => {
        if (current.current === r) {
          dirty.current = false;
          setSaveState("Все изменения сохранены");
          if (window.location.pathname === "/account/points/new")
            window.history.replaceState(
              null,
              "",
              "/account/points/" + saved.id,
            );
        }
        if (notify) toast.success("Изменения сохранены");
        return saved;
      })
      .catch((e) => {
        setSaveState("Не удалось сохранить");
        if (notify) toast.error(e.message);
        throw e;
      });
  }
  function change(patch: Partial<PointData>) {
    if (!current.current || current.current.status === "ready") return;
    const next = {
      ...current.current,
      status: "draft",
      data: { ...current.current.data, ...patch },
    };
    current.current = next;
    setRecord(next);
    dirty.current = true;
    setError("");
    setSaveState("Есть изменения");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      save(next).catch(() => {});
    }, 650);
  }
  async function go(path: string) {
    if (timer.current) clearTimeout(timer.current);
    try {
      if (dirty.current && current.current) await save(current.current);
      else await queue.current;
      window.location.assign(path);
    } catch {
      toast.error("Сначала сохраните изменения или повторите попытку.");
    }
  }
  function link(path: string) {
    return {
      href: path,
      onClick: (e: React.MouseEvent) => {
        e.preventDefault();
        void go(path);
      },
    };
  }
  async function saveNow() {
    if (!current.current) return;
    if (timer.current) clearTimeout(timer.current);
    setBusy(true);
    try {
      await save(current.current, true);
    } catch {
    } finally {
      setBusy(false);
    }
  }
  function next() {
    if (!d || step === 12) return;
    const e = issue(d, step);
    if (e) {
      setError(e);
      return;
    }
    const sent = Array.from(new Set([...answered, step])).sort((a, b) => a - b);
    const target =
      Array.from({ length: 12 }, (_, i) => i).find((i) => !sent.includes(i)) ??
      12;
    change({ answered: sent, step: target });
  }

  async function finalize() {
    if (!current.current) return;
    if (!offerReviewed) {
      setError("Ознакомьтесь с проектом оферты перед завершением заявки.");
      return;
    }
    for (let n = 0; n < 12; n++) {
      const e = issue(current.current.data, n);
      if (e) {
        change({ step: n });
        setError(e);
        return;
      }
    }
    if (timer.current) clearTimeout(timer.current);
    setBusy(true);
    const ready = { ...current.current, status: "ready" };
    current.current = ready;
    setRecord(ready);
    try {
      await save(ready);
      setSubmissionComplete(true);
    } catch (e) {
      const draft = { ...current.current!, status: "draft" };
      current.current = draft;
      setRecord(draft);
      dirty.current = true;
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(files: FileList | null) {
    if (!files || !current.current) return;
    const selected = Array.from(files);
    if (selected.length + current.current.data.photos.length > 8) {
      setError("Можно добавить до 8 фотографий");
      return;
    }
    setUploading(true);
    setError("");
    try {
      for (const file of selected) {
        const photo = await uploadDesignPhoto(
          current.current!,
          file,
          photoCategory,
        );
        change({ photos: [...(current.current?.data.photos || []), photo] });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    for (const tool of [
      {
        name: "list_points",
        title: "Список Point",
        description:
          "Получить сохранённые точки и заявки текущего пользователя.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: async (input: any) => {
          if (!input || Object.keys(input).length)
            throw new Error("Параметры не требуются");
          const r = await api("/api/cabinet/points");
          setList(r);
          return r.map((x: RecordPoint) => ({
            id: x.id,
            address: x.data.address,
            status: x.status,
          }));
        },
      },
      {
        name: "open_point_registration",
        title: "Открыть регистрацию Point",
        description:
          "Открыть форму новой точки. Само действие не создаёт и не отправляет заявку.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: async (input: any) => {
          if (!input || Object.keys(input).length)
            throw new Error("Параметры не требуются");
          await go("/account/points/new");
          return { opened: true };
        },
      },
    ]) {
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    }
    return () => lifecycle.abort();
  }, []);
  const activePoint = list.find((x) => x.id === selectedPoint) || list[0];
  function field(
    label: string,
    key: keyof PointData,
    placeholder = "",
    type = "text",
  ) {
    return (
      <label className="field">
        <span>{label}</span>
        <input
          type={type}
          value={String(d?.[key] ?? "")}
          placeholder={placeholder}
          onChange={(e) => change({ [key]: e.target.value })}
          maxLength={key === "inn" ? orgFields.innLength : 500}
          inputMode={key === "inn" ? "numeric" : undefined}
        />
      </label>
    );
  }
  function choices(
    key: keyof PointData,
    options: string[],
    descriptions?: string[],
    labels?: string[],
  ) {
    return (
      <RadioGroup
        value={String(d?.[key] || "")}
        onValueChange={(v) => {
          if (key === "legal" && v !== d?.legal) {
            change({
              legal: v as PointData["legal"],
              inn: "",
              company: "",
              backend: { ...d?.backend, organization: undefined },
              answered: answered.filter((i) => i !== 1),
            });
          } else change({ [key]: v });
        }}
        className="choices"
      >
        {options.map((v, i) => (
          <label
            key={v}
            className={"choice " + (d?.[key] === v ? "selected" : "")}
          >
            <RadioGroupItem value={v} />
            <span>
              <strong>{labels?.[i] || v}</strong>
              {descriptions?.[i] && <small>{descriptions[i]}</small>}
            </span>
          </label>
        ))}
      </RadioGroup>
    );
  }
  return (
    <>
      <Toaster position="bottom-right" />
      <Dialog
        open={submissionComplete}
        onOpenChange={(open) => {
          setSubmissionComplete(open);
          if (!open) void go("/account/points");
        }}
      >
        <DialogContent
          className="point-submitted-modal"
          showCloseButton={false}
        >
          <DialogClose asChild>
            <button className="point-submitted-close" aria-label="Закрыть">
              <X size={20} />
            </button>
          </DialogClose>
          <div className="point-submitted-icon" aria-hidden="true">
            <CheckCheck size={32} />
          </div>
          <span className="eyebrow">POINT · ЗАЯВКА ПРИНЯТА</span>
          <DialogTitle className="point-submitted-title">
            Поздравляем! Ещё на один Point ближе.
          </DialogTitle>
          <DialogDescription className="point-submitted-description">
            Спасибо за заявку и желание стать частью партнёрской сети Point!
            Сейчас ваша заявка проходит проверку. После завершения проверки мы
            отправим сообщение на вашу почту.
          </DialogDescription>
          <div className="point-submitted-email">
            <Mail size={20} aria-hidden="true" />
            <span translate="no">{profile.email || user.email}</span>
          </div>
          <p className="point-submitted-hint">
            Статус заявки также можно посмотреть в личном кабинете.
          </p>
          <DialogClose asChild>
            <button className="primary lime-action point-submitted-action">
              В личный кабинет <Check size={18} aria-hidden="true" />
            </button>
          </DialogClose>
        </DialogContent>
      </Dialog>
      <header className="header">
        <a
          {...link(landingHref("/"))}
          className="logo"
          aria-label="Point — главная страница s1point.ru"
        >
          point<span>.</span>
        </a>
        <span className="header-divider" />
        <span className="header-label">Партнёрский кабинет</span>
        <nav className="header-nav">
          <a {...link(landingHref("/"))}>Главная</a>
          <a
            {...link("/account")}
            className={view === "account" ? "active" : ""}
          >
            Личный кабинет
          </a>
        </nav>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="user-menu"
              aria-label={`Меню пользователя: ${profileName}`}
            >
              <span className="avatar" aria-hidden="true">
                <User size={18} />
              </span>
              <span className="user-full-name" translate="no">
                {profileName}
              </span>
              <ChevronDown size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="account-menu">
            <div className="menu-identity">
              <strong translate="no">{profileName}</strong>
              <span translate="no">{profile.email}</span>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => go("/account/points")}>
              Личный кабинет
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => go("/account")}>
              Контакты
            </DropdownMenuItem>
            {user.role === "admin" && (
              <>
                <DropdownMenuItem onSelect={() => go("/admin/scenarios")}>
                  Сценарии регистрации
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => go("/admin/applications")}>
                  Проверка заявок
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => go("/logout")}>
              <LogOut size={16} /> Выйти
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <main className={"main " + (view === "editor" ? "editor-main" : "")}>
        {loading ? (
          <div className="loading">
            <Loader2 className="spin" /> Загружаем кабинет…
          </div>
        ) : loadError ? (
          <div className="error-page">
            <h1>Не удалось открыть кабинет</h1>
            <p>{loadError}</p>
            <button className="primary" onClick={load}>
              Повторить
            </button>
            <a {...link("/account/points")}>К моим Point</a>
          </div>
        ) : (
          <>
            {view === "editor" && d && (
              <>
                <div className="editor-top">
                  <a {...link("/account/points")} className="back-link">
                    Личный кабинет /{" "}
                    <b>
                      {record?.status === "ready" ? "Заявка" : "Новый Point"}
                    </b>
                  </a>
                  <div className="save-status" aria-live="polite">
                    {saveState === "Все изменения сохранены" ? (
                      <CheckCheck size={16} />
                    ) : (
                      <Save size={15} />
                    )}{" "}
                    {saveState || "Черновик заявки"}
                    <button onClick={saveNow} disabled={busy || submitted}>
                      Сохранить
                    </button>
                  </div>
                </div>
                <div className="wizard-layout">
                  <aside className="steps-panel">
                    <div className="eyebrow">ВАШ ПУТЬ В POINT</div>
                    <div className="step-intro">
                      <span>Подключение точки</span>
                      <b>{Math.round((answered.length / 12) * 100)}%</b>
                    </div>
                    <Progress
                      value={(answered.length / 12) * 100}
                      className="wizard-progress"
                    />
                    <nav aria-label="Этапы подключения">
                      {groups.map((g, i) => {
                        const Icon = icons[i],
                          active = step >= g.start && step <= g.end,
                          done = Array.from(
                            { length: g.end - g.start + 1 },
                            (_, n) => g.start + n,
                          ).every((n) => answered.includes(n));
                        return (
                          <button
                            key={g.name}
                            className={
                              "step-button " +
                              (active ? "current " : "") +
                              (done ? "done" : "")
                            }
                            disabled={g.start > firstUnanswered}
                            onClick={() => change({ step: g.start })}
                          >
                            <span className="step-icon">
                              {done ? <Check size={17} /> : <Icon size={18} />}
                            </span>
                            <span>
                              <strong>{g.name}</strong>
                              <small>{g.sub}</small>
                            </span>
                            <span className="step-number">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                          </button>
                        );
                      })}
                    </nav>
                    <div className="step-note">
                      <Save size={19} />
                      <p>
                        Ответы сохраняются автоматически.
                        <br />
                        Вы можете вернуться позже.
                      </p>
                    </div>
                  </aside>
                  <section
                    className="form-panel chat-panel"
                    aria-label="Регистрация Point в чате"
                  >
                    <div className="chat-header">
                      <div className="chat-brand">
                        p<span>.</span>
                      </div>
                      <div>
                        <h1>AI Point Ассистент</h1>
                        <p>Пошаговый помощник по регистрации</p>
                      </div>
                      <span className="chat-counter">
                        {answered.length} / 12
                      </span>
                    </div>
                    <div className="chat-stream" ref={chatStream}>
                      <div className="chat-greeting">
                        <span className="message-author">
                          AI Point Ассистент
                        </span>
                        <div className="bot-bubble">
                          Здравствуйте! Я AI Point Ассистент. Помогу
                          зарегистрировать ваш поинт: задам вопросы о бизнесе,
                          помещении и графике. Отвечайте в чате — я сохраню
                          ответы и соберу карточку точки.
                        </div>
                      </div>
                      <div
                        className="chat-history"
                        aria-label="История регистрации"
                      >
                        {answered
                          .filter((i) => i !== step)
                          .sort((a, b) => a - b)
                          .map((i) => (
                            <div className="chat-exchange" key={i}>
                              <div className="bot-message">
                                <span className="message-author">
                                  AI Point Ассистент
                                </span>
                                <div className="bot-bubble">
                                  {questionTitle(i)}
                                </div>
                              </div>
                              <div className="user-message">
                                <span className="message-author">ВЫ</span>
                                <div className="user-bubble" translate="no">
                                  {i === 10 ? (
                                    <>
                                      <div className="chat-photo-strip">
                                        {d.photos.map((p) => (
                                          <img
                                            key={p.id}
                                            src={"/api/attachments/" + p.id}
                                            alt="Фотография точки"
                                          />
                                        ))}
                                      </div>
                                      <span>{summary(d, i)}</span>
                                    </>
                                  ) : (
                                    summary(d, i)
                                  )}
                                </div>
                                <button
                                  className="edit-answer"
                                  aria-label={
                                    "Изменить ответ: " + questionTitle(i)
                                  }
                                  onClick={() => change({ step: i })}
                                >
                                  <Pencil size={13} /> Изменить
                                </button>
                              </div>
                            </div>
                          ))}
                      </div>
                      <div className="active-question" ref={activeQuestion}>
                        {assistantTyping && (
                          <div className="assistant-typing" role="status">
                            <span className="typing-dots" aria-hidden="true">
                              <i />
                              <i />
                              <i />
                            </span>
                            AI Point Ассистент печатает…
                          </div>
                        )}
                        <div hidden={assistantTyping}>
                          <span className="message-author">
                            AI Point Ассистент{" "}
                            {editing ? "· ИЗМЕНЕНИЕ ОТВЕТА" : ""}
                          </span>
                          <div className="bot-bubble current-question">
                            <h2>
                              {step === 12
                                ? "Готово! Проверим вашу заявку."
                                : questionTitle(step)}
                            </h2>
                            <p className="form-intro">
                              {
                                [
                                  "Начнём с организации, которая будет управлять точкой.",
                                  "Заполните реквизиты для заявки на подключение.",
                                  "Адрес будет отображаться в карточке вашего Point.",
                                  "Поможем клиентам и курьерам легко вас найти.",
                                  "Название на вывеске, этаж, ориентир или особенности прохода.",
                                  "Это поможет понять, как организована ваша точка.",
                                  "Отметьте всё, с чем вы готовы работать.",
                                  "Укажите количество отправлений, которые сможете хранить одновременно.",
                                  "Ориентируйтесь на возможности вашей точки и сотрудников.",
                                  "Укажите часы, в которые клиенты смогут получить заказы.",
                                  "Добавьте фасад, вход и зону хранения. JPG, PNG или WebP, до 10 МБ каждый.",
                                  "Укажите человека, с которым можно связаться по вопросам точки.",
                                  "Проверьте заявку перед завершением. Любой ответ можно изменить.",
                                ][step]
                              }
                            </p>
                          </div>
                          <div
                            className="chat-composer"
                            onKeyDown={(e) => {
                              if (
                                e.key === "Enter" &&
                                !e.shiftKey &&
                                !e.nativeEvent.isComposing &&
                                (e.target as HTMLElement).tagName === "INPUT" &&
                                ["text", "tel"].includes(
                                  (e.target as HTMLInputElement).type,
                                )
                              ) {
                                e.preventDefault();
                                next();
                              }
                            }}
                          >
                            <div className="composer-label">
                              {step === 12 ? "ПОДТВЕРЖДЕНИЕ" : "ВАШ ОТВЕТ"}
                            </div>
                            <div className="form-content">
                              {step === 0 &&
                                choices(
                                  "legal",
                                  legalOptions.map((option) => option.value),
                                  legalOptions.map(
                                    (option) => option.description,
                                  ),
                                  legalOptions.map((option) => option.label),
                                )}
                              {step === 1 && (
                                <OrganizationInput data={d} onChange={change} />
                              )}
                              {step === 2 && (
                                <>
                                  {field(
                                    "Полный адрес",
                                    "address",
                                    "Город, улица, дом, корпус",
                                  )}
                                  <div className="info-box">
                                    <MapPin size={21} />
                                    <p>
                                      Укажите адрес целиком, включая населённый
                                      пункт и номер здания.
                                    </p>
                                  </div>
                                </>
                              )}
                              {step === 3 &&
                                choices("entrance", [
                                  "С улицы",
                                  "В торговом центре",
                                  "Во дворе",
                                  "Другой вход",
                                ])}
                              {step === 4 && (
                                <label className="field">
                                  <span>Как найти вход</span>
                                  <textarea
                                    value={d.directions}
                                    maxLength={600}
                                    rows={5}
                                    placeholder="Например: вход со стороны улицы, вывеска «Цветы», первый этаж"
                                    onChange={(e) =>
                                      change({ directions: e.target.value })
                                    }
                                  />
                                  <small>{d.directions.length} / 600</small>
                                </label>
                              )}
                              {step === 5 &&
                                choices("premises", [
                                  "Магазин",
                                  "Пункт выдачи заказов",
                                  "Офис",
                                  "Другое помещение",
                                ])}
                              {step === 6 && (
                                <div className="choices">
                                  {[
                                    "Выдача заказов",
                                    "Приём отправлений",
                                    "Возвраты",
                                  ].map((v, i) => (
                                    <label
                                      key={v}
                                      className={
                                        "choice " +
                                        (d.operations.includes(v)
                                          ? "selected"
                                          : "")
                                      }
                                    >
                                      <Checkbox
                                        checked={d.operations.includes(v)}
                                        onCheckedChange={(checked) =>
                                          change({
                                            operations: checked
                                              ? [...d.operations, v]
                                              : d.operations.filter(
                                                  (x) => x !== v,
                                                ),
                                          })
                                        }
                                      />
                                      <span>
                                        <strong>{v}</strong>
                                        <small>
                                          {
                                            [
                                              "Выдавать клиентам поступившие заказы",
                                              "Принимать посылки для дальнейшей доставки",
                                              "Принимать возвраты от клиентов",
                                            ][i]
                                          }
                                        </small>
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              )}
                              {step === 7 &&
                                choices("capacity", [
                                  "до 50",
                                  "до 100",
                                  "до 200",
                                  "более 200",
                                ])}
                              {step === 8 &&
                                choices("weight", [
                                  "до 5 кг",
                                  "до 10 кг",
                                  "до 20 кг",
                                  "до 30 кг",
                                ])}
                              {step === 9 && (
                                <>
                                  <div className="hours-top">
                                    <span>День</span>
                                    <span>Открытие</span>
                                    <span>Закрытие</span>
                                  </div>
                                  {d.hours.map((h, i) => (
                                    <div
                                      className={
                                        "hours-row " + (!h.open ? "closed" : "")
                                      }
                                      key={h.day}
                                    >
                                      <label>
                                        <Checkbox
                                          checked={h.open}
                                          onCheckedChange={(v) =>
                                            change({
                                              hours: d.hours.map((x, j) =>
                                                i === j
                                                  ? { ...x, open: !!v }
                                                  : x,
                                              ),
                                            })
                                          }
                                        />
                                        <b>{h.day}</b>
                                      </label>
                                      <input
                                        type="time"
                                        aria-label={"Открытие " + h.day}
                                        disabled={!h.open}
                                        value={h.from}
                                        onChange={(e) =>
                                          change({
                                            hours: d.hours.map((x, j) =>
                                              i === j
                                                ? { ...x, from: e.target.value }
                                                : x,
                                            ),
                                          })
                                        }
                                      />
                                      <input
                                        type="time"
                                        aria-label={"Закрытие " + h.day}
                                        disabled={!h.open}
                                        value={h.to}
                                        onChange={(e) =>
                                          change({
                                            hours: d.hours.map((x, j) =>
                                              i === j
                                                ? { ...x, to: e.target.value }
                                                : x,
                                            ),
                                          })
                                        }
                                      />
                                    </div>
                                  ))}
                                  <button
                                    className="text-button"
                                    onClick={() =>
                                      change({
                                        hours: d.hours.map((x) => ({
                                          ...x,
                                          from: d.hours[0].from,
                                          to: d.hours[0].to,
                                        })),
                                      })
                                    }
                                  >
                                    Применить часы понедельника ко всем дням
                                  </button>
                                </>
                              )}
                              {step === 10 && (
                                <>
                                  <label className="field">
                                    <span>Что изображено на фотографии</span>
                                    <Select
                                      value={photoCategory}
                                      onValueChange={setPhotoCategory}
                                    >
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {[
                                          ["facade", "Фасад / вход"],
                                          ["interior", "Помещение внутри"],
                                          ["sign", "Вывеска"],
                                          ["storage", "Зона хранения"],
                                        ].map(([v, l]) => (
                                          <SelectItem key={v} value={v}>
                                            {l}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </label>
                                  <label
                                    className={
                                      "upload-zone " +
                                      (uploading ? "uploading" : "")
                                    }
                                  >
                                    <input
                                      type="file"
                                      accept="image/jpeg,image/png,image/webp"
                                      multiple
                                      disabled={
                                        uploading || d.photos.length >= 8
                                      }
                                      onChange={(e) => {
                                        upload(e.target.files);
                                        e.target.value = "";
                                      }}
                                    />
                                    {uploading ? (
                                      <Loader2 className="spin" size={30} />
                                    ) : (
                                      <Upload size={30} />
                                    )}
                                    <strong>
                                      {uploading
                                        ? "Загружаем фотографии…"
                                        : "Выберите фотографии"}
                                    </strong>
                                    <span>До 8 файлов · JPG, PNG, WebP</span>
                                  </label>
                                  <div className="photos">
                                    {d.photos.map((p, i) => (
                                      <figure key={p.id}>
                                        <img
                                          src={"/api/attachments/" + p.id}
                                          alt={"Фото точки " + (i + 1)}
                                        />
                                        <button
                                          aria-label={"Убрать фото " + (i + 1)}
                                          onClick={async () => {
                                            try {
                                              await api(
                                                "/api/attachments/" + p.id,
                                                { method: "DELETE" },
                                              );
                                              change({
                                                photos: d.photos.filter(
                                                  (x) => x.id !== p.id,
                                                ),
                                              });
                                            } catch (e) {
                                              setError((e as Error).message);
                                            }
                                          }}
                                        >
                                          <X size={16} />
                                        </button>
                                        <figcaption>
                                          {i === 0 ? "Обложка" : p.name}
                                        </figcaption>
                                      </figure>
                                    ))}
                                  </div>
                                </>
                              )}
                              {step === 11 && (
                                <>
                                  {choices("contact", ["Я", "Другой человек"])}
                                  {field(
                                    "Имя контактного лица",
                                    "contactName",
                                    "Имя и фамилия",
                                  )}
                                  {field(
                                    "Номер телефона",
                                    "contactPhone",
                                    "+7 999 123-45-67",
                                    "tel",
                                  )}
                                  <p className="hint">
                                    Этот контакт будет сохранён в заявке вашей
                                    точки.
                                  </p>
                                </>
                              )}
                              {step === 12 && (
                                <>
                                  <NativeDetails
                                    record={record!}
                                    onChange={change}
                                    ensureSaved={() => {
                                      if (timer.current)
                                        clearTimeout(timer.current);
                                      return save(current.current!);
                                    }}
                                  />
                                  <Offer
                                    pointId={record!.id}
                                    onReviewed={setOfferReviewed}
                                  />
                                  <div className="chat-complete">
                                    <CheckCheck size={23} />
                                    <div>
                                      <strong>Все 12 ответов сохранены</strong>
                                      <p>
                                        Проверьте ответы выше и карточку Point.
                                        Чтобы исправить данные, нажмите
                                        «Изменить» под ответом.
                                      </p>
                                    </div>
                                  </div>
                                  <div className="info-box">
                                    <FileCheck2 size={23} />
                                    <p>
                                      Заявка будет отправлена на проверку и
                                      сохранится в кабинете. После отправки её
                                      проверит команда Point.
                                    </p>
                                  </div>
                                </>
                              )}
                            </div>
                            {error && (
                              <p className="form-error" role="alert">
                                {error}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="form-footer chat-actions">
                      <span className="chat-autosave">
                        <Save size={14} /> Автосохранение
                      </span>
                      <button
                        className="primary"
                        disabled={
                          submitted ||
                          busy ||
                          uploading ||
                          assistantTyping ||
                          (step === 12 && !offerReviewed)
                        }
                        onClick={step === 12 ? finalize : next}
                      >
                        {busy ? (
                          <Loader2 size={18} className="spin" />
                        ) : step === 12 ? (
                          <Check size={18} />
                        ) : (
                          <Send size={17} />
                        )}{" "}
                        {submitted
                          ? "Заявка отправлена"
                          : step === 12
                            ? "Завершить заявку"
                            : editing
                              ? "Сохранить ответ"
                              : "Ответить"}
                      </button>
                    </div>
                  </section>
                  <aside className="preview-panel">
                    <div className="preview-label">ПРЕДПРОСМОТР POINT</div>
                    <div className="preview-card">
                      <div className="preview-cover">
                        {d.photos[0] ? (
                          <img
                            src={"/api/attachments/" + d.photos[0].id}
                            alt="Фасад Point"
                          />
                        ) : (
                          <>
                            <span className="preview-wordmark">
                              point<span>.</span>
                            </span>
                            <span>Место для вашей фотографии</span>
                          </>
                        )}
                        <span className="badge">
                          {record?.status === "ready"
                            ? "Готова к отправке"
                            : "Черновик"}
                        </span>
                      </div>
                      <div className="preview-body">
                        <span className="eyebrow">
                          {d.premises || "ВАША НОВАЯ ТОЧКА"}
                        </span>
                        <h2>{d.address || "Здесь будет ваш Point"}</h2>
                        <div className="preview-detail">
                          <Clock size={17} />
                          <div>
                            <span>Режим работы</span>
                            <strong>
                              {d.hours.every(
                                (h) =>
                                  h.open &&
                                  h.from === d.hours[0].from &&
                                  h.to === d.hours[0].to,
                              )
                                ? "ПН–ВС " +
                                  d.hours[0].from +
                                  "–" +
                                  d.hours[0].to
                                : d.hours
                                    .filter((h) => h.open)
                                    .map(
                                      (h) => h.day + " " + h.from + "–" + h.to,
                                    )
                                    .join(" · ")}
                            </strong>
                          </div>
                        </div>
                        <div className="preview-mini">
                          <div>
                            <span>Вместимость</span>
                            <strong>
                              {d.capacity || "—"}{" "}
                              <small>{d.capacity ? "посылок" : ""}</small>
                            </strong>
                          </div>
                          <div>
                            <span>Вес</span>
                            <strong>{d.weight || "—"}</strong>
                          </div>
                        </div>
                        <div className="operation-tags">
                          {d.operations.length ? (
                            d.operations.map((o) => <span key={o}>{o}</span>)
                          ) : (
                            <span>Операции пока не выбраны</span>
                          )}
                        </div>
                        {d.entrance && (
                          <div className="preview-detail">
                            <MapPin size={17} />
                            <div>
                              <span>Вход</span>
                              <strong>{d.entrance}</strong>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="preview-note">
                      Карточка обновляется по мере ваших ответов
                    </p>
                    <div className="preview-brand">
                      Каждый бизнес
                      <br />
                      начинается с точки<span>.</span>
                    </div>
                  </aside>
                </div>
              </>
            )}
            {view === "account" && (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">POINT · ПАРТНЁРАМ</div>
                    <h1>
                      Личный кабинет<span className="title-dot">.</span>
                    </h1>
                    <p>
                      {profile.name || user.name}, здесь ваш Point и контактные
                      данные.
                    </p>
                  </div>
                  <div className="cabinet-actions">
                    <a
                      {...link("/account/points/new")}
                      className="primary lime-action"
                    >
                      <Plus size={19} /> Добавить Point
                    </a>
                    <a
                      href={landingHref("/points/conditions")}
                      className="secondary"
                    >
                      Условия для начала работы
                    </a>
                    <a
                      href="/faq/FAQ_Point.pdf"
                      download="FAQ_Point.pdf"
                      className="secondary faq-download"
                    >
                      <Download size={18} /> Скачать FAQ Point
                    </a>
                  </div>
                </div>
                <figure className="cabinet-shelf-photo">
                  <img
                    src="/images/point-shelves.jpg"
                    alt="Посылки аккуратно хранятся на стеллажах в пункте Point"
                  />
                </figure>
                {legacyApplication && (
                  <section className="legacy-application">
                    <h2>Ранее поданная заявка</h2>
                    <p>
                      {legacyApplication.business} · {legacyApplication.address}
                    </p>
                    <p>
                      Заявка из прежней формы сохранена. Для подробной карточки
                      точки заполните новую анкету через «Добавить Point».
                    </p>
                    <small>Номер: {legacyApplication.id}</small>
                  </section>
                )}
                <section className="single-point-section">
                  <div className="single-point-top">
                    <h2>Мой Point</h2>
                    {list.length > 1 && (
                      <Select
                        value={activePoint?.id}
                        onValueChange={setSelectedPoint}
                      >
                        <SelectTrigger aria-label="Выбрать сохранённый Point">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {list.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.data.address || "Новая точка"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  {activePoint ? (
                    <a
                      {...link("/account/points/" + activePoint.id)}
                      className="single-point"
                    >
                      <span className="single-point-icon">
                        <Store size={28} strokeWidth={1.5} />
                        <Plus size={12} className="point-icon-plus" />
                      </span>
                      <div className="single-point-info">
                        <span className="point-status">
                          {activePoint.status === "ready"
                            ? statusLabel[
                                activePoint.applicationStatus || "IN_REVIEW"
                              ] || "Заявка отправлена"
                            : "Черновик регистрации"}
                        </span>
                        <h3 translate="no">
                          {activePoint.data.address || "Ваш новый Point"}
                        </h3>
                        <p translate="no">
                          {activePoint.data.company ||
                            "Реквизиты пока не заполнены"}
                        </p>
                        <div className="point-facts">
                          <span>
                            <Clock size={15} />
                            {summary(activePoint.data, 9)}
                          </span>
                          <span>
                            <Package size={15} />
                            {activePoint.data.capacity
                              ? activePoint.data.capacity + " посылок"
                              : "Вместимость не указана"}
                          </span>
                          {activePoint.data.weight && (
                            <span>{activePoint.data.weight}</span>
                          )}
                        </div>
                        {activePoint.data.operations.length > 0 && (
                          <p className="point-operations">
                            {activePoint.data.operations.join(" · ")}
                          </p>
                        )}
                      </div>
                      <span className="single-point-open">
                        {activePoint.status === "ready"
                          ? "Открыть заявку"
                          : "Продолжить регистрацию"}
                      </span>
                    </a>
                  ) : (
                    <Empty className="single-point-empty">
                      <EmptyHeader>
                        <Store size={32} strokeWidth={1.5} />
                        <EmptyTitle>Ваш Point пока не добавлен</EmptyTitle>
                        <EmptyDescription>
                          Нажмите «Добавить Point» — AI Point Ассистент поможет
                          заполнить заявку в чате.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                  <p className="single-point-note">
                    Заявки сохраняются в кабинете. Отправленные заявки проверяет
                    команда Point.
                  </p>
                </section>
                {activePoint && (
                  <>
                    <Offer
                      key={activePoint.id + "offer"}
                      pointId={activePoint.id}
                    />
                    <Operations key={activePoint.id} pointId={activePoint.id} />
                  </>
                )}
                <div className="profile-layout">
                  <section className="profile-card">
                    <div className="profile-card-head">
                      <div className="avatar large">
                        {(profile.name || user.name)[0]}
                      </div>
                      <div>
                        <h2>Личные данные</h2>
                        <p>Контактное лицо ваших Point</p>
                      </div>
                    </div>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setBusy(true);
                        try {
                          await put("/api/cabinet/profile", {
                            name: profile.name,
                            phone: profile.phone,
                          });
                          toast.success("Профиль сохранён");
                        } catch (e) {
                          toast.error((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <label className="field">
                        <span>Имя и фамилия</span>
                        <input
                          required
                          maxLength={150}
                          value={profile.name}
                          onChange={(e) =>
                            setProfile({ ...profile, name: e.target.value })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Номер телефона</span>
                        <input
                          type="tel"
                          placeholder="+7 999 123-45-67"
                          value={profile.phone}
                          onChange={(e) =>
                            setProfile({ ...profile, phone: e.target.value })
                          }
                        />
                      </label>
                      <p className="hint">
                        Если вы указаны контактным лицом Point, этот номер можно
                        использовать при заполнении заявки.
                      </p>
                      <button className="primary" disabled={busy}>
                        <Save size={17} />
                        {busy ? "Сохраняем…" : "Сохранить данные"}
                      </button>
                    </form>
                  </section>
                  <aside>
                    <section className="profile-card">
                      <Mail size={23} />
                      <h2>Ваш e-mail</h2>
                      <p className="email-text">{profile.email}</p>
                      <span className="badge static">Учётная запись Point</span>
                      <p className="hint">
                        Кабинет доступен через вашу учётную запись Point.
                      </p>
                    </section>
                    <section className="profile-card">
                      <Phone size={23} />
                      <h2>
                        <a href="/verification">Подтверждение контактов</a>
                      </h2>
                      <p>
                        Отправка кодов на телефон и e-mail пока не подключена.
                      </p>
                    </section>
                  </aside>
                </div>
              </>
            )}
          </>
        )}
      </main>
      <footer className="footer">
        <a {...link(landingHref("/"))} className="logo">
          point<span>.</span>
        </a>
        <span>Партнёрская сеть</span>
        <span>Всё начинается с точки.</span>
      </footer>
    </>
  );
}
