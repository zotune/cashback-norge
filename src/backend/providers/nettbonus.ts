// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import { gotScraping } from "crawlee";
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

const BASE_URL = "https://nettbonus.no";
const DETAIL_CONCURRENCY = 6;

export type CrawlNettbonusInput = {
  startUrl: string;
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

type NettbonusPartner = {
  id: string;
  slug: string;
  name: string;
  reward: string;
  detailUrl: string;
};

type NettbonusDetail = {
  bonusDetails: string;
  terms: string;
};

export async function crawlNettbonus(
  input: CrawlNettbonusInput,
): Promise<CashbackOffer[]> {
  input.logger.info("Nettbonus: fetching partner list...");
  const partners = await fetchPartnerList(input.startUrl);
  input.logger.info(`Nettbonus: found ${partners.length} partners, fetching details...`);

  const details = await fetchAllDetails(partners, input.logger);
  input.logger.info(`Nettbonus: fetched ${details.size} detail pages`);

  const offers: CashbackOffer[] = [];
  let fromName = 0;
  let fromLookup = 0;
  let fromOverride = 0;

  for (const partner of partners) {
    const detail = details.get(partner.detailUrl);
    const reward = buildReward(partner.reward, detail?.bonusDetails);
    if (!reward) {
      input.logger.warn(`Nettbonus: no reward for ${partner.name}`);
      continue;
    }

    let domains: string[] = [];

    // 1. Check overrides
    const overrideDomains = input.overrides.nettbonus?.[partner.slug] ?? [];
    if (overrideDomains.length > 0) {
      domains = overrideDomains.map(normalizeDomainInput);
      fromOverride++;
    }

    // 2. Try to extract domain from the partner name (many are "Store.no" or "Store.com")
    if (domains.length === 0) {
      const nameDomain = extractDomainFromName(partner.name);
      if (nameDomain) {
        domains = [nameDomain];
        fromName++;
      }
    }

    // 3. Fall back to domain lookup
    if (domains.length === 0) {
      domains = lookupDomains(input.domainLookup, partner.name);
      if (domains.length > 0) fromLookup++;
    }

    if (domains.length === 0) {
      input.logger.warn(`Nettbonus: no domain for ${partner.name} (${partner.slug})`);
      continue;
    }

    const sourceUrl = `${BASE_URL}${partner.detailUrl}`;
    const terms = buildTerms(detail);

    offers.push({
      provider: "nettbonus",
      merchantName: cleanMerchantName(partner.name),
      domains: uniqueStrings(domains),
      reward,
      sourceUrl,
      activationUrl: sourceUrl,
      terms,
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(
    `Nettbonus: resolved ${fromName} from name, ${fromLookup} via lookup, ${fromOverride} via override`,
  );
  input.logger.info(`Nettbonus: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}

async function fetchPartnerList(startUrl: string): Promise<NettbonusPartner[]> {
  const response = await gotScraping(startUrl, {
    responseType: "text",
    http2: false,
    throwHttpErrors: false,
    timeout: { request: 30_000 },
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Nettbonus list page returned ${response.statusCode}`);
  }

  const html = response.body;
  const partners: NettbonusPartner[] = [];
  const seen = new Set<string>();

  // Each card has: data-url="/details/{id}/{slug}", percentage in partnerListItemBottomLeftNumber,
  // and store name in partnerListItemBottomRight after <br/>
  const cardPattern = /data-url="(\/details\/(\d+)\/([^"]+))".*?partnerListItemBottomLeftNumber">\s*(.*?)\s*<\/div>.*?partnerListItemBottomRight">\s*F[^<]*<br\s*\/?>\s*([^<]+)/gs;

  for (const match of html.matchAll(cardPattern)) {
    const detailUrl = match[1] ?? "";
    const id = match[2] ?? "";
    const slug = match[3] ?? "";
    const rewardRaw = (match[4] ?? "").replace(/\s+/g, " ").trim();
    const nameRaw = (match[5] ?? "").trim();

    if (!detailUrl || seen.has(detailUrl)) continue;
    seen.add(detailUrl);

    const name = decodeHtmlEntities(nameRaw);
    if (!name) continue;

    partners.push({ id, slug, name, reward: rewardRaw, detailUrl });
  }

  return partners;
}

async function fetchAllDetails(
  partners: NettbonusPartner[],
  logger: Logger,
): Promise<Map<string, NettbonusDetail>> {
  const results = new Map<string, NettbonusDetail>();
  const queue = [...partners];
  let completed = 0;

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const partner = queue.shift();
      if (!partner) break;

      try {
        const detail = await fetchDetail(partner.detailUrl);
        results.set(partner.detailUrl, detail);
      } catch (e) {
        logger.warn(
          `Nettbonus: failed to fetch detail for ${partner.name}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      completed++;
      if (completed % 20 === 0) {
        logger.info(`Nettbonus: fetched ${completed}/${partners.length} details`);
      }
    }
  }

  const workers = Array.from({ length: DETAIL_CONCURRENCY }, () => worker());
  await Promise.all(workers);
  return results;
}

async function fetchDetail(detailUrl: string): Promise<NettbonusDetail> {
  const url = `${BASE_URL}${detailUrl}`;
  const response = await gotScraping(url, {
    responseType: "text",
    http2: false,
    throwHttpErrors: false,
    timeout: { request: 20_000 },
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`HTTP ${response.statusCode}`);
  }

  const html = response.body;

  // Extract bonus details: "Bonusdetaljer" section
  const bonusMatch = html.match(/partnerDetailsRowDiscounts">(.*?)<\/div>/s);
  let bonusDetails = "";
  if (bonusMatch) {
    bonusDetails = decodeHtmlEntities(stripTags(bonusMatch[1] ?? ""))
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^Bonusdetaljer\s*/i, "")
      .trim();
  }

  // Extract terms from the Vilkår section
  let terms = "";
  const vilkaarMatch = html.match(/Vilk[^<]*r<\/h2>(?:<br\s*\/?>)?\s*(.*?)(?:<\/div>\s*<\/div>\s*<\/div>)/s);
  if (vilkaarMatch) {
    terms = decodeHtmlEntities(stripTags(vilkaarMatch[1] ?? ""))
      .replace(/\s+/g, " ")
      .trim();
  }

  return { bonusDetails, terms };
}

function buildReward(listReward: string, bonusDetails?: string): string {
  // The bonus details from the detail page are more descriptive
  const source = bonusDetails || listReward;

  // Try percentage first
  const pctReward = extractPercentageReward(source);
  if (pctReward) return pctReward;

  // Try kr reward
  const krReward = extractKrReward(source);
  if (krReward) return krReward;

  // Direct kr match for simple cases like "200kr" or "200 kr"
  const directKr = source.match(/(\d[\d\s]*(?:[,.]\d+)?)\s*kr\b/i);
  if (directKr) {
    const value = (directKr[1] ?? "").replace(/\s/g, "").replace(",", ".");
    const num = parseFloat(value);
    if (num > 0) return `${num} kr`;
  }

  return "";
}

function buildTerms(detail?: NettbonusDetail): string {
  const parts: string[] = [];

  if (detail?.bonusDetails) {
    // Format multi-tier bonus details: "Nye kunder: 15% | Eksisterende: 5%" → list items
    const tiers = detail.bonusDetails.split("|").map((t) => t.trim()).filter(Boolean);
    if (tiers.length > 1) {
      parts.push(`Bonusdetaljer:\n${tiers.map((t) => `- ${t}`).join("\n")}`);
    } else if (tiers.length === 1) {
      parts.push(`Bonusdetaljer:\n- ${tiers[0]}`);
    }
  }

  if (detail?.terms) {
    parts.push(`Vilkår:\n- ${detail.terms}`);
  }

  if (parts.length === 0) {
    return "Cashback via Nettbonus.no.\nKlikk deg fra nettbonus.no til butikken.";
  }

  return parts.join("\n\n");
}

function extractDomainFromName(name: string): string | undefined {
  // Many Nettbonus partners have names like "Nelly.no", "Hotels.com", "AliExpress.com"
  const domainMatch = name.match(/^(.+\.(no|com|se|dk|eu|net|io|org|co))$/i);
  if (domainMatch && domainMatch[1]) {
    return normalizeDomainInput(domainMatch[1].toLowerCase());
  }
  return undefined;
}

function cleanMerchantName(name: string): string {
  return name
    .replace(/\s+NO$/i, "")
    .trim();
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ");
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&oslash;/g, "ø")
    .replace(/&aring;/g, "å")
    .replace(/&Aring;/g, "Å")
    .replace(/&aelig;/g, "æ")
    .replace(/&Aelig;/g, "Æ")
    .replace(/&ouml;/g, "ö")
    .replace(/&uuml;/g, "ü")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCharCode(parseInt(code, 10)));
}
