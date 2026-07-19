// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import { CheerioCrawler, type CheerioCrawlingContext, Configuration, MemoryStorage } from "crawlee";
import {
  type CashbackOffer,
  isRecord,
  normalizeDomainInput,
  parseUrl,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import {
  extractKrReward,
  extractOreLitreReward,
  extractPercentageReward,
  formatPercentageReward,
} from "../../shared/reward.js";
import { type DomainLookup, lookupDomains } from "../domain-lookup.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

type TrumfCheerio = CheerioCrawlingContext["$"];

const TRUMF_BENEFITS_URL = "https://www.trumf.no/fordeler";

const TRUMF_BENEFIT_DOMAIN_OVERRIDES: Record<string, string[]> = {
  "fordeler/cc-mat": ["ccmat.no"],
  "fordeler/esso": ["esso.no"],
  "fordeler/fjordkraft": ["fjordkraft.no"],
  "fordeler/gigaboks": ["gigaboks.no"],
  "fordeler/jacobs": ["jacobs.no"],
  "fordeler/joker": ["joker.no"],
  "fordeler/kiwi": ["kiwi.no"],
  "fordeler/leroy-mat": ["leroymat.no"],
  "fordeler/meny": ["meny.no"],
  "fordeler/mester-gronn": ["mestergronn.no"],
  "fordeler/narbutikken": ["narbutikken.no"],
  "fordeler/norli": ["norli.no"],
  "fordeler/spar": ["spar.no"],
  "fordeler/talkmore": ["talkmore.no"],
};

const SKIPPED_TRUMF_BENEFIT_SLUGS = new Set([
  "fordeler/parkering",
  "fordeler/sas-eurobonus",
  "fordeler/scandic-friends",
]);

export type CrawlTrumfInput = {
  startUrl: string;
  maxRequestsPerCrawl: number;
  overrides: ProviderOverrides;
  generatedAt: string;
  logger: Logger;
  domainLookup: DomainLookup;
};

export async function crawlTrumf(
  input: CrawlTrumfInput,
): Promise<CashbackOffer[]> {
  const offers: CashbackOffer[] = [];
  const storage = new MemoryStorage({ persistStorage: false });
  const config = new Configuration();
  config.useStorageClient(storage);

  const baseUrl = new URL(input.startUrl).origin;
  const pagedUrls: string[] = [];
  for (let page = 0; ; page++) {
    const url = `${baseUrl}/category/paged/all/100/${page}/alphabetical`;
    const res = await fetch(url);
    const html = await res.text();
    const links = [...html.matchAll(/href="(\/cashback\/[^"]+)"/g)].map((m) => `${baseUrl}${m[1]}`);
    if (links.length === 0) break;
    pagedUrls.push(...links);
  }

  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: input.maxRequestsPerCrawl,
    requestHandler: async ({ $, request }) => {
      const loadedUrl = request.loadedUrl ?? request.url;
      const parsedUrl = parseUrl(loadedUrl);

      if (parsedUrl === undefined) {
        input.logger.warn(`Skipping invalid Trumf URL: ${loadedUrl}`);
        return;
      }

      if (parsedUrl.pathname.startsWith("/cashback/")) {
        const offer = parseTrumfOffer(
          $,
          loadedUrl,
          input.overrides,
          input.generatedAt,
        );

        if (offer.domains.length === 0) {
          input.logger.warn(
            `Trumf offer has no domains and needs override: ${loadedUrl}`,
          );
        }

        offers.push(offer);
        return;
      }
    },
  }, config);

  await crawler.run(pagedUrls);

  const resolved = resolveDomainsForOffers(
    uniqueOffers(offers),
    input.overrides,
    input.domainLookup,
    input.logger,
  );
  const benefitOffers = await crawlTrumfBenefits({
    generatedAt: input.generatedAt,
    logger: input.logger,
    maxRequestsPerCrawl: input.maxRequestsPerCrawl,
    overrides: input.overrides,
  });

  return uniqueOffers([...resolved, ...benefitOffers]);
}

type TrumfBenefitSummary = {
  slug: string;
  title: string;
  description: string;
  publishedAt?: string;
  tags: string[];
};

export type CrawlTrumfBenefitsInput = {
  generatedAt: string;
  logger: Logger;
  maxRequestsPerCrawl: number;
  overrides: ProviderOverrides;
};

export async function crawlTrumfBenefits(
  input: CrawlTrumfBenefitsInput,
): Promise<CashbackOffer[]> {
  input.logger.info("Trumf fordeler: fetching listing...");

  const summaries = (await fetchTrumfBenefitSummaries()).filter((summary) => {
    return summary.slug.startsWith("fordeler/") &&
      !SKIPPED_TRUMF_BENEFIT_SLUGS.has(summary.slug) &&
      getTrumfBenefitDomains(summary, input.overrides).length > 0;
  });

  input.logger.info(`Trumf fordeler: ${summaries.length} benefit pages with merchant domains`);

  const offers: CashbackOffer[] = [];
  const storage = new MemoryStorage({ persistStorage: false });
  const config = new Configuration();
  config.useStorageClient(storage);

  const summariesBySlug = new Map(summaries.map((summary) => [summary.slug, summary]));
  const startUrls = summaries.map((summary) => buildTrumfBenefitUrl(summary.slug));

  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: input.maxRequestsPerCrawl,
    requestHandler: async ({ $, request }) => {
      const loadedUrl = request.loadedUrl ?? request.url;
      const parsedUrl = parseUrl(loadedUrl);

      if (parsedUrl === undefined) {
        input.logger.warn(`Skipping invalid Trumf benefit URL: ${loadedUrl}`);
        return;
      }

      const slug = parsedUrl.pathname.split("/").filter(Boolean).join("/");
      const summary = summariesBySlug.get(slug);

      if (summary === undefined) {
        input.logger.warn(`Skipping unknown Trumf benefit URL: ${loadedUrl}`);
        return;
      }

      const offer = parseTrumfBenefitOffer(
        $,
        loadedUrl,
        summary,
        input.overrides,
        input.generatedAt,
      );

      if (offer !== undefined) offers.push(offer);
    },
  }, config);

  await crawler.run(startUrls);

  return uniqueOffers(offers);
}

async function fetchTrumfBenefitSummaries(): Promise<TrumfBenefitSummary[]> {
  const html = await fetchText(TRUMF_BENEFITS_URL);
  const match = html.match(/docsWithTagId\\":(\[.*?\]),\\"sortOrderCustom/s);

  if (match?.[1] === undefined) {
    throw new Error("Could not find Trumf benefits listing data");
  }

  const jsonText = match[1]
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\");
  const value = JSON.parse(jsonText) as unknown;

  if (!Array.isArray(value)) {
    throw new Error("Trumf benefits listing data is not an array");
  }

  return value.flatMap((item) => {
    const summary = parseTrumfBenefitSummary(item);
    return summary === undefined ? [] : [summary];
  });
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "CashbackNorgeBot/1.0 (+https://cashbacknorge.no)",
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Trumf returned ${response.status} for ${url}`);
  }

  return response.text();
}

function parseTrumfBenefitSummary(value: unknown): TrumfBenefitSummary | undefined {
  if (!isRecord(value)) return undefined;

  const slug = readString(value.slug);
  const title = readString(value.title);
  const description = readString(value.description);

  if (slug === undefined || title === undefined || description === undefined) {
    return undefined;
  }

  const tags = Array.isArray(value.tags)
    ? value.tags.filter((tag): tag is string => typeof tag === "string")
    : [];
  const publishedAt = readString(value.publishedAt);

  return {
    slug,
    title: normalizeWhitespace(title),
    description: normalizeWhitespace(description),
    ...(publishedAt !== undefined ? { publishedAt } : {}),
    tags,
  };
}

function parseTrumfBenefitOffer(
  $: TrumfCheerio,
  sourceUrl: string,
  summary: TrumfBenefitSummary,
  overrides: ProviderOverrides,
  generatedAt: string,
): CashbackOffer | undefined {
  const domains = getTrumfBenefitDomains(summary, overrides);

  if (domains.length === 0) {
    return undefined;
  }

  const textLines = extractBenefitTextLines($);
  const reward = extractTrumfBenefitReward(summary, textLines);
  const activationUrl = findTrumfBenefitActivationUrl($, sourceUrl, domains) ?? sourceUrl;

  return {
    provider: "trumf",
    merchantName: summary.title,
    domains,
    reward,
    sourceUrl,
    activationUrl,
    terms: buildTrumfBenefitTerms(summary, textLines),
    updatedAt: generatedAt,
  };
}

function getTrumfBenefitDomains(
  summary: TrumfBenefitSummary,
  overrides: ProviderOverrides,
): string[] {
  const overrideDomains = overrides.trumf[summary.slug] ?? [];
  const manualDomains = TRUMF_BENEFIT_DOMAIN_OVERRIDES[summary.slug] ?? [];
  return uniqueStrings([...manualDomains, ...overrideDomains].map(normalizeDomainInput));
}

function buildTrumfBenefitUrl(slug: string): string {
  return new URL(`/${slug}`, TRUMF_BENEFITS_URL).toString();
}

function extractBenefitTextLines($: TrumfCheerio): string[] {
  const article = $("[class*='articleWrapper_articleContainer']").first();
  const root = article.length > 0 ? article.clone() : $("body").clone();

  root
    .find([
      "script",
      "style",
      "svg",
      "img",
      "[class*='cards_list']",
      "[class*='cardListWrapper']",
      "[class*='linkCard']",
      "[class*='footer']",
      "[class*='header']",
    ].join(","))
    .remove();

  const lines: string[] = [];

  for (const element of root.find("h1,h2,p,li").toArray()) {
    const text = normalizeWhitespace($(element).text());
    if (isUsefulBenefitTextLine(text)) addUniqueTextLine(lines, cleanBenefitTermLine(text));
  }

  return lines;
}

function isUsefulBenefitTextLine(value: string): boolean {
  if (value.length < 4) return false;
  if (/^(?:les mer|les mer her|hopp til hovedinnhold)$/i.test(value)) return false;
  if (/^(?:bruk bonus|kvitteringer|profil|fordeler|innsikt|trumf)$/i.test(value)) return false;
  return true;
}

function extractTrumfBenefitReward(
  summary: TrumfBenefitSummary,
  textLines: string[],
): string {
  const focusedText = [
    summary.title,
    summary.description,
    ...textLines.slice(0, 10),
  ].join("\n");

  const fixedKrReward = extractTrumfFixedKrReward(focusedText);
  if (fixedKrReward !== "") return fixedKrReward;

  const oreReward = extractOreLitreReward(focusedText);
  if (oreReward !== "") return oreReward;

  // Range over the whole benefit text, not just the headline: Joker's
  // headline says "6 % på mandager" but the base rate is 1 %, so the honest
  // label is "1-6 %".
  const pctReward = extractPercentageReward(focusedText);
  if (pctReward !== "") return pctReward;

  const krReward = extractKrReward(focusedText, { totalsum: false });
  if (krReward !== "") return krReward;

  return "Medlemsfordel";
}

function extractTrumfFixedKrReward(text: string): string {
  const values: number[] = [];
  const patterns = [
    /(?:få|får du)\s+(\d[\d\s]*)\s*kr\s+i\s+Trumf-bonus(?:\s+som\s+velkomstgave)?/gi,
    /(\d[\d\s]*)\s*kr\s+i\s+Trumf-bonus\s+som\s+velkomstgave/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = Number.parseInt((match[1] ?? "").replace(/\s+/g, ""), 10);
      if (value > 0) values.push(value);
    }
  }

  if (values.length === 0) return "";

  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? `${formatKrNumber(max)} kr` : `${formatKrNumber(min)}-${formatKrNumber(max)} kr`;
}

function buildTrumfBenefitTerms(
  summary: TrumfBenefitSummary,
  textLines: string[],
): string {
  const lines = ["Krever Trumf-medlemskap."];

  addUniqueTextLine(lines, summary.description);

  for (const line of textLines) {
    if (lines.length >= 12) break;
    if (isGenericTrumfBenefitFaqLine(line)) continue;
    if (!isRelevantTrumfBenefitTerm(line)) continue;
    addUniqueTextLine(lines, line);
    if (/^\*/.test(line)) break;
  }

  return lines.join("\n");
}

function isRelevantTrumfBenefitTerm(line: string): boolean {
  return /(?:Trumf|bonus|rabatt|avslag|kupong|medlem|Trippel-Trumf|KIWI PLUSS|Joker GLAD|MENY MER|Gigaboks Jippi|velkomstgave|øre\/l|liter|bleier|bind|tamponger|frukt|grønt)/i.test(line);
}

function isGenericTrumfBenefitFaqLine(line: string): boolean {
  return /^(?:Gode Trumf-fordeler hos|Alltid gode Trumf-fordeler|Ikke gå glipp av ekstra Trumf-bonus|Du sparer ikke Trumf-bonus på pant|Når du handler i en av våre dagligvarebutikker|Ja, du sparer Trumf-bonus når du betaler|Dersom det står|Dersom du har felles kontonummer|Slik får du Trumf-bonus når du betaler|Er du fornøyd med Trumf|Verv familie og venner|Garantert full Telenor-dekning|Velkomstgaven blir overført|Du vil motta \d|For å motta velkomstgave)/i.test(line);
}

function findTrumfBenefitActivationUrl(
  $: TrumfCheerio,
  sourceUrl: string,
  domains: string[],
): string | undefined {
  const candidates: { url: string; score: number }[] = [];

  for (const element of $("a").toArray()) {
    const href = $(element).attr("href") ?? "";
    const parsedUrl = parseUrlWithBase(href, sourceUrl);
    if (parsedUrl === undefined) continue;

    const domain = normalizeDomainInput(parsedUrl.hostname);
    if (!domains.includes(domain)) continue;

    const linkText = normalizeWhitespace($(element).text());
    const url = parsedUrl.toString();
    const score = scoreTrumfBenefitActivationLink(linkText, url);
    candidates.push({ url, score });
  }

  return candidates.sort((a, b) => b.score - a.score)[0]?.url;
}

function scoreTrumfBenefitActivationLink(linkText: string, url: string): number {
  if (/\/strom\/stromavtale\/trumf\/?$/i.test(new URL(url).pathname)) return 10;
  if (/Få Trumf-bonus på strømmen/i.test(linkText)) return 9;
  if (/partner\/trumf|gigaboksjippi|kiwi-pluss|meny\.no\/mer|kuponger/i.test(url)) return 8;
  if (/Få Trumf-bonus|Bestill|Aktiver|Se din|bonus|fordel/i.test(linkText)) return 5;
  return 1;
}

function parseTrumfOffer(
  $: TrumfCheerio,
  sourceUrl: string,
  overrides: ProviderOverrides,
  generatedAt: string,
): CashbackOffer {
  const merchantName = extractMerchantName($);
  const slug = extractSlug(sourceUrl);
  const overrideDomains = overrides.trumf[slug] ?? [];
  const externalDomains = extractExternalDomains($, sourceUrl);
  const domains = uniqueStrings([...overrideDomains, ...externalDomains]);
  const reward = extractReward($);
  const activationUrl = findActivationUrl($, sourceUrl) ?? sourceUrl;
  const terms = extractTerms($);

  return {
    provider: "trumf",
    merchantName,
    domains,
    reward,
    sourceUrl,
    activationUrl,
    terms,
    updatedAt: generatedAt,
  };
}

function extractMerchantName($: TrumfCheerio): string {
  const heading = normalizeWhitespace($("h1").first().text());
  const prefix = "Trumf-bonus hos ";

  if (heading.startsWith(prefix)) {
    return heading.slice(prefix.length).trim();
  }

  return heading.length > 0 ? heading : "Unknown Trumf merchant";
}

function extractReward($: TrumfCheerio): string {
  const categories = extractCategoryRates($);

  if (categories.length > 0) {
    const percentCategories = categories.filter((c) => c.rate > 0);
    const krCategories = categories.filter((c) => c.krValue);

    if (percentCategories.length > 0) {
      return formatPercentageReward(percentCategories.map((c) => c.rate));
    }

    if (krCategories.length > 0) {
      const amounts = krCategories
        .map((c) => Number.parseInt((c.krValue ?? "").replace(/[^\d]/g, ""), 10))
        .filter((n) => n > 0);
      const min = Math.min(...amounts);
      const max = Math.max(...amounts);
      return min < max ? `${min}-${max} kr` : `${max} kr`;
    }
  }

  const text = normalizeWhitespace($("body").text());
  return extractPercentageReward(text) || extractKrReward(text, { totalsum: false });
}

function extractTerms($: TrumfCheerio): string {
  const categories = extractCategoryRates($);

  if (categories.length > 0) {
    const titles = $(".merchant-list-offer-title").toArray();
    const values = $(".merchant-list-offer-value").toArray();
    const details = $(".merchant-list-offer-detail").toArray();
    const lines: string[] = [];
    for (let i = 0; i < categories.length; i++) {
      const c = categories[i]!;
      const label = c.krValue ? `${c.krValue} – ${c.category}` : `${formatRate(c.rate)} % – ${c.category}`;
      const detail = details[i] ? normalizeWhitespace($(details[i]).text()) : "";
      lines.push(detail ? `${label}\n\n${detail}` : label);
    }
    return lines.join("\n\n");
  }

  const NOISE_PATTERNS = /^hei\s+(du|der)!?$/i;

  const paragraphs = $("p")
    .toArray()
    .map((element) => normalizeWhitespace($(element).text()))
    .filter((text) => text.length > 10 && !NOISE_PATTERNS.test(text.trim()));
  const firstParagraph = paragraphs[0] ?? "";

  return firstParagraph;
}

type CategoryRate = { category: string; rate: number; krValue?: string };

function extractCategoryRates($: TrumfCheerio): CategoryRate[] {
  const titles = $(".merchant-list-offer-title").toArray();
  const values = $(".merchant-list-offer-value").toArray();
  const categories: CategoryRate[] = [];

  for (let i = 0; i < Math.min(titles.length, values.length); i++) {
    const category = normalizeWhitespace($(titles[i]).text());
    const valueText = normalizeWhitespace($(values[i]).text());
    const rateMatch = valueText.match(/(\d+(?:[,.]\d+)?)\s*%/);

    if (rateMatch !== null && rateMatch[1] !== undefined) {
      const rate = Number.parseFloat(rateMatch[1].replace(",", "."));
      categories.push({ category, rate });
    } else {
      const krMatch = valueText.match(/(\d+(?:[,.]\d+)?)\s*kr/i);
      if (krMatch !== null) {
        categories.push({ category, rate: 0, krValue: valueText });
      }
    }
  }

  return categories;
}

function formatRate(value: number): string {
  const formatted = value.toFixed(1).replace(".", ",");
  return formatted.endsWith(",0") ? formatted.slice(0, -2) : formatted;
}

function findActivationUrl(
  $: TrumfCheerio,
  sourceUrl: string,
): string | undefined {
  for (const element of $("a").toArray()) {
    const linkText = normalizeWhitespace($(element).text());

    if (!linkText.includes("Få Trumf-bonus her")) {
      continue;
    }

    const href = $(element).attr("href") ?? "";
    const parsedUrl = parseUrlWithBase(href, sourceUrl);

    if (parsedUrl !== undefined) {
      return parsedUrl.toString();
    }
  }

  return undefined;
}

function extractExternalDomains($: TrumfCheerio, sourceUrl: string): string[] {
  const domains: string[] = [];

  for (const element of $("a").toArray()) {
    const href = $(element).attr("href") ?? "";
    const parsedUrl = parseUrlWithBase(href, sourceUrl);

    if (parsedUrl === undefined || !isLikelyMerchantDomain(parsedUrl.hostname)) {
      continue;
    }

    domains.push(normalizeDomainInput(parsedUrl.hostname));
  }

  return uniqueStrings(domains);
}

function isLikelyMerchantDomain(hostname: string): boolean {
  const normalizedHostname = normalizeDomainInput(hostname);
  const internalDomains = [
    "trumf.no",
    "trumfnetthandel.no",
    "www.trumf.no",
    "www.trumfnetthandel.no",
  ];

  return !internalDomains.some((domain) => {
    return normalizedHostname === normalizeDomainInput(domain);
  });
}

function parseUrlWithBase(href: string, baseUrl: string): URL | undefined {
  try {
    return new URL(href, baseUrl);
  } catch {
    return undefined;
  }
}

function extractSlug(sourceUrl: string): string {
  const parsedUrl = parseUrl(sourceUrl);

  if (parsedUrl === undefined) {
    return "";
  }

  const pathParts = parsedUrl.pathname.split("/").filter((part) => {
    return part.length > 0;
  });
  return pathParts[pathParts.length - 1] ?? "";
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function cleanBenefitTermLine(value: string): string {
  const cleaned = value
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length > 220 ? `${cleaned.slice(0, 217).trim()}...` : cleaned;
}

function addUniqueTextLine(lines: string[], line: string): void {
  const cleaned = cleanBenefitTermLine(line);
  const normalized = cleaned.toLowerCase().replace(/\s+/g, " ");

  if (
    cleaned.length > 0 &&
    !lines.some((existing) => existing.toLowerCase().replace(/\s+/g, " ") === normalized)
  ) {
    lines.push(cleaned);
  }
}

function formatKrNumber(value: number): string {
  return value.toLocaleString("nb-NO").replace(/[\u00a0\u202f]/g, " ");
}

function resolveDomainsForOffers(
  offers: CashbackOffer[],
  overrides: ProviderOverrides,
  domainLookup: DomainLookup,
  logger: Logger,
): CashbackOffer[] {
  return offers.map((offer) => {
    if (offer.domains.length > 0) {
      return offer;
    }

    const slug = extractSlug(offer.sourceUrl);
    const overrideDomains = overrides.trumf[slug] ?? [];

    if (overrideDomains.length > 0) {
      return {
        ...offer,
        domains: uniqueStrings(overrideDomains.map(normalizeDomainInput)),
      };
    }

    const lookedUp = lookupDomains(domainLookup, offer.merchantName);

    if (lookedUp.length > 0) {
      return {
        ...offer,
        domains: uniqueStrings(lookedUp),
      };
    }

    logger.warn(
      `Trumf offer has no domains: ${offer.merchantName} (${slug})`,
    );

    return offer;
  });
}
