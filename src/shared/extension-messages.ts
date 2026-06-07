import {
  type CashbackOffer,
  isCashbackOffer,
  isRecord,
} from "./cashback.js";
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
};

export type CashbackNoneMessage = {
  type: "cashback-none";
};

export type GetOffersForUrlMessage = {
  type: "get-offers-for-url";
  url: string;
};

export type GetPriceMatchForProductMessage = {
  type: "get-price-match-for-product";
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
    }
  | {
      ok: false;
      reason: string;
    };

export type PriceMatchOffer = {
  source?: "prisjakt" | "godpris" | "klarna" | "prisradar" | "isthereanydeal" | "ggdeals" | "allkeyshop" | "taxfree" | "vinmonopolet" | "sesum" | "enhver" | "kassal" | "finnreise" | "panflights" | "skyscanner";
  sourceName?: string;
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
  alternatives?: PriceMatchAlternative[];
};

export type PriceMatchAlternative = {
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
    value.offers.every(isCashbackOffer)
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
    (value.price === undefined || typeof value.price === "number") &&
    (value.currency === undefined || typeof value.currency === "string") &&
    (value.productUrl === undefined || typeof value.productUrl === "string") &&
    (value.codes === undefined || (Array.isArray(value.codes) && value.codes.every((code) => typeof code === "string"))) &&
    (value.productTitleCandidates === undefined || (Array.isArray(value.productTitleCandidates) && value.productTitleCandidates.every((candidate) => typeof candidate === "string"))) &&
    (value.productPageClue === undefined || typeof value.productPageClue === "boolean") &&
    (value.organizationName === undefined || typeof value.organizationName === "string") &&
    (value.productBrand === undefined || typeof value.productBrand === "string") &&
    (value.packageAmount === undefined || typeof value.packageAmount === "number") &&
    (value.packageUnit === undefined || isProductPackageUnit(value.packageUnit)) &&
    (value.volumeMl === undefined || typeof value.volumeMl === "number") &&
    (value.alcoholPercent === undefined || typeof value.alcoholPercent === "number")
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
      value.offers.every(isCashbackOffer)
    );
  }

  return typeof value.reason === "string";
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}
