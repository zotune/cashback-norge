// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import { CheerioCrawler, gotScraping, type CheerioCrawlingContext, Configuration, MemoryStorage } from "crawlee";
import {
  type CashbackOffer,
  isRecord,
  normalizeDomainInput,
  parseUrl,
  stripHtml,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

type RememberCheerio = CheerioCrawlingContext["$"];

type RememberCommission = {
  description: string;
  type: string;
  value: number;
};

type RememberStore = {
  affiliateUrl: string;
  commission: RememberCommission[];
  maxFixedValue: number;
  maxPercentageValue: number;
  name: string;
  shopUrl: string;
  slug: string;
  terms: string;
};

export type CrawlRememberInput = {
  startUrl: string;
  maxRequestsPerCrawl: number;
  overrides: ProviderOverrides;
  generatedAt: string;
  logger: Logger;
};

export async function crawlRemember(
  input: CrawlRememberInput,
): Promise<CashbackOffer[]> {
  const offers: CashbackOffer[] = [];
  const storage = new MemoryStorage({ persistStorage: false });
  const config = new Configuration();
  config.useStorageClient(storage);

  const crawler = new CheerioCrawler({
    maxConcurrency: 4,
    maxRequestsPerCrawl: input.maxRequestsPerCrawl,
    requestHandler: async ({ $, enqueueLinks, request }) => {
      const loadedUrl = request.loadedUrl ?? request.url;
      const parsedUrl = parseUrl(loadedUrl);

      if (parsedUrl === undefined) {
        input.logger.warn(`Skipping invalid re:member URL: ${loadedUrl}`);
        return;
      }

      if (!parsedUrl.pathname.startsWith("/reward/rabatt")) {
        return;
      }

      const offer = await parseRememberOffer(
        $,
        loadedUrl,
        input.overrides,
        input.generatedAt,
        input.logger,
      );

      if (offer !== undefined) {
        if (offer.domains.length === 0) {
          input.logger.warn(
            `re:member offer has no domains and needs override: ${loadedUrl}`,
          );
        }

        offers.push(offer);
        return;
      }

      await enqueueLinks({
        selector: 'a[href*="/reward/rabatt/"]',
      });
    },
  }, config);

  await crawler.run([input.startUrl]);
  return uniqueOffers(offers);
}

async function parseRememberOffer(
  $: RememberCheerio,
  loadedUrl: string,
  overrides: ProviderOverrides,
  generatedAt: string,
  logger: Logger,
): Promise<CashbackOffer | undefined> {
  const store = extractRememberStore($);

  if (store === undefined) {
    return undefined;
  }

  const sourceUrl = parseUrlWithBase(store.shopUrl, loadedUrl)?.toString() ?? loadedUrl;
  const overrideDomains = overrides.remember[store.slug] ?? [];
  let domains: string[];

  if (overrideDomains.length > 0) {
    domains = overrideDomains;
  } else {
    const inferredDomains = inferStoreDomains(store);
    const affiliateDomain = await resolveAffiliateDomain(store.affiliateUrl, logger);
    domains = uniqueStrings([
      ...inferredDomains,
      ...(affiliateDomain === undefined ? [] : [affiliateDomain]),
    ]);
  }

  const reward = extractReward(store);

  // "Direct Deals" entries without commission data have neither a reward nor
  // usable domains; they only produce junk "?"-cards on the site.
  if (reward === "" && domains.length === 0) {
    logger.info(`re:member: skipping ${store.name} (no reward and no domains)`);
    return undefined;
  }

  return {
    provider: "remember",
    merchantName: store.name,
    domains,
    reward,
    sourceUrl,
    activationUrl: sourceUrl,
    terms: extractTerms(store),
    updatedAt: generatedAt,
  };
}

function extractRememberStore($: RememberCheerio): RememberStore | undefined {
  const nextDataText = $("#__NEXT_DATA__").first().text();

  if (nextDataText.length === 0) {
    return undefined;
  }

  const nextData = parseJson(nextDataText);

  if (!isRecord(nextData)) {
    return undefined;
  }

  const props = asRecord(nextData.props);
  const pageProps = asRecord(props?.pageProps);
  return parseRememberStore(pageProps?.store);
}

function parseRememberStore(value: unknown): RememberStore | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const name = readString(value.name);
  const shopUrl = readString(value.shopUrl);
  const slug = readString(value.slug);

  if (name.length === 0 || shopUrl.length === 0 || slug.length === 0) {
    return undefined;
  }

  return {
    affiliateUrl: readString(value.affiliateUrl),
    commission: parseCommissions(value.commission),
    maxFixedValue: readNumber(value.maxFixedValue),
    maxPercentageValue: readNumber(value.maxPercentageValue),
    name,
    shopUrl,
    slug,
    terms: readString(value.terms),
  };
}

function parseCommissions(value: unknown): RememberCommission[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((commission) => {
    if (!isRecord(commission)) {
      return [];
    }

    const type = readString(commission.type);
    const rewardValue = readNumber(commission.value);

    if (type.length === 0 || rewardValue <= 0) {
      return [];
    }

    return [
      {
        description: readString(commission.description),
        type,
        value: rewardValue,
      },
    ];
  });
}

async function resolveAffiliateDomain(
  affiliateUrl: string,
  logger: Logger,
): Promise<string | undefined> {
  if (affiliateUrl.length === 0) {
    return undefined;
  }

  const redirectUrl = await resolveAffiliateRedirectUrl(affiliateUrl, logger, 8);
  const parsedUrl = redirectUrl === undefined ? undefined : parseUrl(redirectUrl);

  if (parsedUrl === undefined || isTrackingHostname(parsedUrl.hostname)) {
    return undefined;
  }

  return normalizeResolvedMerchantDomain(parsedUrl.hostname);
}

function normalizeResolvedMerchantDomain(hostname: string): string {
  const normalizedDomain = normalizeDomainInput(hostname);
  const parts = normalizedDomain.split(".");
  const firstPart = parts[0] ?? "";
  const affiliateSubdomainPrefixes = ["at", "go", "in", "ion", "pin", "dot", "do", "id", "on", "to", "track", "click", "link", "out", "no-pin"];

  if (
    parts.length > 2 &&
    (affiliateSubdomainPrefixes.includes(firstPart) ||
      firstPart.includes("tdb"))
  ) {
    return parts.slice(1).join(".");
  }

  return normalizedDomain;
}

async function resolveAffiliateRedirectUrl(
  url: string,
  logger: Logger,
  redirectsRemaining: number,
): Promise<string | undefined> {
  const currentUrl = parseUrl(url);

  if (currentUrl !== undefined && !isTrackingHostname(currentUrl.hostname)) {
    return currentUrl.toString();
  }

  const embeddedMerchantUrl = extractEmbeddedMerchantUrl(url);

  if (embeddedMerchantUrl !== undefined) {
    return embeddedMerchantUrl;
  }

  try {
    const response = await gotScraping(url, {
      followRedirect: false,
      http2: false,
      responseType: "text",
      throwHttpErrors: false,
      timeout: {
        request: 10_000,
      },
    });
    const locationHeader = readHeader(response.headers.location);

    if (locationHeader !== undefined && redirectsRemaining > 0) {
      const nextUrl = parseUrlWithBase(locationHeader, url)?.toString();
      return nextUrl === undefined
        ? undefined
        : resolveAffiliateRedirectUrl(nextUrl, logger, redirectsRemaining - 1);
    }

    const contentType = readHeader(response.headers["content-type"]) ?? "";

    if (
      contentType.length > 0 &&
      !contentType.toLowerCase().includes("text/html")
    ) {
      return response.url;
    }

    const htmlRedirectUrl = extractHtmlRedirectUrl(response.body, url);

    if (htmlRedirectUrl === undefined || redirectsRemaining <= 0) {
      return htmlRedirectUrl;
    }

    return resolveAffiliateRedirectUrl(
      htmlRedirectUrl,
      logger,
      redirectsRemaining - 1,
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.warn(`Could not resolve re:member affiliate URL ${url}: ${message}`);
    return undefined;
  }
}

function extractEmbeddedMerchantUrl(url: string): string | undefined {
  const parsedUrl = parseUrl(url);
  const candidateValues = [
    ...findEmbeddedUrlPatternValues(url),
    ...(parsedUrl === undefined ? [] : findEmbeddedUrlSearchParamValues(parsedUrl)),
  ];

  for (const candidateValue of candidateValues) {
    const cleanedUrl = cleanRedirectUrl(candidateValue, url);
    const cleanedHostname =
      cleanedUrl === undefined ? undefined : parseUrl(cleanedUrl)?.hostname;

    if (
      cleanedHostname !== undefined &&
      !isTrackingHostname(cleanedHostname)
    ) {
      return cleanedUrl;
    }
  }

  return undefined;
}

function findEmbeddedUrlPatternValues(value: string): string[] {
  const matches = value.matchAll(/url\((https?:\/\/[^)]+)\)/gi);
  return [...matches].flatMap((match) => {
    return match[1] === undefined ? [] : [match[1]];
  });
}

function findEmbeddedUrlSearchParamValues(url: URL): string[] {
  const destinationParamNames = [
    "dest",
    "destination",
    "r",
    "redirect",
    "redirect_url",
    "target",
    "u",
    "url",
  ];
  return destinationParamNames.flatMap((paramName) => {
    const value = url.searchParams.get(paramName);
    return value === null ? [] : [value];
  });
}

function readHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function extractHtmlRedirectUrl(html: string, baseUrl: string): string | undefined {
  const redirectPatterns = [
    /<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=([^"']+)["']/i,
    /redirectUrl\s*=\s*(["'])(.*?)\1/i,
    /location\.replace\((["'])(.*?)\1\)/i,
  ];

  for (const pattern of redirectPatterns) {
    const match = html.match(pattern);
    const rawUrl = match?.[2] ?? match?.[1];
    const redirectUrl = cleanRedirectUrl(rawUrl ?? "", baseUrl);

    if (redirectUrl !== undefined) {
      return redirectUrl;
    }
  }

  return undefined;
}

function cleanRedirectUrl(value: string, baseUrl: string): string | undefined {
  const decodedUrl = value
    .replace(/\\\//g, "/")
    .replaceAll("&amp;", "&")
    .trim();

  if (decodedUrl.length === 0) {
    return undefined;
  }

  return parseUrlWithBase(decodedUrl, baseUrl)?.toString();
}

function extractReward(store: RememberStore): string {
  const percentageCommissions = store.commission.filter(
    (c) => c.type === "PERCENTAGE" && c.value > 0,
  );

  if (percentageCommissions.length > 1) {
    const values = percentageCommissions.map((c) => c.value);
    const min = Math.min(...values);
    const max = Math.max(...values);

    if (min !== max) {
      return `${formatRewardNumber(min)}-${formatRewardNumber(max)} %`;
    }

    return `${formatRewardNumber(max)} %`;
  }

  if (percentageCommissions.length === 1 && percentageCommissions[0] !== undefined) {
    return `${formatRewardNumber(percentageCommissions[0].value)} %`;
  }

  if (store.maxPercentageValue > 0) {
    return `${formatRewardNumber(store.maxPercentageValue)} %`;
  }

  // Fixed commissions carry their currency as the type ("NOK", "SEK"); the
  // page renders e.g. "251 SEK i reward-rabatt". `maxFixedValue` drops both
  // the currency and the other amounts, so it is only a fallback.
  const fixedCommissions = store.commission.filter(
    (c) => c.value > 0 && fixedCommissionUnit(c.type) !== undefined,
  );
  const fixedUnits = uniqueStrings(fixedCommissions.map((c) => fixedCommissionUnit(c.type) ?? ""));

  if (fixedCommissions.length > 0 && fixedUnits.length === 1) {
    const values = fixedCommissions.map((c) => c.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const amount = min !== max
      ? `${formatRewardNumber(min)}-${formatRewardNumber(max)}`
      : formatRewardNumber(max);
    return `${amount} ${fixedUnits[0]}`;
  }

  if (store.maxFixedValue > 0) {
    return `${formatRewardNumber(store.maxFixedValue)} kr`;
  }

  const maxPercentageCommission = findMaxCommissionValue(
    store.commission,
    "PERCENTAGE",
  );

  if (maxPercentageCommission > 0) {
    return `${formatRewardNumber(maxPercentageCommission)} %`;
  }

  const maxFixedCommission = findMaxCommissionValue(store.commission, "FIXED");

  if (maxFixedCommission > 0) {
    return `${formatRewardNumber(maxFixedCommission)} kr`;
  }

  return "";
}

// The structured `commission` list is what re:member renders as the store's
// current rate ("6% i reward-rabatt på alt du kjøper") and what the reward is
// built from. The editorial `terms` prose is updated separately and can still
// quote an older rate ("Få 4 % reward-rabatt"), so the tooltip leads with the
// structured rate and leaves out prose sentences that quote a different one.
function extractTerms(store: RememberStore): string {
  const percentageCommissions = store.commission.filter(
    (c) => c.type === "PERCENTAGE" && c.value > 0 && c.description.length > 0,
  );

  if (percentageCommissions.length > 1) {
    return percentageCommissions.map(formatCommissionLine).join("\n");
  }

  const commissionLines = store.commission
    .filter((c) => {
      return (c.type === "PERCENTAGE" || fixedCommissionUnit(c.type) !== undefined) &&
        c.value > 0 && c.description.length > 0;
    })
    .map(formatCommissionLine);
  const currentPercentages = store.commission
    .filter((c) => c.type === "PERCENTAGE" && c.value > 0)
    .map((c) => c.value);
  const prose = store.terms
    ? withoutStaleRewardRates(stripHtml(store.terms), currentPercentages)
    : "";

  return (
    [...commissionLines, prose].filter((part) => part.length > 0).join("\n") ||
    "Requires re:member reward login and payment with a re:member card."
  );
}

function formatCommissionLine(commission: RememberCommission): string {
  const unit = commission.type === "PERCENTAGE" ? "%" : fixedCommissionUnit(commission.type) ?? commission.type;
  return `${formatRewardNumber(commission.value)} ${unit} – ${commission.description}`;
}

const FOREIGN_COMMISSION_CURRENCIES = new Set(["SEK", "DKK", "EUR", "USD", "GBP"]);

function fixedCommissionUnit(type: string): string | undefined {
  if (type === "FIXED" || type === "NOK") return "kr";
  return FOREIGN_COMMISSION_CURRENCIES.has(type) ? type : undefined;
}

const REWARD_RATE_CLAIM = /(\d+(?:[,.]\d+)?)\s*%\s*(?:i\s+)?(?:reward[\s-]?rabatt|belønningsrabatt)/gi;

function withoutStaleRewardRates(prose: string, currentPercentages: number[]): string {
  if (currentPercentages.length === 0) return prose.replace(/\r\n?/g, "\n").trim();

  const isStale = (sentence: string): boolean => {
    return [...sentence.matchAll(REWARD_RATE_CLAIM)].some((match) => {
      const value = Number.parseFloat((match[1] ?? "").replace(",", "."));
      return !currentPercentages.includes(value);
    });
  };

  return prose
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      return line
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => !isStale(sentence))
        .join(" ")
        .trimEnd();
    })
    // Drop list bullets whose only sentence was a stale rate claim.
    .filter((line, index, lines) => !/^\s*-\s*$/.test(line) && !(line === "" && lines[index - 1] === ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function inferStoreDomains(store: RememberStore): string[] {
  return uniqueStrings(
    [...extractDomainLikeValues(store.name), ...extractDomainLikeValues(store.slug)]
      .map(normalizeDomainInput)
      .filter((domain) => !isTrackingHostname(domain)),
  );
}

function extractDomainLikeValues(value: string): string[] {
  const matches = value.match(/[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi);
  return matches ?? [];
}

function findMaxCommissionValue(
  commissions: RememberCommission[],
  type: string,
): number {
  return Math.max(
    0,
    ...commissions
      .filter((commission) => commission.type === type)
      .map((commission) => commission.value),
  );
}

function formatRewardNumber(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString();
  }

  return value
    .toFixed(2)
    .replace(/0+$/, "")
    .replace(/\.$/, "")
    .replace(".", ",");
}

function isTrackingHostname(hostname: string): boolean {
  const normalizedHostname = normalizeDomainInput(hostname);
  const trackingDomains = [
    "adrecord.com",
    "adtraction.com",
    "adt246.net",
    "anrdoezrs.net",
    "awardit.com",
    "awin1.com",
    "dpbolvw.net",
    "emjcd.com",
    "kqzyfj.com",
    "mplxtms.com",
    "prf.hn",
    "cj.com",
    "dotomi.com",
    "qksrv.net",
    "partner-ads.com",
    "remember.no",
    "tkqlhce.com",
    "tradedoubler.com",
    "tradetracker.net",
    "vercel.link",
    "aaa.artefact.com",
  ];

  return trackingDomains.some((domain) => {
    return (
      normalizedHostname === domain ||
      normalizedHostname.endsWith(`.${domain}`)
    );
  });
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function parseUrlWithBase(href: string, baseUrl: string): URL | undefined {
  try {
    return new URL(href, baseUrl);
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
