// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
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
  extractOreLitreReward,
  extractPercentageReward,
  extractUpToPercentageReward,
} from "../../shared/reward.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

type ObosCheerio = CheerioCrawlingContext["$"];

const LABEL_LIST = "list";
const LABEL_DETAIL = "detail";
const DEFAULT_TERMS = "Krever OBOS-medlemskap.";
// "Medlemsfordel", "Medlemstilbud", "Medlemsfordeler" and Tryg's "Generell
// medlemsfordel" introduce the benefit; "Relaterte medlemsfordeler" does not.
function isMemberBenefitHeading(label: string): boolean {
  return /^(?:generelle?\s+)?medlems(?:fordel|tilbud)/.test(label);
}

const SKIP_HOSTNAMES = new Set([
  "obos.no",
  "google.com",
  "youtube.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "aka.ms",
  "apps.apple.com",
  "play.google.com",
  "clarity.microsoft.com",
  "microsoft.com",
  "safelinks.protection.outlook.com",
]);

const EXCLUDED_NAME_FRAGMENTS = [
  "obos bostart",
  "obos-banken",
  "oslobolig",
  "forkjøpsrett",
  "obos deleie",
  "obos eiendomsmeglere",
  "obos-ligaen",
  "nordlys",
];

function isExcluded(slug: string, name: string): boolean {
  const nameLower = name.toLowerCase();
  const slugLower = slug.toLowerCase();
  if (EXCLUDED_NAME_FRAGMENTS.some((f) => nameLower.includes(f))) return true;
  if (["kategori", "aktuelle-fordeler", "kalender"].includes(slugLower)) return true;
  if (nameLower.startsWith("se alle fordeler") || nameLower.startsWith("flere aktuelle")) return true;
  if (/^\d+\s*%\s+rabatt/i.test(nameLower)) return true;
  if (/^eksklusiv\s+rabatt/i.test(nameLower)) return true;
  if (/^\d+\s*kr\s+/i.test(nameLower)) return true;
  if (nameLower.includes("kampanje") || nameLower.includes("utsolgt")) return true;
  if (nameLower.includes("snart er obos") || nameLower.includes("reiselivsdager")) return true;
  if (nameLower.includes("planlegg med")) return true;
  return false;
}

function isSkippedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^www\./, "");
  return (
    SKIP_HOSTNAMES.has(lower) ||
    [...SKIP_HOSTNAMES].some((skipped) => lower.endsWith(`.${skipped}`)) ||
    lower.endsWith(".obos.no")
  );
}

function extractCtaUrl($: ObosCheerio): string | undefined {
  let ctaUrl: string | undefined;
  let firstUrl: string | undefined;

  $('a[href^="http"]').each((_, el): false | void => {
    const href = $(el).attr("href") ?? "";
    const externalUrl = normalizeExternalUrl(href);
    if (externalUrl === undefined) return;

    if (!firstUrl) firstUrl = externalUrl;
    const text = $(el).text().trim().toLowerCase();
    if (!ctaUrl && (text.includes("gå til") || text.includes("bestill") ||
        text.includes("kjøp") || text.includes("handle") || text.includes("book"))) {
      ctaUrl = externalUrl;
      return false;
    }
  });

  return ctaUrl ?? firstUrl;
}

// Pages can link a partner's sister business first (Hadeland Glassverk links
// Thorbjørnrud Hotell; Høyt & Lavt links its Swedish site). A link whose
// domain carries the merchant's name is the merchant's own shop.
function extractNameMatchedUrl($: ObosCheerio, name: string): string | undefined {
  const nameKey = nameMatchKey(name);
  if (nameKey.length < 4) return undefined;

  let matched: string | undefined;
  $('a[href^="http"]').each((_, el): false | void => {
    const externalUrl = normalizeExternalUrl($(el).attr("href") ?? "");
    const hostname = externalUrl === undefined ? undefined : parseUrl(externalUrl)?.hostname;
    if (hostname === undefined) return;
    const labels = normalizeDomainInput(hostname).split(".").slice(0, -1).map(nameMatchKey);
    if (labels.some((label) => label.length >= 4 && (nameKey.includes(label) || label.includes(nameKey)))) {
      matched = externalUrl;
      return false;
    }
  });
  return matched;
}

function nameMatchKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/[øö]/g, "o")
    .replace(/[åä]/g, "a")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeExternalUrl(value: string): string | undefined {
  const parsed = parseUrl(value) ?? parseUrl(`https://${value}`);
  if (parsed === undefined) return undefined;

  const unwrapped = parsed.searchParams.get("url") ?? parsed.searchParams.get("u");
  if (
    unwrapped &&
    normalizeDomainInput(parsed.hostname).endsWith("safelinks.protection.outlook.com")
  ) {
    return normalizeExternalUrl(unwrapped);
  }

  return isSkippedHostname(parsed.hostname) ? undefined : parsed.toString();
}

function extractDiscount($: ObosCheerio): string {
  // Prefer the actual detail content; related benefit cards can contain other percentages.
  const contentEl = $("main, article").first();
  const fullText = contentEl.length ? contentEl.text() : $("body").text();
  return extractDiscountFromText(trimRelatedBenefits(fullText));
}

function extractTerms($: ObosCheerio): string {
  const memberBenefitTerms = extractMemberBenefitTerms($);
  if (memberBenefitTerms) return memberBenefitTerms;

  const contentEl = $("main, article").first();
  const fullText = contentEl.length ? contentEl.text() : $("body").text();
  const sectionTerms = extractTermsFromText(fullText);
  if (sectionTerms) return sectionTerms;

  // Pages without a benefit heading (Eeffy) state it in the lead paragraph.
  const lead = normalizeTextLine($("h1").first().nextAll("p").first().text());
  return /\b(?:medlem|rabatt|spar)/i.test(lead) ? lead : "";
}

// The lines directly under the "Medlemsfordel" heading, before the next
// heading, state the benefit itself. Later sections are marketing copy ("Mange
// av kundene forteller at de sparer så mye som 50 prosent") whose numbers are
// not the member discount.
function extractMemberBenefitBlock($: ObosCheerio): string {
  const heading = findMemberBenefitHeading($);
  if (!heading.length) return "";

  const lines: string[] = [];
  let node = heading.next();
  while (node.length && !node.is("h1, h2, h3")) {
    lines.push(...extractTextLines($, node));
    node = node.next();
  }
  return lines.filter((line) => !/bonus-nivå/i.test(line)).join("\n");
}

function findMemberBenefitHeading($: ObosCheerio) {
  return $("h2, h3")
    .filter((_, el) => {
      const label = normalizeHeadingLabel($(el).text());
      return isMemberBenefitHeading(label);
    })
    .first();
}

function extractMemberBenefitTerms($: ObosCheerio): string {
  const heading = $("h2, h3")
    .filter((_, el) => {
      const label = normalizeHeadingLabel($(el).text());
      return isMemberBenefitHeading(label);
    })
    .first();

  if (!heading.length) return "";

  const lines = [normalizeTermHeading(heading.text())];
  let node = heading.next();

  while (node.length) {
    if (node.is("h1")) break;
    if (node.is("h2, h3")) {
      const headingText = normalizeTextLine(node.text());
      if (/^(slik|om\b|relaterte|relevante|flere aktuelle)/i.test(headingText)) break;
      if (headingText) lines.push(headingText.replace(/:$/, ""));
      node = node.next();
      continue;
    }
    lines.push(...extractTextLines($, node));
    node = node.next();
  }

  return uniqueTextLines(lines).join("\n");
}

function extractTermsFromText(text: string): string {
  const scopedText = trimRelatedBenefits(text);
  const startMatch = scopedText.match(/\b(?:medlemsfordel|medlemstilbud)\b/i);
  if (!startMatch || startMatch.index === undefined) return "";

  const afterStart = scopedText.slice(startMatch.index);
  const endMatch = afterStart.search(/slik får du rabatt|om [^\n]+|relaterte fordeler/i);
  const sectionText = endMatch === -1 ? afterStart : afterStart.slice(0, endMatch);

  return uniqueTextLines(
    sectionText
      .split(/\n+/)
      .map(normalizeTextLine)
      .filter(Boolean),
  ).join("\n");
}

function extractTextLines($: ObosCheerio, element: ReturnType<ObosCheerio>): string[] {
  if (element.is("script, style, svg, picture, img")) return [];

  if (element.is("ul, ol")) {
    const lines: string[] = [];
    element.children("li").each((_, li) => {
      const liElement = $(li);
      const text = normalizeTextLine(liElement.clone().children("ul, ol").remove().end().text());
      if (text) lines.push(text);
      liElement.children("ul, ol").each((__, nestedList) => {
        lines.push(...extractTextLines($, $(nestedList)));
      });
    });
    return lines;
  }

  if (element.is("li, p")) {
    const text = normalizeTextLine(element.text());
    return text ? [text] : [];
  }

  const children = element.children("p, ul, ol, li");
  if (children.length) {
    const lines: string[] = [];
    children.each((_, child) => {
      lines.push(...extractTextLines($, $(child)));
    });
    return lines;
  }

  const text = normalizeTextLine(element.text());
  return text ? [text] : [];
}

function normalizeTextLine(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeHeadingLabel(value: string): string {
  return normalizeTextLine(value).replace(/:$/, "").toLowerCase();
}

function normalizeTermHeading(value: string): string {
  const normalized = normalizeTextLine(value).replace(/:$/, "");
  return normalized || "Medlemsfordel";
}

function uniqueTextLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const uniqueLines: string[] = [];
  for (const line of lines) {
    const normalized = normalizeTextLine(line);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    uniqueLines.push(normalized);
  }
  return uniqueLines;
}

function extractDiscountFromText(rawText: string): string {
  // "Som OBOS-medlem sparer du 6000 kroner på energirådgivning" states the
  // saving like "spar 6000 kroner".
  const text = rawText.replace(/\bsparer\s+du\s+(?=(?:opptil\s+|inntil\s+)?(?:kr\.?\s*)?\d)/gi, "spar ");
  const percentage = extractPercentageReward(text);
  // "Opptil 20 % rabatt" is a maximum; a range already shows that it varies.
  if (percentage) return percentage.includes("-") ? percentage : extractUpToPercentageReward(text);
  // Hourly rates ("2110 kr per time (ordinær pris fra 2750 kr)") are prices,
  // and mixed with fixed prices they made a "999-2 110 kr" discount range.
  const withoutHourlyRates = text
    .split("\n")
    .filter((line) => !/\b(?:per\s+time|\/\s*time|timepris)\b/i.test(line))
    .join("\n");
  return extractOreLitreReward(text) || extractKrReward(withoutHourlyRates);
}

function trimRelatedBenefits(text: string): string {
  const relatedSectionMatch = text.search(
    /(?:relevante|relaterte|flere aktuelle)\s+medlemsfordeler/i,
  );

  const trimmed = relatedSectionMatch === -1 ? text : text.slice(0, relatedSectionMatch);

  // Strip lines mentioning "bonus-nivå" — OBOS uses this to describe a temporary registration
  // tier (e.g. "10 % bonus-nivå") that doesn't reflect the actual member benefit (20 %)
  return trimmed.split("\n").filter(line => !/bonus-nivå/i.test(line)).join("\n").trim();
}

function extractNextData($: ObosCheerio): unknown {
  const raw = $("#__NEXT_DATA__").first().text();
  if (!raw) return undefined;
  try { return JSON.parse(raw); } catch { return undefined; }
}

function readString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export type CrawlObosInput = {
  startUrl: string;
  maxRequestsPerCrawl: number;
  overrides: ProviderOverrides;
  generatedAt: string;
  logger: Logger;
};

export async function crawlObos(input: CrawlObosInput): Promise<CashbackOffer[]> {
  // Detail pages live under the list URL (https://www.obos.no/medlem/medlemsfordeler/<slug>).
  const listUrl = input.startUrl.replace(/[?#].*$/, "").replace(/\/+$/, "");
  const slugToName = new Map<string, string>();
  const slugToDiscount = new Map<string, string>();
  const slugToDomain = new Map<string, string>();
  const slugToTerms = new Map<string, string>();

  const storage = new MemoryStorage({ persistStorage: false });
  const config = new Configuration();
  config.useStorageClient(storage);

  const crawler = new CheerioCrawler({
    maxConcurrency: 4,
    maxRequestsPerCrawl: input.maxRequestsPerCrawl,
    requestHandler: async ({ $, enqueueLinks, request }) => {
      const label = request.label ?? LABEL_LIST;

      if (label === LABEL_LIST) {
        // Try __NEXT_DATA__ for the full benefit list
        const nextData = extractNextData($);
        if (isRecord(nextData)) {
          const props = isRecord(nextData.props) ? nextData.props : undefined;
          const pageProps = isRecord(props?.pageProps) ? props.pageProps : undefined;
          const benefits = Array.isArray(pageProps?.benefits) ? pageProps.benefits :
            Array.isArray(pageProps?.fordeler) ? pageProps.fordeler :
            Array.isArray(pageProps?.items) ? pageProps.items : [];

          for (const benefit of benefits) {
            if (!isRecord(benefit)) continue;
            const slug = readString(benefit.slug ?? benefit.slug_no ?? benefit.id);
            const name = readString(benefit.title ?? benefit.name ?? benefit.navn);
            if (!slug || !name || isExcluded(slug, name)) continue;
            slugToName.set(slug, name);
            const rawDiscount = readString(benefit.discount ?? benefit.rabatt ?? benefit.description);
            const discount = extractDiscountFromText(rawDiscount) || rawDiscount;
            if (discount) slugToDiscount.set(slug, discount);
          }
        }

        // Also extract slugs from HTML links in case __NEXT_DATA__ is empty/different
        $('a[href*="/medlem/medlemsfordeler/"]').each((_, el) => {
          const href = $(el).attr("href") ?? "";
          const match = href.match(/\/medlem\/medlemsfordeler\/([^/?#]+)/);
          if (!match || !match[1]) return;
          const slug = decodeURIComponent(match[1]);
          if (!slug || slug === "medlemsfordeler" || slugToName.has(slug)) return;
          const name = $(el).find("h2, h3, h4, h5").first().text().trim() ||
            $(el).find("img").first().attr("alt")?.trim() ||
            $(el).text().trim().split("\n")[0]?.trim() || "";
          if (!name || isExcluded(slug, name)) return;
          slugToName.set(slug, name);
          const allText = $(el).text();
          const discount = extractDiscountFromText(allText);
          if (discount) slugToDiscount.set(slug, discount);
        });

        // Also enqueue from next page if paginated
        await enqueueLinks({
          label: LABEL_LIST,
          selector: 'a[href*="?side="], a[rel="next"]',
        });

        // Enqueue detail pages for found slugs
        const detailUrls = [...slugToName.keys()].map(
          (slug) => `${listUrl}/${encodeURIComponent(slug)}`
        );
        for (const url of detailUrls) {
          await crawler.addRequests([{ url, label: LABEL_DETAIL }]);
        }
      } else if (label === LABEL_DETAIL) {
        const loadedUrl = request.loadedUrl ?? request.url;
        const match = loadedUrl.match(/\/medlem\/medlemsfordeler\/([^/?#]+)/);
        if (!match || !match[1]) return;
        const slug = decodeURIComponent(match[1]);

        // Try __NEXT_DATA__ on detail page
        const nextData = extractNextData($);
        let ctaUrl: string | undefined;
        if (isRecord(nextData)) {
          const props = isRecord(nextData.props) ? nextData.props : undefined;
          const pageProps = isRecord(props?.pageProps) ? props.pageProps : undefined;
          const benefit = isRecord(pageProps?.benefit) ? pageProps.benefit :
            isRecord(pageProps?.fordel) ? pageProps.fordel : undefined;
          if (benefit) {
            const urlVal = readString(benefit.ctaUrl ?? benefit.externalUrl ?? benefit.url ?? benefit.shopUrl);
            const externalUrl = normalizeExternalUrl(urlVal);
            if (externalUrl !== undefined) {
              ctaUrl = externalUrl;
            }
            // Read description from Next.js data — often contains the full multi-line discount text
            const desc = readString(
              benefit.description ?? benefit.ingress ?? benefit.tekst ??
              benefit.shortDescription ?? benefit.excerpt ?? benefit.summary
            );
            const discount = extractDiscountFromText(desc);
            if (discount) {
              slugToDiscount.set(slug, discount);
            }
          }
        }

        const pageName = slugToName.get(slug) ?? $("h1").first().text().trim();
        ctaUrl = extractNameMatchedUrl($, pageName) ?? ctaUrl ?? extractCtaUrl($);

        if (!ctaUrl && !slugToName.has(slug)) {
          const name = $("h1").first().text().trim();
          if (name && !isExcluded(slug, name)) {
            slugToName.set(slug, name);
          }
        }

        if (!slugToName.has(slug)) {
          const name = $("h1").first().text().trim();
          if (name && !isExcluded(slug, name)) slugToName.set(slug, name);
        }

        const discount = extractDiscountFromText(extractMemberBenefitBlock($)) || extractDiscount($);
        if (discount) slugToDiscount.set(slug, discount);
        const terms = extractTerms($);
        if (terms) slugToTerms.set(slug, terms);

        if (ctaUrl) {
          try {
            const domain = normalizeDomainInput(new URL(ctaUrl).hostname);
            if (domain) slugToDomain.set(slug, domain);
          } catch { /* skip */ }
        }
      }
    },
  }, config);

  await crawler.run([{ url: `${input.startUrl}?view=list`, label: LABEL_LIST }]);

  input.logger.info(`OBOS: crawled ${slugToName.size} benefits, extracted ${slugToDomain.size} domains`);

  // Apply provider-overrides (always override extracted domain if present)
  let overrideCount = 0;
  for (const [slug, overrideDomains] of Object.entries(input.overrides.obos)) {
    const firstOverride = overrideDomains[0];
    if (firstOverride) {
      slugToDomain.set(slug, normalizeDomainInput(firstOverride));
      if (!slugToName.has(slug)) {
        slugToName.set(slug, slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
      }
      overrideCount++;
    }
  }
  if (overrideCount > 0) {
    input.logger.info(`OBOS: applied ${overrideCount} overrides`);
  }

  const offers: CashbackOffer[] = [];
  for (const [slug, name] of slugToName) {
    const domain = slugToDomain.get(slug);
    if (!domain) {
      input.logger.warn(`OBOS offer has no domain: ${name} (${slug})`);
      continue;
    }

    const sourceUrl = `${listUrl}/${encodeURIComponent(slug)}`;
    const terms = slugToTerms.get(slug) ?? DEFAULT_TERMS;
    const reward = slugToDiscount.get(slug) ?? extractDiscountFromText(terms);

    offers.push({
      provider: "obos",
      merchantName: name,
      domains: uniqueStrings([domain]),
      reward,
      sourceUrl,
      activationUrl: sourceUrl,
      terms,
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`OBOS: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}
