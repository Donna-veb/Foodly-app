import Dexie, { type EntityTable } from "dexie";
import type { AppSettings, ConsumptionPeriod, Group, Product } from "./types";
import { SCHEMA_VERSION, SYSTEM_GROUP_ID } from "./types";

class RotationDatabase extends Dexie {
  groups!: EntityTable<Group, "id">;
  products!: EntityTable<Product, "id">;
  periods!: EntityTable<ConsumptionPeriod, "id">;
  settings!: EntityTable<AppSettings, "id">;

  constructor() {
    super("foodRotation");
    this.version(1).stores({
      groups: "id, sortOrder, name",
      products: "id, groupId, name, isArchived",
      periods: "id, productId, startDate, endDate",
      settings: "id"
    });
  }
}

export const db = new RotationDatabase();

export async function ensureDatabase(): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction("rw", db.groups, db.settings, async () => {
    if (!(await db.groups.get(SYSTEM_GROUP_ID))) {
      await db.groups.add({ id: SYSTEM_GROUP_ID, name: "Без группы", sortOrder: 0, createdAt: now, updatedAt: now });
    }
    if (!(await db.settings.get("app"))) {
      await db.settings.add({ id: "app", schemaVersion: SCHEMA_VERSION, locale: "ru", onboardingCompleted: false });
    }
  });
}

export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function makeId(): string {
  return crypto.randomUUID();
}
