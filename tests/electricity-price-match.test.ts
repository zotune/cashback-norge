import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildElectricityComparisonTooltip, findElectricityPriceMatches, getElectricityLocalGrids, isElectricityPriceMatchUrl, isElectricityPriceDetails } from "../src/shared/electricity-price-match.js";
import { isGetPriceMatchForProductMessage, type GetPriceMatchForProductMessage } from "../src/shared/extension-messages.js";
import { findPriceMatches } from "../src/shared/price-match.js";
import { PROVIDER_COLORS, buildProviderMeta } from "../src/shared/provider-data.js";
import { createElectricityComparison } from "../src/extension/electricity-comparison.js";

// Selected fields from the unauthenticated Oslo response, 2026-11-04.
const fixture = () => JSON.parse(readFileSync(new URL("./fixtures/forbrukerradet-electricity.json", import.meta.url), "utf8"));
const suppliersFixture = () => JSON.parse(readFileSync(new URL("./fixtures/forbrukerradet-electricity-suppliers.json", import.meta.url), "utf8"));
const subsidyFixture = () => JSON.parse(readFileSync(new URL("./fixtures/forbrukerradet-electricity-stromstotte.json", import.meta.url), "utf8"));
const NOW = new Date("2026-11-04T12:00:00Z");
const message: GetPriceMatchForProductMessage = { type: "get-price-match-for-product", url: "https://klarkraft.no/", searchTerm: "Strømavtaler", electricity: { localGridId: 5, yearlyKwh: 14400, norgespris: true } };

test("electricity: first page load searches automatically, without user input, and reuses the result", async () => {
  let gridsCalls = 0;
  let searchCalls = 0;
  const comparison = createElectricityComparison({
    getUrl: () => "https://klarkraft.no/",
    requestJson: async (url) => { if (url.includes("electricity-suppliers.json")) return JSON.parse(readFileSync(new URL("../data/electricity-suppliers.json", import.meta.url), "utf8")); gridsCalls++; return [{ id: 5, name: "Oslo", areaCode: "NO1" }]; },
    findOffers: async (query) => { searchCalls++; assert.deepEqual(query.electricity, { ...message.electricity, municipality: "Oslo", areaCode: "NO1" }); return findElectricityPriceMatches(query, async () => fixture(), NOW); },
  });
  assert.equal(comparison.isSupported(), true);
  assert.equal((await comparison.getOffers()).length, 1);
  assert.equal((await comparison.getOffers()).length, 1);
  const best = (await comparison.getOffers())[0]!;
  assert.equal(best.amount, 729);
  assert.equal(best.price, "~729 kr/mnd");
  assert.equal(best.productName, "Agva Kraft");
  assert.equal(best.alternatives?.length, 5);
  assert.match(best.details!, /total strømpris for november 2026/);
  assert.doesNotMatch(best.details!, /besparelse|lavere/);
  assert.equal(gridsCalls, 1);
  assert.equal(searchCalls, 1);
});

test("electricity: defaults to Norgespris, keeps the ordinary subsidy estimate and never annualizes", async () => {
  const calls: string[] = [];
  const offers = await findElectricityPriceMatches(message, async (url, init) => {
    calls.push(url);
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.headers, undefined);
    return url.includes("norgespris=false") ? subsidyFixture() : fixture();
  }, NOW);
  assert.equal(calls.length, 2);
  assert.equal(calls[0], "https://strom-api.forbrukerradet.no/products/grid/5?yearlyKwhConsumption=14400&norgespris=true&consumptionCode=35");
  assert.deepEqual(offers.map((offer) => offer.amount), [729, 729, 733, 763, 808]);
  assert.equal(offers[0]!.electricity?.addonOrePerKwh, 0);
  assert.equal(offers[0]!.electricity?.monthlyFeeNok, 15); // incl. VAT, not 12
  assert.equal(offers[0]!.electricity?.monthlyKwh, 1427.04);
  assert.equal(offers[0]!.electricity?.period, "november 2026");
  assert.equal(offers[0]!.electricity?.scheme, "norgespris");
  assert.equal(offers[0]!.electricity?.energyOrePerKwh, 50);
  assert.equal(offers[0]!.electricity?.stromstotteMonthlyNok, 1525);
  assert.match(offers[0]!.details!, /ikke en prisgaranti/);
  assert.equal(offers[0]!.productUrl, "https://www.forbrukerradet.no/strompris/");
  assert.equal(offers[0]!.source, "forbrukerradet");
  const tooltip = buildElectricityComparisonTooltip(offers).join("\n");
  assert.match(tooltip, /Oslo · NO1 · 14\s400 kWh\/år/);
  assert.match(tooltip, /Agva Kraft/);
  assert.match(tooltip, /15 kr\/mnd gebyr · 0 øre\/kWh påslag/);
  assert.match(tooltip, /inkl\. Norgespris, påslag og månedsgebyr/);
  assert.match(tooltip, /Nettleie kommer i tillegg/);
  assert.doesNotMatch(tooltip, /912|180 kr\/år|standardavtale|lavere/);
  // Sorting uses the source's total, even if the fee alone has another order.
  const rows = fixture();
  rows[1].currentPrice.finalPriceMonthly = 1900;
  assert.equal((await findElectricityPriceMatches(message, async () => rows, NOW))[0]!.shopName, "Cheap spot 12");
});

test("electricity: ordinary subsidy is a separate scenario; its failure cannot hide Norgespris", async () => {
  let calls = 0;
  const ordinary = await findElectricityPriceMatches({ ...message, electricity: { ...message.electricity!, norgespris: false } }, async () => { calls++; return subsidyFixture(); }, NOW);
  assert.equal(calls, 1);
  assert.equal(ordinary[0]!.amount, 1525);
  assert.equal(ordinary[0]!.electricity?.scheme, "stromstotte");
  assert.equal(ordinary[0]!.electricity?.energyOrePerKwh, 105.8);
  const offers = await findElectricityPriceMatches(message, async (url) => {
    if (url.includes("norgespris=false")) throw new Error("HTTP 503");
    return fixture();
  }, NOW);
  assert.equal(offers[0]!.amount, 729);
  assert.equal(offers[0]!.electricity?.stromstotteMonthlyNok, undefined);
  const conflicting = subsidyFixture();
  conflicting[1].fee.finalMonthlyFee = 20;
  const mismatch = await findElectricityPriceMatches(message, async (url) => url.includes("norgespris=false") ? conflicting : fixture(), NOW);
  assert.equal(mismatch[0]!.electricity?.stromstotteMonthlyNok, undefined);
});

test("electricity: Cheap spot 12 stays in the source's shortlist and keeps its written conditions", async () => {
  const offers = await findElectricityPriceMatches(message, async () => fixture(), NOW);
  const cheap = offers.find((offer) => offer.productName === "Cheap Energy Norge AS");
  assert.ok(cheap);
  assert.equal(cheap.amount, 729);
  assert.equal(cheap.electricity?.maximumYearlyKwh, 16000);
  assert.match(cheap.electricity?.conditionsText ?? "", /Etter utløpt vilkårsgaranti/);
  const rows = fixture().slice(0, 2);
  rows[1].conditions.feeMandatoryType = "electronicInvoice";
  rows[1].addonPrice.addonPriceMinimumFixedFor = 6;
  const invoice = await findElectricityPriceMatches(message, async () => rows, NOW);
  assert.equal(invoice[0]!.electricity?.invoiceRequirement, "Krever eFaktura");
  assert.equal(invoice[0]!.electricity?.guaranteeMonths, 6);
});

test("electricity: excludes restricted, expired and unpriced contracts", async () => {
  for (const mutate of [
    (p: any) => { p.type = "fixed"; },
    (p: any) => { p.type = "plus"; },
    (p: any) => { p.expiredAt = "2026-11-01T00:00:00Z"; },
    (p: any) => { p.endDate = "2026-11-01"; },
    (p: any) => { p.publishedAt = "2027-01-01"; },
    (p: any) => { p.applicableToCustomerType = "membersOnly"; },
    (p: any) => { p.applicableToCustomerType = "newCustomers"; },
    (p: any) => { p.conditions.associations = [{ name: "Medlemmer" }]; },
    (p: any) => { p.conditions.cabinProduct = true; },
    (p: any) => { p.conditions.promotionalAgreement = true; },
    (p: any) => { p.conditions.linkedProduct = 123; },
    (p: any) => { p.conditions.agreementTime = 12; },
    (p: any) => { p.conditions.feeMandatoryType = "monthly"; },
    (p: any) => { p.conditions.otherConditions = { changed: true }; },
    (p: any) => { p.conditions.maxKwhPerYear = 14399; },
    (p: any) => { p.paymentType = "before"; },
    (p: any) => { p.fee.finalMonthlyFee = undefined; },
    (p: any) => { p.currentPrice.finalAddonPrice = NaN; },
    (p: any) => { p.currentPrice.finalPriceMonthly = undefined; },
    (p: any) => { p.currentPrice.finalPriceMonthly = 0; },
    (p: any) => { p.currentPrice.finalPriceMonthly = Infinity; },
    (p: any) => { p.monthlyConsumption = undefined; },
    (p: any) => { p.currentPrice.subsidyPrice = undefined; },
    (p: any) => { p.currentPrice.gridTariff = { amount: 300 }; },
    (p: any) => { p.billing.frequency = 3; },
    (p: any) => { p.orderUrl = "javascript:alert(1)"; },
  ]) {
    const rows = fixture().slice(1, 2);
    mutate(rows[0]);
    const offers = await findElectricityPriceMatches(message, async () => rows, NOW);
    assert.equal(offers.length, 0);
  }
});

test("electricity: written mandatory purchases override a missing linked-product flag", async () => {
  for (const text of ["Avtalen betinger at du kjøper Varmepakken fra vår samarbeidspartner.", "Avtalen betinger kjøp av Varmepakken fra vår samarbeidspartner."]) {
    const rows = fixture(); rows.forEach((row: any) => { row.conditions.otherConditions = text; row.conditions.linkedProduct = null; });
    assert.deepEqual(await findElectricityPriceMatches(message, async () => rows, NOW), []);
  }
});

test("electricity: accepts explicit free fees, handles VAT exemption and exact usage limit", async () => {
  const rows = fixture().slice(0, 2);
  rows[1].fee.finalMonthlyFee = 0;
  rows[1].currentPrice.finalAddonPrice = 0;
  rows[1].currentPrice.tax.vatExemption = true;
  rows[1].conditions.maxKwhPerYear = 14400;
  const offers = await findElectricityPriceMatches(message, async () => rows, NOW);
  assert.equal(offers[0]!.amount, 729); // zero supplier fees do not mean free electricity
  assert.match(offers[0]!.details!, /Uten mva/);
  assert.ok(isElectricityPriceDetails(offers[0]!.electricity));
  assert.equal(isElectricityPriceDetails({ monthlyFeeNok: NaN, addonOrePerKwh: 0, yearlyKwh: 14400, norgespris: true }), false);
});

test("electricity: the cheapest list is independent of the current supplier and deduplicates contracts", async () => {
  const rows = fixture();
  const offers = await findElectricityPriceMatches(message, async () => rows, NOW);
  assert.deepEqual(offers.map((offer) => offer.amount), [729, 729, 733, 763, 808]);
  assert.ok(offers.some((offer) => offer.matchedCurrentMerchant === true));
  assert.deepEqual(await findElectricityPriceMatches(message, async () => [...rows, rows[1]], NOW), offers);
  const many = Array.from({ length: 20 }, (_, i) => ({ ...rows[1], id: 20000 + i }));
  assert.equal((await findElectricityPriceMatches(message, async () => many, NOW)).length, 5);
});

test("electricity: includes guarantees under six months and retains the visited supplier outside the top five", async () => {
  const rows = fixture();
  const cheaper = Array.from({ length: 12 }, (_, i) => ({ ...rows[1], id: 30000 + i }));
  const offers = await findElectricityPriceMatches(message, async () => [rows[0], ...cheaper], NOW);
  assert.equal(offers.length, 6);
  const current = offers.at(-1)!;
  assert.equal(current.shopName, "Standard spotavtale privat");
  assert.equal(current.amount, 808);
  assert.equal(current.matchedCurrentMerchant, true);
  assert.equal(current.electricity?.guaranteeMonths, 1);
  assert.equal(current.electricity?.comparisonOnly, true);
});

test("electricity: guarded public-page pipeline and runtime message validation", async () => {
  assert.equal(isElectricityPriceMatchUrl("https://klarkraft.no/min-side"), false);
  assert.equal(isElectricityPriceMatchUrl("https://klarkraft.no.evil.example/"), false);
  assert.equal(isElectricityPriceMatchUrl("https://www.klarkraft.no/"), true);
  assert.equal(isGetPriceMatchForProductMessage(message), true);
  assert.equal(isGetPriceMatchForProductMessage({ ...message, electricity: { localGridId: 5, yearlyKwh: Infinity } }), false);
  assert.equal(isGetPriceMatchForProductMessage({ ...message, electricity: { localGridId: -1, yearlyKwh: 14400, norgespris: true } }), false);
  let calls = 0;
  assert.deepEqual(await findPriceMatches({ ...message, electricity: undefined }, async () => { calls++; return fixture(); }), []);
  assert.equal(calls, 0);
  assert.equal((await findPriceMatches(message, async () => fixture())).at(-1)?.amount, 808);
});

test("electricity: Fjordkraft and Norwegian Fortum pages show the same cheapest market shortlist", async () => {
  for (const url of ["https://www.fjordkraft.no/strom/", "https://www.fjordkraft.no/strom/stromavtale/strom-til-spotpris/",
    "https://www.fortum.com/no/strom", "https://www.fortum.com/no/strom/stromavtale/spotpris", "https://cheapenergy.no/privat/cheap-spot-12/", "https://www.agva.no/"]) {
    // Uses the bundled, daily-crawled supplier catalogue: only list suppliers
    // that are stable there (Hurum Kraft left Forbrukerrådet's list 2026-11-10).
    // Catalogue lookups themselves are covered with a fixture in
    // electricity-supplier-catalog.test.ts.
    assert.equal(isElectricityPriceMatchUrl(url), true);
    const offers = await findElectricityPriceMatches({ ...message, url }, async () => [...fixture(), ...suppliersFixture()], NOW);
    assert.equal(offers[0]!.amount, 729);
    const withoutOwnPlan = await findElectricityPriceMatches({ ...message, url }, async () => fixture(), NOW);
    assert.deepEqual(offers.slice(0, 4).map((offer) => offer.amount), withoutOwnPlan.slice(0, 4).map((offer) => offer.amount));
  }
  for (const url of ["https://minside.fjordkraft.no/", "https://www.fjordkraft.no/mobil/", 
    "https://www.fortum.com/se/",  "https://www.fortum.com.evil.example/no/strom"]) {
    assert.equal(isElectricityPriceMatchUrl(url), false);
  }
});

test("electricity: page navigation refreshes the comparison for the new URL", async () => {
  let url = message.url;
  let calls = 0;
  const comparison = createElectricityComparison({ getUrl: () => url,
    requestJson: async () => [{ id: 5, name: "Oslo", areaCode: "NO1" }],
    findOffers: async (query) => { calls++; return findElectricityPriceMatches(query, async () => [...fixture(), ...suppliersFixture()], NOW); },
  });
  assert.equal((await comparison.getOffers())[0]!.amount, 729);
  url = "https://www.fortum.com/no/strom";
  assert.equal((await comparison.getOffers())[0]!.amount, 729);
  assert.equal(calls, 2);
});

test("electricity: source errors remain identifiable and requests stay bounded to two scenarios", async () => {
  for (const cause of ["HTTP 429", "HTTP 503", "timed out", "connection reset"]) {
    let calls = 0;
    await assert.rejects(findElectricityPriceMatches(message, async () => { calls++; throw new Error(cause); }, NOW), new RegExp(cause));
    assert.equal(calls, 2);
  }
  await assert.rejects(findElectricityPriceMatches(message, async () => ({ products: [] }), NOW), /ugyldig avtalesvar/);
  await assert.rejects(findElectricityPriceMatches(message, async () => [{ renamed: 42 }], NOW), /ugyldig avtalesvar/);
  await assert.rejects(getElectricityLocalGrids(async () => undefined), /kommuneliste/);
  const grids = await getElectricityLocalGrids(async () => [{ id: 5, name: "Oslo", areaCode: "NO1" }, { id: -1, name: "X", areaCode: "NO1" }]);
  assert.deepEqual(grids, [{ id: 5, name: "Oslo", areaCode: "NO1" }]);
});

test("electricity: shared source chip preserves the supplied blue in both themes", () => {
  assert.deepEqual(PROVIDER_COLORS.forbrukerradet, { bg: "#004a66", fg: "#ffffff", preserveInDark: true });
  assert.equal(buildProviderMeta().forbrukerradet?.name, "Forbrukerrådet");
  assert.deepEqual(PROVIDER_COLORS.bytt, { bg: "#0075f5", fg: "#ffffff", preserveInDark: true });
  assert.equal(buildProviderMeta().bytt?.name, "Bytt.no");
});

test("electricity: automatically requests all five source-resolved areas and keeps their examples distinct", async () => {
  const grids = JSON.parse(readFileSync(new URL("./fixtures/forbrukerradet-grids.json", import.meta.url), "utf8"));
  const queries: GetPriceMatchForProductMessage[] = [];
  const comparison = createElectricityComparison({
    getUrl: () => message.url,
    requestJson: async (url) => url.includes("electricity-suppliers.json") ? JSON.parse(readFileSync(new URL("../data/electricity-suppliers.json", import.meta.url), "utf8")) : grids,
    findOffers: async (query) => { queries.push(query); return findElectricityPriceMatches(query, async () => fixture(), NOW); },
  });
  const offers = await comparison.getOffers();
  assert.deepEqual(queries.map((q) => q.electricity!.localGridId), [5, 212, 249, 416, 511]);
  assert.deepEqual(offers.map((o) => o.electricity!.areaCode), ["NO1", "NO2", "NO3", "NO4", "NO5"]);
  assert.equal(offers.at(-1)!.electricity!.municipality, "Bergen");
  assert.match(offers.at(-1)!.details!, /Bergen · NO5/);
  assert.ok(offers.at(-1)!.alternatives!.every((a) => a.electricity?.municipality === "Bergen" && a.electricity?.areaCode === "NO5"));
  await comparison.getOffers(); assert.equal(queries.length, 5);
});

test("electricity: one area failure preserves other areas and source rate limits stop further lookups", async () => {
  const grids = JSON.parse(readFileSync(new URL("./fixtures/forbrukerradet-grids.json", import.meta.url), "utf8"));
  let count = 0;
  const comparison = createElectricityComparison({
    getUrl: () => message.url,
    requestJson: async (url) => url.includes("electricity-suppliers.json") ? undefined : grids,
    findOffers: async (query) => { count++; if (query.electricity!.areaCode === "NO2") throw new Error("HTTP 500"); return findElectricityPriceMatches(query, async () => fixture(), NOW); },
  });
  const offers = await comparison.getOffers();
  assert.equal(offers.length, 4); assert.equal(count, 5); assert.match(offers[0]!.details!, /NO2: HTTP 500/);
  count = 0;
  const limited = createElectricityComparison({ getUrl: () => message.url, requestJson: async () => grids,
    findOffers: async () => { count++; throw new Error("HTTP 429"); } });
  assert.deepEqual(await limited.getOffers(), []); assert.equal(count, 1); assert.match(limited.getError(), /HTTP 429/);
});
