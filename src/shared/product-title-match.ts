const PRODUCT_TITLE_BASE_MATCH_SEPARATORS = [
  /\s+\|\s+/,
  /\s+[-\u2013\u2014]\s+/,
  /\s+\u2022\s+/,
];

const CANONICAL_MATCH_TOKENS = new Map<string, string>([
  ["black", "svart"],
  ["blue", "bla"],
  ["brown", "brun"],
  ["carbon", "svart"],
  ["controller", "kontroller"],
  ["controllers", "kontroller"],
  ["gamepad", "kontroller"],
  ["gamepads", "kontroller"],
  ["gold", "gull"],
  ["gray", "gra"],
  ["green", "gronn"],
  ["grey", "gra"],
  ["joypad", "kontroller"],
  ["orange", "oransje"],
  ["pink", "rosa"],
  ["purple", "lilla"],
  ["red", "rod"],
  ["silver", "solv"],
  ["wireless", "tradlos"],
  ["sort", "svart"],
  ["white", "hvit"],
  ["yellow", "gul"],
]);

const CONDITION_VARIANT_TOKENS = ["fornyet", "refurbished", "renewed", "brukt", "used", "preowned"];
const GENERIC_PRODUCT_SIGNAL_TOKENS = new Set([
  "antibacterial",
  "ansiktskrem",
  "cleansing",
  "hydrating",
  "intensive",
  "moisturising",
  "moisturizing",
  "protective",
  "repairing",
  "sensitive",
  "soothing",
]);

export function scoreProductTitleAgainstSearchTerm(searchTerm: string, title: string): number {
  return Math.max(
    0,
    ...buildProductTitleBaseCandidates(searchTerm).map((candidate) => scoreProductTitleMatch(candidate, title)),
  );
}

export function isLikelySameProductTitle(searchTerm: string, title: string, minimumScore = 0.45): boolean {
  return buildProductTitleBaseCandidates(searchTerm).some((candidate) => {
    return scoreProductTitleMatch(candidate, title) >= minimumScore && hasProductTitleSignalOverlap(candidate, title);
  });
}

export function scoreProductTitleMatch(query: string, title: string): number {
  const queryTokens = tokenizeMatchText(query);
  const titleTokens = new Set(tokenizeMatchText(title));
  if (queryTokens.length === 0 || titleTokens.size === 0) return 0;

  let matchedWeight = 0;
  let totalWeight = 0;
  for (const token of queryTokens) {
    const weight = isModelNumberLikeToken(token) ? 3 : token.length >= 6 ? 2 : token.length >= 4 ? 1.5 : 1;
    totalWeight += weight;
    if (titleTokens.has(token)) {
      matchedWeight += weight;
      continue;
    }

    if ([...titleTokens].some((titleToken) => titleToken.length >= 4 && (titleToken.startsWith(token) || token.startsWith(titleToken)))) {
      matchedWeight += weight * 0.5;
    }
  }

  const score = totalWeight > 0 ? matchedWeight / totalWeight : 0;
  return hasUnrequestedConditionVariant(queryTokens, titleTokens) ? score * 0.2 : score;
}

function hasProductTitleSignalOverlap(query: string, title: string): boolean {
  const querySignals = tokenizeMatchText(query).filter(isProductSignalToken);
  if (querySignals.length === 0) return true;

  const titleTokens = tokenizeMatchText(title);
  if (titleTokens.length === 0) return false;

  return querySignals.some((queryToken) => {
    return titleTokens.some((titleToken) => {
      return titleToken === queryToken ||
        (titleToken.length >= 4 && (titleToken.startsWith(queryToken) || queryToken.startsWith(titleToken)));
    });
  });
}

function isProductSignalToken(token: string): boolean {
  if (isModelNumberLikeToken(token)) return true;
  return token.length >= 6 &&
    /[a-z]/.test(token) &&
    !/\d/.test(token) &&
    !GENERIC_PRODUCT_SIGNAL_TOKENS.has(token);
}

// Modellnumre ("1000xm6", "rld35ga") er det mest produktidentifiserende vi har:
// de teller som signal-tokens og vektes høyest i scoringen.
function isModelNumberLikeToken(token: string): boolean {
  return token.length >= 4 && /[a-z]/.test(token) && /\d/.test(token) && !isMeasurementUnitLikeToken(token);
}

function isMeasurementUnitLikeToken(token: string): boolean {
  return /^\d+(?:[.,]\d+)?(?:ml|cl|dl|l|g|gr|kg|mg|gb|tb|mb|mm|cm|m|km|w|kw|wh|kwh|mah|hz|khz|ghz|v|a|ah|stk|pk|pcs|fps|tommer|tum|in)$/.test(token);
}

function buildProductTitleBaseCandidates(searchTerm: string): string[] {
  const normalizedSearchTerm = searchTerm.trim().replace(/\s+/g, " ");
  const separatorPrefixCandidates = PRODUCT_TITLE_BASE_MATCH_SEPARATORS.map((separator) => normalizedSearchTerm.split(separator)[0]);
  const buyTitleMatch = normalizedSearchTerm.match(/^(?:kj\u00f8p|kjop|buy)\s+(.+?)\s+(?:hos|at)\s+.+$/i);

  return uniqueStrings([
    normalizedSearchTerm,
    ...separatorPrefixCandidates,
    buyTitleMatch?.[1],
  ]).filter((candidate) => candidate.length >= 4);
}

function tokenizeMatchText(value: string): string[] {
  const normalizedValue = transliterateNorwegianCharacters(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  return uniqueStrings(normalizedValue
    .split(/[^A-Za-z0-9]+/)
    .map(normalizeMatchToken)
    .filter((token): token is string => token !== undefined && token.length >= 2)
    .map(canonicalizeMatchToken));
}

function normalizeMatchToken(value: string): string | undefined {
  const normalized = transliterateNorwegianCharacters(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function canonicalizeMatchToken(token: string): string {
  return CANONICAL_MATCH_TOKENS.get(token) ?? token;
}

function hasUnrequestedConditionVariant(queryTokens: string[], titleTokens: Set<string>): boolean {
  return CONDITION_VARIANT_TOKENS.some((token) => titleTokens.has(token) && !queryTokens.includes(token));
}

function transliterateNorwegianCharacters(value: string): string {
  return value
    .replace(/[\u00C6\u00E6]/g, "ae")
    .replace(/[\u00D8\u00F8]/g, "o")
    .replace(/[\u00C5\u00E5]/g, "a");
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => value !== undefined && value.length > 0))];
}
