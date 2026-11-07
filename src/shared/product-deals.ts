import { isRecord } from "./cashback.js";
import { hasProductVariantConflict, isValidGtin, scoreProductCandidateMatch } from "./product-match.js";
import { getPrisjaktDealGroup, type PrisjaktDeal } from "./prisjakt-deals.js";
import { getProductTitleMatchTokens } from "./product-title-match.js";

export const DEAL_SOURCES = ["prisjakt", "klarna", "prisradar", "godpris"] as const;
export type DealSource = typeof DEAL_SOURCES[number];
export type ProductDeal = PrisjaktDeal & {
  source: DealSource;
  sourceRank: number;
  updatedAt: string;
  codes?: string[];
  shippingAmount?: number;
  referencePrice?: number;
  referenceLabel?: string;
  imageSourceUrl?: string;
};
export type ProductDealSource = ProductDeal;
export type RankedProductDeal = ProductDeal & { rank: number; sources: ProductDealSource[] };
export type ProductDealsCatalog = {
  version: 1;
  generatedAt: string;
  sources: Array<{ source: DealSource; updatedAt: string; count: number; reused: boolean }>;
  deals: RankedProductDeal[];
};

const weight: Record<DealSource, number> = { prisjakt: 1, klarna: 1, prisradar: 0.5, godpris: 0.5 };
const titleKey = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function identityTokens(deal: ProductDeal): string {
  const category = getProductTitleMatchTokens(deal.category ?? "");
  return getProductTitleMatchTokens(deal.name).filter(token => !category.some(word => token.length >= 6 && (word === token || word === `${token}e` || word === `${token}r` || word === `${token}er`))).sort().join(" ");
}

/** Conservative shared matching: contradictory variants/codes never merge.
 * Without a verified common GTIN, require the complete same model title and
 * shared variant guards; broad clothing/size families remain separate. */
export function isSameDealProduct(a: ProductDeal, b: ProductDeal): boolean {
  if (a.source === b.source) return a.id === b.id && a.productUrl === b.productUrl;
  if (hasProductVariantConflict({ searchTerm: a.name }, b.name) || hasProductVariantConflict({ searchTerm: b.name }, a.name)) return false;
  const codesA = (a.codes ?? []).filter(isValidGtin).map(code => code.padStart(14, "0"));
  const codesB = (b.codes ?? []).filter(isValidGtin).map(code => code.padStart(14, "0"));
  const commonCode = codesA.some(code => codesB.includes(code));
  if (codesA.length && codesB.length && !commonCode) return false;
  const score = Math.min(scoreProductCandidateMatch({ searchTerm: a.name }, { title: b.name }), scoreProductCandidateMatch({ searchTerm: b.name }, { title: a.name }));
  if (commonCode) return score >= 0.45;
  if ([a, b].some(item => getPrisjaktDealGroup(item.category) === "Klær og sko")) return false;
  if ([a, b].some(item => [...new URL(item.productUrl).searchParams.keys()].some(key => key.startsWith("a-")))) return false;
  const first = identityTokens(a), second = identityTokens(b);
  return first === second && first.length >= 12 && first.split(" ").length >= 2 && score >= 0.45;
}

/** Weighted reciprocal source rank, with a small bounded price-drop tie break.
 * There is no click tracking. Source order is a signal, not a claimed sales count. */
export function rankProductDeals(deals: ProductDeal[], generatedAt: string): RankedProductDeal[] {
  const now = Date.parse(generatedAt);
  const groups: ProductDeal[][] = [];
  for (const deal of deals) {
    const age = now - Date.parse(deal.updatedAt);
    if (!Number.isFinite(deal.price) || deal.price <= 0 || deal.currency !== "NOK" || !Number.isFinite(age) || age < 0 || age > 14 * 86400000 || deal.validTo && Date.parse(deal.validTo) < now) continue;
    // Complete-link grouping prevents an ambiguous middle title joining variants.
    const group = groups.find(group => group.every(item => isSameDealProduct(item, deal)));
    if (group) { if (!group.some(item => item.source === deal.source && item.id === deal.id)) group.push(deal); }
    else groups.push([deal]);
  }
  return groups.map(group => {
    const sorted = [...group].sort((a, b) => a.price - b.price || weight[b.source] - weight[a.source] || a.id.localeCompare(b.id));
    const best = sorted[0]!;
    const history = sorted.find(item => item.lowestPriceEver !== undefined);
    // All comparisons use item price; known shipping is retained separately.
    const historyFields = history ? { lowestPriceEver: Math.min(best.price, history.lowestPriceEver!),
      ...(history.historyScope ? { historyScope: history.historyScope } : {}), ...(history.historyStartedAt ? { historyStartedAt: history.historyStartedAt } : {}), ...(history.historyUpdatedAt ? { historyUpdatedAt: history.historyUpdatedAt } : {}) } : {};
    const sources = sorted;
    const score = group.reduce((sum, item) => sum + weight[item.source] / (60 + Math.max(1, item.sourceRank)), 0) + Math.min(best.priceDrop ?? 0, 80) / 100_000;
    return { ...best, ...historyFields, sources, rank: 0, score };
  }).sort((a, b) => b.score - a.score || a.source.localeCompare(b.source) || a.id.localeCompare(b.id)).map(({ score: _score, ...deal }, index) => ({ ...deal, rank: index + 1 }));
}

export function isProductDealsCatalog(value: unknown): value is ProductDealsCatalog {
  return isRecord(value) && value.version === 1 && typeof value.generatedAt === "string" && Number.isFinite(Date.parse(value.generatedAt)) &&
    Array.isArray(value.sources) && Array.isArray(value.deals) && value.deals.every(deal => isRecord(deal) &&
      DEAL_SOURCES.includes(deal.source as DealSource) && typeof deal.id === "string" && typeof deal.name === "string" &&
      typeof deal.price === "number" && Number.isFinite(deal.price) && deal.price > 0 && deal.currency === "NOK" &&
      typeof deal.store === "string" && typeof deal.productUrl === "string" && typeof deal.updatedAt === "string" &&
      Number.isFinite(Date.parse(deal.updatedAt)) && typeof deal.rank === "number" && Array.isArray(deal.sources));
}
