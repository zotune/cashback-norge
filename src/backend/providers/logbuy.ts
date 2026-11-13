// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import { CheerioCrawler, type CheerioCrawlingContext, Configuration, MemoryStorage } from "crawlee";
import {
  type CashbackOffer,
  type RewardCalculationRules,
  normalizeDomainInput,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import { extractKrReward, extractUpToPercentageReward } from "../../shared/reward.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import { isNonMerchantHost } from "../merchant-domains.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";
import { extractCouponMinimumPurchase } from "./rabattkode.js";

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

const ACCESS_TERMS = "Krever LogBuy-tilgang gjennom arbeidsgiver, organisasjon eller privat medlemskap.";

const LABEL_LIST = "list";
const LABEL_DETAIL = "detail";

export async function crawlLogbuy(input: CrawlLogbuyInput): Promise<CashbackOffer[]> {
  type DealEntry = {
    slug: string;
    name: string;
    reward: string;
    rewardCalculation?: RewardCalculationRules;
    fordeler: string;
  };

  const deals = new Map<string, DealEntry>(); // slug → entry

  const storage = new MemoryStorage({ persistStorage: false });
  const config = new Configuration();
  config.useStorageClient(storage);

  const crawler = new CheerioCrawler({
    maxConcurrency: 2,
    maxRequestRetries: 2,
    requestHandlerTimeoutSecs: 30,
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
          detailUrls.push(`${input.startUrl.replace(/\/+$/, "")}/${slug}-rabattkode`);
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

        // p.text-medium holds the headline of the benefit ("Opptil 30 %
        // rabatt på Samsung-produkter"); the first rich-text list states the
        // conditions ("15 % fast LogBuy-rabatt ved kjøp over 799 kr").
        const raw = $("p.text-medium").first().text().trim().replace(/\s+/g, " ");
        const benefitLines = $(".text-block__richtext").first().find("li").toArray()
          .map((li) => $(li).text().replace(/\s+/g, " ").trim())
          .filter((line) => line.length > 0);
        entry.reward = parseLogbuyReward(raw, benefitLines);
        const rewardCalculation = extractCouponMinimumPurchase([raw, ...benefitLines].join("\n"));
        if (rewardCalculation !== undefined) entry.rewardCalculation = rewardCalculation;

        // Extract first and last FAQ answers
        const faqEls = $(".panel [itemprop='text']").toArray();
        const faqParts: string[] = [];
        if (faqEls.length > 0) {
          const first = $(faqEls[0]).text().trim().replace(/\s+/g, " ");
          if (first) faqParts.push(first);
          if (faqEls.length > 1) {
            const last = $(faqEls[faqEls.length - 1]).text().trim().replace(/\s+/g, " ");
            if (last && last !== first) faqParts.push(last);
          }
        }
        entry.fordeler = [
          raw,
          ...benefitLines.map((line) => `- ${line}`),
          ...faqParts,
        ].filter(Boolean).join("\n");
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
    // Other providers' affiliate links can leak tracking hosts into the
    // name lookup (Hotels.com → jdoqocy.com); they are never the shop.
    let domains = lookupDomains(input.domainLookup, deal.name)
      .filter((domain) => !isNonMerchantHost(domain));

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
      ...(deal.rewardCalculation === undefined ? {} : { rewardCalculation: deal.rewardCalculation }),
      sourceUrl,
      activationUrl: sourceUrl,
      terms: [deal.fordeler, ACCESS_TERMS].filter(Boolean).join("\n\n"),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`LogBuy: resolved ${lookedUp} via lookup, ${overrideCount} via override`);
  input.logger.info(`LogBuy: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}

/**
 * The headline's own rate, keeping «opptil». A headline that names a
 * discount without a public rate ("Rabatt på drivstoff hos Circle K") is
 * "Rabatt", never an invented amount.
 */
export function parseLogbuyReward(headline: string, benefitLines: string[] = []): string {
  for (const text of [headline, ...benefitLines]) {
    const reward = extractUpToPercentageReward(text) || extractKrReward(text, { totalsum: false });
    if (reward) return reward;
  }
  return /\b(?:rabatt\w*|reduserte\s+priser|medlemspris\w*)\b/i.test([headline, ...benefitLines].join(" ")) ? "Rabatt" : "";
}
