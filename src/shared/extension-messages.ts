import {
  type CashbackOffer,
  isCashbackOffer,
  isRecord,
} from "./cashback.js";
import type {
  PlayStationRegionPriceResult,
} from "./playstation-region-prices.js";

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
  productPageClue?: boolean;
  organizationName?: string;
};

export type GetPlayStationRegionPricesMessage = {
  type: "get-playstation-region-prices";
  url: string;
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
  source?: "prisjakt" | "godpris" | "klarna" | "prisradar" | "isthereanydeal";
  sourceName?: string;
  matchedCurrentMerchant?: boolean;
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
    (value.productPageClue === undefined || typeof value.productPageClue === "boolean") &&
    (value.organizationName === undefined || typeof value.organizationName === "string")
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
