import type { Graph } from "../types";
import type { PointData } from "@/lib/cabinet-point";

const legalForms = {
  ip: {
    value: "ИП",
    description: "Индивидуальный предприниматель с действующим бизнесом",
  },
  ooo: {
    value: "ООО",
    description: "Общество с ограниченной ответственностью",
  },
  legal_other: {
    value: "Другое юридическое лицо",
    description: "Организация другой правовой формы",
  },
} as const;

export function organizationChoices(graph: Graph) {
  const question = graph.questions.find(
    (q) => q.enabled && q.binding === "organization.type",
  );
  return (question?.options || []).flatMap((option) => {
    const form = legalForms[option.value as keyof typeof legalForms];
    return option.enabled && form ? [{ ...form, label: option.label }] : [];
  });
}

export function organizationFields(legal: PointData["legal"]) {
  return legal === "ИП" || !legal
    ? {
        title: "Введите ИНН индивидуального предпринимателя",
        innLength: 12,
        innPlaceholder: "12 цифр ИНН ИП",
        companyLabel: "ФИО ИП или название бизнеса",
        companyPlaceholder: "Например, ИП Иванова — цветочный магазин",
      }
    : {
        title: "Введите ИНН организации",
        innLength: legal === "ООО" ? 10 : 12,
        innPlaceholder:
          legal === "ООО" ? "10 цифр ИНН ООО" : "10 или 12 цифр ИНН",
        companyLabel: "Название организации",
        companyPlaceholder: "Например, ООО «Ромашка»",
      };
}
