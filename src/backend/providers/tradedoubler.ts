// Tradedoubler Publisher Management API data is fetched via OAuth password
// grant (static client id/secret + account username/password, no token
// rotation to persist), but only public program metadata and affiliate click
// links are written to the index.
import { readFile } from "node:fs/promises";
import {
  type CashbackOffer,
  normalizeDomainInput,
  stripHtml,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import type { Logger } from "../logger.js";

const API_URL = "https://connect.tradedoubler.com";
const CHARITY_SHARE_OF_COMMISSION = 0.1;
const PAGE_LIMIT = 100;
const MIN_REQUEST_INTERVAL_MS = 600;
const PROGRAM_STATUS_ACCEPTED = 3;
// Bookkeeping tariff events (claims/corrections), not sale commissions
const IGNORED_TARIFF_EVENTS = /inquiry|adjustment/i;
// Placeholder tariffs pay "100 % of the registered amount" and carry no rate of
// their own (Wolt NOR has one named "fixed fee" next to its real 103,5 kr sale
// tariff). Reading them as a commission rate would claim 100 % of the purchase.
const PLACEHOLDER_PERCENTAGE_FEE = 100;

const CLIENT_ID_ENV_KEYS = [
  "TRADEDOUBLER_CLIENT_ID",
  "TRADEDOUBLER_API_KEY",
];
const CLIENT_SECRET_ENV_KEYS = ["TRADEDOUBLER_CLIENT_SECRET"];
const USERNAME_ENV_KEYS = ["TRADEDOUBLER_USERNAME", "TRADEDOUBLER_USER"];
const PASSWORD_ENV_KEYS = ["TRADEDOUBLER_PASSWORD"];
const SOURCE_ID_ENV_KEYS = ["TRADEDOUBLER_SOURCE_ID", "TRADEDOUBLER_SITE_ID"];

export type FetchTradedoublerInput = {
  apiUrl?: string;
  clientId?: string;
  clientSecret?: string;
  username?: string;
  password?: string;
  sourceId?: string;
  generatedAt: string;
  logger: Logger;
};

type TradedoublerCredentials = {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
};

type TradedoublerTokenResponse = {
  access_token?: string;
};

type TradedoublerSource = {
  id?: number;
  name?: string;
};

type TradedoublerProgramListItem = {
  id?: number;
  name?: string;
  statusId?: number;
  paused?: boolean;
  homePage?: string;
  currencyCode?: string;
};

type TradedoublerProgramDetail = {
  id?: number;
  name?: string;
  statusId?: number;
  paused?: boolean;
  homePage?: string;
  currencyCode?: string;
  defaultTracker?: string;
  defaultTracking?: string;
  texts?: TradedoublerProgramText[];
  segmentTariffs?: TradedoublerSegmentTariff[];
};

type TradedoublerProgramText = {
  languageCode?: string;
  textTypeId?: number;
  text?: string;
};

type TradedoublerSegmentTariff = {
  id?: number;
  name?: string;
  tariffs?: TradedoublerTariff[];
};

type TradedoublerTariff = {
  eventName?: string;
  fixedFee?: number;
  percentageFee?: number;
};

type TradedoublerClient = {
  getJson: <T>(path: string, query?: Record<string, string>) => Promise<T>;
};

export async function fetchTradedoubler(
  input: FetchTradedoublerInput,
): Promise<CashbackOffer[]> {
  const credentials = await readTradedoublerCredentials(input);
  if (credentials === undefined) {
    input.logger.warn(
      `Tradedoubler: ${CLIENT_ID_ENV_KEYS[0]}, ${CLIENT_SECRET_ENV_KEYS[0]}, ` +
        `${USERNAME_ENV_KEYS[0]} or ${PASSWORD_ENV_KEYS[0]} is missing, skipping`,
    );
    return [];
  }

  const apiUrl = input.apiUrl ?? API_URL;

  input.logger.info("Tradedoubler: authenticating...");
  const accessToken = await fetchAccessToken(apiUrl, credentials);
  const client = createTradedoublerClient(apiUrl, accessToken);

  const sourceId = input.sourceId ??
    await readFirstConfiguredValue(SOURCE_ID_ENV_KEYS) ??
    await readDefaultSourceId(client, input.logger);
  if (!sourceId) {
    input.logger.warn("Tradedoubler: no source/site found, skipping");
    return [];
  }

  input.logger.info(`Tradedoubler: fetching accepted programs for source ${sourceId}...`);
  const programs = await fetchAcceptedPrograms(client, sourceId);
  input.logger.info(`Tradedoubler: found ${programs.length} accepted program(s)`);

  const offers: CashbackOffer[] = [];
  let skippedNoDomain = 0;
  let skippedNoTrackingUrl = 0;
  let skippedInactive = 0;

  for (const program of programs) {
    if (program.id === undefined) {
      skippedInactive++;
      continue;
    }

    const detail = await fetchProgramDetail(client, sourceId, program.id, input.logger);
    const merged = { ...program, ...detail };

    if (merged.paused === true) {
      skippedInactive++;
      continue;
    }

    const domains = selectProgramDomains(merged);
    if (domains.length === 0) {
      skippedNoDomain++;
      input.logger.warn(`Tradedoubler: no exact domain for ${merged.name ?? program.id}`);
      continue;
    }

    const activationUrl = normalizeUrl(merged.defaultTracker ?? merged.defaultTracking ?? "");
    if (activationUrl === undefined) {
      skippedNoTrackingUrl++;
      continue;
    }

    const tariffs = readSaleTariffs(merged);
    const reward = buildSupportReward(tariffs, merged.currencyCode ?? "");

    offers.push({
      provider: "cbn",
      merchantName: cleanMerchantName(merged.name ?? `Tradedoubler ${program.id}`),
      domains,
      reward,
      sourceUrl: normalizeUrl(merged.homePage ?? "") ?? `https://${domains[0]}`,
      activationUrl,
      terms: buildTerms(merged, tariffs),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(
    `Tradedoubler: produced ${offers.length} support offers` +
      ` (${skippedNoDomain} no domain, ${skippedNoTrackingUrl} no tracking URL,` +
      ` ${skippedInactive} paused/invalid)`,
  );

  return uniqueOffers(offers);
}

async function readTradedoublerCredentials(
  input: FetchTradedoublerInput,
): Promise<TradedoublerCredentials | undefined> {
  const clientId = input.clientId ?? await readFirstConfiguredValue(CLIENT_ID_ENV_KEYS);
  const clientSecret = input.clientSecret ?? await readFirstConfiguredValue(CLIENT_SECRET_ENV_KEYS);
  const username = input.username ?? await readFirstConfiguredValue(USERNAME_ENV_KEYS);
  const password = input.password ?? await readFirstConfiguredValue(PASSWORD_ENV_KEYS);

  if (!clientId || !clientSecret || !username || !password) {
    return undefined;
  }

  return {
    clientId,
    clientSecret,
    username,
    password,
  };
}

async function fetchAccessToken(
  apiUrl: string,
  credentials: TradedoublerCredentials,
): Promise<string> {
  const basicAuth = Buffer
    .from(`${credentials.clientId}:${credentials.clientSecret}`)
    .toString("base64");
  const body = new URLSearchParams({
    grant_type: "password",
    username: credentials.username,
    password: credentials.password,
  });

  const response = await fetch(`${apiUrl}/uaa/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "CashbackNorgeCrawler/1.0",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Tradedoubler token request returned HTTP ${response.status}`);
  }

  const tokens = await response.json() as TradedoublerTokenResponse;
  if (!tokens.access_token) {
    throw new Error("Tradedoubler token request did not return an access token");
  }

  return tokens.access_token;
}

function createTradedoublerClient(
  apiUrl: string,
  accessToken: string,
): TradedoublerClient {
  let lastRequestAt = 0;

  return {
    async getJson<T>(path: string, query: Record<string, string> = {}): Promise<T> {
      const now = Date.now();
      const waitMs = Math.max(0, MIN_REQUEST_INTERVAL_MS - (now - lastRequestAt));
      if (waitMs > 0) {
        await new Promise((resolveValue) => setTimeout(resolveValue, waitMs));
      }

      const url = new URL(path, apiUrl);
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "CashbackNorgeCrawler/1.0",
        },
        signal: AbortSignal.timeout(30_000),
      });
      lastRequestAt = Date.now();

      if (!response.ok) {
        throw new Error(`Tradedoubler API returned ${response.status} for ${path}`);
      }

      return await response.json() as T;
    },
  };
}

async function readDefaultSourceId(
  client: TradedoublerClient,
  logger: Logger,
): Promise<string | undefined> {
  const sources = unwrapItems<TradedoublerSource>(
    await client.getJson<unknown>("/publisher/sources"),
  );
  const source = sources.find((item) => typeof item.id === "number");
  if (source?.id === undefined) {
    return undefined;
  }

  logger.info(`Tradedoubler: using source ${source.id} (${source.name ?? "unnamed"})`);
  return String(source.id);
}

async function fetchAcceptedPrograms(
  client: TradedoublerClient,
  sourceId: string,
): Promise<TradedoublerProgramListItem[]> {
  const programs: TradedoublerProgramListItem[] = [];

  for (let offset = 0; ; offset += PAGE_LIMIT) {
    const page = unwrapItems<TradedoublerProgramListItem>(
      await client.getJson<unknown>("/publisher/programs", {
        sourceId,
        statusId: String(PROGRAM_STATUS_ACCEPTED),
        limit: String(PAGE_LIMIT),
        offset: String(offset),
      }),
    );
    programs.push(...page.filter((program) => program.statusId === PROGRAM_STATUS_ACCEPTED));

    if (page.length < PAGE_LIMIT) {
      break;
    }
  }

  return programs;
}

async function fetchProgramDetail(
  client: TradedoublerClient,
  sourceId: string,
  programId: number,
  logger: Logger,
): Promise<TradedoublerProgramDetail> {
  try {
    const detail = unwrapItems<TradedoublerProgramDetail>(
      await client.getJson<unknown>("/publisher/programs/detail", {
        sourceId,
        programId: String(programId),
      }),
    );
    return detail[0] ?? {};
  } catch (error) {
    logger.warn(
      `Tradedoubler: program detail unavailable for ${programId}: ${formatError(error)}`,
    );
    return {};
  }
}

// Responses come wrapped as [{ items: [...] }], { items: [...] }, [...] or a
// bare object depending on the endpoint.
function unwrapItems<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    const first = payload[0] as { items?: T[] } | undefined;
    if (first !== undefined && Array.isArray(first.items)) {
      return payload.flatMap((entry) => (entry as { items?: T[] }).items ?? []);
    }
    return payload as T[];
  }

  if (payload !== null && typeof payload === "object") {
    const items = (payload as { items?: T[] }).items;
    if (Array.isArray(items)) {
      return items;
    }
    return [payload as T];
  }

  return [];
}

function readSaleTariffs(detail: TradedoublerProgramDetail): TradedoublerTariff[] {
  return (detail.segmentTariffs ?? [])
    .flatMap((segment) => segment.tariffs ?? [])
    .filter((tariff) => !IGNORED_TARIFF_EVENTS.test(tariff.eventName ?? ""))
    .filter((tariff) => !isPlaceholderTariff(tariff));
}

function isPlaceholderTariff(tariff: TradedoublerTariff): boolean {
  return (tariff.percentageFee ?? 0) >= PLACEHOLDER_PERCENTAGE_FEE &&
    (tariff.fixedFee ?? 0) === 0;
}

function selectProgramDomains(detail: TradedoublerProgramDetail): string[] {
  const domain = extractMerchantDomain(detail.homePage ?? "");
  return domain === undefined ? [] : uniqueStrings([domain]);
}

function extractMerchantDomain(url: string): string | undefined {
  if (!url) return undefined;

  const domain = normalizeDomainInput(url);
  if (
    !domain.includes(".") ||
    domain === "tradedoubler.com" ||
    domain.endsWith(".tradedoubler.com")
  ) {
    return undefined;
  }

  return domain;
}

function normalizeUrl(url: string): string | undefined {
  try {
    const parsedUrl = new URL(url.includes("://") ? url : `https://${url}`);
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return undefined;
    }

    return parsedUrl.toString();
  } catch {
    return undefined;
  }
}

function buildSupportReward(
  tariffs: TradedoublerTariff[],
  currencyCode: string,
): string {
  const percentValues = uniqueNumbers(tariffs.map((tariff) => tariff.percentageFee ?? 0))
    .filter((value) => value > 0 && value <= 100);
  if (percentValues.length > 0) {
    return formatPercentRange(percentValues);
  }

  const fixedValues = uniqueNumbers(tariffs.map((tariff) => tariff.fixedFee ?? 0))
    .filter((value) => value > 0);
  if (fixedValues.length > 0) {
    return `${formatNumberRange(fixedValues)} ${normalizeCurrency(currencyCode) || "kr"}`;
  }

  return "Veldedighet";
}

function buildTerms(
  detail: TradedoublerProgramDetail,
  tariffs: TradedoublerTariff[],
): string {
  const lines = [
    "Annonselenke via Tradedoubler.",
    "Dette er ikke cashback utbetalt til deg.",
    "Tallet viser provisjonen CashbackNorge kan få.",
    "Det koster deg ingenting ekstra å bruke lenken.",
    `${formatPercent(CHARITY_SHARE_OF_COMMISSION * 100)} av provisjonen settes av til veldedighet.`,
    buildCharityExampleLine(tariffs, detail.currencyCode ?? ""),
    "Resten går til drift og videreutvikling av CashbackNorge.",
    "Veldedighetstotalen oppdateres på cashbacknorge.no.",
  ];

  const description = (detail.texts ?? [])
    .filter((text) => text.textTypeId === 2 || text.textTypeId === 3)
    .map((text) => cleanText(text.text ?? ""))
    .find(Boolean);
  if (description) lines.push(truncateText(description, 220));

  return uniquePreserveOrder(lines).join("\n");
}

function buildCharityExampleLine(
  tariffs: TradedoublerTariff[],
  currencyCode: string,
): string {
  const percentValues = uniqueNumbers(tariffs.map((tariff) => tariff.percentageFee ?? 0))
    .filter((value) => value > 0 && value <= 100);
  if (percentValues.length > 0) {
    return `Denne butikken: ${formatPercentRange(percentValues)} provisjon x ${formatPercent(CHARITY_SHARE_OF_COMMISSION * 100)} = ca. ${formatPercentRange(scaleValues(percentValues, CHARITY_SHARE_OF_COMMISSION))} av kjøpet til veldedighet.`;
  }

  const fixedValues = uniqueNumbers(tariffs.map((tariff) => tariff.fixedFee ?? 0))
    .filter((value) => value > 0);
  if (fixedValues.length > 0) {
    const currency = normalizeCurrency(currencyCode) || "kr";
    return `Denne butikken: ${formatNumberRange(fixedValues)} ${currency} provisjon x ${formatPercent(CHARITY_SHARE_OF_COMMISSION * 100)} = ca. ${formatNumberRange(scaleValues(fixedValues, CHARITY_SHARE_OF_COMMISSION))} ${currency} til veldedighet.`;
  }

  return "Eksakt provisjon varierer eller mangler i Tradedoubler-data.";
}

function normalizeCurrency(value: string): string {
  const upper = value.trim().toUpperCase();
  if (upper === "NOK" || upper === "KR") return "kr";
  if (upper === "DKK") return "DKK";
  if (upper === "SEK") return "SEK";
  if (upper === "EUR") return "EUR";
  if (upper === "USD") return "USD";
  if (upper === "GBP") return "GBP";
  return "";
}

function scaleValues(values: number[], scale: number): number[] {
  return values.map((value) => value * scale);
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isFinite(value)))];
}

function formatPercentRange(values: number[]): string {
  return `${formatNumberRange(values)} %`;
}

function formatNumberRange(values: number[]): string {
  if (values.length === 0) return "";

  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max
    ? formatRewardNumber(max)
    : `${formatRewardNumber(min)}-${formatRewardNumber(max)}`;
}

function formatPercent(value: number): string {
  return `${formatRewardNumber(value)} %`;
}

function formatRewardNumber(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString("nb-NO").replace(/[\u00a0\u202f]/g, " ")
    : value.toLocaleString("nb-NO", { maximumFractionDigits: 2 }).replace(/[\u00a0\u202f]/g, " ");
}

function cleanText(value: string): string {
  return stripHtml(value)
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}...`;
}

function cleanMerchantName(value: string): string {
  return stripHtml(value)
    .replace(/\s+/g, " ")
    .replace(/\s+\|\s+Tradedoubler$/i, "")
    .trim();
}

function uniquePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }

  return unique;
}

async function readFirstConfiguredValue(keys: string[]): Promise<string | undefined> {
  for (const key of keys) {
    const envValue = process.env[key]?.trim();
    if (envValue) return stripEnvQuotes(envValue);
  }

  try {
    const envFile = await readFile(".env", "utf8");
    for (const key of keys) {
      const line = envFile
        .split(/\r?\n/)
        .find((candidate) => candidate.trimStart().startsWith(`${key}=`));
      const value = line?.split("=").slice(1).join("=").trim();
      if (value) return stripEnvQuotes(value);
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function stripEnvQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
