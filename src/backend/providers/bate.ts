// This file extracts publicly available Bate member benefit data.
// Offers requiring membership are represented with the public Bate benefit page as activation URL.
import { CheerioCrawler, type CheerioCrawlingContext, Configuration, MemoryStorage } from "crawlee";
import {
  type CashbackOffer,
  isRecord,
  normalizeDomainInput,
  parseUrl,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import {
  extractKrReward,
  extractPercentageReward,
  formatPercentageReward,
} from "../../shared/reward.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

type BateCheerio = CheerioCrawlingContext["$"];

const LABEL_LIST = "list";
const LABEL_DETAIL = "detail";
const SITE_ORIGIN = "https://bate.no";
const DEFAULT_TERMS = "Krever Bate-medlemskap.";

const SKIP_HOSTNAMES = new Set([
  "bate.no",
  "cdn.sanity.io",
  "sanity.io",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "google.com",
  "policy.app.cookieinformation.com",
  "apps.apple.com",
  "play.google.com",
]);

const DOMAIN_NAME_OVERRIDES: Record<string, string> = {
  "apotekhjem.no": "Apotekhjem",
  "monter.no": "Montér",
};

export type CrawlBateInput = {
  startUrl: string;
  maxRequestsPerCrawl: number;
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

type BateEntry = {
  domains: string[];
  externalUrls: string[];
  name: string;
  reward: string;
  slug: string;
  sourceUrl: string;
  summary: string;
  terms: string;
};

export async function crawlBate(input: CrawlBateInput): Promise<CashbackOffer[]> {
  input.logger.info("Bate: fetching benefits with Next data...");

  const entries = new Map<string, BateEntry>();
  let detailCount = 0;

  const storage = new MemoryStorage({ persistStorage: false });
  const config = new Configuration();
  config.useStorageClient(storage);

  const crawler = new CheerioCrawler({
    maxConcurrency: 3,
    maxRequestsPerCrawl: input.maxRequestsPerCrawl,
    requestHandler: async ({ $, request, enqueueLinks }) => {
      const label = request.label ?? LABEL_LIST;
      const pageProps = extractPageProps($);

      if (label === LABEL_LIST) {
        const benefits = Array.isArray(pageProps?.benefits) ? pageProps.benefits : [];
        const detailUrls: string[] = [];

        for (const benefit of benefits) {
          const entry = entryFromBenefit(benefit, input.startUrl);
          if (entry === undefined || entries.has(entry.slug)) continue;

          entries.set(entry.slug, entry);
          detailUrls.push(entry.sourceUrl);
        }

        input.logger.info(`Bate: ${entries.size} benefits found, enqueueing details`);
        await enqueueLinks({ urls: detailUrls, label: LABEL_DETAIL });
        return;
      }

      const benefit = isRecord(pageProps?.benefit) ? pageProps.benefit : undefined;
      const slug = slugFromUrl(request.url);
      const entry = slug !== undefined ? entries.get(slug) : undefined;
      if (entry === undefined || benefit === undefined) return;

      enrichEntry(entry, benefit);
      detailCount++;
      process.stdout.write(`\r  Bate detail ${detailCount}/${entries.size}: ${entry.slug.slice(0, 50)}  `);
    },
  }, config);

  await crawler.run([{ url: input.startUrl, label: LABEL_LIST }]);
  if (detailCount > 0) process.stdout.write("\n");

  const offers: CashbackOffer[] = [];
  let overrideCount = 0;
  let pageDomainCount = 0;
  let lookupCount = 0;

  for (const entry of entries.values()) {
    const overrideDomains = input.overrides.bate[entry.slug] ?? [];
    let domains = overrideDomains.map(normalizeDomainInput);
    if (domains.length > 0) {
      overrideCount++;
    }

    if (domains.length === 0) {
      domains = selectDomainsForEntry(entry.name, uniqueStrings([
        ...entry.domains,
        ...extractDomainsFromText(`${entry.name}\n${entry.summary}\n${entry.terms}`),
      ]));
      if (domains.length > 0) pageDomainCount++;
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
      input.logger.warn(`Bate offer has no exact domain: ${entry.name} (${entry.slug})`);
      continue;
    }

    offers.push({
      provider: "bate",
      merchantName: merchantNameForEntry(entry.name, domains),
      domains: uniqueStrings(domains),
      reward: entry.reward || extractBateReward(entry.terms) || "?",
      sourceUrl: entry.sourceUrl,
      activationUrl: entry.sourceUrl,
      terms: entry.terms,
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`Bate: resolved ${pageDomainCount} via page URLs/text, ${lookupCount} via lookup, ${overrideCount} via overrides`);
  input.logger.info(`Bate: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}

function entryFromBenefit(value: unknown, startUrl: string): BateEntry | undefined {
  if (!isRecord(value)) return undefined;

  const name = normalizeBenefitName(readString(value.title));
  const slug = readSlug(value.slug);
  if (!name || !slug) return undefined;

  const summary = normalizeText(readString(value.description));
  const sourceUrl = absoluteBateUrl(`/fordeler/${slug}`, startUrl);
  const lines = termsFromBenefit(value);
  const externalUrls = collectExternalUrls(value);

  return {
    domains: extractDomainsFromUrls(externalUrls),
    externalUrls,
    name,
    reward: extractBateReward([name, summary, ...lines].join("\n")),
    slug,
    sourceUrl,
    summary,
    terms: buildTerms(summary, lines),
  };
}

function enrichEntry(entry: BateEntry, benefit: Record<string, unknown>): void {
  const name = normalizeBenefitName(readString(benefit.title));
  const summary = normalizeText(readString(benefit.description));
  const lines = termsFromBenefit(benefit);
  const externalUrls = collectExternalUrls(benefit);
  const domains = uniqueStrings([
    ...extractDomainsFromUrls(externalUrls),
    ...extractDomainsFromText([name, summary, ...lines].join("\n")),
  ]);
  const nextReward = extractBateReward([name, summary, ...lines].join("\n"));

  entry.name = name || entry.name;
  entry.summary = summary || entry.summary;
  entry.externalUrls = uniqueStrings([...entry.externalUrls, ...externalUrls]);
  entry.domains = uniqueStrings([...entry.domains, ...domains]);
  entry.terms = buildTerms(entry.summary, lines);
  entry.reward = bestReward(entry.reward, nextReward);
}

function extractPageProps($: BateCheerio): Record<string, unknown> | undefined {
  const rawNextData = $("script#__NEXT_DATA__").first().text();
  if (!rawNextData) return undefined;

  try {
    const nextData = JSON.parse(rawNextData);
    if (!isRecord(nextData) || !isRecord(nextData.props) || !isRecord(nextData.props.pageProps)) {
      return undefined;
    }
    return nextData.props.pageProps;
  } catch {
    return undefined;
  }
}

function termsFromBenefit(benefit: Record<string, unknown>): string[] {
  const percentageLines = percentageLinesFromBenefit(benefit.percentages);
  const perkLines = perkLinesFromBenefit(benefit.perks);
  const bodyLines = bodyLinesFromPortableText(benefit.body);

  return uniqueTextLines([
    ...percentageLines,
    ...perkLines,
    ...bodyLines,
  ]).slice(0, 24);
}

function percentageLinesFromBenefit(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const amount = readNumber(item.amount);
    const type = normalizeText(readString(item.type));
    const text = normalizeText(readString(item.text));
    if (amount === undefined) return [];

    const prefix = `${formatPercentageReward([amount])}${type ? ` ${type}` : ""}`;
    return [`${prefix}${text ? ` ${text}` : ""}`];
  });
}

function perkLinesFromBenefit(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const title = normalizeText(readString(item.title));
    const text = normalizeText(readString(item.text));
    if (!title && !text) return [];
    return [`${title}${title && text ? ": " : ""}${text}`];
  });
}

function bodyLinesFromPortableText(value: unknown): string[] {
  const lines: string[] = [];

  function walk(node: unknown): void {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }

    if (!isRecord(node)) return;

    const type = readString(node._type);
    if (type === "block" && Array.isArray(node.children)) {
      const line = node.children
        .flatMap((child) => isRecord(child) ? [readString(child.text)] : [])
        .join("");
      if (line) lines.push(line);
      return;
    }

    const title = readString(node.title);
    const text = readString(node.text);
    if (title) lines.push(title);
    if (text) lines.push(text);

    for (const key of ["text", "children", "body", "facts", "items"]) {
      if (key in node && typeof node[key] !== "string") {
        walk(node[key]);
      }
    }
  }

  walk(value);
  return uniqueTextLines(lines);
}

function buildTerms(summary: string, lines: string[]): string {
  return uniqueTextLines([
    summary,
    ...lines,
    DEFAULT_TERMS,
  ]).join("\n");
}

function extractBateReward(text: string): string {
  const structuredPercentage = extractStructuredPercentageReward(text);
  if (structuredPercentage) return structuredPercentage;

  const percentage = extractPercentageReward(text);
  if (percentage) return percentage;

  const kr = extractKrReward(text);
  if (kr) return kr;

  if (/\bgratis\b/i.test(text)) return "0 kr totalsum";
  return "";
}

function extractStructuredPercentageReward(text: string): string {
  const values: number[] = [];

  for (const line of text.split(/\n+/).map(normalizeText)) {
    if (!/\b(?:rabatt|bonus|avslag|spar|fordel|medlemspris)\b/i.test(line)) continue;
    const lineReward = extractPercentageReward(line);
    for (const match of lineReward.matchAll(/(\d{1,3}(?:[,.]\d+)?)\s*%/g)) {
      const value = Number.parseFloat((match[1] ?? "").replace(",", "."));
      if (Number.isFinite(value) && !values.includes(value)) values.push(value);
    }
  }

  return formatPercentageReward(values);
}

function bestReward(currentReward: string, nextReward: string): string {
  if (!currentReward) return nextReward;
  if (!nextReward) return currentReward;
  return rewardSpecificity(nextReward) >= rewardSpecificity(currentReward)
    ? nextReward
    : currentReward;
}

function rewardSpecificity(reward: string): number {
  if (/\d/.test(reward) && /%/.test(reward)) return 4;
  if (/\d/.test(reward) && /\bkr\b/i.test(reward)) return 3;
  if (/\bgratis\b/i.test(reward)) return 2;
  if (/\d/.test(reward)) return 1;
  return 0;
}

function collectExternalUrls(value: unknown): string[] {
  const urls: string[] = [];

  walkUnknown(value, (node) => {
    if (!isRecord(node)) return;
    for (const key of ["href", "url", "link", "website"]) {
      const rawUrl = readString(node[key]);
      if (rawUrl) urls.push(rawUrl);
    }
  });

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

function extractDomainsFromText(text: string): string[] {
  const domains: string[] = [];
  for (const match of text.matchAll(/\b(?:[a-z0-9-]+\.)+(?:com|events|net|no|org)\b/gi)) {
    const domain = extractDomainFromUrl(match[0] ?? "");
    if (domain !== undefined) domains.push(domain);
  }
  return uniqueStrings(domains);
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
  if (!trimmedInput || /^[/?#]/.test(trimmedInput) || /^mailto:/i.test(trimmedInput)) return undefined;

  const parsed = parseUrl(trimmedInput) ??
    (trimmedInput.includes(".") ? parseUrl(`https://${trimmedInput}`) : undefined);
  if (parsed === undefined) return undefined;
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;

  const domain = normalizeDomainInput(parsed.hostname);
  if (isSkippedHostname(domain)) return undefined;

  return parsed.toString();
}

function lookupNamesForEntry(entry: BateEntry): string[] {
  return uniqueTextLines([
    entry.name,
    entry.name.replace(/\s+-\s+.*$/, ""),
    entry.name.replace(/\b(?:medlemsfordel|rabatt|bonus|fordel)\b/gi, ""),
    titleFromSlug(entry.slug),
  ]);
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

function merchantNameForEntry(name: string, domains: string[]): string {
  if (domains.length === 1) {
    const domain = domains[0] ?? "";
    return DOMAIN_NAME_OVERRIDES[domain] ?? name;
  }
  return name;
}

function walkUnknown(value: unknown, visit: (value: unknown) => void): void {
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walkUnknown(item, visit);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (["figure", "image", "logo", "asset", "seo", "relatedBenefits"].includes(key)) continue;
    walkUnknown(child, visit);
  }
}

function absoluteBateUrl(path: string, fallbackBaseUrl: string): string {
  try {
    return new URL(path, fallbackBaseUrl || SITE_ORIGIN).toString();
  } catch {
    return `${SITE_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;
  }
}

function slugFromUrl(url: string): string | undefined {
  const parsed = parseUrl(url);
  const path = parsed?.pathname ?? url;
  const match = path.match(/\/fordeler\/([^/?#]+)\/?$/i);
  return match?.[1] !== undefined ? decodeURIComponent(match[1]) : undefined;
}

function readSlug(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (isRecord(value) && typeof value.current === "string") return value.current.trim();
  return "";
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
    normalized.endsWith(".bate.no") ||
    [...SKIP_HOSTNAMES].some((skipped) => normalized.endsWith(`.${skipped}`))
  );
}

function normalizeBenefitName(value: string): string {
  return normalizeText(value)
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/^\s*(?:kampanje|nyhet)\s*\|\s*/i, "")
    .replace(/^nyhet!\s*/i, "")
    .trim();
}

function normalizeText(value: string): string {
  return value
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

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}
