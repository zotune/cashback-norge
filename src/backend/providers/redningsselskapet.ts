// Public member benefits from Redningsselskapet's official website. The
// benefits page is exposed through WordPress' REST API as a single page whose
// rendered content links out to each partner. No login-only content, member
// numbers or discount codes are collected.
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
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import { merchantDomainsFromHostname } from "../merchant-domains.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const SITE_ORIGIN = "https://rs.no";
const LIST_URL = `${SITE_ORIGIN}/medlemsfordeler/`;
const API_URL = `${SITE_ORIGIN}/wp-json/wp/v2/pages/45350?_fields=content,link`;
const DEFAULT_TERMS = "Krever medlemskap i Redningsselskapet.";

type BenefitConfig = {
  key: string;
  markerHostname: string;
  merchantName: string;
  domains: string[];
  reward: string;
};

// Rewards are set explicitly: the benefits page is a single content block, so
// reading percentages from a text window around each mention lets a
// neighbouring merchant's number leak in. The values below are the ones stated
// next to each partner in the official page content.
const BENEFITS: BenefitConfig[] = [
  { key: "avis", markerHostname: "avis.no", merchantName: "Avis", domains: ["avis.no"], reward: "15 %" },
  { key: "kinoklubb", markerHostname: "kinoklubb.no", merchantName: "Kinoklubben", domains: ["kinoklubb.no"], reward: "125 kr" },
  { key: "kinogavekort", markerHostname: "kinogavekort.no", merchantName: "Filmweb Kinogavekort", domains: ["kinogavekort.no"], reward: "10 %" },
  { key: "redgo", markerHostname: "redgo.no", merchantName: "REDGO", domains: ["redgo.no"], reward: "30 %" },
  { key: "plussmobil", markerHostname: "plussmobil.no", merchantName: "PlussMobil", domains: ["plussmobil.no"], reward: "50 %" },
  { key: "juridiske-dokumenter", markerHostname: "juridiskedokumenter.no", merchantName: "Juridiske Dokumenter", domains: ["juridiskedokumenter.no"], reward: "25 %" },
  { key: "seilmagasinet", markerHostname: "seilmagasinet.no", merchantName: "Seilmagasinet", domains: ["seilmagasinet.no"], reward: "Medlemspris" },
  { key: "batmagasinet", markerHostname: "batmagasinet.no", merchantName: "Båtmagasinet", domains: ["batmagasinet.no"], reward: "Medlemspris" },
  { key: "batliv", markerHostname: "b-v.no", merchantName: "Båtliv", domains: ["b-v.no"], reward: "Medlemspris" },
];

export type FetchRedningsselskapetInput = {
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

export async function fetchRedningsselskapet(
  input: FetchRedningsselskapetInput,
): Promise<CashbackOffer[]> {
  input.logger.info(
    "Redningsselskapet: fetching public member benefits from the official REST API...",
  );

  const content = (await fetchOfficialContent()).toLowerCase();

  const offers: CashbackOffer[] = [];
  for (const config of BENEFITS) {
    // Only emit a benefit that is still linked on the official page.
    if (!content.includes(normalizeDomainInput(config.markerHostname))) {
      input.logger.warn(`Redningsselskapet benefit was not found: ${config.key}`);
      continue;
    }

    let domains = (input.overrides.redningsselskapet?.[config.key] ?? [])
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
      input.logger.warn(`Redningsselskapet benefit has no domain: ${config.merchantName}`);
      continue;
    }

    offers.push({
      provider: "redningsselskapet",
      merchantName: config.merchantName,
      domains,
      reward: config.reward,
      sourceUrl: LIST_URL,
      activationUrl: LIST_URL,
      // The page is one content block, so per-merchant text can't be isolated
      // without mis-attributing a neighbour's description; keep terms generic.
      terms: DEFAULT_TERMS,
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(
    `Redningsselskapet: produced ${offers.length} offers from ${BENEFITS.length} configured benefits`,
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
        throw new Error(`Redningsselskapet refused non-official API response URL: ${loadedUrl}`);
      }
      value = json;
    },
  }, crawlerConfig);

  await crawler.run([new Request({
    url: API_URL,
    headers: { Accept: "application/json" },
  })]);

  if (
    !isRecord(value) ||
    value.link !== LIST_URL ||
    !isRecord(value.content) ||
    typeof value.content.rendered !== "string" ||
    value.content.rendered.trim() === ""
  ) {
    throw new Error("Redningsselskapet API returned invalid page content");
  }
  return value.content.rendered;
}

function isOfficialApiUrl(url: string): boolean {
  const parsed = parseUrl(url);
  return parsed !== undefined &&
    parsed.origin === SITE_ORIGIN &&
    parsed.pathname === "/wp-json/wp/v2/pages/45350";
}
