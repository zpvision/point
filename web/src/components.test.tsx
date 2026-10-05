import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  answerLabel,
  ChoiceChips,
  defaultSchedule,
  QuestionRenderer,
  scheduleLines,
} from "./questions";
import { distance } from "./maps";
import { initials } from "./ui";
import type { Address, Question } from "./types";
const question: Question = {
  key: "test",
  internal_name: "test",
  title: "Выберите",
  description: "",
  type: "SINGLE_SELECT",
  required: true,
  enabled: true,
  order: 0,
  section: "test",
  placeholder: "",
  binding: "",
  options: [
    { value: "a", label: "Первый", enabled: true },
    { value: "b", label: "Второй", enabled: true },
    { value: "old", label: "Скрытый", enabled: false },
  ],
  conditions: [],
  validation: {},
  settings: {},
};
describe("question renderer", () => {
  it("single select uses labels and accessible selected state", () => {
    const html = renderToStaticMarkup(
      <ChoiceChips
        question={question}
        value="b"
        onChange={() => {}}
        sessionId="test"
      />,
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('class="selected"');
    expect(html).not.toContain("✓");
    expect(html).not.toContain("Скрытый");
    expect(answerLabel(question, "a")).toBe("Первый");
  });
  it("multi select starts without automatically selected operations", () => {
    const html = renderToStaticMarkup(
      <ChoiceChips
        question={{ ...question, type: "MULTI_SELECT" }}
        value={undefined}
        onChange={() => {}}
        sessionId="test"
      />,
    );
    expect(html).not.toContain('aria-pressed="true"');
    expect(answerLabel({ ...question, type: "MULTI_SELECT" }, ["a", "b"])).toBe(
      "Первый, Второй",
    );
  });
  it("password is a password input and is masked in history", () => {
    const q = { ...question, type: "PASSWORD" };
    expect(
      renderToStaticMarkup(
        <QuestionRenderer
          question={q}
          value=""
          onChange={() => {}}
          sessionId="test"
        />,
      ),
    ).toContain('type="password"');
    expect(answerLabel(q, "secret")).not.toContain("secret");
  });
  it("schedule groups equal workdays and distinguishes closed days", () => {
    expect(scheduleLines(defaultSchedule())).toEqual([
      "ПН–ПТ 09:00–19:00",
      "СБ–ВС выходной",
    ]);
    const s = defaultSchedule();
    s.days.saturday = {
      ...s.days.monday,
      enabled: true,
      opening_time: "10:00",
      closing_time: "17:00",
    };
    expect(scheduleLines(s)).toContain("СБ 10:00–17:00");
  });
  it("address state keeps independent building and entrance coordinates", () => {
    const a = {
      addressLatitude: 55.75,
      addressLongitude: 37.61,
      entranceLatitude: 55.751,
      entranceLongitude: 37.611,
    } as Address;
    expect(distance(a)).toBeGreaterThan(100);
    expect(
      distance({
        ...a,
        entranceLatitude: a.addressLatitude,
        entranceLongitude: a.addressLongitude,
      }),
    ).toBe(0);
  });
  it("photo upload shows direct buttons and highlights required categories from scenario", () => {
    const html = renderToStaticMarkup(
      <QuestionRenderer
        question={{
          ...question,
          type: "PHOTO_UPLOAD",
          settings: {
            categories: [
              { value: "facade", label: "Фасад / вход", enabled: true },
              { value: "interior", label: "Помещение внутри", enabled: true },
              { value: "sign", label: "Вывеска", enabled: true },
            ],
            required_categories: ["facade", "interior"],
          },
        }}
        value={[]}
        onChange={() => {}}
        sessionId="test"
        preview
      />,
    );
    expect(html.match(/photo-category-card required/g)).toHaveLength(2);
    expect(html).toContain("Выбрать фото");
    expect(html).toContain("По желанию");
    expect(html).not.toContain("<select");
  });
  it("initials are computed from current user", () => {
    expect(initials("Сергей", "Данилюк")).toBe("СД");
    expect(initials("Анна", "Иванова")).toBe("АИ");
  });
});
