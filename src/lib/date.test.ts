import { describe, expect, it } from "vitest";
import type { ConsumptionPeriod } from "../types";
import { getAvailability, getAvailableDate, isEarlyRepeat, latestPeriod } from "./date";

const period = (id: string, startDate: string, endDate = startDate): ConsumptionPeriod => ({ id, productId: "p", startDate, endDate, createdAt: id, updatedAt: id });

describe("календарная логика", () => {
  it("считает недельный и двухнедельный интервалы", () => {
    expect(getAvailableDate("2026-09-19", "weekly")).toBe("2026-09-26");
    expect(getAvailableDate("2026-09-19", "biweekly")).toBe("2026-10-03");
  });
  it("считает календарный месяц", () => {
    expect(getAvailableDate("2026-09-19", "monthly")).toBe("2026-10-19");
    expect(getAvailableDate("2025-01-31", "monthly")).toBe("2025-02-28");
    expect(getAvailableDate("2024-01-31", "monthly")).toBe("2024-02-29");
    expect(getAvailableDate("2024-02-29", "monthly")).toBe("2024-03-29");
    expect(getAvailableDate("2026-03-31", "monthly")).toBe("2026-04-30");
  });
  it("считает от последнего дня последнего периода", () => expect(getAvailableDate(period("1", "2026-09-17", "2026-09-19").endDate, "monthly")).toBe("2026-10-19"));
  it("делит доступность включительно на сегодня, семь и восемь дней", () => {
    expect(getAvailability("2026-10-19", "2026-10-19")).toBe("now");
    expect(getAvailability("2026-10-26", "2026-10-19")).toBe("soon");
    expect(getAvailability("2026-10-27", "2026-10-19")).toBe("later");
  });
  it("новый фактический период начинает новый цикл", () => expect(getAvailableDate("2026-10-15", "monthly")).toBe("2026-11-15"));
  it("определяет ранний повтор по дате начала", () => {
    const periods = [period("1", "2026-09-05", "2026-09-07"), period("2", "2026-09-20", "2026-09-21")];
    expect(isEarlyRepeat(periods, periods[1], "monthly")).toBe(true);
  });
  it("после удаления последнего периода возвращается предпоследний", () => {
    const periods = [period("1", "2026-09-01"), period("2", "2026-10-01")];
    expect(latestPeriod(periods)?.id).toBe("2");
    expect(latestPeriod(periods.filter((p) => p.id !== "2"))?.id).toBe("1");
  });
  it("изменение правила пересчитывает дату", () => {
    expect(getAvailableDate("2026-09-19", "weekly")).toBe("2026-09-26");
    expect(getAvailableDate("2026-09-19", "monthly")).toBe("2026-10-19");
  });
});
