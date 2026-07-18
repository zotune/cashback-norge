// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import { gotScraping } from "crawlee";
import type { CashbackOffer } from "../../shared/cashback.js";
import { normalizeDomainInput, parseUrl, stripHtml, toBaseDomain } from "../../shared/cashback.js";
import { extractBenefitReward } from "../../shared/reward.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

export type FetchYsInput = {
  /** WP REST endpoint for the benefits page, e.g. https://ys.no/wp-json/wp/v2/pages?slug=medlemsfordeler */
  apiUrl: string;
  generatedAt: string;
  logger: Logger;
  overrides: ProviderOverrides;
};

const BENEFITS_PAGE_URL = "https://ys.no/medlemsfordeler/";
const DEFAULT_TERMS = "Krever medlemskap i et YS-forbund.";

const EXCLUDED_LINK_HOSTS =
  /ys\.no|facebook\.com|instagram\.com|youtube\.com|linkedin\.com|twitter\.com|(^|\.)x\.com|flickr\.com|google\.com|gmpg\.org/;

export async function fetchYs(input: FetchYsInput): Promise<CashbackOffer[]> {
  input.logger.info(`Fetching YS benefits from ${input.apiUrl}`);

  const response = await gotScraping(input.apiUrl, {
    responseType: "json",
    throwHttpErrors: false,
    timeout: { request: 30_000 },
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(
      `YS API returned ${response.statusCode}: ${response.statusMessage}`,
    );
  }

  const content = readPageContent(response.body);

  if (content === undefined) {
    throw new Error("YS API returned unexpected data format");
  }

  const cards = splitCardsByHeading(content);

  if (cards.length === 0) {
    throw new Error("YS benefits page contained no benefit cards");
  }

  input.logger.info(`YS: ${cards.length} benefit cards`);

  const offers: CashbackOffer[] = [];
  const seenDomains = new Set<string>();

  for (const card of cards) {
    const merchantName = card.heading.trim();
    const text = cleanBenefitText(stripHtml(card.html));

    if (merchantName === "" || text === "") {
      continue;
    }

    const reward = extractBenefitReward(text);

    if (reward === "") {
      continue;
    }

    const slug = merchantName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const overrideDomains = (input.overrides["ys"] ?? {})[slug];
    const domains = overrideDomains !== undefined && overrideDomains.length > 0
      ? overrideDomains
      : findPartnerDomains(card.html);

    const firstDomain = domains[0];

    if (firstDomain === undefined || seenDomains.has(firstDomain)) {
      continue;
    }

    seenDomains.add(firstDomain);

    offers.push({
      provider: "ys",
      merchantName,
      domains,
      reward,
      sourceUrl: BENEFITS_PAGE_URL,
      activationUrl: BENEFITS_PAGE_URL,
      terms: buildTerms(text),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`Found ${offers.length} YS offers with domains`);
  return offers;
}

type YsCard = { heading: string; html: string };

// Each benefit card is an <article class="post-article"> holding the partner
// image link and a descriptionbox whose <span class="boldtext…"> carries the
// partner name.
function splitCardsByHeading(content: string): YsCard[] {
  const cards: YsCard[] = [];
  const boxPattern = /<article class="post-article"/g;
  const matches = [...content.matchAll(boxPattern)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    if (match === undefined) continue;

    const start = match.index ?? 0;
    const end = matches[i + 1]?.index ?? content.length;
    const html = content.slice(start, end);
    const nameMatch = html.match(/<span class="boldtext[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    // Grid cards leave the boldtext span empty and put the partner name in
    // the postheading instead.
    const postHeadingMatch = html.match(/<h2 class="postheading[^"]*"[^>]*>([\s\S]*?)<\/h2>/i);
    const boldName = stripHtml(nameMatch?.[1] ?? "").replace(/\s+/g, " ").trim();
    const heading = boldName !== ""
      ? boldName
      : stripHtml(postHeadingMatch?.[1] ?? "").replace(/\s+/g, " ").trim();

    cards.push({ heading, html });
  }

  return cards;
}

function findPartnerDomains(cardHtml: string): string[] {
  const counts = new Map<string, number>();

  for (const match of cardHtml.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
    const href = (match[1] ?? "").replace(/&#038;|&amp;/g, "&");
    const parsed = parseUrl(href);

    if (parsed === undefined || EXCLUDED_LINK_HOSTS.test(parsed.hostname)) {
      continue;
    }

    const domain = toBaseDomain(normalizeDomainInput(parsed.hostname));
    counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }

  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best !== undefined ? [best[0]] : [];
}

// Marketing statistics ("60% av medlemmene benytter…") must not be read as
// discounts.
function cleanBenefitText(text: string): string {
  return text
    .split(/\n+/)
    .filter((line) => !/av\s+(?:våre\s+)?medlemme(?:ne|r)\b/i.test(line))
    .join("\n");
}

function buildTerms(text: string): string {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 12 && line.length <= 220 &&
      /\b(?:rabatt|medlemspris|tilbud|gjelder|spar|bonus|kode)\b/i.test(line))
    .slice(0, 4);

  return [...lines, DEFAULT_TERMS].join("\n");
}

function readPageContent(body: unknown): string | undefined {
  if (!Array.isArray(body) || body.length === 0) {
    return undefined;
  }

  const page = body[0] as Record<string, unknown>;
  const content = page.content as Record<string, unknown> | undefined;
  const rendered = content?.rendered;
  return typeof rendered === "string" ? rendered : undefined;
}
