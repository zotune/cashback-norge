import { isRecord } from "./cashback.js";
import type { GetPriceMatchForProductMessage, PriceMatchOffer } from "./extension-messages.js";
import type { JsonRequest } from "./prisjakt-price-match.js";
import { formatKr } from "./reward-calculation.js";
import { getElectricitySupplier } from "./electricity-suppliers.js";
export { getElectricitySupplier } from "./electricity-suppliers.js";

export type ElectricitySearch = { localGridId: number; yearlyKwh: number; norgespris: boolean; municipality?: string; areaCode?: string };
export type ElectricityPriceDetails = { monthlyFeeNok: number; addonOrePerKwh: number; yearlyKwh: number; monthlyKwh: number; period: string;
  scheme: "norgespris" | "stromstotte"; energyOrePerKwh: number; stromstotteMonthlyNok?: number; maximumYearlyKwh?: number; guaranteeMonths?: number;
  conditionsText?: string; invoiceRequirement?: string; comparisonOnly?: boolean; municipality: string; areaCode: string; vatExempt: boolean };
export type ElectricityLocalGrid = { id: number; name: string; areaCode: string };
// Same anonymous example as the public portal's initial store (Oslo, 14 400 kWh).
// Verified in its current public app on 2026-11-04. Norgespris is our labelled
// default scenario; the portal itself starts with ordinary electricity subsidy.
export const ELECTRICITY_EXAMPLE = { municipality: "Oslo", areaCode: "NO1", yearlyKwh: 14_400, norgespris: true } as const;
// Public example municipalities, resolved against the source's current grid list.
// Area rows are independent examples, never the visitor's location.
export const ELECTRICITY_AREAS = [
  { municipality: "Oslo", areaCode: "NO1" },
  { municipality: "Kristiansand", areaCode: "NO2" },
  { municipality: "Trondheim - Tråante", areaCode: "NO3" },
  { municipality: "Tromsø", areaCode: "NO4" },
  { municipality: "Bergen", areaCode: "NO5" },
] as const;

const API = "https://strom-api.forbrukerradet.no";
const PORTAL = "https://www.forbrukerradet.no/strompris/";
const REQUEST_TIMEOUT_MS = 15_000;
export const ELECTRICITY_MAX_OFFERS = 5;
const INVOICE_REQUIREMENTS: Record<string, string> = { none: "", electronicInvoice: "Krever eFaktura", directDebit: "Krever AvtaleGiro", both: "Krever eFaktura og AvtaleGiro" };

// Public JSON used by Forbrukerrådet's comparison page, verified without cookies/auth.
// Undocumented interface: fail explicitly on a changed response shape. No login or
// consumption history is used. The API's monthly estimate includes spot price,
// supplier fees and Norgespris/ordinary subsidy, using its seasonal consumption profile.
// It excludes grid charges and must never be annualized or called a personal quote.
export function isElectricityPriceMatchUrl(value: string): boolean {
  return getElectricitySupplier(value) !== undefined;
}

export function isElectricitySearch(value: unknown): value is ElectricitySearch {
  return isRecord(value) && typeof value.norgespris === "boolean" && Number.isSafeInteger(value.localGridId) && (value.localGridId as number) > 0 &&
    (value.localGridId as number) < 100_000 && Number.isSafeInteger(value.yearlyKwh) &&
    (value.yearlyKwh as number) >= 100 && (value.yearlyKwh as number) <= 100_000 &&
    (value.municipality === undefined || typeof value.municipality === "string" && value.municipality.length > 0 && value.municipality.length < 100) &&
    (value.areaCode === undefined || typeof value.areaCode === "string" && /^NO[1-5]$/.test(value.areaCode));
}

export function isElectricityPriceDetails(value: unknown): value is ElectricityPriceDetails {
  return isRecord(value) && nonNegative(value.monthlyFeeNok) && nonNegative(value.addonOrePerKwh) &&
    typeof value.municipality === "string" && value.municipality.length > 0 && value.municipality.length < 100 &&
    typeof value.areaCode === "string" && /^NO[1-5]$/.test(value.areaCode) &&
    typeof value.vatExempt === "boolean" &&
    (value.scheme === "norgespris" || value.scheme === "stromstotte") && nonNegative(value.energyOrePerKwh) &&
    (value.stromstotteMonthlyNok === undefined || positive(value.stromstotteMonthlyNok)) &&
    (value.conditionsText === undefined || (typeof value.conditionsText === "string" && value.conditionsText.length <= 10_000)) &&
    (value.invoiceRequirement === undefined || (typeof value.invoiceRequirement === "string" && Object.values(INVOICE_REQUIREMENTS).includes(value.invoiceRequirement))) &&
    (value.comparisonOnly === undefined || typeof value.comparisonOnly === "boolean") &&
    positive(value.monthlyKwh) && typeof value.period === "string" && value.period.length > 0 && value.period.length <= 40 &&
    (value.maximumYearlyKwh === undefined || positive(value.maximumYearlyKwh)) &&
    (value.guaranteeMonths === undefined || nonNegative(value.guaranteeMonths)) &&
    Number.isSafeInteger(value.yearlyKwh) && (value.yearlyKwh as number) >= 100 && (value.yearlyKwh as number) <= 100_000;
}

export async function getElectricityLocalGrids(requestJson: JsonRequest = fetchPublicJson): Promise<ElectricityLocalGrid[]> {
  const value = await requestJson(`${API}/local_grids/`, { credentials: "omit" });
  if (!Array.isArray(value)) throw new Error("Forbrukerrådet /local_grids/: ugyldig kommuneliste");
  const grids = value.filter((item) => isRecord(item) && positive(item.id) && Number.isSafeInteger(item.id) &&
    typeof item.name === "string" && item.name.length > 0 && typeof item.areaCode === "string" && /^NO[1-5]$/.test(item.areaCode))
    .map((item) => ({ id: item.id as number, name: item.name as string, areaCode: item.areaCode as string }));
  if (grids.length === 0) throw new Error("Forbrukerrådet /local_grids/: tom eller endret kommuneliste");
  return grids.sort((a, b) => a.name.localeCompare(b.name, "nb"));
}

export async function findElectricityPriceMatches(
  message: GetPriceMatchForProductMessage,
  requestJson: JsonRequest = fetchPublicJson,
  now = new Date(),
): Promise<PriceMatchOffer[]> {
  if (!isElectricityPriceMatchUrl(message.url) || !isElectricitySearch(message.electricity)) return [];
  const { localGridId, yearlyKwh, norgespris } = message.electricity;
  const municipality = message.electricity.municipality ?? ELECTRICITY_EXAMPLE.municipality;
  const areaCode = message.electricity.areaCode ?? ELECTRICITY_EXAMPLE.areaCode;
  const url = `${API}/products/grid/${localGridId}?yearlyKwhConsumption=${yearlyKwh}&norgespris=${norgespris}&consumptionCode=35`;
  // At most two anonymous requests: selected scenario plus an optional ordinary
  // subsidy estimate. A failed secondary estimate must not hide Norgespris offers.
  const [value, subsidyValue] = await Promise.all([
    requestJson(url, { credentials: "omit" }),
    norgespris ? requestJson(url.replace("norgespris=true", "norgespris=false"), { credentials: "omit" }).catch(() => undefined) : undefined,
  ]);
  if (!Array.isArray(value) || (value.length > 0 && !value.some((row) => isRecord(row) && typeof row.name === "string" && isRecord(row.currentPrice)))) {
    throw new Error(`Forbrukerrådet /products/grid/${localGridId}: ugyldig avtalesvar`);
  }
  const plans = value.flatMap((row) => {
    const plan = readPlan(row, yearlyKwh, now);
    return plan === undefined ? [] : [plan];
  });
  const subsidyPlans = Array.isArray(subsidyValue) ? subsidyValue.flatMap((row) => {
    const plan = readPlan(row, yearlyKwh, now);
    return plan === undefined ? [] : [plan];
  }) : [];
  const period = now.toLocaleDateString("nb-NO", { timeZone: "Europe/Oslo", month: "long", year: "numeric" });
  const ranked = plans.sort((a, b) => a.amount - b.amount || a.id - b.id)
    .filter((plan, index, list) => list.findIndex((other) => other.id === plan.id) === index);
  const shortlist = ranked.slice(0, ELECTRICITY_MAX_OFFERS);
  const currentSupplierId = getElectricitySupplier(message.url)!.id;
  const listedIds = new Set(shortlist.map((plan) => plan.id));
  const comparison = ranked.filter((plan) => plan.supplierId === currentSupplierId && !listedIds.has(plan.id)).slice(0, 3);
  return [...shortlist, ...comparison].map((plan) => ({
    source: "forbrukerradet",
    sourceName: "Forbrukerrådet",
    productName: plan.supplier,
    shopName: plan.name,
    productUrl: PORTAL,
    offerUrl: plan.orderUrl,
    price: `~${formatKr(plan.amount)} kr/mnd`,
    amount: plan.amount,
    currency: "NOK",
    matchedCurrentMerchant: plan.supplierId === currentSupplierId,
    electricity: { municipality, areaCode, vatExempt: plan.vatExemption, monthlyFeeNok: plan.monthlyFee, addonOrePerKwh: plan.addon, yearlyKwh, monthlyKwh: plan.monthlyKwh, period, guaranteeMonths: plan.guaranteeMonths,
      scheme: norgespris ? "norgespris" : "stromstotte", energyOrePerKwh: norgespris ? plan.norgesprisRate : plan.subsidizedSpotRate,
      ...(plan.conditionsText ? { conditionsText: plan.conditionsText } : {}),
      ...(plan.invoiceRequirement ? { invoiceRequirement: plan.invoiceRequirement } : {}),
      ...(!listedIds.has(plan.id) ? { comparisonOnly: true } : {}),
      ...(() => {
        const other = subsidyPlans.find((p) => p.id === plan.id && p.name === plan.name && p.supplierId === plan.supplierId &&
          p.monthlyFee === plan.monthlyFee && p.addon === plan.addon && p.monthlyKwh === plan.monthlyKwh);
        return other === undefined ? {} : { stromstotteMonthlyNok: other.amount };
      })(),
      ...(plan.maximumYearlyKwh !== null ? { maximumYearlyKwh: plan.maximumYearlyKwh } : {}) },
    details: [
      `${plan.supplier}: ${plan.name}`,
      `Regneeksempel for ${municipality} · ${areaCode} fra Forbrukerrådets strømprisportal.`,
      `${formatKr(plan.monthlyFee)} kr/mnd + ${formatKr(plan.addon)} øre/kWh. ${yearlyKwh.toLocaleString("nb-NO")} kWh/år.`,
      `Beregnet total strømpris for ${period}: ${formatKr(plan.amount)} kr, inkl. ${norgespris ? "Norgespris" : "spotpris og strømstøtte"}, påslag og månedsgebyr. ${plan.vatExemption ? "Uten mva. i valgt område." : "Inkl. mva."}`,
      `Timespot, etterskuddsvis, ingen bindingstid.${plan.guaranteeMonths > 0 ? ` Påslagsgaranti: ${plan.guaranteeMonths} mnd.` : ""}`,
      "Nettleie og eventuelt papirfakturagebyr kommer i tillegg. Månedsprisen er et estimat, ikke en prisgaranti.",
      `Innrapporterte avtaledata fra Forbrukerrådet. Sist endret hos kilden: ${plan.updatedAt.slice(0, 10)}.`,
      plan.conditionsText,
      plan.invoiceRequirement,
      "Utvalget inkluderer alle garantiperioder. Kampanjer og medlemsavtaler er utelatt.",
    ].filter(Boolean).join("\n"),
  }));
}

export function buildElectricityComparisonTooltip(offers: PriceMatchOffer[], error = ""): string[] {
  const example = offers[0]?.electricity;
  return [
    "Forbrukerrådet · strømavtaler",
    `Regneeksempel: ${example?.municipality ?? ELECTRICITY_EXAMPLE.municipality} · ${example?.areaCode ?? ELECTRICITY_EXAMPLE.areaCode} · ${(example?.yearlyKwh ?? ELECTRICITY_EXAMPLE.yearlyKwh).toLocaleString("nb-NO")} kWh/år. Dette er ikke en beregning av din strømregning.`,
    example ? `Beregnet total strømpris for ${example.period}, inkl. ${example.scheme === "norgespris" ? "Norgespris" : "spotpris og strømstøtte"}, påslag og månedsgebyr. Nettleie kommer i tillegg.` : "",
    offers.length > 0 ? ["Billigste sammenlignbare strømavtaler", ...offers.map((offer) => {
      const e = offer.electricity!;
      const conditions = [e.maximumYearlyKwh !== undefined ? `opptil ${e.maximumYearlyKwh.toLocaleString("nb-NO")} kWh/år` : "",
        e.guaranteeMonths !== undefined ? `${e.guaranteeMonths} mnd. påslagsgaranti` : ""].filter(Boolean).join(" · ");
      return [`- ${offer.productName}: ${offer.shopName} — ${offer.price}`, `${formatKr(e.monthlyFeeNok)} kr/mnd gebyr · ${formatKr(e.addonOrePerKwh)} øre/kWh påslag${conditions ? ` · ${conditions}` : ""}`,
        e.stromstotteMonthlyNok !== undefined ? `Med vanlig strømstøtte: ~${formatKr(e.stromstotteMonthlyNok)} kr/mnd` : undefined,
        e.invoiceRequirement, e.conditionsText].filter(Boolean).join("\n");
    })].join("\n") : error || "Ingen sammenlignbare avtaler akkurat nå.",
    `Viser opptil ${ELECTRICITY_MAX_OFFERS} billigste spotavtaler uten binding eller medlemskrav. Alle garantiperioder er inkludert. Avtaler hos leverandøren på siden vises også til sammenligning. Kampanjer er utelatt; øvrige vilkår står ved avtalen.`,
    `${example?.vatExempt ? "Uten mva. i kommuneeksemplet." : "Inkl. mva."} Nettleie og eventuelt papirfakturagebyr kommer i tillegg. Månedsprisen er et estimat, ikke en prisgaranti.`,
    "Kilde: innrapporterte avtaledata fra Forbrukerrådet.",
    "Standardavtaler med kort påslagsgaranti finnes under «Under 6 måneder» i portalens garantifilter.",
  ].filter(Boolean);
}

// One visible offer per comparison source, like the other price-match adapters.
// The full shortlist remains available in the standard tip.
export function summarizeElectricityComparison(offers: PriceMatchOffer[]): PriceMatchOffer | undefined {
  const best = offers[0];
  if (best === undefined) return undefined;
  return {
    ...best,
    details: buildElectricityComparisonTooltip(offers).join("\n\n"),
    alternatives: offers.map((offer) => ({
      shopName: offer.shopName,
      productName: offer.productName,
      ...(offer.offerUrl !== undefined ? { offerUrl: offer.offerUrl } : {}),
      ...(offer.electricity !== undefined ? { electricity: offer.electricity } : {}),
      matchedCurrentMerchant: offer.matchedCurrentMerchant === true,
      amount: offer.amount,
      price: offer.price,
      currency: offer.currency,
    })),
  };
}

function readPlan(value: unknown, yearlyKwh: number, now: Date) {
  if (!isRecord(value) || !positive(value.id) || !Number.isSafeInteger(value.id) || typeof value.name !== "string" || value.type !== "hourly_spot" ||
    (value.applicableToCustomerType !== "allCustomers" && value.applicableToCustomerType !== "newAndExisting") || value.expiredAt !== null || value.paymentType !== "after" ||
    !validDate(value.publishedAt) || Date.parse(value.publishedAt) > now.getTime() || !validDate(value.updatedAt) ||
    (value.endDate !== null && (!validDate(value.endDate) || Date.parse(value.endDate) <= now.getTime()))) return undefined;
  const { conditions, fee, currentPrice: price, organization, addonPrice } = value;
  if (!isRecord(conditions) || !isRecord(fee) || !isRecord(price) || !isRecord(organization) || !isRecord(price.tax) ||
    typeof organization.name !== "string" || !positive(organization.id) || !Number.isSafeInteger(organization.id) ||
    !Array.isArray(conditions.associations) || conditions.associations.length > 0 || conditions.cabinProduct !== false ||
    conditions.promotionalAgreement !== false || conditions.linkedProduct !== null ||
    typeof conditions.feeMandatoryType !== "string" || !Object.hasOwn(INVOICE_REQUIREMENTS, conditions.feeMandatoryType) ||
    (conditions.agreementTime !== null && conditions.agreementTime !== 0) ||
    (conditions.otherConditions !== null && (typeof conditions.otherConditions !== "string" || conditions.otherConditions.length > 10_000)) ||
    (conditions.maxKwhPerYear !== null && (!positive(conditions.maxKwhPerYear) || yearlyKwh > conditions.maxKwhPerYear)) ||
    fee.contractBreachFee !== false || !nonNegative(fee.finalMonthlyFee) || !nonNegative(price.finalAddonPrice) ||
    typeof price.tax.vatExemption !== "boolean" || !positive(price.finalPriceMonthly) ||
    !positive(value.monthlyConsumption) || price.gridTariff !== null ||
    !nonNegative(price.finalKwPrice) || typeof price.subsidyPrice !== "number" || !Number.isFinite(price.subsidyPrice) || price.subsidyPrice > 0 ||
    !nonNegative(price.norgesprisPrice) || !nonNegative(price.spotPriceIncludingSubsidy) ||
    !isRecord(value.billing) || value.billing.frequency !== 1 || value.billing.unit !== "month") return undefined;
  const orderUrl = safeOrderUrl(value.orderUrl);
  if (orderUrl === undefined) return undefined;
  // Some suppliers report linkedProduct=null even though their written terms
  // explicitly require buying another product. Ordinary examples must not rank
  // these as available without that additional purchase.
  if (typeof conditions.otherConditions === "string" && /(?:betinger|forutsetter|krever)[^.]{0,200}\bkjøp(?:er)?\b/i.test(conditions.otherConditions)) return undefined;
  const guarantee = isRecord(addonPrice) && nonNegative(addonPrice.addonPriceMinimumFixedFor) ? addonPrice.addonPriceMinimumFixedFor : 0;
  const guaranteeMonths = isRecord(addonPrice) && addonPrice.addonPriceMinimumFixedForUnit === "year" ? guarantee * 12 :
    isRecord(addonPrice) && addonPrice.addonPriceMinimumFixedForUnit === "month" ? guarantee : 0;
  const amount = price.finalPriceMonthly;
  if (!nonNegative(amount)) return undefined;
  return { id: value.id as number, name: value.name, supplier: organization.name, supplierId: organization.id as number,
    orderUrl, monthlyFee: fee.finalMonthlyFee, addon: price.finalAddonPrice, amount, monthlyKwh: value.monthlyConsumption, guaranteeMonths,
    norgesprisRate: price.norgesprisPrice, subsidizedSpotRate: price.spotPriceIncludingSubsidy,
    conditionsText: typeof conditions.otherConditions === "string" ? conditions.otherConditions.trim() : "",
    invoiceRequirement: INVOICE_REQUIREMENTS[conditions.feeMandatoryType],
    vatExemption: price.tax.vatExemption, updatedAt: value.updatedAt, maximumYearlyKwh: conditions.maxKwhPerYear as number | null };
}

function safeOrderUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : undefined;
  } catch { return undefined; }
}
function nonNegative(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0; }
function positive(value: unknown): value is number { return nonNegative(value) && value > 0; }
function validDate(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }

async function fetchPublicJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, { credentials: "omit", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    throw new Error(`Forbrukerrådet ${new URL(url).pathname}: ${error instanceof Error ? error.message : "nettverksfeil"}`);
  }
}
