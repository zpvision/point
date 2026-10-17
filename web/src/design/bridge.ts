import { api, ApiError } from "../api";
import type {
  Session,
  Question,
  Organization,
  Address,
  FileRef,
  Schedule,
} from "../types";
import { blank, type PointData, type RecordPoint } from "@/lib/cabinet-point";
import type { PointItem } from "../point-cards";

export type BackendData = {
  organization?: Organization;
  address?: Address;
  schedule?: Schedule;
  answers?: Record<string, unknown>;
};
export const weekdays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
const entrance: Record<string, string> = {
  "С улицы": "street",
  "В торговом центре": "mall",
  "Во дворе": "courtyard",
  "Другой вход": "other",
};
const premises: Record<string, string> = {
  Магазин: "shop",
  "Пункт выдачи заказов": "pickup_point",
  Офис: "office",
  "Другое помещение": "other",
};
const operations: Record<string, string> = {
  "Выдача заказов": "pickup",
  "Приём отправлений": "dropoff",
  Возвраты: "returns",
};
const capacity: Record<string, string> = {
  "до 50": "50",
  "до 100": "100",
  "до 200": "200",
  "более 200": "200_plus",
};
const weight: Record<string, string> = {
  "до 5 кг": "5",
  "до 10 кг": "10",
  "до 20 кг": "20",
  "до 30 кг": "30",
};
const inverse = (map: Record<string, string>, value: unknown) =>
  Object.keys(map).find((k) => map[k] === value) || String(value || "");
export const mappedBindings = [
  "organization.type",
  "organization.inn",
  "point.address",
  "point.entrance_type",
  "point.courier_comment",
  "point.premise_type",
  "point.operations",
  "point.storage_capacity",
  "point.max_parcel_weight",
  "point.schedule",
  "point.photos",
  "point.contact_is_owner",
  "point.contact_name",
  "point.contact_phone",
  "point.contact_email",
];
export async function sessionFor(id: string) {
  return api<Session>("/registration/sessions/" + encodeURIComponent(id));
}
export function bindingValues(d: PointData): Record<string, unknown> {
  const backend = d.backend || {};
  return {
    "organization.type":
      d.legal === "ООО"
        ? "ooo"
        : d.legal === "Другое юридическое лицо"
          ? "legal_other"
          : "ip",
    "organization.inn":
      backend.organization?.inn === d.inn
        ? { ...backend.organization, short_name: d.company }
        : undefined,
    "point.address":
      backend.address?.address === d.address ? backend.address : undefined,
    "point.entrance_type": entrance[d.entrance] || d.entrance,
    "point.courier_comment": d.directions,
    "point.premise_type": premises[d.premises] || d.premises,
    "point.operations": d.operations.map((v) => operations[v] || v),
    "point.storage_capacity": capacity[d.capacity] || d.capacity,
    "point.max_parcel_weight": weight[d.weight] || d.weight,
    "point.schedule": {
      days: Object.fromEntries(
        d.hours.map((h, i) => [
          weekdays[i],
          {
            break_enabled: false,
            break_from: "13:00",
            break_to: "14:00",
            ...backend.schedule?.days[weekdays[i]],
            enabled: h.open,
            opening_time: h.from,
            closing_time: h.to,
          },
        ]),
      ),
    },
    "point.photos": d.photos.map((p) => ({
      id: p.id,
      category: p.category || "facade",
    })),
    "point.contact_is_owner": d.contact === "Я" ? "SELF" : "OTHER",
    "point.contact_name": d.contactName,
    "point.contact_phone": d.contactPhone,
    "point.contact_email": backend.answers?.contact_email || "",
  };
}
export async function saveDesignPoint(
  record: RecordPoint,
): Promise<RecordPoint> {
  if (record.status === "ready") {
    const existing = await sessionFor(record.id);
    if (existing.status === "COMPLETED") return { ...record, status: "ready" };
  }
  const saved = await api<RecordPoint>("/cabinet/points", "PUT", {
    id: record.id,
    data: record.data,
    status: "draft",
    updated: record.updated,
  });
  if (record.status !== "ready") return saved;
  let session = await sessionFor(record.id);
  const values = bindingValues(record.data);
  // Re-evaluate conditions after every answer. Native API validates each value and owns all domain writes.
  const sent = new Set<string>();
  for (let pass = 0; pass < session.graph.questions.length + 1; pass++) {
    const q = session.questions.find((q) => !sent.has(q.key));
    if (!q) break;
    sent.add(q.key);
    const value = q.binding
      ? values[q.binding]
      : record.data.backend?.answers?.[q.key];
    if (value === undefined) {
      if (q.required)
        throw new ApiError(
          "REQUIRED",
          "Заполните поле «" + q.title + "» в разделе проверки",
          q.key,
        );
      continue;
    }
    try {
      session = await api<Session>(
        `/registration/sessions/${session.id}/answers`,
        "POST",
        { key: q.key, value, version_id: session.version_id },
      );
    } catch (e) {
      window.dispatchEvent(new Event("point-session-updated"));
      throw e;
    }
  }
  if (record.data.contact === "Я")
    await api("/me/phone", "PATCH", { phone: record.data.contactPhone });
  await api(`/registration/sessions/${session.id}/complete`, "POST", {});
  return { ...saved, status: "ready" };
}
export function fromSession(session: Session, updated = ""): RecordPoint {
  const d = blank(),
    p = session.preview;
  d.legal =
    p["organization.type"] === "ooo"
      ? "ООО"
      : p["organization.type"] === "legal_other"
        ? "Другое юридическое лицо"
        : p["organization.type"]
          ? "ИП"
          : "";
  const org = p["organization.inn"] as Organization | undefined;
  d.inn = org?.inn || "";
  d.company = org?.short_name || "";
  const address = p["point.address"] as Address | undefined;
  d.address = address?.address || "";
  d.entrance = inverse(entrance, p["point.entrance_type"]);
  d.directions = String(p["point.courier_comment"] || "");
  d.premises = inverse(premises, p["point.premise_type"]);
  d.operations = ((p["point.operations"] || []) as string[]).map((v) =>
    inverse(operations, v),
  );
  d.capacity = inverse(capacity, p["point.storage_capacity"]);
  d.weight = inverse(weight, p["point.max_parcel_weight"]);
  const schedule = p["point.schedule"] as Schedule | undefined;
  if (schedule)
    d.hours = d.hours.map((h, i) => {
      const v = schedule.days[weekdays[i]];
      return v
        ? { ...h, open: v.enabled, from: v.opening_time, to: v.closing_time }
        : h;
    });
  d.photos = ((p["point.photos"] || []) as FileRef[]).map((f) => ({
    ...f,
    name: f.category,
  }));
  d.contact = p["point.contact_is_owner"] === "OTHER" ? "Другой человек" : "Я";
  d.contactName = String(p["point.contact_name"] || "");
  d.contactPhone = String(p["point.contact_phone"] || "");
  d.backend = {
    organization: org,
    address,
    schedule,
    answers: session.answers,
  };
  const stepBindings = [
    "organization.type",
    "organization.inn",
    "point.address",
    "point.entrance_type",
    "point.courier_comment",
    "point.premise_type",
    "point.operations",
    "point.storage_capacity",
    "point.max_parcel_weight",
    "point.schedule",
    "point.photos",
    "point.contact_is_owner",
  ];
  d.answered = stepBindings.flatMap((b, i) => (p[b] !== undefined ? [i] : []));
  d.step = stepBindings.findIndex((b) => p[b] === undefined);
  if (d.step < 0) d.step = 12;
  return {
    id: session.id,
    data: d,
    status: session.status === "COMPLETED" ? "ready" : "draft",
    updated,
  };
}
export async function getDesignPoints() {
  const [drafts, points, profile] = await Promise.all([
    api<RecordPoint[]>("/cabinet/points"),
    api<PointItem[]>("/points"),
    api<{ name: string; phone: string }>("/cabinet/profile"),
  ]);
  const existing = new Set(drafts.map((d) => d.id));
  const native = await Promise.all(
    points
      .filter((p) => !existing.has(p.session_id))
      .map(async (p) => {
        const record = fromSession(
          await sessionFor(p.session_id),
          p.updated_at,
        );
        if (record.data.contact === "Я") {
          record.data.contactName ||= profile.name;
          record.data.contactPhone ||= profile.phone;
        }
        return record;
      }),
  );
  return [...drafts, ...native]
    .map((record) => {
      const point = points.find((p) => p.session_id === record.id);
      return {
        ...record,
        applicationId: point?.application_id,
        applicationStatus: point?.status,
      };
    })
    .sort((a, b) => b.updated.localeCompare(a.updated));
}
export async function uploadDesignPhoto(
  record: RecordPoint,
  file: File,
  category: string,
) {
  if (file.size > 10 * 1024 * 1024)
    throw Error("Фотография должна быть меньше 10 МБ");
  await api("/cabinet/points", "PUT", {
    id: record.id,
    data: record.data,
    status: "draft",
    updated: record.updated,
  });
  const session = await sessionFor(record.id),
    q = session.questions.find((q) => q.binding === "point.photos");
  if (!q) throw Error("Вопрос фотографий недоступен");
  const form = new FormData();
  form.set("file", file);
  form.set("question_key", q.key);
  form.set("category", category);
  const response = await fetch(
    `/api/registration/sessions/${record.id}/attachments`,
    { method: "POST", body: form },
  );
  const value = await response.json();
  if (!response.ok)
    throw Error(value.message || "Не удалось загрузить фотографию");
  return { id: String(value.id), name: file.name, category };
}
export async function designRequest(path: string, options?: RequestInit) {
  if (path === "/api/cabinet/points" && !options?.method)
    return getDesignPoints();
  const response = await fetch(path, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Error(body.error || body.message || "Не удалось выполнить действие");
  return body;
}
export function initialNativeValue(q: Question, d: PointData): unknown {
  if (q.binding === "point.schedule") return bindingValues(d)["point.schedule"];
  if (q.binding === "organization.inn")
    return d.backend?.organization?.inn === d.inn
      ? d.backend.organization
      : {
          inn: d.inn,
          short_name: d.company,
          kpp: "",
          ogrn: "",
          ogrnip: "",
          full_name: d.company,
          legal_address: "",
          director_name: "",
          confirmed: false,
        };
  if (q.binding === "point.address")
    return d.backend?.address?.address === d.address
      ? d.backend.address
      : undefined;
  return d.backend?.answers?.[q.key];
}
