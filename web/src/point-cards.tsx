import { useState } from "react";
import { statusLabel } from "./types";
import { ActionIcon } from "./ui";

export type PointItem = {
  id: string;
  name: string;
  formatted_address: string;
  city: string;
  status: string;
  point_status: string;
  created_at: string;
  updated_at: string;
  application_id: string;
  session_id: string;
  organization_name: string;
  cover_id: string;
};

export function StorefrontIcon() {
  return (
    <svg
      className="storefront-icon"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 25v15a3 3 0 0 0 3 3h26a3 3 0 0 0 3-3V25M19 43V33a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v10" />
      <path d="M8 8h32l4 11a5 5 0 0 1-8 4 5 5 0 0 1-8 0 5 5 0 0 1-8 0 5 5 0 0 1-8 0 5 5 0 0 1-8-4L8 8Z" />
    </svg>
  );
}

export function PointsStats({ items }: { items: PointItem[] }) {
  const stats = [
    ["Всего точек", items.length],
    ["Черновики", items.filter((p) => p.status === "DRAFT").length],
    ["На проверке", items.filter((p) => p.status === "IN_REVIEW").length],
    ["Активные", items.filter((p) => p.point_status === "ACTIVE").length],
  ] as const;
  return (
    <section className="points-stats" aria-label="Статистика точек">
      <dl>
        {stats.map(([label, count]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{String(count).padStart(2, "0")}</dd>
          </div>
        ))}
      </dl>
      <p className="points-stats-note">
        Маленькая точка.
        <br />
        <strong>Большие возможности.</strong>
      </p>
    </section>
  );
}

export function PointCard({ point }: { point: PointItem }) {
  const [failedCover, setFailedCover] = useState("");
  const draft = !point.application_id;
  const href = draft
    ? `/points/new?session=${encodeURIComponent(point.session_id)}`
    : `/applications/${encodeURIComponent(point.application_id)}`;
  return (
    <article className="point-tile">
      <div className="point-tile-cover">
        {point.cover_id && point.cover_id !== failedCover ? (
          <img
            src={`/api/attachments/${encodeURIComponent(point.cover_id)}`}
            alt={`Фото ${point.name}`}
            loading="lazy"
            onError={() => setFailedCover(point.cover_id)}
          />
        ) : (
          <StorefrontIcon />
        )}
        <span className={`badge status-${point.status}`}>
          {statusLabel[point.status] || point.status}
        </span>
      </div>
      <div className="point-tile-content">
        <div className="eyebrow">
          POINT · {draft ? "НОВАЯ ТОЧКА" : point.city || "ВАША ТОЧКА"}
        </div>
        <h3 title={point.name}>{point.name}</h3>
        <p className="muted">
          {point.organization_name || "Организация ещё не указана"}
        </p>
        {point.formatted_address && (
          <p className="point-tile-address">{point.formatted_address}</p>
        )}
        <div className="point-tile-footer">
          <a
            className={draft ? "button primary" : "point-open-link"}
            href={href}
          >
            {draft ? "Продолжить" : "Открыть"}
            <ActionIcon />
          </a>
          <time dateTime={point.updated_at || point.created_at}>
            {new Date(point.updated_at || point.created_at).toLocaleDateString(
              "ru-RU",
            )}
          </time>
        </div>
      </div>
    </article>
  );
}
