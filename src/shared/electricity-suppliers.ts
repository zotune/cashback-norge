import bundled from "../../data/electricity-suppliers.json" with { type: "json" };
import type { JsonRequest } from "./prisjakt-price-match.js";
import { ELECTRICITY_SUPPLIER_CATALOG_URL, findElectricitySupplier, isElectricitySupplierCatalog, isFreshElectricitySupplierCatalog, type ElectricitySupplierCatalog } from "./electricity-supplier-catalog.js";

export type ElectricityCatalogCache = { read: () => Promise<unknown>; write: (catalog: ElectricitySupplierCatalog) => Promise<void> };
export const ELECTRICITY_SUPPLIER_CACHE_KEY = "electricitySupplierCatalog";
let active: ElectricitySupplierCatalog | undefined = isElectricitySupplierCatalog(bundled) ? bundled : undefined;
let pending: Promise<void> | undefined;
let loadedAt = 0;

export function getElectricitySupplier(url: string) { return findElectricitySupplier(url, active); }
export function getElectricitySupplierCatalog(): ElectricitySupplierCatalog | undefined {
  return active !== undefined && isFreshElectricitySupplierCatalog(active) ? active : undefined;
}

export async function loadElectricitySuppliers(requestJson: JsonRequest = fetchCatalog, cache?: ElectricityCatalogCache): Promise<void> {
  if (pending !== undefined) return pending;
  if (Date.now() - loadedAt < 15 * 60_000) return;
  const adopt = (value: unknown) => {
    if (isElectricitySupplierCatalog(value) && isFreshElectricitySupplierCatalog(value) &&
      (active === undefined || Date.parse(value.generatedAt) > Date.parse(active.generatedAt))) active = value;
  };
  pending = (async () => {
    if (cache !== undefined) { try { adopt(await cache.read()); } catch { /* Public bundled catalogue remains available. */ } }
    try { adopt(await requestJson(ELECTRICITY_SUPPLIER_CATALOG_URL, { credentials: "omit" })); } catch { /* Unpublished/offline: retain the freshest valid catalogue. */ }
    if (cache !== undefined && active !== undefined && isFreshElectricitySupplierCatalog(active)) {
      try { await cache.write(active); } catch { /* An unavailable cache does not hide current suppliers. */ }
    }
    loadedAt = Date.now();
  })();
  try { await pending; } finally { pending = undefined; }
}

async function fetchCatalog(url: string): Promise<unknown> {
  const response = await fetch(url, { credentials: "omit", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Forbrukerrådet leverandørkatalog: HTTP ${response.status}`);
  return response.json();
}
