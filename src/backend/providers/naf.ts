import { gotScraping } from "crawlee";
import {
  type CashbackOffer,
  isRecord,
  normalizeDomainInput,
  parseUrl,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import { extractKrReward, extractOreLitreReward, extractPercentageReward } from "../../shared/reward.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const LIST_URL = "https://www.naf.no/medlemskap/medlemsfordeler";
const BENEFITS_PAGE_SIZE = 200;
const DETAIL_CONCURRENCY = 3;

// Slug → correct brand name, for cards where NAF uses a generic category title
const SLUG_NAME_OVERRIDES: Record<string, string> = {
  "talkmore": "Talkmore",
  "bildeler": "Bildeler.no",
  "byggmakker": "Byggmakker",
  "maskinvask": "Circle K Bilvask",
  "drivstoff": "Circle K",
  "hurtiglading-circle-k": "Circle K",
  "dekk": "Bestdrive",
  "dekkhotell": "Bestdrive",
  "dekkmann-mc-dekk": "Bestdrive",
  "noddi-hjulskift": "Noddi",
  "leiebil-avis": "Avis",
  "homely": "Homely",
  "bilpleiekongen": "Bilpleiekongen",
  "naf-senter": "NAF Senter",
  "riis-bilglass": "Riis Bilglass",
  "elton": "Elton",
  "markabutikken": "Markabutikken",
  "flight-park": "Flight Park",
  "camping-norge": "Camping.no",
  "go-nordic-cruiseline": "Go Nordic Cruiseline",
  "nordkapplinjen": "Nordkapplinjen",
  "bo-sommarland": "Bø Sommarland",
  "zaptec-hjemmelader": "Zaptec",
  "garmin-mc": "Garmin",
  "bullfighter": "Bullfighter",
  "kjells-markiser-garasjeport": "Kjells Markiser",
  "kjells-markiser-solskjerming": "Kjells Markiser",
  "hallmark": "Hallmark",
  "sikker-pa-mc-kurs": "Førerutvikling.no",
};

const INTERNAL_DOMAINS = new Set([
  "naf.no",
  "sos.eu",
  "nafnettbutikk.no",
]);

const SKIP_HOSTNAMES = new Set([
  "google.com", "youtube.com", "facebook.com", "instagram.com",
  "twitter.com", "x.com", "linkedin.com", "apps.apple.com",
  "play.google.com", "clarity.microsoft.com", "cloudinary.com",
  "safelinks.protection.outlook.com", "varify.io",
]);

const EXCLUDED_NAMES = new Set([
  "naf veihjelp", "naf forsikring", "naf billån", "naf billan",
  "naf grønt billån", "naf lease", "naf re-lease", "naf mc-lån",
  "naf caravanlån", "naf sykkel", "naf xtra", "naf veibok",
  "naf øvingsbane", "naf-kontroll", "naf magasinet", "naf mekling",
  "naf senter", "magasinet motor", "motor magasin",
  "juridisk rådgivning", "juridisk og bilteknisk", "internasjonalt førerkort",
  "kjøpekontrakt", "nøkkelforsikring", "egenandelsforsikring", "veihjelp",
  "advokathjelp", "bilverksted og tester", "personskadeerstatning",
  "reisebøker fra naf", "ta med veiboka på reisen",
]);

function isInternal(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  return (
    INTERNAL_DOMAINS.has(h) ||
    h.endsWith(".naf.no") ||
    [...SKIP_HOSTNAMES].some((skipped) => h === skipped || h.endsWith(`.${skipped}`))
  );
}

function isExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    EXCLUDED_NAMES.has(lower) ||
    [...EXCLUDED_NAMES].some((e) => lower.includes(e)) ||
    /^\d+\s*%\s+rabatt/i.test(lower) ||
    lower.includes("kampanje") ||
    lower.includes("tidsbegrenset")
  );
}

export type CrawlNafInput = {
  startUrl: string;
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

type BenefitEntry = {
  lookupNames: string[];
  name: string;
  reward: string;
  slug: string;
  storeUrl?: string;
  terms?: string;
};

type NafApiConfig = {
  apimBaseUrl: string;
  apimContentHub: string;
  apimNafNoApi: string;
};

type NafBenefitsResponse = {
  items: unknown[];
  total: number;
};

export async function crawlNaf(input: CrawlNafInput): Promise<CashbackOffer[]> {
  input.logger.info("NAF: loading API config...");
  const apiConfig = await fetchApiConfig(input.startUrl);
  input.logger.info("NAF: fetching benefits API...");

  const benefits = await fetchBenefits(apiConfig);
  input.logger.info(`NAF: found ${benefits.length} benefits in API`);

  await enrichBenefitDetails(benefits, apiConfig, input.logger);

  input.logger.info(`NAF: extracted ${benefits.length} benefits, building offers...`);

  const offers: CashbackOffer[] = [];
  let lookedUp = 0;
  let fromUrl = 0;
  let overrideCount = 0;

  for (const b of benefits) {
    let domains: string[] = [];

    const overrideDomains = input.overrides.naf?.[b.slug] ?? [];
    const firstOverride = overrideDomains[0];
    if (firstOverride) { domains = [normalizeDomainInput(firstOverride)]; overrideCount++; }

    if (domains.length === 0 && b.storeUrl) {
      try {
        const hostname = normalizeDomainInput(new URL(b.storeUrl).hostname);
        if (hostname && !isInternal(hostname)) { domains = [hostname]; fromUrl++; }
      } catch { /* skip */ }
    }

    if (domains.length === 0) {
      for (const lookupName of b.lookupNames) {
        domains = lookupDomains(input.domainLookup, lookupName);
        if (domains.length > 0) {
          lookedUp++;
          break;
        }
      }
    }

    if (domains.length === 0) {
      input.logger.warn(`NAF offer has no domain: ${b.name} (${b.slug})`);
      continue;
    }

    const sourceUrl = buildSourceUrl(input.startUrl, b.slug);
    const merchantName = SLUG_NAME_OVERRIDES[b.slug] ?? b.name;
    offers.push({
      provider: "naf",
      merchantName,
      domains: uniqueStrings(domains),
      reward: b.reward,
      sourceUrl,
      activationUrl: sourceUrl,
      terms: b.terms ? `${b.terms}

Krever NAF-medlemskap.` : "Krever NAF-medlemskap.",
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`NAF: resolved ${fromUrl} via URL, ${lookedUp} via lookup, ${overrideCount} via override`);
  input.logger.info(`NAF: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}

async function fetchApiConfig(startUrl: string): Promise<NafApiConfig> {
  const url = new URL(startUrl);
  url.searchParams.set("tabView", "rabatter");
  url.searchParams.set("query", "");

  const response = await gotScraping(url.toString(), {
    responseType: "text",
    http2: false,
    throwHttpErrors: false,
    timeout: { request: 30_000 },
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`NAF benefits page returned ${response.statusCode}: ${response.statusMessage}`);
  }

  const state = extractPreloadedState(response.body);
  const application = isRecord(state) && isRecord(state.application)
    ? state.application
    : undefined;

  if (!application) {
    throw new Error("NAF benefits page did not include API config");
  }

  const config = {
    apimBaseUrl: readString(application.apimBaseUrl),
    apimContentHub: readString(application.apimContentHub),
    apimNafNoApi: readString(application.apimNafNoApi),
  };

  if (!config.apimBaseUrl || !config.apimContentHub || !config.apimNafNoApi) {
    throw new Error("NAF benefits page had incomplete API config");
  }

  return config;
}

function extractPreloadedState(html: string): unknown {
  const markerIndex = html.indexOf("window.__PRELOADED_STATE__");
  if (markerIndex === -1) return undefined;

  const assignmentIndex = html.indexOf("=", markerIndex);
  const scriptEndIndex = html.indexOf("</script>", assignmentIndex);
  if (assignmentIndex === -1 || scriptEndIndex === -1) return undefined;

  const rawJson = html
    .slice(assignmentIndex + 1, scriptEndIndex)
    .trim()
    .replace(/;$/, "");

  try {
    return JSON.parse(rawJson);
  } catch {
    return undefined;
  }
}

async function fetchBenefits(apiConfig: NafApiConfig): Promise<BenefitEntry[]> {
  const benefits: BenefitEntry[] = [];
  const seen = new Set<string>();
  let skip = 0;
  let total = Number.POSITIVE_INFINITY;

  while (skip < total) {
    const response = await fetchNafJson(
      apiConfig,
      "benefits",
      { skip, take: BENEFITS_PAGE_SIZE },
    );

    if (!isBenefitsResponse(response)) {
      throw new Error("NAF benefits API returned unexpected format");
    }

    total = response.total;
    for (const item of response.items) {
      const benefit = parseBenefitSummary(item);
      if (benefit === undefined || seen.has(benefit.slug)) continue;
      seen.add(benefit.slug);
      benefits.push(benefit);
    }

    if (response.items.length === 0) break;
    skip += response.items.length;
  }

  return benefits;
}

async function enrichBenefitDetails(
  benefits: BenefitEntry[],
  apiConfig: NafApiConfig,
  logger: Logger,
): Promise<void> {
  let completed = 0;

  async function enrich(benefit: BenefitEntry): Promise<void> {
    try {
      const detail = await fetchNafJson(apiConfig, `commonarticles/${benefit.slug}`);
      const storeUrl = extractStoreUrl(detail);
      const reward = extractDetailReward(detail);
      const detailLookupNames = extractDetailLookupNames(detail);

      if (storeUrl !== undefined) benefit.storeUrl = storeUrl;
      if (reward) benefit.reward = reward;
      const terms = extractDetailTerms(detail);
      if (terms) benefit.terms = terms;
      benefit.lookupNames = uniqueStringsPreserveOrder([
        ...benefit.lookupNames,
        ...detailLookupNames,
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.warn(`NAF detail failed for ${benefit.slug}: ${message}`);
    } finally {
      completed++;
      process.stdout.write(`\r  NAF detail ${completed}/${benefits.length}: ${benefit.name.slice(0, 40)}  `);
    }
  }

  for (let i = 0; i < benefits.length; i += DETAIL_CONCURRENCY) {
    await Promise.all(benefits.slice(i, i + DETAIL_CONCURRENCY).map(enrich));
  }

  if (benefits.length > 0) process.stdout.write("\n");
}

async function fetchNafJson(
  apiConfig: NafApiConfig,
  path: string,
  params: Record<string, number | string> = {},
): Promise<unknown> {
  const url = buildApiUrl(apiConfig, path, params);
  const response = await gotScraping(url, {
    responseType: "json",
    http2: false,
    throwHttpErrors: false,
    timeout: { request: 30_000 },
    headers: {
      "Accept": "application/json",
      "Ocp-Apim-Subscription-Key": apiConfig.apimContentHub,
    },
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`NAF API ${path} returned ${response.statusCode}: ${response.statusMessage}`);
  }

  return response.body;
}

function buildApiUrl(
  apiConfig: NafApiConfig,
  path: string,
  params: Record<string, number | string>,
): string {
  const baseUrl = apiConfig.apimBaseUrl.replace(/\/+$/, "");
  const apiName = apiConfig.apimNafNoApi.replace(/^\/+|\/+$/g, "");
  const normalizedPath = path.replace(/^\/+/, "");
  const url = new URL(`${baseUrl}/${apiName}/${normalizedPath}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

function parseBenefitSummary(value: unknown): BenefitEntry | undefined {
  if (!isRecord(value)) return undefined;

  const slug = readString(value.slug);
  const title = readString(value.title ?? value.name);
  const partnerName = extractPartnerName(value.partner);
  const name = SLUG_NAME_OVERRIDES[slug] ?? (title || partnerName);

  if (!slug || !name || isExcluded(name) || isExcluded(title)) {
    return undefined;
  }

  return {
    lookupNames: uniqueStringsPreserveOrder([name, partnerName, title]),
    name,
    reward: INSURANCE_NOISE_PATTERN.test(readString(value.discountBadge)) ? "" : extractRewardFromText(readString(value.discountBadge)),
    slug,
  };
}

function extractStoreUrl(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;

  const preferredUrls = [
    ...collectUrls(value.callToAction),
    ...collectUrls(value.body),
    ...collectUrls(value.stepByStepSection),
    ...collectUrls(value.keyInformation),
  ];

  return preferredUrls.find((url) => {
    const parsedUrl = parseUrl(url);
    return parsedUrl !== undefined && !isInternal(parsedUrl.hostname);
  });
}

type NafCampaign = { label: string; text: string };

const CAMPAIGN_CTA_NOISE = /^logg inn/i;

function extractCampaigns(value: unknown): NafCampaign[] {
  if (!isRecord(value) || !Array.isArray(value.campaign)) return [];
  const result: NafCampaign[] = [];
  for (const item of value.campaign) {
    if (!isRecord(item)) continue;
    const label = readString(item.label);
    const rawText = collectPortableText(item.mainText);
    const bodyText = rawText
      .split(/\s{2,}/)
      .filter((t) => !CAMPAIGN_CTA_NOISE.test(t.trim()))
      .join(" ")
      .trim();
    if (label || bodyText) {
      result.push({ label, text: bodyText });
    }
  }
  return result;
}

function extractDetailReward(value: unknown): string {
  if (!isRecord(value)) return "";

  const keyInformationItems = isRecord(value.keyInformation) &&
    Array.isArray(value.keyInformation.items)
    ? value.keyInformation.items.map(readString).filter(Boolean)
    : [];

  const fromItems = extractRewardFromItems(keyInformationItems);
  if (fromItems) return fromItems;

  // Collect rewards from top-level discountBadge and all campaign labels/text
  const badges: string[] = [];
  if (!INSURANCE_NOISE_PATTERN.test(readString(value.discountBadge))) {
    badges.push(readString(value.discountBadge));
  }
  for (const c of extractCampaigns(value)) {
    badges.push(c.label, c.text);
  }

  const percents: number[] = [];
  for (const text of badges.filter(Boolean)) {
    const r = extractRewardFromText(text);
    const m = r.match(/(\d+(?:[,.]\d+)?)(?:\s*[-–]\s*(\d+(?:[,.]\d+)?))?\s*%/);
    if (m) {
      if (m[2] !== undefined) {
        percents.push(Number.parseFloat(m[1]!.replace(",", ".")), Number.parseFloat(m[2].replace(",", ".")));
      } else if (m[1] !== undefined) {
        percents.push(Number.parseFloat(m[1].replace(",", ".")));
      }
    } else if (r.endsWith("%") || r.includes(" %")) {
      const n = Number.parseFloat(r.replace(/[^\d,.]/g, "").replace(",", "."));
      if (!Number.isNaN(n)) percents.push(n);
    }
  }

  if (percents.length > 0) {
    const min = Math.min(...percents);
    const max = Math.max(...percents);
    const fmt = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1).replace(".", ","));
    return min < max ? `${fmt(min)}-${fmt(max)} %` : `${fmt(max)} %`;
  }

  return extractRewardFromText(collectText(value.body).join(" "));
}

function extractDetailTerms(value: unknown): string {
  if (!isRecord(value)) return "";

  const campaigns = extractCampaigns(value);
  if (campaigns.length > 0) {
    return campaigns
      .map((c) => [c.label, c.text].filter(Boolean).join(": "))
      .filter(Boolean)
      .join("\n");
  }

  const items = isRecord(value.keyInformation) && Array.isArray(value.keyInformation.items)
    ? value.keyInformation.items.map(readString).filter(Boolean)
    : [];
  return items.join("\n");
}

function extractDetailLookupNames(value: unknown): string[] {
  if (!isRecord(value)) return [];
  return uniqueStringsPreserveOrder([
    readString(value.title),
    extractPartnerName(value.partner),
  ]);
}

function collectUrls(value: unknown): string[] {
  const urls: string[] = [];
  collectValues(value, (candidate) => {
    if (typeof candidate !== "string") return;
    const matches = candidate.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
    urls.push(...matches.map(normalizeUrlCandidate).filter((url) => url !== undefined));
  });
  return uniqueStringsPreserveOrder(urls);
}

function normalizeUrlCandidate(candidate: string): string | undefined {
  const url = candidate.replace(/[),.;]+$/, "");
  const parsedUrl = parseUrl(url);

  if (parsedUrl === undefined) {
    return undefined;
  }

  const unwrappedUrl = parsedUrl.searchParams.get("url") ??
    parsedUrl.searchParams.get("u");

  if (
    unwrappedUrl &&
    parsedUrl.hostname.toLowerCase().endsWith("safelinks.protection.outlook.com")
  ) {
    return parseUrl(unwrappedUrl)?.toString();
  }

  return parsedUrl.toString();
}

function collectText(value: unknown): string[] {
  const text: string[] = [];
  collectValues(value, (candidate) => {
    if (typeof candidate === "string") text.push(candidate);
  });
  return text;
}

/** Extract plain text from Sanity portable text blocks (only span.text fields) */
function collectPortableText(value: unknown): string {
  const parts: string[] = [];

  function visitBlock(block: unknown): void {
    if (!isRecord(block)) return;
    // portable text block: gather text from children spans
    if (Array.isArray(block.children)) {
      for (const child of block.children) {
        if (isRecord(child) && typeof child.text === "string" && child.text.trim()) {
          parts.push(child.text.trim());
        }
      }
    }
  }

  if (Array.isArray(value)) {
    for (const block of value) visitBlock(block);
  } else {
    visitBlock(value);
  }

  return parts.join(" ");
}

function collectValues(value: unknown, visit: (value: unknown) => void): void {
  visit(value);

  if (Array.isArray(value)) {
    for (const item of value) collectValues(item, visit);
    return;
  }

  if (!isRecord(value)) return;
  for (const item of Object.values(value)) collectValues(item, visit);
}

// Insurance-specific terms that contain % values irrelevant to the member discount
const INSURANCE_NOISE_PATTERN = /\b(?:startbonus|bonustap|bonus(?:nivå|level))\b/i;

function extractRewardFromText(text: string): string {
  const oreLitre = extractOreLitreReward(text);
  if (oreLitre !== "") return oreLitre;

  // Strip sentences containing insurance bonus terms before % parsing
  const cleaned = text.split(/[.\n]/).filter(s => !INSURANCE_NOISE_PATTERN.test(s)).join(". ");

  const percentageReward = extractPercentageReward(
    cleaned,
    /\bbonus\b/i.test(cleaned) ? " bonus" : "",
  );

  if (percentageReward !== "") return percentageReward;

  return extractKrReward(cleaned);
}

function extractRewardFromItems(items: string[]): string {
  // Filter noise items individually before joining, so one bad item doesn't kill the whole text
  const cleaned = items.filter(s => !INSURANCE_NOISE_PATTERN.test(s));
  return extractRewardFromText(cleaned.join(" "));
}

function extractPartnerName(value: unknown): string {
  return isRecord(value) ? readString(value.partnerName) : "";
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isBenefitsResponse(value: unknown): value is NafBenefitsResponse {
  return isRecord(value) &&
    Array.isArray(value.items) &&
    typeof value.total === "number";
}

function buildSourceUrl(startUrl: string, slug: string): string {
  const baseUrl = startUrl.endsWith("/") ? startUrl : `${startUrl}/`;
  return new URL(slug, baseUrl).toString();
}

function uniqueStringsPreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}
