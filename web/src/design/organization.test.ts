import { describe, expect, it } from "vitest";
import { organizationChoices, organizationFields } from "./organization";
import { blank, issue } from "@/lib/cabinet-point";
import { bindingValues } from "./bridge";
import type { Graph } from "../types";

describe("organization selection", () => {
  it("includes ООО from the scenario and respects disabled options and labels", () => {
    const graph = {
      questions: [
        {
          enabled: true,
          binding: "organization.type",
          options: [
            { value: "ip", label: "ИП", enabled: true },
            { value: "ooo", label: "ООО", enabled: true },
            {
              value: "legal_other",
              label: "Другое юридическое лицо",
              enabled: false,
            },
          ],
        },
      ],
    } as Graph;
    expect(organizationChoices(graph).map((o) => o.value)).toEqual([
      "ИП",
      "ООО",
    ]);
    graph.questions[0].options[1].label =
      "Общество с ограниченной ответственностью";
    expect(organizationChoices(graph)[1].label).toBe(
      "Общество с ограниченной ответственностью",
    );
    expect(organizationChoices(graph)[1].value).toBe("ООО");
  });
  it("accepts a ten-digit company INN and submits the ООО binding", () => {
    const d = {
      ...blank(),
      legal: "ООО" as const,
      inn: "7707083893",
      company: "ООО Ромашка",
    };
    expect(issue(d, 1)).toBe("");
    expect(bindingValues(d)["organization.type"]).toBe("ooo");
    expect(organizationFields(d.legal).innLength).toBe(10);
    expect(organizationFields(d.legal).companyLabel).toBe(
      "Название организации",
    );
    expect(issue({ ...d, inn: "500100732259" }, 1)).not.toBe("");
  });
  it("keeps the twelve-digit individual entrepreneur flow", () => {
    const d = {
      ...blank(),
      legal: "ИП" as const,
      inn: "500100732259",
      company: "ИП Иванов",
    };
    expect(issue(d, 1)).toBe("");
    expect(bindingValues(d)["organization.type"]).toBe("ip");
    expect(organizationFields(d.legal).innLength).toBe(12);
    expect(issue({ ...d, inn: "7707083893" }, 1)).not.toBe("");
  });
  it("explains why 6319254530 cannot be used as an entrepreneur INN", () => {
    const d = {
      ...blank(),
      legal: "ИП" as const,
      inn: "6319254530",
      company: "Название",
    };
    expect(issue(d, 1)).toContain("Указан ИНН из 10 цифр");
    expect(issue(d, 1)).toContain("Для ИП нужен ИНН из 12 цифр");
    expect(issue({ ...d, legal: "ООО" }, 1)).toBe("");
  });
});
