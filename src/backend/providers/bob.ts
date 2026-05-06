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
import { extractKrReward, extractPercentageReward } from "../../shared/reward.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const LIST_URL = "https://bob.no/medlem-og-beboer/medlemsfordeler/";
const SITE_ORIGIN = "https://bob.no";
const API_URL = "https://bob-as-cms.azurewebsites.net/umbraco/rest/v1/publishedcontent/url";
const DEFAULT_TERMS = "Krever BOB-medlemskap og gyldig medlemsbevis i BOB-appen.";
const DETAIL_CONCURRENCY = 4;

const BENEFIT_CARD_TYPES = new Set([
  "featuredContentCardNestedContent",
  "featuredItemNestedContent",
  "linkCardNestedContent",
  "singleFeaturedItem",
]);

const SKIP_HOSTNAMES = new Set([
  "bob.no",
  "auth.bob.no",
  "blimedlem.bbl.no",
  "cms.bob.no",
  "google.com",
  "youtube.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "apps.apple.com",
  "play.google.com",
  "hudd.no",
]);

const GENERIC_SECTION_PATTERNS = [
  /^aktivitetskalender/i,
  /^bli bob-medlem/i,
  /^bruk av medlemsfordelene/i,
  /^bruk bob-appen/i,
  /^forkjøpsrett/i,
  /^skikkelig gode fordeler/i,
  /^slik abonnerer du på nyhetsbrevet/i,
];

const CODE_STOPWORDS = new Set([
  "appen",
  "feltet",
  "her",
  "kassen",
  "over",
  "rabatt",
  "rabattkode",
  "vis",
]);

const NUMBER_WORDS: Record<string, string> = {
  en: "1",
  "én": "1",
  ett: "1",
  to: "2",
  tre: "3",
  fire: "4",
  fem: "5",
  seks: "6",
  sju: "7",
  syv: "7",
  atte: "8",
  åtte: "8",
  ni: "9",
  ti: "10",
  elleve: "11",
  tolv: "12",
  tretten: "13",
  fjorten: "14",
  femten: "15",
  tjue: "20",
};

const DOMAIN_NAME_OVERRIDES: Record<string, string> = {
  "bergenkino.no": "Bergen Kino",
  "dolly.no": "Dolly Dimples",
  "flipzonefoods.no": "FoodZone",
  "fyllingsdalenteater.no": "Fyllingsdalen Teater",
  "gjensidige.no": "Gjensidige",
  "monter.no": "Montér",
  "nki.no": "NKI Nettstudier",
  "power.no": "Power",
  "sportzone.no": "SportZone",
  "vestkantenopplevelser.no": "Vestkanten Opplevelser",
  "vmfesten.no": "VM-festen",
};

export type CrawlBobInput = {
  startUrl: string;
  overrides: ProviderOverrides;
  generatedAt: string;
  logger: Logger;
};

type BenefitEntry = {
  activationUrl?: string;
  domains: string[];
  externalUrls: string[];
  name: string;
  slug: string;
  sourceUrl: string;
  textLines: string[];
};

type DiscountCode = {
  code: string;
  context: string;
};

export async function crawlBob(input: CrawlBobInput): Promise<CashbackOffer[]> {
  input.logger.info("BOB: fetching benefits API...");

  const startPath = contentPathFromUrl(input.startUrl) ?? contentPathFromUrl(LIST_URL) ?? "/";
  const listContent = await fetchContentByPath(startPath, true);
  const entries = new Map<string, BenefitEntry>();
  const nameToSlug = new Map<string, string>();
  const detailPaths = new Set<string>();

  for (const link of readContentLinks(listContent.childrenLinks)) {
    const path = contentPathFromUrl(readString(link.url));
    if (path !== undefined && isBobBenefitPath(path)) detailPaths.add(path);
  }

  for (const card of extractBenefitCards(listContent)) {
    const linkUrl = readString(card.link?.url);
    const internalPath = contentPathFromUrl(linkUrl);
    const slug = internalPath !== undefined && isBobBenefitPath(internalPath)
      ? slugFromPath(internalPath)
      : slugify(card.name);
    const sourceUrl = internalPath !== undefined && isBobBenefitPath(internalPath)
      ? absoluteBobUrl(internalPath)
      : input.startUrl;
    const externalUrls = extractExternalUrlsFromUnknown(card.link);
    const domains = extractDomainsFromUrls(externalUrls);

    if (internalPath !== undefined && isBobBenefitPath(internalPath)) {
      detailPaths.add(internalPath);
    }

    upsertEntry(entries, nameToSlug, {
      domains,
      externalUrls,
      name: card.name,
      slug,
      sourceUrl,
      textLines: [card.name, card.text].filter(Boolean),
      ...(externalUrls[0] ? { activationUrl: externalUrls[0] } : {}),
    });
  }

  await enrichDetails([...detailPaths], entries, nameToSlug, input.logger);

  const offers: CashbackOffer[] = [];
  let codeOfferCount = 0;
  let membershipOfferCount = 0;

  for (const entry of entries.values()) {
    const terms = buildTerms(entry.textLines);
    const reward = extractBobReward(terms);
    const codes = extractDiscountCodes(terms);
    const overrideDomains = input.overrides.bob[entry.slug] ?? [];
    const allDomains = uniqueStringsPreserveOrder([
      ...entry.domains,
      ...overrideDomains.map(normalizeDomainInput),
    ]);

    if (!reward && codes.length === 0) {
      continue;
    }

    if (allDomains.length === 0) {
      input.logger.warn(`BOB offer has no domain: ${entry.name} (${entry.slug})`);
      continue;
    }

    const membershipDomains = selectDomainsForEntry(entry.name, allDomains);
    if (reward && membershipDomains.length > 0) {
      offers.push({
        provider: "bob",
        merchantName: merchantNameForEntry(entry.name, membershipDomains),
        domains: uniqueStrings(membershipDomains),
        reward,
        sourceUrl: entry.sourceUrl,
        activationUrl: entry.sourceUrl,
        terms,
        updatedAt: input.generatedAt,
      });
      membershipOfferCount++;
    }

    for (const code of codes) {
      const codeDomains = selectDomainsForCode(code, allDomains);
      if (codeDomains.length === 0) continue;

      const activationUrl = findActivationUrlForDomains(entry.externalUrls, codeDomains) ??
        entry.activationUrl ??
        `https://${codeDomains[0]}`;
      const codeReward = extractBobReward(code.context) || reward;

      offers.push({
        provider: "rabattkode",
        merchantName: merchantNameForCode(entry.name, codeDomains, allDomains),
        domains: uniqueStrings(codeDomains),
        reward: codeReward || "Rabattkode",
        sourceUrl: entry.sourceUrl,
        activationUrl,
        discountCode: code.code,
        terms,
        updatedAt: input.generatedAt,
      });
      codeOfferCount++;
    }
  }

  input.logger.info(`BOB: produced ${membershipOfferCount} membership offers and ${codeOfferCount} code offers`);
  return uniqueOffers(offers);
}

async function enrichDetails(
  detailPaths: string[],
  entries: Map<string, BenefitEntry>,
  nameToSlug: Map<string, string>,
  logger: Logger,
): Promise<void> {
  let completed = 0;

  async function enrich(path: string): Promise<void> {
    try {
      const content = await fetchContentByPath(path, false);
      if (content === undefined) return;

      const name = normalizeBenefitName(
        readPropString(content, "headerTitle") ||
        readString(content.name) ||
        slugFromPath(path),
      );
      if (!name) return;

      const textLines = collectTextLines(content);
      const externalUrls = collectExternalUrls(content);
      const domains = uniqueStringsPreserveOrder([
        ...extractDomainsFromUrls(externalUrls),
        ...extractDomainsFromText(textLines.join("\n")),
      ]);

      upsertEntry(entries, nameToSlug, {
        domains,
        externalUrls,
        name,
        slug: slugFromPath(readString(content.url) || path),
        sourceUrl: absoluteBobUrl(readString(content.url) || path),
        textLines,
        ...(externalUrls[0] ? { activationUrl: externalUrls[0] } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.warn(`BOB detail failed for ${path}: ${message}`);
    } finally {
      completed++;
      process.stdout.write(`\r  BOB detail ${completed}/${detailPaths.length}: ${path.slice(0, 50)}  `);
    }
  }

  for (let i = 0; i < detailPaths.length; i += DETAIL_CONCURRENCY) {
    await Promise.all(detailPaths.slice(i, i + DETAIL_CONCURRENCY).map(enrich));
  }

  if (detailPaths.length > 0) process.stdout.write("\n");
}

async function fetchContentByPath(path: string, required: true): Promise<Record<string, unknown>>;
async function fetchContentByPath(path: string, required: false): Promise<Record<string, unknown> | undefined>;
async function fetchContentByPath(
  path: string,
  required: boolean,
): Promise<Record<string, unknown> | undefined> {
  const url = new URL(API_URL);
  url.searchParams.set("url", path);
  url.searchParams.set("depth", "5");

  const response = await gotScraping(url.toString(), {
    responseType: "json",
    throwHttpErrors: false,
    timeout: { request: 30_000 },
    headers: { Accept: "application/json" },
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    if (required) {
      throw new Error(`BOB API returned ${response.statusCode}: ${response.statusMessage}`);
    }
    return undefined;
  }

  return isRecord(response.body) ? response.body : undefined;
}

type BenefitCard = {
  link?: Record<string, unknown>;
  name: string;
  text: string;
};

function extractBenefitCards(content: Record<string, unknown>): BenefitCard[] {
  const cards: BenefitCard[] = [];
  walkContent(readPropValue(content, "mainArea"), (item) => {
    const type = readString(item.contentTypeAlias);
    if (!BENEFIT_CARD_TYPES.has(type)) return false;

    const rawName = readPropString(item, "title") || readString(item.name);
    const name = normalizeBenefitName(rawName);
    const text = normalizeText(readPropString(item, "text"));
    const link = readLink(readPropValue(item, "link"));

    if (name) {
      cards.push({
        name,
        text,
        ...(link !== undefined ? { link } : {}),
      });
    }

    return true;
  });
  return cards;
}

function upsertEntry(
  entries: Map<string, BenefitEntry>,
  nameToSlug: Map<string, string>,
  update: BenefitEntry,
): void {
  const nameKey = normalizeKey(update.name);
  const slug = entries.has(update.slug)
    ? update.slug
    : nameToSlug.get(nameKey) ?? update.slug;
  const existing = entries.get(slug);

  if (existing === undefined) {
    entries.set(slug, {
      ...update,
      domains: uniqueStringsPreserveOrder(update.domains),
      externalUrls: uniqueStringsPreserveOrder(update.externalUrls),
      textLines: uniqueTextLines(update.textLines),
    });
    if (nameKey) nameToSlug.set(nameKey, slug);
    return;
  }

  existing.domains = uniqueStringsPreserveOrder([...existing.domains, ...update.domains]);
  existing.externalUrls = uniqueStringsPreserveOrder([...existing.externalUrls, ...update.externalUrls]);
  existing.textLines = uniqueTextLines([...existing.textLines, ...update.textLines]);

  if (isBetterSourceUrl(update.sourceUrl, existing.sourceUrl)) {
    existing.sourceUrl = update.sourceUrl;
  }
  if (update.activationUrl && !existing.activationUrl) {
    existing.activationUrl = update.activationUrl;
  }
  if (update.name.length > existing.name.length && !isGenericLine(update.name)) {
    existing.name = update.name;
  }
}

function isBetterSourceUrl(nextUrl: string, currentUrl: string): boolean {
  return isBobUrl(nextUrl) && (!isBobUrl(currentUrl) || currentUrl === LIST_URL);
}

function collectTextLines(content: Record<string, unknown>): string[] {
  const lines: string[] = [];

  const headerTitle = normalizeBenefitName(readPropString(content, "headerTitle"));
  const headerText = readPropString(content, "headerText");
  lines.push(headerTitle, headerText);

  walkContent(readPropValue(content, "mainArea"), (item) => {
    if (isMediaContent(item)) return true;

    const title = readPropString(item, "title");
    const tag = readPropString(item, "tag");
    if (isGenericLine(title) || isGenericLine(tag) || isGenericLine(readString(item.name))) {
      return true;
    }

    lines.push(tag, title, readPropString(item, "text"));
    lines.push(...htmlToLines(readPropString(item, "richTextEditor")));
    return false;
  });

  return trimGenericTail(uniqueTextLines(lines));
}

function walkContent(
  value: unknown,
  visit: (item: Record<string, unknown>) => boolean,
): void {
  if (Array.isArray(value)) {
    for (const item of value) walkContent(item, visit);
    return;
  }

  if (!isRecord(value)) return;
  if (isMediaContent(value)) return;

  if (readString(value.contentTypeAlias) && visit(value)) {
    return;
  }

  const props = isRecord(value.props) ? value.props : undefined;
  if (props !== undefined) {
    for (const prop of Object.values(props)) {
      if (isRecord(prop) && "value" in prop) {
        walkContent(prop.value, visit);
      }
    }
  }
}

function collectExternalUrls(content: Record<string, unknown>): string[] {
  const urls: string[] = [];

  walkUnknown(content, (value) => {
    if (!isRecord(value)) return;
    if (isMediaContent(value)) return;

    const linkUrl = readString(value.url);
    if (linkUrl) urls.push(linkUrl);

    const props = isRecord(value.props) ? value.props : {};
    for (const prop of Object.values(props)) {
      if (!isRecord(prop) || !("value" in prop)) continue;
      const propValue = prop.value;
      urls.push(...extractExternalUrlsFromUnknown(propValue));
      if (typeof propValue === "string") {
        urls.push(...extractUrlsFromHtml(propValue));
      }
    }
  });

  return uniqueStringsPreserveOrder(urls.filter((url) => extractDomainFromUrl(url) !== undefined));
}

function walkUnknown(value: unknown, visit: (value: unknown) => void): void {
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walkUnknown(item, visit);
    return;
  }
  if (!isRecord(value) || isMediaContent(value)) return;
  for (const child of Object.values(value)) {
    walkUnknown(child, visit);
  }
}

function extractExternalUrlsFromUnknown(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const url = readString(value.url);
  return extractDomainFromUrl(url) !== undefined ? [url] : [];
}

function extractUrlsFromHtml(html: string): string[] {
  const urls: string[] = [];
  for (const match of html.matchAll(/\bhref=["']([^"']+)["']/gi)) {
    const url = match[1];
    if (url) urls.push(url);
  }
  return urls;
}

function extractDomainsFromUrls(urls: string[]): string[] {
  return uniqueStringsPreserveOrder(urls.flatMap((url) => {
    const domain = extractDomainFromUrl(url);
    return domain === undefined ? [] : [domain];
  }));
}

function extractDomainFromUrl(input: string): string | undefined {
  const trimmedInput = input.trim();
  if (!trimmedInput || /^[/?#]/.test(trimmedInput)) return undefined;

  const parsed = parseUrl(trimmedInput) ??
    (trimmedInput.includes(".") ? parseUrl(`https://${trimmedInput}`) : undefined);
  if (parsed === undefined) return undefined;

  const domain = normalizeDomainInput(parsed.hostname);
  return isSkippedHostname(domain) ? undefined : domain;
}

function extractDomainsFromText(text: string): string[] {
  const domains: string[] = [];
  for (const match of text.matchAll(/\b(?:[a-z0-9-]+\.)+(?:com|events|net|no|org)\b/gi)) {
    const domain = extractDomainFromUrl(match[0] ?? "");
    if (domain !== undefined) domains.push(domain);
  }
  return uniqueStringsPreserveOrder(domains);
}

function isSkippedHostname(hostname: string): boolean {
  const normalized = normalizeDomainInput(hostname);
  return (
    SKIP_HOSTNAMES.has(normalized) ||
    [...SKIP_HOSTNAMES].some((skipped) => normalized.endsWith(`.${skipped}`))
  );
}

function buildTerms(lines: string[]): string {
  return uniqueTextLines([...lines, DEFAULT_TERMS]).join("\n");
}

function extractBobReward(text: string): string {
  const normalized = normalizeNumberWords(text);
  const percentage = extractRelevantPercentageReward(normalized);
  if (percentage) return percentage;

  const kr = extractKrReward(normalized);
  if (kr) return kr;

  if (/\b(?:to\s+for\s+(?:en|én|1)|2\s*(?:for|:)\s*1|to\s+billetter\s+til\s+prisen\s+av\s+(?:en|én|1))\b/i.test(normalized)) {
    return "2 for 1";
  }

  if (/\bgratis\b/i.test(normalized)) {
    return "Gratis";
  }

  return "";
}

function extractRelevantPercentageReward(text: string): string {
  const clauses = text
    .split(/[\n.;]+/)
    .map(normalizeText)
    .filter(Boolean);
  const preferredClauses = clauses.filter((clause) => {
    return /\b(?:bob|medlem|medlemsrabatt|rabatt|fordel)\b/i.test(clause) &&
      !/\b(?:cash-?back|kundeklubb|ytterligere)\b/i.test(clause);
  });

  return extractPercentageReward(preferredClauses.join("\n")) ||
    extractPercentageReward(text);
}

function normalizeNumberWords(text: string): string {
  return text.replace(
    /\b(en|én|ett|to|tre|fire|fem|seks|sju|syv|atte|åtte|ni|ti|elleve|tolv|tretten|fjorten|femten|tjue)\s+prosent\b/gi,
    (match, word: string) => `${NUMBER_WORDS[word.toLowerCase()] ?? match} prosent`,
  );
}

function extractDiscountCodes(text: string): DiscountCode[] {
  const codes: DiscountCode[] = [];
  const patterns = [
    /\b(?:rabattkupong-?kode|rabattkoden?|rabattkode|medlemskode|promokoden?|koden)\s*(?::|=)?\s*["'«“]([^"'»”]+)["'»”]/gi,
    /\b(?:rabattkupong-?kode|rabattkode|medlemskode|promokode|koden)\s*:\s*([A-Za-zÆØÅæøå0-9][A-Za-zÆØÅæøå0-9._-]{1,})/gi,
    /\bmedlemskode\s+([A-ZÆØÅ0-9][A-ZÆØÅ0-9._-]{2,})\b/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const rawCode = (match[1] ?? "").replace(/[.,:;!?]+$/g, "");
      if (!isLikelyDiscountCode(rawCode)) continue;
      const context = sentenceAround(text, match.index ?? 0);
      codes.push({ code: rawCode, context });
    }
  }

  const seen = new Set<string>();
  return codes.filter((code) => {
    const key = code.code.toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isLikelyDiscountCode(code: string): boolean {
  const normalized = code.trim();
  if (normalized.length < 3) return false;
  if (CODE_STOPWORDS.has(normalized.toLowerCase())) return false;
  return /^[A-Za-zÆØÅæøå0-9][A-Za-zÆØÅæøå0-9._-]*$/.test(normalized);
}

function sentenceAround(text: string, index: number): string {
  const start = Math.max(
    text.lastIndexOf("\n", index),
    text.lastIndexOf(".", index),
  );
  const nextNewline = text.indexOf("\n", index);
  const nextPeriod = text.indexOf(".", index);
  const endCandidates = [nextNewline, nextPeriod].filter((value) => value !== -1);
  const end = endCandidates.length > 0 ? Math.min(...endCandidates) : text.length;
  return normalizeText(text.slice(start + 1, end));
}

function selectDomainsForEntry(name: string, domains: string[]): string[] {
  const uniqueDomains = uniqueStringsPreserveOrder(domains);
  if (uniqueDomains.length <= 1) return uniqueDomains;

  const nameKey = normalizeKey(name);
  const exactDomains = uniqueDomains.filter((domain) => {
    const domainKey = normalizeKey(domain.split(".")[0] ?? domain);
    const friendlyName = normalizeKey(DOMAIN_NAME_OVERRIDES[domain] ?? "");
    return domainKey === nameKey || friendlyName === nameKey;
  });
  if (exactDomains.length > 0) return exactDomains;

  const matchingDomains = uniqueDomains.filter((domain) => {
    const domainKey = normalizeKey(domain.split(".")[0] ?? domain);
    const friendlyName = normalizeKey(DOMAIN_NAME_OVERRIDES[domain] ?? "");
    return (domainKey.length > 0 && (nameKey.includes(domainKey) || domainKey.includes(nameKey))) ||
      (friendlyName.length > 0 && (nameKey.includes(friendlyName) || friendlyName.includes(nameKey)));
  });

  return matchingDomains.length > 0 ? matchingDomains : uniqueDomains;
}

function selectDomainsForCode(code: DiscountCode, domains: string[]): string[] {
  const uniqueDomains = uniqueStringsPreserveOrder(domains);
  if (uniqueDomains.length <= 1) return uniqueDomains;

  const codeContext = normalizeKey(`${code.code} ${code.context}`);
  const matchingDomains = uniqueDomains.filter((domain) => {
    const label = normalizeKey(domain.split(".")[0] ?? domain);
    const friendlyName = normalizeKey(DOMAIN_NAME_OVERRIDES[domain] ?? "");
    return (label && codeContext.includes(label)) ||
      (friendlyName && codeContext.includes(friendlyName));
  });

  return matchingDomains;
}

function merchantNameForCode(
  entryName: string,
  codeDomains: string[],
  allDomains: string[],
): string {
  if (codeDomains.length === 1) {
    const domain = codeDomains[0];
    if (domain !== undefined) {
      return DOMAIN_NAME_OVERRIDES[domain] ?? (allDomains.length > 1 ? titleFromDomain(domain) : entryName);
    }
  }
  return entryName;
}

function merchantNameForEntry(entryName: string, domains: string[]): string {
  return domains.length === 1
    ? DOMAIN_NAME_OVERRIDES[domains[0] ?? ""] ?? entryName
    : entryName;
}

function findActivationUrlForDomains(
  urls: string[],
  domains: string[],
): string | undefined {
  return urls.find((url) => {
    const domain = extractDomainFromUrl(url);
    return domain !== undefined && domains.some((candidate) => {
      return domain === candidate || domain.endsWith(`.${candidate}`);
    });
  });
}

function titleFromDomain(domain: string): string {
  const label = domain.split(".")[0] ?? domain;
  return label
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeBenefitName(value: string): string {
  return normalizeText(value)
    .replace(/^gode\s+medlemsfordeler\s+hos\s+/i, "")
    .replace(/^medlemsfordeler\s+hos\s+/i, "")
    .replace(/^ny\s+medlemsfordel\s+hos\s+/i, "")
    .replace(/^ny\s+medlemsfordel:\s*/i, "")
    .replace(/^medlemsrabatt\s+på\s+/i, "")
    .replace(/^få\s+bob-rabatt\s+hos\s+/i, "")
    .replace(/^rabatt\s+på\s+/i, "")
    .trim();
}

function htmlToLines(value: string): string[] {
  if (!value) return [];
  const text = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:h[1-6]|li|p)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n")
    .replace(/&quot;/g, "\"")
    .replace(/&ndash;|&mdash;/g, "-");
  return stripHtml(text)
    .split(/\n+/)
    .map(normalizeText)
    .filter(Boolean);
}

function trimGenericTail(lines: string[]): string[] {
  const result: string[] = [];
  for (const line of lines) {
    if (isGenericLine(line)) break;
    result.push(line);
  }
  return result;
}

function isGenericLine(value: string): boolean {
  const normalized = normalizeText(value);
  return GENERIC_SECTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[“”]/g, "\"")
    .replace(/[«»]/g, "\"")
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

function uniqueStringsPreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function readPropString(value: unknown, propName: string): string {
  return normalizeText(readString(readPropValue(value, propName)));
}

function readPropValue(value: unknown, propName: string): unknown {
  if (!isRecord(value) || !isRecord(value.props)) return undefined;
  const prop = value.props[propName];
  return isRecord(prop) ? prop.value : undefined;
}

function readLink(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function readContentLinks(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isMediaContent(value: Record<string, unknown>): boolean {
  const type = readString(value.contentTypeAlias);
  return type === "Image" || type === "File";
}

function contentPathFromUrl(value: string): string | undefined {
  if (!value) return undefined;

  const parsed = parseUrl(value) ?? parseUrl(new URL(value, SITE_ORIGIN).toString());
  if (parsed === undefined) return undefined;
  if (parsed.hostname && !isBobUrl(parsed.toString())) return undefined;

  return parsed.pathname.startsWith("/") ? parsed.pathname : `/${parsed.pathname}`;
}

function isBobUrl(value: string): boolean {
  const parsed = parseUrl(value) ?? parseUrl(new URL(value, SITE_ORIGIN).toString());
  if (parsed === undefined) return false;
  const hostname = normalizeDomainInput(parsed.hostname);
  return hostname === "bob.no" || hostname.endsWith(".bob.no");
}

function isBobBenefitPath(path: string): boolean {
  return path.startsWith("/medlem-og-beboer/medlemsfordeler/") ||
    path.startsWith("/aktuelt/ny-medlemsfordel-");
}

function slugFromPath(path: string): string {
  const cleanPath = path.split("?")[0]?.replace(/\/+$/, "") ?? path;
  const slug = cleanPath.split("/").filter(Boolean).pop() ?? cleanPath;
  return slugify(slug.replace(/^medlemsfordeler-/, ""));
}

function slugify(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeKey(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]/g, "");
}

function absoluteBobUrl(path: string): string {
  return new URL(path, SITE_ORIGIN).toString();
}
