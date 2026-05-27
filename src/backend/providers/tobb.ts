// This file extracts publicly available TOBB member benefit data.
// Offers requiring membership are represented with the public TOBB benefit page as activation URL.
import { CheerioCrawler, type CheerioCrawlingContext, Configuration, MemoryStorage } from "crawlee";
import {
  type CashbackOffer,
  isRecord,
  normalizeDomainInput,
  parseUrl,
  stripHtml,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import {
  extractKrReward,
  extractOreLitreReward,
  extractPercentageReward,
  formatPercentageReward,
} from "../../shared/reward.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

type TobbCheerio = CheerioCrawlingContext["$"];

const LABEL_LIST = "list";
const LABEL_DETAIL = "detail";
const SITE_ORIGIN = "https://tobb.no";
const DEFAULT_TERMS = "Krever TOBB-medlemskap.";

const SKIP_HOSTNAMES = new Set([
  "tobb.no",
  "bbl.no",
  "tobb.bbl.no",
  "forkjop.bbl.no",
  "bli-medlem.bbl.no",
  "tobb.apexapp.io",
  "app-eu1.hubspot.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "google.com",
  "googletagmanager.com",
  "policy.app.cookieinformation.com",
  "use.typekit.net",
  "apps.apple.com",
  "play.google.com",
]);

const DOMAIN_NAME_OVERRIDES: Record<string, string> = {
  "antonsport.no": "Anton Sport",
  "byggmakker.no": "Byggmakker",
  "interflora.no": "Interflora",
  "sparebank1.no": "SpareBank 1 SMN",
};

export type CrawlTobbInput = {
  startUrl: string;
  maxRequestsPerCrawl: number;
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

type TobbEntry = {
  domains: string[];
  externalUrls: string[];
  name: string;
  reward: string;
  slug: string;
  sourceUrl: string;
  summary: string;
  terms: string;
};

export async function crawlTobb(input: CrawlTobbInput): Promise<CashbackOffer[]> {
  input.logger.info("TOBB: fetching benefits...");

  const entries = new Map<string, TobbEntry>();
  let detailCount = 0;

  const storage = new MemoryStorage({ persistStorage: false });
  const config = new Configuration();
  config.useStorageClient(storage);

  const crawler = new CheerioCrawler({
    maxConcurrency: 3,
    maxRequestsPerCrawl: input.maxRequestsPerCrawl,
    requestHandler: async ({ $, request, enqueueLinks }) => {
      const label = request.label ?? LABEL_LIST;

      if (label === LABEL_LIST) {
        const listEntries = listEntriesFromPage($, input.startUrl);
        const detailUrls: string[] = [];

        for (const entry of listEntries) {
          if (entries.has(entry.slug)) continue;
          entries.set(entry.slug, entry);
          detailUrls.push(entry.sourceUrl);
        }

        input.logger.info(`TOBB: ${entries.size} benefits found, enqueueing details`);
        await enqueueLinks({ urls: detailUrls, label: LABEL_DETAIL });
        return;
      }

      const slug = slugFromUrl(request.url);
      const entry = slug !== undefined ? entries.get(slug) : undefined;
      if (entry === undefined) return;

      if (slug === "nettbutikker") {
        entries.delete(slug);
        for (const childEntry of nettbutikkerEntriesFromDetail($, request.url)) {
          entries.set(childEntry.slug, childEntry);
        }
        detailCount++;
        process.stdout.write(`\r  TOBB detail ${detailCount}/${entries.size}: ${slug.slice(0, 50)}  `);
        return;
      }

      enrichEntryFromDetail(entry, $, request.url);
      detailCount++;
      process.stdout.write(`\r  TOBB detail ${detailCount}/${entries.size}: ${entry.slug.slice(0, 50)}  `);
    },
  }, config);

  await crawler.run([{ url: input.startUrl, label: LABEL_LIST }]);
  if (detailCount > 0) process.stdout.write("\n");

  const offers: CashbackOffer[] = [];
  let overrideCount = 0;
  let pageDomainCount = 0;
  let lookupCount = 0;

  for (const entry of entries.values()) {
    const overrideDomains = input.overrides.tobb[entry.slug] ?? [];
    let domains = overrideDomains.map(normalizeDomainInput);
    if (domains.length > 0) overrideCount++;

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
      input.logger.warn(`TOBB offer has no exact domain: ${entry.name} (${entry.slug})`);
      continue;
    }

    offers.push({
      provider: "tobb",
      merchantName: merchantNameForEntry(entry.name, domains),
      domains: uniqueStrings(domains),
      reward: entry.reward || extractTobbReward(entry.terms) || "?",
      sourceUrl: entry.sourceUrl,
      activationUrl: entry.sourceUrl,
      terms: entry.terms,
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`TOBB: resolved ${pageDomainCount} via page URLs/text, ${lookupCount} via lookup, ${overrideCount} via overrides`);
  input.logger.info(`TOBB: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}

function listEntriesFromPage($: TobbCheerio, startUrl: string): TobbEntry[] {
  const entries: TobbEntry[] = [];
  const seen = new Set<string>();

  $(".benefit-card").each((_index, card) => {
    const cardElement = $(card);
    const link = cardElement.find('a[href^="/fordeler/"]').filter((_linkIndex, element) => {
      return slugFromUrl($(element).attr("href") ?? "") !== undefined;
    }).first();
    const href = link.attr("href") ?? "";
    const slug = slugFromUrl(href);
    if (slug === undefined || seen.has(slug)) return;

    const name = normalizeBenefitName(
      link.attr("aria-label") ||
      cardElement.find(".benefit-card--info__title").text() ||
      link.text() ||
      titleFromSlug(slug),
    );
    const summary = normalizeText(cardElement.find(".benefit-card--info__teaser").text());
    const sourceUrl = absoluteTobbUrl(`/fordeler/${slug}/`, startUrl);
    seen.add(slug);
    entries.push({
      domains: [],
      externalUrls: [],
      name,
      reward: extractTobbReward(`${name}\n${summary}`),
      slug,
      sourceUrl,
      summary,
      terms: buildTerms(summary, []),
    });
  });

  if (entries.length > 0) return entries;

  $('a[href^="/fordeler/"]').each((_index, element) => {
    const href = $(element).attr("href") ?? "";
    const slug = slugFromUrl(href);
    if (slug === undefined || seen.has(slug)) return;
    seen.add(slug);
    const name = normalizeBenefitName($(element).attr("aria-label") || $(element).text() || titleFromSlug(slug));
    entries.push({
      domains: [],
      externalUrls: [],
      name,
      reward: "",
      slug,
      sourceUrl: absoluteTobbUrl(`/fordeler/${slug}/`, startUrl),
      summary: "",
      terms: buildTerms("", []),
    });
  });

  return entries;
}

function enrichEntryFromDetail(entry: TobbEntry, $: TobbCheerio, pageUrl: string): void {
  const name = normalizeBenefitName($("main h1, h1").first().text());
  const summary = normalizeText($('meta[name="description"]').attr("content") ?? "");
  const content = $(".content-text").first();
  const lines = contentLines($, content.length > 0 ? content : $("main").first());
  const externalUrls = collectExternalUrls($, $("main").first());
  const domains = uniqueStrings([
    ...extractDomainsFromUrls(externalUrls),
    ...extractDomainsFromText([name, summary, ...lines].join("\n")),
  ]);
  const nextReward = extractTobbReward([name, summary, ...lines].join("\n"));

  entry.name = name || entry.name;
  entry.summary = summary || entry.summary;
  entry.externalUrls = uniqueStrings([...entry.externalUrls, ...externalUrls]);
  entry.domains = uniqueStrings([...entry.domains, ...domains]);
  entry.terms = buildTerms(entry.summary, lines);
  entry.reward = bestReward(entry.reward, nextReward);
  entry.sourceUrl = pageUrl;
}

function nettbutikkerEntriesFromDetail($: TobbCheerio, pageUrl: string): TobbEntry[] {
  const content = $(".content-text").first();
  const commonTerms = contentLines($, content).filter((line) => {
    return !/^\s*[^-]+-\s*\d+(?:[,.]\d+)?\s*%/i.test(line);
  });
  const entries: TobbEntry[] = [];

  content.find("li").each((_index, element) => {
    const line = normalizeText(stripHtml($(element).html() ?? ""));
    const parsed = parseNettbutikkLine(line);
    if (parsed === undefined) return;

    const domains = uniqueStrings([
      ...extractDomainsFromText(parsed.name),
      ...extractDomainsFromText(parsed.description),
    ]);
    const slug = `nettbutikker-${slugify(parsed.name)}`;
    entries.push({
      domains,
      externalUrls: [],
      name: parsed.name,
      reward: parsed.reward,
      slug,
      sourceUrl: pageUrl,
      summary: parsed.description,
      terms: buildTerms(parsed.description, [
        line,
        ...commonTerms,
      ]),
    });
  });

  return entries;
}

function parseNettbutikkLine(line: string): { description: string; name: string; reward: string } | undefined {
  const match = line.match(/^(?<name>.+?)\s*-\s*(?<reward>\d{1,3}(?:[,.]\d+)?)\s*%\s*TOBB-bonus\s*-?\s*(?<description>.*)$/i);
  if (match?.groups === undefined) return undefined;

  const name = normalizeBenefitName(match.groups.name ?? "");
  const reward = formatPercentageReward([Number.parseFloat((match.groups.reward ?? "").replace(",", "."))]);
  const description = normalizeText(match.groups.description ?? "");
  if (!name || !reward) return undefined;

  return { description, name, reward };
}

function contentLines($: TobbCheerio, root: ReturnType<TobbCheerio>): string[] {
  const lines: string[] = [];

  root.find("h2, h3, p, li").each((_index, element) => {
    const html = $(element).html() ?? "";
    const text = normalizeText(stripHtml(html));
    if (text) lines.push(text);
  });

  return uniqueTextLines(lines).slice(0, 28);
}

function buildTerms(summary: string, lines: string[]): string {
  return uniqueTextLines([
    summary,
    ...lines,
    DEFAULT_TERMS,
  ]).join("\n");
}

function extractTobbReward(text: string): string {
  const structuredPercentage = extractStructuredPercentageReward(text);
  if (structuredPercentage) return structuredPercentage;

  const oreLitre = extractOreLitreReward(text);
  if (oreLitre) return oreLitre;

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

function collectExternalUrls($: TobbCheerio, root: ReturnType<TobbCheerio>): string[] {
  const urls: string[] = [];

  root.find("a[href]").each((_index, element) => {
    const href = $(element).attr("href") ?? "";
    const externalUrl = normalizeExternalUrl(href);
    if (externalUrl !== undefined) urls.push(externalUrl);
  });

  return uniqueStrings(urls);
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

function lookupNamesForEntry(entry: TobbEntry): string[] {
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

function absoluteTobbUrl(path: string, fallbackBaseUrl: string): string {
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

function titleFromSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function slugify(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/å/g, "aa")
    .replace(/ø/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isSkippedHostname(hostname: string): boolean {
  const normalized = normalizeDomainInput(hostname);
  return (
    SKIP_HOSTNAMES.has(normalized) ||
    normalized.endsWith(".tobb.no") ||
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
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\.(?:com|no|se|dk|fi|eu|net|io|org)$/i, "")
    .replace(/[^a-z0-9]/g, "");
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
