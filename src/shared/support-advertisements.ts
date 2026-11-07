import { INSTABANK_AD, SUPPORT_LINKS } from "./provider-data.js";
import type { CashbackOffer } from "./cashback.js";
import { getFreeCards, osloDate } from "./card-benefits.js";

export const INSTABANK_AD_SHARE = 0.8;
export type SupportAdvertisement = typeof INSTABANK_AD | typeof SUPPORT_LINKS[number];

export function isInstabankAdActive(now = new Date()): boolean {
  const today = osloDate(now);
  return today >= INSTABANK_AD.validFrom && today <= INSTABANK_AD.validUntil;
}

/** The longer wording for the ad card and tooltip; the bottom line uses the short text. */
export function getSupportAdvertisementDetail(ad: SupportAdvertisement, now = new Date()): string {
  if (ad !== INSTABANK_AD) return "detail" in ad && typeof ad.detail === "string" ? ad.detail : ad.text;
  const today = osloDate(now);
  return INSTABANK_AD.incentives.find(incentive => incentive.validUntil >= today)?.detail ?? INSTABANK_AD.text;
}

export function getSupportAdvertisementText(ad: SupportAdvertisement, now = new Date()): string {
  if (ad !== INSTABANK_AD) return ad.text;
  const today = osloDate(now);
  return INSTABANK_AD.incentives.find(incentive => incentive.validUntil >= today)?.text ?? INSTABANK_AD.text;
}

// Keep the draw once per page and reuse it on every render. The remaining 20 %
// is split evenly between the existing links, without a second random draw.
export function selectSupportAdvertisement(draw: number, now = new Date()): SupportAdvertisement {
  const sample = Number.isFinite(draw) ? Math.min(1 - Number.EPSILON, Math.max(0, draw)) : 0;
  const active = isInstabankAdActive(now);
  if (active && sample < INSTABANK_AD_SHARE) return INSTABANK_AD;
  const rest = active ? (sample - INSTABANK_AD_SHARE) / (1 - INSTABANK_AD_SHARE) : sample;
  return SUPPORT_LINKS[Math.min(SUPPORT_LINKS.length - 1, Math.floor(rest * SUPPORT_LINKS.length))]!;
}

/** Reuse the dated card benefits and limits already shown in Extra cashback. */
export function getSupportAdvertisementTooltipParts(ad: SupportAdvertisement, offers: CashbackOffer[], now = new Date()): string[] {
  if (ad !== INSTABANK_AD) return [getSupportAdvertisementDetail(ad, now)];
  const card = getFreeCards(offers, now).find((card) => card.badge === "instabank");
  const details = (card?.tip ?? getSupportAdvertisementDetail(ad, now)).replace(/^Instabank kredittkort\.\n/m, "");
  return ["# Instabank kredittkort", details, INSTABANK_AD.example];
}
