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
  extractUpToPercentageReward,
} from "../../shared/reward.js";
import type { Logger } from "../logger.js";

const PAGE_URL = "https://www.utdanningibergen.no/studentrabatter/";

/** Platform/generic domains that shouldn't trigger per-merchant notifications */
const BLOCKED_DOMAINS = new Set([
  "facebook.com",
  "ticketmaster.no",
  "fixit.no",
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
      `Utdanning i Bergen page returned ${response.status}`,
    );
  }

  const html = await response.text();

  // The discount data is embedded as a Vue component prop :discounts="[...]"
  // All JSON double quotes inside are HTML-encoded as &quot;
  const match = html.match(/:discounts="(\[.*?\])"/s);
  if (!match) {
    throw new Error("Could not find discounts data in page HTML");
  }

  const jsonStr = decodeHtmlEntities(match[1]!);
  const discounts = JSON.parse(jsonStr) as Discount[];

  input.logger.info(
    `Utdanning i Bergen: ${discounts.length} total discounts found`,
  );

  const now = new Date();
  const offers: CashbackOffer[] = [];

  for (const d of discounts) {
    if (d.validTo && new Date(d.validTo) < now) continue;

    if (typeof d.business_name !== "string" || d.business_name.trim().length === 0) {
      input.logger.warn(
        `Utdanning i Bergen: skipping discount ${d.id} from ${PAGE_URL} (missing business_name)`,
      );
      continue;
    }

    const domain = extractDomain(d.link);
    if (!domain) {
      input.logger.warn(
        `Utdanning i Bergen: no usable domain for ${d.business_name} (${d.link})`,
      );
      continue;
    }

    const reward = buildReward(d);
    const terms = buildTerms(d);
    const sourceUrl = `https://www.utdanningibergen.no/studentrabatter/${d.url}`;

    offers.push({
      provider: "utdanningibergen",
      merchantName: d.business_name.trim().replace(/^studentrabatt\s+/i, ""),
      domains: [domain],
      reward,
      sourceUrl,
      activationUrl: sourceUrl,
      terms,
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`Utdanning i Bergen: produced ${offers.length} offers`);
  return uniqueOffers(offers);
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

  if (d.discount_type === "%" && d.discount > 0) return `${d.discount} %`;
  if (d.discount_type === "NOK" && d.discount > 0) return `${d.discount} kr`;
  if (d.discount_type === "fastpris" && d.discount > 0) {
    const fixedPrice = `${d.discount} kr totalsum`;
    const additionalPercentage = extractPercentageReward(percentageDiscountText(text));
    return additionalPercentage ? `${fixedPrice} + ${additionalPercentage}` : fixedPrice;
  }

  // A zero amount is a missing value unless the text documents a free offer.
  const textReward =
    extractUpToPercentageReward(percentageDiscountText(text)) ||
    extractKrReward(text, { totalsum: false });
  if (textReward) return textReward;
  if (d.discount_type === "fastpris" && d.discount === 0) {
    const gratis = extractGratisReward(text);
    if (gratis) return gratis;
  }

  // Hvis vi ikke vet hva rabatten er, vis bare '?'
  return "?";
}

// Only percentages stated as a discount ("25 % på komplett brille",
// "opptil 70 % av ordinær pris", "20 % rabatt") — not e.g. VAT rates.
function percentageDiscountText(text: string): string {
  return text
    .split(/[\n.;]+|\s\+\s/)
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

  parts.push("Studentrabatt via utdanningibergen.no. Vis gyldig studentbevis.");

  return parts.join("\n");
}
