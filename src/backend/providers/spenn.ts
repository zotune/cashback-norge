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

  // Pick best rate per merchant (highest max)
  const best = new Map<string, { rate: string; maxVal: number; link: string; terms: string }>();

  for (const item of allItems) {
    const name = item.merchant?.name;
    if (!name) continue;

    const link = item.externalTarget?.link ?? "";
    if (!link.includes("refunder.com") || !link.includes(NORWAY_SITE_ID))
      continue;

    const parsed = parseSpennRate(item.longDescription ?? "");
    if (!parsed) continue;

    const existing = best.get(name);
    if (!existing || parsed.maxVal > existing.maxVal) {
      best.set(name, { rate: parsed.rate, maxVal: parsed.maxVal, link, terms: parsed.terms });
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

/**
 * Parses "X Spenn per 10 kr" from offer longDescription.
 * 1 Spenn = 10 øre, so X Spenn per 10 kr = X% cashback.
 */
function parseSpennRate(
  desc: string,
): { rate: string; maxVal: number; terms: string } | undefined {
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
