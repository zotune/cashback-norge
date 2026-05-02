import { CheerioCrawler, type CheerioCrawlingContext, Configuration, MemoryStorage } from "crawlee";
import {
  type CashbackOffer,
  isRecord,
  normalizeDomainInput,
  parseUrl,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import { extractPercentageReward } from "../../shared/reward.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

type ObosCheerio = CheerioCrawlingContext["$"];

const LIST_URL = "https://www.obos.no/medlem/medlemsfordeler";
const LABEL_LIST = "list";
const LABEL_DETAIL = "detail";

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

function extractDiscountFromText(text: string): string {
  const percentageReward = extractPercentageReward(text);
  const krMatches = [...text.matchAll(/(\d+)\s*kr\s+(?:i\s+)?rabatt/gi)];

  if (percentageReward === "" && krMatches.length === 0) return "";

  if (percentageReward !== "") return percentageReward;

  return (krMatches[0]?.[0] ?? "").trim();
}

function trimRelatedBenefits(text: string): string {
  const relatedSectionMatch = text.search(
    /(?:relevante|relaterte|flere aktuelle)\s+medlemsfordeler/i,
  );

  return relatedSectionMatch === -1 ? text : text.slice(0, relatedSectionMatch);
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
  const slugToName = new Map<string, string>();
  const slugToDiscount = new Map<string, string>();
  const slugToDomain = new Map<string, string>();

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
          (slug) => `${LIST_URL}/${encodeURIComponent(slug)}`
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

        if (!ctaUrl) {
          ctaUrl = extractCtaUrl($);
        }

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

        const discount = extractDiscount($);
        if (discount) slugToDiscount.set(slug, discount);

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

  // Apply provider-overrides for slugs without extracted domains
  let fallbackCount = 0;
  for (const [slug, overrideDomains] of Object.entries(input.overrides.obos)) {
    const firstOverride = overrideDomains[0];
    if (!slugToDomain.has(slug) && firstOverride) {
      slugToDomain.set(slug, normalizeDomainInput(firstOverride));
      if (!slugToName.has(slug)) {
        slugToName.set(slug, slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
      }
      fallbackCount++;
    }
  }
  if (fallbackCount > 0) {
    input.logger.info(`OBOS: applied ${fallbackCount} overrides`);
  }

  const offers: CashbackOffer[] = [];
  for (const [slug, name] of slugToName) {
    const domain = slugToDomain.get(slug);
    if (!domain) {
      input.logger.warn(`OBOS offer has no domain: ${name} (${slug})`);
      continue;
    }

    const sourceUrl = `${LIST_URL}/${encodeURIComponent(slug)}`;
    const reward = slugToDiscount.get(slug) ?? "";

    offers.push({
      provider: "obos",
      merchantName: name,
      domains: uniqueStrings([domain]),
      reward,
      sourceUrl,
      activationUrl: sourceUrl,
      terms: "Krever OBOS-medlemskap.",
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`OBOS: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}
