import { isRecord, uniqueOffers, type CashbackOffer } from "../../shared/cashback.js";
import { cleanPromotionText as clean } from "../../shared/free-promotions.js";
import { readPriceAmount } from "../../shared/price.js";
import { formatKr } from "../../shared/reward-calculation.js";
import type { FreeOffersInput } from "./free-offers.js";
import { crawlPromotionDocuments } from "./promotion-crawler.js";
import { promotionDomains } from "./promotion-domains.js";

export const SPARELOSEN_CAMPAIGNS = "https://sparelosen.no/mobil/kampanjer-og-tilbud/";
const CALCULATOR = "https://sparelosen.no/mobilabonnement/";

// The campaign article has no public JSON API. The linked Astro calculator
// publishes its plans as JSON.parse(`...`) in its current component module.
// Discover that module from the page; read JSON only, never execute its code.
// Price is monthly NOK in the calculator (99 means 99 kr, not øre). Trial=Yes
// marks a campaign. Complete eligibility, setup fees and expiry are not in this
// catalogue, so keep those unknown and link the current campaign conditions.
export async function fetchSparelosen(input: FreeOffersInput): Promise<CashbackOffer[]> {
  let offers: CashbackOffer[] | undefined;
  await crawlPromotionDocuments({
    name: "Sparelosen", startUrl: input.startUrl ?? SPARELOSEN_CAMPAIGNS, logger: input.logger, maxRequests: 3,
    read: (body, url, kind) => {
      if (kind === "script") { offers = readSparelosenPlans(body, input); return; }
      const origin = new URL(url).origin;
      if (kind === "page") {
        const links = [...body.matchAll(/href=["']([^"']+)["']/gi)].map((m) => new URL(m[1]!, url));
        const calculator = links.find((link) => link.origin === origin && link.pathname === new URL(CALCULATOR).pathname);
        if (!calculator) throw new Error("Sparelosen: campaign page no longer links to the mobile catalogue");
        return { next: [{ url: calculator.href, kind: "calculator" }] };
      }
      const components = [...body.matchAll(/component-url=["']([^"']+)["']/gi)].map((m) => new URL(m[1]!, url));
      const component = components.find((link) => link.origin === origin && /\/_astro\/MobilKalk\.[\w-]+\.js$/.test(link.pathname));
      if (!component) throw new Error("Sparelosen: mobile component not found");
      return { next: [{ url: component.href, kind: "script" }] };
    },
  });
  if (!offers?.length) throw new Error("Sparelosen: no introductory mobile offers in public catalogue");
  input.logger.info(`Sparelosen: ${offers.length} introductory mobile offers (${offers.filter((offer) => offer.domains.length > 0).length} with verified merchant domains)`);
  return offers;
}

export function readSparelosenPlans(script: string, input: FreeOffersInput): CashbackOffer[] {
  let plans: unknown;
  for (const match of script.matchAll(/JSON\.parse\(\s*`([^`]*?)`\s*\)/g)) {
    // Only JSON strings: no eval, module import or interpolation execution.
    let data: unknown;
    try { data = JSON.parse(match[1]!); } catch { continue; }
    if (Array.isArray(data) && data.some((row) => isRecord(row) && "planId" in row)) { plans = data; break; }
  }
  if (!Array.isArray(plans) || plans.length > 500 || !plans.every((row) => isRecord(row) &&
    typeof row.planId === "string" && typeof row.Provider === "string" && typeof row.Plan === "string" && "Trial" in row)) {
    throw new Error("Sparelosen: invalid mobile plan catalogue schema");
  }
  const offers: CashbackOffer[] = [];
  for (const row of plans as Record<string, unknown>[]) {
    if (row.Trial !== "Yes") continue;
    const price = readPriceAmount(row.Price);
    const merchantName = clean(row.Provider);
    const plan = clean(row.Plan);
    const trial = clean(row.Trialtext);
    if (price === undefined || !merchantName || !trial) continue;
    const duration = trial.match(/\b(\d+)\s*(mnd|måneder|uker|dager)\b/i)?.[0];
    const label = `${formatKr(price)} kr/mnd${duration ? ` i ${duration}` : ""}`;
    const minimumAge = readPriceAmount(row.Agemin);
    const maximumAge = readPriceAmount(row.Agemax);
    const terms = [
      `${merchantName}: ${plan}. Mobilabonnement med introduksjonspris ${label}.`, trial,
      clean(row.priceNote), clean(row.Other), clean(row.familyNote),
      row.memberGroup ? `Krever medlemskap: ${clean(row.memberGroup)}` : "",
      minimumAge === undefined ? "" : `Alder fra ${minimumAge} år.`,
      maximumAge === undefined ? "" : `Alder til og med ${maximumAge} år.`,
      "Dette er abonnementspris, ikke cashback. Kontroller ordinær pris, binding, etablering og hvem kampanjen gjelder for hos operatøren.",
      "Kilde: sparelosen.no, offentlig mobilkatalog lenket fra kampanjesiden. Ikke kontrollert av Cashback Norge.",
    ].filter(Boolean).join("\n");
    offers.push({
      provider: "sparelosen", merchantName, reward: price === 0 ? "0 kr totalsum" : "Prøvetilbud",
      promotion: { label, priceNok: price, id: String(row.planId) },
      domains: promotionDomains({ ...input, provider: "sparelosen", merchantName, destination: clean(row.Url) }),
      sourceUrl: CALCULATOR,
      activationUrl: SPARELOSEN_CAMPAIGNS, terms, updatedAt: input.generatedAt,
    });
  }
  return uniqueOffers(offers);
}
