/** Små, rene leseverktøy for usikre verdier fra API-svar, URL-er og lagring. */
import { isRecord } from "./cashback.js";

export function readStringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readNumberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function readPositiveNumberValue(value: unknown): number | undefined {
  const numberValue = readNumberValue(value);
  return numberValue !== undefined && numberValue > 0 ? numberValue : undefined;
}

export function readNonNegativeIntegerValue(value: unknown): number | undefined {
  const parsedValue = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number.parseInt(value, 10)
      : Number.NaN;
  return Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : undefined;
}

export function readPositiveIntegerValue(value: unknown): number | undefined {
  const parsedValue = readNonNegativeIntegerValue(value);
  return parsedValue !== undefined && parsedValue > 0 ? parsedValue : undefined;
}

export function readIataCodeValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(trimmed)) return trimmed;
  return trimmed.match(/\b[A-Z]{3}\b/)?.[0];
}

export function readIsoDateValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const dateMatch = value.trim().match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const parsedValue = dateMatch?.[1];
  if (parsedValue === undefined) return undefined;
  const parsedDate = new Date(`${parsedValue}T00:00:00Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== parsedValue) {
    return undefined;
  }
  return parsedValue;
}

export function addDaysToIsoDate(isoDate: string, days: number): string | undefined {
  const time = new Date(`${isoDate}T00:00:00Z`).getTime();
  if (Number.isNaN(time)) return undefined;
  return new Date(time + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function parseJsonValue(value: string): unknown | undefined {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

export function readRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}
