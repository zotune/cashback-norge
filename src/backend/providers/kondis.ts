// Public member benefits from Kondis (organisasjon for kondisjonsidrett).
// The benefits page is server-rendered HTML, fetched through an allowlisted
// official URL. Merchants and rewards are read from the live page — nothing is
// hardcoded. No login-only content, member numbers or discount codes.
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
import { parseBenefitListPage } from "../benefit-list-page.js";
import { merchantDomainsFromHostname } from "../merchant-domains.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const SITE_ORIGIN = "https://www.kondis.no";
const LIST_URL = `${SITE_ORIGIN}/vare-medlemsfordeler`;
const DEFAULT_TERMS = "Krever medlemskap i Kondis.";
const OFFICIAL_HOSTNAME = /kondis\.no$/i;
// Kondis' own event/training sites, not merchant benefits.
const OWN_SITES = /kondistreninga\.no|kondislopet\.no|100klubben\.no/i;

export type FetchKondisInput = {
  overrides: ProviderOverrides;
  generatedAt: string;
  logger: Logger;
};

export async function fetchKondis(input: FetchKondisInput): Promise<CashbackOffer[]> {
  input.logger.info("Kondis: fetching public member benefits from the official page...");

  const html = await fetchOfficialPage();
  const discovered = parseBenefitListPage(html, OFFICIAL_HOSTNAME, { kind: "listItem" }, OWN_SITES);
  if (discovered.length === 0) {
    throw new Error("Kondis page contained no parseable benefit offers");
  }

  const offers: CashbackOffer[] = [];
  for (const item of discovered) {
    const overrideDomains = input.overrides.kondis?.[item.domain];
    const domains = uniqueStrings(
      (overrideDomains !== undefined && overrideDomains.length > 0
        ? overrideDomains.map(normalizeDomainInput)
        : [item.domain]
      ).flatMap((domain) => merchantDomainsFromHostname(domain)),
    );
    if (domains.length === 0) continue;

    offers.push({
      provider: "kondis",
      merchantName: item.merchantName,
      domains,
      reward: item.reward,
      sourceUrl: LIST_URL,
      activationUrl: LIST_URL,
      terms: DEFAULT_TERMS,
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`Kondis: produced ${offers.length} offers from the live page`);
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
