import { isRecord, stripHtml } from "./cashback.js";
import type { GetPriceMatchForProductMessage, PriceMatchAlternative, PriceMatchOffer } from "./extension-messages.js";
import type { JsonRequest } from "./prisjakt-price-match.js";
import { getMobileSupplier } from "./mobile-suppliers.js";
import { MOBILE_DATA_TIERS, TEK_MOBILE_NETWORKS, readTekPage, requestTekJson, tekPlansUrl } from "./tek-mobile-api.js";
import { formatKr } from "./reward-calculation.js";
import { readNumberValue } from "./values.js";

export type MobilePriceDetails = {
  category: "mobile" | "unlimited" | "broadband";
  requestedGb: number; includedGb: number; network: string; networkId: number; unlimitedData: boolean;
  speedMbps?: number; afterQuotaMbps?: number; terms?: string; meteredData?: boolean;
};
export function isMobilePriceDetails(value: unknown): value is MobilePriceDetails {
  return isRecord(value) && ["mobile", "unlimited", "broadband"].includes(String(value.category)) &&
    finite(value.requestedGb) && value.requestedGb >= 0 && finite(value.includedGb) && value.includedGb >= 0 &&
    typeof value.network === "string" && value.network.length <= 80 && typeof value.unlimitedData === "boolean" &&
    TEK_MOBILE_NETWORKS.some((network) => network.id === value.networkId) &&
    (value.meteredData === undefined || typeof value.meteredData === "boolean") &&
    (value.speedMbps === undefined || finite(value.speedMbps) && value.speedMbps > 0) &&
    (value.afterQuotaMbps === undefined || finite(value.afterQuotaMbps) && value.afterQuotaMbps > 0) &&
    (value.terms === undefined || typeof value.terms === "string" && value.terms.length <= 10_000);
}
// Tek's public, source-calculated invoice is used for every usage bracket.
// First page contains the cheapest 15, ordered by that usage estimate by the API.
// Youth/prepaid plans are excluded in the request and checked again here. Sponsor
// flags never affect selection. Each usage bracket is a separate comparison row.
export async function findMobilePriceMatches(message: GetPriceMatchForProductMessage, requestJson: JsonRequest = requestTekJson): Promise<PriceMatchOffer[]> {
  if (message.mobile !== true || getMobileSupplier(message.url) === undefined) return [];
  const lists = new Map<number, Record<string, unknown>[]>();
  const errors: string[] = [];
  let blocked = false;
  // Two concurrent requests at most; seven mobile usage brackets.
  for (let index = 0; index < MOBILE_DATA_TIERS.length && !blocked; index += 2) {
    await Promise.all(MOBILE_DATA_TIERS.slice(index, index + 2).map(async (gb) => {
      try { lists.set(gb, readTekPage(await requestJson(tekPlansUrl(gb), { credentials: "omit" })).rows); }
      catch (error) { const text = error instanceof Error ? error.message : "nettverksfeil"; errors.push(`${gb} GB: ${text}`); if (/HTTP (?:403|429)/.test(text)) blocked = true; }
    }));
  }
  const choices: { mobile: MobilePriceDetails; plans: PriceMatchAlternative[]; warnings: string[]; broadband?: PriceMatchAlternative }[] = [];
  const addChoice = async (rows: Record<string, unknown>[], gb: number, category: MobilePriceDetails["category"]) => {
    const eligible = selectPlans(rows, gb, category);
    if (!eligible.length) return;
    const missing = TEK_MOBILE_NETWORKS.filter((network) => !eligible.some((plan) => plan.mobile?.networkId === network.id));
    const warnings: string[] = [];
    // At most two missing networks per nonempty list: seven initial mobile
    // requests, up to fourteen network fallbacks and six broadband examples.
    // At most 27 anonymous GETs, two concurrently. A failed network must not
    // hide the other networks' offers.
    if (!blocked) await Promise.all(missing.map(async (network) => {
      try {
        const page = readTekPage(await requestJson(tekPlansUrl(gb, 1, category === "broadband", network.id), { credentials: "omit" }));
        if (page.rows.some((row) => !isRecord(row.operator) || !isRecord(row.operator.network) || row.operator.network.id !== network.id)) {
          throw new Error("nettfilteret returnerte feil mobilnett");
        }
        eligible.push(...selectPlans(page.rows, gb, category));
      } catch (error) {
        const text = error instanceof Error ? error.message : "nettverksfeil";
        warnings.push(`${network.name}: ${text}`);
        if (/HTTP (?:403|429)/.test(text)) blocked = true;
      }
    }));
    const plans = eligible.sort((a, b) => a.amount - b.amount || a.productName!.localeCompare(b.productName!, "nb"))
      .filter((plan, index, sorted) => sorted.findIndex((other) => other.mobile!.networkId === plan.mobile!.networkId) === index);
    for (const network of TEK_MOBILE_NETWORKS) {
      if (!plans.some((plan) => plan.mobile!.networkId === network.id) && !warnings.some((text) => text.startsWith(`${network.name}:`))) {
        warnings.push(`${network.name}: ${blocked ? "oppslag stoppet etter blokkering/ratebegrensning" : "ingen sammenlignbare treff"}`);
      }
    }
    if (plans[0]?.mobile) choices.push({ mobile: plans[0].mobile, plans, warnings });
  };
  for (const gb of MOBILE_DATA_TIERS) {
    if (gb !== 100) await addChoice(lists.get(gb) ?? [], gb, "mobile");
  }
  // Keep the 100 GB API query for unlimited-plan comparisons, without a
  // duplicate 100 GB display row beside "Fri data".
  await addChoice(lists.get(100) ?? [], 100, "unlimited");
  // Broadband is an optional, separately labelled comparison in each relevant
  // tooltip. No broadband example for zero data; unlimited mobile uses a clear
  // >=100 GB broadband example, never an invented unlimited broadband plan.
  const withData = choices.filter((choice) => choice.mobile.requestedGb > 0);
  for (let index = 0; index < withData.length && !blocked; index += 2) {
    await Promise.all(withData.slice(index, index + 2).map(async (choice) => {
      try {
        const page = readTekPage(await requestJson(tekPlansUrl(choice.mobile.requestedGb, 1, true), { credentials: "omit" }));
        const best = selectPlans(page.rows, choice.mobile.requestedGb, "broadband")[0];
        if (best) choice.broadband = best;
      } catch (error) {
        const text = error instanceof Error ? error.message : "nettverksfeil";
        choice.warnings.push(`Mobilt bredbånd: ${text}`);
        if (/HTTP (?:403|429)/.test(text)) blocked = true;
      }
    }));
  }
  if (!choices.length && errors.length) throw new Error(`Tek: ${errors.join("; ")}`);
  return choices.map(({ mobile, plans, warnings, broadband }) => {
    const best = plans[0]!;
    return { source: "tek", sourceName: "Tek.no", shopName: best.shopName, productName: best.productName!, amount: best.amount,
      price: best.price, currency: "NOK", mobile, productUrl:
        `https://www.tek.no/mobilabonnement?data=${mobile.requestedGb * 1000}&network=-1&features=`,
      alternatives: plans,
      ...(broadband ? { mobileBroadband: broadband } : {}),
      details: [`${mobileTierLabel(mobile)} fra Tek.no. 5 000 ringeminutter og 5 000 meldinger i Norge per måned.`,
        "Kildens beregnede månedspris inkluderer eventuelle datapakker og brukskostnader. Se hastighetsgrenser og vilkår. Unge-/kontantkort, familiepakker og egne dagskvoter er utelatt.",
        ...(errors.length || warnings.length ? [`Ufullstendig oppslag: ${[...errors, ...warnings].join("; ")}`] : [])].join("\n\n") };
  });
}

export function mobileTierLabel(m: MobilePriceDetails): string {
  return m.category === "broadband" ? `Mobilt bredbånd · ≥${m.requestedGb} GB` : m.category === "unlimited" ? "Fri data" : m.requestedGb === 0 ? "0 GB" : `≥${m.requestedGb} GB`;
}

function selectPlans(rows: Record<string, unknown>[], gb: number, category: "mobile" | "unlimited" | "broadband"): PriceMatchAlternative[] {
  const plans = rows.flatMap((row) => {
    const networkId = isRecord(row.operator) && isRecord(row.operator.network) ? row.operator.network.id : undefined;
    if (row.type !== (category === "broadband" ? "mobile-broadband-plan" : "mobile-plan") || typeof row.name !== "string" ||
      !isRecord(row.operator) || typeof row.operator.name !== "string" || !isRecord(row.operator.network) || typeof row.operator.network.name !== "string" ||
      !TEK_MOBILE_NETWORKS.some((network) => network.id === networkId) ||
      !Array.isArray(row.features) || !row.features.every(isRecord) || row.features.some((feature) => ["for-unge", "kontantkort", "familie"].includes(String(feature.slug))) ||
      !isRecord(row.pricingModel) || !["regular", "incremental_data", "data_only"].includes(String(row.pricingModel.type)) || !isRecord(row.pricingModel.attributes) ||
      !isRecord(row.estimatedInvoice) || row.estimatedInvoice.meetsUsageRequirements !== true || !finite(row.estimatedInvoice.total) || row.estimatedInvoice.total <= 0) return [];
    const a = row.pricingModel.attributes;
    if (typeof row.comment === "string" && /\b(?:MB|GB)\s+(?:data\s+)?(?:hver|per)\s+dag\b/i.test(stripHtml(row.comment))) return [];
    const meteredData = row.pricingModel.type === "incremental_data" && Array.isArray(a.dataSteps) && isRecord(a.dataSteps[0]) &&
      (numericField(a.dataSteps[0].length) ?? 0) > 0 && (readNumberValue(a.dataSteps[0].per_megabyte) ?? 0) > 0;
    // This explicit incremental model bills data from the first MB and has no
    // bundled allowance. Price always comes from the source's usage invoice.
    const included = meteredData ? 0 : numericField(a.dataIncluded);
    if (included === undefined || included < 0) return [];
    const after = numericField(a.dataExhaustedSpeedLimit);
    // A 100 GB allowance alone is not unlimited. Require the provider's explicit
    // plan name and continued data at a documented, positive reduced speed.
    const unlimitedData = /(?:fri\s*data|ubegrenset|ice\s*max)/i.test(row.name) && after !== undefined && after > 0;
    if (category === "unlimited" && !unlimitedData) return [];
    const speed = numericField(a.upperSpeedLimit);
    const amount = row.estimatedInvoice.total / 100;
    const mobile: MobilePriceDetails = { category, requestedGb: gb, includedGb: included / 1000, network: row.operator.network.name, networkId: networkId as number, unlimitedData, meteredData,
      ...(speed !== undefined && speed > 0 ? { speedMbps: speed / 1000 } : {}),
      ...(after !== undefined && after > 0 ? { afterQuotaMbps: after / 1000 } : {}),
      ...(typeof row.comment === "string" && row.comment.trim() ? { terms: stripHtml(row.comment).slice(0, 10_000) } : {}) };
    return [{ shopName: row.name, productName: row.operator.name, amount, price: `${formatKr(amount)} kr/mnd`, currency: "NOK", mobile }];
  });
  return plans.sort((a, b) => a.amount - b.amount || a.productName.localeCompare(b.productName, "nb"));
}

function numericField(value: unknown): number | undefined {
  return typeof value === "number" ? (finite(value) ? value : undefined) : typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) ? readNumberValue(value) : undefined;
}
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
