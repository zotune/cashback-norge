import type { ProductReviews, StoreRating } from "./product-reviews.js";
import type { DealPriceHistory } from "./deal-price-history.js";
import { isTrustpilotProfile, type TrustpilotProfile, type TrustpilotResult } from "./trustpilot.js";
import {
  type CashbackOffer,
  type ProviderMeta,
  isCashbackOffer,
  isProviderMeta,
  isRecord,
} from "./cashback.js";
import type { MobilePriceDetails } from "./mobile-price-match.js";
import { isElectricitySearch, type ElectricitySearch, type ElectricityPriceDetails } from "./electricity-price-match.js";
import type {
  PlayStationRegionPriceResult,
} from "./playstation-region-prices.js";
import {
  isProductPackageUnit,
  type ProductPackageUnit,
} from "./grocery-price-match-utils.js";

export type CashbackFoundMessage = {
  type: "cashback-found";
  offers: CashbackOffer[];
  providers?: Record<string, ProviderMeta>;
  cardOffers?: CashbackOffer[];
};

export type CashbackNoneMessage = {
  type: "cashback-none";
};

export type GetOffersForUrlMessage = {
  type: "get-offers-for-url";
  url: string;
};

export type GetStoreReviewsMessage = { type: "get-store-reviews"; url: string };
export type CaptureStoreReviewsMessage = { type: "capture-store-reviews"; profile: TrustpilotProfile };
export type StoreReviewsResponse = { ok: true; result?: TrustpilotResult; prisjakt?: StoreRating } | { ok: false; reason: string };

export function isGetStoreReviewsMessage(value: unknown): value is GetStoreReviewsMessage {
  return isRecord(value) && value.type === "get-store-reviews" && typeof value.url === "string" && value.url.length <= 2048;
}

export function isCaptureStoreReviewsMessage(value: unknown): value is CaptureStoreReviewsMessage {
  return isRecord(value) && value.type === "capture-store-reviews" && isTrustpilotProfile(value.profile);
}

export type GetPriceMatchForProductMessage = {
  type: "get-price-match-for-product";
  electricity?: ElectricitySearch;
  mobile?: boolean;
  url: string;
  searchTerm: string;
  price?: number;
  currency?: string;
  productUrl?: string;
  codes?: string[];
  productTitleCandidates?: string[];
  productPageClue?: boolean;
  organizationName?: string;
  productBrand?: string;
  productLanguage?: string;
  packageAmount?: number;
  packageUnit?: ProductPackageUnit;
  volumeMl?: number;
  alcoholPercent?: number;
};

export type GetPlayStationRegionPricesMessage = {
  type: "get-playstation-region-prices";
  url: string;
};

export type HttpRequestMessage = {
  type: "http-request";
  url: string;
  responseType: "json" | "text";
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  credentials?: RequestCredentials;
};

export type ToggleNoticeMessage = {
  type: "toggle-notice";
};

export type OffersForUrlResponse =
  | {
      ok: true;
      offers: CashbackOffer[];
      providers?: Record<string, ProviderMeta>;
      cardOffers?: CashbackOffer[];
    }
  | {
      ok: false;
      reason: string;
    };

export type PriceMatchOffer = {
  electricity?: ElectricityPriceDetails;
  mobile?: MobilePriceDetails;
  mobileBroadband?: PriceMatchAlternative;
  source?: "tek" | "forbrukerradet" | "prisjakt" | "godpris" | "pokepris" | "klarna" | "prisradar" | "isthereanydeal" | "ggdeals" | "allkeyshop" | "taxfree" | "vinmonopolet" | "sesum" | "enhver" | "kassal" | "etilbudsavis" | "finnreise" | "panflights" | "momondo" | "skyscanner" | "travellink" | "tripcom" | "kiwi" | "googleflights" | "googleshopping";
  sourceName?: string;
  details?: string;
  matchedCurrentMerchant?: boolean;
  matchedExactProduct?: boolean;
  shopName: string;
  price: string;
  amount: number;
  sortAmount?: number;
  currency: string;
  productName: string;
  productUrl: string;
  offerUrl?: string;
  // Bilde av tilbudet (f.eks. utklipp fra kundeavisen), bare https.
  imageUrl?: string;
  alternatives?: PriceMatchAlternative[];
  // Norske tester og kjøpervurderinger fra kilden (src/shared/product-reviews.ts).
  reviews?: ProductReviews;
  // Laveste registrerte varepris hos kilden (src/shared/deal-price-history.ts), inkludert dagens pris.
  priceHistory?: DealPriceHistory;
  // Kildens søk var ikke ferdig modnet da tilbudet ble hentet; prisen kan fortsatt bli bedre.
  searchIncomplete?: boolean;
};

export type PriceMatchAlternative = {
  electricity?: ElectricityPriceDetails;
  mobile?: MobilePriceDetails;
  productName?: string;
  offerUrl?: string;
  imageUrl?: string;
  matchedCurrentMerchant?: boolean;
  shopName: string;
  price: string;
  amount: number;
  sortAmount?: number;
  currency: string;
  platform?: string;
  shippingPrice?: string;
  totalPrice?: string;
};

export type PriceMatchForProductResponse =
  | {
      ok: true;
      offer?: PriceMatchOffer;
      offers?: PriceMatchOffer[];
    }
  | {
      ok: false;
      reason: string;
    };

export type PlayStationRegionPricesResponse =
  | {
      ok: true;
      result?: PlayStationRegionPriceResult;
    }
  | {
      ok: false;
      reason: string;
    };

export type HttpRequestResponse =
  | {
      ok: true;
      responseType: "json";
      value: unknown;
    }
  | {
      ok: true;
      responseType: "text";
      text: string;
    }
  | {
      ok: false;
      reason: string;
      status?: number;
    };

export function isCashbackFoundMessage(
  value: unknown,
): value is CashbackFoundMessage {
  return (
    isRecord(value) &&
    value.type === "cashback-found" &&
    Array.isArray(value.offers) &&
    value.offers.every(isCashbackOffer) &&
    isOptionalProviderMetaRecord(value.providers) &&
    (value.cardOffers === undefined || (Array.isArray(value.cardOffers) && value.cardOffers.every(isCashbackOffer)))
  );
}

function isOptionalProviderMetaRecord(
  value: unknown,
): value is Record<string, ProviderMeta> | undefined {
  return (
    value === undefined ||
    (isRecord(value) && Object.values(value).every(isProviderMeta))
  );
}

export function isCashbackNoneMessage(
  value: unknown,
): value is CashbackNoneMessage {
  return isRecord(value) && value.type === "cashback-none";
}

export function isGetOffersForUrlMessage(
  value: unknown,
): value is GetOffersForUrlMessage {
  return (
    isRecord(value) &&
    value.type === "get-offers-for-url" &&
    typeof value.url === "string"
  );
}

export function isGetPriceMatchForProductMessage(
  value: unknown,
): value is GetPriceMatchForProductMessage {
  return (
    isRecord(value) &&
    value.type === "get-price-match-for-product" &&
    typeof value.url === "string" &&
    typeof value.searchTerm === "string" &&
    (value.mobile === undefined || typeof value.mobile === "boolean") &&
    (value.price === undefined || typeof value.price === "number") &&
    (value.currency === undefined || typeof value.currency === "string") &&
    (value.productUrl === undefined || typeof value.productUrl === "string") &&
    (value.codes === undefined || (Array.isArray(value.codes) && value.codes.every((code) => typeof code === "string"))) &&
    (value.productTitleCandidates === undefined || (Array.isArray(value.productTitleCandidates) && value.productTitleCandidates.every((candidate) => typeof candidate === "string"))) &&
    (value.productPageClue === undefined || typeof value.productPageClue === "boolean") &&
    (value.organizationName === undefined || typeof value.organizationName === "string") &&
    (value.productBrand === undefined || typeof value.productBrand === "string") &&
    (value.productLanguage === undefined || typeof value.productLanguage === "string") &&
    (value.packageAmount === undefined || typeof value.packageAmount === "number") &&
    (value.packageUnit === undefined || isProductPackageUnit(value.packageUnit)) &&
    (value.volumeMl === undefined || typeof value.volumeMl === "number") &&
    (value.alcoholPercent === undefined || typeof value.alcoholPercent === "number") &&
    (value.electricity === undefined || isElectricitySearch(value.electricity))
  );
}

export function isGetPlayStationRegionPricesMessage(
  value: unknown,
): value is GetPlayStationRegionPricesMessage {
  return (
    isRecord(value) &&
    value.type === "get-playstation-region-prices" &&
    typeof value.url === "string"
  );
}

export function isHttpRequestMessage(
  value: unknown,
): value is HttpRequestMessage {
  return (
    isRecord(value) &&
    value.type === "http-request" &&
    typeof value.url === "string" &&
    (value.responseType === "json" || value.responseType === "text") &&
    (value.method === undefined || typeof value.method === "string") &&
    (value.headers === undefined || isStringRecord(value.headers)) &&
    (value.body === undefined || typeof value.body === "string") &&
    (value.credentials === undefined || value.credentials === "include" || value.credentials === "omit" || value.credentials === "same-origin")
  );
}

export function isOffersForUrlResponse(
  value: unknown,
): value is OffersForUrlResponse {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return false;
  }

  if (value.ok) {
    return (
      Array.isArray(value.offers) &&
      value.offers.every(isCashbackOffer) &&
      isOptionalProviderMetaRecord(value.providers) &&
      (value.cardOffers === undefined || (Array.isArray(value.cardOffers) && value.cardOffers.every(isCashbackOffer)))
    );
  }

  return typeof value.reason === "string";
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}
