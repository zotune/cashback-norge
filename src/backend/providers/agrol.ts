// Public member benefits from Agrol, the shared benefit programme for members
// of Norges Bondelag and other agricultural organisations. Agrol exposes its
// agreements through WordPress' official REST API. No login-only content,
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
  stripHtml,
  toBaseDomain,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import { extractPercentageReward } from "../../shared/reward.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import { merchantDomainsFromHostname } from "../merchant-domains.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const SITE_ORIGIN = "https://agrol.no";
const LIST_URL = `${SITE_ORIGIN}/fordel/`;
const API_URL = `${SITE_ORIGIN}/wp-json/wp/v2/agreement?per_page=100&_fields=slug,link,title,content`;
const DEFAULT_TERMS = "Krever medlemskap i en organisasjon tilknyttet Agrol (f.eks. Norges Bondelag).";

const EXCLUDED_LINK_HOSTS =
  /agrol\.no|facebook\.com|instagram\.com|youtube\.com|linkedin\.com|twitter\.com|(^|\.)x\.com|tiktok\.com|google\.|gstatic|googleapis|vimeo\.com|wpd\.digital|apple\.com|play\.google/;

type AgreementItem = {
  slug: string;
  merchantName: string;
  text: string;
  contentHtml: string;
};

export type FetchAgrolInput = {
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

export async function fetchAgrol(input: FetchAgrolInput): Promise<CashbackOffer[]> {
  input.logger.info("Agrol: fetching public agreements from the official REST API...");

  const items = parseAgreements(await fetchAgreements());
  if (items.length === 0) {
    throw new Error("Agrol API returned no agreements");
  }

  const offers: CashbackOffer[] = [];
  for (const item of items) {
    let domains = (input.overrides.agrol?.[item.slug] ?? []).map(normalizeDomainInput);
    if (domains.length === 0) domains = findPartnerDomains(item.contentHtml);
    if (domains.length === 0) {
      domains = lookupDomains(input.domainLookup, item.merchantName).map(normalizeDomainInput);
    }
    domains = uniqueStrings(domains.flatMap((domain) => merchantDomainsFromHostname(domain)));
    if (domains.length === 0) {
      input.logger.info(`Agrol agreement has no resolvable domain: ${item.merchantName}`);
      continue;
    }

    // Agrol agreements are member prices described in prose ("gunstig
    // rabatt"), not structured amounts. Only trust an explicit percentage;
    // otherwise label it "Medlemspris". (The generic benefit extractor would
    // mis-read stray words like "gratis frakt" as a 0 kr total.)
    const reward = extractPercentageReward(item.text) || "Medlemspris";

    offers.push({
      provider: "agrol",
      merchantName: item.merchantName,
      domains,
      reward,
      sourceUrl: LIST_URL,
      activationUrl: LIST_URL,
      terms: DEFAULT_TERMS,
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(
    `Agrol: produced ${offers.length} offers from ${items.length} agreements`,
  );
  return uniqueOffers(offers);
}

function parseAgreements(value: unknown): AgreementItem[] {
  if (!Array.isArray(value)) {
    throw new Error("Agrol API returned a non-array response");
  }

  const items: AgreementItem[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry.slug !== "string" ||
      !isRecord(entry.title) ||
      typeof entry.title.rendered !== "string" ||
      !isRecord(entry.content) ||
      typeof entry.content.rendered !== "string"
    ) {
      continue;
    }
    const merchantName = cleanMerchantName(stripHtml(entry.title.rendered));
    if (merchantName === "") continue;
    items.push({
      slug: entry.slug,
      merchantName,
      text: stripHtml(entry.content.rendered),
      contentHtml: entry.content.rendered,
    });
  }
  return items;
}

// Titles read "Nissan – gunstig rabatt på ny bil"; keep the merchant, drop the
// marketing tail.
function cleanMerchantName(title: string): string {
  return title.replace(/\s*[–—-]\s.*$/, "").replace(/\s+/g, " ").trim();
}

function findPartnerDomains(contentHtml: string): string[] {
  const counts = new Map<string, number>();
  for (const match of contentHtml.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
    const parsed = parseUrl((match[1] ?? "").replace(/&amp;/g, "&"));
    if (parsed === undefined || EXCLUDED_LINK_HOSTS.test(parsed.hostname)) continue;
    const domain = toBaseDomain(normalizeDomainInput(parsed.hostname));
    counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best !== undefined ? [best[0]] : [];
}

async function fetchAgreements(): Promise<unknown> {
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
        throw new Error(`Agrol refused non-official API response URL: ${loadedUrl}`);
      }
      value = json;
    },
  }, crawlerConfig);

  await crawler.run([new Request({
    url: API_URL,
    headers: { Accept: "application/json" },
  })]);

  if (value === undefined) {
    throw new Error("Agrol crawler received no API response");
  }
  return value;
}

function isOfficialApiUrl(url: string): boolean {
  const parsed = parseUrl(url);
  return parsed !== undefined &&
    parsed.origin === SITE_ORIGIN &&
    parsed.pathname === "/wp-json/wp/v2/agreement";
}
