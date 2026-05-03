import { CheerioCrawler, type CheerioCrawlingContext, Configuration, MemoryStorage } from "crawlee";
import {
  type CashbackOffer,
  normalizeDomainInput,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import type { Logger } from "../logger.js";

const DEFAULT_TERMS = [
  "Krever SpareBank 1 Mastercard Ung.",
  "20 % rabatt på strømmetjenester, samlet inntil 500 kr per kalenderår.",
  "Rabatten trekkes fra beløpet hver gang du blir belastet.",
  "Betal regningen ved forfall for å unngå renter.",
].join("\n");

const SECTION_START = /hvilke strømmetjenester får jeg rabatt på/i;
const SECTION_END = /les mer om rabatt på streaming|kontakt oss|til toppen/i;

const SERVICE_DOMAIN_OVERRIDES: Record<string, string[]> = {
  "Apple Music": ["music.apple.com"],
  "HBO Max": ["hbomax.com", "max.com"],
};

export type CrawlSparebank1Input = {
  generatedAt: string;
  logger: Logger;
  maxRequestsPerCrawl: number;
  startUrl: string;
};

type StreamingService = {
  domains: string[];
  name: string;
};

type Sparebank1Cheerio = CheerioCrawlingContext["$"];

export async function crawlSparebank1(
  input: CrawlSparebank1Input,
): Promise<CashbackOffer[]> {
  const services = new Map<string, StreamingService>();
  let reward = "20 %";

  const storage = new MemoryStorage({ persistStorage: false });
  const config = new Configuration();
  config.useStorageClient(storage);

  const crawler = new CheerioCrawler({
    maxConcurrency: 1,
    maxRequestsPerCrawl: input.maxRequestsPerCrawl,
    requestHandler: async ({ $, request }) => {
      reward = extractReward($) ?? reward;

      for (const service of extractStreamingServices($, request.url)) {
        const key = service.name.toLowerCase();
        const existing = services.get(key);
        services.set(key, {
          domains: uniqueStrings([...(existing?.domains ?? []), ...service.domains]),
          name: service.name,
        });
      }
    },
  }, config);

  await crawler.run([input.startUrl]);

  const offers: CashbackOffer[] = [...services.values()].map((service) => ({
    provider: "sparebank1",
    merchantName: service.name,
    domains: service.domains,
    reward,
    sourceUrl: input.startUrl,
    activationUrl: input.startUrl,
    terms: DEFAULT_TERMS,
    updatedAt: input.generatedAt,
  }));

  input.logger.info(`SpareBank 1: produced ${offers.length} streaming offers`);
  return uniqueOffers(offers);
}

function extractReward($: Sparebank1Cheerio): string | undefined {
  const text = $("body").text().replace(/\s+/g, " ");
  const match =
    text.match(/får du\s+(\d+(?:[,.]\d+)?)\s*%\s+rabatt/i) ??
    text.match(/(\d+(?:[,.]\d+)?)\s*%\s+rabatt\s+på\s+strømmetjenester/i);

  if (match?.[1] === undefined) {
    return undefined;
  }

  return `${match[1].replace(".", ",")} %`;
}

function extractStreamingServices(
  $: Sparebank1Cheerio,
  baseUrl: string,
): StreamingService[] {
  const services: StreamingService[] = [];
  let inSection = false;

  $("body").find("h1,h2,h3,p,li,a").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length === 0) return;

    if (SECTION_START.test(text)) {
      inSection = true;
      return;
    }

    if (!inSection) return;

    if (SECTION_END.test(text)) {
      inSection = false;
      return;
    }

    if (el.tagName.toLowerCase() !== "a") return;

    const href = $(el).attr("href");
    if (!href) return;

    const parsedUrl = parseUrl(href, baseUrl);
    if (parsedUrl === undefined || isSparebank1Url(parsedUrl)) return;

    const domain = normalizeDomainInput(parsedUrl.hostname);
    if (domain.length === 0) return;

    services.push({
      domains: (SERVICE_DOMAIN_OVERRIDES[text] ?? [domain]).map(normalizeDomainInput),
      name: text,
    });
  });

  return services;
}

function parseUrl(href: string, baseUrl: string): URL | undefined {
  try {
    return new URL(href, baseUrl);
  } catch {
    return undefined;
  }
}

function isSparebank1Url(url: URL): boolean {
  const hostname = normalizeDomainInput(url.hostname);
  return hostname === "sparebank1.no" || hostname.endsWith(".sparebank1.no");
}
