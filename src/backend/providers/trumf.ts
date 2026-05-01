import { CheerioCrawler, type CheerioCrawlingContext, Configuration, MemoryStorage } from "crawlee";
import {
  type CashbackOffer,
  normalizeDomainInput,
  parseUrl,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

type TrumfCheerio = CheerioCrawlingContext["$"];

export type CrawlTrumfInput = {
  startUrl: string;
  maxRequestsPerCrawl: number;
  overrides: ProviderOverrides;
  generatedAt: string;
  logger: Logger;
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
  return uniqueOffers(offers);
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
  const text = normalizeWhitespace($("body").text());
  const percentMatch = text.match(/(?:Opptil\s+)?\d+(?:[,.]\d+)?\s*%/i);
  const krMatch = text.match(/(?:Opptil\s+)?\d+(?:[,.]\d+)?\s*kr/i);

  return percentMatch?.[0] ?? krMatch?.[0] ?? "";
}

function extractTerms($: TrumfCheerio): string {
  const paragraphs = $("p")
    .toArray()
    .map((element) => normalizeWhitespace($(element).text()))
    .filter((text) => text.length > 0);
  const firstParagraph = paragraphs[0] ?? "";

  return firstParagraph;
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
