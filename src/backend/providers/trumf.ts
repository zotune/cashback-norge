import { CheerioCrawler, type CheerioCrawlingContext, Configuration, MemoryStorage } from "crawlee";
import {
  type CashbackOffer,
  normalizeDomainInput,
  parseUrl,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import { extractKrReward, extractPercentageReward, formatPercentageReward } from "../../shared/reward.js";
import { type DomainLookup, lookupDomains } from "../domain-lookup.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

type TrumfCheerio = CheerioCrawlingContext["$"];

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

  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: input.maxRequestsPerCrawl,
    requestHandler: async ({ $, enqueueLinks, request }) => {
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

      await enqueueLinks({
        label: "detail",
        selector: 'a[href*="/cashback/"]',
      });

      await enqueueLinks({
        label: "category",
        selector: 'a[href*="/kategori/"]',
      });
    },
  }, config);

  await crawler.run([input.startUrl]);

  const resolved = resolveDomainsForOffers(
    uniqueOffers(offers),
    input.overrides,
    input.domainLookup,
    input.logger,
  );
  return resolved;
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
  return extractPercentageReward(text) || extractKrReward(text);
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
