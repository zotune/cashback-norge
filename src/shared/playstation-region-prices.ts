export type RegionPricePlanAlternative = {
  planName: string;
  formattedPrice?: string;
  formattedNok?: string;
  unavailableReason?: string;
};

export type PlayStationRegionPrice = {
  region: string;
  countryName: string;
  flag: string;
  locale: string;
  currency: string;
  price: number;
  formattedPrice: string;
  nokAmount: number;
  formattedNok: string;
  productUrl: string;
  priceHistoryUrl?: string;
  sourceProvider?: "playstation" | "appstoreprice";
  sourceName?: string;
  sourceDetail?: string;
  planName?: string;
  planAlternatives?: RegionPricePlanAlternative[];
};

export type PlayStationRegionPriceResult = {
  productId: string;
  productName?: string;
  fetchedAt: string;
  ratesUpdatedAt?: string;
  sourceProvider?: "playstation" | "appstoreprice";
  sourceName?: string;
  sourceDetail?: string;
  planName?: string;
  availablePlanNames?: string[];
  prices: PlayStationRegionPrice[];
};

type PlayStationRegion = {
  region: string;
  countryName: string;
  flag: string;
  locale: string;
};

type PlayStationRegionPriceEntry = PlayStationRegionPrice & {
  productName?: string;
};

type PlayStationProductResolution = {
  productId: string;
  conceptId?: string;
};

type PlayStationOffer = {
  name?: string;
  price: number;
  currency: string;
};

type PlayStationResolvedRegionOffer = {
  productId: string;
  productUrl: string;
  offer: PlayStationOffer;
};

type TextRequest = (url: string) => Promise<string | undefined>;
type JsonRequest = (url: string) => Promise<unknown | undefined>;

const PLAYSTATION_REGIONS: PlayStationRegion[] = [
  { region: "NO", countryName: "Norge", flag: "🇳🇴", locale: "no-no" },
  { region: "US", countryName: "USA", flag: "🇺🇸", locale: "en-us" },
  { region: "GB", countryName: "UK", flag: "🇬🇧", locale: "en-gb" },
  { region: "IN", countryName: "India", flag: "🇮🇳", locale: "en-in" },
  { region: "TR", countryName: "Tyrkia", flag: "🇹🇷", locale: "tr-tr" },
  { region: "UA", countryName: "Ukraina", flag: "🇺🇦", locale: "uk-ua" },
  { region: "JP", countryName: "Japan", flag: "🇯🇵", locale: "ja-jp" },
  { region: "CA", countryName: "Canada", flag: "🇨🇦", locale: "en-ca" },
  { region: "AU", countryName: "Australia", flag: "🇦🇺", locale: "en-au" },
  { region: "NZ", countryName: "New Zealand", flag: "🇳🇿", locale: "en-nz" },
  { region: "DE", countryName: "Tyskland", flag: "🇩🇪", locale: "de-de" },
  { region: "FR", countryName: "Frankrike", flag: "🇫🇷", locale: "fr-fr" },
  { region: "ES", countryName: "Spania", flag: "🇪🇸", locale: "es-es" },
  { region: "IT", countryName: "Italia", flag: "🇮🇹", locale: "it-it" },
  { region: "PL", countryName: "Polen", flag: "🇵🇱", locale: "pl-pl" },
  { region: "SE", countryName: "Sverige", flag: "🇸🇪", locale: "sv-se" },
  { region: "DK", countryName: "Danmark", flag: "🇩🇰", locale: "da-dk" },
  { region: "FI", countryName: "Finland", flag: "🇫🇮", locale: "fi-fi" },
  { region: "CH", countryName: "Sveits", flag: "🇨🇭", locale: "de-ch" },
  { region: "BR", countryName: "Brasil", flag: "🇧🇷", locale: "pt-br" },
  { region: "MX", countryName: "Mexico", flag: "🇲🇽", locale: "es-mx" },
  { region: "KR", countryName: "Sør-Korea", flag: "🇰🇷", locale: "ko-kr" },
  { region: "HK", countryName: "Hongkong", flag: "🇭🇰", locale: "en-hk" },
  { region: "SG", countryName: "Singapore", flag: "🇸🇬", locale: "en-sg" },
  { region: "ZA", countryName: "Sør-Afrika", flag: "🇿🇦", locale: "en-za" },
];

const MAIN_REGION_ORDER = new Map([
  ["NO", 0],
  ["US", 1],
  ["GB", 2],
]);

export function isPlayStationProductUrl(url: string): boolean {
  return (
    parsePlayStationProductId(url) !== undefined ||
    parsePlayStationConceptId(url) !== undefined ||
    isPlayStationWebGamePageUrl(url)
  );
}

export function parsePlayStationProductId(url: string): string | undefined {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    if (hostname !== "store.playstation.com") {
      return undefined;
    }

    const productMatch = parsedUrl.pathname.match(/\/product\/([^/?#]+)/i);
    const productId = productMatch?.[1];
    return productId !== undefined && productId.length > 0 ? decodeURIComponent(productId) : undefined;
  } catch {
    return undefined;
  }
}

function parsePlayStationConceptId(url: string): string | undefined {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    if (hostname !== "store.playstation.com") {
      return undefined;
    }

    const conceptMatch = parsedUrl.pathname.match(/\/concept\/(\d+)/i);
    return conceptMatch?.[1];
  } catch {
    return undefined;
  }
}

function isPlayStationWebGamePageUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    if (hostname !== "playstation.com") {
      return false;
    }

    return /^\/[a-z]{2}(?:-[a-z]{2,4}){1,2}\/games\/[^/]+\/?$/i.test(parsedUrl.pathname);
  } catch {
    return false;
  }
}

export async function findPlayStationRegionPrices(
  productUrl: string,
  textRequest: TextRequest = defaultTextRequest,
  jsonRequest: JsonRequest = defaultJsonRequest,
): Promise<PlayStationRegionPriceResult | undefined> {
  const product = await resolvePlayStationProduct(productUrl, textRequest);
  if (product === undefined) {
    return undefined;
  }

  const ratesResponse = await jsonRequest("https://open.er-api.com/v6/latest/NOK");
  const rates = readNokBaseRates(ratesResponse);
  if (rates === undefined) {
    return undefined;
  }

  const entries = await mapWithConcurrency(PLAYSTATION_REGIONS, 5, async (region) => {
    const regionOffer = await resolvePlayStationRegionOffer(product, region, textRequest);
    if (regionOffer === undefined) {
      return undefined;
    }

    const { offer } = regionOffer;
    const nokRate = offer.currency === "NOK" ? 1 : rates.rates[offer.currency];
    if (typeof nokRate !== "number" || nokRate <= 0) {
      return undefined;
    }

    const nokAmount = offer.price / nokRate;
    const entry: PlayStationRegionPriceEntry = {
      region: region.region,
      countryName: region.countryName,
      flag: region.flag,
      locale: region.locale,
      currency: offer.currency,
      price: offer.price,
      formattedPrice: formatCurrency(offer.price, offer.currency, region.locale),
      nokAmount,
      formattedNok: formatCurrency(nokAmount, "NOK", "nb-NO"),
      productUrl: regionOffer.productUrl,
    };
    if (offer.name !== undefined) {
      entry.productName = offer.name;
    }
    return entry;
  });

  const validEntries = entries
    .filter((entry): entry is PlayStationRegionPriceEntry => entry !== undefined);
  const productName = validEntries.find((entry) => entry.productName !== undefined)?.productName;
  const psPricesUrl = productName !== undefined ? buildPsPricesNorwaySearchUrl(productName) : undefined;
  const prices = validEntries
    .sort((a, b) => a.nokAmount - b.nokAmount)
    .map(({ productName: _productName, ...price }) => ({
      ...price,
      ...(price.region === "NO" && psPricesUrl !== undefined ? { priceHistoryUrl: psPricesUrl } : {}),
    }));

  if (prices.length === 0) {
    return undefined;
  }

  const result: PlayStationRegionPriceResult = {
    productId: product.productId,
    fetchedAt: new Date().toISOString(),
    ...(rates.updatedAt !== undefined ? { ratesUpdatedAt: rates.updatedAt } : {}),
    prices,
  };
  if (productName !== undefined) {
    result.productName = productName;
  }
  return result;
}

export function pickDisplayedPlayStationRegionPrices(
  prices: PlayStationRegionPrice[],
  limit = 10,
): PlayStationRegionPrice[] {
  const byRegion = new Map(prices.map((price) => [price.region, price]));
  const selected = new Map<string, PlayStationRegionPrice>();
  for (const price of prices.slice(0, limit)) {
    selected.set(price.region, price);
  }
  for (const region of MAIN_REGION_ORDER.keys()) {
    const price = byRegion.get(region);
    if (price !== undefined) {
      selected.set(region, price);
    }
  }
  return [...selected.values()].sort((a, b) => a.nokAmount - b.nokAmount);
}

function buildPsPricesNorwaySearchUrl(productName: string): string {
  return `https://psprices.com/region-no/games/?q=${encodeURIComponent(productName)}`;
}

async function resolvePlayStationProduct(
  productUrl: string,
  textRequest: TextRequest,
): Promise<PlayStationProductResolution | undefined> {
  const directProductId = parsePlayStationProductId(productUrl);
  const conceptIdFromUrl = parsePlayStationConceptId(productUrl);

  if (directProductId === undefined && conceptIdFromUrl === undefined && !isPlayStationWebGamePageUrl(productUrl)) {
    return undefined;
  }

  const html = await textRequest(productUrl);
  if (directProductId !== undefined && html === undefined) {
    return { productId: directProductId };
  }
  if (html === undefined) {
    return undefined;
  }

  const productId =
    directProductId ??
    extractPlayStationProductIdFromDataProductInfo(html) ??
    extractPlayStationSku(html) ??
    extractFirstProductIdFromHtml(html);
  if (productId === undefined) {
    return undefined;
  }

  const conceptId =
    conceptIdFromUrl ??
    extractPlayStationConceptIdFromDataProductInfo(html) ??
    extractPlayStationConceptIdFromHtml(html);

  return {
    productId,
    ...(conceptId !== undefined ? { conceptId } : {}),
  };
}

async function resolvePlayStationRegionOffer(
  product: PlayStationProductResolution,
  region: PlayStationRegion,
  textRequest: TextRequest,
): Promise<PlayStationResolvedRegionOffer | undefined> {
  const localizedProductUrl = buildPlayStationProductUrl(region.locale, product.productId);
  const localizedHtml = await textRequest(localizedProductUrl);
  const localizedOffer = localizedHtml !== undefined ? extractPlayStationOffer(localizedHtml) : undefined;
  if (localizedOffer !== undefined) {
    return {
      productId: product.productId,
      productUrl: localizedProductUrl,
      offer: localizedOffer,
    };
  }

  if (product.conceptId === undefined) {
    return undefined;
  }

  const localizedConceptUrl = buildPlayStationConceptUrl(region.locale, product.conceptId);
  const conceptHtml = await textRequest(localizedConceptUrl);
  if (conceptHtml === undefined) {
    return undefined;
  }

  const regionalProductId =
    extractPlayStationSku(conceptHtml) ??
    extractPlayStationProductIdFromDataProductInfo(conceptHtml) ??
    extractFirstProductIdFromHtml(conceptHtml);
  if (regionalProductId === undefined) {
    return undefined;
  }

  const regionalProductUrl = buildPlayStationProductUrl(region.locale, regionalProductId);
  const conceptOffer = extractPlayStationOffer(conceptHtml);
  if (conceptOffer !== undefined) {
    return {
      productId: regionalProductId,
      productUrl: regionalProductUrl,
      offer: conceptOffer,
    };
  }

  const regionalHtml = regionalProductId === product.productId ? localizedHtml : await textRequest(regionalProductUrl);
  const regionalOffer = regionalHtml !== undefined ? extractPlayStationOffer(regionalHtml) : undefined;
  if (regionalOffer === undefined) {
    return undefined;
  }

  return {
    productId: regionalProductId,
    productUrl: regionalProductUrl,
    offer: regionalOffer,
  };
}

function buildPlayStationProductUrl(locale: string, productId: string): string {
  return `https://store.playstation.com/${locale}/product/${encodeURIComponent(productId)}`;
}

function buildPlayStationConceptUrl(locale: string, conceptId: string): string {
  return `https://store.playstation.com/${locale}/concept/${encodeURIComponent(conceptId)}`;
}

function extractPlayStationProductIdFromDataProductInfo(html: string): string | undefined {
  const productInfoMatches = html.matchAll(/\bdata-product-info=(["'])([\s\S]*?)\1/gi);
  for (const match of productInfoMatches) {
    const rawValue = match[2];
    if (rawValue === undefined || rawValue.length === 0) {
      continue;
    }

    const parsed = parseJson(decodeHtmlAttribute(rawValue));
    const productId = readProductId(parsed);
    if (productId !== undefined) {
      return productId;
    }
  }

  return undefined;
}

function extractPlayStationConceptIdFromDataProductInfo(html: string): string | undefined {
  const productInfoMatches = html.matchAll(/\bdata-product-info=(["'])([\s\S]*?)\1/gi);
  for (const match of productInfoMatches) {
    const rawValue = match[2];
    if (rawValue === undefined || rawValue.length === 0) {
      continue;
    }

    const parsed = parseJson(decodeHtmlAttribute(rawValue));
    const conceptId = readConceptId(parsed);
    if (conceptId !== undefined) {
      return conceptId;
    }
  }

  return undefined;
}

function readProductId(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const productId = readProductId(entry);
      if (productId !== undefined) return productId;
    }
    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  if (typeof value.productId === "string" && value.productId.length > 0) {
    return value.productId;
  }

  return readProductId(value.skus);
}

function readConceptId(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const conceptId = readConceptId(entry);
      if (conceptId !== undefined) return conceptId;
    }
    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const rawConceptId = value.conceptId;
  if (typeof rawConceptId === "string" && /^\d+$/.test(rawConceptId)) {
    return rawConceptId;
  }
  if (typeof rawConceptId === "number" && Number.isInteger(rawConceptId) && rawConceptId > 0) {
    return String(rawConceptId);
  }

  for (const nestedValue of Object.values(value)) {
    const conceptId = readConceptId(nestedValue);
    if (conceptId !== undefined) {
      return conceptId;
    }
  }

  return undefined;
}

function extractPlayStationSku(html: string): string | undefined {
  const jsonScripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const script of jsonScripts) {
    const bodyMatch = script.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    const body = bodyMatch?.[1]?.trim();
    if (body === undefined || body.length === 0) {
      continue;
    }

    const parsed = parseJson(body);
    const sku = readSku(parsed);
    if (sku !== undefined) {
      return sku;
    }
  }

  return undefined;
}

function readSku(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const sku = readSku(entry);
      if (sku !== undefined) return sku;
    }
    return undefined;
  }

  if (!isRecord(value) || typeof value.sku !== "string" || value.sku.length === 0) {
    return undefined;
  }

  return value.sku;
}

function extractFirstProductIdFromHtml(html: string): string | undefined {
  const productMatch = html.match(/\/[a-z]{2}-[a-z]{2}\/product\/([A-Z0-9_-]+)/i);
  return productMatch?.[1];
}

function extractPlayStationConceptIdFromHtml(html: string): string | undefined {
  const conceptMatch = html.match(/\\?["']?conceptId\\?["']?\s*:\s*\\?["']?(\d{4,})/i);
  return conceptMatch?.[1];
}

function extractPlayStationOffer(html: string): PlayStationOffer | undefined {
  const jsonScripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const script of jsonScripts) {
    const bodyMatch = script.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    const body = bodyMatch?.[1]?.trim();
    if (body === undefined || body.length === 0) {
      continue;
    }

    const parsed = parseJson(body);
    const offer = readProductOffer(parsed);
    if (offer !== undefined) {
      return offer;
    }
  }

  const priceMeta = html.match(/<meta[^>]+(?:property|name)=["'](?:product:price:amount|price)["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  const currencyMeta = html.match(/<meta[^>]+(?:property|name)=["'](?:product:price:currency|priceCurrency|currency)["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  const price = priceMeta?.[1] !== undefined ? Number.parseFloat(priceMeta[1].replace(",", ".")) : Number.NaN;
  const currency = currencyMeta?.[1]?.toUpperCase();
  if (Number.isFinite(price) && currency !== undefined) {
    return { price, currency };
  }

  return undefined;
}

function readProductOffer(value: unknown): PlayStationOffer | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const offer = readProductOffer(entry);
      if (offer !== undefined) return offer;
    }
    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const offer = readFirstOffer(value.offers);
  if (offer === undefined) {
    return undefined;
  }

  return {
    ...(typeof value.name === "string" ? { name: value.name } : {}),
    ...offer,
  };
}

function readFirstOffer(value: unknown): { price: number; currency: string } | undefined {
  const offer = Array.isArray(value) ? value[0] : value;
  if (!isRecord(offer)) {
    return undefined;
  }

  const rawPrice = typeof offer.price === "number" ? offer.price : typeof offer.price === "string" ? Number.parseFloat(offer.price.replace(",", ".")) : Number.NaN;
  const currency = typeof offer.priceCurrency === "string" ? offer.priceCurrency.toUpperCase() : undefined;
  if (!Number.isFinite(rawPrice) || currency === undefined) {
    return undefined;
  }

  return { price: rawPrice, currency };
}

function readNokBaseRates(value: unknown): { rates: Record<string, number>; updatedAt?: string } | undefined {
  if (!isRecord(value) || value.result !== "success" || !isRecord(value.rates)) {
    return undefined;
  }

  const rates: Record<string, number> = {};
  for (const [currency, rate] of Object.entries(value.rates)) {
    if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
      rates[currency.toUpperCase()] = rate;
    }
  }

  if (Object.keys(rates).length === 0) {
    return undefined;
  }

  return {
    rates,
    ...(typeof value.time_last_update_utc === "string" ? { updatedAt: value.time_last_update_utc } : {}),
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await mapper(items[index] as T);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function defaultTextRequest(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    return await response.text();
  } catch {
    return undefined;
  }
}

async function defaultJsonRequest(url: string): Promise<unknown | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function decodeHtmlAttribute(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: "\"",
  };

  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (entity, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const codePoint = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    if (body.startsWith("#")) {
      const codePoint = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    return namedEntities[body.toLowerCase()] ?? entity;
  });
}

function formatCurrency(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: currencyUsesMinorUnits(currency) ? 2 : 0,
    }).format(amount);
  } catch {
    return `${amount.toFixed(currencyUsesMinorUnits(currency) ? 2 : 0)} ${currency}`;
  }
}

function currencyUsesMinorUnits(currency: string): boolean {
  return !new Set(["JPY", "KRW", "CLP", "VND"]).has(currency.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
