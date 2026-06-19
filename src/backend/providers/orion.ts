// Orion/LinkTrust live offers are currently seeded from the approved affiliate
// dashboard because the provided Affiliate API key does not authenticate against
// LinkTrust's documented My Offers endpoints yet. Only public campaign metadata
// and affiliate click links are written to the index.
import { readFile } from "node:fs/promises";
import {
  type CashbackOffer,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import type { Logger } from "../logger.js";

const API_KEY_ENV_KEYS = [
  "ORION_API_KEY",
  "ORION_LINKTRUST_API_KEY",
  "LINKTRUST_ORION_API_KEY",
];
const CHARITY_SHARE_OF_COMMISSION = 0.1;

export type FetchOrionInput = {
  apiKey?: string;
  generatedAt: string;
  logger: Logger;
};

type OrionSeedOffer = {
  activationUrl: string;
  category: string;
  countries: string;
  description: string;
  domains: string[];
  merchantName: string;
  payoutValues: number[];
  reward: string;
  rewardKind: "fixed" | "percentage";
  sourceUrl: string;
};

const SEEDED_LIVE_OFFERS: OrionSeedOffer[] = [
  {
    activationUrl: "https://orsearchlink.com/click.track?CID=444864&AFID=570033",
    category: "Webshop",
    countries: "Norway",
    description:
      "The campaign pays 9 % of the order basket on the Bruse Collection, which is 80 % of the sales. The other products pay 5 % of the order basket. The campaign has three different coupon codes.",
    domains: ["babybanden.no"],
    merchantName: "Babybanden",
    payoutValues: [5, 9],
    reward: "5-9 %",
    rewardKind: "percentage",
    sourceUrl: "https://babybanden.no",
  },
  {
    activationUrl: "https://orsearchlink.com/click.track?CID=461772&AFID=570033",
    category: "Webshop",
    countries: "Norway",
    description: "Save up to 1545 kr with HelloFresh Norway.",
    domains: ["hellofresh.no"],
    merchantName: "HelloFresh",
    payoutValues: [105],
    reward: "105 kr",
    rewardKind: "fixed",
    sourceUrl: "https://www.hellofresh.no",
  },
  {
    activationUrl: "https://orsearchlink.com/click.track?CID=471390&AFID=570033",
    category: "Electricity",
    countries: "All Countries",
    description:
      "Strøm med spotpris uten påslag. Du kan også velge fastpris hvis du ønsker en forutsigbar strømregning.",
    domains: ["kildenkraft.no"],
    merchantName: "Kilden Kraft",
    payoutValues: [325],
    reward: "325 kr",
    rewardKind: "fixed",
    sourceUrl: "https://kildenkraft.no",
  },
  {
    activationUrl: "https://orsearchlink.com/click.track?CID=441749&AFID=570033",
    category: "Webshop",
    countries: "Norway",
    description: "The audio specialist. Do a great deal to a reduced price.",
    domains: ["surround.no"],
    merchantName: "Surround.no",
    payoutValues: [5],
    reward: "5 %",
    rewardKind: "percentage",
    sourceUrl: "https://www.surround.no",
  },
  {
    activationUrl: "https://orsearchlink.com/click.track?CID=451581&AFID=570033",
    category: "Financial Services",
    countries: "All Countries",
    description:
      "Get an overview of your consumer debt, credit cards, credit limits, consumer loans and their costs, and find out if you can save by refinancing.",
    domains: ["unoscore.no"],
    merchantName: "Uno Score - Gjeldsoversikt",
    payoutValues: [105],
    reward: "105 kr",
    rewardKind: "fixed",
    sourceUrl: "https://www.unoscore.no",
  },
  {
    activationUrl: "https://orsearchlink.com/click.track?CID=451327&AFID=570033",
    category: "Financial Services",
    countries: "Norway",
    description:
      "Check your credit score and balance sheet for the last 3 years with Vipps login.",
    domains: ["unoscore.no"],
    merchantName: "Uno Score - Kredittsjekk",
    payoutValues: [55],
    reward: "55 kr",
    rewardKind: "fixed",
    sourceUrl: "https://www.unoscore.no",
  },
];

export async function fetchOrion(
  input: FetchOrionInput,
): Promise<CashbackOffer[]> {
  const apiKey = input.apiKey ?? await readFirstConfiguredValue(API_KEY_ENV_KEYS);
  if (!apiKey) {
    input.logger.warn(`Orion: ${API_KEY_ENV_KEYS[0]} is missing, skipping`);
    return [];
  }

  input.logger.info("Orion: loading approved live offers...");
  const offers = SEEDED_LIVE_OFFERS.map((offer) => {
    return {
      provider: "cbn",
      merchantName: offer.merchantName,
      domains: uniqueStrings(offer.domains),
      reward: offer.reward,
      sourceUrl: offer.sourceUrl,
      activationUrl: offer.activationUrl,
      terms: buildTerms(offer),
      updatedAt: input.generatedAt,
    } satisfies CashbackOffer;
  });

  input.logger.info(`Orion: produced ${offers.length} support offers`);
  return uniqueOffers(offers);
}

function buildTerms(offer: OrionSeedOffer): string {
  const lines = [
    "Annonselenke via Orion.",
    "Dette er ikke cashback utbetalt til deg.",
    "Tallet viser provisjonen CashbackNorge kan få.",
    "Det koster deg ingenting ekstra å bruke lenken.",
    `${formatPercent(CHARITY_SHARE_OF_COMMISSION * 100)} av provisjonen settes av til veldedighet.`,
    buildCharityExampleLine(offer),
    "Resten går til drift og videreutvikling av CashbackNorge.",
    "Veldedighetstotalen oppdateres på cashbacknorge.no.",
    `Kategori hos Orion: ${offer.category}. Land: ${offer.countries}.`,
  ];

  if (offer.description) {
    lines.push(truncateText(offer.description, 220));
  }

  return uniquePreserveOrder(lines).join("\n");
}

function buildCharityExampleLine(offer: OrionSeedOffer): string {
  if (offer.rewardKind === "percentage") {
    return `Denne butikken: ${formatPercentRange(offer.payoutValues)} provisjon × ${formatPercent(CHARITY_SHARE_OF_COMMISSION * 100)} = ca. ${formatPercentRange(scaleValues(offer.payoutValues, CHARITY_SHARE_OF_COMMISSION))} av kjøpet til veldedighet.`;
  }

  return `Denne butikken: ${formatNumberRange(offer.payoutValues)} kr provisjon × ${formatPercent(CHARITY_SHARE_OF_COMMISSION * 100)} = ca. ${formatNumberRange(scaleValues(offer.payoutValues, CHARITY_SHARE_OF_COMMISSION))} kr til veldedighet.`;
}

function scaleValues(values: number[], scale: number): number[] {
  return values.map((value) => value * scale);
}

function formatPercentRange(values: number[]): string {
  return `${formatNumberRange(values)} %`;
}

function formatNumberRange(values: number[]): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max
    ? formatRewardNumber(max)
    : `${formatRewardNumber(min)}-${formatRewardNumber(max)}`;
}

function formatPercent(value: number): string {
  return `${formatRewardNumber(value)} %`;
}

function formatRewardNumber(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString("nb-NO").replace(/[\u00a0\u202f]/g, " ")
    : value.toLocaleString("nb-NO", { maximumFractionDigits: 2 }).replace(/[\u00a0\u202f]/g, " ");
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trim()}...`;
}

function uniquePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }

  return unique;
}

async function readFirstConfiguredValue(keys: string[]): Promise<string | undefined> {
  for (const key of keys) {
    const envValue = process.env[key]?.trim();
    if (envValue) return stripEnvQuotes(envValue);
  }

  try {
    const envFile = await readFile(".env", "utf8");
    for (const key of keys) {
      const line = envFile
        .split(/\r?\n/)
        .find((candidate) => candidate.trimStart().startsWith(`${key}=`));
      const value = line?.split("=").slice(1).join("=").trim();
      if (value) return stripEnvQuotes(value);
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function stripEnvQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}
