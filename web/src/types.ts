export type Option = { value: string; label: string; enabled: boolean };
export type Condition = {
  source: string;
  operator: string;
  value: unknown;
  group: number;
};
export type Section = {
  code: string;
  name: string;
  description: string;
  order: number;
};
export type Question = {
  key: string;
  internal_name: string;
  title: string;
  description: string;
  type: string;
  required: boolean;
  enabled: boolean;
  order: number;
  section: string;
  placeholder: string;
  binding: string;
  admin_note?: string;
  options: Option[];
  conditions: Condition[];
  validation: {
    min?: number;
    max?: number;
    min_length?: number;
    max_length?: number;
  };
  settings: {
    categories?: Option[];
    required_categories?: string[];
    max_files?: number;
  };
};
export type Graph = {
  sections: Section[];
  questions: Question[];
  show_review: boolean;
};
export type User = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  role: string;
};
export type Session = {
  id: string;
  code: string;
  version_id: string;
  version: number;
  status: string;
  entity_id: string;
  graph: Graph;
  questions: Question[];
  answers: Record<string, unknown>;
  next: Question | null;
  preview: Record<string, unknown>;
  answered: number;
  total: number;
  percent: number;
};
export type Address = {
  address: string;
  components: {
    country: string;
    region: string;
    city: string;
    street: string;
    house: string;
    building: string;
    postal_code: string;
  };
  addressLatitude: number;
  addressLongitude: number;
  entranceLatitude: number;
  entranceLongitude: number;
  markerAdjusted: boolean;
  confirmed: boolean;
};
export type Day = {
  enabled: boolean;
  opening_time: string;
  closing_time: string;
  break_enabled: boolean;
  break_from: string;
  break_to: string;
};
export type Schedule = { days: Record<string, Day> };
export type FileRef = { id: string; category: string };
export type Organization = {
  inn: string;
  kpp: string;
  ogrn: string;
  ogrnip: string;
  short_name: string;
  full_name: string;
  legal_address: string;
  director_name: string;
  entity_type: string;
  confirmed: boolean;
};
export type Version = {
  id: string;
  scenario_id: string;
  number: number;
  status: string;
  graph: Graph;
  revision: number;
  published_at: string;
  updated_at: string;
};
export type ApplicationRow = {
  id: string;
  status: string;
  created_at: string;
  name: string;
  city: string;
  short_name: string;
  inn: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
};
export type PointData = Address["components"] & {
  id: string;
  name: string;
  formatted_address: string;
  address_latitude: number;
  address_longitude: number;
  entrance_latitude: number;
  entrance_longitude: number;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  courier_comment: string;
  schedule: Schedule;
};
export type ApplicationDetailData = {
  application: { id: string; status: string; session_id: string };
  point: PointData;
  organization: Organization;
  owner: User;
};
export type AuditEvent = {
  action: string;
  comment: string;
  created_at: string;
  first_name: string;
  last_name: string;
};
export const statusLabel: Record<string, string> = {
  DRAFT: "Черновик",
  IN_PROGRESS: "В процессе",
  IN_REVIEW: "На проверке",
  NEEDS_CHANGES: "Нужны изменения",
  APPROVED: "Одобрен",
  REJECTED: "Отклонён",
  ACTIVE: "Активен",
  PENDING: "Ожидает активации",
  PUBLISHED: "Опубликован",
  ARCHIVED: "Архив",
  SUSPENDED: "Приостановлен",
  CLOSED: "Закрыт",
};
