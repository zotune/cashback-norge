import { createAutomaticComparison } from "./automatic-comparison.js";
import { ELECTRICITY_AREAS, ELECTRICITY_EXAMPLE, getElectricityLocalGrids, isElectricityPriceMatchUrl, summarizeElectricityComparison } from "../shared/electricity-price-match.js";
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
  return createAutomaticComparison({
    getUrl: options.getUrl,
    prepare: () => loadElectricitySuppliers(options.requestJson, options.catalogCache),
    isSupported: () => isElectricityPriceMatchUrl(options.getUrl()),
    sourceName: "Forbrukerrådet",
    load: async (url) => {
      const grids = await getElectricityLocalGrids(options.requestJson);
      const results: PriceMatchOffer[] = [];
      const errors: string[] = [];
      // One area at a time: each adapter call makes at most two anonymous GETs.
      // No user position or state from the source website is read.
      for (const area of ELECTRICITY_AREAS) {
        const grid = grids.find((grid) => grid.name === area.municipality && grid.areaCode === area.areaCode);
        if (!grid) { errors.push(`${area.areaCode}: kommuneeksemplet mangler hos kilden`); continue; }
        try {
          const offers = await options.findOffers({ type: "get-price-match-for-product", url, searchTerm: "Strømavtaler",
            electricity: { localGridId: grid.id, yearlyKwh: ELECTRICITY_EXAMPLE.yearlyKwh, norgespris: ELECTRICITY_EXAMPLE.norgespris,
              municipality: grid.name, areaCode: grid.areaCode } });
          const best = summarizeElectricityComparison(offers);
          if (best) results.push(best); else errors.push(`${area.areaCode}: ingen sammenlignbare avtaler`);
        } catch (error) {
          const text = error instanceof Error ? error.message : "nettverksfeil";
          errors.push(`${area.areaCode}: ${text}`);
          if (/HTTP (?:403|429)/.test(text)) break;
        }
      }
      if (!results.length && errors.length) throw new Error(errors.join("; "));
      if (errors.length) for (const result of results) result.details += `\n\nUfullstendig oppslag: ${errors.join("; ")}`;
      return results;
    },
  });
}
