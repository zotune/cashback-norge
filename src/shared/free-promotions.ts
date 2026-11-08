import { stripHtml, type OfferPromotion } from "./cashback.js";
import { readPriceAmount } from "./price.js";
import { formatKr } from "./reward-calculation.js";

export function cleanPromotionText(value: unknown): string {
  return typeof value === "string" ? stripHtml(value).replace(/\s+/g, " ").trim() : "";
}

/** Read the advertised benefit before incidental values and renewal prices.
 * A gift requiring postage, a purchase or earned points is never a zero price.
 * Unknown charges stay unknown; the original conditions accompany every row.
 */
export function readFreePromotion(title: string, description: string): OfferPromotion | undefined {
  const benefit = cleanPromotionText(title);
  const text = `${benefit} ${cleanPromotionText(description)}`;
  if (/\b(?:konkurranse|vinn\b|bonuspoeng|samle poeng|\d+\s*poeng|avslag|rabattkode)\b/i.test(benefit) ||
    /\d+\s*(?:kr|kroner)\s+gratis\b/i.test(benefit)) return undefined;
  if (!/gratis|prøv|prøve|velkomstgave|bursdagsgave|porto/i.test(benefit)) return undefined;

  const postage = text.match(/(?:porto|frakt)\s*(?:på|er|:)?\s*(\d+(?:[,.]\d+)?)\s*(?:kr|kroner)\b/i) ??
    text.match(/(\d+(?:[,.]\d+)?)\s*(?:kr|kroner)\s*(?:i\s+)?(?:porto|frakt)\b/i);
  const advertisedPrice = benefit.match(/\bfor\s+(\d+(?:[,.]\d+)?)\s*(?:kr|kroner)\b/i);
  const price = readPriceAmount((postage ?? advertisedPrice)?.[1]);
  if (price !== undefined && price > 0) {
    return { label: `${formatKr(price)} kr${postage ? " i porto" : " prøvepris"}`, priceNok: price };
  }
  const chargeText = text
    .replace(/\b(?:gratis|fri|ingen|uten)\s+(?:(?:kjøpsplikt|kjøpeplikt)\s+(?:eller|og)\s+)?(?:porto|frakt)\b/gi, "")
    .replace(/\b0\s*kr\s*(?:i\s+)?(?:porto|frakt)\b|\b(?:porto|frakt)\s*(?:er|:)?\s*0\s*kr\b/gi, "");
  const unknownPostage = /\b(?:porto|frakt)(?:kostnader?)?\b/i.test(chargeText);
  const purchaseRequired = /\b(?:ved kjøp|når du (?:kjøper|handler)|kjøp av|kjøpsplikt|kjøpeplikt|kjøpsforpliktelse|samle\w* poeng)\b/i.test(text.replace(/(?:ingen|uten)\s+(?:kjøpsplikt|kjøpeplikt|kjøpsforpliktelser?)/gi, ""));
  if (unknownPostage || purchaseRequired || /\bnesten gratis\b|øvrige vilkår ukjent/i.test(text)) {
    return { label: unknownPostage ? "Gave + porto" : "Betinget tilbud" };
  }
  if (!/\bgratis\b/i.test(benefit)) return { label: "Prøvetilbud" };
  // Only the advertised free period, never a later paid subscription period.
  const duration = benefit.match(/\b(?:i\s+)?(\d+|én|en|ett|to|tre|fire|fem|seks)\s+(dager?|uker?|måneder?|mnd)\b/i);
  return { label: duration ? `${duration[1]} ${duration[2]} gratis` : "Gratis", priceNok: 0 };
}
