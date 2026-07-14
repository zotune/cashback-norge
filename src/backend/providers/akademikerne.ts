// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import {
  type CashbackOffer,
  normalizeDomainInput,
  parseUrl,
  stripHtml,
  toBaseDomain,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import { extractKrReward, extractOreLitreReward, extractPercentageReward } from "../../shared/reward.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import { merchantDomainsFromHostname } from "../merchant-domains.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const API_BASE = "https://www.akademikernepluss.no/wp-json/wp/v2/pages";
const API_FIELDS = "id,slug,link,parent,title,excerpt,content";
const PAGE_SIZE = 100;
const BENEFIT_MARKER = /tilbys via akademikerne pluss/i;
const DEFAULT_TERMS = "Krever medlemskap i en fagforening tilknyttet Akademikerne Pluss.";

/** Page titles that describe the product instead of the merchant. */
const MERCHANT_NAME_BY_SLUG: Record<string, string> = {
  banktjenester: "Handelsbanken",
  "fond-og-pensjonssparing": "Kron",
  forsikringer: "A+ Forsikringer (Storebrand)",
  mobilabonnement: "Chilimobil",
};

/**
 * Pages where text extraction picks up side perks instead of the main benefit
 * (the bank page lists Hertz/parking discounts, the mobile page a small
 * family add-on discount next to the member prices).
 */
const REWARD_BY_SLUG: Record<string, string> = {
  banktjenester: "Medlemsfordel",
  mobilabonnement: "Medlemspris",
};

const SKIP_HOSTNAMES = new Set([
  "akademikernepluss.no",
  "apluss.page",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "google.com",
  "apple.com",
  "apps.apple.com",
  "play.google.com",
  "onelink.me",
  "vipps.no",
  "helsedirektoratet.no",
  "nav.no",
  "smartepenger.no",
  "mynewsdesk.com",
  "screen9.com",
  "cloud.email.storebrand.no",
  "blob.core.windows.net",
  "elementor.com",
  "cookieinformation.com",
]);

export type FetchAkademikerneInput = {
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

type WpPage = {
  id: number;
  slug: string;
  link: string;
  parent: number;
  title: { rendered: string };
  excerpt?: { rendered: string };
  content: { rendered: string };
};

export async function fetchAkademikerne(
  input: FetchAkademikerneInput,
): Promise<CashbackOffer[]> {
  input.logger.info("Akademikerne Pluss: fetching membership benefits...");

  const pages = await fetchAllPages();
  const benefitPages = pages.filter((page) => BENEFIT_MARKER.test(page.content.rendered));
  const benefitPageIds = new Set(benefitPages.map((page) => page.id));
  input.logger.info(
    `Akademikerne Pluss: ${pages.length} pages, ${benefitPages.length} benefit pages`,
  );

  const offers: CashbackOffer[] = [];
  let fromContent = 0;
  let lookedUp = 0;
  let overrideCount = 0;

  for (const page of benefitPages) {
    // Sub-pages of another benefit page are product variants (e.g. the twelve
    // insurance pages under "Forsikringer") — keep only the hub page.
    if (page.parent !== 0 && benefitPageIds.has(page.parent)) continue;

    const merchantName = merchantNameForPage(page);
    const html = page.content.rendered;
    const text = pageText(html);
    const excerpt = normalizeText(stripPageHtml(page.excerpt?.rendered ?? ""));

    let domains = (input.overrides.akademikerne?.[page.slug] ?? []).map(normalizeDomainInput);
    if (domains.length > 0) {
      overrideCount++;
    }

    if (domains.length === 0) {
      domains = resolveDomainsFromContent(merchantName, page.slug, html, text);
      if (domains.length > 0) fromContent++;
    }

    if (domains.length === 0) {
      for (const lookupName of lookupNamesForPage(merchantName, page.slug)) {
        domains = lookupDomains(input.domainLookup, lookupName);
        if (domains.length > 0) {
          lookedUp++;
          break;
        }
      }
    }

    if (domains.length === 0) {
      input.logger.warn(`Akademikerne Pluss offer has no domain: ${merchantName} (${page.slug})`);
      continue;
    }

    const isInsurancePage = /forsikring/i.test(`${merchantName} ${page.slug}`);
    offers.push({
      provider: "akademikerne",
      merchantName,
      domains: uniqueStrings(domains.flatMap((domain) => merchantDomainsFromHostname(domain))),
      reward: REWARD_BY_SLUG[page.slug] ??
        (extractAkademikerneReward(`${merchantName}\n${excerpt}\n${text}`, isInsurancePage) || "Medlemsfordel"),
      sourceUrl: page.link,
      activationUrl: page.link,
      terms: buildTerms(excerpt, text),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(
    `Akademikerne Pluss: resolved ${fromContent} via page content, ${lookedUp} via lookup, ${overrideCount} via overrides`,
  );
  input.logger.info(`Akademikerne Pluss: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}

async function fetchAllPages(): Promise<WpPage[]> {
  const pages: WpPage[] = [];

  for (let pageNumber = 1; pageNumber <= 10; pageNumber++) {
    const url = `${API_BASE}?per_page=${PAGE_SIZE}&page=${pageNumber}&_fields=${API_FIELDS}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "CashbackNorge/1.0" },
      signal: AbortSignal.timeout(120_000),
    });

    // Requesting past the last page returns 400 (rest_post_invalid_page_number).
    if (response.status === 400 && pageNumber > 1) break;
    if (!response.ok) {
      throw new Error(`Akademikerne Pluss API returned ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      const body = await response.text();
      throw new Error(
        `Akademikerne Pluss API returned ${contentType || "unknown content type"}: ${body.replace(/\s+/g, " ").trim().slice(0, 120)}`,
      );
    }

    const batch = (await response.json()) as WpPage[];
    pages.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return pages;
}

function merchantNameForPage(page: WpPage): string {
  const override = MERCHANT_NAME_BY_SLUG[page.slug];
  if (override !== undefined) return override;

  return normalizeText(decodeTitle(page.title.rendered))
    .replace(/^medlemsrabatt(?:er)?\s+(?:hos|på|fra)\s+/i, "")
    .replace(/^medlemsfordel(?:er)?\s+(?:hos|på|fra)\s+/i, "");
}

/**
 * Domain resolution tiers:
 * 1. candidate domains (external links + domains written in the text) whose
 *    label matches the merchant name or slug,
 * 2. domains named in call-to-action lines ("Bestill på Sumorestaurant.no"),
 * 3. a single unambiguous candidate (all candidates share one base domain).
 * Comparison/partner links (Gjensidige on the insurance pages, Handelsbanken
 * financing on the car pages) never win a tier on their own.
 */
function resolveDomainsFromContent(
  merchantName: string,
  slug: string,
  html: string,
  text: string,
): string[] {
  const candidates = uniqueStrings([
    ...extractHrefDomains(html),
    ...extractTextDomains(text),
  ]);
  if (candidates.length === 0) return [];

  const nameKey = normalizeKey(merchantName);
  const slugKey = normalizeKey(slug);
  const matching = candidates.filter((domain) => {
    const label = normalizeKey(toBaseDomain(domain).split(".")[0] ?? domain);
    if (label.length < 3) return false;
    return nameKey.includes(label) || label.includes(nameKey) || slugKey.includes(label);
  });
  if (matching.length > 0) return matching;

  const ctaDomains = extractCtaDomains(text).filter((domain) => candidates.includes(domain));
  if (ctaDomains.length > 0) return ctaDomains;

  const baseDomains = uniqueStrings(candidates.map((domain) => toBaseDomain(domain)));
  if (baseDomains.length === 1) return candidates;

  return [];
}

function extractHrefDomains(html: string): string[] {
  const domains: string[] = [];

  for (const match of html.matchAll(/href="(https?:\/\/[^"]+)"/gi)) {
    const parsed = parseUrl(match[1] ?? "");
    if (parsed === undefined) continue;
    if (/\.(?:jpg|jpeg|png|gif|svg|webp|mp4|pdf|css|js)$/i.test(parsed.pathname)) continue;

    const domain = normalizeDomainInput(parsed.hostname);
    if (isSkippedHostname(domain)) continue;
    domains.push(domain);
  }

  return uniqueStrings(domains);
}

function extractTextDomains(text: string): string[] {
  const domains: string[] = [];

  for (const match of text.matchAll(/\b(?:[a-z0-9æøå-]+\.)+(?:no|com|se|dk|net|org|app)\b/gi)) {
    const domain = normalizeDomainInput(transliterateNorwegian(match[0] ?? ""));
    if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain)) continue;
    if (isSkippedHostname(domain)) continue;
    domains.push(domain);
  }

  return uniqueStrings(domains);
}

function extractCtaDomains(text: string): string[] {
  const domains: string[] = [];
  const ctaPattern =
    /\b(?:bestill|meld deg inn|kjøp|book|handle|registrer(?: deg)?|verifiser|aktiver|gå til|besøk|start|se|les mer|sjekk pris(?:er)?)\b[^.!?\n]{0,60}?\b(?:på|hos|via)\s+((?:[a-z0-9æøå-]+\.)+(?:no|com|se|dk|net|org|app))\b/gi;

  for (const match of text.matchAll(ctaPattern)) {
    const domain = normalizeDomainInput(transliterateNorwegian(match[1] ?? ""));
    if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain)) continue;
    if (isSkippedHostname(domain)) continue;
    domains.push(domain);
  }

  return uniqueStrings(domains);
}

function extractAkademikerneReward(text: string, isInsurancePage: boolean): string {
  if (/\bhalv\s+pris\b/i.test(text)) return "50 %";

  const oreLitre = extractOreLitreReward(text);
  if (oreLitre) return oreLitre;

  const rewardText = relevantRewardText(text, isInsurancePage);
  const percentage = extractPercentageReward(rewardText);
  if (percentage) return percentage;

  const kr = extractKrReward(rewardText);
  if (kr) return kr;

  if (/\bmedlemspris(?:er)?\b/i.test(text)) return "Medlemspris";
  if (/\bgratis\b/i.test(text)) return "Gratis";
  if (/\brabatt/i.test(text)) return "Rabatt";

  return "";
}

function relevantRewardText(text: string, isInsurancePage: boolean): string {
  return text
    .split(/[\n.;]+/)
    .map(normalizeText)
    .filter((line) => {
      // The car pages cross-sell "Inntil 35% rabatt på bilforsikring" —
      // ignore insurance lines unless the page is about insurance.
      if (!isInsurancePage && /forsikring/i.test(line)) return false;

      // Discount tables render as bare value lines ("4 prosent", "25 prosent").
      if (/^\d{1,3}(?:[,.]\d+)?\s*(?:%|prosent)$/i.test(line)) return true;

      return /\b(?:rabatt(?:er)?|medlemsrabatt|besparelse|avslag|spar|tilbud|medlemspris(?:er)?|cashpoints|bonus)\b/i.test(line) ||
        /\bhalv\s+pris\b/i.test(line);
    })
    .join("\n");
}

function buildTerms(excerpt: string, text: string): string {
  return uniqueTextLines([
    excerpt,
    ...text.split(/\n+/).filter(isUsefulTermsLine).slice(0, 4),
    DEFAULT_TERMS,
  ]).join("\n");
}

function isUsefulTermsLine(line: string): boolean {
  const normalizedLine = normalizeText(line);

  return normalizedLine.length >= 12 &&
    normalizedLine.length <= 220 &&
    !isPageNoise(normalizedLine) &&
    /\b(?:rabatt(?:er|kode[nr]?)?|medlemspris(?:er)?|halv\s+pris|besparelse|spar|avslag|gjelder|vilkår|bindingstid|begrenset|medlemskap|medlemsbevis|cashpoints|kan (?:ikke|kun)|maks)\b/i.test(normalizedLine);
}

function isPageNoise(line: string): boolean {
  return /^(?:slik går du frem|medlemsfordelen kort oppsummert|tilbys via|relaterte fordeler|ofte stilte spørsmål|utforsk|finn |besøk |bestill|kom i gang|last ned|hent rabattkode)/i.test(line) ||
    /(?:\{|\}|=>|window\.|document\.|function\s*\(|cookie|@import|googletagmanager)/i.test(line);
}

function lookupNamesForPage(merchantName: string, slug: string): string[] {
  return uniqueTextLines([
    merchantName,
    merchantName.replace(/\s*\([^)]*\)\s*/g, " "),
    merchantName.replace(/\s+(?:flyttevask|solcelletak|regnskapssystem.*|restaurants?)$/i, ""),
    titleFromSlug(slug),
  ]);
}

function titleFromSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function pageText(html: string): string {
  return stripPageHtml(html)
    .split(/\n+/)
    .map(normalizeText)
    .filter(Boolean)
    .join("\n");
}

function stripPageHtml(html: string): string {
  return stripHtml(
    html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<\/(?:h[1-6]|div|section)>/gi, "\n"),
  );
}

function decodeTitle(title: string): string {
  return stripHtml(title);
}

function isSkippedHostname(hostname: string): boolean {
  const normalized = normalizeDomainInput(hostname);
  return SKIP_HOSTNAMES.has(normalized) ||
    [...SKIP_HOSTNAMES].some((skipped) => normalized.endsWith(`.${skipped}`)) ||
    normalized.endsWith(".windows.net");
}

function transliterateNorwegian(value: string): string {
  return value
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a");
}

function normalizeKey(value: string): string {
  return transliterateNorwegian(normalizeText(value))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueTextLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    const normalized = normalizeText(line);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
