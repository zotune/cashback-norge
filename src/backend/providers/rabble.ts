// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import { gotScraping } from "crawlee";
import {
  type CashbackOffer,
  normalizeDomainInput,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import { extractKrReward, extractPercentageReward } from "../../shared/reward.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const BASE_URL = "https://www.rabble.no";
const DETAIL_CONCURRENCY = 6;
const BOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

export type CrawlRabbleInput = {
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

type RabbleBrand = {
  name: string;
  reward: string;
  detailPath: string;
  slug: string;
};

type RabbleDetail = {
  description: string;
  keyconditions: RabbleKeycondition[];
};

type RabbleKeycondition = {
  label: string;
  value: string;
  type: "positive" | "negative" | "neutral";
};

export async function crawlRabble(
  input: CrawlRabbleInput,
): Promise<CashbackOffer[]> {
  input.logger.info("Rabble: fetching brand list...");
  const brands = await fetchBrandList();
  input.logger.info(`Rabble: found ${brands.length} brands, fetching details...`);

  const details = await fetchAllDetails(brands, input.logger);
  input.logger.info(`Rabble: fetched ${details.size} detail pages`);

  const offers: CashbackOffer[] = [];
  let fromName = 0;
  let fromLookup = 0;
  let fromOverride = 0;

  for (const brand of brands) {
    const detail = details.get(brand.detailPath);
    const reward = buildReward(brand.reward, detail);
    if (!reward) {
      input.logger.warn(`Rabble: no reward for ${brand.name}`);
      continue;
    }

    let domains: string[] = [];

    // 1. Check overrides
    const overrideDomains = input.overrides.rabble?.[brand.slug] ?? [];
    if (overrideDomains.length > 0) {
      domains = overrideDomains.map(normalizeDomainInput);
      fromOverride++;
    }

    // 2. Try to extract domain from the brand name (many are "Store.no" or "Store.com")
    if (domains.length === 0) {
      const nameDomain = extractDomainFromName(brand.name);
      if (nameDomain) {
        domains = [nameDomain];
        fromName++;
      }
    }

    // 3. Fall back to domain lookup
    if (domains.length === 0) {
      domains = lookupDomains(input.domainLookup, brand.name);
      if (domains.length > 0) fromLookup++;
    }

    if (domains.length === 0) {
      input.logger.warn(`Rabble: no domain for ${brand.name} (${brand.slug})`);
      continue;
    }

    const sourceUrl = `${BASE_URL}${brand.detailPath}`;
    const terms = buildTerms(brand.name, detail);

    offers.push({
      provider: "rabble",
      merchantName: brand.name,
      domains: uniqueStrings(domains),
      reward,
      sourceUrl,
      activationUrl: sourceUrl,
      terms,
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(
    `Rabble: resolved ${fromName} from name, ${fromLookup} via lookup, ${fromOverride} via override`,
  );
  input.logger.info(`Rabble: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}

async function fetchSSR(url: string): Promise<string> {
  const response = await gotScraping(url, {
    responseType: "text",
    http2: false,
    throwHttpErrors: false,
    timeout: { request: 30_000 },
    headers: {
      Cookie: "ageGate=true",
      "User-Agent": BOT_UA,
    },
    headerGeneratorOptions: {
      headers: { "user-agent": BOT_UA },
    },
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`HTTP ${response.statusCode} for ${url}`);
  }

  return response.body;
}

async function fetchBrandList(): Promise<RabbleBrand[]> {
  const html = await fetchSSR(`${BASE_URL}/online?kategori=a-%C3%A5`);
  const brands: RabbleBrand[] = [];
  const seen = new Set<string>();

  const cardPattern =
    /href="(\/online\/[^"]+)"[\s\S]*?offer-card-title[^>]*>([^<]+)<[\s\S]*?subtitle-text[^>]*>([^<]*)</g;

  for (const match of html.matchAll(cardPattern)) {
    const detailPath = match[1] ?? "";
    const name = (match[2] ?? "").trim();
    const reward = (match[3] ?? "").trim();

    if (!detailPath || !name || seen.has(detailPath)) continue;
    seen.add(detailPath);

    // Extract slug from path: /online/380-abonera-10-50-kr-cashback → abonera
    const slugMatch = detailPath.match(/\/online\/\d+-([^-]+)/);
    const slug = slugMatch?.[1] ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    brands.push({ name, reward, detailPath, slug });
  }

  return brands;
}

async function fetchAllDetails(
  brands: RabbleBrand[],
  logger: Logger,
): Promise<Map<string, RabbleDetail>> {
  const results = new Map<string, RabbleDetail>();
  const queue = [...brands];
  let completed = 0;

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const brand = queue.shift();
      if (!brand) break;

      try {
        const detail = await fetchDetail(brand.detailPath);
        results.set(brand.detailPath, detail);
      } catch (e) {
        logger.warn(
          `Rabble: failed to fetch detail for ${brand.name}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      completed++;
      if (completed % 20 === 0) {
        logger.info(`Rabble: fetched ${completed}/${brands.length} details`);
      }
    }
  }

  const workers = Array.from({ length: DETAIL_CONCURRENCY }, () => worker());
  await Promise.all(workers);
  return results;
}

async function fetchDetail(detailPath: string): Promise<RabbleDetail> {
  const html = await fetchSSR(`${BASE_URL}${detailPath}`);

  // Keyconditions: <li class="keycondition"><p>Label</p><p class="keycondition-details positive">Value</p></li>
  const keyconditions: RabbleKeycondition[] = [];
  const kcPattern =
    /<li\s+class="keycondition">\s*<p>\s*([\s\S]*?)\s*<\/p>\s*<p\s+class="keycondition-details\s+(positive|negative|neutral)">\s*([\s\S]*?)\s*<\/p>\s*<\/li>/g;

  for (const m of html.matchAll(kcPattern)) {
    keyconditions.push({
      label: m[1]!.trim(),
      value: m[3]!.trim(),
      type: m[2] as RabbleKeycondition["type"],
    });
  }

  // Description from og:description meta tag (content comes before property in Rabble's HTML)
  const descMatch = html.match(
    /<meta[^>]*content="([^"]+)"[^>]*property="og:description"/,
  );
  const description = descMatch?.[1] ?? "";

  // Skip the generic Rabble description
  const isGeneric = /Rabble er gratisappen|Få penger tilbake/i.test(description);

  return {
    description: isGeneric ? "" : description,
    keyconditions,
  };
}

function buildReward(listReward: string, detail?: RabbleDetail): string {
  // Build reward text from keyconditions (more precise) or fallback to list reward
  if (detail?.keyconditions && detail.keyconditions.length > 0) {
    const positiveKcs = detail.keyconditions.filter(
      (kc) => kc.type === "positive",
    );
    if (positiveKcs.length > 0) {
      const allValues = positiveKcs.map((kc) => kc.value).join(" / ");
      const pctReward = extractPercentageReward(allValues);
      if (pctReward) return pctReward;

      const krReward = extractKrReward(allValues);
      if (krReward) return krReward;

      // Direct values like "50 kr" or "3%"
      const combined = positiveKcs.map((kc) => kc.value).join(" / ");
      if (/\d/.test(combined)) return combined;
    }
  }

  // Fallback: parse from list reward text like "Opptil 3% cashback" or "10% / 50 kr cashback"
  const source = listReward.replace(/\s*cashback\s*/gi, " ").trim();

  const pctReward = extractPercentageReward(source);
  if (pctReward) return pctReward;

  const krReward = extractKrReward(source);
  if (krReward) return krReward;

  // Direct kr match for simple cases like "50 kr"
  const directKr = source.match(/(\d[\d\s]*(?:[,.]\d+)?)\s*kr\b/i);
  if (directKr) {
    const value = (directKr[1] ?? "").replace(/\s/g, "").replace(",", ".");
    const num = parseFloat(value);
    if (num > 0) return `${num} kr`;
  }

  return "";
}

function buildTerms(brandName: string, detail?: RabbleDetail): string {
  const parts: string[] = [];

  if (detail?.description) {
    parts.push(detail.description);
  }

  if (detail?.keyconditions && detail.keyconditions.length > 0) {
    const lines: string[] = [];
    for (const kc of detail.keyconditions) {
      const prefix =
        kc.type === "positive" ? "✓" : kc.type === "negative" ? "✗" : "•";
      lines.push(`${prefix} ${kc.label}: ${kc.value}`);
    }
    parts.push(lines.join("\n"));
  }

  if (parts.length === 0) {
    return `Cashback via Rabble.\nKlikk deg via rabble.no til ${brandName}.`;
  }

  return parts.join("\n\n");
}

function extractDomainFromName(name: string): string | undefined {
  // Many Rabble brands have names like "Hotels.com", "Nelly.no", "AliExpress.com"
  const domainMatch = name.match(
    /^(.+\.(no|com|se|dk|eu|net|io|org|co))$/i,
  );
  if (domainMatch?.[1]) {
    return normalizeDomainInput(domainMatch[1].toLowerCase());
  }
  return undefined;
}
