// Public member benefits from Skiforeningen's official website. The benefits
// page is server-rendered HTML, fetched through an allowlisted official URL.
// No login-only content, member numbers or discount codes are collected.
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

const SITE_ORIGIN = "https://www.skiforeningen.no";
const LIST_URL = `${SITE_ORIGIN}/medlemsskap/ditt-medlemskap/medlemsfordeler/`;
const DEFAULT_TERMS = "Krever medlemskap i Skiforeningen.";

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
  { key: "kollensvevet", markerHostname: "kollensvevet.no", merchantName: "Kollensvevet", domains: ["kollensvevet.no"], reward: "100 kr" },
  { key: "bull-ski-kajakk", markerHostname: "bull-ski-kajakk.no", merchantName: "Bull Ski og Kajakk", domains: ["bull-ski-kajakk.no"], reward: "20 %" },
  { key: "repairable", markerHostname: "repairable.no", merchantName: "Repairable", domains: ["repairable.no"], reward: "10 %" },
  { key: "roseslottet", markerHostname: "roseslottet.no", merchantName: "Roseslottet", domains: ["roseslottet.no"], reward: "20 %" },
  { key: "sporet-sport", markerHostname: "sporetsport.no", merchantName: "Sporet Sport", domains: ["sporetsport.no"], reward: "Medlemspris" },
  { key: "kikutstua", markerHostname: "kikutstua.no", merchantName: "Kikutstua", domains: ["kikutstua.no"], reward: "Medlemspris" },
  { key: "bull-superski", markerHostname: "bullsuperski.no", merchantName: "Bull Superski", domains: ["bullsuperski.no"], reward: "Medlemspris" },
];

export type FetchSkiforeningenInput = {
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

export async function fetchSkiforeningen(
  input: FetchSkiforeningenInput,
): Promise<CashbackOffer[]> {
  input.logger.info("Skiforeningen: fetching public member benefits from the official page...");

  const html = (await fetchOfficialPage()).toLowerCase();

  const offers: CashbackOffer[] = [];
  for (const config of BENEFITS) {
    if (!html.includes(normalizeDomainInput(config.markerHostname))) {
      input.logger.warn(`Skiforeningen benefit was not found: ${config.key}`);
      continue;
    }

    let domains = (input.overrides.skiforeningen?.[config.key] ?? []).map(normalizeDomainInput);
    if (domains.length === 0) domains = config.domains.map(normalizeDomainInput);
    if (domains.length === 0) {
      domains = lookupDomains(input.domainLookup, config.merchantName).map(normalizeDomainInput);
    }
    domains = uniqueStrings(domains.flatMap((domain) => merchantDomainsFromHostname(domain)));
    if (domains.length === 0) {
      input.logger.warn(`Skiforeningen benefit has no domain: ${config.merchantName}`);
      continue;
    }

    offers.push({
      provider: "skiforeningen",
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
    `Skiforeningen: produced ${offers.length} offers from ${BENEFITS.length} configured benefits`,
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
        throw new Error(`Skiforeningen refused non-official request URL: ${request.url}`);
      }
      options.followRedirect = false;
    }],
    requestHandler: async ({ body, request, response }) => {
      const loadedUrl = request.loadedUrl ?? request.url;
      if (!isOfficialPageUrl(loadedUrl)) {
        throw new Error(`Skiforeningen refused non-official response URL: ${loadedUrl}`);
      }
      const statusCode = response.statusCode ?? 0;
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(`Skiforeningen returned ${statusCode} for ${request.url}`);
      }
      html = Buffer.isBuffer(body) ? body.toString("utf8") : body;
    },
  }, crawlerConfig);

  await crawler.run([new Request({
    url: LIST_URL,
    headers: { Accept: "text/html,application/xhtml+xml" },
  })]);

  if (html === undefined || html.trim() === "") {
    throw new Error("Skiforeningen page returned no content");
  }
  return html;
}

function isOfficialPageUrl(url: string): boolean {
  const parsed = parseUrl(url);
  return parsed !== undefined &&
    parsed.origin === SITE_ORIGIN &&
    parsed.pathname.replace(/\/$/, "") === "/medlemsskap/ditt-medlemskap/medlemsfordeler";
}
