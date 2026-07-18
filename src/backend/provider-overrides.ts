import { isRecord } from "../shared/cashback.js";
import { readJsonFile } from "./json-file.js";

type OverrideDomains = Record<string, string[]>;

// Providers whose crawlers read their overrides with dot access; these keys
// are required in data/provider-overrides.json. Any other provider id can be
// present and is looked up dynamically (possibly undefined).
const REQUIRED_OVERRIDE_PROVIDERS = [
  "trumf", "klarna", "remember", "sas", "tfbank", "obos", "bob", "usbl",
  "bate", "tobb", "logbuy", "naf", "tekna", "nito",
] as const;

type RequiredOverrideProvider = (typeof REQUIRED_OVERRIDE_PROVIDERS)[number];

export type ProviderOverrides =
  & Record<RequiredOverrideProvider, OverrideDomains>
  & Partial<Record<string, OverrideDomains>>;

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

  if (!REQUIRED_OVERRIDE_PROVIDERS.every((provider) => isProviderRecord(value[provider]))) {
    return false;
  }

  return Object.values(value).every(isProviderRecord);
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
