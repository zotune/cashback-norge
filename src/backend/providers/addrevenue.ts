// Addrevenue API data is fetched with a private user token, but only public
// advertiser metadata and affiliate click links are written to the index.
import { readFile } from "node:fs/promises";
import {
  type CashbackOffer,
  normalizeDomainInput,
  stripHtml,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import type { Logger } from "../logger.js";

const API_URL = "https://addrevenue.io/api/v2";
const CHARITY_SHARE_OF_COMMISSION = 0.1;

const TOKEN_ENV_KEYS = [
  "ADDREVENUE_API_KEY",
  "ADDREVENUE_API_TOKEN",
  "ADDREVENUE_TOKEN",
];

const CHANNEL_ID_ENV_KEYS = [
  "ADDREVENUE_CHANNEL_ID",
  "ADDREVENUE_CHANNELID",
];

export type FetchAddrevenueInput = {
  apiUrl?: string;
  channelId?: string;
  generatedAt: string;
  logger: Logger;
  token?: string;
};

type AddrevenueCredentials = {
  token: string;
};

type AddrevenueApiResponse<T> = {
  count?: number;
  results?: T[];
};

type AddrevenueChannel = {
  id?: number;
  name?: string;
  status?: string;
};

type AddrevenueRelation = {
  advertiserId?: number;
  advertiserName?: string;
  channelId?: number;
  programs?: AddrevenueProgram[];
  status?: string;
  trackingLink?: string;
};

type AddrevenueAdvertiser = {
  categoryId?: string;
  displayName?: string;
  id?: number;
  markets?: Record<string, AddrevenueMarket>;
  name?: string;
  policyCashbackReward?: string | null;
  policyCouponRebate?: string | null;
  policyEmailMarketing?: string | null;
  policyPaidAds?: string | null;
  policySocialMedia?: string | null;
  relationStatus?: string;
  shortDescription?: string;
  url?: string;
};

type AddrevenueMarket = {
  activatedDate?: string | null;
  displayName?: string;
  endedDate?: string | null;
  market?: string;
  presentation?: string | null;
  redirectUrl?: string | null;
  shortDescription?: string | null;
  status?: string;
  url?: string | null;
};

type AddrevenueProgram = {
  amount?: string | number | null;
  commission?: string | null;
  commissionShort?: string | null;
  commissionType?: string | null;
  commissionUnit?: string | null;
  commissionValue?: string | number | null;
  currency?: string | null;
  markets?: string[];
  name?: string;
  percent?: string | number | null;
  status?: string;
};

type AddrevenueClient = {
  getResults: <T>(path: string, query?: Record<string, string>) => Promise<T[]>;
};

export async function fetchAddrevenue(
  input: FetchAddrevenueInput,
): Promise<CashbackOffer[]> {
  const credentials = await readAddrevenueCredentials(input);
  if (credentials === undefined) {
    input.logger.warn(
      `Addrevenue: ${TOKEN_ENV_KEYS[0]} is missing, skipping`,
    );
    return [];
  }

  const apiUrl = input.apiUrl ?? API_URL;
  const client = createAddrevenueClient(apiUrl, credentials.token);
  const channelId = input.channelId ?? await readFirstConfiguredValue(CHANNEL_ID_ENV_KEYS) ?? await readDefaultChannelId(client, input.logger);
  if (!channelId) {
    input.logger.warn("Addrevenue: no channel found, skipping");
    return [];
  }

  input.logger.info(`Addrevenue: fetching relations for channel ${channelId}...`);
  const [relations, advertisers] = await Promise.all([
    client.getResults<AddrevenueRelation>("/relations"),
    client.getResults<AddrevenueAdvertiser>("/advertisers", { channelId }),
  ]);

  const advertisersById = new Map(
    advertisers
      .filter((advertiser) => typeof advertiser.id === "number")
      .map((advertiser) => [advertiser.id!, advertiser]),
  );

  const offers: CashbackOffer[] = [];
  let skippedInactive = 0;
  let skippedNotNorway = 0;
  let skippedNoDomain = 0;
  let skippedNoReward = 0;
  let skippedNoTrackingUrl = 0;
  let skippedSecretLink = 0;

  for (const relation of relations) {
    if (!isRelationActive(relation)) {
      skippedInactive++;
      continue;
    }

    const advertiser = relation.advertiserId === undefined
      ? undefined
      : advertisersById.get(relation.advertiserId);
    const market = selectAdvertiserMarket(advertiser);
    if (!hasNorwayMarket(relation, advertiser, market)) {
      skippedNotNorway++;
      continue;
    }

    const domains = selectAdvertiserDomains(advertiser, market);
    if (domains.length === 0) {
      skippedNoDomain++;
      input.logger.warn(
        `Addrevenue: no exact domain for ${readMerchantName(relation, advertiser)}`,
      );
      continue;
    }

    const activationUrl = normalizeUrl(relation.trackingLink ?? "");
    if (activationUrl === undefined) {
      skippedNoTrackingUrl++;
      continue;
    }

    if (activationUrl.includes(credentials.token)) {
      skippedSecretLink++;
      continue;
    }

    const activePrograms = selectActiveNorwayPrograms(relation.programs ?? []);
    const reward = buildSupportReward(activePrograms);
    if (!reward) {
      skippedNoReward++;
      continue;
    }

    offers.push({
      provider: "cbn",
      merchantName: readMerchantName(relation, advertiser, market),
      domains,
      reward,
      sourceUrl: normalizeUrl(market?.url ?? market?.redirectUrl ?? advertiser?.url ?? "") ?? `https://${domains[0]}`,
      activationUrl,
      terms: buildTerms(relation, advertiser, market, activePrograms),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(
    `Addrevenue: produced ${offers.length} support offers` +
      ` (${skippedInactive} inactive, ${skippedNotNorway} non-Norway,` +
      ` ${skippedNoDomain} no domain, ${skippedNoReward} no reward,` +
      ` ${skippedNoTrackingUrl} no tracking URL, ${skippedSecretLink} secret-link skips)`,
  );

  return uniqueOffers(offers);
}

async function readAddrevenueCredentials(
  input: FetchAddrevenueInput,
): Promise<AddrevenueCredentials | undefined> {
  const token = input.token ?? await readFirstConfiguredValue(TOKEN_ENV_KEYS);
  return token ? { token } : undefined;
}

function createAddrevenueClient(apiUrl: string, token: string): AddrevenueClient {
  return {
    async getResults<T>(path: string, query: Record<string, string> = {}): Promise<T[]> {
      const url = new URL(`${apiUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`);
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "CashbackNorgeCrawler/1.0",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        throw new Error(`Addrevenue API returned ${response.status} for ${path}`);
      }

      const value = await response.json() as AddrevenueApiResponse<T>;
      return Array.isArray(value.results) ? value.results : [];
    },
  };
}

async function readDefaultChannelId(
  client: AddrevenueClient,
  logger: Logger,
): Promise<string | undefined> {
  const channels = await client.getResults<AddrevenueChannel>("/channels");
  const activeChannels = channels.filter((channel) => isActiveStatus(channel.status));
  if (activeChannels.length > 1) {
    logger.warn(
      `Addrevenue: found ${activeChannels.length} active channels; using the first one`,
    );
  }

  const channel = activeChannels[0] ?? channels[0];
  return channel?.id === undefined ? undefined : String(channel.id);
}

function isRelationActive(relation: AddrevenueRelation): boolean {
  return isActiveStatus(relation.status);
}

function isActiveStatus(status: string | undefined): boolean {
  const normalized = status?.trim().toLowerCase();
  return normalized === "active";
}

function selectAdvertiserMarket(
  advertiser: AddrevenueAdvertiser | undefined,
): AddrevenueMarket | undefined {
  const markets = advertiser?.markets ?? {};
  const norwayMarket = markets.NO;
  if (norwayMarket !== undefined && isMarketUsable(norwayMarket)) {
    return norwayMarket;
  }

  return Object.values(markets).find(isMarketUsable);
}

function isMarketUsable(market: AddrevenueMarket): boolean {
  if (market.endedDate) return false;
  return market.status === undefined || market.status === "" || isActiveStatus(market.status);
}

function hasNorwayMarket(
  relation: AddrevenueRelation,
  advertiser: AddrevenueAdvertiser | undefined,
  market: AddrevenueMarket | undefined,
): boolean {
  if (market?.market === "NO") return true;
  if (advertiser?.markets?.NO !== undefined) return true;

  return (relation.programs ?? []).some((program) => {
    return (program.markets ?? []).includes("NO");
  });
}

function selectAdvertiserDomains(
  advertiser: AddrevenueAdvertiser | undefined,
  market: AddrevenueMarket | undefined,
): string[] {
  const domains = [
    market?.url,
    market?.redirectUrl,
    advertiser?.url,
  ].flatMap((url) => {
    const domain = extractMerchantDomain(url ?? "");
    return domain === undefined ? [] : [domain];
  });

  return uniqueStrings(domains);
}

function extractMerchantDomain(url: string): string | undefined {
  if (!url) return undefined;
  const domain = normalizeDomainInput(url);
  if (
    !domain.includes(".") ||
    domain === "addrevenue.io" ||
    domain.endsWith(".addrevenue.io")
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

function selectActiveNorwayPrograms(programs: AddrevenueProgram[]): AddrevenueProgram[] {
  const active = programs.filter((program) => {
    return isActiveStatus(program.status) &&
      ((program.markets ?? []).length === 0 || (program.markets ?? []).includes("NO"));
  });

  return active.length > 0
    ? active
    : programs.filter((program) => isActiveStatus(program.status));
}

function buildSupportReward(programs: AddrevenueProgram[]): string {
  const percentageValues = uniqueNumbers(
    programs.flatMap((program) => [
      readNumber(program.percent),
      readProgramCommissionValue(program, "%"),
    ]),
  ).filter((value) => value > 0 && value <= 100);
  if (percentageValues.length > 0) {
    return formatPercentRange(percentageValues);
  }

  const fixedRewards = programs.flatMap((program) => {
    const amount = readNumber(program.amount) || readProgramCommissionValue(program, normalizeCurrency(program.currency ?? ""));
    if (amount <= 0) return [];
    const currency = normalizeCurrency(program.currency ?? program.commissionUnit ?? "") || "kr";
    return [{ amount, currency }];
  });
  if (fixedRewards.length > 0) {
    const currency = fixedRewards[0]?.currency ?? "kr";
    const sameCurrencyRewards = fixedRewards.filter((reward) => reward.currency === currency);
    return `${formatNumberRange(sameCurrencyRewards.map((reward) => reward.amount))} ${currency}`;
  }

  return "";
}

function readProgramCommissionValue(
  program: AddrevenueProgram,
  expectedUnit: string,
): number {
  const unit = normalizeCurrency(program.commissionUnit ?? "") || normalizeCommissionUnit(program.commissionUnit);
  if (unit !== expectedUnit) return 0;
  return readNumber(program.commissionValue);
}

function normalizeCommissionUnit(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  return trimmed === "%" ? "%" : "";
}

function buildTerms(
  relation: AddrevenueRelation,
  advertiser: AddrevenueAdvertiser | undefined,
  market: AddrevenueMarket | undefined,
  programs: AddrevenueProgram[],
): string {
  const lines = [
    "Annonselenke via Addrevenue.",
    "Dette er ikke cashback utbetalt til deg.",
    "Tallet viser provisjonen CashbackNorge kan få.",
    "Det koster deg ingenting ekstra å bruke lenken.",
    `${formatPercent(CHARITY_SHARE_OF_COMMISSION * 100)} av provisjonen settes av til veldedighet.`,
    buildCharityExampleLine(programs),
    "Resten går til drift og videreutvikling av CashbackNorge.",
    "Veldedighetstotalen oppdateres på cashbacknorge.no.",
  ];

  const description = cleanText(market?.presentation ?? market?.shortDescription ?? advertiser?.shortDescription ?? "");
  if (description) lines.push(truncateText(description, 220));

  return uniquePreserveOrder(lines).join("\n");
}

function buildCharityExampleLine(programs: AddrevenueProgram[]): string {
  const percentageValues = uniqueNumbers(
    programs.flatMap((program) => [
      readNumber(program.percent),
      readProgramCommissionValue(program, "%"),
    ]),
  ).filter((value) => value > 0 && value <= 100);
  if (percentageValues.length > 0) {
    return `Denne butikken: ${formatPercentRange(percentageValues)} provisjon x ${formatPercent(CHARITY_SHARE_OF_COMMISSION * 100)} = ca. ${formatPercentRange(scaleValues(percentageValues, CHARITY_SHARE_OF_COMMISSION))} av kjøpet til veldedighet.`;
  }

  const fixedRewards = programs.flatMap((program) => {
    const amount = readNumber(program.amount) || readProgramCommissionValue(program, normalizeCurrency(program.currency ?? ""));
    if (amount <= 0) return [];
    const currency = normalizeCurrency(program.currency ?? program.commissionUnit ?? "") || "kr";
    return [{ amount, currency }];
  });
  if (fixedRewards.length > 0) {
    const currency = fixedRewards[0]?.currency ?? "kr";
    const sameCurrencyRewards = fixedRewards.filter((reward) => reward.currency === currency);
    return `Denne butikken: ${formatNumberRange(sameCurrencyRewards.map((reward) => reward.amount))} ${currency} provisjon x ${formatPercent(CHARITY_SHARE_OF_COMMISSION * 100)} = ca. ${formatNumberRange(scaleValues(sameCurrencyRewards.map((reward) => reward.amount), CHARITY_SHARE_OF_COMMISSION))} ${currency} til veldedighet.`;
  }

  return "Eksakt provisjon varierer eller mangler i Addrevenue-data.";
}

function buildCommissionSummary(programs: AddrevenueProgram[]): string {
  const parts = uniquePreserveOrder(
    programs
      .map((program) => cleanText(program.commissionShort ?? program.commission ?? ""))
      .filter(Boolean),
  );
  return parts.length === 0 ? "" : `Provisjon hos Addrevenue: ${parts.join(", ")}.`;
}

function readMerchantName(
  relation: AddrevenueRelation,
  advertiser: AddrevenueAdvertiser | undefined,
  market?: AddrevenueMarket,
): string {
  return cleanMerchantName(
    market?.displayName ??
      advertiser?.displayName ??
      advertiser?.name ??
      relation.advertiserName ??
      `Addrevenue ${relation.advertiserId ?? ""}`,
  );
}

function cleanMerchantName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function formatCategory(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function readNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = value?.trim().replace(",", ".") ?? "";
  if (!normalized) return 0;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
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
