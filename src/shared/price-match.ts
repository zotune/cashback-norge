import type {
  GetPriceMatchForProductMessage,
  PriceMatchOffer,
} from "./extension-messages.js";
import { findGodprisPriceMatch } from "./godpris-price-match.js";
import {
  findIsthereanydealPriceMatch,
  isSteamAppProductUrl,
} from "./isthereanydeal-price-match.js";
import { findKlarnaPriceMatch } from "./klarna-price-match.js";
import { scoreProductTitleAgainstSearchTerm } from "./product-title-match.js";
import {
  findPrisjaktPriceMatch,
  type JsonRequest,
} from "./prisjakt-price-match.js";
import { findPrisradarPriceMatch } from "./prisradar-price-match.js";
import {
  findTaxfreePriceMatch,
  isVinmonopoletProductUrl,
} from "./taxfree-price-match.js";

type TextRequest = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    credentials?: RequestCredentials;
  },
) => Promise<string | undefined>;

const MIN_ALLOWED_PRODUCT_TITLE_MATCH_SCORE = 0.45;

export async function findPriceMatches(
  message: GetPriceMatchForProductMessage,
  requestJson?: JsonRequest,
  requestText?: TextRequest,
): Promise<PriceMatchOffer[]> {
  if (isVinmonopoletProductUrl(message.url)) {
    const taxfreeOffer = await ignorePriceMatchFailure(findTaxfreePriceMatch(message, requestJson));
    return taxfreeOffer !== undefined ? [taxfreeOffer] : [];
  }

  if (isSteamAppProductUrl(message.url) || isSteamAppProductUrl(message.productUrl)) {
    const isthereanydealOffer = await ignorePriceMatchFailure(findIsthereanydealPriceMatch(message, requestJson, requestText));
    return isthereanydealOffer !== undefined ? [isthereanydealOffer] : [];
  }

  const [prisjaktOffer, godprisOffer, klarnaOffer, prisradarOffer, isthereanydealOffer, taxfreeOffer] = await Promise.all([
    ignorePriceMatchFailure(findPrisjaktPriceMatch(message, requestJson)),
    ignorePriceMatchFailure(findGodprisPriceMatch(message, requestJson, requestText)),
    ignorePriceMatchFailure(findKlarnaPriceMatch(message, requestJson)),
    ignorePriceMatchFailure(findPrisradarPriceMatch(message, requestJson, requestText)),
    ignorePriceMatchFailure(findIsthereanydealPriceMatch(message, requestJson, requestText)),
    ignorePriceMatchFailure(findTaxfreePriceMatch(message, requestJson)),
  ]);

  const trustedOffers = [prisjaktOffer, godprisOffer, klarnaOffer]
    .filter((offer): offer is PriceMatchOffer => offer !== undefined);
  const trustedOffersMatchCurrentPage = isPriceMatchAllowedForCurrentPage(trustedOffers, message);
  const canUsePrisradarOffer =
    trustedOffersMatchCurrentPage ||
    isKnownPriceMatchSourceProductUrl(message.url) ||
    isKnownPriceMatchSourceProductUrl(message.productUrl);
  const relaxedPrisradarOffer = prisradarOffer === undefined && trustedOffersMatchCurrentPage
    ? await findPrisradarPriceMatch(message, requestJson, requestText, {
      allowLooseTextSearch: true,
      anchorSearchTerms: trustedOffers.map((offer) => offer.productName),
    })
    : undefined;
  const offers = [
    ...trustedOffers,
    canUsePrisradarOffer ? prisradarOffer ?? relaxedPrisradarOffer : undefined,
    isthereanydealOffer,
    taxfreeOffer,
  ]
    .filter((offer): offer is PriceMatchOffer => offer !== undefined);
  const allowedOffers = offers.filter((offer) => isPriceMatchOfferAllowedForCurrentPage(offer, message));

  if (!isPriceMatchAllowedForCurrentPage(allowedOffers, message)) {
    return [];
  }

  return allowedOffers.sort((first, second) => {
      const amountDifference = first.amount - second.amount;
      if (amountDifference !== 0) return amountDifference;
      return sourceRank(first) - sourceRank(second);
  });
}

async function ignorePriceMatchFailure(
  promise: Promise<PriceMatchOffer | undefined>,
): Promise<PriceMatchOffer | undefined> {
  try {
    return await promise;
  } catch {
    return undefined;
  }
}

function isPriceMatchOfferAllowedForCurrentPage(
  offer: PriceMatchOffer,
  message: GetPriceMatchForProductMessage,
): boolean {
  if (isVinmonopoletProductUrl(message.url)) {
    return isContextualTaxfreeOffer(offer, message);
  }

  if (isKnownPriceMatchSourceProductUrl(message.url) || isKnownPriceMatchSourceProductUrl(message.productUrl)) {
    return true;
  }

  if (offer.matchedCurrentMerchant === true || hasCurrentMerchantOffer(offer, message)) {
    return true;
  }

  if (isContextualTaxfreeOffer(offer, message)) {
    return true;
  }

  return scoreProductTitleAgainstSearchTerm(message.searchTerm, offer.productName) >= MIN_ALLOWED_PRODUCT_TITLE_MATCH_SCORE;
}

export async function findPriceMatch(
  message: GetPriceMatchForProductMessage,
  requestJson?: JsonRequest,
  requestText?: TextRequest,
): Promise<PriceMatchOffer | undefined> {
  return (await findPriceMatches(message, requestJson, requestText))[0];
}

function sourceRank(offer: PriceMatchOffer): number {
  if (offer.source === "prisjakt") return 0;
  if (offer.source === "godpris") return 1;
  if (offer.source === "klarna") return 2;
  if (offer.source === "prisradar") return 3;
  if (offer.source === "isthereanydeal") return 4;
  if (offer.source === "taxfree") return 5;
  return 4;
}

function isPriceMatchAllowedForCurrentPage(
  offers: PriceMatchOffer[],
  message: GetPriceMatchForProductMessage,
): boolean {
  if (isKnownPriceMatchSourceProductUrl(message.url) || isKnownPriceMatchSourceProductUrl(message.productUrl)) {
    return true;
  }

  return offers.some((offer) => {
    return offer.matchedCurrentMerchant === true || hasCurrentMerchantOffer(offer, message) || isContextualTaxfreeOffer(offer, message);
  });
}

function isContextualTaxfreeOffer(
  offer: PriceMatchOffer,
  message: GetPriceMatchForProductMessage,
): boolean {
  return offer.source === "taxfree" && isVinmonopoletProductUrl(message.url);
}

function hasCurrentMerchantOffer(
  offer: PriceMatchOffer,
  message: GetPriceMatchForProductMessage,
): boolean {
  const merchantKeys = getCurrentMerchantKeys(message);
  if (merchantKeys.length === 0) return false;

  return [
    { shopName: offer.shopName, amount: offer.amount },
    ...(offer.alternatives?.map((alternative) => ({ shopName: alternative.shopName, amount: alternative.amount })) ?? []),
  ].some((alternative) => isCurrentMerchantName(alternative.shopName, merchantKeys));
}

function isKnownPriceMatchSourceProductUrl(rawUrl: string | undefined): boolean {
  if (rawUrl === undefined) return false;
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    const pathname = url.pathname.toLowerCase();

    if (
      hostname.endsWith("prisjakt.no") ||
      hostname.endsWith("prisjakt.nu") ||
      hostname.endsWith("prisjakt.se") ||
      hostname.endsWith("prisjagt.dk") ||
      hostname.endsWith("pricespy.co.uk") ||
      hostname.endsWith("pricespy.co.nz") ||
      hostname.endsWith("hintaopas.fi") ||
      hostname.endsWith("ledenicheur.fr")
    ) {
      return (pathname === "/product.php" && url.searchParams.has("p")) || /^\/produkt(?:er)?\//.test(pathname);
    }

    if (hostname.endsWith("godpris.no")) return /^\/produkt\/[^/]+\/?$/.test(pathname);
    if (hostname.endsWith("klarna.com")) return /\/shopping\/pl\/(?:cl\d+\/)?\d+\//.test(pathname);
    if (hostname.endsWith("kelkoo.no")) return /^\/gtin\/\d+\/?$/.test(pathname);
    if (hostname.endsWith("prisradar.no")) return /^\/produkter\/[^/]+\/?$/.test(pathname);
    return false;
  } catch {
    return false;
  }
}

function isCurrentMerchantName(shopName: string, merchantKeys: string[]): boolean {
  const normalizedShopName = normalizeMerchantKey(shopName);
  if (normalizedShopName.length < 3) return false;
  return merchantKeys.some((merchantKey) => normalizedShopName.includes(merchantKey) || merchantKey.includes(normalizedShopName));
}

function getCurrentMerchantKeys(message: GetPriceMatchForProductMessage): string[] {
  const hostKey = readMerchantKeyFromUrl(message.url);
  const organizationKey = message.organizationName !== undefined
    ? normalizeMerchantKey(message.organizationName)
    : undefined;
  return uniqueStrings([hostKey, organizationKey])
    .filter((key) => key.length >= 3 && !GENERIC_MERCHANT_KEYS.has(key));
}

function readMerchantKeyFromUrl(rawUrl: string): string | undefined {
  try {
    const hostname = new URL(rawUrl).hostname.replace(/^www\./, "").toLowerCase();
    const labels = hostname.split(".").filter((label) => label.length > 0);
    const label = labels.length >= 2 ? labels[labels.length - 2] : labels[0];
    return label !== undefined ? normalizeMerchantKey(label) : undefined;
  } catch {
    return undefined;
  }
}

function normalizeMerchantKey(value: string): string {
  return transliterateNorwegianCharacters(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function transliterateNorwegianCharacters(value: string): string {
  return value
    .replace(/[Ææ]/g, "ae")
    .replace(/[Øø]/g, "o")
    .replace(/[Åå]/g, "a");
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => value !== undefined && value.length > 0))];
}

const GENERIC_MERCHANT_KEYS = new Set(["butikk", "shop", "store", "nettbutikk", "online", "norge", "norway"]);
