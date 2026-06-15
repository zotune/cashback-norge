// Partner-Ads API data is fetched with a private API key, but only public
// merchant metadata and affiliate click links are written to the index.
import { readFile } from "node:fs/promises";
import {
  type CashbackOffer,
  normalizeDomainInput,
  stripHtml,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import {
  extractPercentageValues,
  formatPercentageReward,
} from "../../shared/reward.js";
import type { Logger } from "../logger.js";

const API_URL = "https://www.partner-ads.com/no/programoversigt_xml.php";
const ENV_KEY = "PARTNER_ADS_API_KEY";
const CHARITY_SHARE_OF_COMMISSION = 0.1;

export type FetchPartnerAdsInput = {
  apiKey?: string;
  apiUrl?: string;
  generatedAt: string;
  logger: Logger;
};

export type PartnerAdsProgram = {
  id: string;
  name: string;
  programUrl: string;
  description: string;
  terms: string;
  category: string;
  subcategory: string;
  feed: string;
  clickRate: string;
  leadRate: string;
  commission: string;
  epc: string;
  cashback: string;
  discountSites: string;
  affiliateLink: string;
  feedLink: string;
  feedCurrency: string;
  feedMarket: string;
  status: string;
};

export async function fetchPartnerAds(
  input: FetchPartnerAdsInput,
): Promise<CashbackOffer[]> {
  const apiKey = input.apiKey ?? await readPartnerAdsApiKey();
  if (!apiKey) {
    input.logger.warn(`Partner-Ads: ${ENV_KEY} is missing, skipping`);
    return [];
  }

  input.logger.info("Partner-Ads: fetching approved programs...");

  const url = new URL(input.apiUrl ?? API_URL);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("godkendte", "1");

  const response = await fetch(url, {
    headers: {
      Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
      "User-Agent": "CashbackNorgeCrawler/1.0",
    },
    signal: AbortSignal.timeout(30_000),
  });

  const xml = await readResponseText(response);
  if (response.status === 429) {
    input.logger.warn("Partner-Ads: rate limited by API, skipping for this crawl");
    return [];
  }

  if (!response.ok) {
    throw new Error(`Partner-Ads API returned ${response.status}`);
  }

  const programs = parsePartnerAdsProgramOverviewXml(xml);
  input.logger.info(`Partner-Ads: found ${programs.length} approved programs`);

  const offers: CashbackOffer[] = [];
  let skippedNoDomain = 0;
  let skippedNoReward = 0;
  let skippedNoAffiliateLink = 0;
  let skippedSecretLink = 0;

  for (const program of programs) {
    const domain = extractDomain(program.programUrl);
    if (domain === undefined) {
      skippedNoDomain++;
      continue;
    }

    const activationUrl = normalizeAffiliateLink(program.affiliateLink);
    if (activationUrl === undefined) {
      skippedNoAffiliateLink++;
      continue;
    }

    if (activationUrl.includes(apiKey)) {
      skippedSecretLink++;
      continue;
    }

    const reward = buildSupportReward(program);
    if (!reward) {
      skippedNoReward++;
      continue;
    }

    offers.push({
      provider: "cbn",
      merchantName: cleanMerchantName(program.name),
      domains: uniqueStrings([domain]),
      reward,
      sourceUrl: normalizeProgramUrl(program.programUrl) ?? `https://${domain}`,
      activationUrl,
      terms: buildTerms(program),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(
    `Partner-Ads: produced ${offers.length} support offers` +
      ` (${skippedNoDomain} no domain, ${skippedNoReward} no reward,` +
      ` ${skippedNoAffiliateLink} no affiliate link, ${skippedSecretLink} secret-link skips)`,
  );

  return uniqueOffers(offers);
}

export function parsePartnerAdsProgramOverviewXml(xml: string): PartnerAdsProgram[] {
  const programs: PartnerAdsProgram[] = [];
  const blocks = xml.match(/<program\b[\s\S]*?<\/program>/gi) ?? [];

  for (const block of blocks) {
    const program: PartnerAdsProgram = {
      id: readXmlTag(block, "programid"),
      name: readXmlTag(block, "programnavn"),
      programUrl: readXmlTag(block, "programurl"),
      description: readXmlTag(block, "programbeskrivelse"),
      terms: readXmlTag(block, "programbetingelser"),
      category: readXmlTag(block, "kategorinavn"),
      subcategory: readXmlTag(block, "underkategori"),
      feed: readXmlTag(block, "feed"),
      clickRate: readXmlTag(block, "klikksats"),
      leadRate: readXmlTag(block, "leadsats"),
      commission: readXmlTag(block, "provisjon"),
      epc: readXmlTag(block, "epc"),
      cashback: readXmlTag(block, "cashback"),
      discountSites: readXmlTag(block, "rabattsites"),
      affiliateLink: readXmlTag(block, "affiliatelink"),
      feedLink: readXmlTag(block, "feedlink"),
      feedCurrency: readXmlTag(block, "feedcur"),
      feedMarket: readXmlTag(block, "feedmarket"),
      status: readXmlTag(block, "status"),
    };

    if (program.name && program.programUrl) {
      programs.push(program);
    }
  }

  return programs;
}

async function readPartnerAdsApiKey(): Promise<string> {
  const envValue = process.env[ENV_KEY]?.trim();
  if (envValue) return stripEnvQuotes(envValue);

  try {
    const envFile = await readFile(".env", "utf8");
    const line = envFile
      .split(/\r?\n/)
      .find((candidate) => candidate.trimStart().startsWith(`${ENV_KEY}=`));
    const value = line?.split("=").slice(1).join("=").trim();
    return value ? stripEnvQuotes(value) : "";
  } catch {
    return "";
  }
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

function readXmlTag(block: string, tagName: string): string {
  const match = block.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`, "i"));
  if (match === null) return "";

  return decodeXml(stripCdata(match[1] ?? ""))
    .replace(/\s+/g, " ")
    .trim();
}

function stripCdata(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("<![CDATA[") && trimmed.endsWith("]]>")) {
    return trimmed.slice("<![CDATA[".length, -"]]>".length);
  }

  return value;
}

function decodeXml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, codePoint: string) => {
      return String.fromCodePoint(Number.parseInt(codePoint, 10));
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, codePoint: string) => {
      return String.fromCodePoint(Number.parseInt(codePoint, 16));
    })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'");
}

function extractDomain(programUrl: string): string | undefined {
  if (!programUrl) return undefined;

  const domain = normalizeDomainInput(programUrl);
  if (!domain.includes(".") || domain === "partner-ads.com") {
    return undefined;
  }

  return domain;
}

function normalizeProgramUrl(programUrl: string): string | undefined {
  try {
    const parsedUrl = new URL(programUrl.includes("://") ? programUrl : `https://${programUrl}`);
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return undefined;
    }

    return parsedUrl.toString();
  } catch {
    return undefined;
  }
}

function normalizeAffiliateLink(affiliateLink: string): string | undefined {
  try {
    const parsedUrl = new URL(affiliateLink);
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return undefined;
    }

    return parsedUrl.toString();
  } catch {
    return undefined;
  }
}

function buildSupportReward(program: PartnerAdsProgram): string {
  const currency = normalizeCurrency(program.feedCurrency) || "kr";
  const saleReward = extractCommissionReward(program.commission);
  if (saleReward) return saleReward;

  const leadReward = extractFixedReward(program.leadRate, currency);
  if (leadReward) return leadReward;

  const clickReward = extractFixedReward(program.clickRate, currency);
  if (clickReward) return clickReward;

  const fallbackReward = extractRewardFromRate([
    program.terms,
    program.description,
    program.cashback,
  ].filter(Boolean).join(" "));
  return fallbackReward || "Veldedighet";
}

function extractCommissionReward(value: string): string {
  const explicitReward = extractRewardFromRate(value);
  if (explicitReward) return explicitReward;

  const amount = parseBareRateNumber(value);
  return amount > 0 && amount <= 100
    ? formatPercent(amount)
    : "";
}

function extractFixedReward(value: string, fallbackCurrency: string): string {
  const explicitReward = extractRewardFromRate(value);
  if (explicitReward) return explicitReward;

  const amount = parseBareRateNumber(value);
  return amount > 0
    ? `${formatRewardNumber(amount)} ${fallbackCurrency}`
    : "";
}

function extractRewardFromRate(value: string): string {
  const percentageValues = extractPercentageValues(value);
  if (percentageValues.length > 0) {
    return formatPercentageReward(percentageValues);
  }

  return extractFixedRateReward(value);
}

function parseBareRateNumber(value: string): number {
  if (!/^\s*\d[\d\s.]*(?:[,.]\d+)?\s*$/.test(value)) return 0;
  return parseRewardAmount(value);
}

function extractFixedRateReward(value: string): string {
  const rewards = [
    ...extractCurrencyAmounts(value, /\b(NOK|DKK|SEK|EUR|kr)\s*(\d[\d\s.]*(?:,\d+)?)/gi),
    ...extractCurrencyAmounts(value, /(\d[\d\s.]*(?:,\d+)?)\s*(NOK|DKK|SEK|EUR|kr|kroner)\b/gi, true),
  ];

  if (rewards.length === 0) return "";

  const firstCurrency = rewards[0]?.currency ?? "kr";
  const sameCurrencyRewards = rewards.filter((reward) => reward.currency === firstCurrency);
  const values = sameCurrencyRewards.map((reward) => reward.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const valueLabel = min === max
    ? formatRewardNumber(max)
    : `${formatRewardNumber(min)}-${formatRewardNumber(max)}`;

  return `${valueLabel} ${firstCurrency}`;
}

function extractCurrencyAmounts(
  value: string,
  pattern: RegExp,
  amountFirst = false,
): Array<{ value: number; currency: string }> {
  const amounts: Array<{ value: number; currency: string }> = [];

  for (const match of value.matchAll(pattern)) {
    const rawAmount = amountFirst ? match[1] : match[2];
    const rawCurrency = amountFirst ? match[2] : match[1];
    const amount = parseRewardAmount(rawAmount ?? "");
    const currency = normalizeCurrency(rawCurrency ?? "");
    if (amount > 0 && currency) {
      amounts.push({ value: amount, currency });
    }
  }

  return amounts;
}

function normalizeCurrency(value: string): string {
  const upper = value.trim().toUpperCase();
  if (upper === "NOK" || upper === "KR" || upper === "KRONER") return "kr";
  if (upper === "DKK") return "DKK";
  if (upper === "SEK") return "SEK";
  if (upper === "EUR") return "EUR";
  return "";
}

function parseRewardAmount(value: string): number {
  const normalized = value
    .replace(/\s+/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatRewardNumber(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString("nb-NO").replace(/[\u00a0\u202f]/g, " ")
    : value.toLocaleString("nb-NO", { maximumFractionDigits: 2 }).replace(/[\u00a0\u202f]/g, " ");
}

function formatPercent(value: number): string {
  return `${formatRewardNumber(value)} %`;
}

function buildTerms(program: PartnerAdsProgram): string {
  const lines = [
    "Annonselenke via Partner-Ads.",
    "Dette er ikke cashback utbetalt til deg.",
    "Tallet i listen viser provisjonen CashbackNorge kan få, ikke cashback til deg.",
    "Det koster deg ingenting ekstra å bruke lenken.",
    "Når kjøpet spores, får CashbackNorge provisjon fra annonsøren.",
    "Resten av provisjonen går til drift og videreutvikling av CashbackNorge.",
    `${formatPercent(CHARITY_SHARE_OF_COMMISSION * 100)} av provisjonen settes av til veldedighet.`,
    buildCharityExampleLine(program),
    "Totalen som går til veldedighet oppdateres på cashbacknorge.no.",
  ];

  if (program.commission) lines.push(`Provisjon: ${program.commission}.`);
  if (program.leadRate) lines.push(`Lead: ${program.leadRate}.`);
  if (program.clickRate) lines.push(`Klikk: ${program.clickRate}.`);
  if (program.category) lines.push(`Kategori: ${program.category}.`);
  if (program.cashback) lines.push(`Cashbackstatus hos Partner-Ads: ${program.cashback}.`);
  if (program.discountSites) lines.push(`Rabattnettsteder: ${program.discountSites}.`);

  const extraTerms = cleanText(program.terms || program.description);
  if (extraTerms) lines.push(truncateText(extraTerms, 280));

  return uniquePreserveOrder(lines).join("\n");
}

function buildCharityExampleLine(program: PartnerAdsProgram): string {
  const currency = normalizeCurrency(program.feedCurrency) || "kr";
  const commissionPercent = parseBareRateNumber(program.commission);
  if (commissionPercent > 0 && commissionPercent <= 100) {
    return `Denne butikken: ${formatPercent(commissionPercent)} provisjon × ${formatPercent(CHARITY_SHARE_OF_COMMISSION * 100)} = ca. ${formatPercent(commissionPercent * CHARITY_SHARE_OF_COMMISSION)} av kjøpet til veldedighet.`;
  }

  const leadAmount = parseBareRateNumber(program.leadRate);
  if (leadAmount > 0) {
    return `Denne butikken: ${formatRewardNumber(leadAmount)} ${currency} provisjon × ${formatPercent(CHARITY_SHARE_OF_COMMISSION * 100)} = ca. ${formatRewardNumber(leadAmount * CHARITY_SHARE_OF_COMMISSION)} ${currency} til veldedighet.`;
  }

  const clickAmount = parseBareRateNumber(program.clickRate);
  if (clickAmount > 0) {
    return `Denne butikken: ${formatRewardNumber(clickAmount)} ${currency} per klikk × ${formatPercent(CHARITY_SHARE_OF_COMMISSION * 100)} = ca. ${formatRewardNumber(clickAmount * CHARITY_SHARE_OF_COMMISSION)} ${currency} til veldedighet.`;
  }

  return "Eksakt provisjon varierer eller mangler i Partner-Ads-data.";
}

function cleanText(value: string): string {
  return stripHtml(value)
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}…`;
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
    .replace(/\s+\|\s+Partner-Ads$/i, "")
    .trim();
}

async function readResponseText(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  const charsetMatch = contentType.match(/\bcharset=([^;\s]+)/i);
  const charset = charsetMatch?.[1]?.trim().toLowerCase();
  const arrayBuffer = await response.arrayBuffer();

  if (
    charset === "iso-8859-1" ||
    charset === "latin1" ||
    charset === "windows-1252"
  ) {
    return new TextDecoder("iso-8859-1").decode(arrayBuffer);
  }

  return new TextDecoder("utf-8").decode(arrayBuffer);
}
