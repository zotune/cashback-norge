// Awin Publisher API data is fetched with a private user token, but only public
// programme metadata and affiliate click links are written to the index.
import { readFile } from "node:fs/promises";
import {
  type CashbackOffer,
  normalizeDomainInput,
  stripHtml,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import type { Logger } from "../logger.js";

const API_URL = "https://api.awin.com";
const DEFAULT_PUBLISHER_ID = "2934239";
const CHARITY_SHARE_OF_COMMISSION = 0.1;
const MIN_REQUEST_INTERVAL_MS = 3_100;

const PUBLISHER_ID_ENV_KEYS = [
  "AWIN_PUBLISHER_ID",
  "AWIN_PUBLISHERID",
  "AWIN_AFFILIATE_ID",
];

const TOKEN_ENV_KEYS = [
  "AWIN_ACCESS_TOKEN",
  "AWIN_API_KEY",
  "AWIN_API_TOKEN",
  "AWIN_TOKEN",
];

export type FetchAwinInput = {
  apiUrl?: string;
  accessToken?: string;
  publisherId?: string;
  generatedAt: string;
  logger: Logger;
};

type AwinCredentials = {
  accessToken: string;
  publisherId: string;
};

export type AwinProgramme = {
  clickThroughUrl?: string;
  currencyCode?: string;
  description?: string;
  displayUrl?: string;
  id?: number;
  linkStatus?: string;
  name?: string;
  primaryRegion?: {
    countryCode?: string;
    name?: string;
  };
  primarySector?: string;
  status?: string;
  validDomains?: AwinDomain[];
};

type AwinProgrammeDetailsResponse = {
  commissionRange?: AwinCommissionRange[];
  kpi?: AwinProgrammeKpi;
  programmeInfo?: AwinProgramme & {
    deeplinkEnabled?: boolean;
    membershipStatus?: string;
  };
};

type AwinCommissionGroupsResponse = {
  advertiser?: number;
  publisher?: number;
  commissionGroups?: AwinCommissionGroup[];
};

type AwinCommissionRange = {
  min?: number;
  max?: number;
  type?: string;
};

type AwinCommissionGroup = {
  amount?: number;
  currency?: string;
  groupCode?: string;
  groupName?: string;
  percentage?: number;
  type?: string;
};

type AwinDomain = {
  domain?: string;
};

type AwinProgrammeKpi = {
  approvalPercentage?: number;
  averagePaymentTime?: string;
  conversionRate?: number;
  epc?: number;
  validationDays?: number;
};

type AwinClient = {
  getJson: <T>(path: string, query?: Record<string, string>) => Promise<T>;
};

export async function fetchAwin(
  input: FetchAwinInput,
): Promise<CashbackOffer[]> {
  const credentials = await readAwinCredentials(input);
  if (credentials === undefined) {
    input.logger.warn(
      `Awin: ${TOKEN_ENV_KEYS[0]} or ${TOKEN_ENV_KEYS[1]} is missing, skipping`,
    );
    return [];
  }

  const apiUrl = input.apiUrl ?? API_URL;
  const client = createAwinClient(apiUrl, credentials.accessToken);

  input.logger.info("Awin: fetching joined programmes...");
  const programmes = await client.getJson<AwinProgramme[]>(
    `/publishers/${encodeURIComponent(credentials.publisherId)}/programmes`,
    { relationship: "joined" },
  );
  input.logger.info(`Awin: found ${programmes.length} joined programme(s)`);

  const offers: CashbackOffer[] = [];
  let skippedNoDomain = 0;
  let skippedNoReward = 0;
  let skippedNoTrackingUrl = 0;
  let skippedSecretLink = 0;
  let skippedInactive = 0;

  for (const programme of programmes) {
    const advertiserId = readAdvertiserId(programme);
    if (advertiserId === undefined) {
      skippedInactive++;
      continue;
    }

    const details = await client.getJson<AwinProgrammeDetailsResponse>(
      `/publishers/${encodeURIComponent(credentials.publisherId)}/programmedetails`,
      {
        advertiserId: String(advertiserId),
        relationship: "joined",
      },
    );

    const commissionGroups = await client.getJson<AwinCommissionGroupsResponse>(
      `/publishers/${encodeURIComponent(credentials.publisherId)}/commissiongroups`,
      { advertiserId: String(advertiserId) },
    ).catch((): AwinCommissionGroupsResponse => ({}));

    const programmeInfo = details.programmeInfo ?? programme;
    if (!isProgrammeActive(programmeInfo)) {
      skippedInactive++;
      continue;
    }

    const domains = selectProgrammeDomains(programmeInfo);
    if (domains.length === 0) {
      skippedNoDomain++;
      input.logger.warn(`Awin: no exact domain for ${programmeInfo.name ?? advertiserId}`);
      continue;
    }

    const activationUrl = normalizeUrl(programmeInfo.clickThroughUrl ?? programme.clickThroughUrl ?? "");
    if (activationUrl === undefined) {
      skippedNoTrackingUrl++;
      continue;
    }

    if (activationUrl.includes(credentials.accessToken)) {
      skippedSecretLink++;
      continue;
    }

    const reward = buildSupportReward(details.commissionRange ?? [], commissionGroups.commissionGroups ?? []);
    if (!reward) {
      skippedNoReward++;
      continue;
    }

    offers.push({
      provider: "cbn",
      merchantName: cleanMerchantName(programmeInfo.name ?? programme.name ?? `Awin ${advertiserId}`),
      domains,
      reward,
      sourceUrl: normalizeUrl(programmeInfo.displayUrl ?? programme.displayUrl ?? "") ?? `https://${domains[0]}`,
      activationUrl,
      terms: buildTerms(programmeInfo, details, commissionGroups.commissionGroups ?? []),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(
    `Awin: produced ${offers.length} support offers` +
      ` (${skippedNoDomain} no domain, ${skippedNoReward} no reward,` +
      ` ${skippedNoTrackingUrl} no tracking URL, ${skippedSecretLink} secret-link skips,` +
      ` ${skippedInactive} inactive)`,
  );

  return uniqueOffers(offers);
}

async function readAwinCredentials(
  input: FetchAwinInput,
): Promise<AwinCredentials | undefined> {
  const accessToken = input.accessToken ?? await readFirstConfiguredValue(TOKEN_ENV_KEYS);
  const publisherId = input.publisherId ?? await readFirstConfiguredValue(PUBLISHER_ID_ENV_KEYS) ?? DEFAULT_PUBLISHER_ID;

  if (!accessToken || !publisherId) {
    return undefined;
  }

  return {
    accessToken,
    publisherId,
  };
}

function createAwinClient(apiUrl: string, accessToken: string): AwinClient {
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
        throw new Error(`Awin API returned ${response.status} for ${path}`);
      }

      return await response.json() as T;
    },
  };
}

function readAdvertiserId(programme: AwinProgramme): number | undefined {
  return typeof programme.id === "number" && Number.isFinite(programme.id)
    ? programme.id
    : undefined;
}

function isProgrammeActive(programme: AwinProgramme): boolean {
  const status = programme.status?.trim().toLowerCase();
  if (status !== undefined && status !== "" && status !== "active") {
    return false;
  }

  const linkStatus = programme.linkStatus?.trim().toLowerCase();
  return linkStatus === undefined || linkStatus === "" || linkStatus === "online";
}

function selectProgrammeDomains(programme: AwinProgramme): string[] {
  const validDomains = (programme.validDomains ?? [])
    .map((domain) => normalizeProgrammeDomain(domain.domain ?? ""))
    .filter((domain): domain is string => domain !== undefined);
  if (validDomains.length > 0) {
    return uniqueStrings(validDomains);
  }

  const displayDomain = extractMerchantDomain(programme.displayUrl ?? "");
  return displayDomain === undefined ? [] : [displayDomain];
}

function normalizeProgrammeDomain(value: string): string | undefined {
  const withoutWildcard = value.trim().replace(/^\*\./, "");
  if (withoutWildcard.length === 0) return undefined;

  const domain = normalizeDomainInput(withoutWildcard);
  if (
    !domain.includes(".") ||
    domain === "awin.com" ||
    domain === "awin1.com" ||
    domain.endsWith(".awin1.com")
  ) {
    return undefined;
  }

  return domain;
}

function extractMerchantDomain(url: string): string | undefined {
  if (!url) return undefined;

  const domain = normalizeDomainInput(url);
  if (!domain.includes(".") || domain === "awin.com" || domain === "awin1.com") {
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
  commissionRanges: AwinCommissionRange[],
  commissionGroups: AwinCommissionGroup[],
): string {
  const percentageValues = uniqueNumbers([
    ...commissionRanges
      .filter((range) => normalizeCommissionType(range.type) === "percentage")
      .flatMap((range) => [range.min ?? 0, range.max ?? 0]),
    ...commissionGroups
      .filter((group) => normalizeCommissionType(group.type) === "percentage")
      .map((group) => group.percentage ?? 0),
  ]).filter((value) => value > 0 && value <= 100);
  if (percentageValues.length > 0) {
    return formatPercentRange(percentageValues);
  }

  const fixedValues = uniqueNumbers([
    ...commissionRanges
      .filter((range) => normalizeCommissionType(range.type) === "amount")
      .flatMap((range) => [range.min ?? 0, range.max ?? 0]),
    ...commissionGroups
      .filter((group) => normalizeCommissionType(group.type) === "fix" || normalizeCommissionType(group.type) === "amount")
      .map((group) => group.amount ?? 0),
  ]).filter((value) => value > 0);
  if (fixedValues.length > 0) {
    const currency = normalizeCurrency(commissionGroups.find((group) => group.currency)?.currency ?? "") || "kr";
    return `${formatNumberRange(fixedValues)} ${currency}`;
  }

  return "Veldedighet";
}

function buildTerms(
  programme: AwinProgramme,
  details: AwinProgrammeDetailsResponse,
  commissionGroups: AwinCommissionGroup[],
): string {
  const lines = [
    "Annonselenke via Awin.",
    "Dette er ikke cashback utbetalt til deg.",
    "Tallet i listen viser provisjonen CashbackNorge kan få, ikke cashback til deg.",
    "Det koster deg ingenting ekstra å bruke lenken.",
    "Når kjøpet spores, får CashbackNorge provisjon fra annonsøren.",
    "Resten av provisjonen går til drift og videreutvikling av CashbackNorge.",
    `${formatPercent(CHARITY_SHARE_OF_COMMISSION * 100)} av provisjonen settes av til veldedighet.`,
    buildCharityExampleLine(details.commissionRange ?? [], commissionGroups),
    "Totalen som går til veldedighet oppdateres på cashbacknorge.no.",
  ];

  const commissionSummary = buildCommissionSummary(details.commissionRange ?? [], commissionGroups);
  if (commissionSummary) lines.push(commissionSummary);
  if (programme.primarySector) lines.push(`Kategori: ${programme.primarySector}.`);
  if (programme.primaryRegion?.name) lines.push(`Region: ${programme.primaryRegion.name}.`);
  if (details.kpi?.conversionRate !== undefined) {
    lines.push(`Konverteringsrate hos Awin: ${formatPercent(details.kpi.conversionRate)}.`);
  }
  if (details.kpi?.approvalPercentage !== undefined) {
    lines.push(`Godkjenningsrate hos Awin: ${formatPercent(details.kpi.approvalPercentage)}.`);
  }
  if (details.kpi?.averagePaymentTime) {
    lines.push(`Gjennomsnittlig betalingstid hos Awin: ${details.kpi.averagePaymentTime} dager.`);
  }

  const description = cleanText(programme.description ?? "");
  if (description) lines.push(truncateText(description, 280));

  return uniquePreserveOrder(lines).join("\n");
}

function buildCharityExampleLine(
  commissionRanges: AwinCommissionRange[],
  commissionGroups: AwinCommissionGroup[],
): string {
  const percentageValues = uniqueNumbers([
    ...commissionRanges
      .filter((range) => normalizeCommissionType(range.type) === "percentage")
      .flatMap((range) => [range.min ?? 0, range.max ?? 0]),
    ...commissionGroups
      .filter((group) => normalizeCommissionType(group.type) === "percentage")
      .map((group) => group.percentage ?? 0),
  ]).filter((value) => value > 0 && value <= 100);
  if (percentageValues.length > 0) {
    return `Denne butikken: ${formatPercentRange(percentageValues)} provisjon x ${formatPercent(CHARITY_SHARE_OF_COMMISSION * 100)} = ca. ${formatPercentRange(scaleValues(percentageValues, CHARITY_SHARE_OF_COMMISSION))} av kjøpet til veldedighet.`;
  }

  return "Eksakt provisjon varierer eller mangler i Awin-data.";
}

function buildCommissionSummary(
  commissionRanges: AwinCommissionRange[],
  commissionGroups: AwinCommissionGroup[],
): string {
  const parts: string[] = [];
  const percentageValues = uniqueNumbers([
    ...commissionRanges
      .filter((range) => normalizeCommissionType(range.type) === "percentage")
      .flatMap((range) => [range.min ?? 0, range.max ?? 0]),
    ...commissionGroups
      .filter((group) => normalizeCommissionType(group.type) === "percentage")
      .map((group) => group.percentage ?? 0),
  ]).filter((value) => value > 0 && value <= 100);
  if (percentageValues.length > 0) {
    parts.push(`Salg: ${formatPercentRange(percentageValues)}`);
  }

  const fixedValues = uniqueNumbers(
    commissionGroups
      .filter((group) => normalizeCommissionType(group.type) === "fix" || normalizeCommissionType(group.type) === "amount")
      .map((group) => group.amount ?? 0),
  ).filter((value) => value > 0);
  if (fixedValues.length > 0) {
    const currency = normalizeCurrency(commissionGroups.find((group) => group.currency)?.currency ?? "") || "kr";
    parts.push(`Fast: ${formatNumberRange(fixedValues)} ${currency}`);
  }

  const groupNames = uniquePreserveOrder(
    commissionGroups
      .map((group) => cleanText(group.groupName ?? group.groupCode ?? ""))
      .filter(Boolean),
  ).slice(0, 8);
  if (groupNames.length > 0) {
    parts.push(`Grupper: ${groupNames.join(", ")}`);
  }

  return parts.length === 0 ? "" : `Provisjon hos Awin: ${parts.join(". ")}.`;
}

function normalizeCommissionType(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
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

function cleanMerchantName(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+\|\s+Awin$/i, "")
    .trim();
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
