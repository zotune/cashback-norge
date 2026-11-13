import {
  type CashbackOffer,
  isCashbackOffer,
} from "../shared/cashback.js";
import { readJsonFile } from "./json-file.js";

// Hand-written offers go first in the merge and win ties, so a forgotten entry
// would hide the live offer forever. Like provider fallbacks, they expire
// after 14 days unless someone updates updatedAt after checking the source.
export const MANUAL_OFFER_MAX_AGE_DAYS = 14;

export async function readManualOffers(filePath: string, now = new Date()): Promise<CashbackOffer[]> {
  const value = await readJsonFile(filePath);

  if (!Array.isArray(value) || !value.every(isCashbackOffer)) {
    throw new Error(`Invalid manual offers JSON: ${filePath}`);
  }

  return value.filter((offer) => isFreshManualOffer(offer, now));
}

export function isFreshManualOffer(offer: CashbackOffer, now = new Date()): boolean {
  const updatedAt = Date.parse(offer.updatedAt);
  if (!Number.isFinite(updatedAt)) return false;
  return now.getTime() - updatedAt <= MANUAL_OFFER_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}
