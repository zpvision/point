"use client";
import { useEffect, useRef, useState } from "react";
import {
  capacity,
  daysInMonth,
  planSchema,
  PointPlan,
} from "@/lib/point-operations";
const money = (v: number) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(
    v / 100,
  );
const currentMonth = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
const defaults = (pointId: string, month: string): PointPlan => ({
  pointId,
  month,
  workingDays: Math.min(22, daysInMonth(month)),
  acceptPerDay: 20,
  issuePerDay: 20,
  storageSlots: 50,
  averageStorageDays: 3,
});
async function request(url: string, options?: RequestInit) {
  const r = await fetch(url, options);
  const b: any = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(
      b.error || "Не удалось загрузить данные. Повторите попытку.",
    );
  return b;
}
type Data = {
  totals: { accrued: number; paid: number; balance: number };
  period: { issued: number; accrued: number; paid: number };
  events: {
    id: string;
    kind: string;
    reference: string;
    amount_kopecks: number;
    occurred_at: string;
  }[];
};
export default function Operations({ pointId }: { pointId: string }) {
  const [month, setMonth] = useState(currentMonth),
    [data, setData] = useState<Data | null>(null),
    [plan, setPlan] = useState<PointPlan>(() =>
      defaults(pointId, currentMonth()),
    ),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState(""),
    [revision, setRevision] = useState(0);
  const active = useRef("");
  active.current = pointId + ":" + month;
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    setError("");
    setMessage("");
    const query = new URLSearchParams({ pointId, month });
    Promise.all([
      request("/api/cabinet/operations?" + query),
      request("/api/cabinet/plans?" + query),
    ])
      .then(([d, p]) => {
        if (cancelled) return;
        setData(d);
        setPlan(p.plan || defaults(pointId, month));
        setMessage(
          p.plan
            ? "Сохранённый план загружен"
            : "Начальные значения для примера. Измените их под возможности точки.",
        );
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pointId, month, revision]);
  const estimate = capacity(plan),
    valid = planSchema.safeParse(plan).success;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    const key = active.current;
    try {
      await request("/api/cabinet/plans", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan),
      });
      if (active.current === key)
        setMessage("План сохранён для этой точки и месяца.");
    } catch (e) {
      if (active.current === key) setMessage((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="point-operations-dashboard">
      <div className="ops-top">
        <div>
          <span className="eyebrow">ФАКТ И ПЛАН</span>
          <h2>Выдачи и выплаты</h2>
          <p>
            Point перечисляет вознаграждение еженедельно за подтверждённые
            выдачи.
          </p>
        </div>
        <label className="field">
          <span>Месяц учёта и планирования</span>
          <input
            type="month"
            min="2000-01"
            max="2099-12"
            value={month}
            onChange={(e) => {
              if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(e.target.value))
                setMonth(e.target.value);
            }}
          />
        </label>
      </div>
      {loading ? (
        <p role="status">Загружаем операции и план…</p>
      ) : error ? (
        <div role="alert">
          <p>{error}</p>
          <button
            className="secondary"
            onClick={() => setRevision((x) => x + 1)}
          >
            Повторить
          </button>
        </div>
      ) : (
        data && (
          <>
            <div className="ops-metrics">
              <article>
                <span>Остаток к выплате · за всё время</span>
                <strong>{money(data.totals.balance)}</strong>
                <small>Начислено минус перечислено</small>
              </article>
              <article>
                <span>Подтверждено выдач · за месяц</span>
                <strong>{data.period.issued}</strong>
                <small>Фактически переданные посылки</small>
              </article>
              <article>
                <span>Начислено · за месяц</span>
                <strong>{money(data.period.accrued)}</strong>
                <small>По тарифу каждой операции</small>
              </article>
              <article>
                <span>Перечислено · за месяц</span>
                <strong>{money(data.period.paid)}</strong>
                <small>Подтверждённые выплаты</small>
              </article>
            </div>
            <p className="ops-note">
              Расчётный день и тариф согласуются перед запуском. Плановые выдачи
              не включаются в баланс. Перечисление денег выполняется по
              реквизитам партнёра; кабинет отображает подтверждённые операции.
            </p>
            <details className="ops-register">
              <summary>Реестр выдач и выплат за месяц</summary>
              {data.events.length ? (
                <>
                  <div className="ops-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Дата</th>
                          <th>Операция</th>
                          <th>Номер посылки / платежа</th>
                          <th>Сумма</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.events.map((e) => (
                          <tr key={e.id}>
                            <td>
                              {new Date(e.occurred_at).toLocaleDateString(
                                "ru-RU",
                                { timeZone: "Europe/Moscow" },
                              )}
                            </td>
                            <td>
                              {e.kind === "issued"
                                ? "Выдача подтверждена"
                                : "Выплата перечислена"}
                            </td>
                            <td>{e.reference}</td>
                            <td>{money(e.amount_kopecks)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="ops-note">
                    Последние 50 операций за выбранный месяц. Итоги выше
                    учитывают все операции.
                  </p>
                </>
              ) : (
                <p className="ops-empty">
                  Подтверждённых операций за этот месяц пока нет. Выдачи и
                  выплаты появятся после поступления данных из рабочего реестра
                  Point.
                </p>
              )}
            </details>
            <form className="ops-planner" onSubmit={save}>
              <span className="eyebrow">ВОЗМОЖНОСТИ ВАШЕЙ ТОЧКИ</span>
              <h2>План приёмки и выдачи</h2>
              <p>
                Оцените нагрузку на месяц. Этот план не является заказом или
                гарантией дохода.
              </p>
              <div className="ops-inputs">
                {(
                  [
                    [
                      "workingDays",
                      "Рабочих дней в месяце",
                      1,
                      daysInMonth(month),
                    ],
                    ["acceptPerDay", "Принимать посылок в день", 0, 10000],
                    ["issuePerDay", "Выдавать посылок в день", 0, 10000],
                    ["storageSlots", "Мест хранения одновременно", 1, 100000],
                    [
                      "averageStorageDays",
                      "Средний срок в поинте, дней",
                      1,
                      90,
                    ],
                  ] as const
                ).map(([key, label, min, max]) => (
                  <label className="field" key={key}>
                    <span>{label}</span>
                    <input
                      type="number"
                      required
                      min={min}
                      max={max}
                      step="1"
                      value={plan[key]}
                      onChange={(e) => {
                        setPlan({
                          ...plan,
                          [key]:
                            e.target.value === "" ? 0 : Number(e.target.value),
                        });
                        setMessage("Есть несохранённые изменения");
                      }}
                    />
                  </label>
                ))}
              </div>
              {valid ? (
                <>
                  <div className="ops-plan-results" aria-live="polite">
                    <p>
                      <span>Приёмка за месяц</span>
                      <b>{estimate.accept.toLocaleString("ru-RU")} посылок</b>
                    </p>
                    <p>
                      <span>Выдача за месяц</span>
                      <b>{estimate.issue.toLocaleString("ru-RU")} посылок</b>
                    </p>
                    <p>
                      <span>Оборот по местам хранения</span>
                      <b>
                        ≈ {estimate.storage.toLocaleString("ru-RU")} посылок
                      </b>
                    </p>
                    <p>
                      <span>Ориентир с учётом ограничений</span>
                      <b>
                        до {estimate.recommended.toLocaleString("ru-RU")}{" "}
                        посылок
                      </b>
                    </p>
                  </div>
                  <p className="ops-note">
                    Приёмка и выдача = дневная возможность × рабочие дни. Оборот
                    хранения = места × календарные дни ÷ средний срок. Ориентир
                    — наименьшая из трёх величин. Модель предполагает
                    равномерный поток без начального остатка; учитывайте пики и
                    график доставки селлера.
                  </p>
                  {estimate.accept > estimate.issue && (
                    <p className="ops-warning">
                      Приёмка выше выдачи: остаток посылок может расти.
                      Уменьшите приёмку или увеличьте возможность выдачи.
                    </p>
                  )}
                  {Math.min(estimate.accept, estimate.issue) >
                    estimate.storage && (
                    <p className="ops-warning">
                      Зона хранения ограничивает план. Снизьте нагрузку или
                      пересмотрите число мест и срок нахождения посылок.
                    </p>
                  )}
                </>
              ) : (
                <p role="alert">
                  Проверьте значения: рабочие дни не должны превышать число дней
                  в месяце, срок хранения и число мест должны быть
                  положительными.
                </p>
              )}
              <div className="ops-save">
                <button className="primary" disabled={saving || !valid}>
                  {saving ? "Сохраняем…" : "Сохранить план на месяц"}
                </button>
                <span role="status">{message}</span>
              </div>
            </form>
          </>
        )
      )}
    </section>
  );
}
