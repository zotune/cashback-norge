export function extractPercentageValues(text: string): number[] {
  const values: number[] = [];
  const percentPattern = /(\d{1,3}(?:[,.]\d+)?)\s*(?:[-\u2013\u2014]\s*(\d{1,3}(?:[,.]\d+)?)\s*)?%(?!\s*[a-zA-ZæøåÆØÅ])/gi;

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
  // "600,– i rabatt", "600 kr i rabatt", "600 kr rabatt", "600 kr avslag"
  const rabattMatch = text.match(
    /(\d[\d\s]*(?:,–)?)\s*(?:kr\b)?\s*(?:i\s+)?(?:rabatt|avslag)\b/i,
  );
  if (rabattMatch) {
    const value = rabattMatch[1].replace(/[,–\s]+$/, "").replace(/\s+/g, " ").trim();
    return `${value} kr rabatt`;
  }

  // "Spar opptil 600 kr", "Spar 600 kr", "Opptil 600 kr"
  const sparMatch = text.match(
    /(?:(?:spar\s+)?opptil|spar)\s+(?:kr\s*)?(\d[\d\s]*(?:[,.]\d+)?)\s*kr?\b/i,
  );
  if (sparMatch) {
    const value = sparMatch[1].replace(/\s+/g, " ").trim();
    return `${value} kr`;
  }

  return "";
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
