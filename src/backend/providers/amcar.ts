// This file extracts publicly available AMCAR member discounts from AMCAR's
// official website. Login-only pages and member discount codes are not read.
import {
  type CashbackOffer,
  normalizeDomainInput,
  parseUrl,
  stripHtml,
  toBaseDomain,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import {
  extractBenefitReward,
  extractPercentageReward,
} from "../../shared/reward.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import { merchantDomainsFromHostname } from "../merchant-domains.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const LIST_URL = "https://www.amcar.no/rabattavtaler/rabattavtaler";
const DEFAULT_TERMS = "Krever gyldig AMCAR-medlemskap.";

const MERCHANT_NAME_BY_SLUG: Record<string, string> = {
  "if-forsikring": "If",
  "sparebank1-finans-midt-norge": "SpareBank 1 Finans Midt-Norge",
  "bn-bank": "BN Bank",
  "riis-bilglass": "Riis Bilglass",
  vianor: "Vianor",
  "us-autoparts": "US Autoparts",
  "eiker-motorshop": "Eiker Motorshop",
  "amerikanske-bildeler": "Amerikanske Bildeler",
  "phoenix-us-cars": "Phoenix US Cars",
  "sarpsborg-motor": "Sarpsborg Motor",
  "gytis-autek-as": "Gytis Autek",
  "hansen-racing-aarnes": "Hansen Racing",
  bilpleiekongen: "Bilpleiekongen",
  "cars-as": "CARS",
  "cylmo-as": "Cylmo",
  "exide-sonnak-as": "Exide Sønnak",
  "ideler-no": "iDeler",
  "intercontact-as": "Intercontact / Starco",
  "fix-drive": "Fix&Drive",
  "vangbo-as": "Vangbo",
  "wurth-norge-as": "Würth",
  "electro-drives-as": "Electro Drives",
  "bilradiospesialisten-og-defa": "Bilradiospesialisten",
};

// A handful of current agreements do not link the merchant from their own
// section. Keep these explicit so a missing link never makes a public AMCAR
// agreement disappear from the generated index.
const FALLBACK_DOMAINS: Record<string, string[]> = {
  "riis-bilglass": ["riis.no"],
  vianor: ["vianor.no"],
  "exide-sonnak-as": ["exidegroup.com"],
  "fix-drive": ["fixdrive.no"],
  "electro-drives-as": ["electro-drives.no"],
};

const CANONICAL_DOMAIN_ALIASES: Record<string, string[]> = {
  // AMCAR links the historic wurth.no hostname, which redirects to Würth's
  // canonical Norwegian hostname.
  "wurth-norge-as": ["wuerth.no"],
};

const SKIP_HOSTNAMES = new Set([
  "amcar.no",
  "account.amcar.no",
  "refuel.no",
  "kalender.refuel.no",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "google.com",
  "apps.apple.com",
  "play.google.com",
  "typekit.net",
  "h-k.no",
]);

export type FetchAmcarInput = {
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

type AmcarSection = {
  heading: string;
  merchantName: string;
  slug: string;
  html: string;
  text: string;
};

type PageLink = {
  domain: string;
  text: string;
};

export async function fetchAmcar(
  input: FetchAmcarInput,
): Promise<CashbackOffer[]> {
  input.logger.info(`AMCAR: fetching public discount agreements from ${LIST_URL}`);

  const html = await fetchPage(LIST_URL);
  const sections = extractSections(html);
  if (sections.length === 0) {
    throw new Error("AMCAR: official discount page contained no merchant sections");
  }

  input.logger.info(`AMCAR: found ${sections.length} public merchant sections`);
  const globalLinks = extractExternalLinks(html);
  const offers: CashbackOffer[] = [];
  let fromContent = 0;
  let fromGlobalLinks = 0;
  let lookedUp = 0;
  let fallbackCount = 0;
  let overrideCount = 0;

  for (const section of sections) {
    const rewardText = normalizeRewardGrammar(section.text);
    // Each section belongs to exactly one merchant, so bare product-list
    // percentages ("Dekkhotell – 20 %") are safe to interpret as its range.
    const reward = extractPercentageReward(rewardText) ||
      extractBenefitReward(rewardText) ||
      "Medlemsfordel";

    let domains = (input.overrides.amcar?.[section.slug] ?? [])
      .map(normalizeDomainInput);
    if (domains.length > 0) overrideCount++;

    if (domains.length === 0) {
      domains = resolveSectionDomains(section);
      if (domains.length > 0) fromContent++;
    }

    if (domains.length === 0) {
      domains = resolveGlobalLinkDomains(section, globalLinks);
      if (domains.length > 0) fromGlobalLinks++;
    }

    if (domains.length === 0) {
      for (const name of lookupNamesForSection(section)) {
        domains = lookupDomains(input.domainLookup, name);
        if (domains.length > 0) {
          lookedUp++;
          break;
        }
      }
    }

    if (domains.length === 0) {
      domains = FALLBACK_DOMAINS[section.slug] ?? [];
      if (domains.length > 0) fallbackCount++;
    }

    domains = uniqueStrings([
      ...domains,
      ...(CANONICAL_DOMAIN_ALIASES[section.slug] ?? []),
    ].map(normalizeDomainInput));

    if (domains.length === 0) {
      input.logger.warn(`AMCAR offer has no domain: ${section.merchantName} (${section.slug})`);
      continue;
    }

    offers.push({
      provider: "amcar",
      merchantName: section.merchantName,
      domains: uniqueStrings(
        domains.flatMap((domain) => merchantDomainsFromHostname(domain)),
      ),
      reward,
      sourceUrl: LIST_URL,
      activationUrl: LIST_URL,
      terms: buildTerms(section.text),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(
    `AMCAR: resolved ${fromContent} from agreement sections, ${fromGlobalLinks} from official page partner links, ${lookedUp} via lookup, ${fallbackCount} via fallback, ${overrideCount} via overrides`,
  );
  input.logger.info(`AMCAR: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}

async function fetchPage(url: string): Promise<string> {
  if (!isOfficialPageUrl(url)) {
    throw new Error(`AMCAR refused non-official URL: ${url}`);
  }

  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "CashbackNorge/1.0",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`AMCAR returned ${response.status} for ${url}`);
  }
  if (!isOfficialPageUrl(response.url)) {
    throw new Error(`AMCAR refused non-official redirect: ${response.url}`);
  }

  return response.text();
}

function isOfficialPageUrl(url: string): boolean {
  const parsed = parseUrl(url);
  return parsed !== undefined &&
    parsed.protocol === "https:" &&
    normalizeDomainInput(parsed.hostname) === "amcar.no" &&
    parsed.pathname.replace(/\/$/, "") === "/rabattavtaler/rabattavtaler";
}

function extractSections(html: string): AmcarSection[] {
  const bodyHtml = html.match(
    /<div\b[^>]*class=(?:"[^"]*\bbody\b[^"]*"|'[^']*\bbody\b[^']*')[^>]*>([\s\S]*?)<\/div>\s*(?=<div\b[^>]*class=(?:"image"|'image')|<\/section>)/i,
  )?.[1] ?? "";

  if (!bodyHtml) return [];

  const headings: Array<{ start: number; end: number; heading: string }> = [];
  const headingPattern = /<h3\b[^>]*>([\s\S]*?)<\/h3>/gi;
  for (const match of bodyHtml.matchAll(headingPattern)) {
    const heading = normalizeText(stripHtml(match[1] ?? ""));
    if (!heading) continue;

    const start = match.index ?? 0;
    headings.push({
      start,
      end: start + match[0].length,
      heading,
    });
  }

  return headings.map((item, index) => {
    const nextStart = headings[index + 1]?.start ?? bodyHtml.length;
    const sectionHtml = bodyHtml.slice(item.end, nextStart);
    const slug = slugify(item.heading);
    return {
      heading: item.heading,
      merchantName: MERCHANT_NAME_BY_SLUG[slug] ?? normalizeMerchantName(item.heading),
      slug,
      html: sectionHtml,
      text: pageText(sectionHtml),
    };
  });
}

function resolveSectionDomains(section: AmcarSection): string[] {
  const links = extractExternalLinks(section.html);
  const textDomains = extractTextDomains(section.text);
  const candidates = uniqueStrings([
    ...links.map((link) => link.domain),
    ...textDomains,
  ]);
  if (candidates.length === 0) return [];

  const matching = matchingMerchantDomains(section, candidates);
  if (matching.length > 0) return matching;

  const baseDomains = uniqueStrings(candidates.map(toBaseDomain));
  return baseDomains.length === 1 ? candidates : [];
}

function resolveGlobalLinkDomains(
  section: AmcarSection,
  links: PageLink[],
): string[] {
  return matchingMerchantDomains(
    section,
    uniqueStrings(links.map((link) => link.domain)),
  );
}

function matchingMerchantDomains(
  section: AmcarSection,
  domains: string[],
): string[] {
  const nameKey = normalizeKey(section.merchantName);
  const headingKey = normalizeKey(section.heading);
  const slugKey = normalizeKey(section.slug);

  return uniqueStrings(domains.filter((domain) => {
    const label = normalizeKey(toBaseDomain(domain).split(".")[0] ?? domain);
    if (label.length < 3) return false;

    return nameKey.includes(label) ||
      label.includes(nameKey) ||
      headingKey.includes(label) ||
      label.includes(headingKey) ||
      slugKey.includes(label);
  }));
}

function extractExternalLinks(html: string): PageLink[] {
  const links: PageLink[] = [];
  const seen = new Set<string>();
  const anchorPattern = /<a\b[^>]*href=(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const href = decodeHtmlAttribute(match[1] ?? match[2] ?? "").trim();
    if (!href || /^(?:mailto|tel|javascript):/i.test(href)) continue;

    const parsed = parseUrl(href);
    if (parsed === undefined || !/^https?:$/.test(parsed.protocol)) continue;
    if (/\.(?:jpe?g|png|gif|svg|webp|avif|mp4|pdf|css|js)$/i.test(parsed.pathname)) {
      continue;
    }

    const domain = normalizeDomainInput(parsed.hostname);
    if (isSkippedHostname(domain)) continue;

    const text = normalizeText(stripHtml(match[3] ?? ""));
    const key = `${domain}\n${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ domain, text });
  }

  return links;
}

function extractTextDomains(text: string): string[] {
  const domains: string[] = [];
  const pattern = /\b(?:[a-z0-9æøå-]+\.)+(?:no|com|net|org|as|io|eu)\b/gi;

  for (const match of text.matchAll(pattern)) {
    const domain = normalizeDomainInput(transliterateNorwegian(match[0] ?? ""));
    if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain)) continue;
    if (isSkippedHostname(domain)) continue;
    domains.push(domain);
  }

  return uniqueStrings(domains);
}

function buildTerms(text: string): string {
  const lines = uniqueTextLines(text.split(/\n+/))
    .filter(isUsefulTermsLine)
    .slice(0, 8);

  return uniqueTextLines([...lines, DEFAULT_TERMS]).join("\n");
}

function isUsefulTermsLine(line: string): boolean {
  const normalized = normalizeText(line);
  if (normalized.length < 8 || normalized.length > 300) return false;
  if (containsMemberCode(normalized) || isPageNoise(normalized)) return false;

  return /\b(?:amcar[- ]?medlem(?:mer)?|rabatt(?:er|en|sats)?|medlemskort|medlemspris|fordel(?:er)?|betingelser|gjelder|unntatt|gratis|uten|fremvisning|tilbudspris|butikkpris|forhandlerpris|ordinære?|kan (?:ikke|kun)|opptil)\b/i
    .test(normalized);
}

function containsMemberCode(line: string): boolean {
  return /\b(?:rabatt|kupong|medlems)kod(?:e|en|er)\b|\/rabattkoder\b|\b(?:logg inn|min side|mine sider)\b/i.test(line);
}

function isPageNoise(line: string): boolean {
  return /^(?:rabattavtaler|bli medlem|logg inn|kontakt|les mer|se medlemsfordeler|del på)\b/i.test(line) ||
    /(?:\{\s*|\}\s*|=>|window\.|document\.|function\s*\(|cookie|googletagmanager)/i.test(line);
}

function lookupNamesForSection(section: AmcarSection): string[] {
  return uniqueTextLines([
    section.merchantName,
    section.heading,
    section.merchantName.replace(/\s+(?:as|norge as|midt-norge)\s*$/i, ""),
    section.merchantName.replace(/\s*\/.*$/, ""),
  ]);
}

function pageText(html: string): string {
  return stripHtml(
    html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:h[1-6]|p|li|div|section|article)>/gi, "\n"),
  )
    .split(/\n+/)
    .map(normalizeText)
    .filter(Boolean)
    .join("\n");
}

function normalizeRewardGrammar(value: string): string {
  return value
    .replace(/(\d{1,3}(?:[,.]\d+)?)\s+prosents\b/gi, "$1 prosent")
    .replace(/(\d[\d\s]*(?:[,.]\d+)?)\s+kroners\b/gi, "$1 kroner");
}

function normalizeMerchantName(value: string): string {
  return normalizeText(value)
    .replace(/\s+AS$/i, "")
    .replace(/^EXIDE\s+/i, "Exide ")
    .replace(/\bOG\b/g, "og")
    .replace(/\bNORGE\b/g, "Norge")
    .replace(/\bFORSIKRING\b/g, "Forsikring");
}

function slugify(value: string): string {
  return transliterateNorwegian(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&#0*38;/gi, "&")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#0*39;/gi, "'");
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
    .normalize("NFC")
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
