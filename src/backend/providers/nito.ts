// This file extracts publicly available NITO member benefit data.
// Offers requiring login are represented with the public NITO benefit page as activation URL.
import { CheerioCrawler, type CheerioCrawlingContext, Configuration, MemoryStorage } from "crawlee";
import {
  type CashbackOffer,
  normalizeDomainInput,
  parseUrl,
  stripHtml,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import { extractKrReward, extractOreLitreReward, extractPercentageReward } from "../../shared/reward.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

type NitoCheerio = CheerioCrawlingContext["$"];

const LABEL_LIST = "list";
const LABEL_DETAIL = "detail";
const SITE_ORIGIN = "https://www.nito.no";
const DEFAULT_TERMS = "Krever NITO-medlemskap.";

const SKIP_HOSTNAMES = new Set([
  "nito.no",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "puzzel.com",
  "boost.ai",
  "microsoft.com",
  "visualstudio.com",
  "tiqcdn.com",
]);

export type CrawlNitoInput = {
  startUrl: string;
  maxRequestsPerCrawl: number;
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

type NitoEntry = {
  slug: string;
  name: string;
  sourceUrl: string;
  summary: string;
  reward: string;
  terms: string;
  domains: string[];
};

type NitoRawBenefit = {
  contentLink?: unknown;
  heading?: unknown;
  partnerName?: unknown;
  pageImageAltText?: unknown;
};

export async function crawlNito(input: CrawlNitoInput): Promise<CashbackOffer[]> {
  const entries = new Map<string, NitoEntry>();

  const storage = new MemoryStorage({ persistStorage: false });
  const config = new Configuration();
  config.useStorageClient(storage);

  const crawler = new CheerioCrawler({
    maxConcurrency: 3,
    maxRequestsPerCrawl: input.maxRequestsPerCrawl,
    requestHandler: async ({ $, request, enqueueLinks }) => {
      const label = request.label ?? LABEL_LIST;

      if (label === LABEL_LIST) {
        const detailUrls: string[] = [];
        const propsBenefits = extractRabattBenefitsFromProps($);

        if (propsBenefits.length > 0) {
          for (const benefit of propsBenefits) {
            const href = typeof benefit.contentLink === "string" ? benefit.contentLink : "";
            const sourceUrl = absoluteNitoUrl(href, input.startUrl);
            if (!isRelevantNitoPath(sourceUrl)) continue;

            const slug = slugFromUrl(sourceUrl);
            if (!slug || entries.has(slug) || slug === "verv-en-kollega") continue;

            const title = normalizeText(typeof benefit.heading === "string" ? benefit.heading : "");
            const partnerName = normalizePartnerName(typeof benefit.partnerName === "string" ? benefit.partnerName : "");
            const imageAlt = normalizePartnerName(typeof benefit.pageImageAltText === "string" ? benefit.pageImageAltText : "");
            const name = selectMerchantName(title, partnerName, imageAlt);
            if (!name) continue;

            entries.set(slug, {
              slug,
              name,
              sourceUrl,
              summary: title,
              reward: extractNitoReward(title),
              terms: buildTerms([], title),
              domains: [],
            });
            detailUrls.push(sourceUrl);
          }
        } else {
          $("article.article-teaser a.article-teaser__link[href]").each((_, element) => {
            const link = $(element);
            const href = link.attr("href") ?? "";
            const sourceUrl = absoluteNitoUrl(href, input.startUrl);
            if (!isRelevantNitoPath(sourceUrl)) return;

            const slug = slugFromUrl(sourceUrl);
            if (!slug || entries.has(slug) || slug === "verv-en-kollega") return;

            const card = link.closest("article.article-teaser");
            const title = normalizeText(link.clone().children().remove().end().text());
            const partnerAlt = normalizePartnerName(card.find(".article-teaser__partner img[alt]").first().attr("alt") ?? "");
            const imageAlt = normalizePartnerName(card.find(".article-teaser__image img[alt]").first().attr("alt") ?? "");
            const name = selectMerchantName(title, partnerAlt, imageAlt);
            if (!name) return;

            entries.set(slug, {
              slug,
              name,
              sourceUrl,
              summary: title,
              reward: extractNitoReward(title),
              terms: buildTerms([], title),
              domains: [],
            });
            detailUrls.push(sourceUrl);
          });
        }

        input.logger.info(`NITO: found ${entries.size} benefit cards, enqueueing detail pages`);
        await enqueueLinks({ urls: detailUrls, label: LABEL_DETAIL });
        return;
      }

      const slug = slugFromUrl(request.url);
      const entry = entries.get(slug);
      if (entry === undefined) return;

      const pageText = extractMainText($);
      const bulletTerms = extractBenefitBulletTerms($);
      const tableTerms = extractBenefitTableTerms($);
      const externalUrls = collectExternalUrls($);
      const detailReward = extractNitoReward([
        entry.name,
        entry.summary,
        ...bulletTerms,
        ...tableTerms,
        pageText,
      ].join("\n"));

      entry.domains = uniqueStrings([
        ...entry.domains,
        ...externalUrls.flatMap((url) => {
          const domain = extractExternalDomain(url);
          return domain === undefined ? [] : [domain];
        }),
        ...extractDomainsFromText(pageText),
      ]);
      entry.reward = bestReward(entry.reward, detailReward);
      entry.terms = buildTerms([...bulletTerms, ...tableTerms], pageText);
    },
  }, config);

  await crawler.run([{ url: input.startUrl, label: LABEL_LIST }]);

  const offers: CashbackOffer[] = [];
  let fromUrl = 0;
  let lookedUp = 0;
  let overrideCount = 0;

  for (const entry of entries.values()) {
    let domains: string[] = [];

    if (entry.domains.length > 0) {
      domains = uniqueStrings(entry.domains);
      if (domains.length > 0) fromUrl++;
    }

    if (domains.length === 0) {
      for (const lookupName of lookupNamesForEntry(entry)) {
        domains = lookupDomains(input.domainLookup, lookupName);
        if (domains.length > 0) {
          lookedUp++;
          break;
        }
      }
    }

    if (domains.length === 0) {
      domains = (input.overrides.nito?.[entry.slug] ?? []).map(normalizeDomainInput);
      if (domains.length > 0) {
        overrideCount++;
      }
    }

    if (domains.length === 0) {
      input.logger.warn(`NITO offer has no domain: ${entry.name} (${entry.slug})`);
      continue;
    }

    offers.push({
      provider: "nito",
      merchantName: entry.name,
      domains: uniqueStrings(domains),
      reward: entry.reward || "?",
      sourceUrl: entry.sourceUrl,
      activationUrl: entry.sourceUrl,
      terms: entry.terms,
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`NITO: resolved ${fromUrl} via detail URLs/text, ${lookedUp} via lookup, ${overrideCount} via overrides`);
  input.logger.info(`NITO: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}

function extractRabattBenefitsFromProps($: NitoCheerio): NitoRawBenefit[] {
  const rawProps = $("[data-react-component='member-benefit-list']").first().attr("data-props");
  if (rawProps === undefined) return [];

  try {
    const parsed = JSON.parse(rawProps) as unknown;
    return findRabattBenefits(parsed);
  } catch {
    return [];
  }
}

function findRabattBenefits(value: unknown): NitoRawBenefit[] {
  if (Array.isArray(value)) {
    return value.flatMap(findRabattBenefits);
  }

  if (!isPlainObject(value)) {
    return [];
  }

  const category = value.category;
  if (isPlainObject(category) && category.name === "Rabatter") {
    const details = value.memberBenefitsDetails;
    return Array.isArray(details) ? details.filter(isPlainObject) : [];
  }

  return Object.values(value).flatMap(findRabattBenefits);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractBenefitBulletTerms($: NitoCheerio): string[] {
  const lines: string[] = [];

  $(".bulletpoint-block").each((_, element) => {
    const block = $(element);
    const heading = normalizeText(block.find(".bulletpoint-block__heading").first().text());
    const headingKey = normalizeKey(heading);
    if (
      headingKey.length > 0 &&
      !/hva|far|faar|fordel|rabatt|inkludert|gratis/.test(headingKey)
    ) {
      return;
    }

    if (heading) lines.push(heading.endsWith("?") ? heading : `${heading}?`);

    block.find(".bulletpoint-block__list-item").each((_, item) => {
      const itemElement = $(item);
      const itemLines = uniqueTextLines([
        normalizeText(itemElement.find(".bulletpoint-block__list-item-heading").first().text()),
        ...itemElement.find("p").toArray().map((paragraph) => normalizeText($(paragraph).text())),
      ].filter(Boolean));
      lines.push(...itemLines);
    });
  });

  return lines;
}

function extractBenefitTableTerms($: NitoCheerio): string[] {
  const lines: string[] = [];

  $("table").each((_, tableElement) => {
    const table = $(tableElement);
    if (table.closest(".related-benefits-block").length > 0) return;

    const heading = normalizeText(
      table.closest(".text-block__text, .editorial, article, section")
        .find("h2, h3")
        .first()
        .text(),
    );
    const rowLines: string[] = [];

    table.find("tr").each((_, rowElement) => {
      const cells = $(rowElement).find("th, td").toArray()
        .map((cell) => normalizeText($(cell).text()))
        .filter(Boolean)
        .filter((cell) => !/^(?:modell|rabatt)$/i.test(cell));

      if (cells.length < 2) return;

      const valueCell = cells.find((cell) => /(?:\d+(?:[,.]\d+)?\s*%|\d[\d\s]*(?:[,.]\d+)?\s*kr\b|\bgratis\b)/i.test(cell));
      const labelCell = cells.find((cell) => cell !== valueCell);
      if (labelCell === undefined || valueCell === undefined) return;
      if (labelCell.length > 60 || /rabatt\s+gjelder\s+ikke/i.test(labelCell)) return;

      rowLines.push(`${labelCell}: ${valueCell}`);
    });

    if (rowLines.length === 0) return;
    if (heading) lines.push(heading);
    lines.push(...rowLines);
  });

  return uniqueTextLines(lines);
}

function extractMainText($: NitoCheerio): string {
  const article = $("main, article, .content-area").first().clone();
  article
    .find(
      "script, style, noscript, form, iframe, svg, nav, header, footer, table, .benefit-cta-block, .partner-teaser, .related-benefits-block",
    )
    .remove();
  const html = article.length > 0 ? article.html() ?? "" : $("body").html() ?? "";
  return stripHtml(html)
    .split(/\n+/)
    .map(normalizeText)
    .filter(Boolean)
    .filter((line) => !isScriptOrPageNoise(line, normalizeKey(line)))
    .join("\n");
}

function collectExternalUrls($: NitoCheerio): string[] {
  const urls: string[] = [];
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href") ?? "";
    const absoluteUrl = normalizeExternalUrl(href);
    if (absoluteUrl !== undefined) urls.push(absoluteUrl);
  });
  return uniqueStrings(urls);
}

function extractNitoReward(text: string): string {
  const relevant = relevantRewardText(text);
  const ore = extractOreLitreReward(relevant);
  if (ore) return ore;

  const percentage = extractPercentageReward(relevant);
  if (percentage) return percentage;

  const kr = extractKrReward(relevant);
  if (kr) return kr;

  if (/\bhalv\s+pris\b/i.test(relevant)) return "50 %";
  if (isFreeAdmissionOrLiftPass(relevant)) return "0 kr totalsum";
  if (/\bmedlemspris\b/i.test(relevant)) return "Medlemspris";
  if (/\b(?:rabatt|cashpoint|fordel|tilbud)\b/i.test(relevant)) return "?";
  return "";
}

function relevantRewardText(text: string): string {
  return text
    .split(/\n+/)
    .map(normalizeText)
    .filter((line) => {
      return /(?:\d|%|prosent|rabatt|cashpoint|gratis|halv pris|medlemspris|avslag|spar|heiskort|inngang)/i.test(line);
    })
    .join("\n");
}

function isFreeAdmissionOrLiftPass(text: string): boolean {
  return /\bgratis\s+(?:heiskort|inngang|årskort|arskort)\b/i.test(text) ||
    /\b(?:heiskort|inngang|årskort|arskort)\b[^\n.]{0,80}\bgratis\b/i.test(text);
}

function bestReward(existing: string, next: string): string {
  if (!existing) return next;
  if (!next) return existing;
  if (existing === "?" && next !== "?") return next;
  return rewardScore(next) > rewardScore(existing) ? next : existing;
}

function rewardScore(reward: string): number {
  if (reward === "?" || reward === "Medlemsfordel") return 0;
  const rangeMatch = reward.match(/\d+(?:[,.]\d+)?\s*[-\u2013]\s*(\d+(?:[,.]\d+)?)\s*%/);
  const percentMatch = rangeMatch ? [null, rangeMatch[1]] : reward.match(/(\d+(?:[,.]\d+)?)\s*%/);
  if (percentMatch !== null) return 10000 + Number.parseFloat((percentMatch[1] ?? "0").replace(",", "."));
  const krMatch = reward.match(/(\d[\d\s]*(?:[,.]\d+)?)\s*kr/i);
  if (krMatch !== null) return 5000 + Number.parseFloat((krMatch[1] ?? "0").replace(/\s/g, "").replace(",", "."));
  if (/^0\s*kr\s+totalsum$/i.test(reward)) return 1000;
  if (/medlemspris/i.test(reward)) return 100;
  return 1;
}

function buildTerms(bulletTerms: string[], fallbackText: string): string {
  const lines = bulletTerms.length > 0
    ? [...bulletTerms, DEFAULT_TERMS]
    : uniqueTextLines([...extractRelevantTermLines(fallbackText), DEFAULT_TERMS]);
  return lines.length > 0 ? lines.join("\n") : DEFAULT_TERMS;
}

function extractRelevantTermLines(text: string): string[] {
  const sourceLines = text
    .split(/\n+/)
    .map(normalizeText)
    .filter(Boolean)
    .filter((line) => !isScriptOrPageNoise(line, normalizeKey(line)));

  const lines: string[] = [];
  for (let index = 0; index < sourceLines.length; index++) {
    const line = sourceLines[index] ?? "";
    if (!isRelevantTermLine(line)) continue;
    lines.push(line);

    const nextLine = sourceLines[index + 1] ?? "";
    if (nextLine.length > 0 && nextLine.length <= 90 && isContinuationLine(nextLine)) {
      lines.push(nextLine);
    }
  }

  return uniqueTextLines(lines).slice(0, 10);
}

function isRelevantTermLine(line: string): boolean {
  return /(?:\d|%|prosent|rabatt|cashpoint|gratis|halv pris|medlemspris|gjelder|kode|logg inn|medlemsbevis|krever|tilbud|fordel|heiskort|inngang)/i.test(line);
}

function isContinuationLine(line: string): boolean {
  return /^(?:pa|på|for|hos|i|av|til|med|når|nar)\b/i.test(line) ||
    !/[.!?]$/.test(line);
}

function lookupNamesForEntry(entry: NitoEntry): string[] {
  return uniqueStrings([
    entry.name,
    merchantNameFromTitle(entry.summary),
    entry.slug.replace(/-/g, " "),
  ].filter(Boolean));
}

function merchantNameFromTitle(title: string): string {
  return normalizeText(title)
    .replace(/^(?:rabattkode\s+)?(?:rabatt|kursrabatt)\s+(?:hos|pa|på)\s+/i, "")
    .replace(/^bilrabatt\s+/i, "")
    .replace(/^hotellrabatt\s+/i, "")
    .replace(/^halv\s+pris\s+(?:pa|på)\s+/i, "")
    .replace(/^gratis\s+(?:heiskort|inngang)\s+(?:i|pa|på)\s+/i, "")
    .replace(/^rabatt\s+pa\s+/i, "")
    .trim();
}

function selectMerchantName(title: string, partnerName: string, imageAlt: string): string {
  const titleName = merchantNameFromTitle(title);
  if (/^(?:bilrabatt|hotellrabatt|gratis|halv\s+pris)/i.test(title)) {
    return titleName || partnerName || imageAlt || title;
  }

  if (isGenericPartnerName(partnerName)) {
    return titleName || imageAlt || partnerName || title;
  }

  return partnerName || titleName || imageAlt || title;
}

function isGenericPartnerName(name: string): boolean {
  return /^(?:nito|bertel\s+o\.?\s+steen)$/i.test(name);
}

function normalizePartnerName(value: string): string {
  return normalizeText(value)
    .replace(/\s+logo(?:en)?$/i, "")
    .replace(/\s+restauranter$/i, "")
    .replace(/^Bilde av\s+/i, "")
    .trim();
}

function extractDomainsFromText(text: string): string[] {
  const domains: string[] = [];
  const urlMatches = text.matchAll(/\bhttps?:\/\/[^\s)]+/gi);
  for (const match of urlMatches) {
    const domain = extractExternalDomain(match[0]);
    if (domain !== undefined) domains.push(domain);
  }

  const bareMatches = text.matchAll(/\b(?:[a-z0-9-]+\.)+(?:no|com|se|dk|fi|eu|net|org)\b/gi);
  for (const match of bareMatches) {
    const domain = extractExternalDomain(`https://${match[0]}`);
    if (domain !== undefined) domains.push(domain);
  }

  return uniqueStrings(domains);
}

function extractExternalDomain(url: string): string | undefined {
  const parsedUrl = parseUrl(url);
  if (parsedUrl === undefined) return undefined;

  const hostname = normalizeDomainInput(parsedUrl.hostname);
  if (isSkippedHostname(hostname)) return undefined;
  return hostname;
}

function normalizeExternalUrl(href: string): string | undefined {
  const trimmedHref = href.trim();
  if (!/^https?:\/\//i.test(trimmedHref)) return undefined;

  const parsedUrl = parseUrl(trimmedHref);
  if (parsedUrl === undefined) return undefined;
  const hostname = normalizeDomainInput(parsedUrl.hostname);
  if (isSkippedHostname(hostname)) return undefined;
  return parsedUrl.toString();
}

function isSkippedHostname(hostname: string): boolean {
  return [...SKIP_HOSTNAMES].some((skipHostname) => {
    return hostname === skipHostname || hostname.endsWith(`.${skipHostname}`);
  });
}

function absoluteNitoUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

function isRelevantNitoPath(url: string): boolean {
  const parsedUrl = parseUrl(url);
  if (parsedUrl === undefined) return false;
  return parsedUrl.hostname === "www.nito.no" &&
    parsedUrl.pathname.startsWith("/medlemskap-og-fordeler/medlemsfordeler/") &&
    parsedUrl.pathname !== "/medlemskap-og-fordeler/medlemsfordeler/";
}

function slugFromUrl(url: string): string {
  const parsedUrl = parseUrl(url);
  if (parsedUrl === undefined) return "";
  const segments = parsedUrl.pathname.split("/").filter(Boolean);
  return segments.at(-1) ?? "";
}

function normalizeText(value: string): string {
  return value
    .replace(/\u00ad/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "");
}

function uniqueTextLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const uniqueLines: string[] = [];

  for (const line of lines) {
    const normalized = normalizeText(line);
    if (!normalized) continue;
    const key = normalizeKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueLines.push(normalized);
  }

  return uniqueLines;
}

function isScriptOrPageNoise(line: string, key: string): boolean {
  return key.length === 0 ||
    /^(?:meny|sok|søk|logginn|blimedlem|kontaktoss|forsiden|personvern|endrecookieinnstillinger)$/i.test(key) ||
    /^(?:window|document|function|const|let|var|return|if)\b/i.test(line) ||
    /^(?:org\.nr|facebook|instagram|linkedin)$/i.test(line);
}
