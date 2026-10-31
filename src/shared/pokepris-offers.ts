import { isRecord, parseUrl } from "./cashback.js";
import { formatPrice, readPriceAmount } from "./price.js";
import { readNextFlightValues } from "./product-data.js";
import { decodeHtmlEntities, isSameProductUrl, normalizePriceMatchShopName } from "./product-match.js";
import { readTcgSealedOfferIssue } from "./tcg-product-match.js";

export type PokeprisOfferDiagnostic = { reason: string; offerUrl?: string; offerProductName?: string; shopName?: string };

// Only the price component for this product ID may contribute merchant rows.
// Recommendations can have the same field names. Never search those globally.
function readPriceRows(html: string, productUrl: string): { rows: Record<string, unknown>[]; issue?: never } | { issue: string; rows?: never } {
  const id = new URL(productUrl).pathname.split("/")[2];
  const pending = readNextFlightValues(html);
  const components: Record<string, unknown>[] = [];
  for (let visited = 0; visited < pending.length && visited < 50_000; visited += 1) {
    const item = pending[visited];
    if (Array.isArray(item)) pending.push(...item);
    else if (isRecord(item)) {
      if (isRecord(item.product) && String(item.product.id) === id && Object.hasOwn(item, "lowestPrice") &&
        Array.isArray(item.otherInStockPrices) && Array.isArray(item.outOfStockPrices)) components.push(item);
      pending.push(...Object.values(item));
    }
  }
  const rowLists = components.map((item) => [item.lowestPrice, ...(item.otherInStockPrices as unknown[]), ...(item.outOfStockPrices as unknown[])]);
  if (rowLists.length === 0) return { issue: "missing-product-price-data" };
  if (new Set(rowLists.map((rows) => JSON.stringify(rows))).size !== 1) return { issue: "ambiguous-product-price-data" };
  return { rows: rowLists[0]!.filter(isRecord) };
}

export function readPokeprisOffers(html: string, rawOffers: unknown[], productUrl: string, productName: string, language: string,
  onDiagnostic: (event: PokeprisOfferDiagnostic) => void) {
  const scoped = readPriceRows(html, productUrl);
  if (scoped.issue !== undefined) {
    onDiagnostic({ reason: scoped.issue });
    return undefined;
  }
  const verified = rawOffers.filter(isRecord).flatMap((offer) => {
    const shopName = isRecord(offer.seller) && typeof offer.seller.name === "string" ? offer.seller.name.trim() : "";
    const url = typeof offer.url === "string" ? parseUrl(offer.url) : undefined;
    const diagnostic: PokeprisOfferDiagnostic = { reason: "", ...(url !== undefined ? { offerUrl: url.href } : {}), ...(shopName ? { shopName } : {}) };
    const reject = (reason: string) => { onDiagnostic({ ...diagnostic, reason: `offer-${reason}` }); return []; };
    if (!shopName || shopName === "Butikk" || url === undefined || !["http:", "https:"].includes(url.protocol)) return reject("missing-merchant-url");
    const rows = scoped.rows.filter((row) => typeof row.product_url === "string" && isSameProductUrl(row.product_url, url.href));
    if (rows.length === 0) return reject("missing-price-row");
    if (rows.length !== 1) return reject("ambiguous-price-row");
    const row = rows[0]!;
    if (row.redacted === true || typeof row.product_name !== "string" || !row.product_name.trim()) return reject("missing-original-title");
    const originalTitle = decodeHtmlEntities(row.product_name);
    diagnostic.offerProductName = originalTitle;
    if (typeof row.store_name !== "string" || normalizePriceMatchShopName(row.store_name) !== normalizePriceMatchShopName(shopName)) return reject("merchant-mismatch");
    const variantIssue = readTcgSealedOfferIssue(productName, originalTitle, language);
    if (variantIssue !== undefined) return reject(variantIssue);
    if (offer.itemCondition !== "https://schema.org/NewCondition") return reject("condition-mismatch");
    if (offer.priceCurrency !== "NOK") return reject("currency-mismatch");
    const amount = readPriceAmount(offer.price);
    if (amount === undefined || amount <= 0) return reject("invalid-price");
    if (readPriceAmount(row.current_price) !== amount) return reject("price-mismatch");
    const preorder = row.is_preorder === true;
    const inStock = offer.availability === "https://schema.org/InStock" && row.in_stock === true && row.is_preorder === false;
    if (preorder) onDiagnostic({ ...diagnostic, reason: "offer-preorder" });
    else if (!inStock) onDiagnostic({ ...diagnostic, reason: "offer-not-confirmed-in-stock" });
    return [{ shopName, amount, currency: "NOK", price: formatPrice(amount, "NOK"), offerUrl: url.href,
      shippingPrice: "Frakt ukjent", inStock, preorder }];
  });
  // Sold-out rows are often missing from JSON-LD. Their own original title
  // can still prove identity, never price; rows already judged above are skipped.
  const judgedUrls = rawOffers.filter(isRecord).map((offer) => typeof offer.url === "string" ? offer.url : "");
  const rowIdentity = new Map<string, { shopName: string; offerUrl: string } | undefined>();
  for (const row of scoped.rows) {
    const url = typeof row.product_url === "string" ? parseUrl(row.product_url) : undefined;
    if (url === undefined || !["http:", "https:"].includes(url.protocol) || judgedUrls.some((judged) => isSameProductUrl(judged, url.href))) continue;
    const valid = row.redacted !== true && typeof row.store_name === "string" && row.store_name.trim() !== "" &&
      typeof row.product_name === "string" && readTcgSealedOfferIssue(productName, decodeHtmlEntities(row.product_name), language) === undefined;
    // Every row for the URL must agree.
    const key = url.href;
    rowIdentity.set(key, valid && (!rowIdentity.has(key) || rowIdentity.get(key) !== undefined) ? { shopName: String(row.store_name).trim(), offerUrl: key } : undefined);
  }
  return {
    identityOffers: [...verified.map(({ shopName, offerUrl }) => ({ shopName, offerUrl })),
      ...[...rowIdentity.values()].filter((offer) => offer !== undefined)],
    offers: verified.filter((offer) => offer.inStock).map(({ inStock: _stock, preorder: _preorder, ...offer }) => offer).sort((a, b) => a.amount - b.amount),
    preorders: verified.filter((offer) => offer.preorder).map(({ shopName, amount, currency }) => ({ shopName, amount, currency })),
  };
}
