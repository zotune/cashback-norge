// This file contains code to extract publicly available Coop member benefits.
// Login-only values are only included when they are stable public/member codes
// we maintain manually.
import {
  isRecord,
  type CashbackOffer,
  normalizeDomainInput,
  toBaseDomain,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import {
  extractKrReward,
  extractPercentageReward,
} from "../../shared/reward.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const BASE_URL = "https://www.coop.no";
const LISTING_API_URL =
  "https://www.coop.no/api/client/dynamic-data/resolve?language=nb-NO&d=%5B%7Bt%3A%22Coop.ContentApi.DynamicData.PageListingBlockPagesApiModel%2CCoop.ContentApi%22%2Cc%3A%7B%22blockId%22%3A%222Zi3Z5WXSjqXpzZpDgoPHU%22%2C%22siteTheme%22%3A%22coop%22%7D%7D%5D";

const BLOCKED_DOMAINS = new Set([
  "coop.no",
  "schema.org",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "apps.apple.com",
  "play.google.com",
  "google.com",
  "outlook.com",
  "microsoft.com",
]);

type CoopManualOffer = {
  merchantName?: string;
  domains?: string[];
  reward?: string;
  discountCode?: string;
  terms?: string[];
};

const MANUAL_OFFERS: Record<string, CoopManualOffer> = {
  circlek: {
    merchantName: "Circle K",
    domains: ["circlek.no"],
    reward: "0,25-0,45 kr/l",
    terms: [
      "Krever Coop-medlemskap.",
      "45 øre bonus per liter drivstoff på betjente Circle K-stasjoner.",
      "25 øre bonus per liter på ubetjente stasjoner.",
      "Registrer Coop-medlemskapet i Coop-appen, ved kassen eller i betalingsterminalen ved pumpen.",
    ],
  },
  vibb: {
    merchantName: "Vibb",
    domains: ["vibb.no"],
    reward: "20 %",
    terms: [
      "Krever Coop-medlemskap.",
      "Gjelder Vibb Spot Coop.",
      "20 % rabatt på Oss Brikken hos Vibb.",
      "Rabatten kommer automatisk på strømregningen når du har valgt Vibb Spot Coop.",
    ],
  },
  ving: {
    merchantName: "Ving",
    domains: ["ving.no"],
    reward: "600 kr",
    terms: [
      "Krever Coop-medlemskap.",
      "Alltid minst 600 kr rabatt per bestilling hos Ving.",
      "Gjelder nye bestillinger av pakkereiser med fly og hotell, og cruisepakker med cruise og fly.",
      "Må bestilles via Coop-siden; kan kombineres med andre tilbud og rabatter.",
    ],
  },
  riksteatret: {
    merchantName: "Riksteatret",
    domains: ["riksteatret.no"],
    reward: "50-100 kr",
    discountCode: "Coopteater",
    terms: [
      "Krever Coop-medlemskap.",
      "50 kr avslag på barne- og danseforestillinger.",
      "100 kr avslag på voksenforestillinger.",
      "Rabattkode: Coopteater.",
      "Vis medlemskort ved kjøp i luke eller bruk rabattkode på riksteatret.no.",
    ],
  },
  "coop-billetten": {
    merchantName: "Coop-billetten",
    domains: ["toppserien.no", "eliteserien.no"],
    reward: "50-100 kr",
    discountCode: "coopmedlem",
    terms: [
      "Krever Coop-medlemskap.",
      "Maks 100 kr voksenbillett og 50 kr barnebillett på Toppserien og Eliteserien.",
      "Promokode: coopmedlem.",
      "Kjøpes i klubbens digitale billettløsning; vis Coop-medlemskort ved inngang.",
    ],
  },
  hotellkupp: {
    merchantName: "Coop Hotellkupp",
    domains: ["coophotellkupp.com"],
    reward: "50 kr",
    terms: [
      "Krever Coop-medlemskap.",
      "50 kr ekstra rabatt per bestilling i kampanjeperioden.",
      "Gjelder utvalgte hoteller merket med tilbudet hos Coop Hotellkupp.",
      "Bestilles via Coop Hotellkupp.",
    ],
  },
  mer: {
    merchantName: "Mer",
    domains: ["no.mer.eco"],
    reward: "5-10 %",
    terms: [
      "Krever Coop-medlemskap.",
      "10 % ladebonus på Mer-ladere utenfor Coop-butikker.",
      "5 % ladebonus i resten av Mer sitt offentlige ladenettverk i Norge.",
      "Aktiver Coop-fordelen i Mer Connect.",
    ],
  },
  yx: {
    merchantName: "YX og Best",
    domains: ["yx.no"],
    reward: "0,45 kr/l",
    terms: [
      "Krever Coop-medlemskap.",
      "45 øre bonus per liter drivstoff hos YX og Best.",
      "Registrer Coop-medlemskapet i Coop-appen, ved kassen eller i betalingsterminalen ved pumpen.",
    ],
  },
};

type CoopPageSummary = {
  url: string;
  title: string;
  description?: string;
  updatedAt?: string;
};

export type CrawlCoopInput = {
  generatedAt: string;
  logger: Logger;
  overrides: ProviderOverrides;
};

export async function crawlCoop(input: CrawlCoopInput): Promise<CashbackOffer[]> {
  input.logger.info("Coop: fetching member benefit listing...");

  const summaries = await fetchListingPages();
  const detailSummaries = summaries.filter((summary) => {
    return summary.url.startsWith("/medlem/fordeler/") &&
      !summary.url.includes("/linkpage-");
  });
  input.logger.info(`Coop: ${detailSummaries.length} public benefit pages found`);

  const offers: CashbackOffer[] = [];
  let skippedNoDomain = 0;
  let skippedNoReward = 0;

  for (const summary of detailSummaries) {
    const slug = getCoopSlug(summary.url);
    if (slug === undefined) continue;

    const manual = MANUAL_OFFERS[slug];
    const detail = await fetchContentPage(summary.url);
    const content = isRecord(detail) ? detail.content : undefined;
    const textLines = collectHumanTextLines(content);
    const text = textLines.join("\n");

    const candidateDomains = extractDomains(content);
    const overrideDomains = input.overrides.coop?.[slug] ?? [];
    const manualDomains = manual?.domains ?? [];
    const domains = manualDomains.length > 0
      ? manualDomains
      : selectRelevantDomains(candidateDomains, summary, slug);
    const finalDomains = uniqueStrings([...domains, ...overrideDomains].map(normalizeDomainInput));

    if (finalDomains.length === 0) {
      skippedNoDomain++;
      continue;
    }

    const reward = manual?.reward ?? buildReward(summary, text, slug);
    if (!reward) {
      skippedNoReward++;
      continue;
    }

    const discountCode = manual?.discountCode ?? extractDiscountCode(text);
    const sourceUrl = new URL(summary.url, BASE_URL).toString();

    offers.push({
      provider: "coop",
      merchantName: manual?.merchantName ?? buildMerchantName(summary, finalDomains[0] ?? slug),
      domains: finalDomains,
      reward,
      sourceUrl,
      activationUrl: sourceUrl,
      terms: buildTerms(summary, textLines, manual, discountCode),
      ...(discountCode !== undefined ? { discountCode } : {}),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(
    `Coop: produced ${offers.length} offers (${skippedNoDomain} skipped no domain, ${skippedNoReward} skipped no reward)`,
  );
  return uniqueOffers(offers);
}

async function fetchListingPages(): Promise<CoopPageSummary[]> {
  const json = await fetchJson(LISTING_API_URL);
  if (!Array.isArray(json)) {
    throw new Error("Coop listing API returned unexpected data");
  }

  const pages: CoopPageSummary[] = [];
  for (const item of json) {
    if (!isRecord(item) || !Array.isArray(item.pages)) continue;
    for (const page of item.pages) {
      const summary = parsePageSummary(page);
      if (summary !== undefined) pages.push(summary);
    }
  }

  return pages;
}

async function fetchContentPage(path: string): Promise<unknown> {
  const apiUrl = new URL(`/api/content${path}`, BASE_URL).toString();
  return fetchJson(apiUrl);
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Coop API returned ${response.status} for ${url}`);
  }

  return response.json() as Promise<unknown>;
}

function parsePageSummary(value: unknown): CoopPageSummary | undefined {
  if (!isRecord(value)) return undefined;

  const url = readString(value.url);
  const title = readString(value.title);
  if (url === undefined || title === undefined) return undefined;

  const description = readString(value.description);
  const updatedAt = readString(value.updatedAt);

  return {
    url,
    title,
    ...(description !== undefined ? { description } : {}),
    ...(updatedAt !== undefined ? { updatedAt } : {}),
  };
}

function getCoopSlug(path: string): string | undefined {
  const parts = path.split("/").filter(Boolean);
  const fordelIndex = parts.indexOf("fordeler");
  if (fordelIndex === -1) return undefined;
  return parts[fordelIndex + 1];
}

function buildReward(summary: CoopPageSummary, text: string, slug: string): string {
  const rewardSource = buildRewardSource(summary, text);

  if (slug === "circlek" || slug === "yx" || slug === "mer") {
    const ore = extractCoopOreReward(rewardSource);
    if (ore) return ore;
  }

  const kr = extractKrReward(rewardSource);
  if (kr) return kr;

  const pct = extractPercentageReward(rewardSource);
  if (pct) return pct;

  return extractCoopOreReward(rewardSource);
}

function buildRewardSource(summary: CoopPageSummary, text: string): string {
  return [
    summary.title,
    summary.description ?? "",
    ...text.split("\n"),
  ]
    .map(cleanHumanText)
    .filter((line) => line.length > 0)
    .filter(isRewardCandidateLine)
    .join("\n");
}

function isRewardCandidateLine(line: string): boolean {
  if (!/(?:rabatt|bonus|avslag|ladebonus|spar|øre|kr|prosent|%)/i.test(line)) {
    return false;
  }

  if (/^\d+(?:[,.]\d+)?\s*%$/.test(line)) {
    return false;
  }

  if (/\b100\s*%\s+(?:fornøyd|fleksibelt|trygg)/i.test(line)) {
    return false;
  }

  if (/\b(?:desktop|mobile|banner|logo)\b/i.test(line)) {
    return false;
  }

  return true;
}

function extractCoopOreReward(text: string): string {
  const litreValues = [
    ...extractOreValues(text, /(\d+)\s*øre\s+(?:i\s+)?bonus\s+(?:pr|per)\s+liter/gi),
    ...extractOreValues(text, /(\d+)\s*øre\s+(?:rabatt\s+)?(?:pr|per)\s+liter/gi),
    ...extractOreValues(text, /(\d+)\s*øre\s*\/\s*l\b/gi),
  ];
  if (litreValues.length > 0) {
    return formatOreReward(litreValues, "kr/l");
  }

  const kwhValues = [
    ...extractOreValues(text, /(\d+)\s*øre\s*\/\s*k(?:w|v)t/gi),
    ...extractOreValues(text, /(\d+)\s*øre\s+(?:pr|per)\s*k(?:w|v)t/gi),
  ];
  return kwhValues.length > 0 ? formatOreReward(kwhValues, "kr/kWt") : "";
}

function extractOreValues(text: string, pattern: RegExp): number[] {
  const values: number[] = [];
  for (const match of text.matchAll(pattern)) {
    const value = Number.parseInt(match[1] ?? "", 10);
    if (value > 0) values.push(value);
  }
  return values;
}

function formatOreReward(values: number[], unit: string): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max
    ? `${formatOreAsKr(max)} ${unit}`
    : `${formatOreAsKr(min)}-${formatOreAsKr(max)} ${unit}`;
}

function formatOreAsKr(ore: number): string {
  return (ore / 100).toFixed(2).replace(".", ",");
}

function buildTerms(
  summary: CoopPageSummary,
  textLines: string[],
  manual: CoopManualOffer | undefined,
  discountCode: string | undefined,
): string {
  if (manual?.terms !== undefined) {
    return manual.terms.join("\n");
  }

  const lines = ["Krever Coop-medlemskap."];

  if (discountCode !== undefined) {
    lines.push(`Rabattkode: ${discountCode}.`);
  }

  const relevantLines = textLines
    .flatMap(splitSentences)
    .map(cleanHumanText)
    .map(cleanTermLine)
    .filter((line) => line.length > 0)
    .filter((line) => /(?:rabatt|bonus|kode|promokode|medlemskort|bestill|automatisk|gjelder|forutsetter|må|maks|avslag|kombineres|kjøpes)/i.test(line))
    .filter((line) => !/^(bli medlem|allerede medlem|logg inn|meld deg inn|les mer|bestill her|les mer og bestill her|logg inn og bestill her)$/i.test(line))
    .filter((line) => !/^coop medlem:?$/i.test(line));

  for (const line of relevantLines) {
    if (lines.length >= 7) break;
    addUniqueLine(lines, line);
  }

  if (lines.length === 1 && summary.description !== undefined) {
    addUniqueLine(lines, summary.description);
  }

  return lines.join("\n");
}

function cleanTermLine(line: string): string {
  const cleaned = line
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length > 180 ? `${cleaned.slice(0, 177).trim()}...` : cleaned;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function addUniqueLine(lines: string[], line: string): void {
  const normalized = line.toLowerCase().replace(/\s+/g, " ");
  if (!lines.some((existing) => existing.toLowerCase().replace(/\s+/g, " ") === normalized)) {
    lines.push(line);
  }
}

function extractDiscountCode(text: string): string | undefined {
  const patterns = [
    /(?:rabattkode|promokode|promo-kode|kampanjekode)\s*[:«"“]?\s*([a-z0-9æøå-]{3,30})[»"”]?/i,
    /bruk\s+(?:rabattkode|promokode|promo-kode)\s*[«"“]?([a-z0-9æøå-]{3,30})[»"”]?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const code = match?.[1]?.replace(/[.,;:!?]+$/, "");
    if (code !== undefined) return code;
  }

  return undefined;
}

function buildMerchantName(summary: CoopPageSummary, domain: string): string {
  const hosMatch = summary.title.match(/\bhos\s+(.+)$/i) ??
    summary.description?.match(/\bhos\s+(.+?)(?:\s+stasjoner|[,.]|$)/i);
  const nameFromText = hosMatch?.[1]?.trim();
  if (nameFromText !== undefined && nameFromText.length > 0) {
    return stripTrailingPunctuation(nameFromText);
  }

  const domainBase = toBaseDomain(domain).split(".")[0] ?? domain;
  if (domainBase.length > 0) return titleCaseDomain(domainBase);

  return summary.title;
}

function selectRelevantDomains(
  candidateDomains: string[],
  summary: CoopPageSummary,
  slug: string,
): string[] {
  const tokens = buildPageTokens(summary, slug);

  return candidateDomains.filter((domain) => {
    const stem = toBaseDomain(domain).split(".")[0] ?? domain;
    const normalizedStem = normalizeToken(stem);

    if (normalizedStem.length <= 2) {
      return tokens.includes(normalizedStem);
    }

    return tokens.some((token) => {
      return token.length >= 3 &&
        (normalizedStem.includes(token) || token.includes(normalizedStem));
    });
  });
}

function buildPageTokens(summary: CoopPageSummary, slug: string): string[] {
  const values = [
    slug,
    ...slug.split(/[-/]/),
    summary.title,
    summary.description ?? "",
  ];

  return uniqueStrings(values.flatMap((value) => {
    return normalizeToken(value)
      .split(/[^a-z0-9æøå]+/i)
      .filter((token) => token.length >= 3 || token === "yx");
  }));
}

function extractDomains(value: unknown): string[] {
  const domains: string[] = [];

  for (const url of collectUrls(value)) {
    const merchantUrl = decodeSafelink(url) ?? url;
    const parsedUrl = parseUrl(merchantUrl);
    if (parsedUrl === undefined) continue;
    if (isMediaPath(parsedUrl.pathname)) continue;

    const domain = normalizeDomainInput(parsedUrl.hostname);
    if (isBlockedDomain(domain)) continue;
    domains.push(domain);
  }

  return uniqueStrings(domains);
}

function collectUrls(value: unknown): string[] {
  const urls: string[] = [];

  function visit(current: unknown): void {
    if (typeof current === "string") {
      const trimmed = current.trim();
      if (/^https?:\/\//i.test(trimmed)) urls.push(trimmed);
      return;
    }

    if (Array.isArray(current)) {
      for (const item of current) visit(item);
      return;
    }

    if (isRecord(current)) {
      for (const item of Object.values(current)) visit(item);
    }
  }

  visit(value);
  return urls;
}

function decodeSafelink(url: string): string | undefined {
  const parsedUrl = parseUrl(url);
  if (parsedUrl === undefined) return undefined;

  const domain = normalizeDomainInput(parsedUrl.hostname);
  if (domain !== "safelinks.protection.outlook.com") return undefined;

  const target = parsedUrl.searchParams.get("url");
  return target ?? undefined;
}

function collectHumanTextLines(value: unknown): string[] {
  const lines: string[] = [];

  function visit(current: unknown): void {
    if (typeof current === "string") {
      const cleaned = cleanHumanText(current);
      if (isHumanTextLine(cleaned)) lines.push(cleaned);
      return;
    }

    if (Array.isArray(current)) {
      for (const item of current) visit(item);
      return;
    }

    if (isRecord(current)) {
      for (const item of Object.values(current)) visit(item);
    }
  }

  visit(value);
  return lines;
}

function cleanHumanText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isHumanTextLine(value: string): boolean {
  if (value.length < 2) return false;
  if (/^https?:\/\//i.test(value)) return false;
  if (value.startsWith("/")) return false;
  if (value.includes("/assets/")) return false;
  if (/\.(?:jpg|jpeg|png|gif|svg|webp)(?:\?|$)/i.test(value)) return false;
  if (/^[A-Za-z0-9+/=_-]{40,}$/.test(value)) return false;
  return true;
}

function isBlockedDomain(domain: string): boolean {
  return [...BLOCKED_DOMAINS].some((blocked) => {
    return domain === blocked || domain.endsWith(`.${blocked}`);
  });
}

function isMediaPath(pathname: string): boolean {
  return /\.(?:jpg|jpeg|png|gif|svg|webp|mp4|pdf|woff2?)(?:$|\?)/i.test(pathname);
}

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " og ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[.!?,;:]+$/, "").trim();
}

function titleCaseDomain(value: string): string {
  if (value.length <= 3) return value.toUpperCase();
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}
