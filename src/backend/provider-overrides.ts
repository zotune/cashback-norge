import {
  type CashbackProvider,
  isCashbackProvider,
  isRecord,
} from "../shared/cashback.js";
import { readJsonFile } from "./json-file.js";

export type ProviderOverrides = Record<CashbackProvider, Record<string, string[]>>;

export async function readProviderOverrides(
  filePath: string,
): Promise<ProviderOverrides> {
  const value = await readJsonFile(filePath);

  if (!isProviderOverrides(value)) {
    throw new Error(`Invalid provider overrides JSON: ${filePath}`);
  }

  return value;
}

export function isProviderOverrides(value: unknown): value is ProviderOverrides {
  if (!isRecord(value)) {
    return false;
  }

  if (
    !isProviderRecord(value.trumf) ||
    !isProviderRecord(value.klarna) ||
    !isProviderRecord(value.remember)
  ) {
    return false;
  }

  return Object.keys(value).every((provider) => {
    return isCashbackProvider(provider);
  });
}

function isProviderRecord(value: unknown): value is Record<string, string[]> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((domains) => {
    return Array.isArray(domains) && domains.every(isString);
  });
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
