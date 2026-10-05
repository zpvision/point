import { useEffect, useState } from "react";
import type {
  Address,
  Day,
  FileRef,
  Organization,
  Question,
  Schedule,
} from "./types";
import { api, errorText, uploadFile } from "./api";
import { AddressMapQuestion } from "./maps";
import { ErrorNotice, useApp } from "./ui";

export const weekdays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
const dayNames = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];
export function defaultSchedule(): Schedule {
  return {
    days: Object.fromEntries(
      weekdays.map((d, i) => [
        d,
        {
          enabled: i < 5,
          opening_time: "09:00",
          closing_time: "19:00",
          break_enabled: false,
          break_from: "13:00",
          break_to: "14:00",
        },
      ]),
    ),
  };
}
export function scheduleLines(schedule?: Schedule): string[] {
  if (!schedule?.days) return [];
  const groups: { start: number; end: number; text: string }[] = [];
  weekdays.forEach((d, i) => {
    const day = schedule.days[d];
    const text = !day?.enabled
      ? "выходной"
      : `${day.opening_time}–${day.closing_time}${day.break_enabled ? ` · перерыв ${day.break_from}–${day.break_to}` : ""}`;
    const prev = groups.at(-1);
    if (prev && prev.text === text) prev.end = i;
    else groups.push({ start: i, end: i, text });
  });
  return groups.map(
    (g) =>
      `${dayNames[g.start]}${g.end > g.start ? "–" + dayNames[g.end] : ""} ${g.text}`,
  );
}
function ContactOwnerHint({
  question,
  value,
}: Pick<ControlProps, "question" | "value">) {
  const { user } = useApp();
  if (
    question.binding !== "point.contact_is_owner" ||
    (value !== "SELF" && value !== true) ||
    !user
  )
    return null;
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return (
    <p className="contact-owner-hint" role="status">
      Контактное лицо: <strong>{name || user.email}</strong>
    </p>
  );
}
export function ChoiceChips({ question, value, onChange }: ControlProps) {
  const multiple = question.type === "MULTI_SELECT";
  const selected = multiple
    ? Array.isArray(value)
      ? (value as string[])
      : []
    : [value];
  return (
    <>
      <div className="choices" role="group" aria-label={question.title}>
        {question.options
          .filter((o) => o.enabled)
          .map((o) => (
            <button
              type="button"
              aria-pressed={selected.includes(o.value)}
              className={selected.includes(o.value) ? "selected" : ""}
              key={o.value}
              onClick={() =>
                onChange(
                  multiple
                    ? selected.includes(o.value)
                      ? selected.filter((v) => v !== o.value)
                      : [...selected, o.value]
                    : o.value,
                )
              }
            >
              {o.label}
            </button>
          ))}
      </div>
      <ContactOwnerHint question={question} value={value} />
    </>
  );
}
export function ScheduleQuestion({
  value,
  onChange,
}: {
  value?: Schedule;
  onChange: (v: Schedule) => void;
}) {
  const schedule = value || defaultSchedule();
  useEffect(() => {
    if (!value) onChange(schedule);
  }, []);
  function set(day: string, next: Partial<Day>) {
    onChange({
      days: { ...schedule.days, [day]: { ...schedule.days[day], ...next } },
    });
  }
  return (
    <div className="schedule">
      <button
        type="button"
        className="text-button"
        onClick={() =>
          onChange({
            days: {
              ...schedule.days,
              ...Object.fromEntries(
                weekdays
                  .slice(1, 5)
                  .map((d) => [d, { ...schedule.days.monday }]),
              ),
            },
          })
        }
      >
        Пн–Пт одинаково
      </button>
      {weekdays.map((d, i) => (
        <div className="schedule-day" key={d}>
          <div className="schedule-row">
            <label className="check">
              <input
                type="checkbox"
                checked={schedule.days[d].enabled}
                onChange={(e) => set(d, { enabled: e.target.checked })}
              />
              {dayNames[i]}
            </label>
            {schedule.days[d].enabled ? (
              <>
                <input
                  aria-label={`${dayNames[i]} открытие`}
                  type="time"
                  value={schedule.days[d].opening_time}
                  onChange={(e) => set(d, { opening_time: e.target.value })}
                />
                <span>—</span>
                <input
                  aria-label={`${dayNames[i]} закрытие`}
                  type="time"
                  value={schedule.days[d].closing_time}
                  onChange={(e) => set(d, { closing_time: e.target.value })}
                />
                {i > 0 && (
                  <button
                    type="button"
                    title="Скопировать предыдущий день"
                    aria-label={`Скопировать предыдущий день для ${dayNames[i]}`}
                    onClick={() => set(d, schedule.days[weekdays[i - 1]])}
                  >
                    ↥
                  </button>
                )}
              </>
            ) : (
              <span className="muted">Выходной</span>
            )}
          </div>
          {schedule.days[d].enabled && (
            <details>
              <summary>Перерыв</summary>
              <label className="check">
                <input
                  type="checkbox"
                  checked={schedule.days[d].break_enabled}
                  onChange={(e) => set(d, { break_enabled: e.target.checked })}
                />
                Есть перерыв
              </label>
              {schedule.days[d].break_enabled && (
                <div className="actions">
                  <input
                    aria-label={`${dayNames[i]} начало перерыва`}
                    type="time"
                    value={schedule.days[d].break_from}
                    onChange={(e) => set(d, { break_from: e.target.value })}
                  />
                  <input
                    aria-label={`${dayNames[i]} конец перерыва`}
                    type="time"
                    value={schedule.days[d].break_to}
                    onChange={(e) => set(d, { break_to: e.target.value })}
                  />
                </div>
              )}
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
function InnLookupQuestion({
  value,
  onChange,
}: {
  value?: Organization;
  onChange: (v: Organization) => void;
}) {
  const empty: Organization = {
    inn: "",
    kpp: "",
    ogrn: "",
    ogrnip: "",
    short_name: "",
    full_name: "",
    legal_address: "",
    director_name: "",
    entity_type: "",
    confirmed: false,
  };
  const [draft, setDraft] = useState(value || empty);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(!!value);
  const [found, setFound] = useState(false);
  const [existing, setExisting] = useState<Organization[]>([]);
  useEffect(() => {
    api<Organization[]>("/organizations")
      .then(setExisting)
      .catch(() => {});
  }, []);
  function update(v: Organization) {
    setDraft(v);
    onChange({ ...v, confirmed: false });
  }
  async function lookup() {
    setBusy(true);
    setError("");
    try {
      const org = await api<Organization>("/organization-lookup", "POST", {
        inn: draft.inn,
      });
      setDraft(org);
      onChange({ ...org, confirmed: false });
      setFound(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setOpen(true);
      setBusy(false);
    }
  }
  return (
    <div>
      {existing.length > 0 && (
        <label>
          Использовать организацию
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                const org = existing[Number(e.target.value)];
                setDraft(org);
                onChange({ ...org, confirmed: false });
                setOpen(true);
              }
            }}
          >
            <option value="">Добавить другую организацию</option>
            {existing.map((o, i) => (
              <option value={i} key={o.inn}>
                {o.short_name} · {o.inn}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        ИНН
        <input
          inputMode="numeric"
          value={draft.inn}
          onChange={(e) => {
            update({ ...empty, inn: e.target.value });
            setFound(false);
          }}
        />
      </label>
      <div className="actions">
        <button type="button" onClick={lookup} disabled={busy}>
          {busy ? "Поиск…" : "Найти организацию"}
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => setOpen(true)}
        >
          Заполнить вручную
        </button>
      </div>
      <ErrorNotice text={error} />
      {open && (
        <div className="organization-card">
          <h3>{found ? "Нашли организацию" : "Реквизиты организации"}</h3>
          <div className="form-grid">
            {(
              [
                "short_name",
                "full_name",
                ...(draft.inn.length === 12 ? ["ogrnip"] : ["kpp", "ogrn"]),
                "legal_address",
                "director_name",
              ] as (keyof Organization)[]
            ).map((k) => (
              <label key={k}>
                {
                  {
                    short_name: "Название / ФИО ИП",
                    full_name: "Полное название",
                    kpp: "КПП",
                    ogrn: "ОГРН",
                    ogrnip: "ОГРНИП",
                    legal_address: "Юридический адрес",
                    director_name: "ФИО руководителя / ИП",
                  }[k as string as "short_name"]
                }
                <input
                  value={String(draft[k] || "")}
                  onChange={(e) => update({ ...draft, [k]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <p>Это ваша организация?</p>
          <div className="actions">
            <button
              type="button"
              className={`confirm-button${value?.confirmed ? " is-confirmed" : ""}`}
              aria-pressed={Boolean(value?.confirmed)}
              onClick={() => onChange({ ...draft, confirmed: true })}
            >
              {value?.confirmed ? "✓ Подтверждено" : "Да, всё верно"}
            </button>
            <button
              type="button"
              className="edit-button"
              onClick={() => update({ ...draft, confirmed: false })}
            >
              Нет, изменить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function UploadQuestion({
  question,
  value,
  onChange,
  sessionId,
  preview,
}: ControlProps) {
  const refs = Array.isArray(value) ? (value as FileRef[]) : [];
  const categories = question.settings.categories || [];
  const [category, setCategory] = useState(categories[0]?.value || "");
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadingCategory, setUploadingCategory] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<{ file: File; category: string } | null>(
    null,
  );
  useEffect(() => {
    if (preview) return;
    let active = true;
    api<(FileRef & { question_key: string })[]>(
      `/registration/sessions/${sessionId}/attachments`,
    )
      .then((files) => {
        if (active)
          onChange(
            files
              .filter((f) => f.question_key === question.key)
              .map((f) => ({ id: f.id, category: f.category })),
          );
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [sessionId, question.key, preview]);
  async function send(file: File, selectedCategory: string) {
    setError("");
    if (file.size === 0 || file.size > 15 * 1024 * 1024) {
      setError("Файл пустой или больше 15 МБ");
      return;
    }
    setRetry({ file, category: selectedCategory });
    setUploadingCategory(selectedCategory);
    setProgress(0);
    try {
      const ref = await uploadFile(
        sessionId,
        question.key,
        selectedCategory,
        file,
        setProgress,
      );
      onChange([...refs, ref]);
      setRetry(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setProgress(null);
      setUploadingCategory("");
    }
  }
  return (
    <div>
      {question.type === "PHOTO_UPLOAD" && categories.length > 0 ? (
        <div className="photo-category-grid">
          {categories
            .filter((item) => item.enabled)
            .map((item) => {
              const categoryRefs = refs.filter(
                (ref) => ref.category === item.value,
              );
              const required =
                question.settings.required_categories?.includes(item.value) ||
                false;
              return (
                <section
                  className={`photo-category-card${required ? " required" : ""}${categoryRefs.length ? " complete" : ""}`}
                  key={item.value}
                  aria-label={`${item.label}${required ? ", обязательное фото" : ", дополнительное фото"}`}
                >
                  <div className="photo-category-heading">
                    <strong>{item.label}</strong>
                    <span
                      className={required ? "photo-required" : "photo-optional"}
                    >
                      {required ? "Обязательно" : "По желанию"}
                    </span>
                  </div>
                  {categoryRefs.length ? (
                    <div className="photo-category-files">
                      {categoryRefs.map((ref) => (
                        <div className="photo-category-file" key={ref.id}>
                          <img
                            src={`/api/attachments/${ref.id}`}
                            alt={item.label}
                            onLoad={(event) =>
                              event.currentTarget.classList.add("loaded")
                            }
                          />
                          <button
                            type="button"
                            disabled={preview || progress !== null}
                            aria-label={`Удалить фото: ${item.label}`}
                            onClick={async () => {
                              try {
                                await api(`/attachments/${ref.id}`, "DELETE");
                                onChange(
                                  refs.filter((file) => file.id !== ref.id),
                                );
                              } catch (e) {
                                setError(errorText(e));
                              }
                            }}
                          >
                            Удалить
                          </button>
                        </div>
                      ))}
                      <small className="photo-uploaded">✓ Фото добавлено</small>
                    </div>
                  ) : (
                    <p className="photo-category-empty">
                      Фото ещё не добавлено
                    </p>
                  )}
                  <label
                    className={`photo-pick-button${preview || progress !== null ? " disabled" : ""}`}
                  >
                    <input
                      className="sr-only"
                      type="file"
                      accept=".jpg,.jpeg,.png"
                      disabled={preview || progress !== null}
                      aria-label={`Выбрать фото: ${item.label}`}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void send(file, item.value);
                        e.target.value = "";
                      }}
                    />
                    <span className="photo-pick-icon" aria-hidden="true">
                      +
                    </span>
                    <span>
                      {categoryRefs.length
                        ? "Добавить ещё фото"
                        : "Выбрать фото"}
                    </span>
                  </label>
                  {uploadingCategory === item.value && progress !== null && (
                    <div className="photo-progress" aria-live="polite">
                      <progress value={progress} max={100} /> Загрузка{" "}
                      {progress}%
                    </div>
                  )}
                </section>
              );
            })}
          <p className="photo-upload-hint">JPEG или PNG · до 15 МБ на фото</p>
        </div>
      ) : preview ? (
        <p className="muted">
          В предпросмотре файлы не загружаются. При прохождении регистрации
          здесь доступны загрузка и миниатюры.
        </p>
      ) : (
        <>
          <div className="upload-grid">
            {refs.map((ref) => (
              <div className="upload-item" key={ref.id}>
                {question.type === "PHOTO_UPLOAD" ? (
                  <img
                    src={`/api/attachments/${ref.id}`}
                    alt={
                      categories.find((c) => c.value === ref.category)?.label ||
                      "Фото Point"
                    }
                  />
                ) : (
                  <a href={`/api/attachments/${ref.id}`}>Документ</a>
                )}
                <small>
                  {categories.find((c) => c.value === ref.category)?.label}
                </small>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await api(`/attachments/${ref.id}`, "DELETE");
                      onChange(refs.filter((f) => f.id !== ref.id));
                    } catch (e) {
                      setError(errorText(e));
                    }
                  }}
                >
                  Удалить
                </button>
              </div>
            ))}
          </div>
          {categories.length > 0 && (
            <label>
              Категория
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {categories
                  .filter((c) => c.enabled)
                  .map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                      {question.settings.required_categories?.includes(c.value)
                        ? " · обязательно"
                        : ""}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="upload-zone">
            + Выберите{" "}
            {question.type === "PHOTO_UPLOAD" ? "фотографию" : "файл"}
            <input
              type="file"
              disabled={progress !== null}
              accept={
                question.type === "PHOTO_UPLOAD"
                  ? ".jpg,.jpeg,.png"
                  : ".jpg,.jpeg,.png,.pdf"
              }
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void send(f, category);
                e.target.value = "";
              }}
            />
            <small>
              JPEG, PNG{question.type === "FILE_UPLOAD" ? ", PDF" : ""} · до 15
              МБ
            </small>
          </label>
          {progress !== null && (
            <div aria-live="polite">
              <progress value={progress} max={100} /> {progress}%
            </div>
          )}
          {retry && progress === null && (
            <button
              type="button"
              onClick={() => send(retry.file, retry.category)}
            >
              Повторить загрузку
            </button>
          )}
        </>
      )}
      {question.type === "PHOTO_UPLOAD" &&
        retry &&
        progress === null &&
        !preview && (
          <button
            type="button"
            onClick={() => send(retry.file, retry.category)}
          >
            Повторить загрузку:{" "}
            {categories.find((item) => item.value === retry.category)?.label ||
              "фото"}
          </button>
        )}
      <ErrorNotice text={error} />
    </div>
  );
}
export type ControlProps = {
  question: Question;
  value: unknown;
  onChange: (value: any) => void;
  sessionId: string;
  preview?: boolean;
  confirmationAttempt?: number;
};
export function QuestionRenderer(props: ControlProps) {
  const { question: q, value, onChange } = props;
  switch (q.type) {
    case "SINGLE_SELECT":
    case "MULTI_SELECT":
      return <ChoiceChips {...props} />;
    case "YES_NO":
      return (
        <>
          <div className="choices" role="group" aria-label={q.title}>
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                aria-pressed={value === v}
                className={value === v ? "selected" : ""}
                onClick={() => onChange(v)}
              >
                {v ? "Да" : "Нет"}
              </button>
            ))}
          </div>
          <ContactOwnerHint question={q} value={value} />
        </>
      );
    case "CONSENT":
    case "CHECKBOX":
    case "CONFIRMATION":
      return (
        <label className="check">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
          {q.type === "CONSENT" ? q.title : "Подтверждаю"}
        </label>
      );
    case "INFO":
      return (
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`confirm-button${value === true ? " is-confirmed" : ""}`}
          aria-pressed={value === true}
        >
          {value === true ? "✓ Понятно" : "Понятно"}
        </button>
      );
    case "SCHEDULE":
      return (
        <ScheduleQuestion
          value={value as Schedule | undefined}
          onChange={onChange}
        />
      );
    case "ADDRESS_MAP":
      return (
        <AddressMapQuestion
          value={value as Address | undefined}
          onChange={onChange}
          confirmationAttempt={props.confirmationAttempt}
        />
      );
    case "INN_LOOKUP":
      return (
        <InnLookupQuestion
          value={value as Organization | undefined}
          onChange={onChange}
        />
      );
    case "PHOTO_UPLOAD":
    case "FILE_UPLOAD":
      return <UploadQuestion {...props} />;
    case "TEXTAREA":
      return (
        <label className="sr-label">
          {q.title}
          <textarea
            placeholder={q.placeholder || "Введите ответ…"}
            value={String(value || "")}
            maxLength={q.validation.max_length || 4000}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      );
    default: {
      const type: Record<string, string> = {
        PHONE: "tel",
        EMAIL: "email",
        PASSWORD: "password",
        NUMBER: "number",
        DATE: "date",
        TIME: "time",
      };
      return (
        <label className="sr-label">
          {q.title}
          <input
            type={type[q.type] || "text"}
            autoComplete={
              q.type === "PASSWORD"
                ? "new-password"
                : q.type === "EMAIL"
                  ? "email"
                  : "off"
            }
            placeholder={
              q.placeholder ||
              (q.type === "PHONE" ? "+7 999 123-45-67" : "Введите ответ…")
            }
            value={value === undefined || value === null ? "" : String(value)}
            min={q.validation.min}
            max={q.validation.max}
            maxLength={
              q.validation.max_length || (q.type === "PASSWORD" ? 72 : 4000)
            }
            onChange={(e) =>
              onChange(
                q.type === "NUMBER" && e.target.value !== ""
                  ? Number(e.target.value)
                  : e.target.value,
              )
            }
          />
        </label>
      );
    }
  }
}
export function answerLabel(q: Question, value: unknown): string {
  if (q.type === "PASSWORD") return "••••••••";
  if (value === null || value === undefined || value === "") return "Пропущено";
  if (q.type === "ADDRESS_MAP") return (value as Address).address;
  if (q.type === "INN_LOOKUP") {
    const o = value as Organization;
    return `${o.short_name} · ИНН ${o.inn}`;
  }
  if (q.type === "SCHEDULE") return scheduleLines(value as Schedule).join("\n");
  if (q.type === "PHOTO_UPLOAD" || q.type === "FILE_UPLOAD")
    return `${(value as FileRef[]).length} файл(а)`;
  if (Array.isArray(value))
    return value
      .map((v) => q.options.find((o) => o.value === v)?.label || String(v))
      .join(", ");
  if (typeof value === "boolean")
    return value ? (q.type === "CONSENT" ? "Согласие принято" : "Да") : "Нет";
  return q.options.find((o) => o.value === value)?.label || String(value);
}
