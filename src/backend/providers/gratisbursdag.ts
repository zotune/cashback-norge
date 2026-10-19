// Extracts public birthday offers without executing third-party JavaScript.
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
  const html = await fetchText(pageUrl);
  // The current site ships its catalogue as JSON.parse(`[...]`) inside a
  // hashed Vite module. Discover the filename on every run; it changes on deploy.
  const scriptUrls = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => new URL(match[1]!, pageUrl))
    .filter((url) => url.origin === new URL(pageUrl).origin && /\.m?js$/.test(url.pathname));
  let catalogue = parseCatalogue(html);
  for (const url of scriptUrls.slice(0, 5)) {
    if (catalogue !== undefined) break;
    catalogue = parseCatalogue(await fetchText(url.href));
  }
  if (catalogue === undefined || catalogue.length === 0) {
    throw new Error("Gratis Bursdag: public offer catalogue not found or empty");
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

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "CashbackNorge/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Gratis Bursdag: request returned ${response.status}`);
  return response.text();
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
