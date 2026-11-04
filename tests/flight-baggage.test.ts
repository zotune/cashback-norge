import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { flightTooltipChipTexts, isMomondoBookingOptionMatchingBaggage, isSkyscannerPricingOptionMatchingBaggage, type FlightSearchMeta } from "../src/shared/flight-search.js";

// Run the content script's actual orchestration with captured fare shapes and
// injected transport/extraction. This catches retries that silently drop bags,
// which tests of the individual baggage predicates alone cannot detect.
const source = ts.createSourceFile("content.ts", readFileSync(new URL("../src/extension/content.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
function loadFunction(name: string, dependencies: Record<string, unknown>): (...args: any[]) => Promise<any> {
  const fn = source.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(fn, name);
  const js = ts.transpileModule(fn.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(dependencies), `${js}\nreturn ${name};`)(...Object.values(dependencies));
}
const searches: FlightSearchMeta[] = [
  { origin: "BGO", destination: "OSL", outboundDate: "2026-12-05", adults: 1, youths: 0, children: 0, infants: 0, includeCabinBag: true },
  { origin: "BGO", destination: "OSL", outboundDate: "2026-12-05", inboundDate: "2026-12-08", adults: 1, youths: 0, children: 0, infants: 0, includeCheckedBag: true },
  { origin: "BGO", destination: "OSL", outboundDate: "2026-12-05", adults: 1, youths: 0, children: 0, infants: 0, includeCabinBag: true, includeCheckedBag: true },
];
const candidate = (amount: number) => ({ shopName: "Reisebyrå", amount, price: `${amount} kr`, currency: "NOK", productUrl: "https://example.test/flight" });

test("momondo: missing selected baggage produces no fare, including in cheapest/fastest pools", async () => {
  for (const meta of searches) for (const hasValidFare of [false, true]) {
    const checked: FlightSearchMeta[] = [];
    const fares = [
      { ...candidate(100), fees: { carryOnBagData: { status: "UNKNOWN" }, checkedBagData: { status: "UNKNOWN" } } },
      ...(hasValidFare ? [{ ...candidate(200), fees: { carryOnBagData: { status: "INCLUDED" }, checkedBagData: { status: "INCLUDED" } } }] : []),
    ];
    const select = (m: FlightSearchMeta) => { checked.push(m); return fares.filter((fare) => isMomondoBookingOptionMatchingBaggage(fare, m)); };
    const find = loadFunction("findMomondoFlightPriceMatchOffer", {
      readCurrentMomondoFlightSearchUrl: () => "https://www.momondo.no/flight-search/BGO-OSL/2026-12-05",
      fetchMomondoFlightSearchData: async (url: string) => ({ resultUrl: url }),
      MOMONDO_DEFAULT_FLIGHT_SORT_MODE: "bestflight_a",
      pollMomondoFlightResults: async () => ({ status: "complete" }),
      extractMomondoFlightOfferCandidates: (_data: unknown, m: FlightSearchMeta) => select(m),
      fetchMomondoFlightSortedCandidates: async (_a: unknown, _b: unknown, m: FlightSearchMeta) => select(m),
      readCurrentMomondoVisibleBestPrice: () => undefined,
      readStringValue: (x: unknown) => typeof x === "string" ? x : undefined,
      buildMomondoFlightSortUrl: (url: string) => url,
      buildFlightSortVariants: () => ({}),
    });
    const offer = await find(meta, "BGO → OSL", "", new Map());
    assert.equal(offer?.amount, hasValidFare ? 200 : undefined);
    assert.ok(checked.length > 0);
    for (const used of checked) assert.equal(used, meta, "Bagasjevalget skal beholdes ved alle uttrekk og sorteringer");
    if (offer) assert.deepEqual(offer.alternatives.map((fare: { amount: number }) => fare.amount), [200]);
  }
});

test("Skyscanner: an empty baggage-filtered result stays empty instead of falling back to an unqualified price", async () => {
  for (const meta of searches) for (const hasValidFare of [false, true]) {
    const checked: FlightSearchMeta[] = [];
    const fares = [
      { ...candidate(100), fareAttributes: { cabinBaggage: { assessment: "NOT_INCLUDED" }, checkedBaggage: { assessment: "UNKNOWN" } } },
      ...(hasValidFare ? [{ ...candidate(200), fareAttributes: { cabinBaggage: { assessment: "INCLUDED" }, checkedBaggage: { assessment: "INCLUDED" } } }] : []),
    ];
    const find = loadFunction("fetchSkyscannerFlightSearchCandidates", {
      fetchSkyscannerFlightPlace: async () => ({}), buildSkyscannerWebSearchHeaders: () => ({}),
      buildSkyscannerFlightSearchPayload: () => ({}), requestSkyscannerFlightSearch: async () => ({ context: { status: "complete" } }),
      SKYSCANNER_WEB_SEARCH_POLL_ATTEMPTS: 1,
      isRecord: (x: unknown) => x !== null && typeof x === "object",
      readStringValue: (x: unknown) => typeof x === "string" ? x : undefined,
      extractSkyscannerFlightSearchCandidates: (_data: unknown, m: FlightSearchMeta) => {
        checked.push(m); return fares.filter((fare) => isSkyscannerPricingOptionMatchingBaggage(fare, m));
      },
    });
    const result = await find(meta, "https://www.skyscanner.no/transport/flights/bgo/osl/261205/", new Map());
    assert.deepEqual(result.candidates.map((fare: { amount: number }) => fare.amount), hasValidFare ? [200] : []);
    assert.equal(result.searchComplete, true);
    assert.deepEqual(checked, [meta], "Ingen ny uthenting uten valgt bagasje");
  }
});

test("momondo: an unqualified visible Best price cannot override a baggage-filtered fare", async () => {
  const hasFlightSearchResultFilters = (m: FlightSearchMeta) => m.includeCabinBag === true || m.includeCheckedBag === true;
  for (const meta of searches) {
    const read = loadFunction("readCurrentMomondoVisibleBestPrice", { hasFlightSearchResultFilters });
    // No DOM/transport is supplied: a search requiring bags must return before
    // reading the page-wide Best price, whose fare/baggage is unknown.
    assert.equal(read(meta), undefined);
    const readForCard = loadFunction("readCurrentMomondoVisibleBestPriceForCurrentPage", {
      window: { location: { href: "https://www.momondo.no/flight-search/BGO-OSL/2026-12-05?sort=bestflight_a" } },
      parseUrl: (url: string) => new URL(url), isMomondoFlightSearchPage: () => true,
      readMomondoFlightSortMode: () => "bestflight_a", extractMomondoFlightSearchMeta: () => meta, hasFlightSearchResultFilters,
    });
    assert.equal(readForCard(), undefined);
  }
});

test("flight tooltip chips omit all baggage labels while preserving times, carriers and stops", () => {
  assert.deepEqual(flightTooltipChipTexts({
    durationText: "50m/55m · direkte",
    platform: "Norwegian, direkte, 18:20–19:10 / 08:00–08:55, håndbagasje ikke inkl., innsjekket ikke inkl.",
  }), ["50m/55m", "direkte", "Norwegian", "18:20–19:10 / 08:00–08:55"]);
  for (const baggage of ["håndbagasje inkludert", "innsjekket inkludert", "1 innsjekket", "cabin bag included", "checked bag included", "carry-on baggage included"]) {
    assert.deepEqual(flightTooltipChipTexts({ platform: `SAS, ${baggage}` }), ["SAS"]);
  }
});
