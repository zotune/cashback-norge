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
};

export type PlayStationRegionPriceResult = {
  productId: string;
  productName?: string;
  fetchedAt: string;
  ratesUpdatedAt?: string;
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
  return parsePlayStationProductId(url) !== undefined;
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

export async function findPlayStationRegionPrices(
  productUrl: string,
  textRequest: TextRequest = defaultTextRequest,
  jsonRequest: JsonRequest = defaultJsonRequest,
): Promise<PlayStationRegionPriceResult | undefined> {
  const productId = parsePlayStationProductId(productUrl);
  if (productId === undefined) {
    return undefined;
  }

  const ratesResponse = await jsonRequest("https://open.er-api.com/v6/latest/NOK");
  const rates = readNokBaseRates(ratesResponse);
  if (rates === undefined) {
    return undefined;
  }

  const entries = await mapWithConcurrency(PLAYSTATION_REGIONS, 5, async (region) => {
    const localizedUrl = `https://store.playstation.com/${region.locale}/product/${encodeURIComponent(productId)}`;
    const html = await textRequest(localizedUrl);
    if (html === undefined) {
      return undefined;
    }

    const offer = extractPlayStationOffer(html);
    if (offer === undefined) {
      return undefined;
    }

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
      productUrl: localizedUrl,
    };
    if (offer.name !== undefined) {
      entry.productName = offer.name;
    }
    return entry;
  });

  const prices = entries
    .filter((entry): entry is PlayStationRegionPriceEntry => entry !== undefined)
    .sort((a, b) => a.nokAmount - b.nokAmount)
    .map(({ productName: _productName, ...price }) => price);

  if (prices.length === 0) {
    return undefined;
  }

  const productName = entries.find((entry) => entry?.productName !== undefined)?.productName;
  const result: PlayStationRegionPriceResult = {
    productId,
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

function extractPlayStationOffer(html: string): { name?: string; price: number; currency: string } | undefined {
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

function readProductOffer(value: unknown): { name?: string; price: number; currency: string } | undefined {
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
