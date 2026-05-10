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
const DETAIL_CONCURRENCY = 30;

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
  /** Rich description from the detail page (for tooltip / terms) */
  richDescription: string;
  /** Subtitle from the detail page */
  subtitle: string;
  /** Location / city */
  location: string;
  /** Category */
  category: string;
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

  for (const raw of rawOffers) {
    let reward = parseReward(raw.badgeText, raw.description, raw.richDescription);
    // If no specific reward could be parsed, show "?"
    if (!reward) {
      reward = "?";
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
      continue;
    }

    // Build rich terms from detail page info
    const termsParts: string[] = [];
    if (raw.subtitle) termsParts.push(raw.subtitle);
    if (raw.richDescription) {
      // Truncate to reasonable length for tooltip display
      const desc = raw.richDescription.length > 800
        ? raw.richDescription.slice(0, 800).replace(/\n[^\n]*$/, "") + "…"
        : raw.richDescription;
      termsParts.push(desc);
    }
    if (raw.location) termsParts.push(`📍 ${raw.location}`);
    if (raw.category) termsParts.push(`🏷️ ${raw.category}`);
    const terms = termsParts.length > 0
      ? termsParts.join("\n\n")
      : DEFAULT_TERMS;

    offers.push({
      provider: "studenttorget",
      merchantName: raw.name,
      domains: uniqueStrings(domains),
      reward,
      sourceUrl: raw.sourceUrl,
      activationUrl: raw.sourceUrl,
      terms,
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(
    `StudentTorget: ${directCount} via website, ${lookupCount} via lookup, ${overrideCount} via overrides`,
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
  const PAGE_CONCURRENCY = 10;
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

  // Deduplicate by slug+id
  const byKey = new Map<string, RawOffer>();
  for (const offer of allOffers) {
    const key = `${offer.slug}/${offer.id}`;
    if (!byKey.has(key)) {
      byKey.set(key, offer);
    }
  }

  return [...byKey.values()];
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
  const seen = new Set<string>();

  // Format 1: Rich cards (cp_vacancy_block) — pages 1-10
  const blocks = html.split(/<div class="cp_vacancy_block"/).slice(1);
  for (const block of blocks) {
    const hrefMatch = block.match(/href="\/studentrabatt\/([^/]+)\/(\d+)"/);
    if (!hrefMatch) continue;
    const slug = hrefMatch[1]!;
    const id = hrefMatch[2]!;
    const key = `${slug}/${id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const nameMatch = block.match(
      /cp_vacancies_content_item_title[\s\S]*?<a[^>]*>([^<]+)<\/a>/,
    );
    const rawName = nameMatch?.[1]?.replace(/\s*[-–]\s*Studentrabatt\s*$/i, "").trim() ?? "";
    if (!rawName) continue;

    const badgeMatch = block.match(
      /cp_vacancy_image__label(?!__label_cnt)[^>]*>\s*([^<\s][^<]*?)\s*<\/div>/,
    );
    const badgeText = badgeMatch?.[1]?.trim() ?? "";

    const descMatch = block.match(
      /cp_vacancies_content_item_description[^>]*>\s*([\s\S]*?)\s*<\/div>/,
    );
    const description = descMatch
      ? descMatch[1]!.replace(/<[^>]+>/g, " ").trim()
      : "";

    offers.push({
      slug, id,
      name: decodeHtmlEntities(rawName),
      badgeText: decodeHtmlEntities(badgeText),
      sourceUrl: `${BASE_URL}/studentrabatt/${slug}/${id}`,
      websiteUrl: "",
      description: decodeHtmlEntities(description),
      richDescription: "", subtitle: "", location: "", category: "",
    });
  }

  // Format 2: Simple text links (discount-box-unprofiled) — pages 11+
  const unprofiledPattern =
    /discount-box-unprofiled[\s\S]*?href="\/studentrabatt\/([^/]+)\/(\d+)"[^>]*>\s*([\s\S]*?)\s*<\/a>/g;
  for (const m of html.matchAll(unprofiledPattern)) {
    const slug = m[1]!;
    const id = m[2]!;
    const key = `${slug}/${id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const rawName = m[3]!
      .replace(/<[^>]+>/g, "")
      .replace(/\s*[-–]\s*Studentrabatt\s*$/i, "")
      .trim();
    if (!rawName) continue;

    offers.push({
      slug, id,
      name: decodeHtmlEntities(rawName),
      badgeText: "",
      sourceUrl: `${BASE_URL}/studentrabatt/${slug}/${id}`,
      websiteUrl: "",
      description: "",
      richDescription: "", subtitle: "", location: "", category: "",
    });
  }

  return offers;
}

async function enrichDetails(offers: RawOffer[], logger: Logger): Promise<void> {
  let completed = 0;

  async function enrich(offer: RawOffer): Promise<void> {
    try {
      const html = await fetchHtml(offer.sourceUrl);
      const info = extractDetailPageInfo(html);

      // Set website URL: prefer globe link, then blue-button, then first external link
      offer.websiteUrl = info.globeUrl || info.blueButtonUrl || info.fallbackUrl || "";

      // Rich description for tooltip / terms
      offer.richDescription = info.richDescription;
      offer.subtitle = info.subtitle;
      offer.location = info.location;
      offer.category = info.category;

      // If no badge from listing, try to extract reward from detail page
      if (!offer.badgeText && info.subtitle) {
        offer.description = info.subtitle;
      }
      if (!offer.badgeText && !offer.description && info.richDescription) {
        offer.description = info.richDescription;
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

type DetailPageInfo = {
  globeUrl: string;
  blueButtonUrl: string;
  fallbackUrl: string;
  richDescription: string;
  subtitle: string;
  location: string;
  category: string;
};

function extractDetailPageInfo(html: string): DetailPageInfo {
  // 1. Extract the main content block to avoid matching cookie consent etc.
  const mainBlock = html.match(
    /class="job-main-info-block">([\s\S]*?)(?:<div class="cp-info-right-block"|<div class="job-related)/,
  )?.[1] ?? "";

  // 2. Blue button URL (inside the main content block only)
  let blueButtonUrl = "";
  const blueBtn = mainBlock.match(
    /<a[^>]+class="[^"]*blue-button[^"]*"[^>]+href="(https?:\/\/[^"]+)"[^>]*>/i,
  );
  if (blueBtn?.[1]) {
    blueButtonUrl = blueBtn[1].replace(/&amp;/g, "&");
  }

  // 3. Globe URL from the right sidebar (cp-info-right-block)
  let globeUrl = "";
  const rightBlock = html.match(
    /class="cp-info-right-block">([\s\S]*?)<\/div>\s*<\/div>/,
  )?.[1] ?? "";
  const globeLink = rightBlock.match(
    /fa-globe[\s\S]{0,300}<a[^>]+href="(https?:\/\/[^"]+)"/i,
  );
  if (globeLink?.[1]) {
    globeUrl = globeLink[1].replace(/&amp;/g, "&");
  }

  // 4. Fallback: first external link in the main content block
  let fallbackUrl = "";
  const firstExternal = mainBlock.match(
    /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>/i,
  );
  if (firstExternal?.[1]) {
    const url = firstExternal[1].replace(/&amp;/g, "&");
    try {
      const host = new URL(url).hostname;
      if (!/studenttorget|facebook|instagram|twitter|google|linkedin/i.test(host)) {
        fallbackUrl = url;
      }
    } catch { /* ignore */ }
  }

  // 5. Rich description from jobad-info-block
  let richDescription = "";
  const infoBlock = html.match(
    /class="jobad-info-block"[^>]*>\s*<div>([\s\S]*?)<\/div>\s*<\/div>/,
  );
  if (infoBlock?.[1]) {
    richDescription = infoBlock[1]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&aring;/g, "å")
      .replace(/&oslash;/g, "ø")
      .replace(/&aelig;/g, "æ")
      .replace(/&Aring;/g, "Å")
      .replace(/&Oslash;/g, "Ø")
      .replace(/&Aelig;/g, "Æ")
      .replace(/&eacute;/g, "é")
      .replace(/&ndash;/g, "–")
      .replace(/&mdash;/g, "—")
      .replace(/&acute;/g, "'")
      .replace(/&#\d+;/g, (m) => {
        const code = Number(m.slice(2, -1));
        return String.fromCharCode(code);
      })
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // 6. Subtitle
  let subtitle = "";
  const subtitleMatch = html.match(
    /<h2 class="jobad-subtitle"[^>]*>\s*([\s\S]*?)\s*<\/h2>/i,
  );
  if (subtitleMatch?.[1]) {
    subtitle = subtitleMatch[1].replace(/<[^>]+>/g, "").trim();
    subtitle = decodeHtmlEntities(subtitle);
  }

  // 7. Location from facts
  let location = "";
  const locMatch = html.match(
    /item-info-title">Sted<\/div>\s*<div class="item-info-content">\s*([\s\S]*?)\s*<\/div>/,
  );
  if (locMatch?.[1]) {
    // Extract all location names
    const locs = [...locMatch[1].matchAll(/>([^<]+)<\/a>/g)].map((m) => m[1]!.trim());
    location = locs.join(", ");
  }

  // 8. Category
  let category = "";
  const catMatch = html.match(
    /item-info-title">Kategori<\/div>\s*<div class="item-info-content">\s*([\s\S]*?)\s*<\/div>/,
  );
  if (catMatch?.[1]) {
    const cats = [...catMatch[1].matchAll(/>([^<]+)<\/a>/g)].map((m) => m[1]!.trim());
    category = cats.join(", ");
  }

  return { globeUrl, blueButtonUrl, fallbackUrl, richDescription, subtitle, location, category };
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
function parseReward(badgeText: string, description: string, richDescription: string = ""): string {
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

  // Try short description first, then rich description from detail page
  for (const text of [description, richDescription]) {
    if (!text) continue;

    const textLower = text.toLowerCase();
    const isOpptil = textLower.includes("opptil") || textLower.includes("opp til");

    const pct = extractPercentageReward(text);
    if (pct) {
      return isOpptil ? `opptil ${pct}` : pct;
    }

    // kr discount (e.g. "200 kr i rabatt")
    const krDiscount = extractKrReward(text);
    if (krDiscount) return krDiscount;

    // Fixed price in text: "Kun 110 kr", "2690,-", "studentpris: 499,-"
    const fixedPriceMatch = text.match(/(?:kun|studentpris|pris)[:\s]+(?:kr\.?\s*)?(\d[\d\s]*)(?:,[-–]|,-|\s*kr)\b/i);
    if (fixedPriceMatch) {
      const value = fixedPriceMatch[1]!.replace(/\s/g, "");
      return `${value} kr totalsum`;
    }
  }

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
