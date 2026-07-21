// Norsk Revmatikerforbund exposes its current public benefit cards through
// WordPress' official AJAX endpoint. The endpoint returns an HTML fragment;
// no rendered page, login route, member number or discount code is fetched.
import {
  Configuration,
  HttpCrawler,
  MemoryStorage,
  Request,
} from "crawlee";
import {
  type CashbackOffer,
  normalizeDomainInput,
  parseUrl,
  stripHtml,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import { extractBenefitReward } from "../../shared/reward.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import { merchantDomainsFromHostname } from "../merchant-domains.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const SITE_ORIGIN = "https://www.revmatiker.no";
const LIST_URL = `${SITE_ORIGIN}/medlemskap/medlemsfordeler/`;
const API_URL = `${SITE_ORIGIN}/wp-admin/admin-ajax.php`;
const DEFAULT_TERMS = "Krever medlemskap i Norsk Revmatikerforbund.";

type BenefitConfig = {
  key: string;
  markerHostname: string;
  merchantName: string;
  domains: string[];
  reward?: string;
};

const BENEFITS: BenefitConfig[] = [
  {
    key: "artroseklubben",
    markerHostname: "helsefysio.no",
    merchantName: "Artroseklubben",
    domains: ["helsefysio.no"],
    reward: "197 kr/mnd",
  },
  {
    key: "appoteket",
    markerHostname: "appoteket.no",
    merchantName: "Appoteket",
    domains: ["appoteket.no"],
  },
  {
    key: "helsereiser",
    markerHostname: "helsereiser.no",
    merchantName: "Helsereiser",
    domains: ["helsereiser.no"],
  },
  {
    key: "abel-health",
    markerHostname: "abelhealth.no",
    merchantName: "Abel Health",
    domains: ["abelhealth.no"],
  },
  {
    key: "kostholdsendring",
    markerHostname: "kostholdsendring.no",
    merchantName: "Kostholdsendring",
    domains: ["kostholdsendring.no"],
  },
  {
    key: "valle-marina",
    markerHostname: "vallemarina.no",
    merchantName: "Valle Marina",
    domains: ["vallemarina.no"],
  },
  {
    key: "solgruppen",
    markerHostname: "solgruppen.no",
    merchantName: "Solgruppen",
    domains: ["solgruppen.no"],
  },
  {
    key: "din-helsebutikk",
    markerHostname: "dinhelsebutikk.no",
    merchantName: "Din Helsebutikk",
    domains: ["dinhelsebutikk.no"],
  },
  {
    key: "velferdsbutikken",
    markerHostname: "velferdsbutikken.no",
    merchantName: "Velferdsbutikken",
    domains: ["velferdsbutikken.no"],
  },
  {
    key: "avco",
    markerHostname: "avco.no",
    merchantName: "AVCO",
    domains: ["avco.no"],
  },
  {
    key: "helsekjelda",
    markerHostname: "helsekjelda.no",
    merchantName: "Helsekjelda",
    domains: ["helsekjelda.no"],
  },
  {
    key: "radiant-health",
    markerHostname: "radianthealth.no",
    merchantName: "Radiant Health",
    domains: ["radianthealth.no"],
  },
  {
    key: "casas-heddy",
    markerHostname: "casasheddy.com",
    merchantName: "Casas Heddy",
    domains: ["casasheddy.com"],
  },
  {
    key: "pulserende",
    markerHostname: "pulserende.no",
    merchantName: "Pulserende",
    domains: ["pulserende.no"],
  },
  {
    key: "ambera",
    markerHostname: "ambera.com",
    merchantName: "Ambera",
    domains: ["ambera.com"],
    reward: "0 kr totalsum",
  },
  {
    key: "mova",
    markerHostname: "mova.no",
    merchantName: "MOVA",
    domains: ["mova.no"],
  },
  {
    key: "nebu",
    markerHostname: "nebu.no",
    merchantName: "Nebu",
    domains: ["nebu.no"],
  },
  {
    key: "norsk-alpakka",
    markerHostname: "norskalpakka.no",
    merchantName: "Norsk Alpakka",
    domains: ["norskalpakka.no"],
  },
  {
    key: "hotellavtaler",
    markerHostname: "ffo.no",
    merchantName: "FFO hotellavtaler",
    domains: ["scandichotels.com", "strawberry.no", "thonhotels.no"],
    reward: "Medlemspris",
  },
];

export type FetchRevmatikerforbundetInput = {
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

type BenefitCard = {
  html: string;
  text: string;
  hostnames: string[];
};

export async function fetchRevmatikerforbundet(
  input: FetchRevmatikerforbundetInput,
): Promise<CashbackOffer[]> {
  input.logger.info(
    "Norsk Revmatikerforbund: fetching benefits from the official AJAX API...",
  );

  const fragment = await fetchBenefitFragment();
  const cards = parseBenefitCards(fragment);
  if (cards.length < BENEFITS.length) {
    throw new Error(
      `Norsk Revmatikerforbund API returned only ${cards.length} benefit cards`,
    );
  }

  const offers: CashbackOffer[] = [];
  for (const config of BENEFITS) {
    const marker = normalizeDomainInput(config.markerHostname);
    const card = cards.find((candidate) => candidate.hostnames.includes(marker));
    if (card === undefined) {
      input.logger.warn(
        `Norsk Revmatikerforbund benefit was not found: ${config.key}`,
      );
      continue;
    }

    let domains = (input.overrides.revmatikerforbundet?.[config.key] ?? [])
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
      input.logger.warn(
        `Norsk Revmatikerforbund benefit has no domain: ${config.merchantName}`,
      );
      continue;
    }

    const reward = config.reward ?? extractBenefitReward(card.text);
    if (reward === "") {
      input.logger.warn(
        `Norsk Revmatikerforbund benefit has no public reward: ${config.merchantName}`,
      );
      continue;
    }

    offers.push({
      provider: "revmatikerforbundet",
      merchantName: config.merchantName,
      domains,
      reward,
      sourceUrl: LIST_URL,
      activationUrl: LIST_URL,
      terms: buildTerms(card.text),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(
    `Norsk Revmatikerforbund: produced ${offers.length} offers from ${cards.length} API cards`,
  );
  return uniqueOffers(offers);
}

async function fetchBenefitFragment(): Promise<string> {
  const storage = new MemoryStorage({ persistStorage: false });
  const crawlerConfig = new Configuration();
  crawlerConfig.useStorageClient(storage);
  let fragment = "";

  const crawler = new HttpCrawler({
    maxConcurrency: 1,
    maxRequestRetries: 2,
    maxRequestsPerCrawl: 1,
    preNavigationHooks: [(_context, options) => {
      options.followRedirect = false;
    }],
    requestHandler: async ({ body, request, response }) => {
      const loadedUrl = request.loadedUrl ?? request.url;
      if (!isOfficialApiUrl(loadedUrl)) {
        throw new Error(
          `Norsk Revmatikerforbund refused non-official API response URL: ${loadedUrl}`,
        );
      }
      const statusCode = response.statusCode ?? 0;
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(
          `Norsk Revmatikerforbund API returned HTTP ${statusCode}`,
        );
      }
      fragment = Buffer.isBuffer(body) ? body.toString("utf8") : body;
    },
  }, crawlerConfig);

  const payload = new URLSearchParams({
    action: "get_my_posts",
    post_type: "medlemsfordeler",
    taxonomy: "medlemsfordeler",
    category: "",
    offset: "",
    limit: "",
    page_filter: "",
    no_of_children: "0",
  }).toString();

  await crawler.run([new Request({
    url: API_URL,
    uniqueKey: `POST:${API_URL}`,
    method: "POST",
    payload,
    headers: {
      Accept: "text/html",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
    },
  })]);

  if (!/<ul\b[^>]*class=(?:"[^"]*\bmedlemsfordeler\b[^"]*"|'[^']*\bmedlemsfordeler\b[^']*')/i.test(fragment)) {
    throw new Error(
      "Norsk Revmatikerforbund API returned an invalid benefit fragment",
    );
  }
  return fragment;
}

function isOfficialApiUrl(url: string): boolean {
  const parsed = parseUrl(url);
  return parsed !== undefined &&
    parsed.origin === SITE_ORIGIN &&
    parsed.pathname === "/wp-admin/admin-ajax.php" &&
    parsed.search === "";
}

function parseBenefitCards(fragment: string): BenefitCard[] {
  const cards: BenefitCard[] = [];
  for (const match of fragment.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const html = match[1] ?? "";
    const text = pageText(html);
    const hostnames = extractHttpHostnames(html);
    if (text !== "" && hostnames.length > 0) cards.push({ html, text, hostnames });
  }
  return cards;
}

function extractHttpHostnames(html: string): string[] {
  const hostnames: string[] = [];
  for (const match of html.matchAll(/\bhref=(?:"([^"]*)"|'([^']*)')/gi)) {
    const rawUrl = decodeAttribute(match[1] ?? match[2] ?? "");
    const parsed = parseUrl(rawUrl);
    if (parsed === undefined || !/^https?:$/.test(parsed.protocol)) continue;
    hostnames.push(normalizeDomainInput(parsed.hostname));
  }
  return uniqueStrings(hostnames);
}

function buildTerms(text: string): string {
  const lines = text
    .split(/\n+|(?<=[.!?])\s+/)
    .map(sanitizePublicLine)
    .filter((line) => line.length >= 8 && line.length <= 320)
    .filter((line) => !containsPrivateInstructions(line))
    .filter((line) => {
      return /\b(?:rabatt|avslag|medlemspris|gratis|kostnadsfri|gjelder|unntatt|ordinære|første konsultasjon|opphold|produkter|medlemskap)\b/i.test(line);
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
      .replace(/\b(?:\+47\s*)?(?:\d[\s-]?){8}\b/g, "")
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
    if (
      normalized === "" ||
      containsPrivateInstructions(normalized) ||
      seen.has(normalized)
    ) {
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
