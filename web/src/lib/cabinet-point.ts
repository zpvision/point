import { z } from "zod";
export const photoSchema = z.object({
  id: z.string().min(20).max(64),
  name: z.string().max(200),
  category: z.string().optional(),
});
export const pointSchema = z.object({
  legal: z.enum(["", "ИП", "ООО", "Другое юридическое лицо"]),
  inn: z.string().max(12),
  company: z.string().max(250),
  address: z.string().max(500),
  entrance: z.string().max(80),
  directions: z.string().max(600),
  premises: z.string().max(80),
  operations: z.array(z.string().max(80)).max(3),
  capacity: z.string().max(80),
  weight: z.string().max(80),
  hours: z
    .array(
      z.object({
        day: z.string().max(4),
        open: z.boolean(),
        from: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
        to: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
      }),
    )
    .length(7),
  photos: z.array(photoSchema).max(8),
  contact: z.string().max(20),
  contactName: z.string().max(150),
  contactPhone: z.string().max(40),
  answered: z.array(z.number().int().min(0).max(11)).max(12).optional(),
  step: z.number().int().min(0).max(12),
});
export type PointData = z.infer<typeof pointSchema> & {
  backend?: import("../design/bridge").BackendData;
};
export type RecordPoint = {
  id: string;
  data: PointData;
  status: string;
  updated: string;
  applicationId?: string;
  applicationStatus?: string;
};
export const steps = [
  "На кого будет оформлен Point?",
  "Введите ИНН индивидуального предпринимателя",
  "Укажите адрес вашей точки",
  "Где находится вход в Point?",
  "Как курьеру найти вход?",
  "Какой это тип помещения?",
  "Какие операции доступны в вашей точке?",
  "Сколько посылок можно разместить?",
  "Какой максимальный вес отправления?",
  "Когда работает ваша точка?",
  "Покажите, как выглядит ваш Point",
  "Кто будет контактным лицом?",
];
export const groups = [
  { name: "Организация", sub: "Реквизиты и документы", start: 0, end: 1 },
  { name: "Точка", sub: "Адрес и вход", start: 2, end: 5 },
  { name: "Возможности", sub: "Операции и вместимость", start: 6, end: 8 },
  { name: "Режим работы", sub: "Дни и часы", start: 9, end: 9 },
  { name: "Фотографии", sub: "Знакомство с точкой", start: 10, end: 10 },
  { name: "Контакты", sub: "На связи с Point", start: 11, end: 11 },
  { name: "Проверка", sub: "Всё готово к подключению", start: 12, end: 12 },
];
export function blank(): PointData {
  return {
    legal: "",
    inn: "",
    company: "",
    address: "",
    entrance: "",
    directions: "",
    premises: "",
    operations: [],
    capacity: "",
    weight: "",
    hours: ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"].map((day) => ({
      day,
      open: true,
      from: "09:00",
      to: "19:00",
    })),
    photos: [],
    contact: "Я",
    contactName: "",
    contactPhone: "",
    step: 0,
  };
}
export function innLengthIssue(d: Pick<PointData, "legal" | "inn">): string {
  if (d.legal === "ООО") {
    return /^[0-9]{10}$/.test(d.inn) ? "" : "ИНН ООО должен содержать 10 цифр.";
  }
  if (d.legal === "Другое юридическое лицо") {
    return /^(?:[0-9]{10}|[0-9]{12})$/.test(d.inn)
      ? ""
      : "ИНН должен содержать 10 или 12 цифр.";
  }
  if (/^[0-9]{12}$/.test(d.inn)) return "";
  return /^[0-9]{10}$/.test(d.inn)
    ? "Указан ИНН из 10 цифр — это формат ИНН организации. Для ИП нужен ИНН из 12 цифр. Проверьте ИНН или измените форму организации."
    : "ИНН индивидуального предпринимателя должен содержать 12 цифр.";
}
export function issue(d: PointData, s: number): string {
  switch (s) {
    case 0:
      return d.legal ? "" : "Выберите форму организации";
    case 1:
      return (
        innLengthIssue(d) ||
        (!d.company.trim() ? "Укажите название организации" : "")
      );
    case 2:
      return d.address.trim().length < 8 ? "Укажите полный адрес" : "";
    case 3:
      return d.entrance ? "" : "Выберите расположение входа";
    case 4:
      return d.directions.trim() ? "" : "Добавьте ориентир для курьера";
    case 5:
      return d.premises ? "" : "Выберите тип помещения";
    case 6:
      return d.operations.length ? "" : "Выберите хотя бы одну операцию";
    case 7:
      return d.capacity ? "" : "Выберите вместимость";
    case 8:
      return d.weight ? "" : "Выберите максимальный вес";
    case 9:
      return !d.hours.some((h) => h.open)
        ? "Добавьте хотя бы один рабочий день"
        : d.hours.some((h) => h.open && h.from >= h.to)
          ? "Время закрытия должно быть позже времени открытия"
          : "";
    case 10:
      return d.photos.length ? "" : "Добавьте хотя бы одну фотографию";
    case 11:
      return !d.contactName.trim()
        ? "Укажите имя контактного лица"
        : d.contactPhone.replace(/\D/g, "").length < 10
          ? "Укажите номер телефона"
          : "";
    default:
      return "";
  }
}
export function summary(d: PointData, s: number): string {
  return (
    [
      d.legal,
      [d.company, d.inn && "ИНН " + d.inn].filter(Boolean).join(" · "),
      d.address,
      d.entrance,
      d.directions,
      d.premises,
      d.operations.join(", "),
      d.capacity,
      d.weight,
      d.hours
        .filter((h) => h.open)
        .map((h) => h.day + " " + h.from + "–" + h.to)
        .join(", "),
      d.photos.length ? d.photos.length + " фото" : "",
      d.contactName && d.contactName + " · " + d.contactPhone,
    ][s] || "Не заполнено"
  );
}
