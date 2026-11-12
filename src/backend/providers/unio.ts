// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import {
  type CashbackOffer,
  normalizeDomainInput,
  uniqueOffers,
} from "../../shared/cashback.js";
import {
  extractBenefitReward,
  extractKrReward,
  extractOreLitreReward,
  extractUpToPercentageReward,
  relevantBenefitRewardText,
} from "../../shared/reward.js";
import type { Logger } from "../logger.js";

const API_URL = "https://www.unio.no/wp-json/wp/v2/pages?parent=22&per_page=100";

/** Domains that should not be used as merchant identifiers */
const BLOCKED_DOMAINS = new Set([
  "unio.no",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "linkedin.com",
  "youtube.com",
  "norskpensjon.no",
  // Shared hotel booking engine (De Historiske's reservation links), not a shop.
  "be.synxis.com",
]);

type WpPage = {
  id: number;
  slug: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
  modified_gmt: string;
};

export type FetchUnioInput = {
  generatedAt: string;
  logger: Logger;
};

export async function fetchUnio(
  input: FetchUnioInput,
): Promise<CashbackOffer[]> {
  input.logger.info("Unio: fetching membership benefits...");

  const response = await fetch(API_URL, {
    headers: { "User-Agent": "CashbackNorge/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Unio API returned ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    const body = await response.text();
    throw new Error(
      `Unio API returned ${contentType || "unknown content type"}: ${formatBodyPreview(body)}`,
    );
  }

  const pages = (await response.json()) as WpPage[];
  input.logger.info(`Unio: ${pages.length} benefit pages found`);

  const offers: CashbackOffer[] = [];

  for (const page of pages) {
    const text = benefitBodyText(stripHtml(page.content.rendered));
    const offer = parsePageOffer(page, text, input.generatedAt);
    if (offer) {
      offers.push(offer);
    } else {
      input.logger.warn(`Unio: skipped ${page.title.rendered} (no usable domain/reward)`);
    }
  }

  input.logger.info(`Unio: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}

function formatBodyPreview(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 120);
}

function parsePageOffer(
  page: WpPage,
  text: string,
  generatedAt: string,
): CashbackOffer | null {
  const domains = selectMerchantDomains(
    extractDomainsFromHtml(page.content.rendered),
    decodeHtmlEntities(page.title.rendered),
    page.slug,
  );
  if (domains.length === 0) return null;

  const reward = extractReward(text);
  if (!reward) return null;

  const discountCode = extractDiscountCode(text);
  const terms = buildTerms(text);
  const merchantName = decodeHtmlEntities(page.title.rendered);

  return {
    provider: "unio",
    merchantName,
    domains,
    reward,
    sourceUrl: page.link,
    activationUrl: page.link,
    terms,
    ...(discountCode ? { discountCode } : {}),
    updatedAt: generatedAt,
  };
}

// Every page ends with the same «Unios medlemsprodukter: Avis Bertel O. Steen
// …» navigation list, which is not part of the benefit.
function benefitBodyText(text: string): string {
  return text.replace(/\s*Unios medlemsprodukter:[\s\S]*$/i, "").trim();
}

function extractReward(text: string): string {
  // Fuel discounts are per litre ("52 øre* per liter"; the asterisk marks a
  // footnote). The credit card's "effektiv rente … 31,13 prosent" and side
  // perks must not become the percentage reward.
  const oreLitre = extractOreLitreReward(text.replace(/(\d\s*øre)\*+/gi, "$1"));
  if (oreLitre) return oreLitre;

  const rewardText = relevantBenefitRewardText(text);
  // "Inntil 30 prosent rabatt" is a maximum, not a guaranteed rate.
  const percentage = extractUpToPercentageReward(rewardText);
  if (percentage) return percentage;

  const kr = extractKrReward(rewardText, { totalsum: false });
  if (kr) return kr;

  // Benefits without a stated rate ("medlemspriser på boliglån", "rabatt på
  // elbiler … varierer fra merke til merke").
  return extractBenefitReward(text);
}

const CODE_PATTERNS = [
  // "Oppgi rabattnummer W330405 ved bestilling"
  /\brabattnummer\s+([A-Za-z0-9-]+)/gi,
  // "koden «UNIO1000»", "Anvend koden samhold20", "kode W330405"
  /\b(?:rabatt|kampanje)?koden?\s+[«"“']?([A-Za-z0-9-]+)[»"”']?/gi,
];

function extractDiscountCode(text: string): string | undefined {
  for (const pattern of CODE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const code = (match[1] ?? "").replace(/[.,;:!?]+$/, "");
      // Instructions ("rabattkode i kassen", "rabattkode (AWD-nummer)",
      // "Rabattkoden gjelder …") are not codes; real codes carry a digit or
      // are written in capitals.
      if (code.length < 3 || code.length > 30) continue;
      if (!/\d/.test(code) && !/^[A-Z0-9-]+$/.test(code)) continue;
      return code;
    }
  }

  return undefined;
}

// Pages also link to unrelated organisations ("Initiativ for Etisk Handel" on
// the Stormberg page): when some link matches the merchant, keep only those.
function selectMerchantDomains(domains: string[], merchantName: string, slug: string): string[] {
  const nameKey = normalizeKey(merchantName);
  const slugKey = normalizeKey(slug);
  const matching = domains.filter((domain) => {
    const label = normalizeKey(domain.split(".").at(-2) ?? domain);
    return label.length >= 3 && (nameKey.includes(label) || label.includes(nameKey) || slugKey.includes(label));
  });
  return matching.length > 0 ? matching : domains;
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function extractDomainsFromHtml(html: string): string[] {
  const domains: string[] = [];
  // Extract hrefs that point to external merchant sites
  const hrefPattern = /href="(https?:\/\/[^"]+)"/gi;

  for (const match of html.matchAll(hrefPattern)) {
    const url = match[1]!;
    try {
      const parsed = new URL(url);
      const domain = normalizeDomainInput(parsed.hostname);
      if (BLOCKED_DOMAINS.has(domain)) continue;
      if (domain.endsWith(".unio.no")) continue;
      // Skip image/media URLs
      if (/\.(jpg|jpeg|png|gif|svg|webp|mp4|pdf)$/i.test(parsed.pathname)) continue;
      if (!domains.includes(domain)) {
        domains.push(domain);
      }
    } catch {
      // skip invalid URLs
    }
  }

  return domains;
}

function buildTerms(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const relevant = sentences.filter((s) =>
    /rabatt|medlemspris|fordel|prosent|kode|tilbud|gjelder|øre|kroner|%/i.test(s) &&
    !/\beffektiv rente\b/i.test(s),
  );
  const lines: string[] = [];
  let length = 0;
  for (const sentence of relevant) {
    if (length + sentence.length > 600) break;
    lines.push(sentence);
    length += sentence.length + 1;
  }
  return lines.join(" ");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—");
}
