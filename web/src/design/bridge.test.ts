import { describe, it, expect } from "vitest";
import { bindingValues, fromSession } from "./bridge";
import type { Session, Schedule } from "../types";

describe("existing native registration data", () => {
  it("retains organization type, semantic options, files, custom answers and schedule breaks across the new UI", () => {
    const monday = {
      enabled: true,
      opening_time: "09:00",
      closing_time: "19:00",
      break_enabled: true,
      break_from: "13:00",
      break_to: "14:00",
    };
    const schedule: Schedule = { days: { monday } };
    const preview = {
      "organization.type": "ooo",
      "organization.inn": {
        inn: "7707083893",
        short_name: "Организация",
        full_name: "Организация",
        kpp: "770701001",
        ogrn: "1027700132195",
        ogrnip: "",
        legal_address: "Москва",
        director_name: "Руководитель",
        confirmed: true,
      },
      "point.address": {
        address: "Москва, ул. Тестовая, 1",
        components: { city: "Москва" },
        addressLatitude: 55.7,
        addressLongitude: 37.6,
        entranceLatitude: 55.701,
        entranceLongitude: 37.601,
        confirmed: true,
      },
      "point.entrance_type": "courtyard",
      "point.premise_type": "pickup_point",
      "point.operations": ["pickup", "returns"],
      "point.storage_capacity": "200_plus",
      "point.max_parcel_weight": "30",
      "point.photos": [{ id: "f".repeat(48), category: "interior" }],
      "point.schedule": schedule,
    };
    const session = {
      id: "existing-registration",
      status: "IN_PROGRESS",
      preview,
      answers: { parking: true },
      graph: { questions: [], sections: [], show_review: true },
    } as unknown as Session;
    const record = fromSession(session),
      values = bindingValues(record.data);
    for (const binding of [
      "organization.type",
      "organization.inn",
      "point.address",
      "point.operations",
      "point.entrance_type",
      "point.premise_type",
      "point.storage_capacity",
      "point.max_parcel_weight",
      "point.photos",
    ])
      expect(values[binding]).toEqual(preview[binding as keyof typeof preview]);
    expect((values["point.schedule"] as Schedule).days.monday).toEqual(monday);
    expect(record.data.backend?.answers?.parking).toBe(true);
  });
});
