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
    hasNumericModelConflict(anchor.searchTerm, candidateTitle) ||
    hasModelTierConflict(anchor.searchTerm, candidateTitle) ||
    hasColorVariantConflict(anchor.searchTerm, candidateTitle);
}

// "Osmo Action 4" vs "Osmo Action 6" og "iPhone 17" vs "iPhone 17e" er ulike
// produkter selv om resten av tittelen er identisk: frittstående småtall
// (og tall med kort bokstavsuffiks) må overlappe når begge titler har dem.
// Tall fulgt av enhetsord ("45 mm", "75 ml") og desimaler/multipacker holdes utenfor.
const NUMERIC_MODEL_UNIT_WORDS = new Set([
  "a", "ah", "ar", "cl", "cm", "dl", "fps", "g", "gb", "ghz", "gr", "h", "hz", "in", "kg",
  "khz", "km", "kw", "kwh", "l", "m", "mah", "mb", "mg", "ml", "mm", "pack", "pakke",
  "pakning", "pakninger", "pcs", "pk", "prosent", "stk", "t", "tb", "timer", "tommer", "tum",
  "v", "w", "wh", "x", "år",
]);
const NUMERIC_MODEL_SPEC_TOKENS = new Set(["2k", "4k", "8k", "3g", "4g", "5g"]);

export function hasNumericModelConflict(anchorText: string, candidateTitle: string): boolean {
  const anchorTokens = readNumericModelTokens(anchorText);
  const candidateTokens = readNumericModelTokens(candidateTitle);

  if (
    hasUnitSuffixModelConflict(anchorTokens, candidateTokens) ||
    hasUnitSuffixModelConflict(candidateTokens, anchorTokens)
  ) {
    return true;
  }

  if (anchorTokens.numbers.size === 0 || candidateTokens.numbers.size === 0) return false;
  return ![...anchorTokens.numbers].some((number) => candidateTokens.numbers.has(number));
}

// "Pixel 10" vs "Pixel 10a": "10a" tolkes normalt som enhet (10 ampere) og holdes
// utenfor modelltallene, men når motparten har samme grunntall som frittstående
// modelltall er bokstavsuffikset en variantmarkør, ikke en enhet.
function hasUnitSuffixModelConflict(first: NumericModelTokens, second: NumericModelTokens): boolean {
  return [...first.unitSuffixed.entries()].some(([token, base]) => {
    return !first.numbers.has(base) && second.numbers.has(base) && !second.unitSuffixed.has(token);
  });
}

type NumericModelTokens = {
  numbers: Set<string>;
  // Tall med tvetydig énbokstavs enhetssuffiks ("10a", "18v"): token -> grunntall.
  unitSuffixed: Map<string, string>;
};

function readNumericModelTokens(text: string): NumericModelTokens {
  const normalized = text
    .toLowerCase()
    .replace(/\d+[.,]\d+/g, " ")
    .replace(/\b\d+\s*x\s*\d+/g, " ")
    .replace(/\d+\s*%/g, " ");
  const tokens = normalized.split(/[^a-z0-9æøå]+/).filter((token) => token.length > 0);

  const numbers = new Set<string>();
  const unitSuffixed = new Map<string, string>();
  for (const [index, token] of tokens.entries()) {
    if (/^\d{1,3}$/.test(token)) {
      const nextToken = tokens[index + 1];
      if (nextToken === undefined || !NUMERIC_MODEL_UNIT_WORDS.has(nextToken)) {
        numbers.add(token);
      }
      continue;
    }
    if (NUMERIC_MODEL_SPEC_TOKENS.has(token)) continue;
    if (/^\d{1,3}[a-z]{1,2}$/.test(token) && !isUnitLikeToken(token)) {
      numbers.add(token);
      continue;
    }
    const unitSuffixMatch = /^(\d{1,3})[a-z]$/.exec(token);
    if (unitSuffixMatch?.[1] !== undefined && isUnitLikeToken(token)) {
      unitSuffixed.set(token, unitSuffixMatch[1]);
    }
  }
  return { numbers, unitSuffixed };
}

// "WH-1000XM6 (sort)" vs "WH-1000XM6 Sandstone" er ulike varianter: når begge
// titler oppgir farge må minst én farge være felles. Engelske fargenavn
// normaliseres til norsk før sammenligning.
const COLOR_VARIANT_TOKEN_GROUPS = new Map<string, string>([
  ["beige", "beige"],
  ["bla", "bla"],
  ["black", "svart"],
  ["blue", "bla"],
  ["brown", "brun"],
  ["brun", "brun"],
  ["carbon", "svart"],
  ["gold", "gull"],
  ["gra", "gra"],
  ["graphite", "gra"],
  ["gray", "gra"],
  ["green", "gronn"],
  ["grey", "gra"],
  ["gronn", "gronn"],
  ["gul", "gul"],
  ["gull", "gull"],
  ["hvit", "hvit"],
  ["lilla", "lilla"],
  ["navy", "bla"],
  ["orange", "oransje"],
  ["oransje", "oransje"],
  ["pink", "rosa"],
  ["purple", "lilla"],
  ["red", "rod"],
  ["rod", "rod"],
  ["rosa", "rosa"],
  ["sandstone", "sandstone"],
  ["silver", "solv"],
  ["solv", "solv"],
  ["sort", "svart"],
  ["svart", "svart"],
  ["violet", "lilla"],
  ["white", "hvit"],
  ["yellow", "gul"],
]);

export function hasColorVariantConflict(anchorText: string, candidateTitle: string): boolean {
  const anchorColors = readColorVariantTokens(anchorText);
  if (anchorColors.size === 0) return false;

  const candidateColors = readColorVariantTokens(candidateTitle);
  if (candidateColors.size === 0) return false;

  return ![...anchorColors].some((color) => candidateColors.has(color));
}

function readColorVariantTokens(text: string): Set<string> {
  const colors = new Set<string>();
  for (const token of tokenizeBrandText(text)) {
    const color = COLOR_VARIANT_TOKEN_GROUPS.get(token);
    if (color !== undefined) colors.add(color);
  }
  return colors;
}

// "S26" vs "S26 Ultra" og "iPhone 15 Pro" vs "iPhone 15 Pro Max" er ulike produkter:
// tier-ordene må være de samme i begge titler.
const MODEL_TIER_TOKENS = new Set(["ultra", "pro", "plus", "max", "mini", "lite", "air", "xl", "fe", "fold", "flip"]);

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
  // Heller ingen match enn feil match: har ankeret et utvetydig modellnummer,
  // er en kandidat helt uten modellnummer ("LinkBuds Fit") ikke samme produkt.
  if (candidateModels.length === 0) return anchorModels.some(isStrongModelNumberToken);

  // "WH-1000XM6" vs "WF-1000XM6" deler sifferdelen, men prefikset skiller
  // produktseriene: har begge sider bokstavprefiksede modellnumre, må de matche.
  const anchorPrefixedModels = anchorModels.filter(isLetterPrefixedModelToken);
  const candidatePrefixedModels = candidateModels.filter(isLetterPrefixedModelToken);
  if (
    anchorPrefixedModels.length > 0 &&
    candidatePrefixedModels.length > 0 &&
    !hasCompatibleModelNumberPair(anchorPrefixedModels, candidatePrefixedModels)
  ) {
    return true;
  }

  return !hasCompatibleModelNumberPair(anchorModels, candidateModels);
}

export function hasMatchingModelNumberToken(anchorText: string, candidateTitle: string): boolean {
  const anchorModels = readModelNumberTokens(anchorText);
  const candidateModels = readModelNumberTokens(candidateTitle);
  return anchorModels.length > 0 && candidateModels.length > 0 &&
    hasCompatibleModelNumberPair(anchorModels, candidateModels);
}

function hasCompatibleModelNumberPair(anchorModels: string[], candidateModels: string[]): boolean {
  return anchorModels.some((anchorModel) => candidateModels.some((candidateModel) => {
    return anchorModel === candidateModel ||
      (anchorModel.length >= 3 && candidateModel.includes(anchorModel)) ||
      (candidateModel.length >= 3 && anchorModel.includes(candidateModel));
  }));
}

// Korte koder som "4k", "5g" og "ps5" er for generiske til å kreve gjenfunn hos kandidaten.
function isStrongModelNumberToken(token: string): boolean {
  return token.length >= 4 && !GENERIC_SPEC_TOKENS.has(token);
}

function isLetterPrefixedModelToken(token: string): boolean {
  return /^[a-z]/.test(token) && isStrongModelNumberToken(token);
}

const GENERIC_SPEC_TOKENS = new Set(["wifi5", "wifi6", "wifi7", "usb2", "usb3", "usb4", "hdmi2", "bt50"]);

function readModelNumberTokens(text: string): string[] {
  const bareTokens = text
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length >= 2 && /[a-z]/.test(token) && /\d/.test(token) && !isUnitLikeToken(token));
  // "WH-1000XM6" og "WH 1000XM6" normaliseres til "wh1000xm6" slik at serieprefikset
  // blir del av modellnummeret uansett skrivemåte. Spesifikasjonspar som
  // "RAM 256GB" (tallresten er en enhet) er ikke modellnumre.
  const joinedTokens = [...text.matchAll(/\b([A-Za-z]{1,4})[-\s](\d[A-Za-z0-9]{2,})\b/g)]
    .filter((match) => !isUnitLikeToken((match[2] ?? "").toLowerCase()))
    .map((match) => `${match[1]}${match[2]}`.toLowerCase())
    .filter((token) => !isUnitLikeToken(token));
  return uniqueStrings([...bareTokens, ...joinedTokens]);
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
