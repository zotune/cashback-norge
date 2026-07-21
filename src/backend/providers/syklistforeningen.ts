// Public member benefits from Syklistforeningen's official website.
// Login-only content, member numbers and discount codes are never collected.
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
} from "../../shared/reward.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import { merchantDomainsFromHostname } from "../merchant-domains.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const LIST_URL = "https://syklistforeningen.no/medlemsfordeler/";
const API_URL = "https://syklistforeningen.no/wp-json/wp/v2/pages?slug=medlemsfordeler&_fields=link,slug,content";
const OFFICIAL_HOSTNAME = "syklistforeningen.no";
const DEFAULT_TERMS = "Krever medlemskap i Syklistforeningen.";

type BenefitConfig = {
  key: string;
  matches: RegExp;
  merchantName: string;
  domains: string[];
  reward?: string;
  rewardMode?: "all-percentages";
};

const BENEFITS: BenefitConfig[] = [
  {
    key: "bikemember",
    matches: /\bBikeMember\b/i,
    merchantName: "BikeMember",
    domains: ["bikemember.no"],
    reward: "0 kr totalsum",
  },
  {
    key: "ute-depot",
    matches: /\bUTE Depot\b/i,
    merchantName: "UTE Depot",
    domains: ["utedepot.no"],
  },
  {
    key: "bysykkel",
    matches: /\bBysykkel\b/i,
    merchantName: "Bysykkel",
    domains: ["oslobysykkel.no", "bergenbysykkel.no", "trondheimbysykkel.no"],
  },
  {
    key: "bike-fixx",
    matches: /\bBike Fixx\b/i,
    merchantName: "Bike Fixx",
    domains: ["bikefixx.no"],
  },
  {
    key: "bikefinder",
    matches: /\bBikeFinder\b/i,
    merchantName: "BikeFinder",
    domains: ["bikefinder.com"],
  },
  {
    key: "birk-sport",
    matches: /\bBirk Sport\b/i,
    merchantName: "Birk Sport",
    domains: ["birk.no"],
  },
  {
    key: "bike-tours-fyn",
    matches: /\bsykkelferie på Fyn\b/i,
    merchantName: "Bike Tours Fyn",
    domains: ["biketoursfyn.dk"],
  },
  {
    key: "ampliuz",
    matches: /\bAmpliuz\b/i,
    merchantName: "Ampliuz",
    domains: ["ampliuz.no"],
  },
  {
    key: "evo-elsykler",
    matches: /\bEVO Elsykler\b/i,
    merchantName: "EVO Elsykler",
    domains: ["evoelsykler.no"],
  },
  {
    key: "bikelink",
    matches: /\bBikelink\b/i,
    merchantName: "Bikelink",
    domains: ["bikelink.no"],
  },
  {
    key: "sportienda",
    matches: /\bSportienda\b/i,
    merchantName: "Sportienda",
    domains: ["sportienda.com"],
  },
  {
    key: "codex-advokat",
    matches: /\bCodex Advokat\b/i,
    merchantName: "Codex Advokat",
    domains: ["codex.no"],
  },
  {
    key: "neptun-sport",
    matches: /\bNeptun Sport\b/i,
    merchantName: "Neptun Sport",
    domains: ["neptunsport.no"],
    reward: "0 kr totalsum",
  },
  {
    key: "pedalen-bodo",
    matches: /Pedalen sykkelverksted i Bodø/i,
    merchantName: "Pedalen sykkelverksted Bodø",
    domains: ["kirkensbymisjon.no"],
  },
  {
    key: "sport-1-cc-hamar",
    matches: /\bSport\s*1 CC Hamar\b/i,
    merchantName: "Sport 1 CC Hamar",
    domains: ["sport1.no"],
  },
  {
    key: "sykkel-og-fritid-hamar",
    matches: /\bSykkel og Fritid Hamar\b/i,
    merchantName: "Sykkel og Fritid Hamar",
    domains: ["sykkelogfritid.no"],
  },
  {
    key: "avancia-skedsmokorset",
    matches: /\bAvancia Skedsmokorset\b/i,
    merchantName: "Avancia Skedsmokorset",
    domains: ["avancia.no"],
    reward: "459 kr/mnd",
  },
  {
    key: "foss-sport-strommen",
    matches: /\bFOSS Sport\b/i,
    merchantName: "FOSS Sport Strømmen",
    domains: ["foss-sport.no"],
    rewardMode: "all-percentages",
  },
  {
    key: "sykkelfiksern",
    matches: /\bSykkelfiksern\b/i,
    merchantName: "Sykkelfiksern",
    domains: ["sykkelfiksern.no", "norasondegruppen.no"],
  },
];

const SKIP_HOSTNAMES = new Set([
  OFFICIAL_HOSTNAME,
  "blimed.syklistforeningen.no",
  "blimedlem.syklistforeningen.no",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "google.com",
  "google.no",
]);

export type FetchSyklistforeningenInput = {
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

type PageSection = {
  heading: string;
  html: string;
  text: string;
};

export async function fetchSyklistforeningen(
  input: FetchSyklistforeningenInput,
): Promise<CashbackOffer[]> {
  input.logger.info("Syklistforeningen: fetching public member benefits...");

  const renderedContent = await fetchOfficialContent();
  const sections = extractSections(renderedContent);
  if (sections.length === 0) {
    throw new Error("Syklistforeningen page contained no public benefit sections");
  }

  const offers: CashbackOffer[] = [];
  for (const config of BENEFITS) {
    const section = sections.find((candidate) => {
      return config.matches.test(`${candidate.heading}\n${candidate.text}`);
    });
    if (section === undefined) {
      input.logger.warn(`Syklistforeningen benefit was not found: ${config.key}`);
      continue;
    }

    let domains = (input.overrides.syklistforeningen?.[config.key] ?? [])
      .map(normalizeDomainInput)
      .filter(isAllowedMerchantHostname);

    if (domains.length === 0) {
      domains = uniqueStrings([
        ...extractExternalDomains(section.html),
        ...config.domains,
      ].map(normalizeDomainInput).filter(isAllowedMerchantHostname));
    }

    if (domains.length === 0) {
      domains = lookupDomains(input.domainLookup, config.merchantName)
        .map(normalizeDomainInput)
        .filter(isAllowedMerchantHostname);
    }

    domains = uniqueStrings(
      domains.flatMap((domain) => merchantDomainsFromHostname(domain)),
    );
    if (domains.length === 0) {
      input.logger.warn(`Syklistforeningen benefit has no domain: ${config.merchantName}`);
      continue;
    }

    const benefitText = `${section.heading}\n${section.text}`;
    const reward = config.reward ?? (
      config.rewardMode === "all-percentages"
        ? extractPercentageReward(benefitText)
        : extractBenefitReward(benefitText)
    );
    if (reward === "") {
      input.logger.warn(`Syklistforeningen benefit has no public reward: ${config.merchantName}`);
      continue;
    }

    offers.push({
      provider: "syklistforeningen",
      merchantName: config.merchantName,
      domains,
      reward,
      sourceUrl: LIST_URL,
      activationUrl: LIST_URL,
      terms: buildTerms(section.text),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(
    `Syklistforeningen: produced ${offers.length} offers from ${sections.length} public sections`,
  );
  return uniqueOffers(offers);
}

async function fetchOfficialContent(): Promise<string> {
  const storage = new MemoryStorage({ persistStorage: false });
  const crawlerConfig = new Configuration();
  crawlerConfig.useStorageClient(storage);
  let value: unknown;

  const crawler = new HttpCrawler({
    maxConcurrency: 1,
    maxRequestRetries: 2,
    maxRequestsPerCrawl: 1,
    preNavigationHooks: [(_context, options) => {
      options.followRedirect = false;
    }],
    requestHandler: async ({ json, request }) => {
      const loadedUrl = request.loadedUrl ?? request.url;
      if (!isOfficialApiUrl(loadedUrl)) {
        throw new Error(
          `Syklistforeningen refused non-official API response URL: ${loadedUrl}`,
        );
      }
      value = json;
    },
  }, crawlerConfig);

  await crawler.run([new Request({
    url: API_URL,
    headers: { Accept: "application/json" },
  })]);

  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error("Syklistforeningen API returned an unexpected page list");
  }
  const page = value[0];
  if (
    !isRecord(page) ||
    page.slug !== "medlemsfordeler" ||
    page.link !== LIST_URL ||
    !isRecord(page.content) ||
    typeof page.content.rendered !== "string" ||
    page.content.rendered.trim() === ""
  ) {
    throw new Error("Syklistforeningen API returned invalid page content");
  }
  return page.content.rendered;
}

function isOfficialApiUrl(url: string): boolean {
  const parsed = parseUrl(url);
  return parsed !== undefined &&
    parsed.protocol === "https:" &&
    normalizeDomainInput(parsed.hostname) === OFFICIAL_HOSTNAME &&
    parsed.pathname.replace(/\/$/, "") === "/wp-json/wp/v2/pages" &&
    parsed.searchParams.get("slug") === "medlemsfordeler";
}

function extractSections(html: string): PageSection[] {
  const contentHtml = html.trim();
  if (contentHtml === "") return [];

  const headings: Array<{ start: number; end: number; heading: string }> = [];
  for (const match of contentHtml.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)) {
    const heading = normalizeText(stripHtml(match[1] ?? ""));
    if (heading === "") continue;
    const start = match.index ?? 0;
    headings.push({ start, end: start + match[0].length, heading });
  }

  return headings.map((heading, index) => {
    const nextStart = headings[index + 1]?.start ?? contentHtml.length;
    const sectionHtml = contentHtml.slice(heading.end, nextStart);
    return {
      heading: heading.heading,
      html: sectionHtml,
      text: pageText(sectionHtml),
    };
  });
}

function extractExternalDomains(html: string): string[] {
  const domains: string[] = [];
  for (const match of html.matchAll(/\bhref=(?:"([^"]*)"|'([^']*)')/gi)) {
    const parsed = parseUrl(decodeAttribute(match[1] ?? match[2] ?? ""));
    if (parsed === undefined || !/^https?:$/.test(parsed.protocol)) continue;
    const domain = normalizeDomainInput(parsed.hostname);
    if (isAllowedMerchantHostname(domain)) domains.push(domain);
  }
  return uniqueStrings(domains);
}

function isAllowedMerchantHostname(hostname: string): boolean {
  const normalized = normalizeDomainInput(hostname);
  if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(normalized)) return false;
  return ![...SKIP_HOSTNAMES].some((skipped) => {
    return normalized === skipped || normalized.endsWith(`.${skipped}`);
  });
}

function buildTerms(text: string): string {
  const lines = text
    .split(/\n+|(?<=[.!?])\s+/)
    .map(sanitizePublicLine)
    .filter((line) => line.length >= 8 && line.length <= 300)
    .filter((line) => !containsPrivateInstructions(line))
    .filter((line) => {
      return /\b(?:rabatt|medlemspris|gratis|gjelder|kan ikke|unntatt|ordinære priser|tilbud|service|reparasjon|utstyr|varer|produkter)\b/i.test(line);
    });

  return uniqueTextLines([...lines.slice(0, 6), DEFAULT_TERMS]).join("\n");
}

function containsPrivateInstructions(line: string): boolean {
  return /\b(?:rabatt|kampanje|kupong|medlems)?kod(?:e|en|er)\b/i.test(line) ||
    /\b(?:logg(?:e)?\s+inn|min(?:\s+|-)side|medlemsnummer(?:et)?)\b/i.test(line);
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
