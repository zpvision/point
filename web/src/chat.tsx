import { useEffect, useRef, useState } from "react";
import type { Address, FileRef, Question, Schedule, Session } from "./types";
import { api, errorMessages, errorText } from "./api";
import {
  AssistantIcon,
  ActionIcon,
  BrandLogo,
  ErrorNotice,
  Header,
  Spinner,
  useApp,
} from "./ui";
import { answerLabel, QuestionRenderer, scheduleLines } from "./questions";
import { StepIcon } from "./step-icon";

export function RegistrationProgress({ session }: { session: Session }) {
  return (
    <div className="progress-header">
      <span>
        Шаг {Math.min(session.answered + 1, session.total)} из {session.total} ·{" "}
        {session.percent}%
      </span>
      <progress value={session.percent} max={100} />
    </div>
  );
}
export function PointLivePreview({ session }: { session: Session }) {
  const b = session.preview;
  const address = b["point.address"] as Address | undefined;
  const files = b["point.photos"] as FileRef[] | undefined;
  const photo = files?.find((f) => f.category === "facade");
  const label = (binding: string) => {
    const q = session.graph.questions.find((q) => q.binding === binding);
    return q && b[binding] !== undefined
      ? answerLabel(q, b[binding])
      : "Пока не указано";
  };
  return (
    <div className="point-preview">
      <div className="preview-heading">
        <h3>Предпросмотр Point</h3>
        <span className="badge">Черновик</span>
      </div>
      {photo ? (
        <img
          className="cover"
          alt="Фасад Point"
          src={`/api/attachments/${photo.id}`}
        />
      ) : (
        <div className="cover-placeholder">
          <span className="pin-symbol">
            <BrandLogo decorative />
          </span>
          <span>Здесь будет фото вашей точки</span>
        </div>
      )}
      <h2>
        {address
          ? "Point · " +
            (address.components.street
              ? `${address.components.street} ${address.components.house}`
              : address.address)
          : "Ваш новый Point"}
      </h2>
      <p>{address?.components.city || "Город"}</p>
      <p className="muted">
        {address?.address || "Адрес появится после выбора"}
      </p>
      <hr />
      <div className="preview-detail">
        <span className="muted">Режим работы</span>
        {b["point.schedule"] ? (
          scheduleLines(b["point.schedule"] as Schedule).map((s) => (
            <span key={s}>{s}</span>
          ))
        ) : (
          <span>Пока не указан</span>
        )}
      </div>
      <div className="preview-detail">
        <span className="muted">Вместимость</span>
        <span>{label("point.storage_capacity")} отправлений</span>
      </div>
      <div className="preview-detail">
        <span className="muted">Максимальный вес</span>
        <span>{label("point.max_parcel_weight")}</span>
      </div>
      <div className="preview-detail">
        <span className="muted">Операции</span>
        <span>{label("point.operations")}</span>
      </div>
      <div className="preview-detail">
        <span className="muted">Вход</span>
        <span>{label("point.entrance_type")}</span>
      </div>
      <div className="preview-foot">
        Карточка обновляется по мере ваших ответов
      </div>
    </div>
  );
}
export function Summary({
  session,
  onEdit,
}: {
  session: Session;
  onEdit?: (q: Question) => void;
}) {
  return (
    <dl className="summary-list">
      {session.questions
        .filter(
          (q) => q.type !== "PASSWORD" && Object.hasOwn(session.answers, q.key),
        )
        .map((q) => (
          <div key={q.key}>
            <dt>{q.title}</dt>
            <dd>
              {answerLabel(q, session.answers[q.key])}
              {onEdit && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onEdit(q)}
                >
                  Изменить
                </button>
              )}
            </dd>
          </div>
        ))}
    </dl>
  );
}
function QuestionCard({
  question,
  value,
  sessionId,
  saving,
  error,
  onClearError,
  onSubmit,
  onCancel,
  preview,
}: {
  question: Question;
  value?: unknown;
  sessionId: string;
  saving: boolean;
  error: string;
  onClearError?: () => void;
  onSubmit: (v: unknown) => void;
  onCancel?: () => void;
  preview?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [confirmationAttempt, setConfirmationAttempt] = useState(0);
  const q = question;
  const [animate] = useState(
    () =>
      !onCancel &&
      value === undefined &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const characters = Array.from(q.title);
  const [visibleCharacters, setVisibleCharacters] = useState(
    animate ? 0 : characters.length,
  );
  const ready = visibleCharacters >= characters.length;
  useEffect(() => {
    if (!animate || characters.length === 0) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reveal = () => {
      window.clearInterval(timer);
      setVisibleCharacters(characters.length);
    };
    motion.addEventListener("change", reveal);
    const started = performance.now();
    const duration = Math.min(characters.length * 25, 1600);
    const timer = window.setInterval(() => {
      const count = Math.min(
        characters.length,
        Math.floor(
          ((performance.now() - started) / duration) * characters.length,
        ),
      );
      setVisibleCharacters(count);
      if (count >= characters.length) window.clearInterval(timer);
    }, 25);
    return () => {
      window.clearInterval(timer);
      motion.removeEventListener("change", reveal);
    };
  }, [animate, characters.length]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        if (q.type === "ADDRESS_MAP") {
          const address = draft as Address | undefined;
          if (
            address?.address &&
            !address.confirmed &&
            Number.isFinite(address.addressLatitude) &&
            Number.isFinite(address.addressLongitude) &&
            (address.addressLatitude !== 0 || address.addressLongitude !== 0)
          ) {
            onClearError?.();
            setConfirmationAttempt((attempt) => attempt + 1);
            return;
          }
        }
        onSubmit(draft === undefined ? null : draft);
      }}
      className="question-card"
    >
      <fieldset disabled={saving || !ready}>
        <legend className="sr-only">{q.title}</legend>
        <h2 className="typing-question-title">
          <span className="sr-only">{q.title}</span>
          <span className="typing-title-reserve" aria-hidden="true">
            {q.title}
          </span>
          <span className="typing-title-text" aria-hidden="true">
            {characters.slice(0, visibleCharacters).join("")}
            {!ready && <span className="typing-caret" />}
          </span>
        </h2>
        {ready && (
          <div className={animate ? "question-content-reveal" : undefined}>
            {q.description && <p className="muted">{q.description}</p>}
            <QuestionRenderer
              question={q}
              value={draft}
              onChange={(next) => {
                setDraft(next);
                onClearError?.();
              }}
              sessionId={sessionId}
              preview={preview}
              confirmationAttempt={confirmationAttempt}
            />
            <ErrorNotice text={error} />
            <div className="actions">
              <button className="primary" type="submit">
                {saving ? <Spinner /> : "Продолжить"}{" "}
                <span className="action-icon" aria-hidden="true">
                  →
                </span>
              </button>
              {!q.required && (
                <button type="button" onClick={() => onSubmit(null)}>
                  Пропустить
                </button>
              )}
              {onCancel && (
                <button type="button" onClick={onCancel}>
                  Отмена
                </button>
              )}
            </div>
          </div>
        )}
      </fieldset>
    </form>
  );
}
function ContactPhonePrompt({ onSaved }: { onSaved: () => Promise<void> }) {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="profile-phone-prompt"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
          await api("/me/phone", "PATCH", { phone });
          await onSaved();
        } catch (e) {
          setError(errorText(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Нужен телефон контактного лица</h3>
      <p className="muted">
        Вы выбрали «Я», но в вашем профиле нет номера. Укажите свой телефон — он
        станет контактом этого Point.
      </p>
      <label>
        Ваш номер телефона
        <input
          type="tel"
          autoComplete="tel"
          placeholder="+7 999 123-45-67"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          required
        />
      </label>
      <ErrorNotice text={error} />
      <button type="submit" disabled={busy}>
        {busy ? <Spinner /> : "Сохранить телефон"}
      </button>
    </form>
  );
}
export function RegistrationChat({ code }: { code: string }) {
  const { user, refresh } = useApp();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [answerError, setAnswerError] = useState("");
  const [completionErrors, setCompletionErrors] = useState<string[]>([]);
  const completionErrorBlock = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!completionErrors.length) return;
    completionErrorBlock.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "nearest",
    });
    completionErrorBlock.current?.focus({ preventScroll: true });
  }, [completionErrors]);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [resume, setResume] = useState(false);
  const [preview, setPreview] = useState(false);
  const [success, setSuccess] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const isPoint = code === "POINT_REGISTRATION";
  const needsOwnerPhone =
    isPoint &&
    !user?.phone &&
    (session?.preview["point.contact_is_owner"] === "SELF" ||
      session?.preview["point.contact_is_owner"] === true);
  async function start(restart = false) {
    setError("");
    try {
      const id = new URLSearchParams(location.search).get("session");
      if (id && !restart) {
        const loaded = await api<Session>("/registration/sessions/" + id);
        if (loaded.status === "COMPLETED") setSuccess(true);
        if (loaded.status === "CANCELLED")
          throw new Error(
            "Эта регистрация отменена. Откройте «Добавить Point», чтобы начать новую.",
          );
        setSession(loaded);
        return;
      }
      const result = await api<{ session: Session; resumed: boolean }>(
        "/registration/sessions",
        "POST",
        { code, restart },
      );
      setSession(result.session);
      setResume(result.resumed && !restart);
    } catch (e) {
      setError(errorText(e));
    }
  }
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      void start();
    }
  }, []);
  useEffect(() => {
    if (!session || resume) return;
    const frame = requestAnimationFrame(() => {
      const panel = bottom.current;
      if (!panel) return;
      const top =
        document.querySelector(".header")?.getBoundingClientRect().bottom || 0;
      const bounds = panel.getBoundingClientRect();
      if (bounds.top < top + 16 || bounds.top > window.innerHeight * 0.55) {
        window.scrollTo({
          top: window.scrollY + bounds.top - top - 24,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
        });
      }
      if (window.matchMedia("(pointer: fine)").matches) {
        panel
          .querySelector<HTMLElement>('input:not([type="file"]), textarea')
          ?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [session?.next?.key, editing?.key, resume]);
  const current = editing || session?.next;
  useEffect(() => {
    if (!preview) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const viewport = window.matchMedia("(max-width: 1100px)");
    const closeOnDesktop = () => {
      if (!viewport.matches) setPreview(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    viewport.addEventListener("change", closeOnDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      viewport.removeEventListener("change", closeOnDesktop);
    };
  }, [preview]);
  const sectionQuestions =
    session?.questions.filter((q) => q.section === current?.section) || [];
  const sectionName = session?.graph.sections.find(
    (s) => s.code === current?.section,
  )?.name;
  function openQuestion(question: Question) {
    if (!session || saving || resume) return;
    setAnswerError("");
    setExpandedSection(question.section);
    setEditing(Object.hasOwn(session.answers, question.key) ? question : null);
  }
  async function submit(value: unknown) {
    if (!session || !current) return;
    setSaving(true);
    setAnswerError("");
    try {
      const next = await api<Session>(
        `/registration/sessions/${session.id}/answers`,
        "POST",
        { key: current.key, value, version_id: session.version_id },
      );
      setSession(next);
      setCompletionErrors([]);
      setEditing(null);
    } catch (e) {
      setAnswerError(errorText(e));
    } finally {
      setSaving(false);
    }
  }
  async function complete() {
    if (!session) return;
    setSaving(true);
    setError("");
    setCompletionErrors([]);
    try {
      await api(`/registration/sessions/${session.id}/complete`, "POST", {});
      await refresh();
      setSuccess(true);
    } catch (e) {
      setCompletionErrors(errorMessages(e));
    } finally {
      setSaving(false);
    }
  }
  if (success)
    return (
      <>
        <Header title={isPoint ? "Регистрация точки" : "Регистрация"} />
        <main className="success-page success-celebration">
          <div className="success-emblem" aria-hidden="true">
            <span className="success-orbit" />
            <svg viewBox="0 0 96 96" fill="none">
              <circle className="success-ring-track" cx="48" cy="48" r="38" />
              <circle
                className="success-ring-draw"
                cx="48"
                cy="48"
                r="38"
                pathLength="1"
              />
              <path
                className="success-check-draw"
                d="m31 48 11 11 23-24"
                pathLength="1"
              />
            </svg>
          </div>
          <div className="success-kicker">Готово</div>
          <h1>{isPoint ? "Point отправлен на проверку" : "Аккаунт создан"}</h1>
          <p>
            {isPoint
              ? "Вы можете следить за статусом заявки в разделе «Мои Point»."
              : "Теперь давайте подключим ваш первый Point."}
          </p>
          <a
            className="button primary"
            href={isPoint ? "/points" : "/points/new"}
          >
            {isPoint ? "Перейти к моим Point" : "Создать Point"}
          </a>
          <a href="/">На главную</a>
        </main>
      </>
    );
  return (
    <>
      <Header
        title={isPoint ? "Регистрация точки" : "Регистрация пользователя"}
      >
        {session && <RegistrationProgress session={session} />}
      </Header>
      <div className={`registration-layout ${isPoint ? "" : "account-layout"}`}>
        <aside className="steps-sidebar">
          <nav className="steps-breadcrumbs" aria-label="Навигационная цепочка">
            <a href={isPoint ? "/points" : "/login"}>
              {isPoint ? "Мои Point" : "Вход"}
            </a>
            <span aria-hidden="true">/</span>
            <span aria-current="page">
              {isPoint ? "Новый Point" : "Регистрация"}
            </span>
          </nav>
          <div className="eyebrow">ВАШ ПУТЬ В POINT</div>
          <div className="steps-progress">
            <div>
              <span>{isPoint ? "Подключение точки" : "Создание аккаунта"}</span>
              <strong>{session?.percent || 0}%</strong>
            </div>
            <progress
              value={session?.percent || 0}
              max={100}
              aria-label="Прогресс регистрации"
            />
          </div>
          {session?.graph.sections
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((s, i) => {
              const questions = session.questions.filter(
                (q) => q.section === s.code,
              );
              const available = questions.filter(
                (q) =>
                  Object.hasOwn(session.answers, q.key) ||
                  q.key === session.next?.key,
              );
              const done =
                questions.length > 0 &&
                questions.every((q) => Object.hasOwn(session.answers, q.key));
              return (
                <div className="step-group" key={s.code}>
                  <button
                    type="button"
                    className={`step step-button ${current?.section === s.code ? "active" : ""} ${done ? "done" : ""}`}
                    aria-current={
                      current?.section === s.code ? "step" : undefined
                    }
                    disabled={available.length === 0 || saving || resume}
                    aria-expanded={
                      available.length > 1
                        ? expandedSection === s.code
                        : undefined
                    }
                    aria-controls={
                      available.length > 1
                        ? `step-questions-${s.code}`
                        : undefined
                    }
                    onClick={() => openQuestion(available[0])}
                  >
                    <span className="step-icon">
                      <StepIcon code={s.code} />
                    </span>
                    <div className="step-copy">
                      <strong>{s.name}</strong>
                      <small>
                        {s.description ||
                          (
                            {
                              schedule: "Дни и часы",
                              photos: "Знакомство с точкой",
                              contact: "На связи с Point",
                            } as Record<string, string>
                          )[s.code]}
                      </small>
                    </div>
                    <span className="step-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </button>
                  {expandedSection === s.code && available.length > 1 && (
                    <div
                      className="step-questions"
                      id={`step-questions-${s.code}`}
                    >
                      {available.map((q) => (
                        <button
                          key={q.key}
                          type="button"
                          className={current?.key === q.key ? "current" : ""}
                          disabled={saving || resume}
                          onClick={() => openQuestion(q)}
                        >
                          {q.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          <button
            type="button"
            className={`step step-button ${session && !current ? "active" : ""}`}
            aria-current={session && !current ? "step" : undefined}
            disabled={!session || !!session.next || saving || resume}
            onClick={() => {
              setEditing(null);
              setExpandedSection(null);
            }}
          >
            <span className="step-icon">
              <StepIcon code="review" />
            </span>
            <div className="step-copy">
              <strong>Проверка</strong>
              <small>
                {isPoint ? "Отправка на модерацию" : "Создание аккаунта"}
              </small>
            </div>
            <span className="step-number">
              {String((session?.graph.sections.length || 0) + 1).padStart(
                2,
                "0",
              )}
            </span>
          </button>
          <div className="sidebar-note">
            <StepIcon code="save" />
            <div>
              Ответы сохраняются автоматически.
              <br />
              Вы можете вернуться позже.
            </div>
          </div>
        </aside>
        <main className="chat-main">
          <div className="chat-intro">
            <div className="chat-brand" aria-hidden="true">
              <AssistantIcon />
            </div>
            <div className="chat-intro-copy">
              <h1>{isPoint ? "Подключение Point" : "Регистрация аккаунта"}</h1>
              <p className="muted">Ваш помощник по регистрации</p>
            </div>
            {session && (
              <span
                className="chat-step-badge"
                aria-label="Прогресс регистрации"
              >
                {Math.min(session.answered + 1, session.questions.length)} /{" "}
                {session.questions.length}
              </span>
            )}
            {isPoint && (
              <button
                className="mobile-preview"
                aria-expanded={preview}
                aria-controls="point-preview"
                onClick={() => setPreview(!preview)}
              >
                Предпросмотр
              </button>
            )}
          </div>
          <ErrorNotice text={error} />
          {!session && !error && <Spinner />}
          {!session && error && (
            <div className="actions">
              <button onClick={() => start()}>Повторить</button>
              <a href="/login">Войти</a>
            </div>
          )}
          {session && resume && (
            <div className="resume card">
              <h2>У вас есть незавершённая регистрация</h2>
              <p>
                Сохранено ответов: {session.answered}. Версия сценария: v
                {session.version}.
              </p>
              <div className="actions">
                <button className="primary" onClick={() => setResume(false)}>
                  <ActionIcon />
                  Продолжить
                </button>
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        "Начать заново? Текущая регистрация будет отменена.",
                      )
                    ) {
                      setResume(false);
                      void start(true);
                    }
                  }}
                >
                  Начать заново
                </button>
              </div>
            </div>
          )}
          {session && !resume && (
            <>
              <div className="timeline">
                {session.questions
                  .filter(
                    (q) =>
                      Object.hasOwn(session.answers, q.key) &&
                      q.key !== editing?.key,
                  )
                  .map((q) => (
                    <div className="exchange" key={q.key}>
                      <div className="assistant-message">
                        <AssistantIcon />
                        <div className="bubble">{q.title}</div>
                      </div>
                      <div className="user-answer">
                        <span className="answer-author">Вы</span>
                        <div className="bubble">
                          <span>{answerLabel(q, session.answers[q.key])}</span>
                        </div>
                        <button
                          className="edit-answer"
                          onClick={() => {
                            setEditing(q);
                            setAnswerError("");
                          }}
                          aria-label={`Изменить: ${q.title}`}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="m16 3 5 5-13 13H3v-5L16 3Z" />
                            <path d="m13 6 5 5" />
                          </svg>
                          Изменить
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
              <div
                ref={bottom}
                className="active-question"
                key={current?.key || "review"}
              >
                <div className="question-position">
                  <span className="question-position-line" aria-hidden="true" />
                  <span>{sectionName || "Проверка"}</span>
                  {current && (
                    <span className="question-position-count">
                      {editing ? "Редактирование · " : ""}
                      {sectionQuestions.findIndex(
                        (q) => q.key === current.key,
                      ) + 1}{" "}
                      из {sectionQuestions.length}
                    </span>
                  )}
                </div>
                {current ? (
                  <div className="assistant-message">
                    <AssistantIcon />
                    <QuestionCard
                      key={current.key}
                      question={current}
                      value={
                        current.type === "PASSWORD"
                          ? undefined
                          : session.answers[current.key]
                      }
                      sessionId={session.id}
                      saving={saving}
                      error={answerError}
                      onClearError={() => setAnswerError("")}
                      onSubmit={submit}
                      onCancel={editing ? () => setEditing(null) : undefined}
                    />
                  </div>
                ) : (
                  <div className="assistant-message">
                    <AssistantIcon />
                    <div className="question-card">
                      <h2>
                        {isPoint
                          ? "Готово. Проверьте информацию о вашем Point."
                          : "Проверьте ваши данные"}
                      </h2>
                      {needsOwnerPhone && (
                        <ContactPhonePrompt
                          onSaved={async () => {
                            await refresh();
                            setError("");
                            setCompletionErrors([]);
                          }}
                        />
                      )}
                      {session.graph.show_review && (
                        <Summary session={session} onEdit={setEditing} />
                      )}
                      <button
                        className="primary"
                        onClick={complete}
                        disabled={saving || needsOwnerPhone}
                      >
                        {saving ? (
                          <Spinner />
                        ) : isPoint ? (
                          "Отправить на проверку"
                        ) : (
                          "Создать аккаунт"
                        )}
                      </button>
                      {completionErrors.length > 0 && (
                        <div
                          ref={completionErrorBlock}
                          className="submission-errors"
                          tabIndex={-1}
                        >
                          <ErrorNotice
                            text={
                              isPoint
                                ? "Не удалось отправить заявку. Исправьте следующие проблемы:"
                                : "Не удалось создать аккаунт. Исправьте следующие проблемы:"
                            }
                            items={completionErrors}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
        {isPoint && session && (
          <aside
            id="point-preview"
            aria-label="Предпросмотр Point"
            className={`preview-sidebar ${preview ? "mobile-open" : ""}`}
          >
            <button
              className="mobile-preview"
              onClick={() => setPreview(false)}
            >
              Закрыть
            </button>
            <PointLivePreview session={session} />
          </aside>
        )}
      </div>
    </>
  );
}
export function DraftPreview({
  versionId,
  onClose,
}: {
  versionId: string;
  onClose: () => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Session>(`/admin/versions/${versionId}/preview`, "POST", {
      answers: {},
    })
      .then(setSession)
      .catch((e) => setError(errorText(e)));
  }, [versionId]);
  async function answer(value: unknown) {
    if (!session?.next) return;
    setBusy(true);
    setError("");
    try {
      setSession(
        await api<Session>(`/admin/versions/${versionId}/preview`, "POST", {
          answers: session.answers,
          key: session.next.key,
          value,
        }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal wide"
        role="dialog"
        aria-modal="true"
        aria-label="Предпросмотр регистрации"
      >
        <div className="page-heading">
          <h2>Предпросмотр регистрации</h2>
          <button onClick={onClose}>Закрыть</button>
        </div>
        <p className="muted">Данные не создают аккаунты и Point.</p>
        <ErrorNotice text={error} />
        {session && (
          <>
            <RegistrationProgress session={session} />
            <Summary session={session} />
            {session.next ? (
              <QuestionCard
                key={session.next.key}
                question={session.next}
                sessionId="preview"
                saving={busy}
                error=""
                onSubmit={answer}
                preview
              />
            ) : (
              <p className="success-text">✓ Сценарий пройден</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
