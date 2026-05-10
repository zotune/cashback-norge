import { gotScraping } from "crawlee";
import {
  type CashbackOffer,
  normalizeDomainInput,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import { extractPercentageReward, extractKrReward } from "../../shared/reward.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const BASE_URL = "https://studenttorget.no";
const LIST_URL = `${BASE_URL}/studentrabatter`;
const DEFAULT_TERMS = "Krever registrering på studenttorget.no (gratis).";
const DETAIL_CONCURRENCY = 8;

const SKIP_HOSTNAMES = new Set([
  "studenttorget.no",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "google.com",
  "youtube.com",
  "apps.apple.com",
  "play.google.com",
  "linkedin.com",
  "karrierestart.no",
  "studievalg.no",
  "campus.no",
]);

export type CrawlStudentTorgetInput = {
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
  overrides: ProviderOverrides;
};

type RawOffer = {
  slug: string;
  id: string;
  name: string;
  badgeText: string;
  sourceUrl: string;
  websiteUrl: string;
  description: string;
};

export async function crawlStudentTorget(
  input: CrawlStudentTorgetInput,
): Promise<CashbackOffer[]> {
  input.logger.info("StudentTorget: fetching listing pages...");

  const rawOffers = await fetchAllListingOffers(input.logger);
  input.logger.info(`StudentTorget: found ${rawOffers.length} offers on listing pages`);

  await enrichDetails(rawOffers, input.logger);

  const offers: CashbackOffer[] = [];
  let lookupCount = 0;
  let overrideCount = 0;
  let directCount = 0;
  let skippedNoReward = 0;

  for (const raw of rawOffers) {
    const reward = parseReward(raw.badgeText, raw.description);
    if (!reward) {
      skippedNoReward++;
      continue;
    }

    const overrideDomains = input.overrides.studenttorget?.[raw.slug] ?? [];
    let domains = overrideDomains.map(normalizeDomainInput);
    if (domains.length > 0) {
      overrideCount++;
    }

    if (domains.length === 0 && raw.websiteUrl) {
      try {
        const hostname = new URL(raw.websiteUrl).hostname.replace(/^www\./, "");
        if (!SKIP_HOSTNAMES.has(hostname)) {
          domains = [hostname];
          directCount++;
        }
      } catch {
        // ignore malformed URL
      }
    }

    if (domains.length === 0) {
      domains = lookupDomains(input.domainLookup, raw.name);
      if (domains.length > 0) lookupCount++;
    }

    if (domains.length === 0) {
      input.logger.warn(`StudentTorget: no domain for "${raw.name}" (${raw.slug})`);
      continue;
    }

    offers.push({
      provider: "studenttorget",
      merchantName: raw.name,
      domains: uniqueStrings(domains),
      reward,
      sourceUrl: raw.sourceUrl,
      activationUrl: raw.sourceUrl,
      terms: DEFAULT_TERMS,
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(
    `StudentTorget: ${directCount} via website, ${lookupCount} via lookup, ${overrideCount} via overrides, ${skippedNoReward} skipped (no reward)`,
  );
  input.logger.info(`StudentTorget: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}

async function fetchAllListingOffers(logger: Logger): Promise<RawOffer[]> {
  // Fetch first page to determine total pages
  const firstHtml = await fetchHtml(LIST_URL);
  const totalPages = extractTotalPages(firstHtml);
  logger.info(`StudentTorget: ${totalPages} listing pages`);

  const allOffers = extractListingOffers(firstHtml);

  // Fetch remaining pages in parallel batches
  const PAGE_CONCURRENCY = 5;
  for (let page = 2; page <= totalPages; page += PAGE_CONCURRENCY) {
    const batch = [];
    for (let p = page; p < page + PAGE_CONCURRENCY && p <= totalPages; p++) {
      batch.push(fetchHtml(`${LIST_URL}?page=${p}`));
    }
    const htmlPages = await Promise.all(batch);
    for (const html of htmlPages) {
      allOffers.push(...extractListingOffers(html));
    }
  }

  // Deduplicate by slug
  const bySlug = new Map<string, RawOffer>();
  for (const offer of allOffers) {
    if (!bySlug.has(offer.slug)) {
      bySlug.set(offer.slug, offer);
    }
  }

  return [...bySlug.values()];
}

function extractTotalPages(html: string): number {
  // 1. Prøv å lese totalantall fra "Viser XXXX"
  const totalMatch = html.match(/Viser\s+(\d{2,5})/i);
  let totalOffers = totalMatch ? Number(totalMatch[1]) : 0;
  // 2. Finn antall tilbud per side (tell antall offer-blokker på første side)
  const perPage = (html.match(/<div class="cp_vacancy_block"/g) || []).length;
  if (totalOffers && perPage) {
    return Math.ceil(totalOffers / perPage);
  }
  // 3. Fallback: Links like href="/studentrabatter?page=75"
  const matches = [...html.matchAll(/studentrabatter\?page=(\d+)/g)];
  if (matches.length === 0) return 1;
  return Math.max(...matches.map((m) => Number(m[1])));
}

function extractListingOffers(html: string): RawOffer[] {
  const offers: RawOffer[] = [];

  // Match each offer block: cp_vacancy_block
  const blockPattern = /<div class="cp_vacancy_block"[\s\S]*?(?=<div class="cp_vacancy_block"|<\/div>\s*<\/div>\s*<\/div>\s*<div id=")|<div class="cp_vacancy_block"[\s\S]*?(?=<div id="pagination|$)/g;

  // Simpler: parse slug+id+badge+name from each offer card
  // Each card has: href="/studentrabatt/{slug}/{id}" and optionally a badge label
  const cardPattern =
    /<div class="cp_vacancy_block"[^>]*>([\s\S]*?)(?=<div class="cp_vacancy_block"|<div id="f-search-results|$)/g;

  for (const cardMatch of html.matchAll(cardPattern)) {
    const card = cardMatch[1]!;

    // Extract slug and ID from href
    const hrefMatch = card.match(/href="\/studentrabatt\/([^/]+)\/(\d+)"/);
    if (!hrefMatch) continue;
    const slug = hrefMatch[1]!;
    const id = hrefMatch[2]!;

    // Extract merchant name from title link
    const nameMatch = card.match(
      /cp_vacancies_content_item_title[\s\S]*?<a[^>]*>([^<]+)<\/a>/,
    );
    const rawName = nameMatch?.[1]?.replace(/\s*[-–]\s*Studentrabatt\s*$/i, "").trim() ?? "";
    if (!rawName) continue;

    // Extract reward badge text (inside cp_vacancy_image__label but NOT the icon-discount div)
    const badgeMatch = card.match(
      /cp_vacancy_image__label(?!__label_cnt)[^>]*>\s*([^<\s][^<]*?)\s*<\/div>/,
    );
    const badgeText = badgeMatch?.[1]?.trim() ?? "";

    // Extract description snippet
    const descMatch = card.match(
      /cp_vacancies_content_item_description[^>]*>\s*([\s\S]*?)\s*<\/div>/,
    );
    const description = descMatch
      ? descMatch[1]!.replace(/<[^>]+>/g, " ").trim()
      : "";

    offers.push({
      slug,
      id,
      name: decodeHtmlEntities(rawName),
      badgeText: decodeHtmlEntities(badgeText),
      sourceUrl: `${BASE_URL}/studentrabatt/${slug}/${id}`,
      websiteUrl: "",
      description: decodeHtmlEntities(description),
    });
  }

  return offers;
}

async function enrichDetails(offers: RawOffer[], logger: Logger): Promise<void> {
  let completed = 0;

  async function enrich(offer: RawOffer): Promise<void> {
    try {
      const html = await fetchHtml(offer.sourceUrl);
      const info = extractWebsiteInfo(html);
      // Log all external links for debugging
      if (info.allExternalLinks.length > 0) {
        logger.info(`[StudentTorget] ${offer.slug}: Eksterne lenker: ` + info.allExternalLinks.map(l => `${l.url} [${l.anchor}]`).join(", "));
      }
      // Prefer mainDomain, fallback to bookingUrl
      offer.websiteUrl = info.mainDomain || info.bookingUrl || "";
      // Optionally: store bookingUrl separately for tooltip (not in RawOffer yet)
      // Tooltip-data: phone, address, openingHours kan også lagres her om ønskelig
      // Use h2 description for richer reward text if badge is empty
      if (!offer.badgeText) {
        const h2Match = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
        if (h2Match) {
          offer.description = decodeHtmlEntities(
            h2Match[1]!.replace(/<[^>]+>/g, " ").trim(),
          );
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.warn(`StudentTorget detail failed for ${offer.slug}: ${message}`);
    } finally {
      completed++;
      process.stdout.write(
        `\r  StudentTorget detail ${completed}/${offers.length}: ${offer.slug.slice(0, 50)}  `,
      );
    }
  }

  for (let i = 0; i < offers.length; i += DETAIL_CONCURRENCY) {
    await Promise.all(offers.slice(i, i + DETAIL_CONCURRENCY).map(enrich));
  }

  if (offers.length > 0) process.stdout.write("\n");
}

// Extract both main domain (fa-globe) and booking/secondary (blue button) links, plus tooltip info
export type StudentTorgetExtractedLinks = {
  mainDomain?: string;
  bookingUrl?: string;
  fallbackUrl?: string;
  allExternalLinks: { url: string; anchor: string }[];
  phone?: string;
  address?: string;
  openingHours?: string;
};

function extractWebsiteInfo(html: string): StudentTorgetExtractedLinks {
  const IRRELEVANT_TEXTS = [
    "les mer", "mer info", "se mer", "logg inn", "registrer", "betingelser", "kontakt", "vilkår", "personvern", "om oss", "facebook", "instagram", "twitter", "linkedin", "google", "app store", "play store", "youtube", "snapchat", "tiktok", "faq", "ofte stilte spørsmål", "support", "hjelp", "min side", "min profil", "nyhetsbrev", "abonner", "del", "share", "read more", "more info", "see more", "login", "register", "terms", "privacy", "about", "contact"
  ];
  function isIrrelevantText(text: string) {
    const t = text.trim().toLowerCase();
    return IRRELEVANT_TEXTS.some((s) => t === s || t.startsWith(s + " ") || t.endsWith(" " + s));
  }
  // 1. Main domain (fa-globe)
  let mainDomain: string | undefined;
  const globeMatch = html.match(/fa-globe[\s\S]{0,200}<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
  if (globeMatch?.[1]) {
    const anchorText = globeMatch[2]?.replace(/<[^>]+>/g, "").trim() || "";
    if (!isIrrelevantText(anchorText)) {
      mainDomain = globeMatch[1].replace(/&amp;/g, "&");
    }
  }
  // 2. Booking/blue button (first .blue-button)
  let bookingUrl: string | undefined;
  const btnMatch = html.match(/<a[^>]+class="[^"]*blue-button[^"]*"[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
  if (btnMatch?.[1]) {
    const anchorText = btnMatch[2]?.replace(/<[^>]+>/g, "").trim() || "";
    if (!isIrrelevantText(anchorText)) {
      bookingUrl = btnMatch[1].replace(/&amp;/g, "&");
    }
  }
  // 3. All external links (for debugging/tooltip)
  const allExternalLinks: { url: string; anchor: string }[] = [];
  const allLinks = [...html.matchAll(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  for (const l of allLinks) {
    const url = l[1];
    if (!url) continue;
    if (/studenttorget|facebook|instagram|twitter|google|linkedin|karrierestart|studievalg|campus/i.test(url)) continue;
    const anchorText = l[2]?.replace(/<[^>]+>/g, "").trim() || "";
    if (isIrrelevantText(anchorText)) continue;
    allExternalLinks.push({ url: url.replace(/&amp;/g, "&"), anchor: anchorText });
  }
  // 4. fallbackUrl: always present, even if undefined
  let fallbackUrl: string | undefined = undefined;
  // (If you want to set fallbackUrl to e.g. first valid external link, do it here)

  // 5. Phone
  let phone: string | undefined;
  const phoneMatch = html.match(/fa-phone[\s\S]{0,100}<span[^>]*>([\d\s\-+()]{6,})<\/span>/i);
  if (phoneMatch?.[1]) phone = phoneMatch[1].trim();
  // 6. Address
  let address: string | undefined;
  const addrMatch = html.match(/fa-map-marker[\s\S]{0,100}<span[^>]*>([\s\S]*?)<\/span>/i);
  if (addrMatch?.[1]) address = addrMatch[1].replace(/<[^>]+>/g, "").trim();
  // 7. Opening hours (look for Åpningstider or similar)
  let openingHours: string | undefined;
  const openMatch = html.match(/<strong>Åpningstider<\/strong>\s*<p>([\s\S]*?)<\/p>/i);
  if (openMatch?.[1]) openingHours = openMatch[1].replace(/<[^>]+>/g, "").trim();
  return { mainDomain, bookingUrl, fallbackUrl, allExternalLinks, phone, address, openingHours };
}

/**
 * Parse the reward from the listing badge text and/or the description.
 *
 * Badge examples (from listing card labels):
 *   "20%"      → "20 %" (percentage discount)
 *   "-50%"     → "50 %"
 *   "OPPTIL -30%" → "opptil 30 %"
 *   "45,-"     → "45 kr totalsum"  (fixed price, NOT a discount)
 *   "499,-"    → "499 kr totalsum"
 *   "SYNSPRØVE: 430,-" → "430 kr totalsum"
 *   "Studentpris 170 kr" → "170 kr totalsum"
 *   "STUDENTRABATT!" → fall through to description
 *
 * Uses shared reward functions from src/shared/reward.ts so calculation
 * logic is not duplicated.
 */
function parseReward(badgeText: string, description: string): string {
  if (badgeText && !/^studentrabatt!?$/i.test(badgeText)) {
    const badge = badgeText.trim();

    // Check for percentage discount first
    const lower = badge.toLowerCase();
    const isOpptil = lower.includes("opptil") || lower.includes("opp til");
    const pct = extractPercentageReward(badge);
    if (pct) {
      return isOpptil ? `opptil ${pct}` : pct;
    }

    // kr-discount from badge (e.g. "Spar 200 kr" style)
    const krDiscount = extractKrReward(`${badge} rabatt`);
    if (krDiscount) return krDiscount;

    // Fixed price patterns: "45,-", "499,-", "499 kr", "170 kr", "430,-"
    const fixedMatch = badge.match(/(\d[\d\s]*)(?:,[-–]|,-|kr)\s*$/i);
    if (fixedMatch) {
      const value = fixedMatch[1]!.replace(/\s/g, "");
      return `${value} kr totalsum`;
    }

    // "SYNSPRØVE: 430,-" or "Studentpris 170 kr"
    const priceInBadge = badge.match(/(\d{2,})\s*(?:kr|,-|,-)?\s*$/i);
    if (priceInBadge) {
      return `${priceInBadge[1]} kr totalsum`;
    }
  }

  // Fall through to description text
  if (!description) return "";

  const descLower = description.toLowerCase();
  const isOpptil = descLower.includes("opptil") || descLower.includes("opp til");

  const pct = extractPercentageReward(description);
  if (pct) {
    return isOpptil ? `opptil ${pct}` : pct;
  }

  // kr discount from description (e.g. "200 kr i rabatt")
  const krDiscount = extractKrReward(description);
  if (krDiscount) return krDiscount;

  return "";
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/&aring;/g, "å")
    .replace(/&oslash;/g, "ø")
    .replace(/&aelig;/g, "æ")
    .replace(/&Aring;/g, "Å")
    .replace(/&Oslash;/g, "Ø")
    .replace(/&Aelig;/g, "Æ")
    .replace(/&eacute;/g, "é")
    .replace(/&nbsp;/g, " ");
}

async function fetchHtml(url: string): Promise<string> {
  const response = await gotScraping(url, {
    responseType: "text",
    throwHttpErrors: false,
    timeout: { request: 30_000 },
    followRedirect: true,
    headers: {
      "Accept-Language": "nb-NO,nb;q=0.9",
    },
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(
      `StudentTorget returned ${response.statusCode} for ${url}`,
    );
  }

  return response.body;
}
