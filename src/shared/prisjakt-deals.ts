// Prisjakt's "Dagens tilbud" (prisjakt.no/tema/dagens-tilbud): products Prisjakt rates as
// cheaper than expected right now. No separate list endpoint is used; the server-rendered
// Next.js data (self.__next_f) carries one `productCardData` object per product card with
// the featured offer (shop, price, the shop's own pre-price, stock, condition) and the
// product (name, category, image, Prisjakt's price drop in percent). Read without running
// any of the page's scripts.
//
// `priceDrop` is Prisjakt's measure against the product's usual price; `originalPrice` is
// the shop's own pre-price. They are different numbers and are kept apart.

import { readLdJsonScripts, readNextFlightPayloads } from "./product-data.js";

/** A verified current offer is also an observed price, even before the chart updates. */
export function getDealLowPrice(current: number, historical: number | undefined): { lowestPrice: number; dropToLowPercent: number } | undefined {
  if (!Number.isFinite(current) || current <= 0 || historical === undefined || !Number.isFinite(historical) || historical <= 0) return undefined;
  const lowestPrice = Math.min(current, historical);
  return { lowestPrice, dropToLowPercent: Math.round((current - lowestPrice) / current * 1000) / 10 };
}

export type PrisjaktDeal = {
  id: string;
  name: string;
  brand?: string;
  category?: string;
  imageUrl?: string;
  copyImageUrl?: string;
  productUrl: string;
  offerUrl?: string;
  store: string;
  storeId?: number;
  shopOfferId?: string;
  storeLogoUrl?: string;
  storeIconUrl?: string;
  storeUrl?: string;
  price: number;
  currency: "NOK";
  /** The shop's own pre-price, when it shows one. */
  originalPrice?: number;
  /** Prisjakt's price drop against the usual price, in percent. */
  priceDrop?: number;
  storeCount?: number;
  validTo?: string;
  lowestPrice90Days?: number;
  lowestPriceEver?: number;
  historyStartedAt?: string;
  historyVariantIds?: number[];
  historyScope?: "product" | "variant";
  /** Period the lowest price covers: Prisjakt and Prisradar all registered history, Klarna two years, Godpris three months. */
  historyRange?: "all" | "2y" | "3m";
  historyUpdatedAt?: string;
};

const PRISJAKT_ORIGIN = "https://www.prisjakt.no";

/** The decoded React Server Components payload of a Next.js page. */
export function readNextFlightData(html: string): string {
  return readNextFlightPayloads(html).join("");
}

/** Deals on one page: new products in stock with a valid NOK price, without duplicates. */
export function readPrisjaktDeals(html: string): PrisjaktDeal[] {
  const data = readNextFlightData(html);
  if (data.length === 0) throw new Error("Prisjakt: no Next.js page data in the response");
  if (!data.includes('"productCardData":{')) throw new Error("Prisjakt: no product cards in the page data (format changed?)");
  // Cards omit currency; the page's ItemList/Offer JSON-LD explicitly identifies
  // it. Require an unambiguous NOK catalogue rather than guessing.
  const currencies = new Set<string>();
  const pending = [...readLdJsonScripts(html)];
  for (let index = 0; index < pending.length && index < 50000; index += 1) {
    const value = pending[index];
    if (Array.isArray(value)) pending.push(...value);
    else {
      const entry = record(value);
      if (entry) {
        if (typeof entry.priceCurrency === "string") currencies.add(entry.priceCurrency);
        pending.push(...Object.values(entry));
      }
    }
  }
  if (currencies.size !== 1 || !currencies.has("NOK")) throw new Error("Prisjakt: missing or ambiguous NOK currency in catalogue JSON-LD");
  const deals = new Map<string, PrisjaktDeal>();
  let found = 0;
  for (const match of data.matchAll(/"productCardData":\{/g)) {
    const json = readBalancedObject(data, match.index! + match[0].length - 1);
    if (json === undefined) continue;
    let card: unknown;
    try { card = JSON.parse(json); } catch { continue; }
    found += 1;
    const deal = toDeal(card);
    if (deal !== undefined && !deals.has(deal.id)) deals.set(deal.id, deal);
  }
  if (found === 0) throw new Error("Prisjakt: no product cards in the page data (format changed?)");
  return [...deals.values()];
}

function toDeal(card: unknown): PrisjaktDeal | undefined {
  const data = record(record(card)?.data);
  const offer = record(data?.offer);
  const product = record(data?.product);
  if (offer === undefined || product === undefined) return undefined;
  // Only new products the shop reports in stock; used, refurbished and unknown stock are left out.
  if (offer.condition !== "new" || offer.stockStatus !== "in_stock" || offer.membershipRequiresCompensation === true) return undefined;
  if (offer.priceCurrency !== undefined && offer.priceCurrency !== "NOK") return undefined;
  const id = typeof product.id === "number" || typeof product.id === "string" ? String(product.id) : undefined;
  const name = text(product.name);
  const price = amount(offer.price);
  const store = text(offer.storeName);
  const link = text(product.productLink);
  if (id === undefined || !/^\d+$/.test(id) || name === undefined || price === undefined || store === undefined || link === undefined) return undefined;
  let productUrl: URL;
  try { productUrl = new URL(link, PRISJAKT_ORIGIN); } catch { return undefined; }
  if (productUrl.origin !== PRISJAKT_ORIGIN) return undefined;
  const offerUrl = text(offer.offerLink);
  const originalPrice = amount(offer.originalPrice);
  const priceDrop = typeof product.priceDrop === "number" && product.priceDrop > 0 && product.priceDrop < 100 ? Math.round(product.priceDrop) : undefined;
  const imageUrl = text(product.logo);
  const category = text(record(product.category)?.categoryName);
  const brand = text(product.brandName);
  const storeCount = typeof product.storeCount === "number" && product.storeCount > 0 ? product.storeCount : undefined;
  const rawExpiry = typeof offer.priceExpiresAt === "string" ? offer.priceExpiresAt.replace(/^\$D/, "") : "";
  const validTo = Number.isFinite(Date.parse(rawExpiry)) ? new Date(rawExpiry).toISOString() : undefined;
  return {
    id, name, store, price, currency: "NOK",
    ...(typeof offer.storeId === "number" ? { storeId: offer.storeId } : {}),
    ...(text(offer.shopOfferId) ? { shopOfferId: text(offer.shopOfferId)! } : {}),
    productUrl: productUrl.href,
    ...(offerUrl !== undefined && offerUrl.startsWith(`${PRISJAKT_ORIGIN}/go-to-shop/`) ? { offerUrl } : {}),
    ...(originalPrice !== undefined && originalPrice > price ? { originalPrice } : {}),
    ...(priceDrop !== undefined ? { priceDrop } : {}),
    ...(imageUrl !== undefined && imageUrl.startsWith("https://") ? { imageUrl } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(brand !== undefined ? { brand } : {}),
    ...(storeCount !== undefined ? { storeCount } : {}),
    ...(validTo !== undefined ? { validTo } : {}),
  };
}

function readBalancedObject(data: string, start: number): string | undefined {
  let depth = 0;
  let inString = false;
  for (let index = start; index < data.length && index < start + 20_000; index += 1) {
    const char = data[index];
    if (inString) {
      if (char === "\\") index += 1;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return data.slice(start, index + 1);
    }
  }
  return undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
// React's "$undefined" placeholder and empty strings are missing values.
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" && !value.startsWith("$") ? value.trim() : undefined;
}
function amount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

// Prisjakt's deals span ~150 narrow categories; the page groups them into a few broad ones
// for its chips. The specific category stays visible on each row. First match wins.
const DEAL_GROUPS: Array<[string, RegExp]> = [
  ["Jul", /julekalender|julelys/i],
  ["Data og gaming", /tastatur|^pc-|^data$|datamus|grafikkort|skjermkort|bærbar|stasjonær|hovedkort|\(cpu\)|ram-minne|\bssd\b|\bmus\b|musematt|gaming|ratt & pedal|joystick|håndkontroll|playstation|nintendo|xbox|router|skriver|3d-printer|nettbrett/i],
  ["Lyd, bilde og mobil", /^tv$|hodetelefon|høyttaler|lydplanke|radio|projektor|forsterker|mikrofon|mobiltelefon|smartklokke|aktivitetsmåler|kamera|objektiv|drone|portable batteri/i],
  ["Hvitevarer", /vaskemaskin|tørketromle|oppvaskmaskin|innbyggingsovn|platetopp|kombiskap|kjøleskap|komfyr|mikrobølge|fryser/i],
  ["Sport og friluft", /\bski\b|ski |alpinski|langrenn|sykkel|hodelykt|vannflask|stormkjøkken/i],
  ["Kjøkken", /espresso|kaffe|foodprosessor|kjøkken|mikser|blender|vaffel|airfryer|frityr|iskrem|smørbrød|kniv|gryte|stekepanne|bestikk|^glass$|skål|krus|kanne|karaf|termos|kvern/i],
  ["Klær og sko", /klær|jakke|sko\b|sko |støvle|bukse|boxer|undertøy|^vester$|parkdress|jeans|votter|hansker|tøfler|sneakers|ryggsekk|koffert|solbriller|^klokker|armbåndsur/i],
  ["Skjønnhet og helse", /hudpleie|helse|parfyme|deodorant|bodylotion|ansikt|hår|barbermaskin|trimmer|solkrem|øyne|diabetes/i],
  ["Barn og leker", /lego|dukke|leke|brettspill|barnevogn|vognpose|bilstol/i],
  ["Verktøy", /verktøy|sag\b|sager|boremaskin|skrumaskin|slipemaskin|nøkkel|laser|kompressor|motorsag/i],
  ["Hjem og hage", /støvsuger|gressklipper|luftfukter|avfukter|luftrenser|vifte|varmeovn|peis|vedovn|lys|lampe|dørklokke|smarte låser|dampvask|ladestasjon|platemateriale/i],
];
export const PRISJAKT_OTHER_GROUP = "Annet";

export function getPrisjaktDealGroup(category: string | undefined): string {
  if (category === undefined) return PRISJAKT_OTHER_GROUP;
  return DEAL_GROUPS.find(([, pattern]) => pattern.test(category))?.[0] ?? PRISJAKT_OTHER_GROUP;
}
export const PRISJAKT_DEAL_GROUPS = [...DEAL_GROUPS.map(([name]) => name), PRISJAKT_OTHER_GROUP];
