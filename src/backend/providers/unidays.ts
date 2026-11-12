// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import {
  type CashbackOffer,
  type RewardCalculationRules,
  normalizeDomainInput,
  uniqueOffers,
} from "../../shared/cashback.js";
import {
  extractExplicitTotalPriceReward,
  extractKrReward,
  extractPercentageValues,
  extractUpToPercentageReward,
  formatPercentageReward,
} from "../../shared/reward.js";
import type { Logger } from "../logger.js";

const PARTNERS_API = "https://api.myunidays.com/partners";
const CONTENT_API = "https://content.myunidays.com/NO/partners";

/** Maps UNiDAYS partner subdomain/slug to actual merchant domain(s) */
const SLUG_TO_DOMAINS: Record<string, string[]> = {
  aimn: ["aimn.com"],
  acer: ["acer.com"],
  airalo: ["airalo.com"],
  applemusic: ["music.apple.com"],
  bestseller: ["bestseller.com"],
  disney: ["disneyplus.com"],
  dji: ["dji.com"],
  edhardy: ["edhardy.com"],
  emirates: ["emirates.com"],
  evernote: ["evernote.com"],
  expressvpn: ["expressvpn.com"],
  farfetch: ["farfetch.com"],
  flixbus: ["flixbus.no", "flixbus.com"],
  glossybox: ["glossybox.no", "glossybox.com"],
  gymking: ["gymking.com"],
  hellofresh: ["hellofresh.no", "hellofresh.com"],
  hismile: ["hismileteeth.com"],
  hotels: ["hotels.com"],
  ipsosisay: ["ipsosisay.com"],
  lookfantastic: ["lookfantastic.com"],
  mangooutlet: ["mangooutlet.com"],
  missoma: ["missoma.com"],
  mixcloud: ["mixcloud.com"],
  nba: ["nba.com"],
  netaporter: ["net-a-porter.com"],
  nordvpn: ["nordvpn.com"],
  omio: ["omio.com"],
  perlego: ["perlego.com"],
  qatarairways: ["qatarairways.com"],
  reebok: ["reebok.com"],
  shopbop: ["shopbop.com"],
  skullcandy: ["skullcandy.com"],
  smartbuyglasses: ["smartbuyglasses.com"],
  temu: ["temu.com"],
  weekday: ["weekday.com"],
  zalando: ["zalando.no", "zalando.com"],
};

type ContentPartner = {
  id: string;
  displayName: string;
  defaultPerkSubdomain: string;
  isEnabled: boolean;
};

type Benefit = {
  id: string;
  name: string;
  type: string;
  url: string;
};

type ApiPartner = {
  id: string;
  name: string;
  description: string;
  benefits: Benefit[];
};

export type FetchUnidaysInput = {
  generatedAt: string;
  logger: Logger;
};

export async function fetchUnidays(
  input: FetchUnidaysInput,
): Promise<CashbackOffer[]> {
  input.logger.info("UNiDAYS: fetching partners...");

  const [contentRes, apiRes] = await Promise.all([
    requestUnidays(CONTENT_API, {}),
    requestUnidays(PARTNERS_API, { "UD-Region": "NO" }),
  ]);

  if (!contentRes.ok) {
    throw new Error(`UNiDAYS: GET ${CONTENT_API} returned HTTP ${contentRes.status}`);
  }
  if (!apiRes.ok) {
    throw new Error(`UNiDAYS: GET ${PARTNERS_API} returned HTTP ${apiRes.status}`);
  }

  const contentPartners = (await contentRes.json()) as ContentPartner[];
  const { partners: apiPartners } = (await apiRes.json()) as {
    partners: ApiPartner[];
  };

  // Build ID → slug mapping from content API
  const idToSlug = new Map<string, string>();
  for (const cp of contentPartners) {
    if (cp.isEnabled) {
      idToSlug.set(cp.id, cp.defaultPerkSubdomain);
    }
  }

  input.logger.info(
    `UNiDAYS: ${contentPartners.filter((p) => p.isEnabled).length} enabled partners, ${apiPartners.length} in API`,
  );

  const offers: CashbackOffer[] = [];

  for (const partner of apiPartners) {
    if (!partner.benefits.length) continue;

    const slug = idToSlug.get(partner.id);
    if (!slug) {
      input.logger.warn(
        `UNiDAYS: no slug for partner "${partner.name}" (${partner.id})`,
      );
      continue;
    }

    const rawDomains = SLUG_TO_DOMAINS[slug];
    if (!rawDomains) {
      input.logger.warn(
        `UNiDAYS: no domain map for slug "${slug}" (${partner.name})`,
      );
      continue;
    }

    const domains = rawDomains.flatMap((d) => normalizeDomainInput(d));

    // The index keeps one offer per provider and merchant, so all of a
    // partner's perks form one offer: the reward spans them and the tooltip
    // lists each perk instead of keeping only the highest one.
    const benefits = partner.benefits.map((benefit) => ({ benefit, reward: readBenefitReward(benefit.name.trim()) }));
    const maxPercentage = (entry: { reward: BenefitReward }) => Math.max(0, ...entry.reward.percentages);
    const primary = [...benefits].sort((a, b) => maxPercentage(b) - maxPercentage(a))
      .find((entry) => entry.reward.reward !== "?") ?? benefits[0]!;
    const reward = combineBenefitRewards(benefits.map((entry) => entry.reward));
    const rewardCalculation = benefits.length === 1 ? primary.reward.rewardCalculation : undefined;
    const monthlyPrice = reward.match(/^(\d+) kr\/mnd$/);

    offers.push({
      provider: "unidays",
      merchantName: partner.name,
      domains,
      reward,
      ...(rewardCalculation ? { rewardCalculation } : {}),
      // A subscription price is the student's cost, not a discount.
      ...(monthlyPrice ? { promotion: { label: reward, priceNok: Number(monthlyPrice[1]) } } : {}),
      sourceUrl: primary.benefit.url,
      activationUrl: primary.benefit.url,
      terms: buildTerms(benefits.map((entry) => entry.benefit.name.trim())),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`UNiDAYS: ${offers.length} offers`);

  return uniqueOffers(offers);
}

async function requestUnidays(url: string, headers: Record<string, string>): Promise<Response> {
  try {
    return await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    const cause = error instanceof Error ? `${error.message}${error.cause instanceof Error ? ` (${error.cause.message})` : ""}` : String(error);
    throw new Error(`UNiDAYS: GET ${url} failed: ${cause}`);
  }
}

const DEFAULT_TERMS = "UNiDAYS studentrabatt. Krever gyldig UNiDAYS-konto.";

type BenefitReward = { reward: string; percentages: number[]; upTo: boolean; rewardCalculation?: RewardCalculationRules };

// UNiDAYS perk names are the public offer text: "15% rabatt", "Opptil 10 %
// rabatt på flyreiser", "Opp til 80% rabatt + 5% ekstra" (the outlet's own
// sale plus 5 % for students), "Kun 65 kr/mnd og gratis Apple TV" (a student
// price) and "30% rabatt for bestillinger NOK 429+" (a minimum order).
export function readBenefitReward(name: string): BenefitReward {
  const extra = name.match(/\+\s*(\d{1,3}(?:[,.]\d+)?)\s*%\s*ekstra\b/i);
  const percentText = extra ? `${extra[1]} %` : name;
  const percentages = extractPercentageValues(percentText);
  if (percentages.length > 0) {
    const upTo = extractUpToPercentageReward(percentText).startsWith("opptil ");
    const minimum = name.match(/\b(?:bestillinger|kjøp|ordre)\s+(?:over\s+|på\s+|fra\s+)?(?:NOK|kr\.?)\s*(\d[\d\s]*)\s*\+/i) ??
      name.match(/\b(?:bestillinger|kjøp|ordre)\s+(?:over\s+|på\s+|fra\s+)?(\d[\d\s]*)\s*(?:NOK|kr)\s*\+/i);
    const minimumPurchaseNok = minimum ? Number.parseInt((minimum[1] ?? "").replace(/\s/g, ""), 10) : undefined;
    return {
      reward: `${upTo ? "opptil " : ""}${formatPercentageReward(percentages)}`,
      percentages, upTo,
      ...(minimumPurchaseNok !== undefined && minimumPurchaseNok > 0 ? { rewardCalculation: { minimumPurchaseNok } } : {}),
    };
  }
  const monthly = extractExplicitTotalPriceReward(name).match(/^(\d+) kr totalsum$/);
  if (monthly && /\/\s*(?:mnd|måned)\b|\bper\s+(?:mnd|måned)\b|\bi\s+måneden\b/i.test(name)) {
    return { reward: `${monthly[1]} kr/mnd`, percentages: [], upTo: false };
  }
  const reward = extractKrReward(name, { totalsum: false }) || extractExplicitTotalPriceReward(name) || "?";
  return { reward, percentages: [], upTo: false };
}

function combineBenefitRewards(rewards: BenefitReward[]): string {
  const percentages = rewards.flatMap((entry) => entry.percentages);
  if (percentages.length > 0) {
    // Any perk stated as a maximum keeps the range a maximum.
    return `${rewards.some((entry) => entry.upTo) ? "opptil " : ""}${formatPercentageReward(percentages)}`;
  }
  return rewards.find((entry) => entry.reward !== "?")?.reward ?? "?";
}

// The perk names are the public offer text ("Kun 65 kr/mnd og gratis Apple
// TV"); keep every perk in the tooltip so units, extras and limits are kept.
function buildTerms(benefitNames: string[]): string {
  const names = benefitNames.filter(Boolean);
  return names.length > 0 ? `${names.join("\n")}\n${DEFAULT_TERMS}` : DEFAULT_TERMS;
}
