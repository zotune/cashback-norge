// Public member benefits from LHL's official website (Landsforeningen for
// hjerte- og lungesyke). The benefits page is server-rendered HTML; it is
// fetched through an allowlisted official URL. No login-only content, member
// numbers or discount codes are collected.
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
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import { merchantDomainsFromHostname } from "../merchant-domains.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const SITE_ORIGIN = "https://www.lhl.no";
const LIST_URL = `${SITE_ORIGIN}/medlemsfordeler/`;
const DEFAULT_TERMS = "Krever medlemskap i LHL.";

type BenefitConfig = {
  key: string;
  markerHostname: string;
  merchantName: string;
  domains: string[];
  reward: string;
};

// Rewards are stated next to each partner on the official page. Set explicitly
// because the page renders all partners in one list, so a text window around
// one merchant can pick up a neighbour's number.
const BENEFITS: BenefitConfig[] = [
  { key: "sats", markerHostname: "sats.no", merchantName: "SATS", domains: ["sats.no"], reward: "15 %" },
  { key: "farmasiet", markerHostname: "farmasiet.no", merchantName: "Farmasiet", domains: ["farmasiet.no"], reward: "10 %" },
  { key: "hjemmelegene", markerHostname: "hjemmelegene.no", merchantName: "Hjemmelegene", domains: ["hjemmelegene.no"], reward: "Medlemspris" },
  { key: "scandic", markerHostname: "scandichotels.com", merchantName: "Scandic Hotels", domains: ["scandichotels.com"], reward: "17 %" },
  { key: "thon", markerHostname: "thonhotels.no", merchantName: "Thon Hotels", domains: ["thonhotels.no"], reward: "18 %" },
  { key: "strawberry", markerHostname: "strawberry.no", merchantName: "Strawberry", domains: ["strawberry.no"], reward: "Medlemspris" },
];

export type FetchLhlInput = {
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

export async function fetchLhl(input: FetchLhlInput): Promise<CashbackOffer[]> {
  input.logger.info("LHL: fetching public member benefits from the official page...");

  const html = (await fetchOfficialPage()).toLowerCase();

  const offers: CashbackOffer[] = [];
  for (const config of BENEFITS) {
    // Only emit a benefit still linked on the official page.
    if (!html.includes(normalizeDomainInput(config.markerHostname))) {
      input.logger.warn(`LHL benefit was not found: ${config.key}`);
      continue;
    }

    let domains = (input.overrides.lhl?.[config.key] ?? []).map(normalizeDomainInput);
    if (domains.length === 0) domains = config.domains.map(normalizeDomainInput);
    if (domains.length === 0) {
      domains = lookupDomains(input.domainLookup, config.merchantName).map(normalizeDomainInput);
    }
    domains = uniqueStrings(
      domains.flatMap((domain) => merchantDomainsFromHostname(domain)),
    );
    if (domains.length === 0) {
      input.logger.warn(`LHL benefit has no domain: ${config.merchantName}`);
      continue;
    }

    offers.push({
      provider: "lhl",
      merchantName: config.merchantName,
      domains,
      reward: config.reward,
      sourceUrl: LIST_URL,
      activationUrl: LIST_URL,
      terms: DEFAULT_TERMS,
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(
    `LHL: produced ${offers.length} offers from ${BENEFITS.length} configured benefits`,
  );
  return uniqueOffers(offers);
}

async function fetchOfficialPage(): Promise<string> {
  const storage = new MemoryStorage({ persistStorage: false });
  const crawlerConfig = new Configuration();
  crawlerConfig.useStorageClient(storage);
  let html: string | undefined;

  const crawler = new HttpCrawler({
    maxConcurrency: 1,
    maxRequestRetries: 2,
    maxRequestsPerCrawl: 1,
    requestHandlerTimeoutSecs: 30,
    preNavigationHooks: [({ request }, options) => {
      if (!isOfficialPageUrl(request.url)) {
        throw new Error(`LHL refused non-official request URL: ${request.url}`);
      }
      options.followRedirect = false;
    }],
    requestHandler: async ({ body, request, response }) => {
      const loadedUrl = request.loadedUrl ?? request.url;
      if (!isOfficialPageUrl(loadedUrl)) {
        throw new Error(`LHL refused non-official response URL: ${loadedUrl}`);
      }
      const statusCode = response.statusCode ?? 0;
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(`LHL returned ${statusCode} for ${request.url}`);
      }
      html = Buffer.isBuffer(body) ? body.toString("utf8") : body;
    },
  }, crawlerConfig);

  await crawler.run([new Request({
    url: LIST_URL,
    headers: { Accept: "text/html,application/xhtml+xml" },
  })]);

  if (html === undefined || html.trim() === "") {
    throw new Error("LHL page returned no content");
  }
  return html;
}

function isOfficialPageUrl(url: string): boolean {
  const parsed = parseUrl(url);
  return parsed !== undefined &&
    parsed.origin === SITE_ORIGIN &&
    parsed.pathname.replace(/\/$/, "") === "/medlemsfordeler";
}
