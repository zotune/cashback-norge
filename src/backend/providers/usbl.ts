// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import { gotScraping } from "crawlee";
import {
  type CashbackOffer,
  isRecord,
  normalizeDomainInput,
  parseUrl,
  stripHtml,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import { extractKrReward, formatPercentageReward } from "../../shared/reward.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const LIST_URL = "https://www.usbl.no/medlemskap/medlemsfordeler";
const SITE_ORIGIN = "https://www.usbl.no";
const DEFAULT_TERMS = "Krever USBL-medlemskap og eventuell Bonabo-aktivering.";
const DETAIL_CONCURRENCY = 4;

const SKIP_HOSTNAMES = new Set([
  "usbl.no",
  "bonabo.no",
  "bbl.no",
  "forkjop.bbl.no",
  "b2clogin.com",
  "colibri.no",
  "hoopla.no",
  "google.com",
  "youtube.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "policy.app.cookieinformation.com",
  "iplookup.services.relatude.com",
  "magicwidget.socialboards.com",
  "apps.apple.com",
  "play.google.com",
]);

const EXCLUDED_NAME_FRAGMENTS = [
  "forkjøpsrett",
  "bli medlem",
];

const DOMAIN_NAME_OVERRIDES: Record<string, string> = {
  "polarkraft.no": "Polar Kraft",
  "monter.no": "Montér",
  "sommarland.no": "Bø Sommarland",
  "munkstore.com": "Munk Store",
  "skogstadsport.no": "Skogstad Sport",
};

export type CrawlUsblInput = {
  startUrl: string;
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

type BenefitEntry = {
  domains: string[];
  externalUrls: string[];
  name: string;
  reward: string;
  slug: string;
  sourceUrl: string;
  summary: string;
  terms: string;
};

type ListItem = {
  name: string;
  slug: string;
  sourceUrl: string;
  summary: string;
};

export async function crawlUsbl(input: CrawlUsblInput): Promise<CashbackOffer[]> {
  input.logger.info("USBL: fetching benefits page...");

  const listHtml = await fetchHtml(input.startUrl);
  const listProps = extractHydrationProps(listHtml);
  const listItems = extractListItems(listProps, input.startUrl);
  input.logger.info(`USBL: found ${listItems.length} benefits in page data`);

  const entries = listItems.map((item): BenefitEntry => ({
    domains: [],
    externalUrls: [],
    name: item.name,
    reward: extractUsblReward(`${item.name}\n${item.summary}`),
    slug: item.slug,
    sourceUrl: item.sourceUrl,
    summary: item.summary,
    terms: buildTerms(item.summary, [item.summary]),
  }));

  await enrichDetails(entries, input.logger);

  const offers: CashbackOffer[] = [];
  let lookupCount = 0;
  let overrideCount = 0;
  let urlCount = 0;

  for (const entry of entries) {
    const overrideDomains = input.overrides.usbl[entry.slug] ?? [];
    let domains = overrideDomains.map(normalizeDomainInput);
    if (domains.length > 0) {
      overrideCount++;
    }

    if (domains.length === 0) {
      domains = selectDomainsForEntry(entry.name, uniqueStrings([
        ...entry.domains,
        ...extractDomainsFromText(`${entry.name}\n${entry.summary}\n${entry.terms}`),
      ]));
      if (domains.length > 0) urlCount++;
    }

    if (domains.length === 0) {
      for (const lookupName of lookupNamesForEntry(entry)) {
        domains = lookupDomains(input.domainLookup, lookupName);
        if (domains.length > 0) {
          lookupCount++;
          break;
        }
      }
    }

    if (domains.length === 0) {
      input.logger.warn(`USBL offer has no exact domain: ${entry.name} (${entry.slug})`);
      continue;
    }

    offers.push({
      provider: "usbl",
      merchantName: merchantNameForEntry(entry.name, domains),
      domains: uniqueStrings(domains),
      reward: entry.reward || extractUsblReward(entry.terms) || "?",
      sourceUrl: entry.sourceUrl,
      activationUrl: entry.sourceUrl,
      terms: entry.terms,
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`USBL: resolved ${urlCount} via page URLs/text, ${lookupCount} via lookup, ${overrideCount} via overrides`);
  input.logger.info(`USBL: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}

async function enrichDetails(entries: BenefitEntry[], logger: Logger): Promise<void> {
  let completed = 0;

  async function enrich(entry: BenefitEntry): Promise<void> {
    try {
      const html = await fetchHtml(entry.sourceUrl);
      const props = extractHydrationProps(html);
      const header = isRecord(props?.header) ? props.header : undefined;
      const text = isRecord(props?.text) ? props.text : undefined;
      const textHtml = readString(text?.html);
      const ingress = readString(header?.ingress) || entry.summary;
      const title = normalizeBenefitName(readString(header?.title) || entry.name);
      const textLines = uniqueTextLines([
        ...htmlToLines(textHtml),
        ...extractRenderedArticleLines(html),
      ]);
      const externalUrls = collectExternalUrls(props, textHtml, html);
      const domains = uniqueStrings([
        ...extractDomainsFromUrls(externalUrls),
        ...extractDomainsFromText(`${ingress}\n${textLines.join("\n")}`),
      ]);

      entry.name = title || entry.name;
      entry.summary = ingress || entry.summary;
      entry.externalUrls = uniqueStrings([...entry.externalUrls, ...externalUrls]);
      entry.domains = uniqueStrings([...entry.domains, ...domains]);
      entry.terms = buildTerms(entry.summary, textLines);
      entry.reward = bestReward(entry.reward, extractUsblReward(`${entry.name}\n${entry.summary}\n${entry.terms}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.warn(`USBL detail failed for ${entry.sourceUrl}: ${message}`);
    } finally {
      completed++;
      process.stdout.write(`\r  USBL detail ${completed}/${entries.length}: ${entry.slug.slice(0, 50)}  `);
    }
  }

  for (let i = 0; i < entries.length; i += DETAIL_CONCURRENCY) {
    await Promise.all(entries.slice(i, i + DETAIL_CONCURRENCY).map(enrich));
  }

  if (entries.length > 0) process.stdout.write("\n");
}

async function fetchHtml(url: string): Promise<string> {
  const response = await gotScraping(url, {
    responseType: "text",
    throwHttpErrors: false,
    timeout: { request: 30_000 },
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`USBL returned ${response.statusCode}: ${response.statusMessage}`);
  }

  return response.body;
}

function extractHydrationProps(html: string): Record<string, unknown> | undefined {
  const match = html.match(
    /ReactDOMClient\.hydrateRoot\([^,]+,\s*React\.createElement\(UsblComponents\.[A-Za-z]+,([\s\S]*?)\)\)\s*<\/script>/,
  );
  if (match?.[1] === undefined) return undefined;

  try {
    const parsed = JSON.parse(match[1]);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function extractListItems(props: Record<string, unknown> | undefined, startUrl: string): ListItem[] {
  if (props === undefined) return [];

  const pageList = isRecord(props.pageList) ? props.pageList : undefined;
  const promotedPerkList = isRecord(props.promotedPerkList) ? props.promotedPerkList : undefined;
  const rawItems = [
    ...(Array.isArray(pageList?.items) ? pageList.items : []),
    ...(Array.isArray(promotedPerkList?.items) ? promotedPerkList.items : []),
  ];

  const bySlug = new Map<string, ListItem>();
  for (const item of rawItems) {
    if (!isRecord(item)) continue;

    const name = normalizeBenefitName(readString(item.title));
    const rawUrl = readString(item.url);
    const path = contentPathFromUrl(rawUrl);
    if (!name || path === undefined || !isUsblBenefitPath(path)) continue;

    const slug = slugFromPath(path);
    if (!slug || isExcluded(name)) continue;

    const summary = normalizeText(readString(item.text));
    bySlug.set(slug, {
      name,
      slug,
      sourceUrl: absoluteUsblUrl(path, startUrl),
      summary,
    });
  }

  return [...bySlug.values()];
}

function buildTerms(summary: string, lines: string[]): string {
  const cleanedLines = trimBenefitLines(lines);
  return uniqueTextLines([
    summary,
    ...cleanedLines,
    DEFAULT_TERMS,
  ]).join("\n");
}

function trimBenefitLines(lines: string[]): string[] {
  const normalizedLines = uniqueTextLines(lines);
  const startIndex = normalizedLines.findIndex((line) => {
    return /^(fordeler|som medlem får du:?|i tillegg får du også:?|om usbl strøm:?)/i.test(line);
  });
  const scopedLines = startIndex === -1 ? normalizedLines : normalizedLines.slice(startIndex);
  const stopIndex = scopedLines.findIndex((line) => {
    return /^(relaterte artikler|et medlemskap som gir tilbake)$/i.test(line);
  });
  const benefitLines = stopIndex === -1 ? scopedLines : scopedLines.slice(0, stopIndex);

  return benefitLines.filter((line) => {
    return !/^(relaterte lenker|kundesenter|våre åpningstider|e-post|følg oss på|bli medlem(?: i dag)?(?:chat)?|chat|viktig informasjon)$/i.test(line) &&
      !/^les mer og bestill/i.test(line);
  });
}

function extractUsblReward(text: string): string {
  if (/\bhalv\s+pris\b/i.test(text)) return "50 %";

  const percentage = extractUsblPercentageReward(text);
  if (percentage) return percentage;

  const kr = extractKrReward(text) || extractUsblKrReward(text);
  if (kr) return kr;

  if (/\bgratis\b/i.test(text)) return "Gratis";

  return "";
}

function bestReward(currentReward: string, nextReward: string): string {
  if (!currentReward) return nextReward;
  if (!nextReward) return currentReward;
  return rewardSpecificity(nextReward) >= rewardSpecificity(currentReward) ? nextReward : currentReward;
}

function rewardSpecificity(reward: string): number {
  if (/\d/.test(reward) && /%/.test(reward)) return 4;
  if (/\d/.test(reward) && /\bkr\b/i.test(reward)) return 3;
  if (/\d/.test(reward)) return 2;
  if (/^(?:\?|medlemsfordel|medlemspris)$/i.test(reward.trim())) return 0;
  return 1;
}

function extractUsblPercentageReward(text: string): string {
  const values: number[] = [];
  const percentagePattern = /(\d{1,3}(?:[,.]\d+)?)\s*(?:[-\u2013\u2014]\s*(\d{1,3}(?:[,.]\d+)?)\s*)?(?:%|prosent)(?![a-zA-ZæøåÆØÅ])/gi;

  for (const clause of text.split(/[\n.;]+/).map(normalizeText)) {
    if (!isRelevantPercentageClause(clause)) continue;

    for (const match of clause.matchAll(percentagePattern)) {
      const matchedText = match[0] ?? "";
      const matchIndex = match.index ?? 0;
      if (isNoisyPercentageMatch(clause, matchIndex, matchedText)) continue;

      addPercentageValue(values, match[1]);
      addPercentageValue(values, match[2]);
    }
  }

  return formatPercentageReward(values);
}

function isRelevantPercentageClause(clause: string): boolean {
  return /\b(?:rabatt|bonus|avslag|spar|medlem|medlemspris|medlemsrabatt|fordel)\b/i.test(clause);
}

function isNoisyPercentageMatch(clause: string, matchIndex: number, matchedText: string): boolean {
  const afterMatch = clause.slice(matchIndex + matchedText.length);
  const aroundMatch = clause.slice(Math.max(0, matchIndex - 24), matchIndex + matchedText.length + 48);
  return (
    /^\s+(?:mer\s+enn|mer\b|bomull|polyester|lin|ull|nylon|akryl|viskose|elastan|silke|modal|lyocell|tencel|fleece|lær|skinn|rayon|spandex|denim)\b/i.test(afterMatch) ||
    /\b(?:startbonus|bonustap|egenandel|mva|merverdiavgift|standard)\b/i.test(aroundMatch)
  );
}

function addPercentageValue(values: number[], rawValue: string | undefined): void {
  if (rawValue === undefined) return;
  const value = Number.parseFloat(rawValue.replace(",", "."));
  if (Number.isFinite(value) && value > 0 && value <= 100 && !values.includes(value)) {
    values.push(value);
  }
}

function extractUsblKrReward(text: string): string {
  const values: number[] = [];
  const patterns = [
    /\bspar\s+kr\.?\s*(\d[\d\s]*)\s*(?:[,.-]\s*[-–]?)?/gi,
    /\bkr\.?\s*(\d[\d\s]*)\s*(?:[,.-]\s*[-–]?)?\s+(?:i\s+)?(?:rabatt|avslag)\b/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = Number.parseInt((match[1] ?? "").replace(/\s+/g, ""), 10);
      if (Number.isFinite(value) && value > 0) values.push(value);
    }
  }

  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? `${formatKrNumber(max)} kr` : `${formatKrNumber(min)}-${formatKrNumber(max)} kr`;
}

function collectExternalUrls(props: unknown, html: string, renderedHtml: string): string[] {
  const urls: string[] = [];

  walkUnknown(props, (value) => {
    if (!isRecord(value)) return;
    const url = readString(value.url);
    if (url) urls.push(url);
  });

  for (const htmlFragment of [html, renderedHtml]) {
    for (const match of htmlFragment.matchAll(/\bhref=(?:"([^"]+)"|'([^']+)')/gi)) {
      const href = match[1] ?? match[2];
      if (href) urls.push(href);
    }
  }

  return uniqueStrings(urls.flatMap((url) => {
    const externalUrl = normalizeExternalUrl(url);
    return externalUrl === undefined ? [] : [externalUrl];
  }));
}

function extractDomainsFromUrls(urls: string[]): string[] {
  return uniqueStrings(urls.flatMap((url) => {
    const domain = extractDomainFromUrl(url);
    return domain === undefined ? [] : [domain];
  }));
}

function extractDomainFromUrl(input: string): string | undefined {
  const url = normalizeExternalUrl(input);
  if (url === undefined) return undefined;

  const parsed = parseUrl(url);
  if (parsed === undefined) return undefined;

  const domain = normalizeDomainInput(parsed.hostname);
  return isSkippedHostname(domain) ? undefined : domain;
}

function normalizeExternalUrl(input: string): string | undefined {
  const trimmedInput = input.trim();
  if (!trimmedInput || /^[/?#]/.test(trimmedInput)) return undefined;

  const parsed = parseUrl(trimmedInput) ??
    (trimmedInput.includes(".") ? parseUrl(`https://${trimmedInput}`) : undefined);
  if (parsed === undefined) return undefined;
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;

  const domain = normalizeDomainInput(parsed.hostname);
  if (isSkippedHostname(domain)) return undefined;

  return parsed.toString();
}

function extractDomainsFromText(text: string): string[] {
  const domains: string[] = [];
  for (const match of text.matchAll(/\b(?:[a-z0-9-]+\.)+(?:com|events|net|no|org)\b/gi)) {
    const domain = extractDomainFromUrl(match[0] ?? "");
    if (domain !== undefined) domains.push(domain);
  }
  return uniqueStrings(domains);
}

function lookupNamesForEntry(entry: BenefitEntry): string[] {
  const names = [
    entry.name,
    entry.name.replace(/\s+-\s+.*$/, ""),
    entry.name.replace(/\b(?:medlemsfordel|rabatt|bonus)\b/gi, ""),
    titleFromSlug(entry.slug),
  ];
  return uniqueTextLines(names);
}

function merchantNameForEntry(name: string, domains: string[]): string {
  if (domains.length === 1) {
    const domain = domains[0] ?? "";
    return DOMAIN_NAME_OVERRIDES[domain] ?? name;
  }
  return name;
}

function selectDomainsForEntry(name: string, domains: string[]): string[] {
  const uniqueDomains = uniqueStrings(domains);
  if (uniqueDomains.length <= 1) return uniqueDomains;

  const nameKey = normalizeKey(name);
  const matchingDomains = uniqueDomains.filter((domain) => {
    const label = normalizeKey(domain.split(".")[0] ?? domain);
    const friendlyName = normalizeKey(DOMAIN_NAME_OVERRIDES[domain] ?? "");
    return (label.length > 0 && (nameKey.includes(label) || label.includes(nameKey))) ||
      (friendlyName.length > 0 && (nameKey.includes(friendlyName) || friendlyName.includes(nameKey)));
  });

  return matchingDomains.length > 0 ? matchingDomains : uniqueDomains;
}

function htmlToLines(value: string): string[] {
  if (!value) return [];
  const normalizedHtml = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:div|h[1-6]|li|p)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n")
    .replace(/&quot;/g, "\"")
    .replace(/&ndash;|&mdash;/g, "-");

  return stripHtml(normalizedHtml)
    .split(/\n+/)
    .map(normalizeText)
    .filter(Boolean);
}

function extractRenderedArticleLines(html: string): string[] {
  const markerIndex = html.indexOf("article-page__blocks");
  if (markerIndex === -1) return [];

  const startIndex = html.lastIndexOf("<div", markerIndex);
  const endCandidates = [
    html.indexOf("<footer", markerIndex),
    html.indexOf("<script", markerIndex),
  ].filter((index) => index > markerIndex);
  const endIndex = endCandidates.length > 0 ? Math.min(...endCandidates) : html.length;
  const fragment = html.slice(startIndex === -1 ? markerIndex : startIndex, endIndex);
  return htmlToLines(fragment);
}

function walkUnknown(value: unknown, visit: (value: unknown) => void): void {
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walkUnknown(item, visit);
    return;
  }
  if (!isRecord(value)) return;
  for (const child of Object.values(value)) {
    walkUnknown(child, visit);
  }
}

function contentPathFromUrl(url: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("/")) return url.split(/[?#]/)[0] ?? url;

  const parsed = parseUrl(url);
  if (parsed === undefined) return undefined;
  const hostname = normalizeDomainInput(parsed.hostname);
  if (hostname !== "usbl.no") return undefined;
  return parsed.pathname;
}

function absoluteUsblUrl(path: string, fallbackBaseUrl: string): string {
  try {
    return new URL(path, fallbackBaseUrl || SITE_ORIGIN).toString();
  } catch {
    return `${SITE_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;
  }
}

function isUsblBenefitPath(path: string): boolean {
  return /^\/medlemskap\/medlemsfordeler\/[^/?#]+\/?$/i.test(path);
}

function slugFromPath(path: string): string {
  return decodeURIComponent(path.replace(/\/+$/, "").split("/").pop() ?? "");
}

function titleFromSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isSkippedHostname(hostname: string): boolean {
  const normalized = normalizeDomainInput(hostname);
  return (
    SKIP_HOSTNAMES.has(normalized) ||
    normalized.endsWith(".usbl.no") ||
    [...SKIP_HOSTNAMES].some((skipped) => normalized.endsWith(`.${skipped}`))
  );
}

function isExcluded(name: string): boolean {
  const normalized = normalizeText(name).toLowerCase();
  return EXCLUDED_NAME_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function normalizeBenefitName(value: string): string {
  return normalizeText(value)
    .replace(/^nyhet!\s*/i, "")
    .replace(/^\d+[\s]*%\s*rabatt\s+(?:på|hos)\s+/i, "")
    .trim();
}

function normalizeText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/\u00a0/g, " ")
    .replace(/[“”]/g, "\"")
    .replace(/[«»]/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\.(?:com|no|se|dk|fi|eu|net|io|org)$/i, "")
    .replace(/[^a-z0-9æøåäöü]/g, "");
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    AElig: "Æ",
    Aring: "Å",
    Eacute: "É",
    Oslash: "Ø",
    aelig: "æ",
    amp: "&",
    apos: "'",
    aring: "å",
    bull: "•",
    copy: "©",
    eacute: "é",
    laquo: "«",
    mdash: "-",
    nbsp: " ",
    ndash: "-",
    oslash: "ø",
    oacute: "ó",
    quot: "\"",
    raquo: "»",
    reg: "®",
    uacute: "ú",
  };

  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);/g, (match, entity: string) => {
    if (entity.startsWith("#x")) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (entity.startsWith("#")) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return namedEntities[entity] ?? match;
  });
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

function formatKrNumber(value: number): string {
  return value.toLocaleString("nb-NO").replace(/[\u00a0\u202f]/g, " ");
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
