import bundled from "../../data/mobile-suppliers.json" with { type: "json" };
import { isRecord, normalizeHostname, parseUrl } from "./cashback.js";
import { createPublicCatalogStore, isFreshPublicCatalog, type PublicCatalogCache } from "./public-catalog.js";
import type { JsonRequest } from "./prisjakt-price-match.js";
import { getTekCataloguePlans, requestTekJson, TEK_MOBILE_API } from "./tek-mobile-api.js";

export type MobileSupplier = { id: number; name: string; hostname: string; path: string; evidence: "tek-destination" | "verified-site"; supplierUrl: string };
export type MobileSupplierCatalog = { version: 1; source: typeof TEK_MOBILE_API; generatedAt: string; suppliers: MobileSupplier[] };
export const MOBILE_SUPPLIER_CACHE_KEY = "mobileSupplierCatalog";
export type MobileCatalogCache = PublicCatalogCache<MobileSupplierCatalog>;

function safeSite(value: unknown): URL | undefined {
  const u = typeof value === "string" ? parseUrl(value) : undefined;
  return u !== undefined && u.protocol === "https:" && !u.username && !u.password && !u.port &&
    /\.(?:no|com)$/.test(u.hostname) && !/[?]/.test(u.pathname) ? u : undefined;
}

export function buildMobileSupplierCatalog(rows: Record<string, unknown>[], generatedAt: string, verified: readonly MobileSupplier[] = []): MobileSupplierCatalog {
  const entries = new Map<string, MobileSupplier>();
  for (const row of rows) {
    if (row.type !== "mobile-plan" || !isRecord(row.operator) || !Number.isSafeInteger(row.operator.id) ||
      typeof row.operator.name !== "string" || typeof row.operator.slug !== "string") continue;
    const operator = row.operator;
    let site = safeSite(row.affiliateSignupUrl);
    if (site?.hostname === "linkfusion.no") site = safeSite(site.searchParams.get("url"));
    // Tracking domains and unrelated advertiser redirects establish no identity.
    // The brand must be present in the explicit first-party destination hostname.
    const brand = String(operator.slug).replace(/[^a-z0-9]/gi, "").toLowerCase();
    const brandParts = String(operator.slug).split("-").filter((s) => s.length >= 4 && s !== "mobil");
    let internationalBrand = "";
    try { internationalBrand = new URL(`https://${String(operator.name).replace(/\s/g, "").toLowerCase()}.no`).hostname.split(".")[0] ?? ""; } catch { /* Invalid name isn't domain evidence. */ }
    const hostnameBrand = site === undefined ? "" : normalizeHostname(site.hostname).replace(/[^a-z0-9]/gi, "");
    if (!brand || !site || !(hostnameBrand.includes(brand) || brandParts.some((part) => hostnameBrand.includes(part)) ||
      internationalBrand.startsWith("xn--") && normalizeHostname(site.hostname).startsWith(`${internationalBrand}.`))) site = undefined;
    const fallback = verified.filter((v) => v.id === operator.id && v.name === operator.name && v.evidence === "verified-site");
    if (site === undefined) {
      for (const v of fallback) entries.set(`${v.id}:${v.hostname}:${v.path}`, v);
      continue;
    }
    // Source-owned signup subdomains belong to the same explicitly linked brand.
    const hostname = normalizeHostname(site.hostname).replace(/^(?:signup|bestilling)\./, "");
    const scope = site.pathname.match(/^\/(mobil)(?:\/|$)/)?.[0];
    const entry: MobileSupplier = { id: operator.id as number, name: operator.name as string, hostname, path: scope ? "/mobil" : "/",
      supplierUrl: `https://${hostname}${scope ? "/mobil/" : "/"}`, evidence: "tek-destination" };
    entries.set(`${entry.id}:${hostname}:${entry.path}`, entry);
  }
  const suppliers = [...entries.values()].filter((row, _, all) => !all.some((other) => other.id !== row.id && other.hostname === row.hostname && other.path === row.path))
    .sort((a, b) => a.hostname.localeCompare(b.hostname));
  const catalog: MobileSupplierCatalog = { version: 1, source: TEK_MOBILE_API, generatedAt, suppliers };
  if (!isMobileSupplierCatalog(catalog)) throw new Error("Tek operatører: ingen verifiserte leverandørdomener");
  return catalog;
}

export function isMobileSupplierCatalog(value: unknown): value is MobileSupplierCatalog {
  return isRecord(value) && value.version === 1 && value.source === TEK_MOBILE_API && typeof value.generatedAt === "string" &&
    Number.isFinite(Date.parse(value.generatedAt)) && Array.isArray(value.suppliers) && value.suppliers.length > 0 && value.suppliers.length <= 100 &&
    value.suppliers.every((row) => isRecord(row) && Number.isSafeInteger(row.id) && (row.id as number) > 0 && typeof row.name === "string" && row.name.length > 0 &&
      typeof row.hostname === "string" && normalizeHostname(row.hostname) === row.hostname && safeSite(row.supplierUrl)?.hostname === row.hostname &&
      typeof row.path === "string" && /^\/(?:mobil)?$/.test(row.path) && (row.evidence === "tek-destination" || row.evidence === "verified-site"));
}

export function findMobileSupplier(value: string, catalog: MobileSupplierCatalog | undefined): MobileSupplier | undefined {
  if (!catalog || !isFreshPublicCatalog(catalog)) return undefined;
  const url = safeSite(value);
  if (!url || /(?:^|\/)(?:minside|min-side|login|konto|account|bedrift|business|checkout|bestilling)(?:\/|$)/i.test(url.pathname)) return undefined;
  return catalog.suppliers.find((s) => s.hostname === normalizeHostname(url.hostname) &&
    (s.path === "/" || url.pathname === s.path || url.pathname.startsWith(`${s.path}/`)));
}

const store = createPublicCatalogStore(bundled, isMobileSupplierCatalog);
export function getMobileSupplier(url: string) { return findMobileSupplier(url, store.get()); }
export function loadMobileSuppliers(requestJson: JsonRequest = requestTekJson, cache?: MobileCatalogCache) {
  return store.load(async () => {
    const current = store.get();
    if (current && Date.now() - Date.parse(current.generatedAt) < 86_400_000) return current;
    const plans = await getTekCataloguePlans(requestJson);
    return buildMobileSupplierCatalog(plans, new Date().toISOString(), isMobileSupplierCatalog(bundled) ? bundled.suppliers : []);
  }, cache);
}
