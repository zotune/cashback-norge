// This file extracts publicly available KNBF member benefits.
// Login instructions and discount codes are deliberately never published.
import {
  Configuration,
  HttpCrawler,
  MemoryStorage,
  Request,
} from "crawlee";
import {
  type CashbackOffer,
  isRecord,
  normalizeDomainInput,
  parseUrl,
  stripHtml,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import {
  extractBenefitReward,
  extractPercentageReward,
} from "../../shared/reward.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import { merchantDomainsFromHostname } from "../merchant-domains.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const SITE_ORIGIN = "https://www.knbf.no";
const LIST_URL = `${SITE_ORIGIN}/medlemsfordeler/`;
const WORDPRESS_API_PATH = "/wp-json/wp/v2/pages";
const LIST_API_FIELDS = "id,slug,link,title,content";
const DETAIL_API_FIELDS = "id,parent,slug,link,title,content";
const LIST_API_URL = createListApiUrl();
const DEFAULT_TERMS = "Krever medlemskap i Kongelig Norsk Båtforbund (KNBF).";

const MERCHANT_NAME_BY_SLUG: Record<string, string> = {
  "norske-sjo-forsikring": "Norske Sjø Forsikring",
  "sonnak-batterier": "Sønnak",
  batadvokaten: "Båtadvokaten",
  watski: "Watski",
  batteributikken: "Batteributikken",
  "batens-verden": "Båtens Verden",
  warnme: "WarnMe",
  "engelsborg-media": "Engelsborg Media",
  oneup: "OneUp",
  "farco-as-litiumbatterier-solceller-tilbehor": "Farco",
  "batvarmere-fra-eberspracher": "Bilexperten / Eberspächer",
  "hansen-protection": "Hansen Protection",
  "nordic-dry-hold-baten-torr": "Nordic Dry",
  "den-store-norske-batforerproven": "Den store norske Båtførerprøven",
  "norsk-maritim-kurssenter-2": "Norsk Maritimt Kurssenter",
  "vera-tank-2": "Vera Tank",
  batmagasinet: "Båtmagasinet",
  "gullabonnement-pa-seilmagasinet": "SEILmagasinet",
  minbat: "Min Båt",
};

// Hansen's KNBF page has no outbound merchant link. These are the company's
// public corporate and storefront domains; overrides can replace them.
const FALLBACK_DOMAINS_BY_SLUG: Record<string, string[]> = {
  "hansen-protection": ["hansenprotection.no", "kalesjer.no"],
};

// The public WarnMe page formats its member price on the line after the
// "medlemsrabatt" label, which is intentionally kept out of code instructions.
const REWARD_BY_SLUG: Record<string, string> = {
  warnme: "19 kr/mnd",
};

const SKIP_HOSTNAMES = new Set([
  "knbf.no",
  "havneweb.no",
  "smartepenger.no",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "google.com",
  "google.no",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "gmpg.org",
  "schema.org",
  // Misspelled in the public Båtadvokaten prose; the actual linked firm is judicium.no.
  "judicum.no",
]);

export type FetchKnbfInput = {
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

type KnbfListEntry = {
  slug: string;
  sourceUrl: string;
};

type KnbfDetail = KnbfListEntry & {
  title: string;
  mainHtml: string;
  publicText: string;
};

type WordPressListPage = {
  id: number;
  content: string;
};

export async function fetchKnbf(input: FetchKnbfInput): Promise<CashbackOffer[]> {
  input.logger.info("KNBF: fetching public member benefits from WordPress API...");

  const listPage = parseWordPressListPage(await fetchOfficialApiJson(LIST_API_URL));
  const entries = extractDetailEntries(listPage.content);
  if (entries.length === 0) {
    throw new Error("KNBF API list page contained no public benefit links");
  }
  input.logger.info(`KNBF: found ${entries.length} public benefit pages`);

  const detailsUrl = createDetailApiUrl(listPage.id);
  const details = parseWordPressDetails(
    await fetchOfficialApiJson(detailsUrl),
    entries,
    listPage.id,
  );
  if (details.length !== entries.length) {
    const found = new Set(details.map((detail) => detail.slug));
    const missing = entries.filter((entry) => !found.has(entry.slug)).map((entry) => entry.slug);
    throw new Error(`KNBF API omitted active benefit pages: ${missing.join(", ")}`);
  }

  const offers: CashbackOffer[] = [];
  let fromContent = 0;
  let lookedUp = 0;
  let overrideCount = 0;
  let fallbackCount = 0;

  for (const detail of details) {
    const merchantName = MERCHANT_NAME_BY_SLUG[detail.slug] ?? cleanMerchantName(detail.title);

    let domains = (input.overrides.knbf?.[detail.slug] ?? [])
      .map(normalizeDomainInput)
      .filter(isAllowedMerchantHostname);
    if (domains.length > 0) overrideCount++;

    if (domains.length === 0) {
      domains = extractMerchantDomains(detail.mainHtml, detail.publicText);
      if (domains.length > 0) fromContent++;
    }

    if (domains.length === 0) {
      for (const lookupName of lookupNames(merchantName, detail.title)) {
        domains = lookupDomains(input.domainLookup, lookupName)
          .map(normalizeDomainInput)
          .filter(isAllowedMerchantHostname);
        if (domains.length > 0) {
          lookedUp++;
          break;
        }
      }
    }

    if (domains.length === 0) {
      domains = (FALLBACK_DOMAINS_BY_SLUG[detail.slug] ?? [])
        .map(normalizeDomainInput)
        .filter(isAllowedMerchantHostname);
      if (domains.length > 0) fallbackCount++;
    }

    domains = uniqueStrings(
      domains.flatMap((domain) => merchantDomainsFromHostname(domain)),
    );
    if (domains.length === 0) {
      input.logger.warn(`KNBF benefit has no domain: ${merchantName} (${detail.slug})`);
      continue;
    }

    offers.push({
      provider: "knbf",
      merchantName,
      domains,
      reward: REWARD_BY_SLUG[detail.slug] ?? extractKnbfReward(detail.publicText),
      sourceUrl: detail.sourceUrl,
      activationUrl: detail.sourceUrl,
      terms: buildTerms(detail.publicText),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(
    `KNBF: resolved ${fromContent} via public content, ${lookedUp} via lookup, ${overrideCount} via overrides, ${fallbackCount} via safe fallback`,
  );
  input.logger.info(`KNBF: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}

async function fetchOfficialApiJson(url: string): Promise<unknown> {
  if (!isAllowedOfficialApiUrl(url)) {
    throw new Error(`KNBF refused non-allowlisted API URL: ${url}`);
  }

  const storage = new MemoryStorage({ persistStorage: false });
  const crawlerConfig = new Configuration();
  crawlerConfig.useStorageClient(storage);
  let payload: unknown;

  const crawler = new HttpCrawler({
    maxConcurrency: 1,
    maxRequestRetries: 2,
    maxRequestsPerCrawl: 1,
    preNavigationHooks: [({ request }, options) => {
      if (!isAllowedOfficialApiUrl(request.url)) {
        throw new Error(`KNBF refused non-allowlisted API URL: ${request.url}`);
      }
      options.followRedirect = false;
    }],
    requestHandler: async ({ json, request, response }) => {
      const loadedUrl = request.loadedUrl ?? request.url;
      if (!isAllowedOfficialApiUrl(loadedUrl)) {
        throw new Error(`KNBF refused non-allowlisted API response URL: ${loadedUrl}`);
      }
      const statusCode = response.statusCode ?? 0;
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(`KNBF API returned HTTP ${statusCode} for ${request.url}`);
      }
      payload = json;
    },
  }, crawlerConfig);

  await crawler.run([new Request({
    url,
    headers: { Accept: "application/json" },
  })]);

  if (payload === undefined) {
    throw new Error(`KNBF crawler received no API response from ${url}`);
  }
  return payload;
}

function createListApiUrl(): string {
  const url = new URL(WORDPRESS_API_PATH, SITE_ORIGIN);
  url.searchParams.set("slug", "medlemsfordeler");
  url.searchParams.set("_fields", LIST_API_FIELDS);
  return url.toString();
}

function createDetailApiUrl(parentId: number): string {
  const url = new URL(WORDPRESS_API_PATH, SITE_ORIGIN);
  url.searchParams.set("parent", String(parentId));
  url.searchParams.set("per_page", "100");
  url.searchParams.set("_fields", DETAIL_API_FIELDS);
  return url.toString();
}

function isAllowedOfficialApiUrl(url: string): boolean {
  const parsed = parseUrl(url);
  if (parsed === undefined || parsed.origin !== SITE_ORIGIN || parsed.pathname !== WORDPRESS_API_PATH) {
    return false;
  }

  const keys = [...parsed.searchParams.keys()];
  const isListRequest = keys.length === 2 &&
    keys.every((key) => key === "slug" || key === "_fields") &&
    parsed.searchParams.get("slug") === "medlemsfordeler" &&
    parsed.searchParams.get("_fields") === LIST_API_FIELDS;
  if (isListRequest) return true;

  const parent = Number.parseInt(parsed.searchParams.get("parent") ?? "", 10);
  return keys.length === 3 &&
    keys.every((key) => key === "parent" || key === "per_page" || key === "_fields") &&
    Number.isSafeInteger(parent) && parent > 0 &&
    parsed.searchParams.get("per_page") === "100" &&
    parsed.searchParams.get("_fields") === DETAIL_API_FIELDS;
}

function parseWordPressListPage(value: unknown): WordPressListPage {
  if (!Array.isArray(value)) {
    throw new Error("KNBF list API returned invalid JSON");
  }
  const page = value.find((item) => {
    return isRecord(item) && item["slug"] === "medlemsfordeler" && item["link"] === LIST_URL;
  });
  if (
    !isRecord(page) ||
    typeof page["id"] !== "number" ||
    !Number.isSafeInteger(page["id"]) ||
    page["id"] <= 0 ||
    !isRecord(page["content"]) ||
    typeof page["content"]["rendered"] !== "string"
  ) {
    throw new Error("KNBF list API did not return the official overview page");
  }
  return { id: page["id"], content: page["content"]["rendered"] };
}

function parseWordPressDetails(
  value: unknown,
  entries: KnbfListEntry[],
  parentId: number,
): KnbfDetail[] {
  if (!Array.isArray(value)) {
    throw new Error("KNBF detail API returned invalid JSON");
  }

  const activeBySlug = new Map(entries.map((entry) => [entry.slug, entry]));
  const detailsBySlug = new Map<string, KnbfDetail>();
  for (const item of value) {
    if (!isRecord(item) || typeof item["slug"] !== "string") continue;
    const entry = activeBySlug.get(item["slug"]);
    if (entry === undefined) continue;
    if (
      item["parent"] !== parentId ||
      item["link"] !== entry.sourceUrl ||
      !isRecord(item["title"]) ||
      typeof item["title"]["rendered"] !== "string" ||
      !isRecord(item["content"]) ||
      typeof item["content"]["rendered"] !== "string"
    ) {
      continue;
    }

    const mainHtml = item["content"]["rendered"];
    const title = normalizeText(stripHtml(item["title"]["rendered"]));
    if (title === "" || mainHtml === "") continue;
    detailsBySlug.set(entry.slug, {
      ...entry,
      title,
      mainHtml,
      publicText: cutPrivateInstructions(extractMainText(mainHtml)),
    });
  }

  return entries.flatMap((entry) => {
    const detail = detailsBySlug.get(entry.slug);
    return detail === undefined ? [] : [detail];
  });
}

function extractDetailEntries(html: string): KnbfListEntry[] {
  const entries = new Map<string, KnbfListEntry>();
  for (const match of html.matchAll(/\bhref\s*=\s*(["'])(.*?)\1/gi)) {
    const rawHref = decodeAttribute(match[2] ?? "");
    const parsed = parseUrlAgainst(rawHref, LIST_URL);
    if (parsed === undefined || !isAllowedDetailUrl(parsed)) continue;

    const slug = parsed.pathname.split("/").filter(Boolean).at(-1) ?? "";
    if (slug === "") continue;
    entries.set(slug, {
      slug,
      sourceUrl: `${SITE_ORIGIN}/medlemsfordeler/${slug}/`,
    });
  }
  return [...entries.values()];
}

function isAllowedDetailUrl(url: URL): boolean {
  return url.origin === SITE_ORIGIN &&
    /^\/medlemsfordeler\/[a-z0-9-]+\/$/i.test(url.pathname);
}

function extractMainText(mainHtml: string): string {
  const cleaned = mainHtml
    .replace(/<(?:script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/(?:script|style|noscript|svg)>/gi, " ")
    .replace(/<\/(?:h[1-6]|p|li|div|section|article)>/gi, "\n");
  return stripHtml(cleaned)
    .split(/\n+/)
    .map(normalizeText)
    .filter(Boolean)
    .join("\n");
}

function cutPrivateInstructions(text: string): string {
  const cutIndex = text.search(
    /^(?:slik\s+(?:benytter|går|kommer)|finn\s+(?:din\s+)?rabattkode|se\s+hvordan\s+her)/im,
  );
  return cutIndex === -1 ? text : text.slice(0, cutIndex).trim();
}

function extractMerchantDomains(mainHtml: string, publicText: string): string[] {
  const domains: string[] = [];

  for (const match of mainHtml.matchAll(/\bhref\s*=\s*(["'])(.*?)\1/gi)) {
    const parsed = parseUrlAgainst(decodeAttribute(match[2] ?? ""), LIST_URL);
    if (parsed === undefined) continue;
    const domain = normalizeDomainInput(parsed.hostname);
    if (isAllowedMerchantHostname(domain)) domains.push(domain);
  }

  const textWithoutUrls = publicText.replace(/https?:\/\/\S+/gi, " ");
  for (const match of textWithoutUrls.matchAll(
    /\b(?:[a-z0-9æøå-]+\.)+(?:no|com|se|dk|net|org|app)\b/gi,
  )) {
    const domain = normalizeDomainInput(transliterateNorwegian(match[0] ?? ""));
    if (isAllowedMerchantHostname(domain)) domains.push(domain);
  }

  // URLs written as plain text are common on the older WordPress pages.
  for (const match of publicText.matchAll(/https?:\/\/[^\s)\]>"']+/gi)) {
    const parsed = parseUrl((match[0] ?? "").replace(/[.,;:!?]+$/, ""));
    if (parsed === undefined) continue;
    const domain = normalizeDomainInput(parsed.hostname);
    if (isAllowedMerchantHostname(domain)) domains.push(domain);
  }

  return uniqueStrings(domains);
}

function isAllowedMerchantHostname(hostname: string): boolean {
  const normalized = normalizeDomainInput(hostname);
  if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(normalized)) return false;
  return ![...SKIP_HOSTNAMES].some((skipped) => {
    return normalized === skipped || normalized.endsWith(`.${skipped}`);
  });
}

function extractKnbfReward(text: string): string {
  const normalized = normalizeRewardText(text);
  const lines = normalized.split(/\n+/);
  const selectedLines: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (!/\b(?:rabatt(?:er|en)?|avslag|medlemspris|medlemsfordel|fast\s+lavpris|gratis|medlem(?:mer)?\b[^.]{0,100}\bfor\b)\b/i.test(line) &&
      !/^\s*[-*•–]?\s*\d{1,3}(?:[,.]\d+)?\s*%\s+(?:på|hos|i)\b/i.test(line) &&
      !/\bkr\s*\d[\d ]*(?:[,.]\d+)?[^.\n]{0,50}\bper\s+måned\b/i.test(line)) {
      continue;
    }
    selectedLines.push(...lines.slice(index, index + 4));
  }
  const rewardText = uniqueStrings(selectedLines.map(normalizeText).filter(Boolean)).join("\n");

  const percentage = extractPercentageReward(rewardText);
  if (percentage !== "") return percentage;

  const reward = extractBenefitReward(rewardText);
  if (reward !== "" && reward !== "Rabatt") return reward;

  const monthlyPrice = normalized.match(
    /\bkr\s*(\d[\d ]*(?:[,.]\d+)?)[\s\S]{0,80}?\bper\s+måned\b/i,
  );
  if (monthlyPrice !== null) {
    const amount = parsePositiveInteger(monthlyPrice[1] ?? "");
    if (amount !== undefined) return `${formatNok(amount)} kr/mnd`;
  }

  const memberPrice = rewardText.match(
    /\b(?:medlem|medlemmer)[^.\n]{0,140}?\bfor\s+(?:kun\s+)?(?:kr\s*)?(\d[\d ]*(?:[,.]\d+)?)\s*(?:kroner|kr|,[-–])/i,
  ) ?? rewardText.match(
    /\bfor\s+kun\s+(?:kr\s*)?(\d[\d ]*(?:[,.]\d+)?)\s*(?:kroner|kr|,[-–])/i,
  );
  if (memberPrice !== null) {
    const amount = parsePositiveInteger(memberPrice[1] ?? "");
    if (amount !== undefined) return `${formatNok(amount)} kr totalsum`;
  }

  const discountAmounts: number[] = [];
  for (const line of rewardText.split(/\n+/)) {
    if (!/\b(?:rabatt|avslag)\b/i.test(line)) continue;
    for (const match of line.matchAll(/\bkr\s*(\d[\d ]*(?:[,.]\d+)?)/gi)) {
      const amount = parsePositiveInteger(match[1] ?? "");
      if (amount !== undefined && !discountAmounts.includes(amount)) {
        discountAmounts.push(amount);
      }
    }
  }
  if (discountAmounts.length > 0) {
    const min = Math.min(...discountAmounts);
    const max = Math.max(...discountAmounts);
    return min === max
      ? `${formatNok(max)} kr`
      : `${formatNok(min)}-${formatNok(max)} kr`;
  }

  return reward || "Medlemsfordel";
}

function normalizeRewardText(value: string): string {
  return value
    .replace(/(\d)\.(?=\d{3}\b)/g, "$1")
    .replace(/\bkr\.\s*/gi, "kr ")
    .replace(/\brabbatt\b/gi, "rabatt");
}

function buildTerms(text: string): string {
  const candidates = text
    .split(/\n+|(?<=[.!?])\s+/)
    .map(sanitizePublicLine)
    .filter(isUsefulTermsLine);
  return uniqueTextLines([...candidates.slice(0, 6), DEFAULT_TERMS]).join("\n");
}

function isUsefulTermsLine(line: string): boolean {
  if (line.length < 8 || line.length > 280 || isForbiddenPublicLine(line)) return false;
  const hasUsefulContent = /\b(?:rabatt(?:er|en)?|medlemspris(?:er)?|gratis|fast\s+lavpris|avslag|gjelder|unntatt|minus\s+produkter|kun\s+kr|frakt(?:fri|kostnad)|forhandlerpris|nettopris|medlemsbevis|kan\s+ikke|første\s+år|ordinær\s+pris|ved\s+kjøp|medlem(?:mer)?\b[^.]{0,100}\bfår\b)\b/i.test(line);
  return hasUsefulContent && (/\d/.test(line) || /\b(?:rabatt|gratis|lavpris|forhandlerpris|nettopris|medlemsbevis)\b/i.test(line));
}

function parsePositiveInteger(value: string): number | undefined {
  const amount = Number.parseInt(value.replace(/[\s.]/g, ""), 10);
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

function formatNok(value: number): string {
  return value.toLocaleString("nb-NO").replace(/[\u00a0\u202f]/g, " ");
}

function sanitizePublicLine(value: string): string {
  return normalizeText(
    value
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/\b\S+@\S+\.\S+\b/g, "")
      .replace(/^[-*•–]\s*/, ""),
  );
}

function isForbiddenPublicLine(line: string): boolean {
  return /smarte\s*penger|smartepenger\.no/i.test(line) ||
    /\b(?:rabatt\s*kode(?:n)?|rabattkode(?:n)?|kampanjekode(?:n)?|kupongkode(?:n)?|kodeord(?:et)?|koden?)\b/i.test(line) ||
    /\b(?:min\s+side|havneweb|logg(?:e)?\s+inn|medlemsnummer(?:et)?)\b/i.test(line);
}

function lookupNames(merchantName: string, title: string): string[] {
  return uniqueTextLines([
    merchantName,
    ...merchantName.split(/\s*\/\s*/),
    title,
    title.replace(/^rabatt\s+(?:hos|på)\s+/i, ""),
  ]);
}

function cleanMerchantName(title: string): string {
  return normalizeText(title)
    .replace(/^rabatt\s+(?:hos|på)\s+/i, "")
    .replace(/^medlemsfordel(?:er)?\s+(?:hos|på|fra)\s+/i, "");
}

function uniqueTextLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    const normalized = normalizeText(line);
    if (normalized === "" || isForbiddenPublicLine(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function parseUrlAgainst(rawUrl: string, baseUrl: string): URL | undefined {
  try {
    return new URL(rawUrl, baseUrl);
  } catch {
    return undefined;
  }
}

function decodeAttribute(value: string): string {
  return value.replace(/&amp;/gi, "&").replace(/&#0*38;/g, "&");
}

function transliterateNorwegian(value: string): string {
  return value
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a");
}

function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
