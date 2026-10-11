import type { ConsumptionPeriod, Product } from "../types";
import { getAvailableDate, isEarlyRepeat, monthKey, periodOverlapsMonth, previousPeriodFor } from "./date";

export type MonthStats = {
  diversity: number;
  previousDiversity: number;
  newProductIds: string[];
  earlyRepeats: Array<{ period: ConsumptionPeriod; product: Product; expectedDate: string }>;
};

export function diversityForMonth(periods: ConsumptionPeriod[], month: string): number {
  return new Set(periods.filter((p) => periodOverlapsMonth(p, month)).map((p) => p.productId)).size;
}

export function newProductsForMonth(periods: ConsumptionPeriod[], month: string): string[] {
  const firstByProduct = new Map<string, ConsumptionPeriod>();
  for (const period of periods) {
    const existing = firstByProduct.get(period.productId);
    if (!existing || period.startDate < existing.startDate) firstByProduct.set(period.productId, period);
  }
  return [...firstByProduct.values()].filter((period) => monthKey(period.startDate) === month).map((period) => period.productId);
}

export function earlyRepeatsForMonth(products: Product[], periods: ConsumptionPeriod[], month: string) {
  const productMap = new Map(products.map((product) => [product.id, product]));
  return periods.flatMap((period) => {
    const product = productMap.get(period.productId);
    if (!product || monthKey(period.startDate) !== month || !isEarlyRepeat(periods.filter((p) => p.productId === product.id), period, product.rotationRule)) return [];
    const previous = previousPeriodFor(periods.filter((p) => p.productId === product.id), period)!;
    const expectedDate = getAvailableDate(previous.endDate, product.rotationRule);
    return [{ period, product, expectedDate }];
  });
}
