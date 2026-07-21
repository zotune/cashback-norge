// Public member benefits from Kondis (organisasjon for kondisjonsidrett). The
// benefits page is server-rendered HTML, fetched through an allowlisted
// official URL. No login-only content, member numbers or discount codes are
// collected.
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

const SITE_ORIGIN = "https://www.kondis.no";
const LIST_URL = `${SITE_ORIGIN}/vare-medlemsfordeler`;
const DEFAULT_TERMS = "Krever medlemskap i Kondis.";

type BenefitConfig = {
  key: string;
  markerHostname: string;
  merchantName: string;
  domains: string[];
  reward: string;
};

// Rewards are stated next to each partner on the official page; set explicitly
// because the page lists all partners in one flow.
const BENEFITS: BenefitConfig[] = [
  { key: "sportienda", markerHostname: "sportienda.com", merchantName: "Sportienda", domains: ["sportienda.com"], reward: "15 %" },
  { key: "smart4u", markerHostname: "smart4u.no", merchantName: "Smart4u", domains: ["smart4u.no"], reward: "15 %" },
  { key: "sportsmaster", markerHostname: "sportsmaster.no", merchantName: "Sportsmaster", domains: ["sportsmaster.no"], reward: "15 %" },
  { key: "ffski", markerHostname: "ffskis.no", merchantName: "FFSki", domains: ["ffskis.no"], reward: "30 %" },
  { key: "zooca", markerHostname: "zooca.no", merchantName: "Zooca Sport", domains: ["zooca.no"], reward: "15 %" },
  { key: "recharge-health", markerHostname: "recharge.health", merchantName: "Recharge Health", domains: ["recharge.health"], reward: "15 %" },
  { key: "lopetrening", markerHostname: "lopetrening.no", merchantName: "Løpetrening.no", domains: ["lopetrening.no"], reward: "15 %" },
  { key: "pg-treningslab", markerHostname: "pgtreningslab.no", merchantName: "PG Treningslab", domains: ["pgtreningslab.no"], reward: "20 %" },
  { key: "joule", markerHostname: "joule.no", merchantName: "Joule", domains: ["joule.no"], reward: "400 kr" },
  { key: "studio-nor", markerHostname: "studio-nor.no", merchantName: "Studio Nor", domains: ["studio-nor.no"], reward: "Medlemspris" },
  { key: "behandlerverket", markerHostname: "behandlerverket.no", merchantName: "Behandlerverket", domains: ["behandlerverket.no"], reward: "15 %" },
];

export type FetchKondisInput = {
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

export async function fetchKondis(input: FetchKondisInput): Promise<CashbackOffer[]> {
  input.logger.info("Kondis: fetching public member benefits from the official page...");

  const html = (await fetchOfficialPage()).toLowerCase();

  const offers: CashbackOffer[] = [];
  for (const config of BENEFITS) {
    if (!html.includes(normalizeDomainInput(config.markerHostname))) {
      input.logger.warn(`Kondis benefit was not found: ${config.key}`);
      continue;
    }

    let domains = (input.overrides.kondis?.[config.key] ?? []).map(normalizeDomainInput);
    if (domains.length === 0) domains = config.domains.map(normalizeDomainInput);
    if (domains.length === 0) {
      domains = lookupDomains(input.domainLookup, config.merchantName).map(normalizeDomainInput);
    }
    domains = uniqueStrings(domains.flatMap((domain) => merchantDomainsFromHostname(domain)));
    if (domains.length === 0) {
      input.logger.warn(`Kondis benefit has no domain: ${config.merchantName}`);
      continue;
    }

    offers.push({
      provider: "kondis",
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
    `Kondis: produced ${offers.length} offers from ${BENEFITS.length} configured benefits`,
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
        throw new Error(`Kondis refused non-official request URL: ${request.url}`);
      }
      options.followRedirect = false;
    }],
    requestHandler: async ({ body, request, response }) => {
      const loadedUrl = request.loadedUrl ?? request.url;
      if (!isOfficialPageUrl(loadedUrl)) {
        throw new Error(`Kondis refused non-official response URL: ${loadedUrl}`);
      }
      const statusCode = response.statusCode ?? 0;
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(`Kondis returned ${statusCode} for ${request.url}`);
      }
      html = Buffer.isBuffer(body) ? body.toString("utf8") : body;
    },
  }, crawlerConfig);

  await crawler.run([new Request({
    url: LIST_URL,
    headers: { Accept: "text/html,application/xhtml+xml" },
  })]);

  if (html === undefined || html.trim() === "") {
    throw new Error("Kondis page returned no content");
  }
  return html;
}

function isOfficialPageUrl(url: string): boolean {
  const parsed = parseUrl(url);
  return parsed !== undefined &&
    parsed.origin === SITE_ORIGIN &&
    parsed.pathname.replace(/\/$/, "") === "/vare-medlemsfordeler";
}
