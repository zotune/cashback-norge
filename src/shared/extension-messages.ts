import {
  type CashbackOffer,
  isCashbackOffer,
  isRecord,
} from "./cashback.js";

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
