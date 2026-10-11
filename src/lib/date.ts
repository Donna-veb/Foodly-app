import type { Availability, ConsumptionPeriod, RotationRule } from "../types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseLocalDate(value: string): Date {
  if (!DATE_RE.test(value)) throw new Error("Некорректная дата");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error("Некорректная дата");
  }
  return date;
}

export function toLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayLocal(): string {
  return toLocalDate(new Date());
}

export function addDays(value: string, days: number): string {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + days);
  return toLocalDate(date);
}

export function addCalendarMonth(value: string): string {
  const source = parseLocalDate(value);
  const year = source.getFullYear();
  const month = source.getMonth();
  const day = source.getDate();
  const lastDay = new Date(year, month + 2, 0).getDate();
  return toLocalDate(new Date(year, month + 1, Math.min(day, lastDay)));
}

export function getAvailableDate(endDate: string, rule: RotationRule): string {
  if (rule === "weekly") return addDays(endDate, 7);
  if (rule === "biweekly") return addDays(endDate, 14);
  return addCalendarMonth(endDate);
}

export function daysBetween(from: string, to: string): number {
  const a = parseLocalDate(from);
  const b = parseLocalDate(to);
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86_400_000);
}

export function getAvailability(availableDate: string | null, today = todayLocal()): Availability {
  if (!availableDate || availableDate <= today) return "now";
  return daysBetween(today, availableDate) <= 7 ? "soon" : "later";
}

export function sortPeriodsDesc(periods: ConsumptionPeriod[]): ConsumptionPeriod[] {
  return [...periods].sort((a, b) =>
    b.endDate.localeCompare(a.endDate) ||
    b.startDate.localeCompare(a.startDate) ||
    b.createdAt.localeCompare(a.createdAt)
  );
}

export function latestPeriod(periods: ConsumptionPeriod[]): ConsumptionPeriod | undefined {
  return sortPeriodsDesc(periods)[0];
}

export function previousPeriodFor(periods: ConsumptionPeriod[], candidate: ConsumptionPeriod): ConsumptionPeriod | undefined {
  return sortPeriodsDesc(periods.filter((item) => item.id !== candidate.id && item.startDate <= candidate.startDate))[0];
}

export function isEarlyRepeat(periods: ConsumptionPeriod[], candidate: ConsumptionPeriod, rule: RotationRule): boolean {
  const previous = previousPeriodFor(periods, candidate);
  return previous ? candidate.startDate < getAvailableDate(previous.endDate, rule) : false;
}

export function validatePeriod(startDate: string, endDate: string, today = todayLocal()): string | null {
  try {
    parseLocalDate(startDate);
    parseLocalDate(endDate);
  } catch {
    return "Проверьте даты периода";
  }
  if (endDate < startDate) return "Дата окончания не может быть раньше даты начала";
  if (startDate > today || endDate > today) return "Будущие даты пока нельзя добавлять";
  return null;
}

export function formatDate(value: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("ru-RU", options ?? { day: "numeric", month: "long" }).format(parseLocalDate(value));
}

export function formatPeriod(period: Pick<ConsumptionPeriod, "startDate" | "endDate">): string {
  if (period.startDate === period.endDate) return formatDate(period.startDate);
  const start = parseLocalDate(period.startDate);
  const end = parseLocalDate(period.endDate);
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()}–${formatDate(period.endDate)}`;
  }
  return `${formatDate(period.startDate)} — ${formatDate(period.endDate)}`;
}

export function ruleLabel(rule: RotationRule): string {
  return { weekly: "Раз в неделю", biweekly: "Раз в две недели", monthly: "Раз в месяц" }[rule];
}

export function pluralDays(days: number): string {
  const mod10 = days % 10;
  const mod100 = days % 100;
  const word = mod10 === 1 && mod100 !== 11 ? "день" : mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14) ? "дня" : "дней";
  return `${days} ${word}`;
}

export function monthKey(value: string): string {
  return value.slice(0, 7);
}

export function monthBounds(month: string): { start: string; end: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    start: `${year}-${String(monthNumber).padStart(2, "0")}-01`,
    end: toLocalDate(new Date(year, monthNumber, 0))
  };
}

export function periodOverlapsMonth(period: ConsumptionPeriod, month: string): boolean {
  const { start, end } = monthBounds(month);
  return period.startDate <= end && period.endDate >= start;
}

export function shiftMonth(month: string, delta: number): string {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(year, number - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
