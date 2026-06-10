import type { GetPriceMatchForProductMessage } from "./extension-messages.js";
import {
  isSamePackageQuantity,
  readPackageQuantityFromText,
  type ProductPackageQuantity,
} from "./grocery-price-match-utils.js";
import {
  isLikelySameProductTitle,
  scoreProductTitleAgainstSearchTerm,
} from "./product-title-match.js";

export const MIN_PRODUCT_MATCH_SCORE = 0.45;

const STORAGE_SIZE_PATTERN = /\b(\d+(?:[.,]\d+)?)\s*(tb|gb)\b/gi;
const BRAND_MATCH_GROUPS = [
  ["apple"],
  ["google", "pixel"],
  ["microsoft", "xbox"],
  ["nintendo"],
  ["samsung"],
  ["sony", "playstation"],
];
const NAMED_HTML_ENTITIES = new Map<string, string>([
  ["amp", "&"],
  ["quot", "\""],
  ["apos", "'"],
  ["nbsp", " "],
  ["shy", ""],
  ["aring", "å"],
  ["Aring", "Å"],
  ["aelig", "æ"],
  ["AElig", "Æ"],
  ["oslash", "ø"],
  ["Oslash", "Ø"],
  ["auml", "ä"],
  ["Auml", "Ä"],
  ["ouml", "ö"],
  ["Ouml", "Ö"],
  ["uuml", "ü"],
  ["Uuml", "Ü"],
  ["eacute", "é"],
  ["Eacute", "É"],
  ["egrave", "è"],
  ["deg", "°"],
  ["trade", "™"],
  ["reg", "®"],
  ["copy", "©"],
]);

export type ProductMatchAnchor = {
  searchTerm: string;
  packageQuantity?: ProductPackageQuantity;
};

export type ProductMatchCandidateInfo = {
  title: string;
  brand?: string | undefined;
};

export function buildProductMatchAnchor(message: GetPriceMatchForProductMessage): ProductMatchAnchor {
  const packageQuantity = message.packageAmount !== undefined && message.packageUnit !== undefined
    ? { amount: message.packageAmount, unit: message.packageUnit }
    : undefined;
  return {
    searchTerm: message.searchTerm,
    ...(packageQuantity !== undefined ? { packageQuantity } : {}),
  };
}

export function scoreProductCandidateMatch(
  anchor: ProductMatchAnchor,
  candidate: ProductMatchCandidateInfo,
  minimumScore = MIN_PRODUCT_MATCH_SCORE,
): number {
  const candidateTitles = uniqueStrings([
    candidate.brand !== undefined && !candidate.title.toLowerCase().includes(candidate.brand.toLowerCase())
      ? `${candidate.brand} ${candidate.title}`
      : undefined,
    candidate.title,
  ]);

  let bestScore = 0;
  for (const title of candidateTitles) {
    if (hasProductVariantConflict(anchor, title)) continue;
    if (!isLikelySameProductTitle(anchor.searchTerm, title, minimumScore)) continue;

    const score = scoreProductTitleAgainstSearchTerm(anchor.searchTerm, title);
    bestScore = Math.max(bestScore, hasBrandConflict(anchor.searchTerm, candidate.brand) ? score * 0.3 : score);
  }
  return bestScore;
}

export function pickBestProductCandidate<T>(
  anchor: ProductMatchAnchor,
  candidates: T[],
  readCandidate: (candidate: T) => ProductMatchCandidateInfo | undefined,
  minimumScore = MIN_PRODUCT_MATCH_SCORE,
): T | undefined {
  let best: { candidate: T; score: number } | undefined;
  for (const candidate of candidates) {
    const info = readCandidate(candidate);
    if (info === undefined) continue;

    const score = scoreProductCandidateMatch(anchor, info, minimumScore);
    if (score >= minimumScore && (best === undefined || score > best.score)) {
      best = { candidate, score };
    }
  }
  return best?.candidate;
}

export function hasProductVariantConflict(anchor: ProductMatchAnchor, candidateTitle: string): boolean {
  return hasPackageQuantityConflict(anchor, candidateTitle) ||
    hasStorageSizeConflict(anchor.searchTerm, candidateTitle) ||
    hasModelNumberConflict(anchor.searchTerm, candidateTitle) ||
    hasModelTierConflict(anchor.searchTerm, candidateTitle);
}

// "S26" vs "S26 Ultra" og "iPhone 15 Pro" vs "iPhone 15 Pro Max" er ulike produkter:
// tier-ordene må være de samme i begge titler.
const MODEL_TIER_TOKENS = new Set(["ultra", "pro", "plus", "max", "mini", "lite", "air", "xl", "fe"]);

export function hasModelTierConflict(anchorText: string, candidateTitle: string): boolean {
  const anchorTiers = readModelTierTokens(anchorText);
  const candidateTiers = readModelTierTokens(candidateTitle);
  return anchorTiers.size !== candidateTiers.size || ![...anchorTiers].every((tier) => candidateTiers.has(tier));
}

function readModelTierTokens(text: string): Set<string> {
  return new Set(tokenizeBrandText(text).filter((token) => MODEL_TIER_TOKENS.has(token)));
}

// Modellnumre (tokens med både bokstaver og siffer, f.eks. "D20", "R2563H") er det
// som skiller produkter der generiske ord ellers dominerer tittelscoren.
export function hasModelNumberConflict(anchorText: string, candidateTitle: string): boolean {
  const anchorModels = readModelNumberTokens(anchorText);
  if (anchorModels.length === 0) return false;

  const candidateModels = readModelNumberTokens(candidateTitle);
  if (candidateModels.length === 0) return false;

  return !anchorModels.some((anchorModel) => candidateModels.some((candidateModel) => {
    return anchorModel === candidateModel ||
      (anchorModel.length >= 3 && candidateModel.includes(anchorModel)) ||
      (candidateModel.length >= 3 && anchorModel.includes(candidateModel));
  }));
}

function readModelNumberTokens(text: string): string[] {
  return uniqueStrings(text
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length >= 2 && /[a-z]/.test(token) && /\d/.test(token) && !isUnitLikeToken(token)));
}

// "75ml", "128gb", "47mm" osv. er varianter (dekkes av mengde-/lagringssjekkene), ikke modellnumre.
function isUnitLikeToken(token: string): boolean {
  return /^\d+(?:[.,]\d+)?(?:ml|cl|dl|l|g|gr|kg|mg|gb|tb|mb|mm|cm|m|km|w|kw|wh|kwh|mah|hz|khz|ghz|v|a|ah|stk|pk|pcs|fps|tommer|tum|in)$/.test(token);
}

function hasPackageQuantityConflict(anchor: ProductMatchAnchor, candidateTitle: string): boolean {
  const expectedQuantity = anchor.packageQuantity ?? readPackageQuantityFromText(anchor.searchTerm);
  if (expectedQuantity === undefined) return false;

  const candidateQuantity = readPackageQuantityFromText(candidateTitle);
  return candidateQuantity !== undefined && !isSamePackageQuantity(expectedQuantity, candidateQuantity);
}

export function hasStorageSizeConflict(anchorText: string, candidateTitle: string): boolean {
  const anchorSizes = readStorageSizesGb(anchorText);
  if (anchorSizes.length === 0) return false;

  const candidateSizes = readStorageSizesGb(candidateTitle);
  if (candidateSizes.length === 0) return false;

  return !anchorSizes.some((size) => candidateSizes.includes(size));
}

function readStorageSizesGb(text: string): number[] {
  const sizes = new Set<number>();
  for (const match of text.matchAll(STORAGE_SIZE_PATTERN)) {
    const amount = Number.parseFloat((match[1] ?? "").replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    sizes.add((match[2] ?? "").toLowerCase() === "tb" ? amount * 1024 : amount);
  }
  return [...sizes];
}

export function hasBrandConflict(anchorText: string, candidateBrand: string | undefined): boolean {
  if (candidateBrand === undefined) return false;
  const anchorTokens = new Set(tokenizeBrandText(anchorText));
  const brandTokens = new Set(tokenizeBrandText(candidateBrand));
  if (anchorTokens.size === 0 || brandTokens.size === 0) return false;

  const anchorBrandGroups = BRAND_MATCH_GROUPS.filter((group) => group.some((token) => anchorTokens.has(token)));
  if (anchorBrandGroups.length === 0) return false;

  return !anchorBrandGroups.some((group) => group.some((token) => brandTokens.has(token)));
}

export function isLikelyGtin(value: string): boolean {
  return /^(?:\d{8}|\d{12,14})$/.test(value.trim());
}

export function isLikelyMpn(value: string): boolean {
  const normalized = value.trim();
  if (normalized.length < 5 || normalized.length > 40 || isLikelyGtin(normalized)) return false;
  return /^[A-Za-z0-9][A-Za-z0-9._/ -]*$/.test(normalized) && /[A-Za-z]/.test(normalized) && /\d/.test(normalized);
}

export function decodeHtmlEntities(value: string): string {
  if (!value.includes("&")) return value;
  return value.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const isHex = entity[1] === "x" || entity[1] === "X";
      const code = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_HTML_ENTITIES.get(entity) ?? NAMED_HTML_ENTITIES.get(entity.toLowerCase()) ?? match;
  });
}

function tokenizeBrandText(value: string): string[] {
  return uniqueStrings(value
    .split(/[^A-Za-z0-9ÆØÅæøå]+/)
    .map(normalizeBrandToken)
    .filter((token): token is string => token !== undefined && token.length >= 2));
}

function normalizeBrandToken(value: string): string | undefined {
  const normalized = value
    .replace(/[Ææ]/g, "ae")
    .replace(/[Øø]/g, "o")
    .replace(/[Åå]/g, "a")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => value !== undefined && value.length > 0))];
}
