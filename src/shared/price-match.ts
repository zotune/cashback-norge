import type {
  GetPriceMatchForProductMessage,
  PriceMatchOffer,
} from "./extension-messages.js";
import { findGodprisPriceMatch } from "./godpris-price-match.js";
import { findKlarnaPriceMatch } from "./klarna-price-match.js";
import {
  findPrisjaktPriceMatch,
  type JsonRequest,
} from "./prisjakt-price-match.js";

type TextRequest = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<string | undefined>;

export async function findPriceMatches(
  message: GetPriceMatchForProductMessage,
  requestJson?: JsonRequest,
  requestText?: TextRequest,
): Promise<PriceMatchOffer[]> {
  const [prisjaktOffer, godprisOffer, klarnaOffer] = await Promise.all([
    findPrisjaktPriceMatch(message, requestJson),
    findGodprisPriceMatch(message, requestJson, requestText),
    findKlarnaPriceMatch(message, requestJson),
  ]);

  return [prisjaktOffer, godprisOffer, klarnaOffer]
    .filter((offer): offer is PriceMatchOffer => offer !== undefined)
    .sort((first, second) => {
      const amountDifference = (first.sortAmount ?? first.amount) - (second.sortAmount ?? second.amount);
      if (amountDifference !== 0) return amountDifference;
      return sourceRank(first) - sourceRank(second);
    });
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
  return 3;
}
