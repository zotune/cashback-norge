import { type CashbackOffer, isCashbackOffer } from "./cashback.js";
import { formatCompactRewardLabel, getMaxRewardPercent } from "./reward-calculation.js";
import { type BonusCard, FREE_CARDS, PROVIDER_NAMES, PROVIDER_TIPS } from "./provider-data.js";

export const INSTABANK_CARD_URL = "https://instabank.no/kredittkort";
export const INSTABANK_DISCOUNTS_URL = "https://instabank.no/kredittkort/rabatter";
export const INSTABANK_INTEREST_NOTICE = "Ingen rentefri periode – renter fra første dag ved bruk av kreditt. Termingebyr kommer i tillegg.";
export const INSTABANK_PREPAYMENT_NOTICE = "Forskuddsbetaling: Avklar med banken om positiv saldo er tillatt, hvordan renter og gebyrer beregnes, og om rabatten fortsatt gjelder. Vi har ikke bekreftet at dette gir rentefri bruk.";

/** Same limit as the crawl's provider fallback. */
const MAX_BENEFIT_AGE_MS = 14 * 86400000;
/** The tooltip lists this month and the next ones, not the whole year. */
const LISTED_MONTHS = 3;

export function osloDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return ["year", "month", "day"].map((kind) => parts.find((part) => part.type === kind)!.value).join("-");
}

export function watchCardBenefitDate(onChange: () => void): () => void {
  let day = osloDate(new Date());
  const timer = setInterval(() => {
    const nextDay = osloDate(new Date());
    if (nextDay !== day) { day = nextDay; onChange(); }
  }, 60000);
  return () => clearInterval(timer);
}

export function getCardBenefitOffers(offers: CashbackOffer[]): CashbackOffer[] {
  return offers.filter((offer) => offer.cardBenefit !== undefined);
}

function isRecentCardBenefit(offer: CashbackOffer, now: Date): boolean {
  const age = now.getTime() - Date.parse(offer.updatedAt);
  return isCashbackOffer(offer) && Number.isFinite(age) && age <= MAX_BENEFIT_AGE_MS;
}

export function getActiveCardBenefits(offers: CashbackOffer[], now = new Date()): CashbackOffer[] {
  const today = osloDate(now);
  return getCardBenefitOffers(offers).filter((offer) => {
    if (!isRecentCardBenefit(offer, now)) return false;
    const benefit = offer.cardBenefit!;
    return benefit.kind === "ongoing" || (benefit.validFrom! <= today && benefit.validUntil! >= today);
  }).sort((a, b) => Number(b.cardBenefit!.kind === "monthly") - Number(a.cardBenefit!.kind === "monthly"));
}

/**
 * The free cards plus today's card benefit as one more card, highest rate
 * first. Clients render it like the other free cards, with the shared bonus
 * chip and tooltip.
 */
export function getFreeCards(offers: CashbackOffer[], now = new Date()): BonusCard[] {
  const [benefit] = getActiveCardBenefits(offers, now);
  if (benefit === undefined) return FREE_CARDS;
  const card: BonusCard = {
    pct: getMaxRewardPercent(benefit) / 100,
    label: PROVIDER_NAMES[benefit.provider] ?? benefit.provider,
    badge: benefit.provider,
    url: benefit.activationUrl,
    approx: false,
    conditional: true,
    tip: describeCardBenefits(benefit, offers, now),
  };
  return [...FREE_CARDS, card].sort((a, b) => b.pct - a.pct);
}

function describeCardBenefits(current: CashbackOffer, offers: CashbackOffer[], now: Date): string {
  const today = osloDate(now);
  const benefits = getCardBenefitOffers(offers)
    .filter((offer) => offer.provider === current.provider && isRecentCardBenefit(offer, now));
  const months = benefits
    .filter((offer) => offer.cardBenefit!.kind === "monthly" && offer.cardBenefit!.validUntil! >= today)
    .sort((a, b) => a.cardBenefit!.validFrom!.localeCompare(b.cardBenefit!.validFrom!))
    .slice(0, LISTED_MONTHS);
  const ongoing = benefits.filter((offer) => offer.cardBenefit!.kind === "ongoing");
  const describe = (name: string, offer: CashbackOffer) =>
    `${name}: ${formatCompactRewardLabel(offer) ?? offer.reward} på ${offer.cardBenefit!.category}`;
  const caps = current.terms.split("\n")
    .filter((line) => /^Maks rabatt pr (?:måned|år)/i.test(line))
    .map((line) => line.replace(/\s*\(.*\)$/, ""));
  return [
    ...months.map((offer) => describe(monthName(offer.cardBenefit!.validFrom!), offer)),
    ...ongoing.map((offer) => describe("Alltid", offer)),
    caps.length > 0 ? `${caps.join(". ")}.` : "",
    PROVIDER_TIPS[current.provider] ?? "",
  ].filter((line) => line !== "").join("\n");
}

function monthName(date: string): string {
  const name = new Intl.DateTimeFormat("nb-NO", { month: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  return name.charAt(0).toUpperCase() + name.slice(1);
}
