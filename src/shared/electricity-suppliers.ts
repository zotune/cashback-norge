import bundled from "../../data/electricity-suppliers.json" with { type: "json" };
import type { JsonRequest } from "./prisjakt-price-match.js";
import { ELECTRICITY_SUPPLIER_CATALOG_URL, findElectricitySupplier, isElectricitySupplierCatalog, type ElectricitySupplierCatalog } from "./electricity-supplier-catalog.js";

import { createPublicCatalogStore, type PublicCatalogCache } from "./public-catalog.js";

export type ElectricityCatalogCache = PublicCatalogCache<ElectricitySupplierCatalog>;
export const ELECTRICITY_SUPPLIER_CACHE_KEY = "electricitySupplierCatalog";
const store = createPublicCatalogStore(bundled, isElectricitySupplierCatalog);
export function getElectricitySupplier(url: string) { return findElectricitySupplier(url, store.get()); }
export function getElectricitySupplierCatalog() { return store.get(); }
export async function loadElectricitySuppliers(requestJson: JsonRequest = fetchCatalog, cache?: ElectricityCatalogCache): Promise<void> {
  return store.load(() => requestJson(ELECTRICITY_SUPPLIER_CATALOG_URL, { credentials: "omit" }), cache);
}
async function fetchCatalog(url: string): Promise<unknown> {
  const response = await fetch(url, { credentials: "omit", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Forbrukerrådet leverandørkatalog: HTTP ${response.status}`);
  return response.json();
}
