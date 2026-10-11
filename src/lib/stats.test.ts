import { describe, expect, it } from "vitest";
import type { ConsumptionPeriod } from "../types";
import { diversityForMonth, newProductsForMonth } from "./stats";

const p = (id: string, productId: string, startDate: string, endDate: string): ConsumptionPeriod => ({ id, productId, startDate, endDate, createdAt: id, updatedAt: id });

describe("статистика", () => {
  it("учитывает период на границе обоих месяцев", () => {
    const periods = [p("1", "a", "2026-09-30", "2026-10-02")];
    expect(diversityForMonth(periods, "2026-09")).toBe(1);
    expect(diversityForMonth(periods, "2026-10")).toBe(1);
  });
  it("считает продукт с несколькими периодами один раз", () => expect(diversityForMonth([p("1", "a", "2026-09-01", "2026-09-02"), p("2", "a", "2026-09-20", "2026-09-21")], "2026-09")).toBe(1));
  it("определяет месяц появления по первому периоду", () => expect(newProductsForMonth([p("2", "a", "2026-10-01", "2026-10-02"), p("1", "a", "2026-09-30", "2026-10-02")], "2026-09")).toEqual(["a"]));
});
