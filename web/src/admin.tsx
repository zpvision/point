import { useEffect, useState } from "react";
import type { Condition, Graph, Option, Question, Version } from "./types";
import { statusLabel } from "./types";
import { api, errorText } from "./api";
import { AssistantIcon, ErrorNotice, Header } from "./ui";
import { QuestionRenderer } from "./questions";
import { DraftPreview } from "./chat";

export function AdminNav() {
  return (
    <nav className="admin-nav">
      <a href="/points">Мои Point</a>
      <span>Регистрации</span>
      <a href="/admin/scenarios">Сценарии</a>
      <a href="/admin/applications">Заявки Point</a>
    </nav>
  );
}
type Scenario = {
  id: string;
  code: string;
  name: string;
  status: string;
  number: number;
  question_count: number;
  updated_at: string;
  published_at: string;
  current_version_id: string | null;
};
export function ScenarioList() {
  const [items, setItems] = useState<Scenario[]>([]);
  const [error, setError] = useState("");
  const [create, setCreate] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  useEffect(() => {
    api<Scenario[]>("/admin/scenarios")
      .then(setItems)
      .catch((e) => setError(errorText(e)));
  }, []);
  return (
    <>
      <Header title="Администрирование" />
      <AdminNav />
      <main className="page">
        <div className="page-heading">
          <div>
            <div className="eyebrow">РЕГИСТРАЦИИ</div>
            <h1>Сценарии</h1>
            <p className="muted">
              Управляйте вопросами и безопасно публикуйте новые версии.
            </p>
          </div>
          <button className="primary" onClick={() => setCreate(true)}>
            + Новый сценарий
          </button>
        </div>
        <ErrorNotice text={error} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Название / код</th>
                <th>Статус</th>
                <th>Версия</th>
                <th>Вопросы</th>
                <th>Изменён</th>
                <th>Опубликован</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td>
                    <a href={`/admin/scenarios/${s.id}`}>{s.name}</a>
                    <small>{s.code}</small>
                    {!s.current_version_id && (
                      <small className="warning">
                        У сценария нет опубликованной версии
                      </small>
                    )}
                  </td>
                  <td>
                    <span className="badge">
                      {statusLabel[s.status] || "Нет версии"}
                    </span>
                  </td>
                  <td>v{s.number || 0}</td>
                  <td>{s.question_count || 0}</td>
                  <td>
                    {s.updated_at
                      ? new Date(s.updated_at).toLocaleDateString("ru")
                      : "—"}
                  </td>
                  <td>
                    {s.published_at
                      ? new Date(s.published_at).toLocaleDateString("ru")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {create && (
          <div className="modal-backdrop">
            <form
              className="modal"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const result = await api<{ id: string }>(
                    "/admin/scenarios",
                    "POST",
                    { code, name },
                  );
                  location.href = "/admin/scenarios/" + result.id;
                } catch (e) {
                  setError(errorText(e));
                  setCreate(false);
                }
              }}
            >
              <h2>Новый сценарий</h2>
              <label>
                Название
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Код
                <input
                  required
                  placeholder="PARTNER_REGISTRATION"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
              </label>
              <div className="actions">
                <button className="primary">Создать</button>
                <button type="button" onClick={() => setCreate(false)}>
                  Отмена
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </>
  );
}
function OptionEditor({
  options,
  onChange,
}: {
  options: Option[];
  onChange: (v: Option[]) => void;
}) {
  return (
    <section className="editor-section">
      <h3>Варианты ответа</h3>
      {options.map((o, i) => (
        <div className="option-row" key={i}>
          <label>
            Значение
            <input
              value={o.value}
              onChange={(e) =>
                onChange(
                  options.map((v, j) =>
                    j === i ? { ...v, value: e.target.value } : v,
                  ),
                )
              }
            />
          </label>
          <label>
            Текст
            <input
              value={o.label}
              onChange={(e) =>
                onChange(
                  options.map((v, j) =>
                    j === i ? { ...v, label: e.target.value } : v,
                  ),
                )
              }
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={o.enabled}
              onChange={(e) =>
                onChange(
                  options.map((v, j) =>
                    j === i ? { ...v, enabled: e.target.checked } : v,
                  ),
                )
              }
            />
            Вкл.
          </label>
          <button
            type="button"
            aria-label="Переместить вариант вверх"
            disabled={i === 0}
            onClick={() => {
              const next = [...options];
              [next[i - 1], next[i]] = [next[i], next[i - 1]];
              onChange(next);
            }}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="Удалить вариант"
            onClick={() => onChange(options.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([
            ...options,
            {
              value: `option_${options.length + 1}`,
              label: "Новый вариант",
              enabled: true,
            },
          ])
        }
      >
        + Добавить вариант
      </button>
    </section>
  );
}
function ConditionEditor({
  question,
  graph,
  onChange,
}: {
  question: Question;
  graph: Graph;
  onChange: (v: Condition[]) => void;
}) {
  const operators: Record<string, string> = {
    equals: "Равно",
    not_equals: "Не равно",
    contains: "Содержит",
    not_contains: "Не содержит",
    is_empty: "Пусто",
    is_not_empty: "Не пусто",
    greater_than: "Больше",
    less_than: "Меньше",
  };
  return (
    <section className="editor-section">
      <h3>Условия показа</h3>
      <p className="muted">
        В одной группе все условия выполняются вместе (И). Между группами — ИЛИ.
        Источник должен стоять раньше вопроса.
      </p>
      {question.conditions.map((c, i) => {
        const source = graph.questions.find((q) => q.key === c.source);
        const change = (patch: Partial<Condition>) =>
          onChange(
            question.conditions.map((v, j) =>
              j === i ? { ...v, ...patch } : v,
            ),
          );
        return (
          <div className="condition-row" key={i}>
            <label>
              Вопрос
              <select
                value={c.source}
                onChange={(e) => change({ source: e.target.value, value: "" })}
              >
                <option value="">Выберите</option>
                {graph.questions
                  .filter(
                    (q) => q.key !== question.key && q.type !== "PASSWORD",
                  )
                  .map((q) => (
                    <option key={q.key} value={q.key}>
                      {q.title}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Оператор
              <select
                value={c.operator}
                onChange={(e) => change({ operator: e.target.value })}
              >
                {Object.entries(operators).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            {!["is_empty", "is_not_empty"].includes(c.operator) && (
              <label>
                Значение
                {source?.options.length ? (
                  <select
                    value={String(c.value)}
                    onChange={(e) => change({ value: e.target.value })}
                  >
                    <option value="">Выберите</option>
                    {source.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : source &&
                  ["YES_NO", "CHECKBOX", "CONSENT", "CONFIRMATION"].includes(
                    source.type,
                  ) ? (
                  <select
                    value={String(c.value)}
                    onChange={(e) =>
                      change({ value: e.target.value === "true" })
                    }
                  >
                    <option value="">Выберите</option>
                    <option value="true">Да</option>
                    <option value="false">Нет</option>
                  </select>
                ) : (
                  <input
                    type={source?.type === "NUMBER" ? "number" : "text"}
                    value={String(c.value ?? "")}
                    onChange={(e) =>
                      change({
                        value:
                          source?.type === "NUMBER"
                            ? Number(e.target.value)
                            : e.target.value,
                      })
                    }
                  />
                )}
              </label>
            )}
            <label>
              Группа
              <input
                type="number"
                min="0"
                value={c.group}
                onChange={(e) => change({ group: Number(e.target.value) })}
              />
            </label>
            <button
              type="button"
              onClick={() =>
                onChange(question.conditions.filter((_, j) => i !== j))
              }
            >
              Удалить условие
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() =>
          onChange([
            ...question.conditions,
            { source: "", operator: "equals", value: "", group: 0 },
          ])
        }
      >
        + Условие
      </button>
    </section>
  );
}
function QuestionEditor({
  question: q,
  graph,
  types,
  bindings,
  onChange,
}: {
  question: Question;
  graph: Graph;
  types: string[];
  bindings: Record<string, string[]>;
  onChange: (v: Question) => void;
}) {
  const set = (patch: Partial<Question>) => onChange({ ...q, ...patch });
  return (
    <div className="question-editor">
      <h2>Настройки вопроса</h2>
      <label>
        Текст вопроса
        <textarea
          value={q.title}
          onChange={(e) => set({ title: e.target.value })}
        />
      </label>
      <label>
        Описание / подсказка
        <textarea
          value={q.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </label>
      <div className="form-grid">
        <label>
          Тип
          <select
            value={q.type}
            onChange={(e) => set({ type: e.target.value })}
          >
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Раздел
          <select
            value={q.section}
            onChange={(e) => set({ section: e.target.value })}
          >
            {graph.sections.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={q.required}
            onChange={(e) => set({ required: e.target.checked })}
          />
          Обязательный
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={q.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
          />
          Включён
        </label>
      </div>
      <label>
        Placeholder
        <input
          value={q.placeholder}
          onChange={(e) => set({ placeholder: e.target.value })}
        />
      </label>
      {["SINGLE_SELECT", "MULTI_SELECT"].includes(q.type) && (
        <OptionEditor
          options={q.options}
          onChange={(options) => set({ options })}
        />
      )}
      {["PHOTO_UPLOAD", "FILE_UPLOAD"].includes(q.type) && (
        <section className="editor-section">
          <h3>Настройки загрузки</h3>
          <label>
            Максимум файлов
            <input
              type="number"
              min="1"
              max="30"
              value={q.settings.max_files || 8}
              onChange={(e) =>
                set({
                  settings: {
                    ...q.settings,
                    max_files: Number(e.target.value),
                  },
                })
              }
            />
          </label>
          <OptionEditor
            options={q.settings.categories || []}
            onChange={(categories) =>
              set({ settings: { ...q.settings, categories } })
            }
          />
          <label>
            Обязательные категории (value через запятую)
            <input
              value={q.settings.required_categories?.join(",") || ""}
              onChange={(e) =>
                set({
                  settings: {
                    ...q.settings,
                    required_categories: e.target.value
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean),
                  },
                })
              }
            />
          </label>
        </section>
      )}
      <details className="advanced">
        <summary>Дополнительные настройки</summary>
        <label>
          Internal name
          <input
            value={q.internal_name}
            onChange={(e) => set({ internal_name: e.target.value })}
          />
        </label>
        <label>
          Question key
          <input value={q.key} onChange={(e) => set({ key: e.target.value })} />
          <small>
            Стабильный ключ: латиница, цифры, _. Изменение ключа обновляет
            ссылки условий в черновике.
          </small>
        </label>
        <label>
          Binding
          <select
            value={q.binding}
            onChange={(e) => set({ binding: e.target.value })}
          >
            <option value="">CUSTOM · без привязки</option>
            {Object.entries(bindings)
              .filter(([, v]) => v.includes(q.type))
              .map(([b]) => (
                <option key={b}>{b}</option>
              ))}
          </select>
        </label>
        <div className="form-grid">
          {(["min", "max", "min_length", "max_length"] as const).map(
            (key, i) => (
              <label key={key}>
                {
                  [
                    "Минимальное число",
                    "Максимальное число",
                    "Минимальная длина",
                    "Максимальная длина",
                  ][i]
                }
                <input
                  type="number"
                  value={q.validation[key] ?? ""}
                  onChange={(e) =>
                    set({
                      validation: {
                        ...q.validation,
                        [key]:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
            ),
          )}
        </div>
        <ConditionEditor
          question={q}
          graph={graph}
          onChange={(conditions) => set({ conditions })}
        />
        <label>
          Заметка администратора
          <textarea
            value={q.admin_note || ""}
            onChange={(e) => set({ admin_note: e.target.value })}
          />
        </label>
      </details>
    </div>
  );
}
export function ScenarioEditor({ id }: { id: string }) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [version, setVersion] = useState<Version | null>(null);
  const [selected, setSelected] = useState("");
  const [registry, setRegistry] = useState<{
    types: string[];
    bindings: Record<string, string[]>;
  }>({ types: [], bindings: {} });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [publish, setPublish] = useState(false);
  const [previewValue, setPreviewValue] = useState<unknown>();
  const [scenario, setScenario] = useState<Scenario | null>(null);
  async function load() {
    try {
      const [vs, reg, scenarios] = await Promise.all([
        api<Version[]>(`/admin/scenarios/${id}`),
        api<typeof registry>("/admin/registry"),
        api<Scenario[]>("/admin/scenarios"),
      ]);
      setVersions(vs);
      setVersion(vs[0]);
      setSelected(vs[0]?.graph.questions[0]?.key || "");
      setRegistry(reg);
      setScenario(scenarios.find((s) => s.id === id) || null);
      setDirty(false);
    } catch (e) {
      setError(errorText(e));
    }
  }
  useEffect(() => {
    void load();
  }, [id]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  useEffect(() => setPreviewValue(undefined), [selected]);
  if (!version)
    return (
      <>
        <Header title="Конструктор сценария" />
        <AdminNav />
        <main className="page">
          <ErrorNotice text={error} />
        </main>
      </>
    );
  const graph = version.graph;
  const readonly = version.status !== "DRAFT";
  const q = graph.questions.find((q) => q.key === selected);
  function update(g: Graph) {
    if (!version || readonly) return;
    setVersion({ ...version, graph: g });
    setDirty(true);
  }
  async function save() {
    if (!version) return false;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ revision: number }>(
        `/admin/versions/${version.id}`,
        "PUT",
        { graph: version.graph, revision: version.revision },
      );
      setVersion({ ...version, revision: result.revision });
      setDirty(false);
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  function changeQuestion(next: Question) {
    if (!q) return;
    update({
      ...graph,
      questions: graph.questions.map((v) =>
        v.key === q.key
          ? next
          : {
              ...v,
              conditions: v.conditions.map((c) =>
                c.source === q.key ? { ...c, source: next.key } : c,
              ),
            },
      ),
    });
    setSelected(next.key);
  }
  function moveQuestion(key: string, target: string) {
    const list = graph.questions.slice().sort((a, b) => a.order - b.order);
    const from = list.findIndex((q) => q.key === key);
    const to = list.findIndex((q) => q.key === target);
    if (from < 0 || to < 0 || from === to) return;
    const [item] = list.splice(from, 1);
    item.section = graph.questions.find((q) => q.key === target)!.section;
    list.splice(to, 0, item);
    update({ ...graph, questions: list.map((q, i) => ({ ...q, order: i })) });
  }
  function newQuestion(copy?: Question) {
    let key = copy
      ? copy.key + "_copy"
      : "question_" + (graph.questions.length + 1);
    while (graph.questions.some((q) => q.key === key)) key += "_2";
    const next: Question = copy
      ? {
          ...structuredClone(copy),
          key,
          binding: "",
          order: graph.questions.length,
        }
      : {
          key,
          internal_name: "",
          title: "Новый вопрос",
          description: "",
          type: "TEXT",
          required: false,
          enabled: true,
          section: graph.sections[0]?.code || "",
          order: graph.questions.length,
          placeholder: "",
          binding: "",
          options: [],
          conditions: [],
          validation: {},
          settings: {},
        };
    update({ ...graph, questions: [...graph.questions, next] });
    setSelected(key);
  }
  return (
    <>
      <Header title="Конструктор сценария" />
      <AdminNav />
      <div className="editor-toolbar">
        <div>
          <h1>{scenario?.name || "Сценарий"}</h1>
          <span className="muted">
            {scenario?.code} · v{version.number} · {statusLabel[version.status]}
            {dirty ? " · есть несохранённые изменения" : ""}
          </span>
        </div>
        <div className="actions">
          <select
            aria-label="История версий"
            value={version.id}
            onChange={(e) => {
              if (
                dirty &&
                !confirm("Перейти к версии без сохранения изменений?")
              )
                return;
              const v = versions.find((v) => v.id === e.target.value)!;
              setVersion(v);
              setSelected(v.graph.questions[0]?.key || "");
              setDirty(false);
            }}
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.number} · {statusLabel[v.status]}
              </option>
            ))}
          </select>
          {readonly ? (
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                try {
                  await api(`/admin/scenarios/${id}/draft`, "POST", {});
                  await load();
                } catch (e) {
                  setError(errorText(e));
                }
              }}
            >
              Создать / открыть черновик
            </button>
          ) : (
            <>
              <button disabled={busy} onClick={save}>
                Сохранить
              </button>
              <button
                disabled={busy}
                onClick={async () => {
                  if (!dirty || (await save())) setPreview(true);
                }}
              >
                Предпросмотр регистрации
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  if (!dirty || (await save())) setPublish(true);
                }}
              >
                Опубликовать
              </button>
            </>
          )}
        </div>
      </div>
      <div className="editor-error">
        <ErrorNotice text={error} />
      </div>
      <div className="scenario-layout">
        <aside className="scenario-structure">
          <h3>Структура вопросов</h3>
          {graph.sections
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((section, si) => (
              <section
                key={section.code}
                draggable={!readonly}
                onDragStart={(e) => {
                  e.dataTransfer.setData("section", section.code);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const code = e.dataTransfer.getData("section");
                  if (!code) return;
                  const sections = [...graph.sections].sort(
                    (a, b) => a.order - b.order,
                  );
                  const index = sections.findIndex((s) => s.code === code);
                  if (index < 0) return;
                  const [item] = sections.splice(index, 1);
                  sections.splice(si, 0, item);
                  update({
                    ...graph,
                    sections: sections.map((s, i) => ({ ...s, order: i })),
                  });
                }}
              >
                <div className="section-name">
                  {section.name}
                  {!readonly && (
                    <button
                      title="Редактировать раздел"
                      onClick={() => {
                        const name = prompt("Название раздела", section.name);
                        if (name) {
                          const description = prompt(
                            "Описание раздела",
                            section.description,
                          );
                          update({
                            ...graph,
                            sections: graph.sections.map((s) =>
                              s.code === section.code
                                ? {
                                    ...s,
                                    name,
                                    description: description ?? s.description,
                                  }
                                : s,
                            ),
                          });
                        }
                      }}
                    >
                      ✎
                    </button>
                  )}
                </div>
                {graph.questions
                  .filter((q) => q.section === section.code)
                  .sort((a, b) => a.order - b.order)
                  .map((q, i, qs) => (
                    <div
                      key={q.key}
                      className={`structure-question ${q.key === selected ? "active" : ""}`}
                      draggable={!readonly}
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.setData("question", q.key);
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        moveQuestion(e.dataTransfer.getData("question"), q.key);
                      }}
                    >
                      <button onClick={() => setSelected(q.key)}>
                        <span className="drag-handle">⠿</span>
                        {q.enabled ? "" : "○ "}
                        {q.title}
                      </button>
                      {!readonly && i > 0 && (
                        <button
                          aria-label="Переместить вопрос вверх"
                          onClick={() => moveQuestion(q.key, qs[i - 1].key)}
                        >
                          ↑
                        </button>
                      )}
                    </div>
                  ))}
              </section>
            ))}
          {!readonly && (
            <div className="stack">
              <button onClick={() => newQuestion()}>+ Добавить вопрос</button>
              <button
                onClick={() => {
                  const name = prompt("Название раздела");
                  if (name)
                    update({
                      ...graph,
                      sections: [
                        ...graph.sections,
                        {
                          code: "section_" + Date.now(),
                          name,
                          description: "",
                          order: graph.sections.length,
                        },
                      ],
                    });
                }}
              >
                + Добавить раздел
              </button>
            </div>
          )}
        </aside>
        <main className="editor-main">
          <fieldset disabled={readonly}>
            <label className="check">
              <input
                type="checkbox"
                checked={graph.show_review}
                onChange={(e) =>
                  update({ ...graph, show_review: e.target.checked })
                }
              />
              Показывать итоговую проверку перед отправкой
            </label>
            {q ? (
              <>
                <QuestionEditor
                  question={q}
                  graph={graph}
                  types={registry.types}
                  bindings={registry.bindings}
                  onChange={changeQuestion}
                />
                <div className="actions">
                  <button onClick={() => newQuestion(q)}>Дублировать</button>
                  <button
                    onClick={() =>
                      changeQuestion({ ...q, enabled: !q.enabled })
                    }
                  >
                    {q.enabled ? "Отключить" : "Включить"}
                  </button>
                  <button
                    className="danger"
                    onClick={() => {
                      const refs = graph.questions.filter((v) =>
                        v.conditions.some((c) => c.source === q.key),
                      );
                      if (refs.length) {
                        setError(
                          "На вопрос ссылаются условия: " +
                            refs.map((q) => q.title).join(", ") +
                            ". Сначала измените условия.",
                        );
                        return;
                      }
                      if (confirm("Удалить вопрос из черновика?")) {
                        update({
                          ...graph,
                          questions: graph.questions.filter(
                            (v) => v.key !== q.key,
                          ),
                        });
                        setSelected("");
                      }
                    }}
                  >
                    Удалить
                  </button>
                </div>
              </>
            ) : (
              <p className="muted">Выберите или создайте вопрос.</p>
            )}
          </fieldset>
        </main>
        <aside className="question-preview">
          <div className="eyebrow">КАК ЭТО ВЫГЛЯДИТ В ЧАТЕ</div>
          {q && (
            <div className="assistant-message">
              <AssistantIcon />
              <div className="question-card">
                <h2>{q.title}</h2>
                <p className="muted">{q.description}</p>
                <QuestionRenderer
                  key={q.key + q.type}
                  question={q}
                  value={previewValue}
                  onChange={setPreviewValue}
                  sessionId="preview"
                  preview
                />
                <button className="primary" disabled>
                  Продолжить →
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
      {preview && (
        <DraftPreview
          versionId={version.id}
          onClose={() => setPreview(false)}
        />
      )}
      {publish && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Публикация сценария"
          >
            <h2>Опубликовать сценарий?</h2>
            <p>{scenario?.code}</p>
            <p>
              Новая версия: <strong>v{version.number}</strong> ·{" "}
              {graph.questions.length} вопросов
            </p>
            <p className="muted">
              Новые регистрации получат эту версию. Начатые регистрации
              продолжат свою версию.
            </p>
            <div className="actions">
              <button onClick={() => setPublish(false)}>Отмена</button>
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api(`/admin/versions/${version.id}/publish`, "POST", {
                      revision: version.revision,
                    });
                    setPublish(false);
                    await load();
                  } catch (e) {
                    setError(errorText(e));
                    setPublish(false);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Опубликовать
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
