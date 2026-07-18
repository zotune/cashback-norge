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

export type KrRewardOptions = {
  // false = beløpene er bonus/rabatt (cashback/kuponger), aldri en pris kunden betaler;
  // posisjonerte beløp får da ikke «totalsum»-suffikset.
  totalsum?: boolean;
};

export function extractKrReward(text: string, options?: KrRewardOptions): string {
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

  // "Spar opptil 600 kr", "Spar 600 kr", "Spar 5855 kroner", "Spar inntil 2400 kroner", "Opptil 600 kr"
  const sparValues: number[] = [];
  const sparPattern = /(?:spar\s+(?:opptil\s+|inntil\s+)?|opptil\s+)(?:kr\s*)?(\d[\d\s]*(?:[,.]\d+)?)\s*(?:kroner|kr)\b/gi;
  for (const m of cleanedText.matchAll(sparPattern)) {
    const n = parseKrNumber(m[1] ?? "");
    if (n > 0) sparValues.push(n);
  }
  const sparDashPattern = /(?:spar\s+(?:opptil\s+|inntil\s+)?|opptil\s+)(?:kr\s*)?(\d[\d\s]*(?:[,.]\d+)?)\s*(?:,-|[-–](?!\s*(?:\d|%)))/gi;
  for (const m of cleanedText.matchAll(sparDashPattern)) {
    const n = parseKrNumber(m[1] ?? "");
    if (n > 0) sparValues.push(n);
  }
  if (sparValues.length > 0) {
    return formatKrReward(sparValues);
  }

  return extractPositionedKrReward(cleanedText, options?.totalsum !== false);
}

// Helt gratis = totalpris 0 kr; samme representasjon på tvers av providere.
export function extractGratisReward(text: string): string {
  return /\bgratis\b/i.test(text) ? "0 kr totalsum" : "";
}

function stripOrdinaryPriceParentheticals(text: string): string {
  return text.replace(/\([^()]*\b(?:ordinær|vanlig)\s+pris\b[^()]*\)/gi, " ");
}

function hasExcludedKrPrefix(text: string, amountIndex: number): boolean {
  const beforeAmount = text.slice(0, amountIndex).replace(/\s+/g, " ");
  return /(?:^|[\s(])(?:fra|minst|minimum|over)\s+(?:kr\s*)?$/i.test(beforeAmount);
}

function extractPositionedKrReward(text: string, totalsum: boolean): string {
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
    const formatted = formatKrReward(fixedValues);
    return totalsum ? `${formatted} totalsum` : formatted;
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

// Felles utvinning av belønning fra fritekst-beskrivelser av medlemsfordeler
// (boligbyggelag og medlemsforeninger): prosent foretrekkes, deretter kr,
// medlemspris og gratis.
export function extractBenefitReward(text: string): string {
  if (/\bhalv\s+pris\b/i.test(text)) return "50 %";

  const oreLitre = extractOreLitreReward(text);
  if (oreLitre) return oreLitre;

  const rewardText = relevantBenefitRewardText(text);
  const percentage = extractPercentageReward(rewardText);
  if (percentage) return percentage;

  const kr = extractKrReward(rewardText);
  if (kr) return kr;

  // Mid-sentence values the positional kr patterns can't see:
  // "gavekort på kr 750,-", "Tibber Pulse kostnadsfritt … verdi på 995 kroner"
  const giftMatch = text.match(
    /(?:gavekort|verdikupong)[^.\n]{0,50}?(?:på|verdt)\s+(?:kr\s*)?(\d[\d\s.]*\d|\d)\s*(?:kr|kroner|,-)/i,
  ) ?? text.match(/\bverdi\s+på\s+(?:kr\s*)?(\d[\d\s.]*\d|\d)\s*(?:kr|kroner|,-)/i);
  if (giftMatch !== null) {
    const amount = Number.parseInt((giftMatch[1] ?? "").replace(/[\s.]/g, ""), 10);
    if (Number.isFinite(amount) && amount > 0) {
      return `${amount.toLocaleString("nb-NO").replace(/[  ]/g, " ")} kr`;
    }
  }

  if (/\bmedlemspris(?:er)?\b/i.test(text)) return "Medlemspris";
  const gratis = extractGratisReward(text);
  if (gratis) return gratis;
  if (/\brabatt/i.test(text)) return "Rabatt";

  return "";
}

export function relevantBenefitRewardText(text: string): string {
  return text
    .split(/[\n.;]+/)
    .map((line) => line.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim())
    .filter((line) => {
      // Price-list lines ("Medlemspris: 10 625 kroner") state prices, not discounts.
      if (/^(?:medlemspris|vanlig pris|ordinær pris|pris)\s*:/i.test(line)) return false;

      // "Hva får du?"-lists render as bare lines like "10 % på Ekornes"
      // or "AUBO-kjøkken: 25 % rabatt".
      if (/^\d{1,3}(?:[,.]\d+)?\s*(?:%|prosent)(?:\s+(?:på|hos|i)\b|$)/i.test(line)) return true;

      return /\b(?:rabatt(?:er)?|medlemsrabatt|besparelse|avslag|spar|tilbud|medlemspris(?:er)?|bonus|gavekort|kostnadsfritt|verdi)\b/i.test(line) ||
        /\bhalv\s+pris\b/i.test(line);
    })
    .join("\n");
}
