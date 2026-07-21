// Public member benefits from Hørselsforbundet's official website.
// Codes shown on public pages or reserved for Min side are never collected.
import {
  type CashbackOffer,
  normalizeDomainInput,
  parseUrl,
  stripHtml,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import { extractBenefitReward } from "../../shared/reward.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const SITE_ORIGIN = "https://www.hlf.no";
const LIST_PATH = "/medlemskap/medlemsfordeler";
const LIST_URL = `${SITE_ORIGIN}${LIST_PATH}`;
const DETAIL_CONCURRENCY = 4;
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

export async function fetchHorselsforbundet(
  input: FetchHorselsforbundetInput,
): Promise<CashbackOffer[]> {
  input.logger.info("Hørselsforbundet: fetching public member benefits...");
  const listHtml = await fetchOfficialPage(LIST_URL);
  const detailUrls = extractDetailUrls(listHtml);

  if (detailUrls.length === 0) {
    throw new Error("Hørselsforbundet page contained no public benefit links");
  }

  input.logger.info(`Hørselsforbundet: found ${detailUrls.length} discount pages`);
  const pages = await fetchBenefitPages(detailUrls, input.logger);
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

async function fetchBenefitPages(
  urls: string[],
  logger: Logger,
): Promise<BenefitPage[]> {
  const pages: BenefitPage[] = [];

  for (let start = 0; start < urls.length; start += DETAIL_CONCURRENCY) {
    const batch = urls.slice(start, start + DETAIL_CONCURRENCY);
    const results = await Promise.all(batch.map(async (sourceUrl) => {
      try {
        const html = await fetchOfficialPage(sourceUrl);
        const slug = slugFromUrl(sourceUrl);
        return {
          slug,
          sourceUrl,
          title: extractTitle(html),
          text: pageText(html),
          domains: extractExternalDomains(html),
        } satisfies BenefitPage;
      } catch (error) {
        logger.warn(`Hørselsforbundet: failed to fetch ${sourceUrl}: ${String(error)}`);
        return undefined;
      }
    }));
    pages.push(...results.filter((page): page is BenefitPage => page !== undefined));
  }

  return pages;
}

async function fetchOfficialPage(url: string): Promise<string> {
  let currentUrl = url;

  for (let redirects = 0; redirects <= 5; redirects++) {
    if (!isOfficialUrl(currentUrl)) {
      throw new Error(`Hørselsforbundet refused non-official URL: ${currentUrl}`);
    }

    const response = await fetch(currentUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "CashbackNorge/1.0",
      },
      // Validate every redirect before issuing the next request. With automatic
      // redirects an official page could otherwise send the crawler off-site.
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location === null) {
        throw new Error(`Hørselsforbundet returned redirect without location for ${currentUrl}`);
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(`Hørselsforbundet returned ${response.status} for ${currentUrl}`);
    }
    return response.text();
  }

  throw new Error(`Hørselsforbundet exceeded redirect limit for ${url}`);
}

function isOfficialUrl(url: string): boolean {
  const parsed = parseUrl(url);
  if (
    parsed === undefined ||
    parsed.protocol !== "https:" ||
    normalizeDomainInput(parsed.hostname) !== "hlf.no"
  ) {
    return false;
  }
  const path = parsed.pathname.replace(/\/$/, "");
  return path === LIST_PATH || path.startsWith(`${LIST_PATH}/`);
}

function extractDetailUrls(html: string): string[] {
  const urls: string[] = [];
  const pattern = /\/medlemskap\/medlemsfordeler\/([a-z0-9-]+)/gi;

  for (const match of html.matchAll(pattern)) {
    const slug = (match[1] ?? "").toLowerCase();
    if (slug === "" || EXCLUDED_SLUGS.has(slug)) continue;
    urls.push(`${SITE_ORIGIN}${LIST_PATH}/${slug}`);
  }

  return uniqueStrings(urls);
}

function extractTitle(html: string): string {
  const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ??
    html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  return normalizeText(stripHtml(heading)).replace(/\s*[|–-]\s*Hørselsforbundet\s*$/i, "");
}

function extractExternalDomains(html: string): string[] {
  const domains: string[] = [];
  const mainHtml = html.match(/<main\b[^>]*>[\s\S]*?<\/main>/i)?.[0] ?? html;
  const visibleHtml = mainHtml
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");

  for (const match of visibleHtml.matchAll(/href=(?:"|\\")?(https?:\/\/[^"'<>\s\\]+)(?:"|\\")?/gi)) {
    const rawUrl = (match[1] ?? "")
      .replace(/\\u0026/gi, "&")
      .replace(/&amp;/gi, "&")
      .replace(/\\+$/g, "");
    const parsed = parseUrl(rawUrl);
    if (parsed === undefined || !/^https?:$/.test(parsed.protocol)) continue;

    const domain = normalizeDomainInput(parsed.hostname);
    if (isSkippedHostname(domain)) continue;
    domains.push(domain);
  }

  return uniqueStrings(domains);
}

function isSkippedHostname(hostname: string): boolean {
  return [...SKIP_HOSTNAMES].some((skipped) => {
    return hostname === skipped || hostname.endsWith(`.${skipped}`);
  });
}

function pageText(html: string): string {
  // The visible page is server-rendered. Removing scripts also removes the
  // duplicate Next.js flight payload, which can contain activation URLs.
  const mainHtml = html.match(/<main\b[^>]*>[\s\S]*?<\/main>/i)?.[0] ?? html;
  return stripHtml(
    mainHtml
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
      .replace(/<\/(?:p|li|h[1-6]|div|section|article)>/gi, "\n"),
  )
    .split(/\n+/)
    .map(normalizeText)
    .filter(Boolean)
    .join("\n");
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

function slugFromUrl(url: string): string {
  const parsed = parseUrl(url);
  return parsed?.pathname.split("/").filter(Boolean).at(-1)?.toLowerCase() ?? "";
}

function normalizeText(value: string): string {
  return value
    .replace(/&quot;/gi, "\"")
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
