// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import { gotScraping } from "crawlee";
import type { CashbackOffer } from "../../shared/cashback.js";
import { normalizeDomainInput, parseUrl, stripHtml, toBaseDomain } from "../../shared/cashback.js";
import { extractBenefitReward } from "../../shared/reward.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

export type FetchElbilInput = {
  /** WP REST endpoint, e.g. https://elbil.no/wp-json/wp/v2/membership-benefit */
  apiUrl: string;
  generatedAt: string;
  logger: Logger;
  overrides: ProviderOverrides;
};

const DEFAULT_TERMS = "Krever medlemskap i Norsk elbilforening.";

const EXCLUDED_LINK_HOSTS =
  /elbil\.no|facebook\.com|instagram\.com|youtube\.com|linkedin\.com|(^|\.)x\.com|twitter\.com|apple\.com|google\.com|vimeo\.com|brreg\.no|dsb\.no|lovdata\.no|regjeringen\.no|vegvesen\.no|tuv\.at|forbrukertilsynet\.no/;

type WpBenefit = {
  slug?: string;
  link?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
};

export async function fetchElbil(input: FetchElbilInput): Promise<CashbackOffer[]> {
  input.logger.info(`Fetching Elbilforeningen benefits from ${input.apiUrl}`);

  const benefits: WpBenefit[] = [];
  let page = 1;

  while (true) {
    const url = `${input.apiUrl}?per_page=100&page=${page}&_fields=slug,link,title,content`;
    const response = await gotScraping(url, {
      responseType: "json",
      throwHttpErrors: false,
      timeout: { request: 30_000 },
    });

    if (response.statusCode === 400 && page > 1) {
      break;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(
        `Elbilforeningen API returned ${response.statusCode}: ${response.statusMessage}`,
      );
    }

    const body: unknown = response.body;

    if (!Array.isArray(body)) {
      throw new Error("Elbilforeningen API returned unexpected data format");
    }

    benefits.push(...(body as WpBenefit[]));

    if (body.length < 100) {
      break;
    }

    page += 1;
  }

  if (benefits.length === 0) {
    throw new Error("Elbilforeningen API returned no benefits");
  }

  input.logger.info(`Elbilforeningen: ${benefits.length} benefits`);

  const offers: CashbackOffer[] = [];

  for (const benefit of benefits) {
    const merchantName = stripHtml(benefit.title?.rendered ?? "").trim();
    const contentHtml = benefit.content?.rendered ?? "";
    const text = stripHtml(contentHtml);

    if (merchantName === "" || text === "") {
      continue;
    }

    const reward = extractBenefitReward(text);

    if (reward === "") {
      input.logger.info(`Elbilforeningen: no parseable reward for ${merchantName}, skipping`);
      continue;
    }

    const slug = benefit.slug ?? merchantName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const overrideDomains = (input.overrides["elbilforeningen"] ?? {})[slug];
    const domains = overrideDomains !== undefined && overrideDomains.length > 0
      ? overrideDomains
      : findPartnerDomains(contentHtml);

    if (domains.length === 0) {
      input.logger.info(`Elbilforeningen: no partner domain for ${merchantName}, skipping`);
      continue;
    }

    const benefitUrl = benefit.link ?? "https://elbil.no/medlemsfordeler/";

    offers.push({
      provider: "elbilforeningen",
      merchantName,
      domains,
      reward,
      sourceUrl: benefitUrl,
      activationUrl: benefitUrl,
      terms: buildTerms(text),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`Found ${offers.length} Elbilforeningen offers with domains`);
  return offers;
}

function findPartnerDomains(contentHtml: string): string[] {
  const counts = new Map<string, number>();

  for (const match of contentHtml.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
    const href = (match[1] ?? "").replace(/&amp;/g, "&");
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

function buildTerms(text: string): string {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 12 && line.length <= 220 &&
      /\b(?:rabatt|medlemspris|tilbud|gjelder|spar|bonus|gratis)\b/i.test(line))
    .slice(0, 4);

  return [...lines, DEFAULT_TERMS].join("\n");
}
