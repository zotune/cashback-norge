// Public member benefits from Hørselsforbundet's official website.
// Codes shown on public pages or reserved for Min side are never collected.
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
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import { extractBenefitReward } from "../../shared/reward.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const SITE_ORIGIN = "https://www.hlf.no";
const LIST_PATH = "/medlemskap/medlemsfordeler";
const SANITY_API_ORIGIN = "https://ajniw4rx.api.sanity.io";
const SANITY_API_PATH = "/v2025-02-19/data/query/production";
const SANITY_QUERY = `*[
  _type == "page" && slug.current == "medlemskap/medlemsfordeler"
][0].modules[
  _type == "contentListModule" && selectContentType == "membershipBenefits"
][0].membershipBenefits[]->{title,"slug":slug.current,modules}`;
const SANITY_API_URL = createSanityApiUrl();
const DEFAULT_TERMS =
  "Krever medlemskap i Hørselsforbundet.";

const MERCHANT_NAME_BY_SLUG: Record<string, string> = {
  "juridisk-hjelp-legalis": "Advokatfirmaet Legalis",
  tryg: "Tryg",
  fjordkraft: "Fjordkraft",
  radisson: "Radisson Hotels",
  "reiser-med-springtime": "Springtime",
  "hotellavtale-ffo": "FFO hotellavtaler",
  "filmweb-kinoklubb": "Filmweb Kinoklubb",
  "rabatt-kinogavekort": "Filmweb Kinogavekort",
  interoptik: "Interoptik",
  brilleland: "Brilleland",
};

// The official pages sometimes link to a booking route, an association page
// or several hotel chains. These are the merchant sites where the extension
// should surface the benefit.
const DOMAINS_BY_SLUG: Record<string, string[]> = {
  "juridisk-hjelp-legalis": ["legalis.no"],
  tryg: ["tryg.no"],
  fjordkraft: ["fjordkraft.no"],
  radisson: ["radissonhotels.com"],
  "reiser-med-springtime": ["springtime.no"],
  "hotellavtale-ffo": ["scandichotels.com", "strawberry.no", "thonhotels.no"],
  "filmweb-kinoklubb": ["kinoklubb.no"],
  "rabatt-kinogavekort": ["kinogavekort.no"],
  interoptik: ["interoptik.no"],
  brilleland: ["brilleland.no"],
};

const REWARD_BY_SLUG: Record<string, string> = {
  fjordkraft: "Medlemsfordel",
  radisson: "12 %",
  "hotellavtale-ffo": "Medlemspris",
  "filmweb-kinoklubb": "25 %",
  "rabatt-kinogavekort": "10 %",
};

const EXCLUDED_SLUGS = new Set([
  "fagbladet-din-horsel",
  "forsikring-pa-horeapparat",
  "sosial-moteplass",
]);

const SKIP_HOSTNAMES = new Set([
  "hlf.no",
  "horselsforbundet.no",
  "cdn.sanity.io",
  "a-vilddigital.vev.site",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "google.com",
  "google.no",
  "schema.org",
]);

export type FetchHorselsforbundetInput = {
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

type BenefitPage = {
  slug: string;
  sourceUrl: string;
  title: string;
  text: string;
  domains: string[];
};

type SanityBenefit = {
  title: string;
  slug: string;
  modules: unknown[];
};

export async function fetchHorselsforbundet(
  input: FetchHorselsforbundetInput,
): Promise<CashbackOffer[]> {
  input.logger.info("Hørselsforbundet: fetching public member benefits from Sanity API...");
  const pages = await fetchBenefitPages();
  if (pages.length === 0) {
    throw new Error("Hørselsforbundet API contained no public discount pages");
  }
  input.logger.info(`Hørselsforbundet: found ${pages.length} discount pages`);
  const offers: CashbackOffer[] = [];
  let fromPage = 0;
  let fromLookup = 0;
  let fromOverride = 0;

  for (const page of pages) {
    const merchantName = MERCHANT_NAME_BY_SLUG[page.slug] ?? cleanMerchantName(page.title);
    let domains = (input.overrides.horselsforbundet?.[page.slug] ?? [])
      .map(normalizeDomainInput);
    if (domains.length > 0) fromOverride++;

    if (domains.length === 0) {
      domains = DOMAINS_BY_SLUG[page.slug] ?? page.domains;
      if (domains.length > 0) fromPage++;
    }

    if (domains.length === 0) {
      domains = lookupDomains(input.domainLookup, merchantName);
      if (domains.length > 0) fromLookup++;
    }

    if (domains.length === 0) {
      input.logger.warn(
        `Hørselsforbundet benefit has no merchant domain: ${merchantName} (${page.slug})`,
      );
      continue;
    }

    const reward = REWARD_BY_SLUG[page.slug] ??
      extractBenefitReward(`${page.title}\n${page.text}`);
    if (reward === "") {
      input.logger.warn(
        `Hørselsforbundet benefit has no public reward: ${merchantName} (${page.slug})`,
      );
      continue;
    }

    offers.push({
      provider: "horselsforbundet",
      merchantName,
      domains: uniqueStrings(domains.map(normalizeDomainInput)),
      reward,
      sourceUrl: page.sourceUrl,
      activationUrl: page.sourceUrl,
      terms: buildTerms(page.text),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(
    `Hørselsforbundet: resolved ${fromPage} from official pages, ${fromLookup} via lookup, ${fromOverride} via overrides`,
  );
  input.logger.info(`Hørselsforbundet: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}

async function fetchBenefitPages(): Promise<BenefitPage[]> {
  const payload = await fetchSanityPayload();
  const result = isRecord(payload) ? payload["result"] : undefined;
  if (!Array.isArray(result)) {
    throw new Error("Hørselsforbundet API returned an invalid result");
  }

  const pages: BenefitPage[] = [];
  for (const value of result) {
    const benefit = parseSanityBenefit(value);
    if (benefit === undefined) continue;

    const slug = benefit.slug.split("/").filter(Boolean).at(-1)?.toLowerCase() ?? "";
    if (slug === "" || EXCLUDED_SLUGS.has(slug)) continue;
    const sourceUrl = `${SITE_ORIGIN}${LIST_PATH}/${slug}`;
    const text = extractSanityText(benefit.modules);
    pages.push({
      slug,
      sourceUrl,
      title: normalizeText(benefit.title),
      text,
      domains: extractExternalDomains(benefit.modules, text),
    });
  }

  return pages;
}

async function fetchSanityPayload(): Promise<unknown> {
  const storage = new MemoryStorage({ persistStorage: false });
  const crawlerConfig = new Configuration();
  crawlerConfig.useStorageClient(storage);
  let payload: unknown;

  const crawler = new HttpCrawler({
    maxConcurrency: 1,
    maxRequestRetries: 2,
    maxRequestsPerCrawl: 1,
    preNavigationHooks: [({ request }, options) => {
      if (!isOfficialSanityApiUrl(request.url)) {
        throw new Error(`Hørselsforbundet refused non-allowlisted API URL: ${request.url}`);
      }
      options.followRedirect = false;
    }],
    requestHandler: async ({ json, request, response }) => {
      const loadedUrl = request.loadedUrl ?? request.url;
      if (!isOfficialSanityApiUrl(loadedUrl)) {
        throw new Error(
          `Hørselsforbundet refused non-allowlisted API response URL: ${loadedUrl}`,
        );
      }
      const statusCode = response.statusCode ?? 0;
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(`Hørselsforbundet API returned HTTP ${statusCode}`);
      }
      payload = json;
    },
  }, crawlerConfig);

  await crawler.run([new Request({
    url: SANITY_API_URL,
    headers: { Accept: "application/json" },
  })]);

  if (payload === undefined) {
    throw new Error("Hørselsforbundet crawler received no API response");
  }
  return payload;
}

function createSanityApiUrl(): string {
  const url = new URL(SANITY_API_PATH, SANITY_API_ORIGIN);
  url.searchParams.set("query", SANITY_QUERY);
  return url.toString();
}

function isOfficialSanityApiUrl(url: string): boolean {
  const parsed = parseUrl(url);
  if (
    parsed === undefined ||
    parsed.origin !== SANITY_API_ORIGIN ||
    parsed.pathname !== SANITY_API_PATH
  ) {
    return false;
  }
  return [...parsed.searchParams.keys()].every((key) => key === "query") &&
    parsed.searchParams.get("query") === SANITY_QUERY;
}

function parseSanityBenefit(value: unknown): SanityBenefit | undefined {
  if (
    !isRecord(value) ||
    typeof value["title"] !== "string" ||
    typeof value["slug"] !== "string" ||
    !value["slug"].startsWith(`${LIST_PATH.slice(1)}/`) ||
    !Array.isArray(value["modules"])
  ) {
    return undefined;
  }
  return {
    title: value["title"],
    slug: value["slug"],
    modules: value["modules"],
  };
}

function extractSanityText(value: unknown): string {
  const lines: string[] = [];
  walkSanityValue(value, (key, text) => {
    if (key === "text" || key === "title" || key === "description") {
      lines.push(normalizeText(text));
    }
  });
  return uniqueStrings(lines.filter(Boolean)).join("\n");
}

function extractExternalDomains(value: unknown, text: string): string[] {
  const domains: string[] = [];

  const urls: string[] = [];
  walkSanityValue(value, (key, fieldValue) => {
    if (key === "externalUrl") urls.push(fieldValue);
  });
  urls.push(...text.match(/https?:\/\/[^\s)\]>"']+/gi) ?? []);

  for (const rawUrl of urls) {
    const parsed = parseUrl(rawUrl.replace(/[.,;:!?]+$/, ""));
    if (parsed === undefined || !/^https?:$/.test(parsed.protocol)) continue;

    const domain = normalizeDomainInput(parsed.hostname);
    if (isSkippedHostname(domain)) continue;
    domains.push(domain);
  }

  return uniqueStrings(domains);
}

function walkSanityValue(
  value: unknown,
  visitString: (key: string, value: string) => void,
): void {
  if (Array.isArray(value)) {
    for (const item of value) walkSanityValue(item, visitString);
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string") visitString(key, child);
    else walkSanityValue(child, visitString);
  }
}

function isSkippedHostname(hostname: string): boolean {
  return [...SKIP_HOSTNAMES].some((skipped) => {
    return hostname === skipped || hostname.endsWith(`.${skipped}`);
  });
}

function buildTerms(text: string): string {
  const lines = text
    .split(/(?<=[.!?])\s+|[\r\n]+/)
    .map(normalizeText)
    .filter((line) => line.length >= 12 && line.length <= 360)
    .filter((line) => !/betaler\s+kun\s+kr\.?$/i.test(line))
    .filter((line) => /\b(?:rabatt|medlemspris|gratis|kostnadsfri|gjelder|kan ikke|inntil|opptil|fastpris)\b/i.test(line))
    // Never surface codes, even when an official page accidentally renders one.
    .filter((line) => !/\b(?:rabatt|kampanje|kupong|medlems)?kod(?:e|en|er)\b/i.test(line))
    .filter((line) => !/\b(?:logg(?:e)?\s+inn|min(?:\s+|-)side|medlemsnummer)\b/i.test(line));

  return uniqueStrings(lines).slice(0, 5).concat(DEFAULT_TERMS).join("\n");
}

function cleanMerchantName(title: string): string {
  return title
    .replace(/^\d+(?:[,.]\d+)?\s*%\s+(?:rabatt\s+)?(?:hos|på)\s+/i, "")
    .replace(/^(?:medlemsfordel|medlemsrabatt|rabatt)\s+(?:hos|på|fra)\s+/i, "")
    .trim();
}

function normalizeText(value: string): string {
  return value
    .replace(/&quot;/gi, "\"")
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
