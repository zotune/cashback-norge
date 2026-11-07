// Lowest registered price per deal source, from each site's own public price-history data:
// - Klarna: product-information-edge-rest pricehistory, TWO_YEARS is the longest interval it
//   accepts (national offers, shipping excluded). The response names the product id.
// - Godpris: the product page's history section ("Billigste pris de siste tre månedene"),
//   the only period it publishes.
// - Prisradar: the page's GraphQL ProductPriceHistory; 120 months returns all it has.
// Prisjakt's all-time history is read in prisjakt-deal-details.ts.
import { isRecord } from "./cashback.js";

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
