import { type CashbackOffer, isCashbackOffer } from "./cashback.js";
import { formatCompactRewardLabel } from "./reward-calculation.js";
import { PROVIDER_COLORS, PROVIDER_NAMES } from "./provider-data.js";

export const INSTABANK_CARD_URL = "https://instabank.no/kredittkort";
export const INSTABANK_DISCOUNTS_URL = "https://instabank.no/kredittkort/rabatter";
export const INSTABANK_INTEREST_NOTICE = "Ingen rentefri periode – renter fra første dag ved bruk av kreditt. Termingebyr kommer i tillegg.";
export const INSTABANK_PREPAYMENT_NOTICE = "Forskuddsbetaling: Avklar med banken om positiv saldo er tillatt, hvordan renter og gebyrer beregnes, og om rabatten fortsatt gjelder. Vi har ikke bekreftet at dette gir rentefri bruk.";

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

export function getActiveCardBenefits(offers: CashbackOffer[], now = new Date()): CashbackOffer[] {
  const today = osloDate(now);
  return getCardBenefitOffers(offers).filter((offer) => {
    if (!isCashbackOffer(offer)) return false;
    const age = now.getTime() - Date.parse(offer.updatedAt);
    if (!Number.isFinite(age) || age > 14 * 86400000) return false;
    const benefit = offer.cardBenefit!;
    return benefit.kind === "ongoing" || (benefit.validFrom! <= today && benefit.validUntil! >= today);
  }).sort((a, b) => Number(b.cardBenefit!.kind === "monthly") - Number(a.cardBenefit!.kind === "monthly"));
}

/** Both clients render the same conditional benefits; no cart amount is used. */
export function createCardBenefitGroup(offers: CashbackOffer[], now = new Date()): HTMLElement | undefined {
  const active = getActiveCardBenefits(offers, now);
  if (active.length === 0) return undefined;
  const group = document.createElement("div");
  group.className = "cbn-card-benefits";
  const heading = document.createElement("span");
  heading.className = "cbn-card-benefits-heading";
  heading.textContent = "Kort med betingede rabatter";
  group.append(heading);
  for (const offer of active) {
    const benefit = offer.cardBenefit!;
    const wrap = document.createElement("div");
    wrap.className = "tooltip-wrap cbn-card-benefit";
    if (benefit.kind === "monthly") wrap.classList.add("cbn-card-benefit--current");
    const tooltip = document.createElement("div");
    tooltip.className = "tooltip cbn-card-benefit-tooltip";
    const calendarTitle = document.createElement("strong");
    calendarTitle.textContent = "Rabattkalender";
    tooltip.append(calendarTitle);
    const today = osloDate(now);
    const calendar = getCardBenefitOffers(offers).filter((entry) => entry.provider === offer.provider &&
      Number.isFinite(Date.parse(entry.updatedAt)) && now.getTime() - Date.parse(entry.updatedAt) <= 14 * 86400000)
      .sort((a, b) => (a.cardBenefit!.validFrom ?? "9999").localeCompare(b.cardBenefit!.validFrom ?? "9999"));
    for (const entry of calendar) {
      const period = entry.cardBenefit!;
      const row = document.createElement("div");
      row.className = "cbn-card-calendar-month";
      const current = period.kind === "monthly" && period.validFrom! <= today && period.validUntil! >= today;
      if (current) row.classList.add("cbn-card-calendar-month--current");
      const month = period.kind === "monthly" ? new Intl.DateTimeFormat("nb-NO", { month: "long", year: "numeric", timeZone: "Europe/Oslo" })
        .format(new Date(`${period.validFrom}T12:00:00Z`)) : "Fast grønn rabatt";
      const name = document.createElement("strong");
      name.textContent = `${month}${current ? " · denne måneden" : ""}`;
      const benefitText = document.createElement("span");
      benefitText.textContent = `${formatCompactRewardLabel(entry) ?? entry.reward} · ${period.category}`;
      row.append(name, benefitText);
      tooltip.append(row);
    }
    const terms = document.createElement("p");
    terms.className = "cbn-card-benefit-terms";
    terms.textContent = offer.terms;
    tooltip.append(terms);
    const action = document.createElement("a");
    action.className = "cbn-row bonus-chip cbn-card-benefit-action";
    action.href = offer.activationUrl;
    action.target = "_blank";
    action.rel = "noreferrer";
    const label = document.createElement("span");
    label.className = "bonus-chip-label";
    label.textContent = `${formatCompactRewardLabel(offer) ?? offer.reward} · ${benefit.category}`;
    const badge = document.createElement("span");
    badge.className = `cbn-chip badge provider-badge badge-${offer.provider} provider-${offer.provider}`;
    badge.textContent = PROVIDER_NAMES[offer.provider] ?? offer.provider;
    const colors = PROVIDER_COLORS[offer.provider];
    if (colors) { badge.style.backgroundColor = colors.bg; badge.style.color = colors.fg; }
    const status = document.createElement("span");
    status.className = "cbn-chip cbn-chip--muted cbn-card-benefit-status";
    status.textContent = benefit.kind === "monthly" ? "Gjelder i dag" : "Fast fordel";
    action.append(label, status, badge);
    wrap.append(tooltip, action);
    group.append(wrap);
  }
  const notice = document.createElement("p");
  notice.className = "cbn-card-benefits-notice";
  notice.textContent = INSTABANK_INTEREST_NOTICE;
  const calendar = document.createElement("a");
  calendar.className = "cbn-card-benefits-calendar";
  calendar.href = INSTABANK_DISCOUNTS_URL;
  calendar.target = "_blank";
  calendar.rel = "noreferrer";
  calendar.textContent = "Se rabattkalender og vilkår";
  group.append(notice, calendar);
  return group;
}
