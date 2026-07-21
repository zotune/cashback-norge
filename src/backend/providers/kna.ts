// KNA exposes both its current benefit index and benefit details through the
// official WordPress REST API. No rendered site pages or login routes are read.
import {
  Configuration,
  HttpCrawler,
  MemoryStorage,
  Request,
} from "crawlee";
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
  extractBenefitReward,
  extractPercentageReward,
  formatPercentageReward,
} from "../../shared/reward.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import { merchantDomainsFromHostname } from "../merchant-domains.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const SITE_ORIGIN = "https://kna.no";
const LIST_URL = `${SITE_ORIGIN}/medlemsfordeler/`;
const LIST_API_URL = `${SITE_ORIGIN}/wp-json/wp/v2/pages?slug=medlemsfordeler&_fields=link,slug,content`;
const BENEFITS_API_URL = `${SITE_ORIGIN}/wp-json/wp/v2/medlemsfordeler?per_page=100&_fields=slug,link,title,content`;
const DEFAULT_TERMS = "Krever medlemskap i KNA.";

type BenefitConfig = {
  merchantName: string;
  domains: string[];
  rewardMode?: "esso" | "member-price-discount" | "all-percentages";
};

const BENEFITS: Record<string, BenefitConfig> = {
  "aviloo-premium-batteritest": {
    merchantName: "AVILOO",
    domains: ["shop.aviloo.com", "aviloo.com"],
  },
  "ferjereiser-med-dfds": {
    merchantName: "Go Nordic Cruiseline",
    domains: ["gonordiccruiseline.no", "dfds.com"],
    rewardMode: "all-percentages",
  },
  "kna-trackday": {
    merchantName: "KNA Trackday",
    domains: ["knatrackday.no"],
  },
  "fjord-line": {
    merchantName: "Fjord Line",
    domains: ["fjordline.com"],
  },
  "hurtigruta-carglass": {
    merchantName: "Hurtigruta Carglass",
    domains: ["carglass.no"],
  },
  "water-circles-forsikring": {
    merchantName: "WaterCircles",
    domains: ["watercircles.no"],
  },
  "oddane-sand-camping": {
    merchantName: "Oddane Sand Camping",
    domains: ["oddanesand.no"],
  },
  leiebil: {
    merchantName: "Avis",
    domains: ["avis.no"],
  },
  "racingtelt-og-tilbehor": {
    merchantName: "OB Wiik",
    domains: ["obwiik.no"],
    rewardMode: "all-percentages",
  },
  "risskov-bilferie": {
    merchantName: "Risskov Bilferie",
    domains: ["risskov.no"],
  },
  brilleland: {
    merchantName: "Brilleland",
    domains: ["brilleland.no"],
  },
  wurth: {
    merchantName: "Würth",
    domains: ["wuerth.no", "wurth.no"],
    rewardMode: "all-percentages",
  },
  "viking-kontroll": {
    merchantName: "Viking Kontroll",
    domains: ["vikingredning.no"],
    rewardMode: "member-price-discount",
  },
  drivstoffrabatt: {
    merchantName: "Esso Mastercard",
    domains: ["essomastercard.no", "esso.no"],
    rewardMode: "esso",
  },
  "dekk-og-dekkhotell-vianor": {
    merchantName: "Vianor",
    domains: ["vianor.no"],
    rewardMode: "all-percentages",
  },
};

export type FetchKnaInput = {
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

type ApiBenefit = {
  slug: string;
  sourceUrl: string;
  title: string;
  content: string;
};

export async function fetchKna(input: FetchKnaInput): Promise<CashbackOffer[]> {
  input.logger.info("KNA: fetching current benefits from the official REST API...");

  const apiPayloads = await fetchApiPayloads();
  const currentSlugs = parseCurrentBenefitSlugs(apiPayloads.list);
  const apiBenefits = parseApiBenefits(apiPayloads.benefits);
  if (currentSlugs.size === 0 || apiBenefits.length === 0) {
    throw new Error("KNA API returned no current public benefits");
  }

  const offers: CashbackOffer[] = [];
  for (const benefit of apiBenefits) {
    if (!currentSlugs.has(benefit.slug)) continue;
    const config = BENEFITS[benefit.slug];
    if (config === undefined) continue;

    const publicContent = cutRelatedOffers(benefit.content);
    const text = pageText(publicContent);
    let domains = (input.overrides.kna?.[benefit.slug] ?? [])
      .map(normalizeDomainInput);

    if (domains.length === 0) domains = config.domains.map(normalizeDomainInput);
    if (domains.length === 0) {
      domains = lookupDomains(input.domainLookup, config.merchantName)
        .map(normalizeDomainInput);
    }
    domains = uniqueStrings(
      domains.flatMap((domain) => merchantDomainsFromHostname(domain)),
    );
    if (domains.length === 0) {
      input.logger.warn(`KNA benefit has no domain: ${config.merchantName}`);
      continue;
    }

    const reward = extractKnaReward(text, config.rewardMode);
    if (reward === "") {
      input.logger.warn(`KNA benefit has no public reward: ${config.merchantName}`);
      continue;
    }

    offers.push({
      provider: "kna",
      merchantName: config.merchantName,
      domains,
      reward,
      sourceUrl: benefit.sourceUrl,
      activationUrl: benefit.sourceUrl,
      terms: buildTerms(text),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(
    `KNA: produced ${offers.length} offers from ${currentSlugs.size} current API entries`,
  );
  return uniqueOffers(offers);
}

function parseCurrentBenefitSlugs(value: unknown): Set<string> {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error("KNA list API returned an unexpected page list");
  }
  const page = value[0];
  if (
    !isRecord(page) ||
    page.slug !== "medlemsfordeler" ||
    page.link !== LIST_URL ||
    !isRecord(page.content) ||
    typeof page.content.rendered !== "string"
  ) {
    throw new Error("KNA list API returned invalid page content");
  }

  const slugs = new Set<string>();
  for (const match of page.content.rendered.matchAll(
    /\bhref=(?:"([^"]*)"|'([^']*)')/gi,
  )) {
    const rawUrl = decodeAttribute(match[1] ?? match[2] ?? "");
    const parsed = parseUrlAgainst(rawUrl, LIST_URL);
    if (parsed === undefined || parsed.origin !== SITE_ORIGIN) continue;
    const slug = parsed.pathname.match(/^\/medlemsfordeler\/([a-z0-9-]+)\/?$/i)?.[1];
    if (slug !== undefined) slugs.add(slug.toLowerCase());
  }
  return slugs;
}

function parseApiBenefits(value: unknown): ApiBenefit[] {
  if (!Array.isArray(value)) {
    throw new Error("KNA benefits API returned a non-array response");
  }

  const benefits: ApiBenefit[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.slug !== "string" ||
      typeof item.link !== "string" ||
      !isOfficialBenefitUrl(item.link) ||
      !isRecord(item.title) ||
      typeof item.title.rendered !== "string" ||
      !isRecord(item.content) ||
      typeof item.content.rendered !== "string"
    ) {
      continue;
    }
    benefits.push({
      slug: item.slug,
      sourceUrl: item.link,
      title: normalizeText(stripHtml(item.title.rendered)),
      content: item.content.rendered,
    });
  }
  return benefits;
}

async function fetchApiPayloads(): Promise<{ list: unknown; benefits: unknown }> {
  const storage = new MemoryStorage({ persistStorage: false });
  const crawlerConfig = new Configuration();
  crawlerConfig.useStorageClient(storage);
  let list: unknown;
  let benefits: unknown;

  const crawler = new HttpCrawler({
    maxConcurrency: 2,
    maxRequestRetries: 2,
    maxRequestsPerCrawl: 2,
    preNavigationHooks: [(_context, options) => {
      options.followRedirect = false;
    }],
    requestHandler: async ({ json, request }) => {
      const loadedUrl = request.loadedUrl ?? request.url;
      if (!isOfficialApiUrl(loadedUrl)) {
        throw new Error(`KNA refused non-official API response URL: ${loadedUrl}`);
      }
      if (request.userData["kind"] === "list") list = json;
      if (request.userData["kind"] === "benefits") benefits = json;
    },
  }, crawlerConfig);

  await crawler.run([
    new Request({
      url: LIST_API_URL,
      headers: { Accept: "application/json" },
      userData: { kind: "list" },
    }),
    new Request({
      url: BENEFITS_API_URL,
      headers: { Accept: "application/json" },
      userData: { kind: "benefits" },
    }),
  ]);

  if (list === undefined || benefits === undefined) {
    throw new Error("KNA crawler did not receive both API responses");
  }
  return { list, benefits };
}

function isOfficialApiUrl(url: string): boolean {
  const parsed = parseUrl(url);
  if (parsed === undefined || parsed.origin !== SITE_ORIGIN) return false;
  return parsed.pathname === "/wp-json/wp/v2/pages" ||
    parsed.pathname === "/wp-json/wp/v2/medlemsfordeler";
}

function isOfficialBenefitUrl(url: string): boolean {
  const parsed = parseUrl(url);
  return parsed !== undefined && parsed.origin === SITE_ORIGIN &&
    /^\/medlemsfordeler\/[a-z0-9-]+\/$/i.test(parsed.pathname);
}

function cutRelatedOffers(html: string): string {
  const withoutMemberCtas = removeMemberCtas(html);
  const markers = [
    /<h2\b[^>]*>\s*Les mer om våre andre medlemsfordeler/i,
    /<div\b[^>]*class=(?:"[^"]*\bteft-cards-grid\b[^"]*"|'[^']*\bteft-cards-grid\b[^']*')/i,
  ];
  let end = withoutMemberCtas.length;
  for (const marker of markers) {
    const index = withoutMemberCtas.search(marker);
    if (index >= 0) end = Math.min(end, index);
  }
  return withoutMemberCtas.slice(0, end);
}

function removeMemberCtas(html: string): string {
  const startPattern = /<div\b[^>]*class=(?:"[^"]*\bcustom-block-member-cta\b[^"]*"|'[^']*\bcustom-block-member-cta\b[^']*')[^>]*>/gi;
  let result = html;

  while (true) {
    startPattern.lastIndex = 0;
    const startMatch = startPattern.exec(result);
    if (startMatch === null) return result;

    const start = startMatch.index;
    const tagPattern = /<\/?div\b[^>]*>/gi;
    tagPattern.lastIndex = start + startMatch[0].length;
    let depth = 1;
    let end = -1;
    let match: RegExpExecArray | null;
    while ((match = tagPattern.exec(result)) !== null) {
      depth += /^<\/div/i.test(match[0]) ? -1 : 1;
      if (depth === 0) {
        end = match.index + match[0].length;
        break;
      }
    }
    if (end < 0) return result.slice(0, start);
    result = `${result.slice(0, start)} ${result.slice(end)}`;
  }
}

function extractKnaReward(
  text: string,
  mode: BenefitConfig["rewardMode"],
): string {
  if (mode === "member-price-discount") {
    const percentages: number[] = [];
    for (const match of text.matchAll(
      /Veiledende pris:\s*(\d[\d .]*)\s*,?-?[\s\S]{0,30}?Medlemspris:\s*(\d[\d .]*)\s*,?-/gi,
    )) {
      const ordinary = parseNok(match[1] ?? "");
      const member = parseNok(match[2] ?? "");
      if (ordinary > 0 && member > 0 && member < ordinary) {
        percentages.push(((ordinary - member) / ordinary) * 100);
      }
    }
    return formatPercentageReward(percentages);
  }

  if (mode === "esso") {
    const primaryFuelDiscount = text.match(
      /\b(\d+)\s*øre\s+i\s+(?:drivstoff)?rabatt\s+per\s+liter\s+på\s+pumpeprisen/i,
    );
    const perLitre = primaryFuelDiscount === null
      ? ""
      : `${(Number.parseInt(primaryFuelDiscount[1] ?? "", 10) / 100)
        .toFixed(2)
        .replace(".", ",")} kr/l`;
    const washText = text.match(/\d+(?:[,.]\d+)?\s*%[^.\n]{0,80}\bbilvask\b/i)?.[0] ?? "";
    const wash = extractPercentageReward(washText);
    return [perLitre, wash].filter(Boolean).join(" + ");
  }

  if (mode === "all-percentages") return extractPercentageReward(text);
  return extractBenefitReward(text);
}

function buildTerms(text: string): string {
  const lines = text
    .split(/\n+|(?<=[.!?])\s+/)
    .map(sanitizePublicLine)
    .filter((line) => line.length >= 8 && line.length <= 320)
    .filter((line) => !containsPrivateInstructions(line))
    .filter((line) => {
      return /\b(?:rabatt|medlemspris|gratis|uten kostnad|gjelder|unntatt|kan ikke|ordinær|veiledende pris|per døgn|per uke|utvalgte)\b/i.test(line);
    });
  return uniqueTextLines([...lines.slice(0, 7), DEFAULT_TERMS]).join("\n");
}

function containsPrivateInstructions(line: string): boolean {
  return /\b(?:rabatt|kampanje|kupong|medlems)?kod(?:e|en|er)\b/i.test(line) ||
    /\b(?:rabattnummer|awd\s*(?:nr|nummer)|logg(?:e)?\s+inn|min(?:\s+|-)side|medlemsnummer(?:et)?)\b/i.test(line);
}

function sanitizePublicLine(value: string): string {
  return normalizeText(
    value
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/\b\S+@\S+\.\S+\b/g, "")
      .replace(/^[-*•–]\s*/, ""),
  );
}

function pageText(html: string): string {
  return stripHtml(
    html
      .replace(/<(?:script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/(?:script|style|noscript|svg)>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:h[1-6]|p|li|div|section|article)>/gi, "\n"),
  )
    .split(/\n+/)
    .map(normalizeText)
    .filter(Boolean)
    .join("\n");
}

function parseNok(value: string): number {
  const parsed = Number.parseInt(value.replace(/[\s.]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function uniqueTextLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    const normalized = normalizeText(line);
    if (normalized === "" || containsPrivateInstructions(normalized) || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function parseUrlAgainst(value: string, baseUrl: string): URL | undefined {
  try {
    return new URL(value, baseUrl);
  } catch {
    return undefined;
  }
}

function decodeAttribute(value: string): string {
  return value
    .replace(/&amp;|&#0*38;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#0*39;|&apos;/gi, "'");
}

function normalizeText(value: string): string {
  return value
    .replace(/&nbsp;|\u00a0/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}
