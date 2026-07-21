// Public member benefits from Redningsselskapet. The benefits page is exposed
// through WordPress' REST API as a single page; merchants and rewards are read
// from its rendered content — nothing is hardcoded. No login-only content,
// member numbers or discount codes are collected.
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
import { parseBenefitListPage } from "../benefit-list-page.js";
import { merchantDomainsFromHostname } from "../merchant-domains.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const SITE_ORIGIN = "https://rs.no";
const LIST_URL = `${SITE_ORIGIN}/medlemsfordeler/`;
const API_URL = `${SITE_ORIGIN}/wp-json/wp/v2/pages/45350?_fields=content,link`;
const DEFAULT_TERMS = "Krever medlemskap i Redningsselskapet.";
const OFFICIAL_HOSTNAME = /rs\.no$/i;

export type FetchRedningsselskapetInput = {
  overrides: ProviderOverrides;
  generatedAt: string;
  logger: Logger;
};

export async function fetchRedningsselskapet(
  input: FetchRedningsselskapetInput,
): Promise<CashbackOffer[]> {
  input.logger.info(
    "Redningsselskapet: fetching public member benefits from the official REST API...",
  );

  // rs.no's WAF times out wp-json requests from datacenter IPs, so this
  // reliably fails in CI. Degrade to no offers instead of throwing — a single
  // unreachable org must not crash the whole crawl.
  let content: string;
  try {
    content = await fetchOfficialContent();
  } catch (error) {
    input.logger.warn(
      `Redningsselskapet: could not fetch benefits (${error instanceof Error ? error.message : "unknown"}); skipping`,
    );
    return [];
  }
  // Each benefit is a Gutenberg column (<div class="wp-block-column">) holding
  // the reward text and the partner button.
  const discovered = parseBenefitListPage(content, OFFICIAL_HOSTNAME, { kind: "divClass", className: "wp-block-column" });
  if (discovered.length === 0) {
    throw new Error("Redningsselskapet page contained no parseable benefit offers");
  }

  const offers: CashbackOffer[] = [];
  for (const item of discovered) {
    const overrideDomains = input.overrides.redningsselskapet?.[item.domain];
    const domains = uniqueStrings(
      (overrideDomains !== undefined && overrideDomains.length > 0
        ? overrideDomains.map(normalizeDomainInput)
        : [item.domain]
      ).flatMap((domain) => merchantDomainsFromHostname(domain)),
    );
    if (domains.length === 0) continue;

    offers.push({
      provider: "redningsselskapet",
      merchantName: item.merchantName,
      domains,
      reward: item.reward,
      sourceUrl: LIST_URL,
      activationUrl: LIST_URL,
      terms: DEFAULT_TERMS,
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`Redningsselskapet: produced ${offers.length} offers from the live page`);
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
