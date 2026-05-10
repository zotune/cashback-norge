// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import { type CashbackOffer } from "../../shared/cashback.js";
import { type DomainLookup, lookupDomains } from "../domain-lookup.js";
import type { Logger } from "../logger.js";

const CONTENTFUL_URL =
  "https://graphql.eu.contentful.com/content/v1/spaces/eu01y9qnrf4v/environments/master";
const CONTENTFUL_TOKEN = "7M6TKX9Vk0uQzCh16pbokiOlJztMRtJ_EvQPOrPVu4I";

/** Norway site ID in refunder tracking links */
const NORWAY_SITE_ID = "4aefb3fa-6549-11ef-be75-0aaed722973b";

const OFFERS_QUERY = `
  query ($limit: Int!, $skip: Int!, $now: DateTime!) {
    offerCollection(
      limit: $limit
      skip: $skip
      locale: "nb-NO"
      where: { expiresOn_gt: $now, startsOn_lte: $now }
    ) {
      total
      items {
        title
        longDescription
        merchant(where: { sys: { publishedVersion_exists: true } }) {
          name
        }
        externalTarget {
          link
        }
      }
    }
  }
`;

type SpennOfferItem = {
  title: string;
  longDescription: string | null;
  merchant: { name: string } | null;
  externalTarget: { link: string } | null;
};

export async function fetchSpenn(options: {
  generatedAt: string;
  logger: Logger;
  domainLookup: DomainLookup;
}): Promise<CashbackOffer[]> {
  const { generatedAt, logger, domainLookup } = options;
  const now = new Date().toISOString();

  const allItems: SpennOfferItem[] = [];
  let skip = 0;
  const limit = 100;

  while (true) {
    const response = await fetch(CONTENTFUL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CONTENTFUL_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: OFFERS_QUERY,
        variables: { limit, skip, now },
      }),
    });

    const json = (await response.json()) as {
      data?: {
        offerCollection?: { total: number; items: SpennOfferItem[] };
      };
    };
    const items = json.data?.offerCollection?.items ?? [];
    allItems.push(...items);

    if (items.length < limit) break;
    skip += limit;
  }

  logger.info(`Spenn: fetched ${allItems.length} active offers from Contentful`);

  // Group Norwegian offers by store UUID (one link per store is enough)
  const storeMap = new Map<string, { merchantName: string; link: string; desc: string }>();

  for (const item of allItems) {
    const name = item.merchant?.name;
    if (!name) continue;

    const link = item.externalTarget?.link ?? "";
    if (!link.includes("refunder.com") || !link.includes(NORWAY_SITE_ID))
      continue;

    const storeMatch = link.match(/store=([a-f0-9-]+)/);
    if (!storeMatch) continue;

    const storeId = storeMatch[1]!;
    if (!storeMap.has(storeId)) {
      storeMap.set(storeId, { merchantName: name, link, desc: item.longDescription ?? "" });
    }
  }

  // Fetch rates from refunder landing pages (more reliable than Contentful descriptions)
  const refunderRates = await fetchRefunderRates(
    [...storeMap.values()].map((s) => s.link),
    logger,
  );

  // Pick best rate per merchant (highest max)
  const best = new Map<string, { rate: string; maxVal: number; link: string; terms: string }>();

  for (const [, { merchantName, link, desc }] of storeMap) {
    // Prefer refunder page rate; fall back to Contentful description
    const parsed = refunderRates.get(link) ?? parseSpennRate(desc);
    if (!parsed) continue;

    const existing = best.get(merchantName);
    if (!existing || parsed.maxVal > existing.maxVal) {
      best.set(merchantName, { rate: parsed.rate, maxVal: parsed.maxVal, link, terms: parsed.terms });
    }
  }

  const offers: CashbackOffer[] = [];

  for (const [merchantName, { rate, link, terms }] of best) {
    const domains = lookupDomains(domainLookup, merchantName);

    offers.push({
      provider: "spenn",
      merchantName,
      domains,
      reward: rate,
      sourceUrl: "https://app.spenngroup.com",
      activationUrl: link,
      terms,
      updatedAt: generatedAt,
    });
  }

  logger.info(`Spenn: ${offers.length} Norwegian cashback offers`);
  return offers;
}

type ParsedRate = { rate: string; maxVal: number; terms: string };

/**
 * Fetch rates from refunder landing pages concurrently.
 * These pages are the source of truth and match the Spenn app.
 */
async function fetchRefunderRates(
  links: string[],
  logger: Logger,
): Promise<Map<string, ParsedRate>> {
  const results = new Map<string, ParsedRate>();
  const CONCURRENCY = 5;

  for (let i = 0; i < links.length; i += CONCURRENCY) {
    const batch = links.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (link) => {
        const res = await fetch(link, {
          headers: { "Accept-Language": "nb-NO,nb" },
          redirect: "manual",
        });
        const html = await res.text();
        const parsed = parseRefunderPage(html);
        if (parsed) results.set(link, parsed);
      }),
    );
    for (const r of settled) {
      if (r.status === "rejected") {
        logger.warn(`Spenn: refunder page fetch failed: ${r.reason}`);
      }
    }
  }

  logger.info(`Spenn: fetched rates from ${results.size}/${links.length} refunder pages`);
  return results;
}

/**
 * Parse rate from a refunder landing page HTML.
 * Title format: "Tjen [opp til] X,Y Spenn per 10 kr hos MerchantName"
 * Tiered rates appear as <li> elements: "Category: X,Y Spenn per 10 kr"
 * Simple rate in body: "Hos X tjener du Y,Z Spenn per 10 kr."
 */
function parseRefunderPage(html: string): ParsedRate | undefined {
  // Extract category-based rates from <li> elements
  const categoryMatches = [
    ...html.matchAll(/<li[^>]*>([^<]*?:\s*([\d,]+)\s*Spenn per 10 kr[^<]*)<\/li>/g),
  ];
  if (categoryMatches.length > 0) {
    const rows = categoryMatches.map((m) => {
      const full = (m[1] ?? "").replace(/&amp;/g, "&").trim();
      const colonIdx = full.lastIndexOf(":");
      const category = full.slice(0, colonIdx).trim();
      const value = parseFloat((m[2] ?? "0").replace(",", "."));
      return { category, value };
    });
    const values = rows.map((r) => r.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const rate =
      min === max ? `${fmt(max)} %` : `${fmt(min)}-${fmt(max)} %`;
    const terms = rows.length > 1
      ? rows
          .filter((r) => r.category)
          .map((r) => `${fmt(r.value)} % – ${r.category}`)
          .join("\n")
      : "";
    return { rate, maxVal: max, terms };
  }

  // Simple rate from body text: "tjener du X,Y Spenn per 10 kr"
  const bodyMatch = html.match(/tjener du ([\d,]+)\s*Spenn per 10 kr/);
  if (bodyMatch) {
    const val = parseFloat((bodyMatch[1] ?? "0").replace(",", "."));
    return { rate: `${fmt(val)} %`, maxVal: val, terms: "" };
  }

  // Fallback: parse from <title> tag
  const titleMatch = html.match(
    /<title>[^<]*?(?:opp til )?([\d,]+)\s*Spenn per 10 kr/,
  );
  if (titleMatch) {
    const val = parseFloat((titleMatch[1] ?? "0").replace(",", "."));
    return { rate: `${fmt(val)} %`, maxVal: val, terms: "" };
  }

  return undefined;
}

/**
 * Parses "X Spenn per 10 kr" from Contentful offer longDescription.
 * Used as fallback when the refunder page can't be fetched.
 * 1 Spenn = 10 øre, so X Spenn per 10 kr = X% cashback.
 */
function parseSpennRate(
  desc: string,
): ParsedRate | undefined {
  // Pattern 1: Markdown table "| Category | X,Y Spenn per 10 kr |"
  const tableMatches = [
    ...desc.matchAll(/\|\s*(.+?)\s*\|\s*([\d,]+)\s*Spenn per 10 kr\.?\s*\|/g),
  ];
  if (tableMatches.length > 0) {
    const rows = tableMatches.map((m) => ({
      category: (m[1] ?? "").replace(/^\|?\s*/, "").trim(),
      value: parseFloat((m[2] ?? "0").replace(",", ".")),
    }));
    const values = rows.map((r) => r.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const rate =
      min === max ? `${fmt(max)} %` : `${fmt(min)}-${fmt(max)} %`;
    const terms = rows.length > 1
      ? rows
          .filter((r) => r.category)
          .map((r) => `${fmt(r.value)} % – ${r.category}`)
          .join("\n")
      : "";
    return { rate, maxVal: max, terms };
  }

  // Pattern 2: "**X,Y Spenn per 10 kr**" (bold markdown, single rate)
  const boldMatch = desc.match(
    /\*\*(?:opp til )?([\d,]+)\s*Spenn per 10 kr\*\*/,
  );
  if (boldMatch) {
    const val = parseFloat((boldMatch[1] ?? "0").replace(",", "."));
    return { rate: `${fmt(val)} %`, maxVal: val, terms: "" };
  }

  return undefined;
}

function fmt(n: number): string {
  return n.toString().replace(".", ",");
}
