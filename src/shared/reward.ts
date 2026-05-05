export function extractPercentageValues(text: string): number[] {
  const values: number[] = [];
  const percentPattern = /(\d{1,3}(?:[,.]\d+)?)\s*(?:[-\u2013\u2014]\s*(\d{1,3}(?:[,.]\d+)?)\s*)?%(?![a-zA-ZæøåÆØÅ])/gi;

  for (const match of text.matchAll(percentPattern)) {
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
  // Split into sentences/clauses and look for ones containing rabatt/avslag
  const clauses = text.split(/[.;]/);
  const rabattValues: number[] = [];

  for (const clause of clauses) {
    if (!/\b(?:rabatt|avslag)\b/i.test(clause)) continue;
    // Extract all kr amounts in this clause, excluding "minst/minimum/over X kr"
    const amounts = clause.matchAll(/(?<!(?:minst|minimum|over|fra)\s{0,5})(\d[\d\s]*(?:,–)?)\s*kr\b/gi);
    for (const m of amounts) {
      const n = parseKrNumber(m[1] ?? "");
      if (n > 0) rabattValues.push(n);
    }
    // Also "X,– i rabatt" (no kr keyword)
    const dashAmounts = clause.matchAll(/(\d[\d\s]*),–\s*(?:i\s+)?(?:rabatt|avslag)\b/gi);
    for (const m of dashAmounts) {
      const n = parseKrNumber(m[1] ?? "");
      if (n > 0) rabattValues.push(n);
    }
  }

  if (rabattValues.length > 0) {
    const min = Math.min(...rabattValues);
    const max = Math.max(...rabattValues);
    return min < max ? `${min}-${max} kr rabatt` : `${max} kr rabatt`;
  }

  // "Spar opptil 600 kr", "Spar 600 kr", "Opptil 600 kr"
  const sparValues: number[] = [];
  const sparPattern = /(?:(?:spar\s+)?opptil|spar)\s+(?:kr\s*)?(\d[\d\s]*(?:[,.]\d+)?)\s*kr?\b/gi;
  for (const m of text.matchAll(sparPattern)) {
    const n = parseKrNumber(m[1] ?? "");
    if (n > 0) sparValues.push(n);
  }
  if (sparValues.length > 0) {
    const min = Math.min(...sparValues);
    const max = Math.max(...sparValues);
    return min < max ? `${min}-${max} kr` : `${max} kr`;
  }

  return "";
}

export function extractOreLitreReward(text: string): string {
  const values: number[] = [];
  for (const m of text.matchAll(/(?:opptil\s+)?(\d+)\s*øre\/l/gi)) {
    const n = Number.parseInt(m[1] ?? "", 10);
    if (n > 0) values.push(n);
  }
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min < max ? `${min}-${max} øre/l` : `Opptil ${max} øre/l`;
}

function parseKrNumber(value: string): number {
  return Number.parseInt(value.replace(/[,–\s]+$/, "").replace(/\s+/g, ""), 10);
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
