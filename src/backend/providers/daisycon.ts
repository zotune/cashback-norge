// Daisycon Publisher API data is fetched via OAuth (refresh token grant), but
// only public program metadata and affiliate click links are written to the
// index. Daisycon issues a rotated refresh token on every refresh but keeps
// the old one valid, so the DAISYCON_REFRESH_TOKEN secret can stay static in
// CI; local runs persist the newest token to .env (or DAISYCON_REFRESH_TOKEN_FILE).
// One-time authorization: node scripts/dev/daisycon-auth.mjs
import { readFile, writeFile } from "node:fs/promises";
import {
  type CashbackOffer,
  normalizeDomainInput,
  stripHtml,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import type { Logger } from "../logger.js";

const API_URL = "https://services.daisycon.com";
const LOGIN_URL = "https://login.daisycon.com";
const CHARITY_SHARE_OF_COMMISSION = 0.1;
const PAGE_LIMIT = 250;

const CLIENT_ID_ENV_KEYS = ["DAISYCON_CLIENT_ID"];
const CLIENT_SECRET_ENV_KEYS = ["DAISYCON_CLIENT_SECRET"];
const REFRESH_TOKEN_ENV_KEYS = ["DAISYCON_REFRESH_TOKEN"];
const PUBLISHER_ID_ENV_KEYS = ["DAISYCON_PUBLISHER_ID"];
const MEDIA_ID_ENV_KEYS = ["DAISYCON_MEDIA_ID"];
const REFRESH_TOKEN_FILE_ENV_KEYS = ["DAISYCON_REFRESH_TOKEN_FILE"];

export type FetchDaisyconInput = {
  apiUrl?: string;
  loginUrl?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  publisherId?: string;
  mediaId?: string;
  generatedAt: string;
  logger: Logger;
};

type DaisyconCredentials = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  publisherId: string;
};

type DaisyconTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

type DaisyconMedia = {
  id?: number;
  name?: string;
};

type DaisyconCommission = {
  min_fixed?: number;
  max_fixed?: number;
  min_ratio?: number;
  max_ratio?: number;
  min_cpc?: number;
  max_cpc?: number;
};

type DaisyconProgram = {
  id?: number;
  advertiser_id?: number;
  name?: string;
  url?: string;
  display_url?: string;
  status?: string;
  commission?: DaisyconCommission[] | DaisyconCommission;
  currency_code?: string;
};

export async function fetchDaisycon(
  input: FetchDaisyconInput,
): Promise<CashbackOffer[]> {
  const credentials = await readDaisyconCredentials(input);
  if (credentials === undefined) {
    input.logger.warn(
      `Daisycon: ${CLIENT_ID_ENV_KEYS[0]}, ${REFRESH_TOKEN_ENV_KEYS[0]} or ${PUBLISHER_ID_ENV_KEYS[0]} is missing, skipping` +
        " (run scripts/dev/daisycon-auth.mjs for one-time authorization)",
    );
    return [];
  }

  const apiUrl = input.apiUrl ?? API_URL;
  const loginUrl = input.loginUrl ?? LOGIN_URL;

  input.logger.info("Daisycon: refreshing access token...");
  // An invalid refresh token (e.g. a lost rotation) must not fail the whole
  // daily crawl; the offers drop out until re-authorization instead.
  let accessToken: string;
  try {
    accessToken = await refreshAccessToken(loginUrl, credentials, input.logger);
  } catch (error) {
    input.logger.warn(
      `Daisycon: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }

  const mediaId = input.mediaId ??
    await readFirstConfiguredValue(MEDIA_ID_ENV_KEYS) ??
    await readDefaultMediaId(apiUrl, accessToken, credentials.publisherId, input.logger);
  if (!mediaId) {
    input.logger.warn("Daisycon: no media found, skipping");
    return [];
  }

  input.logger.info(`Daisycon: fetching subscribed programs for media ${mediaId}...`);
  const programs = await fetchSubscribedPrograms(
    apiUrl,
    accessToken,
    credentials.publisherId,
    mediaId,
  );
  input.logger.info(`Daisycon: found ${programs.length} subscribed program(s)`);

  const offers: CashbackOffer[] = [];
  let skippedNoDomain = 0;
  let skippedNoTrackingUrl = 0;
  let skippedInactive = 0;

  for (const program of programs) {
    if ((program.status ?? "active") !== "active") {
      skippedInactive++;
      continue;
    }

    const domains = selectProgramDomains(program);
    if (domains.length === 0) {
      skippedNoDomain++;
      input.logger.warn(`Daisycon: no exact domain for ${program.name ?? program.id}`);
      continue;
    }

    const activationUrl = normalizeActivationUrl(program.url ?? "");
    if (activationUrl === undefined) {
      skippedNoTrackingUrl++;
      continue;
    }

    const commissions = readCommissions(program);
    const reward = buildSupportReward(commissions, program.currency_code ?? "");

    offers.push({
      provider: "cbn",
      merchantName: cleanMerchantName(program.name ?? `Daisycon ${program.id}`),
      domains,
      reward,
      sourceUrl: normalizeMerchantUrl(program.display_url ?? "") ?? `https://${domains[0]}`,
      activationUrl,
      terms: buildTerms(commissions, program.currency_code ?? ""),
      updatedAt: input.generatedAt,
    });
  }

  const deduped = pickBestOfferPerDomain(offers);
  input.logger.info(
    `Daisycon: produced ${deduped.length} support offers` +
      ` (${skippedNoDomain} no domain, ${skippedNoTrackingUrl} no tracking URL,` +
      ` ${skippedInactive} inactive, ${offers.length - deduped.length} same-domain duplicates)`,
  );

  return uniqueOffers(deduped);
}

// Locale variants of the same program (e.g. "Ubisoft (NO)" / "Ubisoft (DE)")
// share one merchant domain; keep the variant most relevant for Norway so a
// click is attributed to the right campaign.
function pickBestOfferPerDomain(offers: CashbackOffer[]): CashbackOffer[] {
  const byDomains = new Map<string, CashbackOffer>();

  for (const offer of offers) {
    const key = [...offer.domains].sort().join(",");
    const existing = byDomains.get(key);
    if (existing === undefined || localeRank(offer.merchantName) > localeRank(existing.merchantName)) {
      byDomains.set(key, offer);
    }
  }

  return [...byDomains.values()];
}

function localeRank(merchantName: string): number {
  const suffix = merchantName.match(/\(([^)]*)\)\s*$/)?.[1]?.toUpperCase() ?? "";
  if (/\bNO\b/.test(suffix)) return 5;
  if (suffix.includes("NORDIC")) return 4;
  if (/\bINT\b/.test(suffix)) return 3;
  if (/\bEU\b/.test(suffix)) return 2;
  if (suffix === "") return 1;
  return 0;
}

async function readDaisyconCredentials(
  input: FetchDaisyconInput,
): Promise<DaisyconCredentials | undefined> {
  const clientId = input.clientId ?? await readFirstConfiguredValue(CLIENT_ID_ENV_KEYS);
  const clientSecret = input.clientSecret ?? await readFirstConfiguredValue(CLIENT_SECRET_ENV_KEYS) ?? "";
  const refreshToken = input.refreshToken ?? await readFirstConfiguredValue(REFRESH_TOKEN_ENV_KEYS);
  const publisherId = input.publisherId ?? await readFirstConfiguredValue(PUBLISHER_ID_ENV_KEYS);

  if (!clientId || !refreshToken || !publisherId) {
    return undefined;
  }

  return {
    clientId,
    clientSecret,
    refreshToken,
    publisherId,
  };
}

async function refreshAccessToken(
  loginUrl: string,
  credentials: DaisyconCredentials,
  logger: Logger,
): Promise<string> {
  const response = await fetch(`${loginUrl}/oauth/access-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "CashbackNorgeCrawler/1.0",
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: credentials.refreshToken,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(
      `Daisycon token refresh returned HTTP ${response.status};` +
        " if the refresh token expired, run scripts/dev/daisycon-auth.mjs" +
        " and update the DAISYCON_REFRESH_TOKEN secret",
    );
  }

  const tokens = await response.json() as DaisyconTokenResponse;
  if (!tokens.access_token) {
    throw new Error("Daisycon token refresh did not return an access token");
  }

  if (tokens.refresh_token && tokens.refresh_token !== credentials.refreshToken) {
    await persistRotatedRefreshToken(tokens.refresh_token, logger);
  }

  return tokens.access_token;
}

// Daisycon invalidates the used refresh token, so losing the rotated one
// means re-authorizing interactively.
async function persistRotatedRefreshToken(
  refreshToken: string,
  logger: Logger,
): Promise<void> {
  const tokenFile = await readFirstConfiguredValue(REFRESH_TOKEN_FILE_ENV_KEYS);
  if (tokenFile) {
    await writeFile(tokenFile, refreshToken, "utf8");
    logger.info(`Daisycon: rotated refresh token written to ${tokenFile}`);
    return;
  }

  try {
    const envFile = await readFile(".env", "utf8");
    if (envFile.split(/\r?\n/).some((line) => line.trimStart().startsWith("DAISYCON_REFRESH_TOKEN="))) {
      const updated = envFile
        .split(/\r?\n/)
        .map((line) =>
          line.trimStart().startsWith("DAISYCON_REFRESH_TOKEN=")
            ? `DAISYCON_REFRESH_TOKEN=${refreshToken}`
            : line,
        )
        .join("\n");
      await writeFile(".env", updated, "utf8");
      logger.info("Daisycon: rotated refresh token written to .env");
      return;
    }
  } catch {
    // fall through to the warning below
  }

  logger.warn(
    "Daisycon: refresh token rotated but no DAISYCON_REFRESH_TOKEN_FILE or .env entry to persist it;" +
      " the next run will need re-authorization",
  );
}

async function readDefaultMediaId(
  apiUrl: string,
  accessToken: string,
  publisherId: string,
  logger: Logger,
): Promise<string | undefined> {
  const media = await getJson<DaisyconMedia[]>(
    apiUrl,
    accessToken,
    `/publishers/${encodeURIComponent(publisherId)}/media`,
  );
  const mediaId = media.find((item) => typeof item.id === "number")?.id;
  if (mediaId === undefined) {
    return undefined;
  }

  logger.info(`Daisycon: using media ${mediaId} (${media[0]?.name ?? "unnamed"})`);
  return String(mediaId);
}

async function fetchSubscribedPrograms(
  apiUrl: string,
  accessToken: string,
  publisherId: string,
  mediaId: string,
): Promise<DaisyconProgram[]> {
  const programs: DaisyconProgram[] = [];

  for (let page = 1; ; page++) {
    const pagePrograms = await getJson<DaisyconProgram[]>(
      apiUrl,
      accessToken,
      `/publishers/${encodeURIComponent(publisherId)}/programs`,
      {
        media_id: mediaId,
        placeholder_media_id: mediaId,
        order_by: "name",
        order_direction: "asc",
        page: String(page),
        per_page: String(PAGE_LIMIT),
      },
    );
    programs.push(...pagePrograms);

    if (pagePrograms.length < PAGE_LIMIT) {
      break;
    }
  }

  return programs;
}

async function getJson<T>(
  apiUrl: string,
  accessToken: string,
  path: string,
  query: Record<string, string> = {},
): Promise<T> {
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

  // 204 is returned for empty collections (e.g. the last pagination page)
  if (response.status === 204) {
    return [] as T;
  }

  if (!response.ok) {
    throw new Error(`Daisycon API returned ${response.status} for ${path}`);
  }

  return await response.json() as T;
}

function readCommissions(program: DaisyconProgram): DaisyconCommission[] {
  if (Array.isArray(program.commission)) {
    return program.commission;
  }

  return program.commission === undefined ? [] : [program.commission];
}

function selectProgramDomains(program: DaisyconProgram): string[] {
  const domain = extractMerchantDomain(program.display_url ?? "");
  return domain === undefined ? [] : uniqueStrings([domain]);
}

function extractMerchantDomain(url: string): string | undefined {
  if (!url) return undefined;

  const domain = normalizeDomainInput(url);
  if (
    !domain.includes(".") ||
    domain === "daisycon.com" ||
    domain === "daisycon.io" ||
    domain.endsWith(".daisycon.com")
  ) {
    return undefined;
  }

  return domain;
}

function normalizeMerchantUrl(url: string): string | undefined {
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

function normalizeActivationUrl(url: string): string | undefined {
  // Unfilled tracking placeholders like #SUB_ID# are stripped;
  // the media ID is filled server-side via placeholder_media_id.
  // Tracking links are protocol-relative (e.g. //ds1.nl/c/?si=...).
  const withoutPlaceholders = url.replace(/(?:%23|#)[A-Z_0-9]+(?:%23|#)/g, "");

  try {
    const parsedUrl = new URL(
      withoutPlaceholders.startsWith("//")
        ? `https:${withoutPlaceholders}`
        : withoutPlaceholders,
    );
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return undefined;
    }

    return parsedUrl.toString();
  } catch {
    return undefined;
  }
}

function buildSupportReward(
  commissions: DaisyconCommission[],
  currencyCode: string,
): string {
  const ratioValues = uniqueNumbers(
    commissions.flatMap((commission) => [commission.min_ratio ?? 0, commission.max_ratio ?? 0]),
  ).filter((value) => value > 0 && value <= 100);
  if (ratioValues.length > 0) {
    return formatPercentRange(ratioValues);
  }

  const fixedValues = uniqueNumbers(
    commissions.flatMap((commission) => [commission.min_fixed ?? 0, commission.max_fixed ?? 0]),
  ).filter((value) => value > 0);
  if (fixedValues.length > 0) {
    return `${formatNumberRange(fixedValues)} ${normalizeCurrency(currencyCode) || "kr"}`;
  }

  const cpcValues = uniqueNumbers(
    commissions.flatMap((commission) => [commission.min_cpc ?? 0, commission.max_cpc ?? 0]),
  ).filter((value) => value > 0);
  if (cpcValues.length > 0) {
    return `${formatNumberRange(cpcValues)} ${normalizeCurrency(currencyCode) || "kr"}`;
  }

  return "Veldedighet";
}

function buildTerms(
  commissions: DaisyconCommission[],
  currencyCode: string,
): string {
  const lines = [
    "Annonselenke via Daisycon.",
    "Dette er ikke cashback utbetalt til deg.",
    "Tallet viser provisjonen CashbackNorge kan få.",
    "Det koster deg ingenting ekstra å bruke lenken.",
    `${formatPercent(CHARITY_SHARE_OF_COMMISSION * 100)} av provisjonen settes av til veldedighet.`,
    buildCharityExampleLine(commissions, currencyCode),
    "Resten går til drift og videreutvikling av CashbackNorge.",
    "Veldedighetstotalen oppdateres på cashbacknorge.no.",
  ];

  return uniquePreserveOrder(lines).join("\n");
}

function buildCharityExampleLine(
  commissions: DaisyconCommission[],
  currencyCode: string,
): string {
  const ratioValues = uniqueNumbers(
    commissions.flatMap((commission) => [commission.min_ratio ?? 0, commission.max_ratio ?? 0]),
  ).filter((value) => value > 0 && value <= 100);
  if (ratioValues.length > 0) {
    return `Denne butikken: ${formatPercentRange(ratioValues)} provisjon x ${formatPercent(CHARITY_SHARE_OF_COMMISSION * 100)} = ca. ${formatPercentRange(scaleValues(ratioValues, CHARITY_SHARE_OF_COMMISSION))} av kjøpet til veldedighet.`;
  }

  const fixedValues = uniqueNumbers(
    commissions.flatMap((commission) => [commission.min_fixed ?? 0, commission.max_fixed ?? 0]),
  ).filter((value) => value > 0);
  if (fixedValues.length > 0) {
    const currency = normalizeCurrency(currencyCode) || "kr";
    return `Denne butikken: ${formatNumberRange(fixedValues)} ${currency} provisjon x ${formatPercent(CHARITY_SHARE_OF_COMMISSION * 100)} = ca. ${formatNumberRange(scaleValues(fixedValues, CHARITY_SHARE_OF_COMMISSION))} ${currency} til veldedighet.`;
  }

  return "Eksakt provisjon varierer eller mangler i Daisycon-data.";
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

function cleanMerchantName(value: string): string {
  return stripHtml(value)
    .replace(/\s+/g, " ")
    .replace(/\s+\|\s+Daisycon$/i, "")
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
