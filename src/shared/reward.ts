const MATERIAL_WORD_AFTER_PERCENT = /^\s+(?:bomull|polyester|lin|ull|nylon|akryl|viskose|elastan|silke|modal|lyocell|tencel|fleece|lær|skinn|rayon|spandex|denim)\b/i;

export function extractPercentageValues(text: string): number[] {
  const values: number[] = [];
  const percentPattern = /(\d{1,3}(?:[,.]\d+)?)\s*(?:[-\u2013\u2014]\s*(\d{1,3}(?:[,.]\d+)?)\s*)?(?:%|prosent)(?![a-zA-ZæøåÆØÅ])/gi;

  for (const match of text.matchAll(percentPattern)) {
    const afterMatch = text.slice((match.index ?? 0) + match[0].length);
    if (MATERIAL_WORD_AFTER_PERCENT.test(afterMatch)) continue;

    values.push(parseRewardNumber(match[1]));

    if (match[2] !== undefined) {
      values.push(parseRewardNumber(match[2]));
    }
  }

  return values.filter((value) => value > 0 && value <= 100);
}

export function extractPercentageReward(text: string, suffix = ""): string {
  return formatPercentageReward(extractPercentageValues(text), suffix);
}

export function formatPercentageReward(values: number[], suffix = ""): string {
  if (values.length === 0) return "";

  const min = Math.min(...values);
  const max = Math.max(...values);

  return min < max
    ? `${formatRewardNumber(min)}-${formatRewardNumber(max)} %${suffix}`
    : `${formatRewardNumber(max)} %${suffix}`;
}

export function normalizeRewardLabel(reward: string): string {
  return reward
    .trim()
    .replace(/\s+/g, " ")
    .replace(/(\d+(?:[,.]\d+)?)\s*[-\u2013\u2014]\s*(\d+(?:[,.]\d+)?)\s*%/g, (_match, min: string, max: string) => {
      return `${formatLocalizedNumber(min)}-${formatLocalizedNumber(max)} %`;
    })
    .replace(/(\d+(?:[,.]\d+)?)\s*%/g, (_match, value: string) => {
      return `${formatLocalizedNumber(value)} %`;
    })
    .replace(/(\d+(?:[,.]\d+)?)\s*kr\b/gi, (_match, value: string) => {
      return `${formatLocalizedNumber(value)} kr`;
    });
}

export function extractKrReward(text: string): string {
  const cleanedText = stripOrdinaryPriceParentheticals(text);

  // Split into sentences/clauses and look for ones containing rabatt/avslag
  const clauses = cleanedText.split(/[.;]/);
  const rabattValues: number[] = [];

  for (const clause of clauses) {
    if (!/\b(?:rabatt|avslag)\b/i.test(clause)) continue;
    // Also "kr X,- i rabatt"
    const prefixedAmounts = clause.matchAll(/\bkr\s*(\d[\d\s]*(?:[,.]\d+)?)\s*(?:[,.-]\s*[-–]?)?\s*(?:i\s+)?(?:rabatt|avslag)\b/gi);
    for (const m of prefixedAmounts) {
      if (hasExcludedKrPrefix(clause, m.index ?? 0)) continue;
      const n = parseKrNumber(m[1] ?? "");
      if (n > 0) rabattValues.push(n);
    }
    // Extract all kr amounts in this clause, excluding "minst/minimum/over/fra X kr"
    const amounts = clause.matchAll(/(\d[\d\s]*(?:[,.]\d+)?)\s*(?:kroner|kr)\b/gi);
    for (const m of amounts) {
      if (hasExcludedKrPrefix(clause, m.index ?? 0)) continue;
      const n = parseKrNumber(m[1] ?? "");
      if (n > 0) rabattValues.push(n);
    }
    // Also "X,– i rabatt" (no kr keyword)
    const dashAmounts = clause.matchAll(/(\d[\d\s]*),[-–]\s*(?:i\s+)?(?:rabatt|avslag)\b/gi);
    for (const m of dashAmounts) {
      if (hasExcludedKrPrefix(clause, m.index ?? 0)) continue;
      const n = parseKrNumber(m[1] ?? "");
      if (n > 0) rabattValues.push(n);
    }
  }

  if (rabattValues.length > 0) {
    return formatKrReward(rabattValues);
  }

  // "Spar opptil 600 kr", "Spar 600 kr", "Opptil 600 kr"
  const sparValues: number[] = [];
  const sparPattern = /(?:(?:spar\s+)?opptil|spar)\s+(?:kr\s*)?(\d[\d\s]*(?:[,.]\d+)?)\s*kr?\b/gi;
  for (const m of cleanedText.matchAll(sparPattern)) {
    const n = parseKrNumber(m[1] ?? "");
    if (n > 0) sparValues.push(n);
  }
  const sparDashPattern = /(?:(?:spar\s+)?opptil|spar)\s+(?:kr\s*)?(\d[\d\s]*(?:[,.]\d+)?)\s*(?:,-|[-–](?!\s*(?:\d|%)))/gi;
  for (const m of cleanedText.matchAll(sparDashPattern)) {
    const n = parseKrNumber(m[1] ?? "");
    if (n > 0) sparValues.push(n);
  }
  if (sparValues.length > 0) {
    return formatKrReward(sparValues);
  }

  return extractPositionedKrReward(cleanedText);
}

function stripOrdinaryPriceParentheticals(text: string): string {
  return text.replace(/\([^()]*\b(?:ordinær|vanlig)\s+pris\b[^()]*\)/gi, " ");
}

function hasExcludedKrPrefix(text: string, amountIndex: number): boolean {
  const beforeAmount = text.slice(0, amountIndex).replace(/\s+/g, " ");
  return /(?:^|[\s(])(?:fra|minst|minimum|over)\s+(?:kr\s*)?$/i.test(beforeAmount);
}

function extractPositionedKrReward(text: string): string {
  const fixedValues: number[] = [];
  const hourlyValues: number[] = [];
  const positionedAmountPattern =
    /(?:^|[\r\n]|:)\s*(?:[-*•]\s*)?(?!(?:minst|minimum|over)\b)(?:fra\s+)?(?:kr\s*(\d[\d\s]*(?:[,.]\d+)?)|(\d[\d\s]*(?:[,.]\d+)?)\s*(?:kroner|kr)\b)/gim;

  for (const match of text.matchAll(positionedAmountPattern)) {
    const rawValue = match[1] ?? match[2] ?? "";
    const value = parseKrNumber(rawValue);
    if (value <= 0) continue;

    const afterMatch = text.slice((match.index ?? 0) + match[0].length);
    if (/^\s+per\s+time\b/i.test(afterMatch)) {
      hourlyValues.push(value);
    } else {
      fixedValues.push(value);
    }
  }

  const offerPricePattern =
    /\b(?:earlybird-tilbud|kampanjepris|medlemspris|obos-pris|tilbud)\s+på\s+(?:kr\s*)?(\d[\d\s]*(?:[,.]\d+)?)\s*(?:kroner|kr)\b/gi;
  for (const match of text.matchAll(offerPricePattern)) {
    const value = parseKrNumber(match[1] ?? "");
    if (value > 0) addUniqueNumber(fixedValues, value);
  }

  if (fixedValues.length > 0 && hourlyValues.length > 0) {
    return formatKrRange(Math.min(...fixedValues), Math.min(...hourlyValues));
  }

  if (fixedValues.length > 0) {
    return `${formatKrReward(fixedValues)} totalsum`;
  }

  if (hourlyValues.length > 0) {
    const min = Math.min(...hourlyValues);
    const max = Math.max(...hourlyValues);
    return min === max
      ? `Fra ${formatKrNumber(min)} kr/time`
      : `${formatKrNumber(min)}-${formatKrNumber(max)} kr/time`;
  }

  return "";
}

function addUniqueNumber(values: number[], value: number): void {
  if (!values.includes(value)) values.push(value);
}

function formatKrReward(values: number[]): string {
  return formatKrRange(Math.min(...values), Math.max(...values));
}

function formatKrRange(min: number, max: number): string {
  return min === max ? `${formatKrNumber(max)} kr` : `${formatKrNumber(min)}-${formatKrNumber(max)} kr`;
}

function formatKrNumber(value: number): string {
  return value.toLocaleString("nb-NO").replace(/[\u00a0\u202f]/g, " ");
}

export function extractOreLitreReward(text: string): string {
  const litreValues = extractOreValues(
    text,
    /(?:opptil\s+|minst\s+)?(\d+)\s*øre(?:\s*\/\s*l|\s+(?:rabatt\s+)?per\s+liter)/gi,
  );
  const chargeValues = extractOreValues(
    text,
    /(?:opptil\s+|minst\s+)?(\d+)\s*øre\s*\/\s*k(?:w|v)t/gi,
  );
  const parts = [
    formatOreUnitReward(litreValues, "kr/l"),
    formatOreUnitReward(chargeValues, "kr/kWt"),
  ].filter(Boolean);

  return parts.join(" + ");
}

function extractOreValues(text: string, pattern: RegExp): number[] {
  const values: number[] = [];
  for (const match of text.matchAll(pattern)) {
    const value = Number.parseInt(match[1] ?? "", 10);
    if (value > 0) values.push(value);
  }
  return values;
}

function formatOreUnitReward(values: number[], unit: string): string {
  if (values.length === 0) return "";

  const min = Math.min(...values);
  const max = Math.max(...values);
  return min < max
    ? `${formatOreAsKr(min)}-${formatOreAsKr(max)} ${unit}`
    : `${formatOreAsKr(max)} ${unit}`;
}

function formatOreAsKr(ore: number): string {
  return (ore / 100).toFixed(2).replace(".", ",");
}

function parseKrNumber(value: string): number {
  return Number.parseInt(
    value
      .replace(/[,–\s]+$/, "")
      .replace(/\.(?=\d{3}\b)/g, "")
      .replace(/\s+/g, ""),
    10,
  );
}

export function formatRewardNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
}

function formatLocalizedNumber(value: string): string {
  return value.replace(".", ",");
}

function parseRewardNumber(value: string | undefined): number {
  return Number.parseFloat((value ?? "0").replace(",", "."));
}
