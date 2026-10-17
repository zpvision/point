import { useEffect, useState } from "react";
import { QuestionRenderer } from "../questions";
import type { Session, Organization, Address, Schedule } from "../types";
import type { RecordPoint, PointData } from "@/lib/cabinet-point";
import {
  sessionFor,
  initialNativeValue,
  mappedBindings,
  weekdays,
} from "./bridge";

export default function NativeDetails({
  record,
  onChange,
  ensureSaved,
}: {
  record: RecordPoint;
  onChange: (patch: Partial<PointData>) => void;
  ensureSaved: () => Promise<unknown>;
}) {
  const [session, setSession] = useState<Session | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = () =>
      sessionFor(record.id)
        .then((s) => {
          if (active) {
            setSession(s);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    (record.status === "ready" ? Promise.resolve() : ensureSaved())
      .then(load)
      .catch((e) => {
        if (active) setError(e.message);
      });
    window.addEventListener("point-session-updated", load);
    return () => {
      active = false;
      window.removeEventListener("point-session-updated", load);
    };
  }, [record.id]);
  if (error)
    return (
      <div className="info-box" role="alert">
        {error}
      </div>
    );
  if (!session) return <p role="status">Проверяем реквизиты заявки…</p>;
  if (session.status === "COMPLETED")
    return (
      <section className="native-details">
        <h3>Заявка отправлена на проверку</h3>
        <p className="hint">
          Данные сохранены. Если потребуются уточнения, команда Point вернёт
          заявку на доработку.
        </p>
        {record.applicationId && (
          <a
            className="text-button"
            href={"/applications/" + record.applicationId}
          >
            Статус и история проверки
          </a>
        )}
      </section>
    );
  const questions = session.questions.filter(
    (q) =>
      q.binding === "organization.inn" ||
      q.binding === "point.address" ||
      !mappedBindings.includes(q.binding) ||
      (q.binding === "point.schedule" &&
        Object.values(record.data.backend?.schedule?.days || {}).some(
          (d) => d.break_enabled,
        )),
  );
  return (
    <section className="native-details">
      <h3>Реквизиты и расположение</h3>
      <p className="hint">
        Подтвердите данные, необходимые для проверки и подключения Point.
      </p>
      {questions.map((q) => (
        <div className="native-field" key={q.key}>
          <h4>
            {q.title}
            {q.required ? " *" : ""}
          </h4>
          {q.description && <p className="hint">{q.description}</p>}
          <QuestionRenderer
            sessionId={record.id}
            question={q}
            value={initialNativeValue(q, record.data)}
            onChange={(value) => {
              const backend = { ...record.data.backend };
              const patch: Partial<PointData> = { backend };
              if (q.binding === "organization.inn") {
                backend.organization = value as Organization;
                patch.inn = (value as Organization).inn;
                patch.company = (value as Organization).short_name;
              } else if (q.binding === "point.address") {
                backend.address = value as Address;
                patch.address = (value as Address).address;
              } else if (q.binding === "point.schedule") {
                backend.schedule = value as Schedule;
                patch.hours = record.data.hours.map((h, i) => {
                  const day = (value as Schedule).days[weekdays[i]];
                  return {
                    ...h,
                    open: day.enabled,
                    from: day.opening_time,
                    to: day.closing_time,
                  };
                });
              } else backend.answers = { ...backend.answers, [q.key]: value };
              onChange(patch);
            }}
          />
        </div>
      ))}
    </section>
  );
}
