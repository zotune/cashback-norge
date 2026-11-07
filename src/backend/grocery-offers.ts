// Daily catalogue of this week's supermarket flyer offers for cashbacknorge.no/dagligvarer.
//
// Source: Tjek's public offer API (squid-api.tjek.com/v2), the one etilbudsavis.no and
// mattilbud.no use. No key; undocumented for third parties, so it may change. The dealer
// list and offers are read for a fixed location (Oslo) because the API otherwise geolocates
// the caller (GitHub Actions is not in Norway); regional flyers can differ. Offers are
// parsed with the same reader as the eTilbudsavis price match. Only chains on the allowlist
// are read, with bounded pages. When the crawl fails, the previously published catalogue is
// reused (offers still running, catalogue at most 14 days old).
import { Configuration, HttpCrawler, type HttpCrawlingContext, MemoryStorage, Request } from "crawlee";
import { readEtilbudsavisOffers, type EtilbudsavisOffer } from "../shared/etilbudsavis-price-match.js";
import { GROCERY_CHAINS } from "../shared/grocery-chains.js";
import type { Logger } from "./logger.js";
import { cacheOfferImages, imageKey, type OfferImageOptions } from "./offer-images.js";

export const GROCERY_OFFERS_API = "https://squid-api.tjek.com/v2";
export const GROCERY_OFFERS_PUBLISHED_URL = "https://cashbacknorge.no/grocery-offers.json";
// Oslo sentrum; radius dekker Østlandet.
const LOCATION = { r_lat: "59.9139", r_lng: "10.7522", r_radius: "100000" };
const PAGE_SIZE = 100;
const MAX_DEALER_PAGES = 4;
const MAX_OFFER_PAGES_PER_CHAIN = 5;
const MAX_CATALOG_AGE_DAYS = 14;
// Matkjeder slik Tjek navngir dem i Norge (felles med nettsidens chips).
export { GROCERY_CHAINS };

export type GroceryOffer = Omit<EtilbudsavisOffer, "id"> & { id: string; chain: string };
export type GroceryOffersCatalog = {
  version: 1;
  generatedAt: string;
  source: string;
  location: string;
  chains: string[];
  offers: GroceryOffer[];
};

export type CollectGroceryOffersInput = {
  generatedAt: string;
  logger: Logger;
  apiBase?: string;
  previousUrl?: string;
  navigationTimeoutSecs?: number;
};

export async function collectGroceryOffers(input: CollectGroceryOffersInput): Promise<GroceryOffersCatalog | undefined> {
  try {
    return await cacheGroceryImages(await fetchGroceryOffers(input), input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const previous = await fetchPreviousCatalog(input).catch((previousError: unknown) => {
      input.logger.warn(`Grocery offers: previous catalogue ${input.previousUrl ?? GROCERY_OFFERS_PUBLISHED_URL} unavailable (${previousError instanceof Error ? previousError.message : String(previousError)})`);
      return undefined;
    });
    const now = Date.parse(input.generatedAt);
    if (previous !== undefined && now - Date.parse(previous.generatedAt) <= MAX_CATALOG_AGE_DAYS * 86_400_000) {
      const running = previous.offers.filter((offer) => Date.parse(offer.validTo) >= now);
      input.logger.warn(`${message}; reusing ${running.length} running offers from the catalogue generated ${previous.generatedAt}`);
      return await cacheGroceryImages({ ...previous, offers: running }, input);
    }
    input.logger.error(`${message}; no usable previous grocery offers catalogue`);
    return undefined;
  }
}

export async function cacheGroceryImages(catalog: GroceryOffersCatalog, input: OfferImageOptions): Promise<GroceryOffersCatalog> {
  const images = await cacheOfferImages(catalog.offers.flatMap(offer => offer.imageUrl ? [{ url: offer.imageUrl }] : []), input);
  return { ...catalog, offers: catalog.offers.map(offer => {
    const { imageUrl: source, ...rest } = offer;
    const imageUrl = source && images.get(imageKey({ url: source }));
    return { ...rest, ...(imageUrl ? { imageUrl } : {}) };
  }) };
}

export async function fetchGroceryOffers(input: CollectGroceryOffersInput): Promise<GroceryOffersCatalog> {
  const apiBase = (input.apiBase ?? GROCERY_OFFERS_API).replace(/\/$/, "");
  const location = new URLSearchParams(LOCATION).toString();
  const wanted = new Map(GROCERY_CHAINS.map((name) => [name.toLowerCase(), name]));
  const dealers = new Map<string, string>();
  const offers = new Map<string, GroceryOffer>();
  const failures: string[] = [];

  const crawler = createCrawler(input, async ({ request, json }) => {
    const { kind, page } = request.userData as { kind: string; page: number; dealerId?: string; chain?: string };
    if (!Array.isArray(json)) throw new NoRetryError(`unexpected ${kind} response (expected a list)`);
    if (kind === "dealers") {
      for (const dealer of json) {
        if (!isRecord(dealer) || typeof dealer.id !== "string" || typeof dealer.name !== "string") continue;
        const country = isRecord(dealer.country) ? dealer.country.id : undefined;
        const chain = wanted.get(dealer.name.trim().toLowerCase());
        if (country === "NO" && chain !== undefined) dealers.set(dealer.id, chain);
      }
      if (json.length === PAGE_SIZE && page + 1 < MAX_DEALER_PAGES) {
        await crawler.addRequests([dealerRequest(apiBase, location, page + 1)]);
      } else {
        await crawler.addRequests([...dealers].map(([dealerId, chain]) => offerRequest(apiBase, location, dealerId, chain, 0)));
      }
      return;
    }
    const { dealerId, chain } = request.userData as { dealerId: string; chain: string };
    for (const offer of readEtilbudsavisOffers(json)) {
      if (offer.id === undefined) continue;
      offers.set(offer.id, { ...offer, id: offer.id, chain });
    }
    if (json.length === PAGE_SIZE && page + 1 < MAX_OFFER_PAGES_PER_CHAIN) {
      await crawler.addRequests([offerRequest(apiBase, location, dealerId, chain, page + 1)]);
    }
  }, (request, reason) => {
    failures.push(`${String(request.userData.kind)} ${request.url} (${reason})`);
  });

  await crawler.run([dealerRequest(apiBase, location, 0)]);
  if (failures.some((failure) => failure.startsWith("dealers"))) {
    throw new Error(`Grocery offers: dealer list failed: ${failures.join("; ")}`);
  }
  const chains = [...new Set(dealers.values())].sort((left, right) => left.localeCompare(right, "nb"));
  if (chains.length < GROCERY_CHAINS.length / 2) {
    throw new Error(`Grocery offers: only ${chains.length} of ${GROCERY_CHAINS.length} chains found in Tjek's dealer list (${chains.join(", ")})`);
  }
  for (const failure of failures) input.logger.warn(`Grocery offers: ${failure}`);
  const list = [...offers.values()].sort((left, right) => left.chain.localeCompare(right.chain, "nb") || left.heading.localeCompare(right.heading, "nb"));
  if (list.length === 0) throw new Error(`Grocery offers: no offers from ${chains.length} chains`);
  input.logger.info(`Grocery offers: ${list.length} offers from ${chains.length} chains (${failures.length} failed requests)`);
  return { version: 1, generatedAt: input.generatedAt, source: "Tjek (etilbudsavis.no)", location: "Oslo", chains, offers: list };
}

async function fetchPreviousCatalog(input: CollectGroceryOffersInput): Promise<GroceryOffersCatalog | undefined> {
  let catalog: GroceryOffersCatalog | undefined;
  let failure: string | undefined;
  const crawler = createCrawler(input, async ({ json }) => {
    if (isGroceryOffersCatalog(json)) catalog = json;
    else throw new NoRetryError("unexpected catalogue format");
  }, (_request, reason) => { failure = reason; });
  await crawler.run([new Request({ url: input.previousUrl ?? GROCERY_OFFERS_PUBLISHED_URL, userData: { kind: "previous", page: 0 } })]);
  if (failure !== undefined) throw new Error(failure);
  return catalog;
}

export function isGroceryOffersCatalog(value: unknown): value is GroceryOffersCatalog {
  return isRecord(value) && value.version === 1 && typeof value.generatedAt === "string" && Array.isArray(value.chains) &&
    Array.isArray(value.offers) && value.offers.every((offer) => isRecord(offer) && typeof offer.id === "string" &&
      typeof offer.chain === "string" && typeof offer.heading === "string" && typeof offer.amount === "number" && typeof offer.validTo === "string");
}

function dealerRequest(apiBase: string, location: string, page: number): Request {
  return new Request({
    url: `${apiBase}/dealers?${location}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}&order_by=name`,
    userData: { kind: "dealers", page },
    headers: { Accept: "application/json" },
  });
}

function offerRequest(apiBase: string, location: string, dealerId: string, chain: string, page: number): Request {
  return new Request({
    url: `${apiBase}/offers?dealer_ids=${encodeURIComponent(dealerId)}&${location}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
    userData: { kind: "offers", page, dealerId, chain },
    headers: { Accept: "application/json" },
  });
}

class NoRetryError extends Error {}

function createCrawler(
  input: CollectGroceryOffersInput,
  handle: (context: { request: Request; json: unknown }) => Promise<void>,
  onFailure: (request: Request, reason: string) => void,
): HttpCrawler<HttpCrawlingContext> {
  const config = new Configuration();
  config.useStorageClient(new MemoryStorage({ persistStorage: false }));
  return new HttpCrawler({
    maxConcurrency: 2,
    maxRequestRetries: 2,
    navigationTimeoutSecs: input.navigationTimeoutSecs ?? 30,
    requestHandlerTimeoutSecs: 30,
    useSessionPool: false,
    ignoreSslErrors: false,
    additionalMimeTypes: ["application/json"],
    requestHandler: async ({ request, body, response }) => {
      const status = response.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        if (status !== 429 && status < 500) request.noRetry = true;
        throw new Error(`HTTP ${status}`);
      }
      let json: unknown;
      try {
        json = JSON.parse(Buffer.isBuffer(body) ? body.toString("utf8") : String(body));
      } catch {
        request.noRetry = true;
        throw new Error("invalid JSON");
      }
      try {
        await handle({ request, json });
      } catch (error) {
        if (error instanceof NoRetryError) request.noRetry = true;
        throw error;
      }
    },
    failedRequestHandler: async ({ request }, error) => {
      onFailure(request, error.message.slice(0, 300));
    },
  }, config);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
