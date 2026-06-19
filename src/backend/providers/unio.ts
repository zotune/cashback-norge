// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import {
  type CashbackOffer,
  normalizeDomainInput,
  uniqueOffers,
} from "../../shared/cashback.js";
import { extractKrReward, extractPercentageReward } from "../../shared/reward.js";
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
    const text = stripHtml(page.content.rendered);
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
  const domains = extractDomainsFromHtml(page.content.rendered);
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

function extractReward(text: string): string {
  // Try percentage first (e.g. "20 prosent rabatt", "30%")
  const pct = extractPercentageReward(text);
  if (pct) return pct;

  // Try kr reward (e.g. "1000 kroner i rabatt", "500 kr rabatt")
  const kr = extractKrReward(text);
  if (kr) return kr;

  return "";
}

function extractDiscountCode(text: string): string | undefined {
  // Match patterns like:  koden «UNIO1000», kode "samhold20", kode W330405
  const patterns = [
    /(?:kode|rabattkode|kampanjekode|oppgi)\s+[«""']([^»""']+)[»""']/i,
    /(?:kode|rabattkode|kampanjekode)\s+(\S+)/i,
    /AWD-nummer\)\s+(\S+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const code = match[1].replace(/[.,;:!?]+$/, "");
      if (code.length >= 3 && code.length <= 30) return code;
    }
  }

  return undefined;
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
  // Take a relevant excerpt — first 2 sentences that mention rabatt/fordel/prosent
  const sentences = text.split(/(?<=[.!?])\s+/);
  const relevant = sentences.filter((s) =>
    /\b(?:rabatt|fordel|prosent|%|kr|kode|tilbud)\b/i.test(s),
  );
  return relevant.slice(0, 3).join(" ").slice(0, 500);
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
