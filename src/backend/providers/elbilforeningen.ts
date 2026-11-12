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
  /elbil\.no|facebook\.com|instagram\.com|youtube\.com|linkedin\.com|(^|\.)x\.com|twitter\.com|apple\.com|google\.com|vimeo\.com|brreg\.no|dsb\.no|lovdata\.no|regjeringen\.no|vegvesen\.no|tuv\.at|forbrukertilsynet\.no|outlook\.com|powerappsportals\.com/;

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

    const reward = extractElbilReward(text);

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
    const parsed = unwrapSafeLink(parseUrl(href));

    if (parsed === undefined || EXCLUDED_LINK_HOSTS.test(parsed.hostname)) {
      continue;
    }

    const domain = toBaseDomain(normalizeDomainInput(parsed.hostname));
    counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }

  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best !== undefined ? [best[0]] : [];
}

// Outlook "safelinks" (eur02.safelinks.protection.outlook.com/?url=…) wrap the
// partner's real link; outlook.com is never the merchant (Storytel).
function unwrapSafeLink(url: URL | undefined): URL | undefined {
  if (url === undefined || !/(?:^|\.)safelinks\.protection\.outlook\.com$/i.test(url.hostname)) return url;
  const inner = url.searchParams.get("url");
  return inner === null ? undefined : parseUrl(inner);
}

// Loan and financing pages state equity and interest rates ("20 %
// egenkapital", "nominell rente fra 6,40 %"); those are not discounts.
const FINANCING_RATE_LINE = /\b(?:egenkapital|rente|belåning\w*|nedbetaling\w*)\b/i;
// A bundle extra ("I tillegg til dine allerede reduserte medlemspriser får du
// kr. 400 i rabatt" when bought with another test) is not the benefit itself.
const BUNDLE_EXTRA_LINE = /\bi\s+tillegg\s+til\s+dine\s+allerede\s+reduserte\b|\bpakkepris\w*\b/i;

export function extractElbilReward(text: string): string {
  const rewardText = text
    .split(/\n/)
    .filter((line) => !FINANCING_RATE_LINE.test(line) && !BUNDLE_EXTRA_LINE.test(line))
    // A list dash ("- 20 % rabatt") after a line ending in a date or number
    // must not read as a range ("29.06\n- 20 %" -> "29-20 %").
    .map((line) => line.replace(/^(\s*)[-–]\s+/, "$1• "))
    .join("\n");
  const reward = extractBenefitReward(rewardText);
  // "100% rabatt og gratis frakt på alle skilt" is a free item.
  return reward === "100 %" ? "0 kr totalsum" : reward;
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
