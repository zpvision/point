import { afterEach, describe, expect, it, vi } from "vitest";
import { blank } from "@/lib/cabinet-point";
import type { Organization } from "../types";
import {
  applyOrganizationResult,
  lookupOrganization,
  validOrganizationINN,
} from "./organization-lookup";

const organization: Organization = {
  inn: "7707083893",
  short_name: "ООО Тест",
  full_name: "Общество с ограниченной ответственностью Тест",
  kpp: "770701001",
  ogrn: "1027700132195",
  ogrnip: "",
  legal_address: "Москва",
  director_name: "Руководитель",
  entity_type: "LEGAL",
  confirmed: false,
};
afterEach(() => vi.unstubAllGlobals());
describe("organization lookup on the INN step", () => {
  it("checks the backend INN checksum rules for both organization forms", () => {
    expect(validOrganizationINN("7707083893", "ООО")).toBe(true);
    expect(validOrganizationINN("7707083894", "ООО")).toBe(false);
    expect(validOrganizationINN("500100732259", "ИП")).toBe(true);
    expect(validOrganizationINN("500100732258", "ИП")).toBe(false);
    expect(validOrganizationINN("7707083893", "ИП")).toBe(false);
  });
  it("uses the existing authenticated server endpoint and keeps confirmation explicit", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ ...organization, confirmed: true }));
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    const result = await lookupOrganization(organization.inn, signal);
    expect(fetch).toHaveBeenCalledWith(
      "/api/organization-lookup",
      expect.objectContaining({
        method: "POST",
        signal,
        body: JSON.stringify({ inn: organization.inn }),
      }),
    );
    const current = {
      ...blank(),
      legal: "ООО" as const,
      inn: organization.inn,
      backend: { answers: { parking: true } },
    };
    const patch = applyOrganizationResult(current, current, result);
    expect(patch?.company).toBe(organization.short_name);
    expect(patch?.backend?.organization?.kpp).toBe(organization.kpp);
    expect(patch?.backend?.organization?.confirmed).toBe(false);
    expect(patch?.backend?.answers?.parking).toBe(true);
  });
  it("does not overwrite a new INN, a new legal form or a manually entered business name", () => {
    const requested = {
      inn: organization.inn,
      legal: "ООО" as const,
      company: "",
    };
    const current = {
      ...blank(),
      ...requested,
      company: "Моё название бизнеса",
    };
    expect(
      applyOrganizationResult(
        { ...current, inn: "7728168971" },
        requested,
        organization,
      ),
    ).toBeNull();
    expect(
      applyOrganizationResult(
        { ...current, legal: "ИП" },
        requested,
        organization,
      ),
    ).toBeNull();
    expect(
      applyOrganizationResult(current, requested, organization)?.company,
    ).toBe("Моё название бизнеса");
  });
  it("exposes provider configuration errors for the form instead of failing silently", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            code: "LOOKUP_NOT_CONFIGURED",
            message:
              "Поиск организаций не подключён. Заполните реквизиты вручную.",
          },
          { status: 503 },
        ),
      ),
    );
    await expect(
      lookupOrganization(organization.inn, new AbortController().signal),
    ).rejects.toThrow("Поиск организаций не подключён");
  });
});
