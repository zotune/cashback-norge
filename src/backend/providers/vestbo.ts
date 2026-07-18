// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import { gotScraping } from "crawlee";
import type { CashbackOffer } from "../../shared/cashback.js";
import { normalizeDomainInput, parseUrl, stripHtml } from "../../shared/cashback.js";
import { extractBenefitReward } from "../../shared/reward.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

export type FetchVestboInput = {
  /** WP REST endpoint for the member benefits page, e.g. https://vestbo.no/wp-json/wp/v2/pages/9544 */
  apiUrl: string;
  generatedAt: string;
  logger: Logger;
  overrides: ProviderOverrides;
};

const BENEFITS_PAGE_URL = "https://vestbo.no/mitt-medlemskap/medlemsfordeler/";
const DEFAULT_TERMS = "Krever Vestbo-medlemskap. Vis gyldig medlemsbevis.";

export async function fetchVestbo(
  input: FetchVestboInput,
): Promise<CashbackOffer[]> {
  input.logger.info(`Fetching Vestbo benefits from ${input.apiUrl}`);

  const response = await gotScraping(input.apiUrl, {
    responseType: "json",
    throwHttpErrors: false,
    timeout: { request: 30_000 },
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(
      `Vestbo API returned ${response.statusCode}: ${response.statusMessage}`,
    );
  }

  const content = readRenderedContent(response.body);

  if (content === undefined) {
    throw new Error("Vestbo API returned unexpected data format");
  }

  const cards = parseBenefitCards(content);

  if (cards.length === 0) {
    throw new Error("Vestbo benefits page contained no benefit cards");
  }

  const offers: CashbackOffer[] = [];

  for (const card of cards) {
    const parsedLink = parseUrl(
      card.link.includes("://") ? card.link : `https://${card.link}`,
    );

    if (parsedLink === undefined) {
      continue;
    }

    const domain = normalizeDomainInput(parsedLink.hostname);

    // Internal links (e.g. "Selge boligen din") are Vestbo's own services,
    // not external member discounts.
    if (domain === "" || domain === "vestbo.no" || domain.endsWith(".vestbo.no")) {
      continue;
    }

    const reward = extractBenefitReward(card.text);

    if (reward === "") {
      input.logger.info(`Vestbo: no parseable reward for ${domain}, skipping`);
      continue;
    }

    const overrideDomains = (input.overrides["vestbo"] ?? {})[domain];
    const domains = overrideDomains !== undefined && overrideDomains.length > 0
      ? overrideDomains
      : [domain];

    offers.push({
      provider: "vestbo",
      merchantName: readMerchantName(card.text, domain),
      domains,
      reward,
      sourceUrl: BENEFITS_PAGE_URL,
      activationUrl: BENEFITS_PAGE_URL,
      terms: buildTerms(card.text),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`Found ${offers.length} Vestbo offers with domains`);
  return offers;
}

type BenefitCard = { link: string; text: string };

// The page body is WPBakery shortcode markup where each benefit is a
// [vc_single_image ... link=»partner-url»] followed by a
// [vc_column_text]description[/vc_column_text] block. Quotes render as
// &raquo; entities in the REST payload.
function parseBenefitCards(content: string): BenefitCard[] {
  const cards: BenefitCard[] = [];
  const imagePattern = /\[vc_single_image[^\]]*?link=&raquo;([^&\]]+?)&raquo;[^\]]*\]/g;

  for (const imageMatch of content.matchAll(imagePattern)) {
    const link = (imageMatch[1] ?? "").trim();

    if (link === "") {
      continue;
    }

    const rest = content.slice((imageMatch.index ?? 0) + imageMatch[0].length);
    const textMatch = rest.match(/\[vc_column_text[^\]]*\]([\s\S]*?)\[\/vc_column_text\]/);

    if (textMatch === null) {
      continue;
    }

    // Don't cross into the next benefit card's text block
    const nextImageIndex = rest.search(/\[vc_single_image/);
    const textIndex = rest.indexOf(textMatch[0]);

    if (nextImageIndex !== -1 && nextImageIndex < textIndex) {
      continue;
    }

    cards.push({
      link,
      text: stripHtml(shortcodesToText(textMatch[1] ?? "")),
    });
  }

  return cards;
}

function shortcodesToText(value: string): string {
  return value.replace(/\[[^\]]*\]/g, "\n");
}

function readMerchantName(text: string, domain: string): string {
  const hosMatch = text.match(
    /\bhos\s+([A-ZÆØÅ][\wÆØÅæøå&'-]*(?: [A-ZÆØÅ][\wÆØÅæøå&'-]*){0,3})/,
  );

  if (hosMatch !== null) {
    return (hosMatch[1] ?? "").trim();
  }

  const stem = domain.replace(/\.(?:no|com|net)$/, "");
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

function buildTerms(text: string): string {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 12 && line.length <= 220)
    .slice(0, 5);

  return [...lines, DEFAULT_TERMS].join("\n");
}

function readRenderedContent(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }

  const content = (body as Record<string, unknown>).content;

  if (typeof content !== "object" || content === null) {
    return undefined;
  }

  const rendered = (content as Record<string, unknown>).rendered;
  return typeof rendered === "string" ? rendered : undefined;
}
