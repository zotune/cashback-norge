import type {
  GetPriceMatchForProductMessage,
  PriceMatchOffer,
} from "./extension-messages.js";

export type JsonRequest = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<unknown | undefined>;

const PRISJAKT_NATIVE_GRAPHQL_URL = "https://native-backend.cloud.pji.nu/v1/graphql";
const PRISJAKT_NATIVE_AUTHORIZATION = "Bearer JaNdRgUkXp2s5u8x/A?D(G+KbPeShVmY";

const PRISJAKT_PRODUCT_BY_OFFER_URL_QUERY = `
query SearchProductsByOfferURL($offerUrl: String!) {
  productsByOfferUrl(offerUrl: $offerUrl) {
    id
    name
    webUri
  }
}
`;

const PRISJAKT_OFFER_LIST_QUERY = `
query OfferList($productId: Int!) {
  product(id: $productId) {
    id
    name
    webUri
    offers {
      externalUri
      condition
      availability {
        status
      }
      stock {
        status
      }
      shop {
        name
        currency
      }
      price {
        exclShipping
      }
      shipping {
        cheapest {
          shippingCost
        }
      }
    }
  }
}
`;

export async function findPrisjaktPriceMatch(
  message: GetPriceMatchForProductMessage,
  requestJson: JsonRequest = fetchJson,
): Promise<PriceMatchOffer | undefined> {
  if (!message.productPageClue && message.searchTerm.trim().length < 8) {
    return undefined;
  }

  const nativeOffer = await fetchNativePrisjaktPriceMatch(message, requestJson);
  if (nativeOffer !== undefined && isNorwegianPriceMatchOffer(nativeOffer)) {
    return nativeOffer;
  }

  const identifyOffer = await fetchPrisjaktIdentify(message, requestJson);
  if (identifyOffer !== undefined && isNorwegianPriceMatchOffer(identifyOffer)) {
    return identifyOffer;
  }

  const searchOffer = await fetchPrisjaktSearch(message.searchTerm, requestJson);
  return searchOffer !== undefined && isNorwegianPriceMatchOffer(searchOffer)
    ? searchOffer
    : undefined;
}

async function fetchNativePrisjaktPriceMatch(
  message: GetPriceMatchForProductMessage,
  requestJson: JsonRequest,
): Promise<PriceMatchOffer | undefined> {
  try {
    const product = await fetchNativePrisjaktProductByOfferUrls([message.url, message.productUrl], requestJson);
    if (product === undefined) return undefined;

    return fetchBestNativePrisjaktOffer(product, requestJson);
  } catch {
    return undefined;
  }
}

async function fetchBestNativePrisjaktOffer(
  product: NativePrisjaktProduct,
  requestJson: JsonRequest,
): Promise<PriceMatchOffer | undefined> {
  const offers = (await fetchNativePrisjaktOffers(product.id, requestJson))
    .filter((offer) => isNorwegianPriceMatchCurrency(offer.currency));
  if (offers.length === 0) return undefined;

  const sortedOffers = [...offers].sort((first, second) => first.sortAmount - second.sortAmount);
  const bestOffer = sortedOffers[0];
  if (bestOffer === undefined) return undefined;

  return {
    source: "prisjakt",
    sourceName: "Prisjakt",
    shopName: bestOffer.shopName,
    amount: bestOffer.amount,
    sortAmount: bestOffer.sortAmount,
    currency: bestOffer.currency,
    price: formatPrisjaktPrice(bestOffer.amount, bestOffer.currency),
    productName: product.name,
    productUrl: product.productUrl,
    ...(bestOffer.offerUrl !== undefined ? { offerUrl: bestOffer.offerUrl } : {}),
    alternatives: sortedOffers.slice(0, 8).map((offer) => ({
      shopName: offer.shopName,
      amount: offer.amount,
      sortAmount: offer.sortAmount,
      currency: offer.currency,
      price: formatPrisjaktPrice(offer.amount, offer.currency),
      shippingPrice: formatShippingPrice(offer.shippingAmount, offer.currency),
      ...(offer.shippingAmount > 0 ? { totalPrice: formatPrisjaktPrice(offer.sortAmount, offer.currency) } : {}),
    })),
  };
}

type NativePrisjaktProduct = {
  id: number;
  name: string;
  productUrl: string;
};

type NativePrisjaktOffer = {
  shopName: string;
  amount: number;
  sortAmount: number;
  shippingAmount: number;
  currency: string;
  offerUrl?: string;
};

async function fetchNativePrisjaktProductByOfferUrls(
  offerUrls: Array<string | undefined>,
  requestJson: JsonRequest,
): Promise<NativePrisjaktProduct | undefined> {
  const candidateUrls = uniqueStrings([
    ...offerUrls,
    ...offerUrls.map((url) => url !== undefined ? toCanonicalProductPageUrl(url) : undefined),
  ]);

  for (const candidateUrl of candidateUrls) {
    const product = await fetchNativePrisjaktProductBySingleOfferUrl(candidateUrl, requestJson);
    if (product !== undefined) return product;
  }

  return undefined;
}

async function fetchNativePrisjaktProductBySingleOfferUrl(
  offerUrl: string,
  requestJson: JsonRequest,
): Promise<NativePrisjaktProduct | undefined> {
  const value = await requestJson(PRISJAKT_NATIVE_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Authorization": PRISJAKT_NATIVE_AUTHORIZATION,
      "Content-Type": "application/json",
      "Market": "no",
    },
    body: JSON.stringify({
      operationName: "SearchProductsByOfferURL",
      query: PRISJAKT_PRODUCT_BY_OFFER_URL_QUERY,
      variables: { offerUrl },
    }),
  });
  if (!isPlainRecord(value) || !isPlainRecord(value.data) || !Array.isArray(value.data.productsByOfferUrl)) {
    return undefined;
  }

  for (const product of value.data.productsByOfferUrl) {
    if (!isPlainRecord(product)) continue;
    const id = readNumberLike(product.id);
    const name = typeof product.name === "string" ? product.name : undefined;
    const productUrl = typeof product.webUri === "string" ? product.webUri : undefined;
    if (id !== undefined && name !== undefined && productUrl !== undefined) {
      return { id, name, productUrl };
    }
  }

  return undefined;
}

async function fetchNativePrisjaktOffers(
  productId: number,
  requestJson: JsonRequest,
): Promise<NativePrisjaktOffer[]> {
  const value = await requestJson(PRISJAKT_NATIVE_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Authorization": PRISJAKT_NATIVE_AUTHORIZATION,
      "Content-Type": "application/json",
      "Market": "no",
    },
    body: JSON.stringify({
      operationName: "OfferList",
      query: PRISJAKT_OFFER_LIST_QUERY,
      variables: { productId },
    }),
  });
  if (!isPlainRecord(value) || !isPlainRecord(value.data) || !isPlainRecord(value.data.product) || !Array.isArray(value.data.product.offers)) {
    return [];
  }

  return value.data.product.offers
    .map(readNativePrisjaktOffer)
    .filter((offer): offer is NativePrisjaktOffer => offer !== undefined);
}

function readNativePrisjaktOffer(value: unknown): NativePrisjaktOffer | undefined {
  if (!isPlainRecord(value)) return undefined;
  const shop = isPlainRecord(value.shop) ? value.shop : undefined;
  const price = isPlainRecord(value.price) ? value.price : undefined;
  const shipping = isPlainRecord(value.shipping) ? value.shipping : undefined;
  const availability = isPlainRecord(value.availability) ? value.availability : undefined;
  const stock = isPlainRecord(value.stock) ? value.stock : undefined;
  const cheapestShipping = isPlainRecord(shipping?.cheapest) ? shipping.cheapest : undefined;
  const shopName = typeof shop?.name === "string" ? shop.name : undefined;
  const currency = typeof shop?.currency === "string" ? shop.currency : undefined;
  const amount = typeof price?.exclShipping === "number" ? price.exclShipping : undefined;
  const shippingAmount = typeof cheapestShipping?.shippingCost === "number" ? cheapestShipping.shippingCost : 0;
  const condition = typeof value.condition === "string" ? value.condition : undefined;
  const availabilityStatus = typeof availability?.status === "string" ? availability.status : undefined;
  const stockStatus = typeof stock?.status === "string" ? stock.status : undefined;
  if (shopName === undefined || currency === undefined || amount === undefined) return undefined;
  if (condition !== undefined && condition.toUpperCase() !== "NEW") return undefined;
  if (availabilityStatus !== undefined && BAD_AVAILABILITY_STATUSES.has(availabilityStatus.toUpperCase())) return undefined;
  if (stockStatus !== undefined && BAD_STOCK_STATUSES.has(stockStatus.toLowerCase())) return undefined;

  const offerUrl = typeof value.externalUri === "string" && value.externalUri.length > 0
    ? value.externalUri
    : undefined;

  return {
    shopName,
    amount,
    sortAmount: amount + shippingAmount,
    shippingAmount,
    currency,
    ...(offerUrl !== undefined ? { offerUrl } : {}),
  };
}

const BAD_AVAILABILITY_STATUSES = new Set(["NOT_AVAILABLE_FOR_ORDER"]);
const BAD_STOCK_STATUSES = new Set(["out_of_stock", "not_in_stock"]);

async function fetchPrisjaktIdentify(
  message: GetPriceMatchForProductMessage,
  requestJson: JsonRequest,
): Promise<PriceMatchOffer | undefined> {
  const params = new URLSearchParams();
  params.set("url", message.url);
  params.set("market", "NO");
  params.set("searchTerm", message.searchTerm);
  if (message.productPageClue !== undefined) params.set("productPageClue", String(message.productPageClue));
  if (message.price !== undefined) params.set("price", String(message.price));
  if (message.currency !== undefined) params.set("currency", message.currency);
  if (message.productUrl !== undefined) params.set("productUrl", message.productUrl);
  if (message.organizationName !== undefined) params.set("organizationName", message.organizationName);
  if (message.codes !== undefined && message.codes.length > 0) params.set("codes", message.codes.join(","));

  const value = await requestJson(`https://browser-extension-backend.cloud.pji.nu/v1/identify?${params.toString()}`, {
    headers: { "Content-Type": "application/json" },
  });
  return readBestPrisjaktOffer(value);
}

async function fetchPrisjaktSearch(
  searchTerm: string,
  requestJson: JsonRequest,
): Promise<PriceMatchOffer | undefined> {
  const normalizedSearchTerm = searchTerm.trim();
  if (normalizedSearchTerm.length < 4) return undefined;

  const params = new URLSearchParams({
    term: normalizedSearchTerm,
    market: "NO",
    includePromotionDetails: "true",
  });

  const value = await requestJson(`https://browser-extension-backend.cloud.pji.nu/v1/search?${params.toString()}`, {
    headers: { "Content-Type": "application/json" },
  });
  const offer = readBestPrisjaktOffer(value);
  if (offer !== undefined) return offer;

  const product = readFirstPrisjaktSearchProduct(value);
  return product !== undefined ? fetchBestNativePrisjaktOffer(product, requestJson) : undefined;
}

function readFirstPrisjaktSearchProduct(value: unknown): NativePrisjaktProduct | undefined {
  if (!isPlainRecord(value)) return undefined;
  const details = Array.isArray(value.details) ? value.details : [];
  for (const detail of details) {
    if (!isPlainRecord(detail) || !isPlainRecord(detail.product)) continue;
    const id = readNumberLike(detail.product.id);
    const name = typeof detail.product.name === "string" ? detail.product.name : undefined;
    if (id !== undefined && name !== undefined) {
      return {
        id,
        name,
        productUrl: `https://www.prisjakt.no/product.php?p=${encodeURIComponent(String(id))}`,
      };
    }
  }
  return undefined;
}

function readBestPrisjaktOffer(value: unknown): PriceMatchOffer | undefined {
  if (!isPlainRecord(value)) return undefined;
  const details = Array.isArray(value.details) ? value.details : [];
  const directProduct = isPlainRecord(value.product) ? value.product : undefined;
  const detail = details.find((entry) => {
    return isPlainRecord(entry) && Array.isArray(entry.offers) && entry.offers.length > 0;
  });
  const product = isPlainRecord(detail) && isPlainRecord(detail.product) ? detail.product : directProduct;
  const offers = isPlainRecord(detail) && Array.isArray(detail.offers)
    ? detail.offers
    : Array.isArray(value.offers)
      ? value.offers
      : [];
  if (!isPlainRecord(product) || offers.length === 0) return undefined;

  const productName = typeof product.name === "string" ? product.name : "Prisjakt-produkt";
  const productId = typeof product.id === "number" || typeof product.id === "string" ? String(product.id) : undefined;
  const parsedOffers = offers
    .map(readPrisjaktOffer)
    .filter((offer): offer is Omit<PriceMatchOffer, "productName" | "productUrl"> => offer !== undefined && isNorwegianPriceMatchCurrency(offer.currency));
  parsedOffers.sort((first, second) => first.amount - second.amount);
  const best = parsedOffers[0];
  if (best === undefined) return undefined;

  return {
    ...best,
    source: "prisjakt",
    sourceName: "Prisjakt",
    productName,
    productUrl: productId !== undefined ? `https://www.prisjakt.no/product.php?p=${encodeURIComponent(productId)}` : `https://www.prisjakt.no/search?query=${encodeURIComponent(productName)}`,
    alternatives: parsedOffers.slice(0, 8).map((offer) => ({
      shopName: offer.shopName,
      amount: offer.amount,
      currency: offer.currency,
      price: offer.price,
    })),
  };
}

function readPrisjaktOffer(value: unknown): Omit<PriceMatchOffer, "productName" | "productUrl"> | undefined {
  if (!isPlainRecord(value)) return undefined;
  const shop = isPlainRecord(value.shop) ? value.shop : undefined;
  const price = isPlainRecord(value.price) && isPlainRecord(value.price.price) ? value.price.price : undefined;
  const scaledAmount = typeof price?.scaledAmount === "number" ? price.scaledAmount : undefined;
  const currency = typeof price?.currency === "string" ? price.currency : undefined;
  const shopName = typeof shop?.name === "string" ? shop.name : undefined;
  if (scaledAmount === undefined || currency === undefined || shopName === undefined) return undefined;
  const amount = scaledAmount / 100;
  const formatted = formatPrisjaktPrice(amount, currency);
  const url = typeof value.url === "string" && value.url.length > 0
    ? value.url
    : typeof value.externalUrl === "string" && value.externalUrl.length > 0
      ? value.externalUrl
      : undefined;
  return {
    shopName,
    amount,
    currency,
    price: formatted,
    ...(url !== undefined ? { offerUrl: url } : {}),
  };
}

async function fetchJson(url: string, init?: Parameters<JsonRequest>[1]): Promise<unknown | undefined> {
  try {
    const response = await fetch(url, init);
    if (!response.ok) return undefined;
    return response.json();
  } catch {
    return undefined;
  }
}

function isNorwegianPriceMatchOffer(offer: PriceMatchOffer): boolean {
  return isNorwegianPriceMatchCurrency(offer.currency);
}

function isNorwegianPriceMatchCurrency(currency: string): boolean {
  return currency.trim().toUpperCase() === "NOK";
}

function formatPrisjaktPrice(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
  return `${formatted} ${currency === "NOK" ? "kr" : currency}`;
}

function formatShippingPrice(amount: number, currency: string): string {
  return amount <= 0 ? "fri frakt" : `frakt ${formatPrisjaktPrice(amount, currency)}`;
}

function readNumberLike(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toCanonicalProductPageUrl(rawUrl: string): string | undefined {
  const parsedUrl = parseHttpUrl(rawUrl);
  if (parsedUrl === undefined) return undefined;
  return `${parsedUrl.origin}${parsedUrl.pathname}`;
}

function parseHttpUrl(url: string): URL | undefined {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:" ? parsedUrl : undefined;
  } catch {
    return undefined;
  }
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined && value.length > 0))];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
