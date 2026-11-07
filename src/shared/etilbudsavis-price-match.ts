// eTilbudsavis (Tjek): ukens kundeavistilbud fra matkjedene, som strukturerte tilbud.
// Kilde: offentlig søk i Tjeks API, som etilbudsavis.no og mattilbud.no bruker
// (squid-api.tjek.com/v2/offers/search, uten nøkkel, verifisert 2026-11-07). Hvert tilbud har
// varenavn, beskrivelse («185 g. Pr stk. Pr kg 162,16 / Førpris 37,90»), pris og førpris i NOK,
// mengde, gyldighet, kjede og et utklipp av tilbudet fra avisen. Endepunktet er ikke
// dokumentert for andre enn Tjek, så det kan endres. Uten posisjon geolokaliserer Tjek
// forespørselen (brukerens nettleser), slik at regionale aviser følger brukeren.
import type { GetPriceMatchForProductMessage, PriceMatchAlternative, PriceMatchOffer } from "./extension-messages.js";
import {
  cleanGroceryTitleCandidate,
  getGroceryPackageQuantity,
  hasGroceryBrandSignal,
  isLikelyGroceryPriceMatchContext,
  isLikelySameGroceryTitle,
  type ProductPackageQuantity,
} from "./grocery-price-match-utils.js";
import { formatKr } from "./reward-calculation.js";
import { readRecordArray, readStringValue } from "./values.js";

type JsonRequest = (url: string, init?: { headers?: Record<string, string>; credentials?: RequestCredentials }) => Promise<unknown>;

export const ETILBUDSAVIS_SEARCH_URL = "https://squid-api.tjek.com/v2/offers/search";
const ETILBUDSAVIS_SEARCH_LIMIT = 24;
const ETILBUDSAVIS_MAX_ALTERNATIVES = 8;

export type EtilbudsavisOffer = {
  heading: string;
  description: string;
  dealer: string;
  amount: number;
  prePrice?: number;
  quantity?: { unit: ProductPackageQuantity["unit"]; from: number; to: number };
  validFrom: string;
  validTo: string;
  imageUrl?: string;
};

export function buildEtilbudsavisSearchUrl(query: string): string {
  const params = new URLSearchParams({ query, limit: String(ETILBUDSAVIS_SEARCH_LIMIT) });
  return `${ETILBUDSAVIS_SEARCH_URL}?${params.toString()}`;
}

// Tjeks søk krever alle ordene («Friele Frokost Filtermalt» gir 0, «Friele» gir 3), så det søkes
// med merke og første produktord, deretter merket alene. Treffene kontrolleres etterpå.
export function buildEtilbudsavisQueries(message: GetPriceMatchForProductMessage): string[] {
  const title = cleanGroceryTitleCandidate(message.searchTerm)
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:x\s*\d+(?:[.,]\d+)?\s*)?(?:kg|g|gr|gram|l|ltr|liter|dl|cl|ml|stk|pk|pakning)\b/gi, " ")
    .replace(/[()[\],/|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const brand = message.productBrand?.trim();
  const brandWords = brand !== undefined ? brand.toLowerCase().split(/\s+/) : [];
  const words = title.split(" ").filter((word) => /\p{L}/u.test(word) && word.length >= 3);
  const productWords = words.filter((word) => !brandWords.includes(word.toLowerCase()));
  const queries = brand !== undefined && brand.length >= 2
    ? [[brand, productWords[0]].filter(Boolean).join(" "), brand]
    : [words.slice(0, 2).join(" ")];
  return [...new Set(queries.filter((query) => query.length >= 3))];
}

export function readEtilbudsavisOffers(value: unknown): EtilbudsavisOffer[] {
  if (!Array.isArray(value)) throw new Error("eTilbudsavis: uventet svar (forventet en liste med tilbud)");
  return readRecordArray(value).flatMap((item) => {
    const heading = readStringValue(item.heading)?.trim();
    const pricing = isRecord(item.pricing) ? item.pricing : undefined;
    const amount = typeof pricing?.price === "number" && Number.isFinite(pricing.price) && pricing.price > 0 ? pricing.price : undefined;
    const dealer = isRecord(item.dealer) ? readStringValue(item.dealer.name) : isRecord(item.branding) ? readStringValue(item.branding.name) : undefined;
    const validFrom = readStringValue(item.run_from);
    const validTo = readStringValue(item.run_till);
    // Bare eksplisitt NOK; et tilbud uten pris eller valuta er ikke et kjøpbart tilbud.
    if (heading === undefined || amount === undefined || pricing?.currency !== "NOK" || dealer === undefined || validFrom === undefined || validTo === undefined) return [];
    const prePrice = typeof pricing.pre_price === "number" && Number.isFinite(pricing.pre_price) && pricing.pre_price > amount ? pricing.pre_price : undefined;
    const quantity = readEtilbudsavisQuantity(item.quantity);
    const images = isRecord(item.images) ? item.images : undefined;
    const imageUrl = readStringValue(images?.view) ?? readStringValue(images?.zoom) ?? readStringValue(images?.thumb);
    return [{
      heading,
      description: readStringValue(item.description)?.trim() ?? "",
      dealer: dealer.trim(),
      amount,
      ...(prePrice !== undefined ? { prePrice } : {}),
      ...(quantity !== undefined ? { quantity } : {}),
      validFrom,
      validTo,
      ...(imageUrl !== undefined && imageUrl.startsWith("https://") ? { imageUrl } : {}),
    }];
  });
}

// quantity.unit.symbol er g/kg/ml/l/pcs med si.factor; size.from–to er avisens mengde (kan være et spenn).
function readEtilbudsavisQuantity(value: unknown): EtilbudsavisOffer["quantity"] {
  if (!isRecord(value) || !isRecord(value.unit) || !isRecord(value.size)) return undefined;
  const symbol = readStringValue(value.unit.symbol)?.toLowerCase();
  const factors: Record<string, [ProductPackageQuantity["unit"], number]> = {
    g: ["g", 1], kg: ["g", 1000], ml: ["ml", 1], cl: ["ml", 10], dl: ["ml", 100], l: ["ml", 1000], pcs: ["pcs", 1],
  };
  const unit = symbol !== undefined ? factors[symbol] : undefined;
  const from = typeof value.size.from === "number" ? value.size.from : undefined;
  const to = typeof value.size.to === "number" ? value.size.to : undefined;
  if (unit === undefined || from === undefined || to === undefined || !(from > 0) || to < from) return undefined;
  return { unit: unit[0], from: from * unit[1], to: to * unit[1] };
}

function isActive(offer: EtilbudsavisOffer, now: number): boolean {
  const from = Date.parse(offer.validFrom);
  const to = Date.parse(offer.validTo);
  return Number.isFinite(from) && Number.isFinite(to) && from <= now && now <= to;
}

// Mengden må stemme med varen på siden når begge er kjent; et avisspenn («150–200 g») godtas
// når sidens mengde ligger innenfor. Uten mengde på siden kreves merke og tittel.
function matchesQuantity(offer: EtilbudsavisOffer, quantity: ProductPackageQuantity | undefined): boolean {
  if (quantity === undefined) return true;
  if (offer.quantity === undefined || offer.quantity.unit !== quantity.unit) return false;
  return quantity.amount >= offer.quantity.from - 0.5 && quantity.amount <= offer.quantity.to + 0.5;
}

// «Et utvalg» / «flere varianter»: tilbudet gjelder en gruppe varer fra merket, ikke én bestemt.
const ASSORTMENT_PATTERN = /\b(?:et\s+utvalg|utvalgte|flere\s+(?:varianter|sorter|typer)|ass(?:\.|ortert)|diverse\s+varianter)\b/i;

export function isEtilbudsavisAssortment(offer: EtilbudsavisOffer): boolean {
  return ASSORTMENT_PATTERN.test(`${offer.heading} ${offer.description}`);
}

export function selectEtilbudsavisMatches(
  offers: EtilbudsavisOffer[],
  message: GetPriceMatchForProductMessage,
  now = Date.now(),
): EtilbudsavisOffer[] {
  const quantity = getGroceryPackageQuantity(message);
  return offers
    .filter((offer) => isActive(offer, now))
    .filter((offer) => hasGroceryBrandSignal(message, `${offer.heading} ${offer.description}`))
    // Et utvalg krever merket og mengden; ellers må varenavnet også ligne.
    .filter((offer) => isLikelySameGroceryTitle(message, offer.heading, 0.45) ||
      (isEtilbudsavisAssortment(offer) && message.productBrand !== undefined && quantity !== undefined))
    .filter((offer) => matchesQuantity(offer, quantity))
    .sort((left, right) => left.amount - right.amount);
}

export async function findEtilbudsavisPriceMatch(
  message: GetPriceMatchForProductMessage,
  requestJson: JsonRequest = fetchEtilbudsavisJson,
  now = Date.now(),
): Promise<PriceMatchOffer | undefined> {
  if (!isLikelyGroceryPriceMatchContext(message.url, message.productUrl)) return undefined;
  // Uten merke eller mengde er tittelen alene for svak til å koble et kundeavistilbud.
  if (message.productBrand === undefined && getGroceryPackageQuantity(message) === undefined) return undefined;
  let matches: EtilbudsavisOffer[] = [];
  let query: string | undefined;
  for (const candidate of buildEtilbudsavisQueries(message)) {
    const value = await requestJson(buildEtilbudsavisSearchUrl(candidate), { headers: { Accept: "application/json" }, credentials: "omit" });
    if (value === undefined) throw new Error(`eTilbudsavis: ingen svar fra ${ETILBUDSAVIS_SEARCH_URL} for «${candidate}»`);
    matches = selectEtilbudsavisMatches(readEtilbudsavisOffers(value), message, now);
    query = candidate;
    if (matches.length > 0) break;
  }
  const best = matches[0];
  if (best === undefined || query === undefined) return undefined;
  const alternatives = matches.slice(0, ETILBUDSAVIS_MAX_ALTERNATIVES).map(toAlternative);
  return {
    source: "etilbudsavis",
    sourceName: "eTilbudsavis",
    // Et utvalg eller ukjent mengde er ikke bekreftet som nøyaktig samme vare.
    matchedExactProduct: getGroceryPackageQuantity(message) !== undefined && !isEtilbudsavisAssortment(best),
    shopName: best.dealer,
    price: formatNok(best.amount),
    amount: best.amount,
    currency: "NOK",
    productName: formatHeading(best.heading),
    productUrl: `https://etilbudsavis.no/soek/${encodeURIComponent(query)}`,
    ...(best.imageUrl !== undefined ? { imageUrl: best.imageUrl } : {}),
    details: [
      `Kundeavistilbud hos ${best.dealer}, gyldig ${formatValidity(best)}.`,
      best.description !== "" ? best.description.replace(/\n+/g, " · ") : undefined,
      "Tilbud og priser i kundeavisen kan variere mellom regioner og butikker, og gjelder så langt lageret rekker.",
    ].filter((line): line is string => line !== undefined).join("\n\n"),
    alternatives,
  };
}

const ETILBUDSAVIS_TIMEOUT_MS = 10_000;

async function fetchEtilbudsavisJson(url: string, init?: Parameters<JsonRequest>[1]): Promise<unknown> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(ETILBUDSAVIS_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`eTilbudsavis: HTTP ${response.status} fra ${url}`);
  return response.json();
}

function toAlternative(offer: EtilbudsavisOffer): PriceMatchAlternative {
  return {
    shopName: offer.dealer,
    productName: formatHeading(offer.heading),
    price: formatNok(offer.amount),
    amount: offer.amount,
    currency: "NOK",
    platform: [
      isEtilbudsavisAssortment(offer) ? "Gjelder et utvalg" : undefined,
      offer.prePrice !== undefined ? `Førpris ${formatNok(offer.prePrice)}` : undefined,
      `t.o.m. ${formatDate(offer.validTo)}`,
    ].filter((part): part is string => part !== undefined).join(", "),
    ...(offer.imageUrl !== undefined ? { imageUrl: offer.imageUrl } : {}),
  };
}

// Avisene skriver varenavn med versaler («MILLS KAVIAR TUBE»).
function formatHeading(heading: string): string {
  return heading === heading.toUpperCase() ? heading.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_match, space: string, letter: string) => space + letter.toUpperCase()) : heading;
}

function formatValidity(offer: EtilbudsavisOffer): string {
  return `${formatDate(offer.validFrom)}–${formatDate(offer.validTo)}`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short", timeZone: "Europe/Oslo" }).format(date).replace(/\.$/, "");
}

function formatNok(amount: number): string {
  return `${formatKr(amount)} kr`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
