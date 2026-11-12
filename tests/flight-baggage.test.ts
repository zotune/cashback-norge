import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import * as flightSearch from "../src/shared/flight-search.js";
import { buildSkyscannerFlightSearchUrl, flightTooltipChipTexts, isMomondoBookingOptionMatchingBaggage, isSkyscannerPricingOptionMatchingBaggage, type FlightSearchMeta } from "../src/shared/flight-search.js";

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

test("PanFlights preserves the selected cabin from the page URL through searches and outgoing links", async () => {
  const extract = loadFunction("extractPanFlightsFlightSearchMeta", {
    ...flightSearch,
    isPanFlightsSearchPage: () => true,
    readPanFlightsPlaceIataCode: (value: string) => ({ "2105": "PVG", "2642": "BGO" })[value],
    readCompactIsoDateValue: (value: string) => /^\d{8}$/.test(value ?? "")
      ? value.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3") : undefined,
    readPositiveIntegerValue: (value: string) => Number(value) > 0 ? Number(value) : undefined,
    readNonNegativeIntegerValue: (value: string | null) => value !== null && Number(value) >= 0 ? Number(value) : undefined,
  });
  const payload = loadFunction("buildPanFlightsFlightSearchPayload", {
    ...flightSearch,
    splitIsoDateParts: loadFunction("splitIsoDateParts", {}),
    PANFLIGHTS_FLIGHT_HITS_LIMIT: 500,
    navigator: { userAgent: "fixture" },
  });
  const variant = { sortOrder: "quality", sortRadio: "quality", version: 0, maxStops: 6, searchId: 1001 };
  for (const [code, cabin] of [["Y", "economy"], ["S", "premium"], ["C", "business"], ["F", "first"]]) {
    const url = new URL(`https://panflights.no/nb/oneway/?v2=2105_2642_20261119_ff:7,7&cl=${code}&x=d.1;b.1`);
    const meta = await extract(url);
    assert.ok(meta);
    assert.equal(meta.cabinClass, cabin);
    assert.equal(meta.origin, "PVG");
    assert.equal(meta.destination, "BGO");
    assert.equal(meta.outboundDate, "2026-11-19");
    assert.equal(meta.dateFlex.outboundBefore, 7);
    assert.equal((await payload(meta, variant)).class, code);
    assert.equal(new URL(flightSearch.buildPanFlightsFlightSearchUrl(meta)).searchParams.get("cl"), code);
    assert.equal(new URL(flightSearch.buildFinnFlightSearchUrl(meta)).searchParams.get("cabinType"), cabin);
    assert.equal(new URL(flightSearch.buildSkyscannerFlightSearchUrl(meta)).searchParams.get("cabinclass"), cabin === "premium" ? "premiumeconomy" : cabin);
    url.searchParams.delete("cl");
    assert.equal((await extract(url)).cabinClass, undefined, "Missing cabin retains the default");
    url.searchParams.set("cl", "invalid");
    assert.equal((await extract(url)).cabinClass, undefined, "Unknown codes are not interpreted as Business");
  }
});

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

test("Skyscanner orchestration preserves city scope and uses the resolved place IDs in every link", async () => {
  const meta: FlightSearchMeta = { ...searches[2]!, destination: "SHA", originScope: "airport", destinationScope: "city" };
  const requests: unknown[][] = [];
  const find = loadFunction("findSkyscannerFlightPriceMatchOffer", {
    fetchSkyscannerFlightPlace: async (...args: unknown[]) => {
      requests.push(args);
      return { skyId: args[0] === "BGO" ? "BGO" : "CSHA" };
    },
    buildSkyscannerFlightSearchUrl,
    fetchCachedSkyscannerFlightOfferCandidates: async (_meta: unknown, url: string) => {
      assert.ok(new URL(url).pathname.includes("/bgo/csha/"));
      return { candidates: [candidate(8014)], searchComplete: true };
    },
    buildFlightSortVariants: ({ buildUrl }: { buildUrl: (mode: string) => string }) => {
      assert.ok(new URL(buildUrl("fastest")).pathname.includes("/bgo/csha/"));
      return {};
    },
  });
  const offer = await find(meta, "BGO → SHA", "", new Map());
  assert.equal(offer?.amount, 8014);
  assert.ok(new URL(offer.productUrl).pathname.includes("/bgo/csha/"));
  assert.deepEqual(requests, [["BGO", "inputorigin", "airport"], ["SHA", "inputdestination", "city"]]);
});

test("city/airport scope separates caches and controls expansion of ambiguous airport codes", async () => {
  const city: FlightSearchMeta = { ...searches[0]!, destination: "SHA", destinationScope: "city" };
  const airport = { ...city, destinationScope: "airport" as const };
  const key = loadFunction("buildFlightSearchMetaKey", {});
  assert.notEqual(await key(city), await key(airport));
  const lookup = loadFunction("buildFlightAirportLookup", {
    uniqueStrings: (values: string[]) => [...new Set(values)],
    STATIC_FLIGHT_METROPOLITAN_AIRPORTS: {},
    fetchFlightAirportData: async () => [
      { code: "SHA", cityCode: "SHA", iataType: "airport", flightable: true },
      { code: "PVG", cityCode: "SHA", iataType: "airport", flightable: true },
    ],
  });
  assert.deepEqual((await lookup(city)).get("SHA"), ["SHA", "PVG"]);
  assert.equal((await lookup(airport)).has("SHA"), false);
});

test("PanFlights sends the resolved city ID to the search API while retaining IATA metadata", async () => {
  const meta = { ...searches[0]!, destination: "SHA", destinationScope: "city" as const };
  const payload = loadFunction("buildPanFlightsFlightSearchPayload", {
    ...flightSearch,
    splitIsoDateParts: loadFunction("splitIsoDateParts", {}),
    PANFLIGHTS_FLIGHT_HITS_LIMIT: 500,
    navigator: { userAgent: "fixture" },
  });
  let sent: Record<string, any> | undefined;
  const request = loadFunction("fetchPanFlightsFlightSearchResult", {
    buildPanFlightsFlightSearchPayload: payload,
    PANFLIGHTS_FLIGHT_SEARCH_ENDPOINTS: ["https://example.test/flights"],
    userscriptJsonRequest: async (_url: string, init: { body: string }) => {
      sent = JSON.parse(new URLSearchParams(init.body).get("data")!);
      return { flighttab: [] };
    },
    isRecord: (value: unknown) => typeof value === "object" && value !== null,
  });
  await request(meta, { sortOrder: "quality", sortRadio: "quality", version: 0, maxStops: 6, searchId: 1001 }, undefined,
    { origin: "BGO", destination: "2105" });
  assert.ok(sent);
  const serialized = JSON.stringify(sent);
  assert.ok(serialized.includes('"tolocsid":"2105"'));
  assert.ok(serialized.includes('"fromlocsid":"BGO"'));
  assert.equal(meta.destination, "SHA");
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
