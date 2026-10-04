import type { CashbackOffer, CashbackProvider } from "../shared/cashback.js";
import type { Logger } from "./logger.js";

export type CollectProviderOffersOptions = {
  fallbackWhenEmpty?: boolean;
  label: string;
  logger: Logger;
  maxPreviousOfferAgeDays?: number;
  previousOfferFilter?: (offer: CashbackOffer) => boolean;
  previousOffersByProvider: ReadonlyMap<CashbackProvider, CashbackOffer[]>;
  provider?: CashbackProvider;
  reusePreviousOnFailure?: boolean;
  run: () => CashbackOffer[] | Promise<CashbackOffer[]>;
};

export async function collectProviderOffers(
  options: CollectProviderOffersOptions,
): Promise<CashbackOffer[]> {
  let offers: CashbackOffer[];

  try {
    offers = await options.run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const previousOffers = getReusablePreviousOffers(
      options,
      `failed (${message})`,
    );
    if (previousOffers !== undefined) {
      return previousOffers;
    }

    throw new Error(`${options.label}: failed (${message})`);
  }

  if (
    offers.length === 0 &&
    options.fallbackWhenEmpty === true &&
    options.provider !== undefined
  ) {
    const previousOffers = getReusablePreviousOffers(
      options,
      "produced no offers",
    );
    if (previousOffers !== undefined) {
      return previousOffers;
    }
  }

  return offers;
}

function getReusablePreviousOffers(
  options: CollectProviderOffersOptions,
  reason: string,
): CashbackOffer[] | undefined {
  if (
    options.reusePreviousOnFailure !== true ||
    options.provider === undefined
  ) {
    return undefined;
  }

  // A source with fallback enabled must not stop all other providers when
  // its cache becomes unusable. Omit its offers until the source recovers,
  // keeping the age limit and original updatedAt timestamps intact.
  const omitProvider = (fallbackFailure: string): CashbackOffer[] => {
    options.logger.warn(
      `${options.label}: ${reason}; ${fallbackFailure}; skipping provider for this run`,
    );
    return [];
  };

  const providerOffers =
    options.previousOffersByProvider.get(options.provider) ?? [];
  const offerFilter = options.previousOfferFilter;
  const previousOffers = offerFilter === undefined
    ? providerOffers
    : providerOffers.filter((offer) => offerFilter(offer));
  if (previousOffers.length === 0) {
    return omitProvider("no previous offers available for fallback");
  }

  const newestUpdatedAt = readNewestUpdatedAt(previousOffers);
  if (newestUpdatedAt === undefined) {
    return omitProvider("previous offers have no valid updatedAt for fallback");
  }

  const ageMs = Date.now() - newestUpdatedAt.getTime();
  const maxAgeDays = options.maxPreviousOfferAgeDays;
  if (
    maxAgeDays !== undefined &&
    ageMs > maxAgeDays * 24 * 60 * 60 * 1000
  ) {
    return omitProvider(
      `previous offers are ${formatAge(ageMs)} old, above the ${maxAgeDays} day fallback limit`,
    );
  }

  options.logger.warn(
    `${options.label}: ${reason}; keeping ${previousOffers.length} offers from previous index (${formatAge(ageMs)} old)`,
  );
  return previousOffers;
}

export function readNewestUpdatedAt(offers: CashbackOffer[]): Date | undefined {
  let newestTime = Number.NEGATIVE_INFINITY;

  for (const offer of offers) {
    const time = Date.parse(offer.updatedAt);
    if (Number.isFinite(time) && time > newestTime) {
      newestTime = time;
    }
  }

  return newestTime === Number.NEGATIVE_INFINITY
    ? undefined
    : new Date(newestTime);
}

function formatAge(ageMs: number): string {
  if (ageMs < 0) {
    return "0 days";
  }

  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  if (ageDays < 1) {
    const ageHours = Math.max(1, Math.round(ageMs / (60 * 60 * 1000)));
    return `${ageHours} hour${ageHours === 1 ? "" : "s"}`;
  }

  const roundedDays = Math.round(ageDays * 10) / 10;
  return `${roundedDays} day${roundedDays === 1 ? "" : "s"}`;
}
