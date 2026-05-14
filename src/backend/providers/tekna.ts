// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
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

type TeknaCheerio = CheerioCrawlingContext["$"];

const LABEL_LIST = "list";
const LABEL_DETAIL = "detail";
const SITE_ORIGIN = "https://www.tekna.no";
const DEFAULT_TERMS = "Krever Tekna-medlemskap.";

const SKIP_HOSTNAMES = new Set([
  "tekna.no",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "googletagmanager.com",
  "trustpilot.com",
  "youtube.com",
  "google.com",
  "policy.app.cookieinformation.com",
  "cookieinformation.com",
]);

const EXCLUDED_NAME_FRAGMENTS = [
  "advokathjelp",
  "arbeidskontrakt",
  "bli medlem",
  "hvem kan bli medlem",
  "hvorfor velge tekna",
  "lonn",
  "lonnstatistikk",
  "tillitsvalgt",
];

export type CrawlTeknaInput = {
  startUrl: string;
  maxRequestsPerCrawl: number;
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

type TeknaEntry = {
  slug: string;
  name: string;
  sourceUrl: string;
  summary: string;
  reward: string;
  terms: string;
  domains: string[];
  children?: TeknaEntry[];
};

export async function crawlTekna(input: CrawlTeknaInput): Promise<CashbackOffer[]> {
  const entries = new Map<string, TeknaEntry>();

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

        $("a.t-article-card[href]").each((_, element) => {
          const href = $(element).attr("href") ?? "";
          const sourceUrl = absoluteTeknaUrl(href, input.startUrl);
          if (!isRelevantTeknaPath(sourceUrl)) return;

          const slug = slugFromUrl(sourceUrl);
          if (!slug || entries.has(slug)) return;

          const name = normalizeText($(element).find(".t-article-card__title").first().text());
          const summary = normalizeText($(element).find(".t-article-card__excerpt").first().text());
          if (!name || isExcluded(name)) return;

          entries.set(slug, {
            slug,
            name,
            sourceUrl,
            summary,
            reward: extractTeknaReward(`${name}\n${summary}`),
            terms: buildTerms(summary, []),
            domains: [],
          });
          detailUrls.push(sourceUrl);
        });

        input.logger.info(`Tekna: found ${entries.size} benefit cards, enqueueing detail pages`);
        await enqueueLinks({ urls: detailUrls, label: LABEL_DETAIL });
        return;
      }

      const slug = slugFromUrl(request.url);
      const entry = entries.get(slug);
      if (entry === undefined) return;

      const pageText = extractMainText($);
      const externalUrls = collectExternalUrls($);
      const detailReward = extractTeknaReward(`${entry.name}\n${entry.summary}\n${pageText}`);

      entry.domains = uniqueStrings([
        ...entry.domains,
        ...externalUrls.flatMap((url) => {
          const domain = extractExternalDomain(url);
          return domain === undefined ? [] : [domain];
        }),
        ...extractDomainsFromText(pageText),
      ]);
      entry.reward = bestReward(entry.reward, detailReward);
      entry.terms = buildTerms(entry.summary, pageText.split(/\n+/));
      if (entry.slug === "bilavtale") {
        entry.children = extractCarAgreementEntries($, entry);
      }
    },
  }, config);

  await crawler.run([{ url: input.startUrl, label: LABEL_LIST }]);

  const offers: CashbackOffer[] = [];
  let fromUrl = 0;
  let lookedUp = 0;
  let overrideCount = 0;

  for (const entry of [...entries.values()].flatMap((entry) => entry.children ?? [entry])) {
    let domains = (input.overrides.tekna?.[entry.slug] ?? []).map(normalizeDomainInput);
    if (domains.length > 0) {
      overrideCount++;
    }

    if (domains.length === 0 && entry.domains.length > 0) {
      domains = selectDomainsForEntry(entry.name, entry.domains);
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
      input.logger.warn(`Tekna offer has no domain: ${entry.name} (${entry.slug})`);
      continue;
    }

    offers.push({
      provider: "tekna",
      merchantName: entry.name,
      domains: uniqueStrings(domains),
      reward: entry.reward || "Medlemsfordel",
      sourceUrl: entry.sourceUrl,
      activationUrl: entry.sourceUrl,
      terms: entry.terms,
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`Tekna: resolved ${fromUrl} via detail URLs/text, ${lookedUp} via lookup, ${overrideCount} via overrides`);
  input.logger.info(`Tekna: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}

function extractMainText($: TeknaCheerio): string {
  const article = $("main, article, .article-page, .contentareablock").first();
  article.find("script, style, noscript, form, iframe, svg").remove();
  const html = article.length > 0 ? article.html() ?? "" : $("body").html() ?? "";
  return stripHtml(html)
    .split(/\n+/)
    .map(normalizeText)
    .filter(Boolean)
    .filter((line) => !/^(meny|sok|logg inn|bli medlem|kontakt oss)$/i.test(line))
    .join("\n");
}

function collectExternalUrls($: TeknaCheerio): string[] {
  const urls: string[] = [];
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href") ?? "";
    const absoluteUrl = normalizeExternalUrl(href);
    if (absoluteUrl !== undefined) urls.push(absoluteUrl);
  });
  return uniqueStrings(urls);
}

function extractCarAgreementEntries($: TeknaCheerio, parent: TeknaEntry): TeknaEntry[] {
  const entries: TeknaEntry[] = [];

  $(".tek-accordion").each((_, element) => {
    const accordion = $(element);
    accordion.find("script, style, noscript, form, iframe, svg").remove();

    const title = normalizeText(accordion.find(".tek-accordion__title").first().text());
    const content = accordion.find(".tek-accordion__content").first();
    const lines = uniqueTextLines(
      stripHtml(content.html() ?? "")
        .split(/\n+/)
        .map(normalizeText)
        .filter(Boolean),
    ).filter((line) => !isScriptOrPageNoise(line, normalizeKey(line)));

    if (!title || lines.length === 0) return;

    const sectionText = [title, ...lines].join("\n");
    const base = {
      sourceUrl: parent.sourceUrl,
      summary: parent.summary,
      terms: buildCarAgreementTerms(lines),
    };

    if (/bmw|mini/i.test(title)) {
      entries.push({
        ...base,
        slug: "bilavtale-bmw-mini",
        name: "BMW og MINI",
        domains: ["bmw.no", "mini.no"],
        reward: extractTeknaReward(sectionText) || "Medlemsfordel",
      });
      return;
    }

    if (/bilia|xpeng/i.test(title)) {
      entries.push({
        ...base,
        slug: "bilavtale-bilia-xpeng",
        name: "Bilia og XPENG",
        domains: ["bilia.no", "xpeng.com"],
        reward: extractTeknaReward(sectionText) || "Medlemsfordel",
      });
      return;
    }

    if (/rebil/i.test(title)) {
      entries.push({
        ...base,
        slug: "bilavtale-rebil",
        name: "Rebil",
        domains: ["rebil.no"],
        reward: extractTeknaReward(sectionText) || "Medlemsfordel",
      });
      return;
    }

    if (/gjensidige|bilforsikring/i.test(title)) {
      entries.push({
        ...base,
        slug: "bilavtale-gjensidige",
        name: "Gjensidige bilforsikring",
        domains: ["gjensidige.no"],
        reward: "Medlemspris",
      });
    }
  });

  return entries.length > 0 ? entries : [parent];
}

function buildCarAgreementTerms(lines: string[]): string {
  const terms = uniqueTextLines([
    ...lines.filter(isUsefulCarAgreementLine).slice(0, 8),
    DEFAULT_TERMS,
  ]);
  return terms.join("\n");
}

function isUsefulCarAgreementLine(line: string): boolean {
  const normalizedLine = normalizeText(line);
  if (normalizedLine.length < 12 || normalizedLine.length > 260) return false;
  if (isScriptOrPageNoise(normalizedLine, normalizeKey(normalizedLine))) return false;
  if (/^(?:bmw og mini|bilia|xpeng|rebil|bilforsikring)\b/i.test(normalizedLine)) return false;
  return /\b(?:rabatt|medlemsfordel|medlemspris|bilforsikring|bil kasko|veihjelp|leiebil|kundeutbytte|gjelder|vilkår|medlemsbevis|binding|service|verksted|dekk|felg|bruktbil|innbytte|salg|kjøp|leasing)\b/i.test(normalizedLine);
}

function extractTeknaReward(text: string): string {
  if (/\bhalv\s+pris\b/i.test(text)) return "50 %";

  const oreLitre = extractOreLitreReward(text);
  if (oreLitre) return oreLitre;

  const percentage = extractPercentageReward(relevantRewardText(text));
  if (percentage) return percentage;

  const kr = extractKrReward(text);
  if (kr) return kr;

  if (/\bgratis\b/i.test(text)) return "Gratis";
  if (/\bmedlemspris\b/i.test(text)) return "Medlemspris";
  if (hasDiscountWord(text)) return "?";

  return "";
}

function relevantRewardText(text: string): string {
  return text
    .split(/[\n.;]+/)
    .map(normalizeText)
    .filter((line) => {
      return /\b(?:rabatt(?:er)?|medlemsrabatt|besparelse|avslag|spar|tilbud|medlemspris)\b/i.test(line) ||
        /\bhalv\s+pris\b/i.test(line);
    })
    .join("\n");
}

function hasDiscountWord(text: string): boolean {
  return text.toLowerCase().includes("rabatt");
}

function bestReward(currentReward: string, nextReward: string): string {
  if (!currentReward) return nextReward;
  if (!nextReward) return currentReward;
  return rewardSpecificity(nextReward) >= rewardSpecificity(currentReward) ? nextReward : currentReward;
}

function rewardSpecificity(reward: string): number {
  if (/\d/.test(reward) && /%/.test(reward)) return 5;
  if (/\d/.test(reward) && /\bkr\//i.test(reward)) return 4;
  if (/\d/.test(reward) && /\bkr\b/i.test(reward)) return 3;
  if (/\d/.test(reward)) return 2;
  if (/^(?:rabatt|medlemspris)$/i.test(reward.trim())) return 0;
  return 1;
}

function buildTerms(summary: string, lines: string[]): string {
  return uniqueTextLines([
    summary,
    ...lines.filter(isUsefulTermsLine).slice(0, 5),
    DEFAULT_TERMS,
  ]).join("\n");
}

function isUsefulTermsLine(line: string): boolean {
  const normalizedLine = normalizeText(line);
  const key = normalizeKey(normalizedLine);

  return normalizedLine.length >= 12 &&
    normalizedLine.length <= 220 &&
    !isScriptOrPageNoise(normalizedLine, key) &&
    isBenefitTermsLine(normalizedLine);
}

function isBenefitTermsLine(line: string): boolean {
  return /\b(?:rabatt|rabatter|medlemsrabatt|medlemspris|halv\s+pris|besparelse|spar|avslag|gjelder|vilkår|bindingstid|begrenset|medlemskap|medlemsbevis|rabattkode)\b/i.test(line);
}

function isScriptOrPageNoise(line: string, key: string): boolean {
  return (
    /^(?:medlemsfordeler|relaterte artikler|postadresse|besøksadresse|besoksadresse|tekna|var\s+|const\s+|let\s+|if\s*\(|window\.|document\.|function\s*\(|return\b)/i.test(line) ||
    /(?:\{|\}|=>|querySelector|scrollIntoView|getElementById|window\.onload|utag_data|document\.location|split\(|script|cookie|cloudflare|google tag manager)/i.test(line) ||
    /^somteknamedlemfardutilgangtileksklusive/.test(key) ||
    /^(?:utforsk|finn din|besøk|besok|bestill|kom i gang|last ned)\b/i.test(line)
  );
}

function lookupNamesForEntry(entry: TeknaEntry): string[] {
  return uniqueTextLines([
    entry.name,
    entry.name.replace(/\s+-\s+.*$/, ""),
    entry.name.replace(/\b(?:mobilabonnement|videokurs|stromappen)\b/gi, ""),
    titleFromSlug(entry.slug),
  ]);
}

function selectDomainsForEntry(name: string, domains: string[]): string[] {
  const uniqueDomains = uniqueStrings(domains);
  if (uniqueDomains.length <= 1) return uniqueDomains;

  const nameKey = normalizeKey(name);
  const matchingDomains = uniqueDomains.filter((domain) => {
    const label = normalizeKey(domain.split(".")[0] ?? domain);
    return label.length > 0 && (nameKey.includes(label) || label.includes(nameKey));
  });

  return matchingDomains.length > 0 ? matchingDomains : uniqueDomains;
}

function extractDomainsFromText(text: string): string[] {
  const domains: string[] = [];
  for (const match of text.matchAll(/\b(?:[a-z0-9-]+\.)+(?:com|net|no|org|se|dk|fi)\b/gi)) {
    const domain = extractExternalDomain(match[0] ?? "");
    if (domain !== undefined) domains.push(domain);
  }
  return uniqueStrings(domains);
}

function extractExternalDomain(input: string): string | undefined {
  const url = normalizeExternalUrl(input);
  if (url === undefined) return undefined;

  const parsed = parseUrl(url);
  if (parsed === undefined) return undefined;

  const domain = normalizeDomainInput(parsed.hostname);
  return isSkippedHostname(domain) ? undefined : domain;
}

function normalizeExternalUrl(input: string): string | undefined {
  const trimmedInput = input.trim();
  if (!trimmedInput || trimmedInput.startsWith("#") || trimmedInput.startsWith("mailto:") || trimmedInput.startsWith("tel:")) {
    return undefined;
  }

  const parsed = parseUrl(trimmedInput) ??
    (trimmedInput.startsWith("//") ? parseUrl(`https:${trimmedInput}`) : undefined) ??
    (trimmedInput.includes(".") && !trimmedInput.startsWith("/") ? parseUrl(`https://${trimmedInput}`) : undefined);

  if (parsed === undefined) return undefined;
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;

  const domain = normalizeDomainInput(parsed.hostname);
  if (isSkippedHostname(domain)) return undefined;

  return parsed.toString();
}

function absoluteTeknaUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl || SITE_ORIGIN).toString();
  } catch {
    return href;
  }
}

function isRelevantTeknaPath(url: string): boolean {
  const parsed = parseUrl(url);
  if (parsed === undefined) return false;
  const hostname = normalizeDomainInput(parsed.hostname);
  return hostname === "tekna.no" &&
    /^\/(?:medlemsfordeler|aktuelt)\/[^/?#]+\/?$/i.test(parsed.pathname);
}

function slugFromUrl(url: string): string {
  const parsed = parseUrl(url);
  if (parsed === undefined) return "";
  return decodeURIComponent(parsed.pathname.replace(/\/+$/, "").split("/").pop() ?? "");
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
  return SKIP_HOSTNAMES.has(normalized) ||
    normalized.endsWith(".tekna.no") ||
    [...SKIP_HOSTNAMES].some((skipped) => normalized.endsWith(`.${skipped}`));
}

function isExcluded(name: string): boolean {
  const normalized = normalizeKey(name);
  return EXCLUDED_NAME_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function normalizeKey(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    laquo: "\"",
    nbsp: " ",
    ndash: "-",
    quot: "\"",
    raquo: "\"",
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
