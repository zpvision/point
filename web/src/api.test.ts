import { afterEach, describe, expect, it, vi } from "vitest";
import { api, errorMessages } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("submission errors", () => {
  it("keeps the organization validation message returned by the server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          code: "ORGANIZATION_TYPE",
          message: "Тип организации не соответствует ИНН",
        }),
      }),
    );
    try {
      await api("/registration/sessions/test/complete", "POST", {});
      expect.fail("Request should fail");
    } catch (error) {
      expect(errorMessages(error)).toEqual([
        "Тип организации не соответствует ИНН",
      ]);
    }
  });

  it("preserves a list of validation messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          code: "VALIDATION",
          message: "Проверьте заявку",
          errors: [
            { message: "Подтвердите адрес", question_key: "address" },
            "Добавьте фотографию входа",
          ],
        }),
      }),
    );
    try {
      await api("/registration/sessions/test/complete", "POST", {});
      expect.fail("Request should fail");
    } catch (error) {
      expect(errorMessages(error)).toEqual([
        "Подтвердите адрес",
        "Добавьте фотографию входа",
      ]);
    }
  });
});
