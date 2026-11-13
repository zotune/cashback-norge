// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import {
  type CashbackOffer,
  normalizeDomainInput,
  uniqueOffers,
} from "../../shared/cashback.js";
import {
  extractGratisReward,
  extractKrReward,
  extractPercentageReward,
  extractPercentageValues,
  extractUpToPercentageReward,
  formatRewardNumber,
} from "../../shared/reward.js";
import type { Logger } from "../logger.js";

const PAGE_URL = "https://www.utdanningibergen.no/studentrabatter/";
const TERMS_FOOTER = "Studentrabatt via utdanningibergen.no. Vis gyldig studentbevis.";

/** Platform/generic domains that shouldn't trigger per-merchant notifications:
 * social media, ticket sellers and file CDNs ("Eline Bang" links a PDF on
 * cdn.shopify.com) are not the merchant's own site. */
const BLOCKED_DOMAINS = new Set([
  "facebook.com",
  "ticketmaster.no",
  "fixit.no",
  "cdn.shopify.com",
  "cloudfront.net",
  "amazonaws.com",
]);

type Discount = {
  id: number;
  name: string;
  business_name: string | null;
  discount_type: "%" | "fastpris" | "NOK" | null;
  discount: number;
  description: string | null;
  conditions: string | null;
  validTo: string | null;
  categories: { id: number; name: string }[];
  link: string;
  url: string;
};

export type FetchUtdanningiBergenInput = {
  generatedAt: string;
  logger: Logger;
  /** Verified merchant domains by discount slug (data/provider-overrides.json). */
  overrides?: Record<string, string[]>;
};

export async function fetchUtdanningiBergen(
  input: FetchUtdanningiBergenInput,
): Promise<CashbackOffer[]> {
  input.logger.info("Utdanning i Bergen: fetching discounts...");

  const response = await fetch(PAGE_URL, {
    headers: {
      Cookie: "cookie_consent=accepted",
      "User-Agent": "CashbackNorge/1.0",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(
      `Utdanning i Bergen: GET ${PAGE_URL} returned HTTP ${response.status}`,
    );
  }

  const html = await response.text();

  // The discount data is embedded as a Vue component prop :discounts="[...]"
  // All JSON double quotes inside are HTML-encoded as &quot;
  const match = html.match(/:discounts="(\[.*?\])"/s);
  if (!match) {
    throw new Error(`Utdanning i Bergen: no :discounts data in ${PAGE_URL} (page format changed?)`);
  }

  const jsonStr = decodeHtmlEntities(match[1]!);
  const discounts = JSON.parse(jsonStr) as Discount[];

  input.logger.info(
    `Utdanning i Bergen: ${discounts.length} total discounts found`,
  );

  const now = new Date();
  const offers: CashbackOffer[] = [];
  const entriesByMerchant = new Map<string, { offer: CashbackOffer; title: string }[]>();

  for (const d of discounts) {
    if (d.validTo && new Date(d.validTo) < now) continue;

    if (typeof d.business_name !== "string" || d.business_name.trim().length === 0) {
      input.logger.warn(
        `Utdanning i Bergen: skipping discount ${d.id} from ${PAGE_URL} (missing business_name)`,
      );
      continue;
    }

    const overrideDomains = input.overrides?.[d.url.replace(/^\/+|\/+$/g, "")];
    const domain = overrideDomains?.[0] ?? extractDomain(d.link);
    if (!domain) {
      input.logger.warn(
        `Utdanning i Bergen: no usable domain for ${d.business_name} (${d.link})`,
      );
      continue;
    }

    const reward = buildReward(d);
    const terms = buildTerms(d);
    const sourceUrl = `https://www.utdanningibergen.no/studentrabatter/${d.url}`;

    const merchantName = d.business_name.trim().replace(/^studentrabatt\s+/i, "");
    const offer: CashbackOffer = {
      provider: "utdanningibergen",
      merchantName,
      domains: overrideDomains ?? [domain],
      reward,
      ...(reward.endsWith(" kr/mnd") ? { promotion: monthlyPricePromotion(reward) } : {}),
      sourceUrl,
      activationUrl: sourceUrl,
      terms,
      updatedAt: input.generatedAt,
    };
    const key = merchantName.toLowerCase();
    entriesByMerchant.set(key, [...(entriesByMerchant.get(key) ?? []), { offer, title: stripHtml(d.name ?? "") }]);
  }

  // The index keeps one offer per provider and merchant. Several entries for
  // one merchant (Bergen Kino: 20 kr off Mon-Wed and a 120 kr Studentkino
  // ticket) are merged so that no benefit disappears from the tooltip.
  for (const entries of entriesByMerchant.values()) {
    offers.push(mergeMerchantEntries(entries));
  }

  input.logger.info(`Utdanning i Bergen: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}

function mergeMerchantEntries(entries: { offer: CashbackOffer; title: string }[]): CashbackOffer {
  if (entries.length === 1) return entries[0]!.offer;
  const [primary] = [...entries].sort((a, b) => entryRank(b.offer) - entryRank(a.offer));
  const others = entries.filter((entry) => entry !== primary);
  const otherTerms = others.map((entry) => {
    const title = entry.title || entry.offer.merchantName;
    return `Også: ${title} (${entry.offer.reward === "?" ? "ukjent rabatt" : entry.offer.reward}): ${termsWithoutFooter(entry.offer.terms)}`;
  });
  return {
    ...primary!.offer,
    domains: [...new Set(entries.flatMap((entry) => entry.offer.domains))],
    terms: [termsWithoutFooter(primary!.offer.terms), ...otherTerms, TERMS_FOOTER].join("\n"),
  };
}

// Discounts before prices; a price is a cost to the student, so a lower
// price ranks higher. Unknown rewards rank last.
function entryRank(offer: CashbackOffer): number {
  const reward = offer.reward;
  const number = Number.parseFloat((reward.match(/\d+(?:[,.]\d+)?/)?.[0] ?? "0").replace(",", "."));
  if (reward === "0 kr totalsum") return 3_000;
  if (/%/.test(reward)) return 2_000 + number;
  if (/^\d[\d\s]*(?:-\d+)?\s*kr$/.test(reward)) return 1_000 + Math.min(number, 999);
  if (/kr/.test(reward)) return 500 - Math.min(number, 499);
  return 0;
}

function termsWithoutFooter(terms: string): string {
  return terms.split("\n").filter((line) => line !== TERMS_FOOTER).join("\n");
}

function monthlyPricePromotion(reward: string): { label: string; priceNok: number } {
  return { label: reward, priceNok: Number.parseInt(reward, 10) };
}

function extractDomain(link: string): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    const domain = normalizeDomainInput(url.hostname);
    if (BLOCKED_DOMAINS.has(domain)) return null;
    for (const blocked of BLOCKED_DOMAINS) {
      if (domain.endsWith(`.${blocked}`)) return null;
    }
    return domain;
  } catch {
    return null;
  }
}

// The structured `discount_type`/`discount` pair is the primary source. Some
// entries leave the amount at 0 and state the benefit only in their public
// description/conditions ("Young-rabatt på opptil 70 %", "Gratis inngang"),
// or add a second benefit there ("Kun synsundersøkelse + 25 % på komplett
// brille"). Those texts are read with the shared reward functions.
function buildReward(d: Discount): string {
  const text = [d.description, d.conditions]
    .filter((part): part is string => typeof part === "string")
    .map(stripHtml)
    .join("\n");
  const discountText = percentageDiscountText(text);

  if (d.discount_type === "%" && d.discount > 0) {
    // Keep the source's own qualifiers for the structured rate: "Opptil 50%
    // rabatt på forestillinger" is a maximum, and "2.5% – 10% rabatt avhengig
    // av jobben" is a range whose top is the structured value.
    const textValues = extractPercentageValues(discountText);
    if (textValues.length > 1 && Math.max(...textValues) === d.discount && extractPercentageReward(discountText).includes("-")) {
      return extractUpToPercentageReward(discountText);
    }
    if (textValues.includes(d.discount) && extractUpToPercentageReward(discountText).startsWith("opptil ")) {
      return `opptil ${formatRewardNumber(d.discount)} %`;
    }
    return `${d.discount} %`;
  }
  if (d.discount_type === "NOK" && d.discount > 0) return `${d.discount} kr`;
  if (d.discount_type === "fastpris" && d.discount > 0) {
    const fixedPrice = fixedPriceReward(d, text);
    const additionalPercentage = extractPercentageReward(discountText);
    return additionalPercentage ? `${fixedPrice} + ${additionalPercentage}` : fixedPrice;
  }

  // A zero amount is a missing value unless the text documents a free offer.
  const textReward =
    extractUpToPercentageReward(discountText) ||
    extractKrReward(text, { totalsum: false });
  if (textReward) return textReward;
  if (d.discount_type === "fastpris" && d.discount === 0) {
    const gratis = extractGratisReward(text);
    if (gratis) return gratis;
  }

  // Hvis vi ikke vet hva rabatten er, vis bare '?'
  return "?";
}

// "Fastpris" is the price the student pays ("Rabatt: Fastpris 170 kr" on the
// site). Its unit is only in the text: a monthly fee ("Studentmedlem
// månedspris", "vi spanderer månedsavgiften"), an hourly rate ("Minimum 2
// timer", "per time") or a from-price ("Her vises bare fra-priser",
// "Studentpris fra 120 kr") is not the total of one purchase.
function fixedPriceReward(d: Discount, text: string): string {
  const amount = d.discount;
  const allText = `${stripHtml(d.name ?? "")}\n${text}`;
  if (/\b(?:månedspris|månedsavgift(?:en)?|per\s+(?:mnd|måned)|pr\.?\s*(?:mnd|måned))\b|\/\s*(?:mnd|md)\b/iu.test(allText)) {
    return `${formatRewardNumber(amount)} kr/mnd`;
  }
  if (/\b(?:timepris|per\s+time|pr\.?\s*time|minimum\s+\d+\s+timer)\b|\/\s*(?:time|t)\b/iu.test(allText)) {
    return `${formatRewardNumber(amount)} kr/time`;
  }
  const fromPrice = new RegExp(`\\bfra[\\s-]*(?:kr\\.?\\s*${amount}\\b|${amount}\\s*(?:kr|kroner|,-)|priser\\b)`, "iu");
  if (fromPrice.test(allText)) return `Fra ${formatRewardNumber(amount)} kr totalsum`;
  return `${formatRewardNumber(amount)} kr totalsum`;
}

// Only percentages stated as a discount ("25 % på komplett brille",
// "opptil 70 % av ordinær pris", "20 % rabatt") — not e.g. VAT rates.
function percentageDiscountText(text: string): string {
  return text
    // A sentence break, not a decimal point ("2.5% – 10% rabatt").
    .split(/[\n;]+|\.(?!\d)|\s\+\s/)
    .filter((part) => /\d\s*(?:%|prosent)\s*(?:rabatt|avslag|på|av)(?![\p{L}\d])/iu.test(part))
    .join("\n");
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function buildTerms(d: Discount): string {
  const parts: string[] = [];

  if (d.description) {
    const desc = stripHtml(d.description);
    if (desc) parts.push(desc);
  }

  if (d.conditions) {
    const cond = stripHtml(d.conditions);
    if (cond) parts.push(cond);
  }

  const cats = d.categories
    .map((c) => c.name)
    .filter(Boolean)
    .join(", ");
  if (cats) parts.push(cats);

  parts.push(TERMS_FOOTER);

  return parts.join("\n");
}
