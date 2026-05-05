import { CheerioCrawler, type CheerioCrawlingContext, Configuration, MemoryStorage } from "crawlee";
import {
  type CashbackOffer,
  normalizeDomainInput,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import { extractKrReward, extractPercentageReward } from "../../shared/reward.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

type LogbuyCheerio = CheerioCrawlingContext["$"];

const LIST_URL = "https://logbuy.no/rabatter";

export type CrawlLogbuyInput = {
  startUrl: string;
  maxRequestsPerCrawl: number;
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

const LABEL_LIST = "list";
const LABEL_DETAIL = "detail";

export async function crawlLogbuy(input: CrawlLogbuyInput): Promise<CashbackOffer[]> {
  type DealEntry = {
    slug: string;
    name: string;
    reward: string;
    fordeler: string;
  };

  const deals = new Map<string, DealEntry>(); // slug → entry

  const storage = new MemoryStorage({ persistStorage: false });
  const config = new Configuration();
  config.useStorageClient(storage);

  const crawler = new CheerioCrawler({
    maxConcurrency: 3,
    maxRequestsPerCrawl: input.maxRequestsPerCrawl,
    requestHandler: async ({ $, request, enqueueLinks }) => {
      const label = request.label ?? LABEL_LIST;

      if (label === LABEL_LIST) {
        // Extract slugs and names from list page cards
        const detailUrls: string[] = [];
        $("a.product-finder__card-link").each((_, el) => {
          const href = $(el).attr("href") ?? "";
          const slugMatch = href.match(/\/rabatter\/([^?#/]+)/);
          if (!slugMatch) return;

          const rawSlug = slugMatch[1]!;
          const slug = rawSlug.replace(/-rabattkode$/, "");
          if (deals.has(slug)) return;

          const card = $(el).parent();
          let name = card.find("h3.product-finder__card-title").first().text().trim();
          if (!name) name = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

          deals.set(slug, { slug, name, reward: "", fordeler: "" });
          detailUrls.push(`${LIST_URL}/${slug}-rabattkode`);
        });

        await enqueueLinks({
          urls: detailUrls,
          label: LABEL_DETAIL,
        });

        input.logger.info(`LogBuy: found ${deals.size} deals, enqueueing detail pages`);
      } else {
        // Extract precise discount from detail page
        const slugMatch = request.url.match(/\/rabatter\/([^?#/]+)/);
        if (!slugMatch) return;
        const slug = slugMatch[1]!.replace(/-rabattkode$/, "");

        const entry = deals.get(slug);
        if (!entry) return;

        // p.text-medium holds the precise discount description
        const raw = $("p.text-medium").first().text().trim().replace(/\s+/g, " ");
        const reward = extractPercentageReward(raw) || extractKrReward(raw);
        if (reward) entry.reward = reward;

        // Extract "Hvilke fordeler" FAQ answer
        const fordeler = $(".panel [itemprop='text']").first().text().trim().replace(/\s+/g, " ");
        if (fordeler) entry.fordeler = fordeler;
      }
    },
  }, config);

  await crawler.run([{ url: input.startUrl, label: LABEL_LIST }]);

  input.logger.info(`LogBuy: found ${deals.size} deals from pages`);

  const offers: CashbackOffer[] = [];
  let lookedUp = 0;
  let overrideCount = 0;

  for (const deal of deals.values()) {
    // 1. Domain lookup by merchant name (cross-reference with Klarna/Trumf/etc.)
    let domains = lookupDomains(input.domainLookup, deal.name);

    // 2. Fall back to provider-overrides keyed by slug (e.g. "gymgrossisten")
    if (domains.length === 0) {
      const overrideDomains = input.overrides.logbuy[deal.slug] ?? [];
      if (overrideDomains.length > 0) {
        domains = overrideDomains.map(normalizeDomainInput);
        overrideCount++;
      }
    } else {
      lookedUp++;
    }

    if (domains.length === 0) {
      input.logger.warn(`LogBuy offer has no domain: ${deal.name} (${deal.slug})`);
      continue;
    }

    const sourceUrl = `${LIST_URL}/${deal.slug}-rabattkode`;

    offers.push({
      provider: "logbuy",
      merchantName: deal.name,
      domains: uniqueStrings(domains),
      reward: deal.reward,
      sourceUrl,
      activationUrl: sourceUrl,
      terms: deal.fordeler || "Krever LogBuy-tilgang gjennom din arbeidsgiver.",
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`LogBuy: resolved ${lookedUp} via lookup, ${overrideCount} via override`);
  input.logger.info(`LogBuy: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}
