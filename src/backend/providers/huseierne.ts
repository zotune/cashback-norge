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

const SITE_ORIGIN = "https://www.huseierne.no";
const LIST_PATH = "/medlemskap/medlemsfordeler/rabatter/";
const DETAIL_CONCURRENCY = 4;
const DEFAULT_TERMS = "Krever Huseierne-medlemskap.";

/** Slugs whose page titles do not name the merchant cleanly. */
const MERCHANT_NAME_BY_SLUG: Record<string, string> = {
  "bankfordeler-storebrand": "Storebrand Bank",
  "storebrand-forsikring": "Storebrand Forsikring",
  defa: "DEFA",
  proffoppgjor: "Proffoppgjør",
  "ragn-sells": "Ragn-Sells",
};

/** The bank page lists loan terms, not a discount — a percentage would mislead. */
const REWARD_BY_SLUG: Record<string, string> = {
  "heder-bank": "Medlemsfordel",
};

const SKIP_HOSTNAMES = new Set([
  "huseierne.no",
  "minside.huseierne.no",
  "hus.no",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "google.com",
  "apple.com",
  "apps.apple.com",
  "play.google.com",
  "fonts.googleapis.com",
  "schema.org",
]);

export type FetchHuseierneInput = {
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

type HuseierneCard = {
  slug: string;
  sourceUrl: string;
  title: string;
  teaser: string;
};

export async function fetchHuseierne(
  input: FetchHuseierneInput,
): Promise<CashbackOffer[]> {
  input.logger.info("Huseierne: fetching member discounts...");

  const listHtml = await fetchPage(`${SITE_ORIGIN}${LIST_PATH}`);
  const cards = extractCards(listHtml);
  input.logger.info(`Huseierne: found ${cards.length} discount cards`);

  const offers: CashbackOffer[] = [];
  let fromContent = 0;
  let lookedUp = 0;
  let overrideCount = 0;

  for (let start = 0; start < cards.length; start += DETAIL_CONCURRENCY) {
    const batch = cards.slice(start, start + DETAIL_CONCURRENCY);
    const results = await Promise.all(batch.map(async (card) => {
      try {
        return { card, detailHtml: await fetchPage(card.sourceUrl) };
      } catch (error) {
        input.logger.warn(`Huseierne: failed to fetch ${card.sourceUrl}: ${String(error)}`);
        return { card, detailHtml: "" };
      }
    }));

    for (const { card, detailHtml } of results) {
      const merchantName = merchantNameForCard(card);
      const mainHtml = extractMainHtml(detailHtml);
      // Everything from "Ikke medlem?" on is a membership sales pitch
      // ("Alt for kun 679 kroner i året!") that must not leak into rewards.
      const text = cutMembershipPitch(pageText(mainHtml));

      let domains = (input.overrides.huseierne?.[card.slug] ?? []).map(normalizeDomainInput);
      if (domains.length > 0) {
        overrideCount++;
      }

      if (domains.length === 0) {
        domains = resolveDomainsFromContent(merchantName, card.slug, mainHtml, text);
        if (domains.length > 0) fromContent++;
      }

      if (domains.length === 0) {
        for (const lookupName of lookupNamesForCard(merchantName, card.slug)) {
          domains = lookupDomains(input.domainLookup, lookupName);
          if (domains.length > 0) {
            lookedUp++;
            break;
          }
        }
      }

      if (domains.length === 0) {
        input.logger.warn(`Huseierne offer has no domain: ${merchantName} (${card.slug})`);
        continue;
      }

      offers.push({
        provider: "huseierne",
        merchantName,
        domains: uniqueStrings(domains.flatMap((domain) => merchantDomainsFromHostname(domain))),
        reward: REWARD_BY_SLUG[card.slug] ??
          (extractHuseierneReward(`${card.title}\n${card.teaser}\n${text}`) || "Medlemsfordel"),
        sourceUrl: card.sourceUrl,
        activationUrl: card.sourceUrl,
        terms: buildTerms(card.teaser, text),
        updatedAt: input.generatedAt,
      });
    }
  }

  input.logger.info(
    `Huseierne: resolved ${fromContent} via page content, ${lookedUp} via lookup, ${overrideCount} via overrides`,
  );
  input.logger.info(`Huseierne: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "CashbackNorge/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Huseierne returned ${response.status} for ${url}`);
  }
  return response.text();
}

function extractCards(listHtml: string): HuseierneCard[] {
  const cards: HuseierneCard[] = [];
  const seen = new Set<string>();
  const anchorPattern =
    /<a\b[^>]*href="\/medlemskap\/medlemsfordeler\/rabatter\/([a-z0-9-]+)\/"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of listHtml.matchAll(anchorPattern)) {
    const slug = match[1] ?? "";
    const inner = match[2] ?? "";
    if (!slug || seen.has(slug)) continue;

    const title = normalizeText(stripHtml(matchFirst(inner, /<h3[^>]*>([\s\S]*?)<\/h3>/i)));
    if (!title) continue;

    seen.add(slug);
    cards.push({
      slug,
      sourceUrl: `${SITE_ORIGIN}/medlemskap/medlemsfordeler/rabatter/${slug}/`,
      title,
      teaser: normalizeText(stripHtml(matchFirst(inner, /<p[^>]*>([\s\S]*?)<\/p>/i))),
    });
  }

  return cards;
}

function matchFirst(html: string, pattern: RegExp): string {
  return html.match(pattern)?.[1] ?? "";
}

function merchantNameForCard(card: HuseierneCard): string {
  const override = MERCHANT_NAME_BY_SLUG[card.slug];
  if (override !== undefined) return override;

  // "20% på møbler og interiør hos Skeidar" → "Skeidar"
  const fromTitle = card.title.match(/\b(?:hos|i|fra)\s+([A-ZÆØÅ][\wÆØÅæøåé&.\- ]{1,40}?)\s*$/u);
  if (fromTitle?.[1]) return fromTitle[1].trim();

  return titleFromSlug(card.slug);
}

/** Same tiers as the Akademikerne Pluss provider: name match → CTA → single base domain. */
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
    /\b(?:bestill|meld deg inn|kjøp|book|handle|registrer(?: deg)?|aktiver|gå til|besøk|les mer|se|handler)\b[^.!?\n]{0,60}?\b(?:på|hos|via)\s+((?:[a-z0-9æøå-]+\.)+(?:no|com|se|dk|net|org|app))\b/gi;

  for (const match of text.matchAll(ctaPattern)) {
    const domain = normalizeDomainInput(transliterateNorwegian(match[1] ?? ""));
    if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain)) continue;
    if (isSkippedHostname(domain)) continue;
    domains.push(domain);
  }

  return uniqueStrings(domains);
}

function extractHuseierneReward(text: string): string {
  if (/\bhalv\s+pris\b/i.test(text)) return "50 %";

  const oreLitre = extractOreLitreReward(text);
  if (oreLitre) return oreLitre;

  const rewardText = relevantRewardText(text);
  const percentage = extractPercentageReward(rewardText);
  if (percentage) return percentage;

  const kr = extractKrReward(rewardText);
  if (kr) return kr;

  if (/\bmedlemspris(?:er)?\b/i.test(text)) return "Medlemspris";
  if (/\bgratis\b/i.test(text)) return "Gratis";
  if (/\brabatt/i.test(text)) return "Rabatt";

  return "";
}

function relevantRewardText(text: string): string {
  return text
    .split(/[\n.;]+/)
    .map(normalizeText)
    .filter((line) => {
      // Price-list lines ("Medlemspris: 10 625 kroner") state prices, not discounts.
      if (/^(?:medlemspris|vanlig pris|ordinær pris|pris)\s*:/i.test(line)) return false;

      // "Hva får du?"-lists render as bare lines like "10 % på Ekornes"
      // or "AUBO-kjøkken: 25 % rabatt".
      if (/^\d{1,3}(?:[,.]\d+)?\s*(?:%|prosent)(?:\s+(?:på|hos|i)\b|$)/i.test(line)) return true;

      return /\b(?:rabatt(?:er)?|medlemsrabatt|besparelse|avslag|spar|tilbud|medlemspris(?:er)?|bonus)\b/i.test(line) ||
        /\bhalv\s+pris\b/i.test(line);
    })
    .join("\n");
}

function buildTerms(teaser: string, text: string): string {
  return uniqueTextLines([
    teaser,
    ...text.split(/\n+/).filter(isUsefulTermsLine).slice(0, 5),
    DEFAULT_TERMS,
  ]).join("\n");
}

function isUsefulTermsLine(line: string): boolean {
  const normalizedLine = normalizeText(line);

  return normalizedLine.length >= 12 &&
    normalizedLine.length <= 220 &&
    !isPageNoise(normalizedLine) &&
    /\b(?:rabatt(?:er|en|kode[nr]?)?|medlemspris(?:er)?|halv\s+pris|besparelse|spar|avslag|gjelder|vilkår|medlemskap|medlemskort|medlemsnummer|kan (?:ikke|kun)|maks|inntil)\b/i.test(normalizedLine);
}

function isPageNoise(line: string): boolean {
  return /^(?:hva får du|bruk medlemsfordelen|ikke medlem|bli medlem|kontakt|besøk|finn |se alle|logg inn|rabatter$|forside$|medlemskap$|medlemsfordeler$)/i.test(line) ||
    /^-?\s*(?:medlemskap|medlemsfordeler|rabatter)\s*$/i.test(line) ||
    /(?:\{|\}|=>|window\.|document\.|function\s*\(|cookie|googletagmanager)/i.test(line);
}

function cutMembershipPitch(text: string): string {
  const cutIndex = text.search(/^ikke medlem\??$/im);
  return cutIndex === -1 ? text : text.slice(0, cutIndex);
}

function lookupNamesForCard(merchantName: string, slug: string): string[] {
  return uniqueTextLines([
    merchantName,
    merchantName.replace(/\s*\([^)]*\)\s*/g, " "),
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

function extractMainHtml(html: string): string {
  const main = html.match(/<main\b[\s\S]*?<\/main>/i);
  return main?.[0] ?? html;
}

function pageText(html: string): string {
  return stripHtml(
    html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<\/(?:h[1-6]|div|section)>/gi, "\n"),
  )
    .split(/\n+/)
    .map(normalizeText)
    .filter(Boolean)
    .join("\n");
}

function isSkippedHostname(hostname: string): boolean {
  const normalized = normalizeDomainInput(hostname);
  return SKIP_HOSTNAMES.has(normalized) ||
    [...SKIP_HOSTNAMES].some((skipped) => normalized.endsWith(`.${skipped}`));
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
