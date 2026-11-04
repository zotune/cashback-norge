import type { PriceMatchOffer } from "../shared/extension-messages.js";

export function createAutomaticComparison(options: {
  getUrl: () => string; prepare: () => Promise<void>; isSupported: () => boolean;
  load: (url: string) => Promise<PriceMatchOffer[]>; sourceName: string;
}) {
  let error = "";
  let result: { url: string; expiresAt: number; promise: Promise<PriceMatchOffer[]> } | undefined;
  return {
    prepare: options.prepare, isSupported: options.isSupported, getError: () => error,
    async getOffers(): Promise<PriceMatchOffer[]> {
      await options.prepare();
      if (!options.isSupported()) return [];
      const url = options.getUrl();
      if (!result || result.url !== url || result.expiresAt <= Date.now()) {
        result = { url, expiresAt: Date.now() + 15 * 60_000, promise: options.load(url) };
      }
      try {
        const offers = await result.promise;
        error = offers.length ? "" : "Ingen sammenlignbare avtaler akkurat nå.";
        return offers;
      } catch (cause) {
        result = undefined;
        error = `${options.sourceName}: ${cause instanceof Error ? cause.message : "kunne ikke hente avtaler"}`;
        return [];
      }
    },
  };
}
