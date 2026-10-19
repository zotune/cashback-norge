// Extracts public birthday offers without executing third-party JavaScript.
import { Configuration, ErrorTracker, HttpCrawler, MemoryStorage } from "crawlee";
import {
  type CashbackOffer,
  type RewardCalculationRules,
  isRecord,
  normalizeDomainInput,
  stripHtml,
  uniqueOffers,
} from "../../shared/cashback.js";
import { extractKrReward, extractPercentageReward } from "../../shared/reward.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const PAGE_URL = "https://gratisbursdag.no/";

type BirthdayOffer = {
  id: number;
  brandName: string;
  offer: string;
  description: string;
  requirements: string[];
  locations: string[];
  validity: string;
  confirmed: boolean;
  value: string;
  offerType: "gratis" | "rabatt";
};

export type FetchGratisbursdagInput = {
  generatedAt: string;
  logger: Logger;
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  startUrl?: string;
};

export async function fetchGratisbursdag(input: FetchGratisbursdagInput): Promise<CashbackOffer[]> {
  const pageUrl = input.startUrl ?? PAGE_URL;
  input.logger.info("Gratis Bursdag: fetching public offer catalogue...");
  const storage = new MemoryStorage({ persistStorage: false });
  const config = new Configuration();
  config.useStorageClient(storage);
  let catalogue: BirthdayOffer[] | undefined;
  let requestFailure: Error | undefined;
  const crawler = new HttpCrawler({
    maxConcurrency: 1,
    maxRequestsPerCrawl: 6,
    maxRequestRetries: 2,
    useSessionPool: false,
    ignoreSslErrors: false,
    navigationTimeoutSecs: 30,
    requestHandlerTimeoutSecs: 30,
    additionalMimeTypes: ["application/javascript", "text/javascript", "application/ecmascript"],
    requestHandler: async ({ body, request, response }) => {
      if (catalogue !== undefined) return;
      const statusCode = response.statusCode ?? 0;
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(`Gratis Bursdag: request returned ${statusCode} for ${request.url}`);
      }
      const source = Buffer.isBuffer(body) ? body.toString("utf8") : body;
      catalogue = parseCatalogue(source);
      if (catalogue !== undefined || request.userData.kind !== "page") return;
      // Discover the current Vite module instead of pinning its deploy hash.
      // Only enqueue scripts from the page's own origin; scripts never execute.
      const loadedUrl = request.loadedUrl ?? request.url;
      const page = new URL(loadedUrl);
      const scripts = [...source.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
        .map((match) => new URL(match[1]!, page))
        .filter((url) => url.origin === page.origin && /\.m?js$/.test(url.pathname));
      await crawler.addRequests(scripts.slice(0, 5).map((url) => ({ url: url.href, userData: { kind: "script" } })));
    },
    failedRequestHandler: async ({ request }, error) => {
      requestFailure = new Error(`Gratis Bursdag: ${request.url} failed after retries (${error.message.slice(0, 500)})`, { cause: error });
      input.logger.warn(requestFailure.message);
    },
  }, config);
  // Crawlee 3.16 recursively merges similar error messages. Long, one-line
  // upstream responses can overflow that tracker before retries are recorded.
  // Keep request errors in the normal logs and group statistics by name/code.
  crawler.stats.errorTracker = new ErrorTracker({ showErrorMessage: false });
  crawler.stats.errorTrackerRetry = new ErrorTracker({ showErrorMessage: false });
  await crawler.run([{ url: pageUrl, userData: { kind: "page" } }]);
  if (catalogue === undefined || catalogue.length === 0) {
    throw requestFailure ?? new Error("Gratis Bursdag: public offer catalogue not found or empty");
  }

  const offers = catalogue.map((entry): CashbackOffer => {
    const merchantName = clean(entry.brandName);
    // Explicit mappings take priority: a shared logo CDN or a fuzzy brand
    // match is not evidence that an offer applies to a merchant domain.
    const mappedDomains = input.overrides.gratisbursdag?.[merchantName.toLowerCase()];
    const domains = (mappedDomains ?? lookupDomains(input.domainLookup, merchantName))
      .map(normalizeDomainInput);
    if (domains.length === 0) {
      input.logger.warn(`Gratis Bursdag: no verified domain for ${merchantName}; keeping site listing only`);
    }
    const rules = calculationRules(entry);
    return {
      provider: "gratisbursdag",
      merchantName,
      domains,
      reward: birthdayReward(entry),
      ...(rules === undefined ? {} : { rewardCalculation: rules }),
      sourceUrl: PAGE_URL,
      activationUrl: PAGE_URL,
      terms: birthdayTerms(entry),
      updatedAt: input.generatedAt,
    };
  });
  input.logger.info(`Gratis Bursdag: ${offers.length} birthday offers`);
  return uniqueOffers(offers);
}

function parseCatalogue(source: string): BirthdayOffer[] | undefined {
  for (const match of source.matchAll(/JSON\.parse\(\s*`([^`]*?)`\s*\)/g)) {
    let data: unknown;
    try { data = JSON.parse(match[1]!); } catch { continue; }
    if (!Array.isArray(data) || !data.some((entry) => isRecord(entry) && "brandName" in entry)) continue;
    // A schema change must activate the normal bounded provider fallback,
    // rather than silently publishing incomplete or incorrectly typed offers.
    if (!data.every(isBirthdayOffer)) throw new Error("Gratis Bursdag: invalid offer catalogue");
    return data;
  }
  return undefined;
}

function isBirthdayOffer(value: unknown): value is BirthdayOffer {
  return isRecord(value) && typeof value.id === "number" && Number.isFinite(value.id) &&
    typeof value.brandName === "string" && clean(value.brandName).length > 0 &&
    ["offer", "description", "validity", "value"].every((key) => typeof value[key] === "string") &&
    ["requirements", "locations"].every((key) =>
      Array.isArray(value[key]) && value[key].every((item: unknown) => typeof item === "string")) &&
    typeof value.confirmed === "boolean" && (value.offerType === "gratis" || value.offerType === "rabatt");
}

function birthdayReward(entry: BirthdayOffer): string {
  // Read the benefit before the description, which may contain min. purchase,
  // validity, point balances, product sizes and other non-discount numbers.
  const benefit = `${clean(entry.offer)}\n${clean(entry.value)}`;
  const percentage = extractPercentageReward(benefit);
  if (percentage) return percentage;
  if (/\b2\s+for\s+1\b/i.test(benefit)) return "2 for 1";
  const fixed = extractKrReward(`Rabatt: ${benefit}`, { totalsum: false });
  if (fixed) return fixed;
  // Some coupon values only appear in the public description (Mester Grønn).
  if (/kupong|gavekort/i.test(benefit)) {
    const coupon = extractKrReward(`Rabatt: ${clean(entry.description)}`, { totalsum: false });
    if (coupon) return coupon;
  }
  if (entry.offerType === "gratis") return "0 kr totalsum";
  return clean(entry.offer) || "Bursdagsfordel";
}

function calculationRules(entry: BirthdayOffer): RewardCalculationRules | undefined {
  const text = `${clean(entry.offer)}\n${clean(entry.description)}`;
  const minimum = text.match(/\b(over|minst|minimum)\s+(\d+(?:[,.]\d+)?)\s*(?:kr|kroner)\b/i);
  const singleItemOnly = /\b(?:et|ett|én|en|valgfri(?:tt)?)\s+(?:(?:valgfri(?:tt)?|ordinær(?:e)?)\s+)?(?:produkt|vare|leke|is)\b|\bdyreste\s+(?:ordinære\s+)?vare\b/i.test(text);
  if (minimum === null && !singleItemOnly) return undefined;
  return {
    ...(minimum === null ? {} : {
      minimumPurchaseNok: Number(minimum[2]!.replace(",", ".")),
      minimumPurchaseExclusive: minimum[1]!.toLowerCase() === "over",
    }),
    ...(singleItemOnly ? { singleItemOnly: true } : {}),
  };
}

function birthdayTerms(entry: BirthdayOffer): string {
  return [
    `Bursdagstilbud: ${clean(entry.offer)}`,
    clean(entry.description),
    ...(entry.requirements.length > 0 ? [`Krav: ${entry.requirements.map(clean).join(", ")}`] : []),
    ...(entry.validity ? [`Gyldighet: ${clean(entry.validity)}`] : []),
    ...(entry.locations.length > 0 ? [`Hvor: ${entry.locations.map(clean).join(", ")}`] : []),
    entry.confirmed ? "Status hos gratisbursdag.no: bekreftet." : "Status hos gratisbursdag.no: ubekreftet.",
    "Bursdagsfordel, ikke cashback. Se butikkens vilkår og eventuell personlig kupong i app eller e-post.",
    "Kilde: gratisbursdag.no.",
  ].filter(Boolean).join("\n");
}

function clean(value: string): string {
  return stripHtml(value).replace(/\s+/g, " ").trim();
}
