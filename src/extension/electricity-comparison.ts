import { ELECTRICITY_EXAMPLE, getElectricityLocalGrids, isElectricityPriceMatchUrl, summarizeElectricityComparison } from "../shared/electricity-price-match.js";
import type { GetPriceMatchForProductMessage, PriceMatchOffer } from "../shared/extension-messages.js";
import type { JsonRequest } from "../shared/prisjakt-price-match.js";
import { loadElectricitySuppliers, type ElectricityCatalogCache } from "../shared/electricity-suppliers.js";

// Automatic public-price benchmark, not an estimate of the visitor's household.
// These public landing pages have no selected municipality or consumption. Use the
// portal's explicitly labelled standard example rather than account data/location.
export function createElectricityComparison(options: {
  getUrl: () => string;
  requestJson: JsonRequest;
  findOffers: (message: GetPriceMatchForProductMessage) => Promise<PriceMatchOffer[]>;
  catalogCache?: ElectricityCatalogCache;
}) {
  let error = "";
  let result: { url: string; expiresAt: number; promise: Promise<PriceMatchOffer[]> } | undefined;
  const isSupported = () => isElectricityPriceMatchUrl(options.getUrl());
  const prepare = () => loadElectricitySuppliers(options.requestJson, options.catalogCache);

  async function getOffers(): Promise<PriceMatchOffer[]> {
    await prepare();
    if (!isSupported()) return [];
    const url = options.getUrl();
    if (result === undefined || result.url !== url || result.expiresAt <= Date.now()) {
      result = { url, expiresAt: Date.now() + 15 * 60_000, promise: (async () => {
        const grids = await getElectricityLocalGrids(options.requestJson);
        const grid = grids.find((grid) => grid.name === ELECTRICITY_EXAMPLE.municipality && grid.areaCode === ELECTRICITY_EXAMPLE.areaCode);
        if (grid === undefined) throw new Error("Forbrukerrådet: regneeksempelets prisområde mangler");
        return options.findOffers({ type: "get-price-match-for-product", url, searchTerm: "Strømavtaler",
          electricity: { localGridId: grid.id, yearlyKwh: ELECTRICITY_EXAMPLE.yearlyKwh, norgespris: ELECTRICITY_EXAMPLE.norgespris } });
      })() };
    }
    try {
      const offers = await result.promise;
      error = offers.length === 0 ? "Ingen sammenlignbare strømavtaler akkurat nå." : "";
      const best = summarizeElectricityComparison(offers);
      return best === undefined ? [] : [best];
    } catch (cause) {
      result = undefined;
      error = cause instanceof Error ? cause.message : "Forbrukerrådet: kunne ikke hente strømavtaler";
      return [];
    }
  }

  return { prepare, isSupported, getOffers, getError: () => error };
}
