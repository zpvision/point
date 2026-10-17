import type { Organization } from "../types";
import type { PointData } from "@/lib/cabinet-point";

export function validOrganizationINN(inn: string, legal: PointData["legal"]) {
  if (!/^\d+$/.test(inn)) return false;
  if (
    legal === "ИП"
      ? inn.length !== 12
      : legal === "ООО"
        ? inn.length !== 10
        : ![10, 12].includes(inn.length)
  )
    return false;
  const check = (weights: number[], index: number) =>
    (weights.reduce((sum, weight, i) => sum + Number(inn[i]) * weight, 0) %
      11) %
      10 ===
    Number(inn[index]);
  return inn.length === 10
    ? check([2, 4, 10, 3, 5, 9, 4, 6, 8], 9)
    : check([7, 2, 4, 10, 3, 5, 9, 4, 6, 8], 10) &&
        check([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8], 11);
}

export async function lookupOrganization(
  inn: string,
  signal: AbortSignal,
): Promise<Organization> {
  const response = await fetch("/api/organization-lookup", {
    method: "POST",
    signal,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inn }),
  });
  const raw = await response.json().catch(() => ({}));
  const data = raw && typeof raw === "object" ? raw : {};
  if (!response.ok)
    throw new Error(
      data.message ||
        data.error ||
        "Не удалось найти организацию. Повторите поиск или заполните реквизиты вручную.",
    );
  if (
    data.inn !== inn ||
    typeof data.short_name !== "string" ||
    !data.short_name.trim()
  )
    throw new Error(
      "Сервис вернул неполные реквизиты. Заполните их вручную или повторите поиск.",
    );
  return { ...data, confirmed: false };
}

export function applyOrganizationResult(
  current: PointData,
  requested: Pick<PointData, "inn" | "legal" | "company">,
  organization: Organization,
): Partial<PointData> | null {
  if (
    current.inn !== requested.inn ||
    current.legal !== requested.legal ||
    organization.inn !== requested.inn
  )
    return null;
  if (
    (requested.legal === "ИП" && organization.entity_type !== "INDIVIDUAL") ||
    (requested.legal === "ООО" && organization.entity_type !== "LEGAL")
  )
    throw new Error(
      "Найденные реквизиты не соответствуют выбранной форме организации. Проверьте ИНН.",
    );
  const company =
    current.company === requested.company
      ? organization.short_name
      : current.company;
  return {
    company,
    backend: {
      ...current.backend,
      organization: { ...organization, short_name: company, confirmed: false },
    },
  };
}
