// Lowest registered price per deal source, from each site's own public price-history data:
// - Klarna: product-information-edge-rest pricehistory, TWO_YEARS is the longest interval it
//   accepts (national offers, shipping excluded). The response names the product id.
// - Godpris: the product page's history section ("Billigste pris de siste tre månedene"),
//   the only period it publishes.
// - Prisradar: the page's GraphQL ProductPriceHistory; 120 months returns all it has.
// Prisjakt's all-time history is read in prisjakt-deal-details.ts.
import { isRecord } from "./cashback.js";
import { formatPrice } from "./price.js";
import { getDealLowPrice } from "./prisjakt-deals.js";

export type DealHistoryRange = "all" | "2y" | "3m";
export type DealPriceHistory = {
  lowestPriceEver: number;
  historyRange: DealHistoryRange;
  historyScope: "product";
  historyStartedAt?: string;
  historyUpdatedAt?: string;
};

export const klarnaPriceHistoryUrl = (productId: string) =>
  `https://www.klarna.com/no/api/product-information-edge-rest/public/pricehistory/product/${encodeURIComponent(productId)}/NO/DAY?merchantId=&selectedInterval=TWO_YEARS&filter=NATIONAL`;
export const godprisHistoryUrl = (productId: string, price: number, store: string) =>
  `https://godpris.no/api/product/history-section?id=i_${encodeURIComponent(productId)}&price=${encodeURIComponent(String(price))}&shop=${encodeURIComponent(store)}`;
export const PRISRADAR_GRAPHQL_URL = "https://gql.prisradar.no/";
export function prisradarHistoryRequest(productUrl: string): { url: string; body: string } | undefined {
  const slug = new URL(productUrl).pathname.match(/^\/produkter\/([^/]+)\/?$/)?.[1];
  if (!slug) return undefined;
  return {
    url: PRISRADAR_GRAPHQL_URL,
    body: JSON.stringify({ operationName: "Product", variables: { slug, interval: 120 }, query: "query Product($slug: String!, $interval: Int!) { ProductPriceHistory(interval: $interval, slug: $slug) { price date { iso } } }" }),
  };
}

const finitePrice = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
const iso = (value: unknown): string | undefined => typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined;

export function readKlarnaPriceHistory(value: unknown, productId: string): DealPriceHistory | undefined {
  if (!isRecord(value) || String(value.productId) !== productId || value.currencyCode !== "NOK" || !Array.isArray(value.history)) return undefined;
  const points = value.history.filter(isRecord).map((point) => ({ price: finitePrice(point.price), at: iso(point.timestamp) })).filter((point) => point.price !== undefined && point.at !== undefined);
  const lowest = finitePrice(value.lowest) ?? (points.length ? Math.min(...points.map((point) => point.price!)) : undefined);
  if (lowest === undefined || points.length === 0) return undefined;
  const times = points.map((point) => point.at!).sort();
  return { lowestPriceEver: lowest, historyRange: "2y", historyScope: "product", historyStartedAt: times[0]!, historyUpdatedAt: times.at(-1)! };
}

export function readGodprisHistorySection(html: string): DealPriceHistory | undefined {
  const match = html.match(/Billigste pris de siste tre månedene er kr\s*<span[^>]*>\s*([\d\s .]+(?:,\d{1,2})?)\s*<\/span>/i);
  if (!match) return undefined;
  const lowest = Number(match[1]!.replace(/[\s .]/g, "").replace(",", "."));
  return Number.isFinite(lowest) && lowest > 0 ? { lowestPriceEver: lowest, historyRange: "3m", historyScope: "product" } : undefined;
}

export function readPrisradarPriceHistory(value: unknown): DealPriceHistory | undefined {
  const rows = isRecord(value) && isRecord(value.data) && Array.isArray(value.data.ProductPriceHistory) ? value.data.ProductPriceHistory : undefined;
  if (!rows) return undefined;
  const points = rows.filter(isRecord).map((row) => ({ price: finitePrice(row.price), at: isRecord(row.date) ? iso(row.date.iso) : undefined })).filter((point) => point.price !== undefined && point.at !== undefined);
  if (points.length === 0) return undefined;
  const times = points.map((point) => point.at!).sort();
  return { lowestPriceEver: Math.min(...points.map((point) => point.price!)), historyRange: "all", historyScope: "product", historyStartedAt: times[0]!, historyUpdatedAt: times.at(-1)! };
}

export function isDealPriceHistory(value: unknown): value is DealPriceHistory {
  return isRecord(value) && finitePrice(value.lowestPriceEver) !== undefined &&
    (value.historyRange === "all" || value.historyRange === "2y" || value.historyRange === "3m") && value.historyScope === "product" &&
    (value.historyStartedAt === undefined || iso(value.historyStartedAt) !== undefined) &&
    (value.historyUpdatedAt === undefined || iso(value.historyUpdatedAt) !== undefined);
}

type HistoryJsonRequest = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<unknown | undefined>;
type HistoryTextRequest = (url: string, init?: { headers?: Record<string, string> }) => Promise<string | undefined>;
type HistoryOffer = { source?: string; productUrl: string; shopName: string; amount: number; currency: string };

const KLARNA_PRODUCT_ID = /^https:\/\/www\.klarna\.com\/no\/shopping\/pl\/(?:cl\d+\/)?(\d+)\//;
const GODPRIS_PRODUCT_ID = /^https:\/\/godpris\.no\/produkt\/([^/?#]+)/;

/** The price-match offer's lowest registered price, read from its own source's product history
 * (one request; the same readers as the deal pages). Undefined when the source keeps no
 * history, the product ID is not in the offer's URL, or the response does not name it. The
 * lowest includes today's confirmed price, so it is never above the offer. */
export async function findPriceMatchHistory(offer: HistoryOffer, requestJson: HistoryJsonRequest, requestText: HistoryTextRequest): Promise<DealPriceHistory | undefined> {
  if (offer.currency !== "NOK" || finitePrice(offer.amount) === undefined) return undefined;
  let history: DealPriceHistory | undefined;
  if (offer.source === "klarna") {
    const id = offer.productUrl.match(KLARNA_PRODUCT_ID)?.[1];
    if (id === undefined) return undefined;
    history = readKlarnaPriceHistory(await requestJson(klarnaPriceHistoryUrl(id), { headers: { Accept: "application/json" } }), id);
  } else if (offer.source === "godpris") {
    const id = offer.productUrl.match(GODPRIS_PRODUCT_ID)?.[1];
    if (id === undefined) return undefined;
    const html = await requestText(godprisHistoryUrl(decodeURIComponent(id), offer.amount, offer.shopName), { headers: { Accept: "text/html" } });
    history = html === undefined ? undefined : readGodprisHistorySection(html);
  } else if (offer.source === "prisradar") {
    const request = prisradarHistoryRequest(offer.productUrl);
    if (request === undefined) return undefined;
    history = readPrisradarPriceHistory(await requestJson(request.url, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: request.body }));
  }
  return history === undefined ? undefined : { ...history, lowestPriceEver: Math.min(offer.amount, history.lowestPriceEver) };
}

export type PriceHistoryNote = { atLow: boolean; value: string; label: string; title: string };

const RANGE_TEXT: Record<DealHistoryRange, { short: string; long: string }> = {
  "3m": { short: "3 mnd", long: "de siste tre månedene" },
  "2y": { short: "2 år", long: "de siste to årene" },
  all: { short: "all historikk", long: "gjennom hele historikken" },
};

/** Two short lines for a price-match row: «Laveste» / «2 år» at the low, or «−5,2 %» / «til lavpris»
 * above it (the share today's price must fall), with the source and period in the title. */
export function describePriceHistory(amount: number, history: DealPriceHistory, sourceName: string): PriceHistoryNote | undefined {
  const low = getDealLowPrice(amount, history.lowestPriceEver);
  if (low === undefined) return undefined;
  const range = RANGE_TEXT[history.historyRange];
  const atLow = amount <= low.lowestPrice;
  const percent = low.dropToLowPercent > 0 ? `${new Intl.NumberFormat("nb-NO").format(low.dropToLowPercent)} %` : undefined;
  const value = atLow ? "Laveste" : percent ? `−${percent}` : "<0,1 %";
  const title = [
    `Laveste registrerte varepris hos ${sourceName} ${range.long}: ${formatPrice(low.lowestPrice, "NOK")}, inkludert dagens pris.`,
    atLow ? "Dagens pris er på laveste registrerte nivå." : `Dagens pris må falle ${percent ?? "mindre enn 0,1 %"} for å nå den.`,
    history.historyStartedAt ? `Registrert siden ${new Date(history.historyStartedAt).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" })}.` : "",
    "Alle varianter av produktet. Frakt er ikke med.",
  ].filter(Boolean).join(" ");
  return { atLow, value, label: atLow ? range.short : "til lavpris", title };
}
