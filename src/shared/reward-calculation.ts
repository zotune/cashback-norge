import {
  convertToNok,
  normalizeCurrencyForExchange,
  type NokBaseRates,
} from "./exchange-rates.js";

export const EB_PER_TRUMF_KR = 13.5;

type RewardOffer = {
  provider: string;
  reward: string;
  rewardSortValueNok?: number;
};

export function formatRewardLabel(reward: string, provider: string): string {
  const trimmedReward = reward.trim();

  if (trimmedReward.length === 0 || isGenericMembershipReward(trimmedReward)) return "?";

  if (provider === "sas") {
    const converted = convertSasToPercent(trimmedReward);
    return converted !== "" ? converted : trimmedReward;
  }

  if (provider === "trumf") {
    const converted = convertTrumfToEb(trimmedReward);
    return converted !== "" ? `${trimmedReward} (${converted})` : trimmedReward;
  }

  return trimmedReward;
}

function isGenericMembershipReward(reward: string): boolean {
  return /^(?:medlemsfordel|medlemstilbud|medlemspris)$/i.test(reward.trim());
}

export function formatCompactRewardLabel(offer: RewardOffer): string | undefined {
  const label = formatRewardLabel(offer.reward, offer.provider);
  const fixedReward = readFixedRewardMax(label);
  const rewardSortValueNok = readRewardSortValueNok(offer);

  if (fixedReward !== undefined && rewardSortValueNok !== undefined && !isNokCurrency(fixedReward.currency)) {
    return formatApproxKr(rewardSortValueNok);
  }

  if (/\d+(?:[,.]\d+)?\s*kr\s*\/\s*/i.test(label) && label.includes("+")) {
    return label.replace(/\s+/g, " ");
  }

  const percentMatch = label.match(/(~)?(\d+(?:[,.]\d+)?\s*[-–]\s*\d+(?:[,.]\d+)?\s*%|\d+(?:[,.]\d+)?\s*%)/i);
  if (percentMatch !== null) {
    const prefix = percentMatch[1] ?? "";
    return (prefix + percentMatch[2]).replace(/\s+/g, " ");
  }

  const totalSumMatch = label.match(/\d[\d\s]*(?:[,.]\d+)?(?:\s*[-–]\s*\d[\d\s]*(?:[,.]\d+)?)?\s*kr\s+totalsum/i);
  if (totalSumMatch !== null) {
    return totalSumMatch[0].replace(/\s+/g, " ");
  }

  const krRangeMatch = label.match(/\d[\d\s]*(?:[,.]\d+)?\s*[-–]\s*\d[\d\s]*(?:[,.]\d+)?\s*kr(?:\/time|\s+per\s+time)?/i);
  if (krRangeMatch !== null) {
    return krRangeMatch[0].replace(/\s+/g, " ");
  }

  const krMatch = label.match(/\d[\d\s]*(?:[,.]\d+)?\s*kr(?:\/time|\s+per\s+time)?/i);
  if (krMatch !== null) {
    return krMatch[0].replace(/\s+/g, " ");
  }

  if (/gratis\s+frakt/i.test(label)) return "Gratis frakt";
  if (/gratis/i.test(label)) return "Gratis";

  return label.length <= 14 ? label : undefined;
}

export function calculateCashback(offer: RewardOffer, amount: number): string {
  if (offer.provider === "cbn") {
    const pctMatch = offer.reward.match(/(\d+(?:[,.]\d+)?)\s*%/);
    if (pctMatch !== null) {
      const pct = Number.parseFloat(pctMatch[1]?.replace(",", ".") ?? "0");
      return `${formatKr(amount * pct / 100)} kr støtte`;
    }

    const fixedReward = readFixedRewardMax(offer.reward);
    if (fixedReward !== undefined) {
      const rewardSortValueNok = readRewardSortValueNok(offer);
      if (rewardSortValueNok !== undefined && !isNokCurrency(fixedReward.currency)) {
        return `${formatApproxKr(rewardSortValueNok)} støtte`;
      }

      return `${formatFixedReward(fixedReward.amount, fixedReward.currency)} støtte`;
    }

    return "";
  }

  const reward = offer.reward.trim();
  const rangeMatch = reward.match(/^([\d,.]+)%?-([\d,.]+)\s*%$/);
  if (rangeMatch !== null) {
    const minPct = Number.parseFloat((rangeMatch[1] ?? "0").replace(",", "."));
    const maxPct = Number.parseFloat((rangeMatch[2] ?? "0").replace(",", "."));
    const minKr = amount * minPct / 100;
    const maxKr = amount * maxPct / 100;
    const label = minKr === maxKr ? `${formatKr(minKr)} kr` : `${formatKr(minKr)}-${formatKr(maxKr)} kr`;
    return addEbSuffix(label, minPct, maxPct, amount, offer.provider);
  }

  const pctMatch = reward.match(/^([\d,.]+)\s*%$/);
  if (pctMatch !== null) {
    const pct = Number.parseFloat((pctMatch[1] ?? "0").replace(",", "."));
    const kr = amount * pct / 100;
    return addEbSuffix(`${formatKr(kr)} kr`, pct, pct, amount, offer.provider);
  }

  const sasRateMatch = reward.match(/^([\d\s]+)\s*poeng\s+per\s+100\s*kr$/i);
  if (sasRateMatch !== null) {
    const points = Number.parseInt((sasRateMatch[1] ?? "0").replace(/\s/g, ""), 10);
    const eb = Math.round(amount * points / 100);
    const kr = amount * points / 100 / EB_PER_TRUMF_KR;
    return `~${formatKr(kr)} kr (~${eb} EB)`;
  }

  const sasFixedMatch = reward.match(/^([\d\s]+)\s*poeng$/i);
  if (sasFixedMatch !== null) {
    const points = Number.parseInt((sasFixedMatch[1] ?? "0").replace(/\s/g, ""), 10);
    const kr = points / EB_PER_TRUMF_KR;
    return `~${formatKr(kr)} kr (~${points} EB)`;
  }

  const klarnaMatch = reward.match(/^([\d.]+)%$/);
  if (klarnaMatch !== null) {
    const pct = Number.parseFloat(klarnaMatch[1] ?? "0");
    const kr = amount * pct / 100;
    return `${formatKr(kr)} kr`;
  }

  return "";
}

export function calculateCashbackMaxKr(offer: RewardOffer, amount: number): number {
  if (offer.provider === "cbn") return 0;

  const reward = offer.reward.trim();
  const rangeMatch = reward.match(/^([\d,.]+)%?-([\d,.]+)\s*%$/);
  if (rangeMatch !== null) {
    const maxPct = Number.parseFloat((rangeMatch[2] ?? "0").replace(",", "."));
    return amount * maxPct / 100;
  }

  const pctMatch = reward.match(/^([\d,.]+)\s*%$/);
  if (pctMatch !== null) {
    return amount * Number.parseFloat((pctMatch[1] ?? "0").replace(",", ".")) / 100;
  }

  const klarnaMatch = reward.match(/^([\d.]+)%$/);
  if (klarnaMatch !== null) {
    return amount * Number.parseFloat(klarnaMatch[1] ?? "0") / 100;
  }

  const sasRateMatch = reward.match(/^([\d\s]+)\s*poeng\s+per\s+100\s*kr$/i);
  if (sasRateMatch !== null) {
    const points = Number.parseInt((sasRateMatch[1] ?? "0").replace(/\s/g, ""), 10);
    return amount * points / 100 / EB_PER_TRUMF_KR;
  }

  return 0;
}

export function getMaxRewardPercent(offer: RewardOffer): number {
  const reward = offer.reward.trim();
  const rewardSortValueNok = readRewardSortValueNok(offer);
  const rangeMatch = reward.match(/^([\d,.]+)%?-([\d,.]+)\s*%$/);
  if (rangeMatch !== null) {
    return Number.parseFloat((rangeMatch[2] ?? "0").replace(",", "."));
  }

  const pctMatch = reward.match(/^([\d,.]+)\s*%$/);
  if (pctMatch !== null) {
    return Number.parseFloat((pctMatch[1] ?? "0").replace(",", "."));
  }

  const sasRateMatch = reward.match(/^([\d\s]+)\s*poeng\s+per\s+100\s*kr$/i);
  if (sasRateMatch !== null) {
    const points = Number.parseInt((sasRateMatch[1] ?? "0").replace(/\s/g, ""), 10);
    return points / EB_PER_TRUMF_KR;
  }

  const krRangeMatch = reward.match(/^([\d.,]+)-([\d.,]+)\s*kr/i);
  if (krRangeMatch !== null) {
    return Number.parseFloat((krRangeMatch[2] ?? "0").replace(",", ".")) / 1000;
  }

  const krSingleMatch = reward.match(/([\d.,]+)\s*kr/i);
  if (krSingleMatch !== null) {
    return Number.parseFloat((krSingleMatch[1] ?? "0").replace(",", ".")) / 1000;
  }

  const fixedReward = readFixedRewardMax(reward);
  if (fixedReward !== undefined) {
    return (rewardSortValueNok ?? fixedReward.amount) / 1000;
  }

  return 0;
}

export function addFixedRewardSortValues<T extends RewardOffer>(
  offers: T[],
  rates: NokBaseRates,
): T[] {
  return offers.map((offer) => {
    const fixedReward = readFixedRewardMax(offer.reward);
    if (fixedReward === undefined || isNokCurrency(fixedReward.currency)) return offer;

    const nokValue = convertToNok(fixedReward.amount, fixedReward.currency, rates);
    if (nokValue === undefined) return offer;

    return {
      ...offer,
      rewardSortValueNok: roundSortValue(nokValue),
    };
  });
}

function readFixedRewardMax(reward: string): { amount: number; currency: string } | undefined {
  const currencyPattern = "(?:kr|NOK|SEK|DKK|EUR|USD|GBP)";
  const rangePattern = new RegExp(`\\d[\\d\\s]*(?:[,.]\\d+)?\\s*[-–]\\s*(\\d[\\d\\s]*(?:[,.]\\d+)?)\\s*(${currencyPattern})\\b`, "i");
  const rangeMatch = reward.match(rangePattern);
  if (rangeMatch !== null) {
    const amount = parseRewardNumber(rangeMatch[1] ?? "");
    const currency = normalizeFixedCurrency(rangeMatch[2] ?? "");
    if (amount > 0 && currency !== "") return { amount, currency };
  }

  const singlePattern = new RegExp(`(\\d[\\d\\s]*(?:[,.]\\d+)?)\\s*(${currencyPattern})\\b`, "i");
  const singleMatch = reward.match(singlePattern);
  if (singleMatch !== null) {
    const amount = parseRewardNumber(singleMatch[1] ?? "");
    const currency = normalizeFixedCurrency(singleMatch[2] ?? "");
    if (amount > 0 && currency !== "") return { amount, currency };
  }

  return undefined;
}

function parseRewardNumber(value: string): number {
  const parsed = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeFixedCurrency(value: string): string {
  const upper = value.trim().toUpperCase();
  return upper === "KR" ? "kr" : upper;
}

function formatFixedReward(amount: number, currency: string): string {
  return `${formatKr(amount)} ${currency}`;
}

function formatApproxKr(amount: number): string {
  return `~${formatKr(Math.round(amount))} kr`;
}

function readRewardSortValueNok(offer: RewardOffer): number | undefined {
  return typeof offer.rewardSortValueNok === "number" && Number.isFinite(offer.rewardSortValueNok)
    ? offer.rewardSortValueNok
    : undefined;
}

function isNokCurrency(currency: string): boolean {
  return normalizeCurrencyForExchange(currency) === "NOK";
}

function roundSortValue(value: number): number {
  return Number(value.toFixed(4));
}

export function formatBreakdownWithAmounts(terms: string, amount: number): string {
  return terms
    .split("\n")
    .map((line) => {
      const match = line.match(/^([\d,.]+)\s*%/);
      if (match !== null) {
        const pct = Number.parseFloat((match[1] ?? "0").replace(",", "."));
        const kr = amount * pct / 100;
        return `${line} (${formatKr(kr)} kr)`;
      }
      return line;
    })
    .join("\n");
}

export function formatKr(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toFixed(2).replace(".", ",").replace(/,00$/, "");
}

function addEbSuffix(label: string, minPct: number, maxPct: number, amount: number, provider: string): string {
  if (provider === "trumf") {
    const minEb = Math.round(amount * minPct / 100 * EB_PER_TRUMF_KR);
    const maxEb = Math.round(amount * maxPct / 100 * EB_PER_TRUMF_KR);
    const ebStr = minEb === maxEb ? `~${minEb} EB` : `~${minEb}-${maxEb} EB`;
    return `${label} (${ebStr})`;
  }
  if (provider === "sas") {
    const minEb = Math.round(amount * minPct / 100 * EB_PER_TRUMF_KR);
    const maxEb = Math.round(amount * maxPct / 100 * EB_PER_TRUMF_KR);
    const ebStr = minEb === maxEb ? `~${minEb} EB` : `~${minEb}-${maxEb} EB`;
    return `~${label} (${ebStr})`;
  }
  return label;
}

function convertSasToPercent(reward: string): string {
  const fixedMatch = reward.match(/^([\d\s]+)\s*poeng$/i);
  if (fixedMatch !== null) {
    const points = Number.parseInt((fixedMatch[1] ?? "0").replace(/\s/g, ""), 10);
    const kr = Math.round(points / EB_PER_TRUMF_KR);
    return `~${kr} kr (~${points.toLocaleString("nb-NO")} EB)`;
  }

  const rateMatch = reward.match(/^([\d\s]+)\s*poeng\s+per\s+100\s*kr$/i);
  if (rateMatch !== null) {
    const points = Number.parseInt((rateMatch[1] ?? "0").replace(/\s/g, ""), 10);
    const pct = points / EB_PER_TRUMF_KR;
    return `~${formatNo(pct)} % (~${points} EB/100kr)`;
  }

  return "";
}

function convertTrumfToEb(reward: string): string {
  const rangeMatch = reward.match(/^([\d,.]+)%?-([\d,.]+)\s*%$/);
  if (rangeMatch !== null) {
    const minPct = Number.parseFloat((rangeMatch[1] ?? "0").replace(",", "."));
    const maxPct = Number.parseFloat((rangeMatch[2] ?? "0").replace(",", "."));
    const minEb = Math.round(minPct * EB_PER_TRUMF_KR);
    const maxEb = Math.round(maxPct * EB_PER_TRUMF_KR);
    return `~${minEb}-${maxEb} EB/100kr`;
  }

  const pctMatch = reward.match(/^([\d,.]+)\s*%$/);
  if (pctMatch !== null) {
    const pct = Number.parseFloat((pctMatch[1] ?? "0").replace(",", "."));
    const ebPer100 = Math.round(pct * EB_PER_TRUMF_KR);
    return `~${ebPer100} EB/100kr`;
  }

  const krMatch = reward.match(/^([\d\s]+)\s*kr$/);
  if (krMatch !== null) {
    const kr = Number.parseInt((krMatch[1] ?? "0").replace(/\s/g, ""), 10);
    const eb = Math.round(kr * EB_PER_TRUMF_KR);
    return `~${eb.toLocaleString("nb-NO")} EB`;
  }

  return "";
}

function formatNo(value: number): string {
  return value % 1 === 0 ? value.toString() : value.toFixed(1).replace(".", ",");
}
