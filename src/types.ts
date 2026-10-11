export type RotationRule = "weekly" | "biweekly" | "monthly";

export type Group = {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type Product = {
  id: string;
  name: string;
  groupId: string;
  rotationRule: RotationRule;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ConsumptionPeriod = {
  id: string;
  productId: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
};

export type AppSettings = {
  id: "app";
  schemaVersion: number;
  locale: "ru";
  onboardingCompleted: boolean;
};

export type Availability = "now" | "soon" | "later";

export const SYSTEM_GROUP_ID = "ungrouped";
export const SCHEMA_VERSION = 1;
