// Public member benefits from Skiforeningen's official website. Merchants and
// rewards are read from the live server-rendered page — nothing is hardcoded.
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
import { parseBenefitListPage } from "../benefit-list-page.js";
import { merchantDomainsFromHostname } from "../merchant-domains.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const SITE_ORIGIN = "https://www.skiforeningen.no";
const LIST_URL = `${SITE_ORIGIN}/medlemsskap/ditt-medlemskap/medlemsfordeler/`;
const DEFAULT_TERMS = "Krever medlemskap i Skiforeningen.";
const OFFICIAL_HOSTNAME = /skiforeningen\.no$/i;
// Skiforeningen's own booking/video sub-sites, not merchant benefits.
const OWN_SITES = /(^|\.)sporet\.no$|cvideo\.no/i;

export type FetchSkiforeningenInput = {
  overrides: ProviderOverrides;
  generatedAt: string;
  logger: Logger;
};

export async function fetchSkiforeningen(
  input: FetchSkiforeningenInput,
): Promise<CashbackOffer[]> {
  input.logger.info("Skiforeningen: fetching public member benefits from the official page...");

  const html = await fetchOfficialPage();
  // Each benefit is a <div class="text-container"> card with the reward in its
  // heading and the partner link in its body.
  const discovered = parseBenefitListPage(html, OFFICIAL_HOSTNAME, { kind: "divClass", className: "text-container" }, OWN_SITES);
  if (discovered.length === 0) {
    throw new Error("Skiforeningen page contained no parseable benefit offers");
  }

  const offers: CashbackOffer[] = [];
  for (const item of discovered) {
    const overrideDomains = input.overrides.skiforeningen?.[item.domain];
    const domains = uniqueStrings(
      (overrideDomains !== undefined && overrideDomains.length > 0
        ? overrideDomains.map(normalizeDomainInput)
        : [item.domain]
      ).flatMap((domain) => merchantDomainsFromHostname(domain)),
    );
    if (domains.length === 0) continue;

    offers.push({
      provider: "skiforeningen",
      merchantName: item.merchantName,
      domains,
      reward: item.reward,
      sourceUrl: LIST_URL,
      activationUrl: LIST_URL,
      terms: DEFAULT_TERMS,
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`Skiforeningen: produced ${offers.length} offers from the live page`);
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
