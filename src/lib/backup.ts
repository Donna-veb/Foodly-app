import type { AppSettings, ConsumptionPeriod, Group, Product } from "../types";
import { SCHEMA_VERSION, SYSTEM_GROUP_ID } from "../types";
import { parseLocalDate } from "./date";

export type BackupFile = {
  schemaVersion: number;
  exportedAt: string;
  settings: AppSettings;
  groups: Group[];
  products: Product[];
  periods: ConsumptionPeriod[];
};

const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0;

export function validateBackup(value: unknown): BackupFile {
  if (!value || typeof value !== "object") throw new Error("Файл не похож на резервную копию");
  const data = value as Partial<BackupFile>;
  if (data.schemaVersion !== SCHEMA_VERSION) throw new Error("Версия резервной копии не поддерживается");
  if (!Array.isArray(data.groups) || !Array.isArray(data.products) || !Array.isArray(data.periods) || !data.settings) {
    throw new Error("В файле не хватает обязательных данных");
  }
  const groupIds = new Set(data.groups.map((g) => g?.id));
  if (!groupIds.has(SYSTEM_GROUP_ID)) throw new Error("В резервной копии нет системной группы");
  for (const group of data.groups) {
    if (!isText(group?.id) || !isText(group?.name) || typeof group.sortOrder !== "number") throw new Error("Повреждены данные групп");
  }
  const productIds = new Set<string>();
  for (const product of data.products) {
    if (!isText(product?.id) || !isText(product?.name) || !groupIds.has(product.groupId) || !["weekly", "biweekly", "monthly"].includes(product.rotationRule)) {
      throw new Error("Повреждены данные продуктов");
    }
    productIds.add(product.id);
  }
  for (const period of data.periods) {
    if (!isText(period?.id) || !productIds.has(period.productId) || !isText(period.startDate) || !isText(period.endDate) || period.endDate < period.startDate) {
      throw new Error("Повреждены данные периодов");
    }
    parseLocalDate(period.startDate);
    parseLocalDate(period.endDate);
  }
  return data as BackupFile;
}
