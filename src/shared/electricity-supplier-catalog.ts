import { isRecord, normalizeHostname, parseUrl } from "./cashback.js";

export const ELECTRICITY_SUPPLIER_CATALOG_URL = "https://cashbacknorge.no/electricity-suppliers.json";
export const ELECTRICITY_SUPPLIER_SOURCE = "https://strom-api.forbrukerradet.no/products/grid/5?yearlyKwhConsumption=14400&norgespris=true&consumptionCode=35";
export type ElectricitySupplier = { id: number; name: string; hostname: string; supplierUrl: string; evidence: "reported-pricelist" | "verified-offer-page" };
export type ElectricitySupplierCatalog = { version: 1; generatedAt: string; source: string; suppliers: ElectricitySupplier[] };
const MAX_AGE = 14 * 86_400_000;
const SOURCE_HOSTS = new Set(["forbrukerradet.no", "strom-api.forbrukerradet.no", "strompris.no", "xn--strmpris-74a.no"]);

function pricelistUrl(value: unknown): URL | undefined {
  const url = typeof value === "string" ? parseUrl(value.trim()) : undefined;
  if (url === undefined || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) return undefined;
  const host = normalizeHostname(url.hostname);
  if (!host.includes(".") || /^[\d.]+$/.test(host) || SOURCE_HOSTS.has(host)) return undefined;
  // Only the organization's own reported price-list URL establishes its domain.
  // Tracking/order URLs, logos and names are not domain evidence.
  url.search = "";
  url.hash = "";
  return url;
}

export function buildElectricitySupplierCatalog(value: unknown, generatedAt: string, verifiedOfferPages: ReadonlyMap<number, string> = new Map()): ElectricitySupplierCatalog {
  if (!Array.isArray(value)) throw new Error("Forbrukerrådet leverandører: ugyldig avtalesvar");
  const byHost = new Map<string, Map<number, ElectricitySupplier>>();
  for (const row of value) {
    if (!isRecord(row) || row.expiredAt !== null || typeof row.publishedAt !== "string" ||
      !Number.isFinite(Date.parse(row.publishedAt)) || Date.parse(row.publishedAt) > Date.parse(generatedAt) ||
      (row.endDate !== null && (typeof row.endDate !== "string" || !Number.isFinite(Date.parse(row.endDate)) || Date.parse(row.endDate) <= Date.parse(generatedAt))) ||
      !isRecord(row.organization)) continue;
    const org = row.organization;
    const reportedUrl = pricelistUrl(org.pricelistUrl);
    const url = reportedUrl ?? pricelistUrl(verifiedOfferPages.get(org.id as number));
    if (url === undefined || !Number.isSafeInteger(org.id) || (org.id as number) <= 0 || typeof org.name !== "string" || !org.name.trim()) continue;
    const hostname = normalizeHostname(url.hostname);
    const suppliers = byHost.get(hostname) ?? new Map<number, ElectricitySupplier>();
    suppliers.set(org.id as number, { id: org.id as number, name: org.name.trim(), hostname, supplierUrl: url.href,
      evidence: reportedUrl === undefined ? "verified-offer-page" : "reported-pricelist" });
    byHost.set(hostname, suppliers);
  }
  const suppliers = [...byHost.values()].filter((rows) => rows.size === 1).flatMap((rows) => [...rows.values()])
    .sort((a, b) => a.hostname.localeCompare(b.hostname));
  const catalog: ElectricitySupplierCatalog = { version: 1, generatedAt, source: ELECTRICITY_SUPPLIER_SOURCE, suppliers };
  if (!isElectricitySupplierCatalog(catalog)) throw new Error("Forbrukerrådet leverandører: tom eller endret leverandørliste");
  return catalog;
}

export function isElectricitySupplierCatalog(value: unknown): value is ElectricitySupplierCatalog {
  if (!isRecord(value) || value.version !== 1 || value.source !== ELECTRICITY_SUPPLIER_SOURCE ||
    typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt)) ||
    !Array.isArray(value.suppliers) || value.suppliers.length < 1 || value.suppliers.length > 500) return false;
  const hosts = new Set<string>();
  return value.suppliers.every((row) => {
    if (!isRecord(row) || !Number.isSafeInteger(row.id) || (row.id as number) <= 0 || typeof row.name !== "string" || !row.name.trim()) return false;
    const url = pricelistUrl(row.supplierUrl);
    if (row.evidence !== "reported-pricelist" && row.evidence !== "verified-offer-page") return false;
    if (url === undefined || typeof row.hostname !== "string" || normalizeHostname(url.hostname) !== row.hostname || hosts.has(row.hostname)) return false;
    hosts.add(row.hostname);
    return true;
  });
}

export function isFreshElectricitySupplierCatalog(catalog: ElectricitySupplierCatalog, now = Date.now()): boolean {
  const age = now - Date.parse(catalog.generatedAt);
  return age >= -86_400_000 && age <= MAX_AGE;
}

export function findElectricitySupplier(value: string, catalog: ElectricitySupplierCatalog | undefined, now = Date.now()): ElectricitySupplier | undefined {
  if (catalog === undefined || !isFreshElectricitySupplierCatalog(catalog, now)) return undefined;
  const url = parseUrl(value);
  if (url === undefined || url.protocol !== "https:" || url.username || url.password || url.port ||
    /(?:^|\/)(?:minside|min-side|logg-inn|login|konto|account|bedrift|business|checkout|bestilling|mobil|nettbutikk)(?:\/|$)/i.test(url.pathname)) return undefined;
  const supplier = catalog.suppliers.find((row) => row.hostname === normalizeHostname(url.hostname));
  if (supplier === undefined) return undefined;
  // A Norwegian section on an international supplier's domain does not establish
  // that its other country sections sell Norwegian household electricity.
  const locale = new URL(supplier.supplierUrl).pathname.match(/^\/(no|nb|nb-no|no-no)(?:\/|$)/i)?.[1];
  return locale === undefined || url.pathname === "/" || url.pathname === `/${locale}` || url.pathname.startsWith(`/${locale}/`) ? supplier : undefined;
}
