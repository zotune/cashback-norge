import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyFlightSortMode,
  buildFinnFlightSearchUrl,
  buildFlightLinkFiltersValue,
  buildFlightSortUrlValue,
  buildKiwiFlightSearchUrl,
  buildGoogleFlightsSearchUrl,
  buildGoogleFlightsTfsParam,
  buildMomondoFlightSearchUrl,
  buildPanFlightsFlightSearchUrl,
  buildSkyscannerFlightSearchUrl,
  buildTripComFlightSearchUrl,
  FLIGHT_LINK_FILTERS_PARAM,
  FLIGHT_LINK_SORT_PARAM,
  type FlightSortMode,
  limitFlightCandidates,
  flightTooltipChipTexts,
  formatFlightLegRoute,
  flightLegLabel,
  flightLegPanelChipTexts,
  flightLegTooltipChipTexts,
  flightTooltipExtraTexts,
  formatFlightClockRange,
  readPanFlightsFlightLegs,
  readPanFlightsLegStopCounts,
  readFlightSortLabel,
  readKiwiBagsParam,
  readKiwiCardDate,
  readKiwiCardLeg,
  readKiwiCardLegTimeRange,
  readKiwiDetailLegRoutes,
  readKiwiDatePart,
  readKiwiSearchPath,
  readKiwiSortTabText,
  readFlightSortUrlValue,
  readPanFlightsLegMinutes,
  selectFlightSortCandidate,
  sumFlightLegMinutes,
  buildTripComBaggageFilterFlags,
  capFlightDateFlexForSeparateSearches,
  buildSkyscannerFareAttributesParam,
  buildSkyscannerSearchOptions,
  buildMomondoFlightFilterValue,
  buildMomondoPassengerDetails,
  buildMomondoPassengerPathParts,
  countFlightSeatedPassengers,
  exceedsFlightMaxDuration,
  exceedsFlightMaxStops,
  extractWideroeFlightSearchMeta,
  type FlightSearchMeta,
  isMomondoBookingOptionMatchingBaggage,
  isSkyscannerPricingOptionMatchingBaggage,
  isTripComPolicyMatchingBaggage,
  listFlightDateFlexCombinations,
  matchPanFlightsFlightSearchDates,
  normalizeFlightSearchMeta,
  readAirFranceKlmFlightSearchMeta,
  readAmadeusAirBoundsFlightSearchMeta,
  readFlightLinkFilters,
  readMomondoFlexibleDatePart,
  pollMomondoFlexibleDateOptions,
  type MomondoFlexibleDatePollState,
  readMomondoFlightFilters,
  readMomondoVisibleFlexibleDateOption,
  readMomondoPassengerPathParts,
  readPanFlightsBaggageFee,
  readPanFlightsDateFlex,
  readPanFlightsLegDurationsMinutes,
  readSkyscannerFareAttributesParam,
  readSkyscannerMaxStopsParam,
  readTripComTotalDurationRange,
  readTripComJourneyStopCount,
} from "../src/shared/flight-search.js";

const NOW = new Date("2026-11-02T12:00:00Z");

function meta(overrides: Partial<FlightSearchMeta> = {}): FlightSearchMeta {
  return { origin: "OSL", destination: "BGO", outboundDate: "2026-12-05", adults: 1, youths: 0, children: 0, infants: 0, ...overrides };
}

// Utdrag av ekte svar fra skypickersearchsingle (PVG–BGO tur/retur, hentet 2026-11-01).
function panFlightsItem(input: {
  outbound: number;
  inbound?: number;
  outboundSpecs?: string[];
  inboundSpecs?: string[];
  duration?: number;
  legduration?: number;
}): Record<string, unknown> {
  return {
    price: 7618,
    package: {
      duration: input.duration,
      legduration: input.legduration,
      routelist: [{
        dTime: input.outbound,
        tripdata: { flyFrom: "PVG", flyTo: "BGO", spec: input.outboundSpecs ?? ["PVG;HKT", "HKT;OSL", "OSL;BGO"] },
        ...(input.inbound !== undefined
          ? { drTime: input.inbound, backdata: { flyFrom: "BGO", flyTo: "PVG", spec: input.inboundSpecs ?? ["BGO;AGP", "AGP;PVG"] } }
          : {}),
      }],
    },
  };
}

test("normalizes travellers: youths count as adults, infants need a lap", () => {
  assert.deepEqual(normalizeFlightSearchMeta(meta({ adults: 1, youths: 1, children: 1, childAges: [4] }))?.adults, 2);
  assert.equal(normalizeFlightSearchMeta(meta({ adults: 1, infants: 2 })), undefined);
  // En alder utenfor barnebåndet 2–11 forkastes heller enn å gi feil barnepris.
  assert.equal(normalizeFlightSearchMeta(meta({ children: 1, childAges: [14] }))?.childAges, undefined);
  assert.equal(countFlightSeatedPassengers(meta({ adults: 2, children: 1, infants: 1 })), 3);
});

test("reads Widerøe one-way and round-trip URLs and rejects unseen traveller formats", () => {
  const oneWay = extractWideroeFlightSearchMeta(new URL("https://www.wideroe.no/en/book-flight/flight?d_city=bgo&a_city=osl&pax=adt&triptype=1&d_day=23&d_month=202612&source=widget_front_page"));
  assert.deepEqual(
    { origin: oneWay?.origin, destination: oneWay?.destination, outboundDate: oneWay?.outboundDate, inboundDate: oneWay?.inboundDate, adults: oneWay?.adults },
    { origin: "BGO", destination: "OSL", outboundDate: "2026-12-23", inboundDate: undefined, adults: 1 },
  );

  const roundTrip = extractWideroeFlightSearchMeta(new URL("https://www.wideroe.no/bestill-flybillett/flygning?d_city=osl&a_city=bgo&pax=adt&triptype=2&d_day=09&d_month=202612&r_day=23&r_month=202612&source=widget_front_page"));
  assert.equal(roundTrip?.outboundDate, "2026-12-09");
  assert.equal(roundTrip?.inboundDate, "2026-12-23");

  assert.equal(extractWideroeFlightSearchMeta(new URL("https://www.wideroe.no/bestill-flybillett/flygning?d_city=osl&a_city=bgo&pax=adt,chd&triptype=1&d_day=09&d_month=202612")), undefined);
  assert.equal(extractWideroeFlightSearchMeta(new URL("https://www.wideroe.no/bestill-flybillett/flygning?d_city=osl&a_city=bgo&pax=adt&triptype=2&d_day=09&d_month=202612")), undefined);
});

test("reads KLM search from session storage and ignores tagging from another route", () => {
  const connections = JSON.stringify([
    { departureDate: "2026-11-07", origin: { code: "SHA", type: "city" }, destination: { code: "BGO", type: "airport" } },
    { departureDate: "2026-11-14", origin: { code: "BGO", type: "airport" }, destination: { code: "SHA", type: "city" } },
  ]);
  const tagging = JSON.stringify({ flow: { z_search_cabin_code: "BUSINESS", z_origin: "SHA", z_destination: "BGO", z_nb_adults: 2, z_nb_children: 1, z_nb_infants: 0, z_nb_seniors: 1, z_nb_youth: 0 } });
  const result = readAirFranceKlmFlightSearchMeta(connections, tagging);
  assert.deepEqual(
    { route: `${result?.origin}-${result?.destination}`, dates: `${result?.outboundDate}/${result?.inboundDate}`, adults: result?.adults, children: result?.children, cabin: result?.cabinClass },
    { route: "SHA-BGO", dates: "2026-11-07/2026-11-14", adults: 3, children: 1, cabin: "business" },
  );

  const staleTagging = JSON.stringify({ flow: { z_origin: "OSL", z_destination: "AMS", z_nb_adults: 1 } });
  assert.equal(readAirFranceKlmFlightSearchMeta(connections, staleTagging), undefined);

  const openJaw = JSON.stringify([
    { departureDate: "2026-11-07", origin: { code: "SHA" }, destination: { code: "BGO" } },
    { departureDate: "2026-11-14", origin: { code: "OSL" }, destination: { code: "SHA" } },
  ]);
  assert.equal(readAirFranceKlmFlightSearchMeta(openJaw, tagging), undefined);
});

test("reads Norwegian and Lufthansa airBoundsSearch with timestamped dates", () => {
  const norwegian = readAmadeusAirBoundsFlightSearchMeta(JSON.stringify({
    ids: ["1355600600"],
    entities: { 1355600600: { itineraries: [{ originLocationCode: "OSL", destinationLocationCode: "BGO", departureDateTime: "2026-11-20T00:00:00.000", directFlights: false, originLocationType: "city" }], travelers: [{ passengerTypeCode: "ADT" }], commercialFareFamilies: ["DYSTD"] } },
    selectedAirBoundsSearchId: "1355600600",
  }));
  assert.equal(norwegian?.outboundDate, "2026-11-20");
  assert.equal(norwegian?.cabinClass, undefined);
  assert.equal(norwegian?.maxStops, undefined);

  const lufthansa = readAmadeusAirBoundsFlightSearchMeta(JSON.stringify({
    entities: { "-873613310": {
      itineraries: [
        { departureDateTime: "2026-12-09T00:00:00.000", originLocationCode: "BGO", destinationLocationCode: "SHA", directFlights: true },
        { departureDateTime: "2026-12-12T00:00:00.000", originLocationCode: "SHA", destinationLocationCode: "BGO" },
      ],
      travelers: [{ passengerTypeCode: "ADT" }, { passengerTypeCode: "CHD" }, { passengerTypeCode: "INF" }],
      cabin: "ECONOMY",
    } },
    selectedAirBoundsSearchId: "-873613310",
  }));
  assert.deepEqual(
    { dates: `${lufthansa?.outboundDate}/${lufthansa?.inboundDate}`, adults: lufthansa?.adults, children: lufthansa?.children, infants: lufthansa?.infants, cabin: lufthansa?.cabinClass, maxStops: lufthansa?.maxStops },
    { dates: "2026-12-09/2026-12-12", adults: 1, children: 1, infants: 1, cabin: "economy", maxStops: 0 },
  );

  // Ukjente passasjerkoder gir ingen treff fremfor feil antall reisende.
  assert.equal(readAmadeusAirBoundsFlightSearchMeta(JSON.stringify({
    entities: { a: { itineraries: [{ departureDateTime: "2026-12-09T00:00:00.000", originLocationCode: "BGO", destinationLocationCode: "SHA" }], travelers: [{ passengerTypeCode: "STU" }] } },
    selectedAirBoundsSearchId: "a",
  })), undefined);
});

test("parses PanFlights date windows and lists every combination nearest first", () => {
  assert.deepEqual(readPanFlightsDateFlex(["ff:3,3", "tf:2,2"], "2026-11-10", "2026-11-20"), { outboundBefore: 3, outboundAfter: 3, inboundBefore: 2, inboundAfter: 2 });
  assert.deepEqual(readPanFlightsDateFlex(["ff:0,1"], "2026-11-10"), { outboundBefore: 0, outboundAfter: 1, inboundBefore: 0, inboundAfter: 0 });
  assert.equal(readPanFlightsDateFlex(["ff:0,0"], "2026-11-10"), undefined);
  // «Tidsrom»: utreise 10.–14. nov og hjemreise 20.–22. nov.
  assert.deepEqual(readPanFlightsDateFlex(["td:20261114", "ff:manual", "ud:20261122", "tf:manual"], "2026-11-10", "2026-11-20"), { outboundBefore: 0, outboundAfter: 4, inboundBefore: 0, inboundAfter: 2 });

  const roundTrip = meta({ outboundDate: "2026-11-10", inboundDate: "2026-11-20" });
  const combinations = listFlightDateFlexCombinations(roundTrip, { outboundBefore: 3, outboundAfter: 3, inboundBefore: 3, inboundAfter: 3 }, NOW);
  assert.equal(combinations.length, 49);
  assert.deepEqual(combinations[0], { outboundDate: "2026-11-10", inboundDate: "2026-11-20" });

  // Hjemreise før utreise og datoer før i dag tas ikke med.
  const shortTrip = listFlightDateFlexCombinations(meta({ outboundDate: "2026-11-03", inboundDate: "2026-11-04" }), { outboundBefore: 3, outboundAfter: 0, inboundBefore: 3, inboundAfter: 0 }, NOW);
  assert.ok(shortTrip.every(({ outboundDate, inboundDate }) => outboundDate >= "2026-11-02" && inboundDate !== undefined && inboundDate >= outboundDate));
});

test("matches PanFlights trips inside the date window and reads stops and durations", () => {
  const roundTrip = meta({ origin: "PVG", destination: "BGO", outboundDate: "2026-11-10", inboundDate: "2026-11-20" });
  const window = { outboundBefore: 3, outboundAfter: 3, inboundBefore: 3, inboundAfter: 3 };
  // 2026-11-07 og 2026-11-19 som lokal tid uttrykt i UTC-sekunder, som i Kiwi-dataene.
  const item = panFlightsItem({ outbound: Date.UTC(2026, 10, 7, 11) / 1000, inbound: Date.UTC(2026, 10, 19, 9) / 1000, legduration: 1690 });
  assert.deepEqual(matchPanFlightsFlightSearchDates(item, roundTrip, window), { outboundDate: "2026-11-07", inboundDate: "2026-11-19" });
  assert.equal(matchPanFlightsFlightSearchDates(item, roundTrip, undefined), undefined);

  assert.deepEqual(readPanFlightsLegStopCounts(item), [2, 1]);
  assert.deepEqual(readPanFlightsLegDurationsMinutes(item, true), [1690]);
  assert.equal(exceedsFlightMaxStops({ ...roundTrip, maxStops: 1 }, readPanFlightsLegStopCounts(item)), true);
  assert.equal(exceedsFlightMaxDuration({ ...roundTrip, maxDurationMinutes: 1320 }, readPanFlightsLegDurationsMinutes(item, true)), true);
  assert.equal(exceedsFlightMaxDuration({ ...roundTrip, maxDurationMinutes: 1800 }, readPanFlightsLegDurationsMinutes(item, true)), false);
});

test("adds PanFlights bag fees per seated passenger and rejects unknown fees", () => {
  // baggage fra skypickersearchsingle: "bin" = håndbagasje, "1" = én innsjekket.
  const baggage = { 1: 287.3, 2: 795.6, bin: 361.4 };
  assert.equal(readPanFlightsBaggageFee(baggage, meta()), 0);
  assert.equal(readPanFlightsBaggageFee(baggage, meta({ includeCabinBag: true, includeCheckedBag: true })), 649);
  assert.equal(readPanFlightsBaggageFee(baggage, meta({ adults: 2, children: 1, infants: 1, includeCheckedBag: true })), 862);
  assert.equal(readPanFlightsBaggageFee({ 1: -1, bin: 0 }, meta({ includeCheckedBag: true })), undefined);
  assert.equal(readPanFlightsBaggageFee(undefined, meta({ includeCabinBag: true })), undefined);
  assert.equal(readPanFlightsBaggageFee({ unit: "pcs", amount: 1 }, meta({ includeCheckedBag: true })), 0);
});

test("builds and reads momondo passenger paths, filters and flexible dates", () => {
  const family = meta({ adults: 2, children: 1, infants: 1 });
  assert.deepEqual(buildMomondoPassengerPathParts(family), ["2adults", "children-7-1L"]);
  assert.deepEqual(buildMomondoPassengerPathParts(meta()), []);
  // Med barn må voksne oppgis som "1adults"; "1adult" får momondo til å ignorere barna.
  assert.deepEqual(buildMomondoPassengerPathParts(meta({ children: 1, childAges: [4] })), ["1adults", "children-4"]);
  assert.deepEqual(buildMomondoPassengerDetails(family), [{ ptc: "ADT" }, { ptc: "ADT" }, { ptc: "CHD", age: 7 }, { ptc: "INL" }]);
  assert.deepEqual(readMomondoPassengerPathParts(["2026-12-05", "2adults", "children-7-1L"]), { adults: 2, children: 1, infants: 1, childAges: [7] });

  assert.equal(buildMomondoFlightFilterValue(meta({ maxStops: 1, includeCabinBag: true, includeCheckedBag: true, maxDurationMinutes: 1320 })), "stops=0,1;bfc=1;cfc=1;legdur=-1320");
  assert.deepEqual(
    readMomondoFlightFilters(new URL("https://www.momondo.no/flight-search/OSL-BGO/2026-12-05?fs=stops%3D0%2C1%3Bbfc%3D1%3Bcfc%3D1%3Blegdur%3D-1320")),
    { maxStops: 1, includeCabinBag: true, includeCheckedBag: true, maxDurationMinutes: 1320 },
  );
  assert.deepEqual(readMomondoFlexibleDatePart("2026-11-10-flexible-3days"), ["2026-11-10", 3]);
  assert.deepEqual(readMomondoFlexibleDatePart("2026-11-10"), ["2026-11-10", 0]);
});

type FlexibleDatePrice = { outboundDate: string; inboundDate?: string; amount: number };

// Offentlig resultatkort på BGO–FOR ±3 dager, 2026-11-02. Kalenderprisen
// alene brukes ikke: kortet dokumenterer 6.12., ruten og selvbetjent transfer.
const visibleMomondoResult = {
  priceText: "3\u00a0799\u00a0kr", currency: "NOK",
  legs: [{ dateText: "6.12.", origin: "BGO", destination: "FOR", durationText: "40t 20m", stopsText: "3 stopp" }],
};

test("momondo visible flexible fares belong to the result's date, not the selected date", () => {
  const flight = meta({ origin: "BGO", destination: "FOR", outboundDate: "2026-12-09" });
  const combinations = listFlightDateFlexCombinations(flight, { outboundBefore: 3, outboundAfter: 3, inboundBefore: 0, inboundAfter: 0 }, NOW);
  assert.deepEqual(readMomondoVisibleFlexibleDateOption(visibleMomondoResult, flight, combinations), {
    outboundDate: "2026-12-06", amount: 3799, currency: "NOK", legs: [{ durationMinutes: 2420, stopCount: 3 }],
  });
  assert.equal(readMomondoVisibleFlexibleDateOption(visibleMomondoResult, { ...flight, maxStops: 2 }, combinations), undefined);
  assert.equal(readMomondoVisibleFlexibleDateOption(visibleMomondoResult, { ...flight, maxDurationMinutes: 2400 }, combinations), undefined);
  for (const leg of [
    { ...visibleMomondoResult.legs[0]!, dateText: undefined },
    { ...visibleMomondoResult.legs[0]!, dateText: "5.12." },
    { ...visibleMomondoResult.legs[0]!, origin: "OSL" },
    { ...visibleMomondoResult.legs[0]!, durationText: undefined },
    { ...visibleMomondoResult.legs[0]!, stopsText: undefined },
  ]) assert.equal(readMomondoVisibleFlexibleDateOption({ ...visibleMomondoResult, legs: [leg] }, flight, combinations), undefined);
  for (const price of [
    { priceText: undefined, currency: "NOK" }, { priceText: "0 kr", currency: "NOK" },
    { priceText: "3 799", currency: "NOK" }, { priceText: "3 799 kr", currency: undefined },
    { priceText: "3 799 kr", currency: "SEK" }, { priceText: "fra 3 799 kr", currency: "NOK" },
  ]) assert.equal(readMomondoVisibleFlexibleDateOption({ ...visibleMomondoResult, ...price }, flight, combinations), undefined);
});

test("momondo visible round trips require both dates and both airport pairs", () => {
  const flight = meta({ origin: "BGO", destination: "FOR", outboundDate: "2026-12-09", inboundDate: "2026-12-19" });
  const combinations = listFlightDateFlexCombinations(flight, { outboundBefore: 3, outboundAfter: 3, inboundBefore: 3, inboundAfter: 3 }, NOW);
  const inbound = { dateText: "20.12.", origin: "FOR", destination: "BGO", durationText: "16t", stopsText: "1 stopp" };
  const input = { ...visibleMomondoResult, legs: [...visibleMomondoResult.legs, inbound] };
  assert.equal(readMomondoVisibleFlexibleDateOption(visibleMomondoResult, flight, combinations), undefined);
  assert.equal(readMomondoVisibleFlexibleDateOption(input, flight, combinations)?.inboundDate, "2026-12-20");
  assert.equal(readMomondoVisibleFlexibleDateOption({ ...input, legs: [visibleMomondoResult.legs[0]!, { ...inbound, destination: "OSL" }] }, flight, combinations), undefined);
});

function momondoFlexPollFixture(responses: unknown[]) {
  const state: MomondoFlexibleDatePollState<FlexibleDatePrice> = { options: [], complete: false };
  const requests: Array<{ searchId: string | undefined; filterState: string | undefined }> = [];
  const waits: number[] = [];
  const poll = (attempts: number) => pollMomondoFlexibleDateOptions(state, {
    requestResults: async (searchId, filterState) => {
      requests.push({ searchId, filterState });
      return responses.shift();
    },
    readOptions: (result) => result.results as FlexibleDatePrice[],
    readFilterState: (result) => typeof result.airportFilter === "string" ? result.airportFilter : undefined,
    wait: async (milliseconds) => { waits.push(milliseconds); },
    attempts,
    intervalMs: 1100,
  });
  return { state, requests, waits, poll };
}

test("momondo flexible dates wait for completion beyond a stable selected-date price", async () => {
  const selected = { outboundDate: "2026-12-09", amount: 9214 };
  const cheaper = { outboundDate: "2026-12-07", amount: 3799 };
  const fixture = momondoFlexPollFixture([
    { searchId: "fixture-search", status: "pending", isTopResultsRankingStable: true, results: [selected] },
    { searchId: "fixture-search", status: "pending", results: [] },
    { searchId: "fixture-search", status: "pending", results: [selected] },
    { searchId: "fixture-search", status: "complete", results: [cheaper, selected] },
  ]);
  await fixture.poll(7);
  assert.equal(fixture.requests.length, 4);
  assert.deepEqual(fixture.requests.map((request) => request.searchId), [undefined, "fixture-search", "fixture-search", "fixture-search"]);
  assert.equal(fixture.state.complete, true);
  assert.deepEqual(fixture.state.options, [cheaper, selected]);
});

test("momondo flexible dates resume an empty initial search with the same search ID", async () => {
  const fixture = momondoFlexPollFixture([
    { searchId: "fixture-search", status: "pending", results: [] },
    undefined,
    { searchId: "fixture-search", status: "complete", results: [{ outboundDate: "2026-12-07", amount: 3799 }] },
  ]);
  await fixture.poll(2);
  assert.equal(fixture.state.complete, false);
  assert.deepEqual(fixture.state.options, []);
  assert.equal(fixture.requests.length, 2);
  await fixture.poll(1);
  assert.equal(fixture.requests[2]?.searchId, "fixture-search");
  assert.equal(fixture.state.options[0]?.amount, 3799);
  assert.equal(fixture.state.complete, true);
  await fixture.poll(7);
  assert.equal(fixture.requests.length, 3);
});

test("momondo keeps flexible date combinations through partial or malformed polls", async () => {
  const first = { outboundDate: "2026-12-07", inboundDate: "2026-12-14", amount: 4000 };
  const second = { outboundDate: "2026-12-07", inboundDate: "2026-12-15", amount: 5000 };
  const fixture = momondoFlexPollFixture([
    { searchId: "fixture-search", status: "pending", results: [first] },
    { error: "temporary upstream error" },
    { status: "pending", results: [] },
    { status: "pending", results: [{ ...first, amount: 6000 }, second] },
  ]);
  await fixture.poll(4);
  assert.equal(fixture.state.complete, false);
  assert.deepEqual(fixture.state.options, [first, second]);
  assert.deepEqual(fixture.waits, [1100, 1100, 1100]);
});

test("momondo applies airport exclusions before accepting a complete flexible result", async () => {
  const fixture = momondoFlexPollFixture([
    { searchId: "fixture-search", status: "complete", airportFilter: "airports=-TRF", results: [{ outboundDate: "2026-12-07", amount: 1000 }] },
    { searchId: "fixture-search", status: "complete", results: [{ outboundDate: "2026-12-07", amount: 4000 }] },
  ]);
  await fixture.poll(7);
  assert.deepEqual(fixture.requests, [
    { searchId: undefined, filterState: undefined },
    { searchId: "fixture-search", filterState: "airports=-TRF" },
  ]);
  assert.equal(fixture.state.options[0]?.amount, 4000);
  assert.equal(fixture.state.complete, true);
});

test("momondo final results replace stale fares and can confirm no available dates", async () => {
  const fixture = momondoFlexPollFixture([
    { searchId: "fixture-search", status: "pending", results: [{ outboundDate: "2026-12-07", amount: 3799 }] },
    { searchId: "fixture-search", status: "complete", results: [{ outboundDate: "2026-12-07", amount: 4100 }] },
  ]);
  await fixture.poll(2);
  assert.equal(fixture.state.options[0]?.amount, 4100);

  const empty = momondoFlexPollFixture([
    { searchId: "fixture-search", status: "pending", results: [{ outboundDate: "2026-12-07", amount: 3799 }] },
    { searchId: "fixture-search", status: "complete", results: [] },
  ]);
  await empty.poll(2);
  assert.deepEqual(empty.state.options, []);
  assert.equal(empty.state.complete, true);
});

test("momondo discards earlier unfiltered date prices when airport filters arrive later", async () => {
  const fixture = momondoFlexPollFixture([
    { searchId: "fixture-search", status: "pending", results: [{ outboundDate: "2026-12-07", amount: 1000 }] },
    { searchId: "fixture-search", status: "pending", airportFilter: "airports=-TRF", results: [] },
    { searchId: "fixture-search", status: "pending", results: [{ outboundDate: "2026-12-07", amount: 4000 }] },
  ]);
  await fixture.poll(3);
  assert.equal(fixture.requests[2]?.filterState, "airports=-TRF");
  assert.equal(fixture.state.options[0]?.amount, 4000);
  assert.equal(fixture.state.complete, false);
});

test("requires bags confirmed included at momondo and Trip.com", () => {
  const bags = meta({ includeCabinBag: true, includeCheckedBag: true });
  // momondo med bfc/cfc: avgiften er med i prisen og status er INCLUDED, også med gebyrtekst.
  const feeIncluded = { fees: { carryOnBagData: { status: "INCLUDED" }, checkedBagData: { status: "INCLUDED" }, checkedBagDisplay: "144 kr" } };
  const unknownChecked = { fees: { carryOnBagData: { status: "INCLUDED" }, checkedBagData: { status: "UNKNOWN" } } };
  const textOnly = { fees: { carryOnDisplay: "Inkludert", checkedBagDisplay: "Ukjent" } };
  assert.equal(isMomondoBookingOptionMatchingBaggage(feeIncluded, bags), true);
  assert.equal(isMomondoBookingOptionMatchingBaggage(unknownChecked, bags), false);
  assert.equal(isMomondoBookingOptionMatchingBaggage(textOnly, bags), false);
  assert.equal(isMomondoBookingOptionMatchingBaggage(textOnly, meta()), true);

  // Trip.com: policyFlags fra FlightListSearchSSE.
  assert.equal(isTripComPolicyMatchingBaggage({ policyFlags: ["FREE_CARRY_ON_BAGGAGE", "FREE_CHECKED_BAGGAGE", "ECONOMY"] }, bags), true);
  assert.equal(isTripComPolicyMatchingBaggage({ policyFlags: ["FREE_CARRY_ON_BAGGAGE", "LCC"] }, bags), false);
  assert.equal(isTripComPolicyMatchingBaggage({ policyFlags: [] }, meta()), true);
});

test("round-trips link filters for sites that tick filters on open", () => {
  const filtered = meta({ maxStops: 1, includeCabinBag: true, includeCheckedBag: true });
  const value = buildFlightLinkFiltersValue(filtered);
  assert.equal(value, "stops:1,cabin,checked");
  assert.deepEqual(readFlightLinkFilters(new URL(`https://us.trip.com/flights/showfarefirst?cbvFilters=${encodeURIComponent(value ?? "")}`)), {
    maxStops: 1,
    includeCabinBag: true,
    includeCheckedBag: true,
  });
  assert.equal(buildFlightLinkFiltersValue(meta()), undefined);
});

test("counts Trip.com intermediate stops on the same flight number", () => {
  const section = (stops: number) => ({ flightInfo: { stopList: Array.from({ length: stops }, () => ({ airportCode: "ARN" })) } });
  // HO1607 PVG-HEL + AY817 HEL-ARN-BGO: ett flybytte og én mellomlanding.
  assert.equal(readTripComJourneyStopCount({ transSectionList: [section(0), section(1)] }), 2);
  assert.equal(readTripComJourneyStopCount({ transSectionList: [section(0), section(0)] }), 1);
  assert.equal(readTripComJourneyStopCount({ transSectionList: [section(0)] }), 0);
  assert.equal(readTripComJourneyStopCount({ transSectionList: [{}] }), 0);
  assert.equal(readTripComJourneyStopCount({}), 0);
});

test("requests and reads Skyscanner baggage per pricing option", () => {
  const bags = meta({ includeCabinBag: true, includeCheckedBag: true });
  const cabin = meta({ includeCabinBag: true });
  const option = (cabinAssessment: string, checkedAssessment: string, checkedFee = 0) => ({
    fareAttributes: {
      cabinBaggage: { assessment: cabinAssessment, pieces: 1, fee: { currencyCode: "NOK", amount: 0, unit: "UNIT_MICRO" } },
      checkedBaggage: { assessment: checkedAssessment, pieces: 1, fee: { currencyCode: "NOK", amount: checkedFee, unit: "UNIT_MICRO" } },
    },
  });

  assert.deepEqual(buildSkyscannerSearchOptions(bags), { fareAttributes: { selectedFareAttributes: ["CABIN_BAG", "CHECKED_BAG"] } });
  assert.deepEqual(buildSkyscannerSearchOptions(cabin), { fareAttributes: { selectedFareAttributes: ["CABIN_BAG"] } });
  assert.equal(buildSkyscannerSearchOptions(meta()), undefined);

  assert.equal(buildSkyscannerFareAttributesParam(bags), "cabin-bag,checked-bag");
  assert.equal(buildSkyscannerFareAttributesParam(meta()), undefined);
  assert.deepEqual(readSkyscannerFareAttributesParam("cabin-bag,checked-bag"), { includeCabinBag: true, includeCheckedBag: true });
  assert.deepEqual(readSkyscannerFareAttributesParam("checked-bag"), { includeCheckedBag: true });
  assert.deepEqual(readSkyscannerFareAttributesParam(null), {});

  assert.equal(isSkyscannerPricingOptionMatchingBaggage(option("INCLUDED", "INCLUDED"), bags), true);
  // Gebyret er lagt inn i prisen når bagasjen er INCLUDED med fee.amount over 0.
  assert.equal(isSkyscannerPricingOptionMatchingBaggage(option("INCLUDED", "INCLUDED", 1_210_000_000), bags), true);
  assert.equal(isSkyscannerPricingOptionMatchingBaggage(option("INCLUDED", "FEE", 1_210_000_000), bags), false);
  assert.equal(isSkyscannerPricingOptionMatchingBaggage(option("INCLUDED", "FEE", 1_210_000_000), cabin), true);
  assert.equal(isSkyscannerPricingOptionMatchingBaggage(option("UNKNOWN", "INCLUDED"), bags), false);
  assert.equal(isSkyscannerPricingOptionMatchingBaggage({ fareAttributes: {} }, bags), false);
  assert.equal(isSkyscannerPricingOptionMatchingBaggage({ fareAttributes: {} }, meta()), true);
});

test("carries max travel time in link filters", () => {
  const filtered = meta({ maxStops: 1, includeCabinBag: true, maxDurationMinutes: 1500 });
  const value = buildFlightLinkFiltersValue(filtered);
  assert.equal(value, "stops:1,cabin,dur:1500");
  assert.deepEqual(readFlightLinkFilters(new URL(`https://panflights.no/nb/oneway/?cbvFilters=${encodeURIComponent(value ?? "")}`)), {
    maxStops: 1,
    includeCabinBag: true,
    maxDurationMinutes: 1500,
  });
  assert.deepEqual(readFlightLinkFilters(new URL("https://us.trip.com/flights/showfarefirst?cbvFilters=none")), {});
});

test("asks Trip.com for fares with the selected baggage", () => {
  assert.deepEqual(buildTripComBaggageFilterFlags(meta()), []);
  assert.deepEqual(buildTripComBaggageFilterFlags(meta({ includeCabinBag: true, includeCheckedBag: true })), [
    { flag: "FreeCarryOnBaggage", allow: true, journeyNoList: [1] },
    { flag: "FreeCheckedBaggage", allow: true, journeyNoList: [1] },
  ]);
  assert.deepEqual(buildTripComBaggageFilterFlags(meta({ includeCheckedBag: true })), [
    { flag: "FreeCheckedBaggage", allow: true, journeyNoList: [1] },
  ]);
});

test("reads Trip.com duration labels and Skyscanner stop filters", () => {
  assert.deepEqual(readTripComTotalDurationRange("Duration Stopover 0m 24h Total 16h 30m 46h 30m"), { minMinutes: 990, maxMinutes: 2790 });
  assert.deepEqual(readTripComTotalDurationRange("Total 16h 30m–30h"), { minMinutes: 990, maxMinutes: 1800 });
  assert.equal(readTripComTotalDurationRange("Carry-on baggage"), undefined);

  assert.equal(readSkyscannerMaxStopsParam("!twoPlusStops"), 1);
  assert.equal(readSkyscannerMaxStopsParam("!oneStop,!twoPlusStops"), 0);
  assert.equal(readSkyscannerMaxStopsParam(null), undefined);
});

const SORT_MODES: FlightSortMode[] = ["best", "cheapest", "fastest"];
const SORT_CANDIDATES = [
  { id: "best", amount: 200, durationMinutes: 400 },
  { id: "cheap", amount: 100, durationMinutes: 900 },
  { id: "fast", amount: 300, durationMinutes: 300 },
  { id: "fastDear", amount: 500, durationMinutes: 300 },
  { id: "unknown", amount: 90 },
];

test("selects best, cheapest and fastest candidate", () => {
  assert.equal(selectFlightSortCandidate(SORT_CANDIDATES, "best")?.id, "best");
  assert.equal(selectFlightSortCandidate(SORT_CANDIDATES, "cheapest")?.id, "unknown");
  assert.equal(selectFlightSortCandidate(SORT_CANDIDATES, "fastest")?.id, "fast");
  assert.equal(selectFlightSortCandidate([{ amount: 1 }], "fastest"), undefined);
  // Raskest skal ikke velge en reise til mange ganger prisen.
  assert.equal(selectFlightSortCandidate([{ id: "normal", amount: 15000, durationMinutes: 1000 }, { id: "absurd", amount: 233000, durationMinutes: 900 }], "fastest")?.id, "normal");
  for (const mode of SORT_MODES) assert.equal(selectFlightSortCandidate([], mode), undefined);

  const manyRows = [...Array.from({ length: 12 }, (_, index) => ({ id: `row${index}`, amount: 1000 + index, durationMinutes: 1000 + index })), ...SORT_CANDIDATES];
  const limited = limitFlightCandidates(manyRows, 10);
  assert.deepEqual(limited.slice(0, 10), manyRows.slice(0, 10));
  assert.deepEqual(limited.slice(10).map((candidate) => candidate.id), ["unknown", "fast"]);
  assert.equal(limitFlightCandidates(SORT_CANDIDATES, 10).length, SORT_CANDIDATES.length);
});

test("sums travel time only when every leg is known", () => {
  assert.equal(sumFlightLegMinutes([100, 200]), 300);
  assert.equal(sumFlightLegMinutes([100, undefined]), undefined);
  assert.equal(sumFlightLegMinutes([]), undefined);
  assert.equal(sumFlightLegMinutes([100], 2), undefined);
  assert.deepEqual(readPanFlightsLegMinutes({ package: { routelist: [{ fly_duration_secs: 3600, return_duration_secs: 7200 }] } }, true), [60, 120]);
  assert.deepEqual(readPanFlightsLegMinutes({ package: { routelist: [{ fly_duration_secs: 3600 }] } }, false), [60]);
  assert.deepEqual(readPanFlightsLegMinutes({}, true), [undefined, undefined]);
});

test("switches rows without losing sources", () => {
  const variant = (amount: number, durationMinutes?: number) => ({
    shopName: `shop${amount}`,
    price: `${amount} kr`,
    amount,
    sortAmount: amount,
    currency: "NOK",
    productUrl: `https://example.test/${amount}`,
    ...(durationMinutes !== undefined ? { durationMinutes, durationText: `${durationMinutes} min` } : {}),
  });
  const offers = [
    { source: "a", ...variant(300, 500), flightSortVariants: { cheapest: variant(250, 900), fastest: variant(400, 200) } },
    { source: "b", ...variant(350, 450), flightSortVariants: { cheapest: variant(200), fastest: variant(600, 300) } },
    { source: "noVariant", ...variant(100, 700) },
    { source: "google", ...variant(1), sortAmount: Number.MAX_SAFE_INTEGER, durationText: undefined },
  ];
  assert.equal(applyFlightSortMode(offers, "best"), offers);

  const cheapest = applyFlightSortMode(offers, "cheapest");
  assert.deepEqual(cheapest.map((offer) => offer.source), ["noVariant", "b", "a", "google"]);
  assert.equal(cheapest.find((offer) => offer.source === "b")?.durationText, undefined);

  const fastest = applyFlightSortMode(offers, "fastest");
  assert.deepEqual(fastest.map((offer) => offer.source), ["a", "b", "noVariant", "google"]);
  assert.equal(fastest[0]?.productUrl, "https://example.test/400");
  for (const mode of SORT_MODES) assert.equal(applyFlightSortMode(offers, mode).length, offers.length);
  const hotels = [{ amount: 2 }, { amount: 1 }];
  assert.equal(applyFlightSortMode(hotels, "fastest"), hotels);
});

test("maps sort values in both directions", () => {
  for (const source of ["finn", "momondo", "panflights"] as const) {
    for (const mode of SORT_MODES) assert.equal(readFlightSortUrlValue(source, buildFlightSortUrlValue(source, mode)), mode);
    assert.equal(readFlightSortUrlValue(source, "ukjent"), undefined);
    assert.equal(readFlightSortUrlValue(source, null), undefined);
  }
  assert.equal(readFlightSortLabel("sortert etter beste"), "best");
  assert.equal(readFlightSortLabel("sortert etter «Rimeligste»"), "cheapest");
  assert.equal(readFlightSortLabel("sortert etter «Raskeste»"), "fastest");
  assert.equal(readFlightSortLabel("Recommended"), "best");
  assert.equal(readFlightSortLabel("Cheapest"), "cheapest");
  assert.equal(readFlightSortLabel(undefined), undefined);
});

function decodeProtoFields(bytes: number[]): Array<[number, number | number[]]> {
  const fields: Array<[number, number | number[]]> = [];
  let index = 0;
  const varint = (): number => {
    let value = 0;
    let shift = 0;
    for (;;) {
      const byte = bytes[index++] ?? 0;
      value += (byte & 0x7f) * 2 ** shift;
      shift += 7;
      if ((byte & 0x80) === 0) return value;
    }
  };
  while (index < bytes.length) {
    const tag = varint();
    if ((tag & 7) === 0) {
      fields.push([tag >> 3, varint()]);
    } else {
      const length = varint();
      fields.push([tag >> 3, bytes.slice(index, index + length)]);
      index += length;
    }
  }
  return fields;
}

test("every link keeps every search choice", () => {
  const passengerSets = [
    { adults: 1, children: 0, infants: 0 },
    { adults: 2, children: 1, infants: 0, childAges: [8] },
    { adults: 2, children: 2, infants: 1, childAges: [4, 11] },
  ];
  const inbounds = [undefined, "2026-12-14"];
  const stops = [undefined, 0, 1, 2];
  const durations = [undefined, 1500];
  let combinations = 0;
  for (const passengers of passengerSets) for (const inboundDate of inbounds) for (const maxStops of stops) for (const maxDurationMinutes of durations)
    for (const includeCabinBag of [false, true]) for (const includeCheckedBag of [false, true]) for (const mode of SORT_MODES) {
      combinations += 1;
      const flight = meta({
        ...passengers,
        ...(inboundDate !== undefined ? { inboundDate } : {}),
        ...(maxStops !== undefined ? { maxStops } : {}),
        ...(maxDurationMinutes !== undefined ? { maxDurationMinutes } : {}),
        ...(includeCabinBag ? { includeCabinBag } : {}),
        ...(includeCheckedBag ? { includeCheckedBag } : {}),
      });
      const label = JSON.stringify({ passengers, inboundDate, maxStops, maxDurationMinutes, includeCabinBag, includeCheckedBag, mode });
      const ages = [...(passengers.childAges ?? []), ...Array.from({ length: passengers.infants }, () => 1)];

      const skyscanner = new URL(buildSkyscannerFlightSearchUrl(flight, mode)).searchParams;
      assert.equal(skyscanner.get("adults"), String(passengers.adults), label);
      assert.equal(skyscanner.get("childrenv2"), ages.join("|"), label);
      assert.equal(skyscanner.get("rtn"), inboundDate !== undefined ? "1" : "0", label);
      assert.equal(skyscanner.get("stops"), maxStops === 0 ? "!oneStop,!twoPlusStops" : maxStops === 1 ? "!twoPlusStops" : null, label);
      assert.equal(skyscanner.get("fare-attributes"), [includeCabinBag ? "cabin-bag" : "", includeCheckedBag ? "checked-bag" : ""].filter(Boolean).join(",") || null, label);
      assert.equal(skyscanner.get("duration"), maxDurationMinutes !== undefined ? String(maxDurationMinutes) : null, label);
      assert.equal(skyscanner.get(FLIGHT_LINK_SORT_PARAM), mode === "best" ? null : mode, label);

      const finn = new URL(buildFinnFlightSearchUrl(flight)).searchParams;
      assert.equal(finn.get("adults"), String(passengers.adults), label);
      assert.equal(finn.get("children"), passengers.children > 0 ? String(passengers.children) : null, label);
      assert.equal(finn.get("infants"), passengers.infants > 0 ? String(passengers.infants) : null, label);
      assert.equal(finn.get("requestedReturnDate"), inboundDate ?? null, label);
      assert.equal(finn.get("handLuggage"), includeCabinBag ? "true" : null, label);
      assert.equal(finn.get("checkedLuggage"), includeCheckedBag ? "true" : null, label);
      assert.equal(finn.get("maximumNumberOfStops"), maxStops !== undefined ? String(maxStops) : null, label);
      assert.equal(finn.get("durationTo"), maxDurationMinutes !== undefined ? String(maxDurationMinutes) : null, label);

      const kiwi = new URL(buildKiwiFlightSearchUrl(flight, mode));
      const kiwiBag = `${includeCabinBag ? 1 : 0}.${includeCheckedBag ? 1 : 0}`;
      assert.equal(kiwi.pathname, `/no/search/results/OSL/BGO/${flight.outboundDate}/${inboundDate ?? "no-return"}`, label);
      assert.equal(kiwi.searchParams.get("adults"), String(passengers.adults), label);
      assert.equal(kiwi.searchParams.get("children"), String(passengers.children), label);
      assert.equal(kiwi.searchParams.get("infants"), String(passengers.infants), label);
      assert.equal(kiwi.searchParams.get("sortBy"), mode === "best" ? null : buildFlightSortUrlValue("kiwi", mode), label);
      assert.equal(kiwi.searchParams.get("stopNumber"), maxStops !== undefined ? `${maxStops}~true` : null, label);
      assert.equal(kiwi.searchParams.get("flightDurationMax"), maxDurationMinutes !== undefined ? String(maxDurationMinutes / 60) : null, label);
      assert.equal(
        kiwi.searchParams.get("bags"),
        includeCabinBag || includeCheckedBag
          ? [Array(passengers.adults).fill(kiwiBag).join("_"), ...(passengers.children > 0 ? [Array(passengers.children).fill(kiwiBag).join("_")] : [])].join("-")
          : null,
        label,
      );

      const momondo = new URL(buildMomondoFlightSearchUrl(flight, mode));
      const momondoFilters = momondo.searchParams.get("fs") ?? "";
      assert.equal(momondo.searchParams.get("sort"), buildFlightSortUrlValue("momondo", mode), label);
      assert.equal(momondo.pathname.includes(`/${passengers.adults}adults`), passengers.adults > 1 || passengers.children + passengers.infants > 0, label);
      assert.equal(momondo.pathname.includes("children-"), passengers.children + passengers.infants > 0, label);
      assert.equal(momondoFilters.includes("bfc=1"), includeCabinBag, label);
      assert.equal(momondoFilters.includes("cfc=1"), includeCheckedBag, label);
      assert.equal(momondoFilters.includes("legdur=-1500"), maxDurationMinutes !== undefined, label);
      assert.equal(momondoFilters.includes("stops="), maxStops === 0 || maxStops === 1, label);

      const panflights = new URL(buildPanFlightsFlightSearchUrl(flight, mode));
      assert.equal(panflights.searchParams.get("order"), buildFlightSortUrlValue("panflights", mode), label);
      assert.equal(panflights.searchParams.get("pad"), String(passengers.adults), label);
      assert.equal(panflights.searchParams.get("pch"), passengers.children > 0 ? String(passengers.children) : null, label);
      assert.equal(panflights.searchParams.get("pin"), passengers.infants > 0 ? String(passengers.infants) : null, label);
      assert.deepEqual(readFlightLinkFilters(panflights) ?? {}, {
        ...(maxStops !== undefined ? { maxStops } : {}),
        ...(includeCabinBag ? { includeCabinBag } : {}),
        ...(includeCheckedBag ? { includeCheckedBag } : {}),
        ...(maxDurationMinutes !== undefined ? { maxDurationMinutes } : {}),
      }, label);

      const trip = new URL(buildTripComFlightSearchUrl(flight, mode));
      assert.equal(trip.searchParams.get("quantity"), String(passengers.adults), label);
      assert.equal(trip.searchParams.get("childqty"), passengers.children > 0 ? String(passengers.children) : null, label);
      assert.equal(trip.searchParams.get("babyqty"), passengers.infants > 0 ? String(passengers.infants) : null, label);
      assert.equal(trip.searchParams.get("triptype"), inboundDate !== undefined ? "rt" : "ow", label);
      assert.equal(trip.searchParams.get("nonstoponly"), maxStops === 0 ? "on" : "off", label);
      assert.equal(trip.searchParams.get(FLIGHT_LINK_SORT_PARAM), mode === "best" ? null : mode, label);
      assert.ok(trip.searchParams.has(FLIGHT_LINK_FILTERS_PARAM), label);
      assert.deepEqual(readFlightLinkFilters(trip), {
        ...(maxStops !== undefined ? { maxStops } : {}),
        ...(includeCabinBag ? { includeCabinBag } : {}),
        ...(includeCheckedBag ? { includeCheckedBag } : {}),
        ...(maxDurationMinutes !== undefined ? { maxDurationMinutes } : {}),
      }, label);

      const google = decodeProtoFields([...Buffer.from(buildGoogleFlightsTfsParam(flight), "base64url")]);
      assert.deepEqual(google.filter(([field]) => field === 8).map(([, value]) => value), [
        ...Array.from({ length: passengers.adults }, () => 1),
        ...Array.from({ length: passengers.children }, () => 2),
        ...Array.from({ length: passengers.infants }, () => 4),
      ], label);
      const legs = google.filter(([field]) => field === 3).map(([, value]) => decodeProtoFields(value as number[]));
      assert.equal(legs.length, inboundDate !== undefined ? 2 : 1, label);
      for (const leg of legs) {
        assert.equal(leg.find(([field]) => field === 5)?.[1], maxStops, label);
        assert.equal(leg.find(([field]) => field === 12)?.[1], maxDurationMinutes, label);
      }
      const bags = google.find(([field]) => field === 13)?.[1] as number[] | undefined;
      assert.equal(bags !== undefined, includeCabinBag || includeCheckedBag, label);
      if (bags !== undefined) {
        const bagFields = decodeProtoFields(bags);
        assert.equal(bagFields.find(([field]) => field === 2)?.[1], includeCabinBag ? passengers.adults + passengers.children : 0, label);
        assert.equal(bagFields.find(([field]) => field === 3)?.[1], includeCheckedBag ? passengers.adults + passengers.children : 0, label);
      }
    }
  assert.equal(combinations, 3 * 2 * 4 * 2 * 2 * 2 * 3);
});

test("keeps separate date searches to a handful per source", () => {
  const wide = { outboundBefore: 14, outboundAfter: 14, inboundBefore: 14, inboundAfter: 14 };
  const oneWay = capFlightDateFlexForSeparateSearches(wide, false);
  assert.deepEqual(oneWay, { outboundBefore: 3, outboundAfter: 3, inboundBefore: 3, inboundAfter: 3 });
  assert.equal(listFlightDateFlexCombinations(meta({ outboundDate: "2026-12-05" }), oneWay, NOW).length, 7);
  const roundTrip = capFlightDateFlexForSeparateSearches(wide, true);
  assert.equal(listFlightDateFlexCombinations(meta({ outboundDate: "2026-12-05", inboundDate: "2026-12-20" }), roundTrip, NOW).length, 9);
  assert.deepEqual(capFlightDateFlexForSeparateSearches({ outboundBefore: 0, outboundAfter: 1, inboundBefore: 0, inboundAfter: 0 }, false), {
    outboundBefore: 0, outboundAfter: 1, inboundBefore: 0, inboundAfter: 0,
  });
});

test("Kiwi links keep cabin, date window and readable search paths", () => {
  const url = new URL(buildKiwiFlightSearchUrl(meta({
    inboundDate: "2026-12-14",
    cabinClass: "business",
    dateFlex: { outboundBefore: 3, outboundAfter: 3, inboundBefore: 3, inboundAfter: 3 },
    maxDurationMinutes: 1530,
  })));
  assert.equal(url.searchParams.get("cabinClass"), "BUSINESS-false");
  assert.equal(url.searchParams.get("flightDurationMax"), "25");
  assert.deepEqual(readKiwiSearchPath(url), {
    origin: "OSL",
    destination: "BGO",
    outbound: "2026-12-02_2026-12-08",
    inbound: "2026-12-11_2026-12-17",
  });
  assert.deepEqual(readKiwiDatePart("2026-12-11_2026-12-17"), { date: "2026-12-14", flexDays: 3 });
  assert.deepEqual(readKiwiDatePart("2026-12-14"), { date: "2026-12-14", flexDays: 0 });
  assert.equal(readKiwiDatePart("no-return"), undefined);
  assert.deepEqual(readKiwiBagsParam("1.0_1.0-0.0"), { includeCabinBag: true });
  assert.deepEqual(readKiwiBagsParam("0.1"), { includeCheckedBag: true });
  assert.deepEqual(readKiwiBagsParam(null), {});
  assert.equal(new URL(buildKiwiFlightSearchUrl(meta({ maxStops: 3 }))).searchParams.get("stopNumber"), null);
  assert.deepEqual(
    readKiwiSearchPath(new URL("https://www.kiwi.com/no/search/results/oslo-norge/shanghai-kina/2026-12-01/no-return/")),
    { origin: "oslo-norge", destination: "shanghai-kina", outbound: "2026-12-01" },
  );
  assert.equal(readKiwiSearchPath(new URL("https://www.kiwi.no/no/search/results/a/b/2026-12-01")), undefined);
  assert.equal(readFlightSortUrlValue("kiwi", "duration"), "fastest");
});

test("Kiwi's sort tabs give price and duration", () => {
  assert.deepEqual(readKiwiSortTabText("Beste\nkr 5750 · 27h 15m"), { amount: 5750, durationMinutes: 1635 });
  assert.deepEqual(readKiwiSortTabText("Kortest kr 11\u00a0732 · 15h 35m"), { amount: 11732, durationMinutes: 935 });
  assert.deepEqual(readKiwiSortTabText("Billigst kr 5073 · 54h"), { amount: 5073, durationMinutes: 3240 });
  assert.equal(readKiwiSortTabText("Andre alternativer Tidligste avreise"), undefined);
  assert.equal(readKiwiSortTabText("Beste"), undefined);
  assert.equal(readKiwiSortTabText(undefined), undefined);
});

test("Kiwi's card dates get the year nearest the search", () => {
  assert.equal(readKiwiCardDate("man. 18. jan. • Utgående", "2027-01-14"), "2027-01-18");
  assert.equal(readKiwiCardDate("søn. 3. jan.", "2026-12-30"), "2027-01-03");
  assert.equal(readKiwiCardDate("tir. 29. des.", "2027-01-02"), "2026-12-29");
  assert.equal(readKiwiCardDate("Utgående", "2027-01-14"), undefined);
  assert.equal(readKiwiCardDate(undefined, "2027-01-14"), undefined);
});

test("Google links keep the sort as Google's own tfu value", () => {
  const read = (mode?: FlightSortMode): string | null => new URL(buildGoogleFlightsSearchUrl(meta(), mode)).searchParams.get("tfu");
  assert.equal(read(), null);
  assert.equal(read("best"), null);
  assert.equal(read("cheapest"), "EgoIARAAGAAgAigB");
  assert.equal(read("fastest"), "EgYIBRAAGAA");
});

test("Kiwi's cards give duration and stops per leg", () => {
  assert.deepEqual(readKiwiCardLeg("man. 18. jan. • Utgående 02:15 25h 55m 21:10 PVG 1 stopp · Manchester BGO"), { durationMinutes: 1555, stopCount: 1 });
  assert.deepEqual(readKiwiCardLeg("07:00\n16h 05m\n06:05 +1 BGO 2 stopp · London, Paris PVG"), { durationMinutes: 965, stopCount: 2 });
  assert.deepEqual(readKiwiCardLeg("07:00 3h 10:00 OSL Direkte BGO"), { durationMinutes: 180, stopCount: 0 });
  assert.deepEqual(readKiwiCardLeg("ingen data"), {});
});

test("flight route lists connecting airports per leg for the tooltip chips", () => {
  const outbound = formatFlightLegRoute([
    { origin: "PVG", destination: "HEL" },
    { origin: "hel", destination: "BGO" },
  ], 1);
  assert.equal(outbound, "PVG → HEL → BGO");
  assert.equal(formatFlightLegRoute([{ origin: "OSL", destination: "BGO" }], 0), "OSL → BGO");
  // FINN-reise med flyplassbytte (Torp → Gardermoen) mellom selvbetjente flyvninger.
  assert.equal(formatFlightLegRoute([
    { origin: "PVG", destination: "MAN" },
    { origin: "MAN", destination: "TRF" },
    { origin: "OSL", destination: "BGO" },
  ], 2), "PVG → MAN → TRF/OSL → BGO");
  // Mellomlanding på samme flynummer uten kjent flyplass gir ingen gjettet rute.
  assert.equal(formatFlightLegRoute([{ origin: "HEL", destination: "BGO" }], 1), undefined);
  assert.equal(formatFlightLegRoute([{ origin: "PVG" }, { origin: "HEL", destination: "BGO" }]), undefined);
  assert.equal(formatFlightLegRoute([]), undefined);

});

test("flight legs give one labelled chip line per direction", () => {
  assert.equal(flightLegLabel(0, 1), undefined);
  assert.equal(flightLegLabel(0, 2), "Tur");
  assert.equal(flightLegLabel(1, 2), "Retur");

  const outbound = { durationMinutes: 1085, stopCount: 1, route: "PVG → FRA → BGO", carriers: ["Lufthansa", "Lufthansa"], timeRange: "11:55-23:00" };
  const inbound = { durationMinutes: 1205, stopCount: 2, route: "BGO → OSL → FRA → PVG", carriers: ["SAS", "Lufthansa"], timeRange: "07:00-10:05" };
  assert.deepEqual(flightLegPanelChipTexts(outbound), ["18t 5m", "via FRA"]);
  assert.deepEqual(flightLegPanelChipTexts(inbound), ["20t 5m", "via OSL, FRA"]);
  assert.deepEqual(flightLegPanelChipTexts({ durationMinutes: 55, route: "OSL → BGO" }), ["55m", "direkte"]);
  // Uten flyplasser (PanFlights, Kiwi) vises antall stopp.
  assert.deepEqual(flightLegPanelChipTexts({ durationMinutes: 1320, stopCount: 2 }), ["22t", "2 stopp"]);
  assert.deepEqual(flightLegTooltipChipTexts(outbound), ["PVG → FRA → BGO", "18t 5m", "Lufthansa", "11:55-23:00"]);
  assert.deepEqual(flightLegTooltipChipTexts({ durationMinutes: 1320, stopCount: 2 }), ["2 stopp", "22t"]);

  // Platform-teksten gjentar etappefakta; bare selger og merknader står igjen.
  assert.deepEqual(
    flightTooltipExtraTexts("Gotogate, Lufthansa / SAS+Lufthansa, 1 stopp / 2 stopp, 11:55-23:00 / 07:00-10:05, 1 innsjekket bagasje, billigst", [outbound, inbound]),
    ["Gotogate", "billigst"],
  );
  assert.deepEqual(
    flightTooltipExtraTexts("Lufthansa/SAS, 1 stopp / 2 stopp, 18 t 5 min / 20 t 5 min, Trip.com viser 1 179 USD", [outbound, inbound]),
    ["Trip.com viser 1 179 USD"],
  );
  assert.equal(formatFlightClockRange("2026-11-25T11:55:00", "2026-11-25 23:00:00"), "11:55-23:00");
  assert.equal(formatFlightClockRange("2026-11-25", "2026-11-25T23:00:00"), undefined);
});

test("flight sort variants replace the best row's route", () => {
  const offer = {
    shopName: "FINN", price: "6 016 kr", amount: 6016, currency: "NOK", productUrl: "https://example.test/best",
    durationText: "18t 55m · 1 stopp", flightLegs: [{ durationMinutes: 1135, stopCount: 1, route: "PVG → FRA → BGO" }], durationMinutes: 1135,
    flightSortVariants: {
      cheapest: { shopName: "FINN", price: "5 155 kr", amount: 5155, currency: "NOK", productUrl: "https://example.test/cheap", durationText: "32t 15m · 1 stopp", durationMinutes: 1935 },
    },
  };
  const [cheapest] = applyFlightSortMode([offer], "cheapest");
  assert.equal(cheapest?.flightLegs, undefined);
  assert.equal(cheapest?.durationText, "32t 15m · 1 stopp");
});

test("PanFlights legs read airports and local times from spec and route epochs", () => {
  // Utdrag av skypickersearchsingle PVG⇄BGO 25.11.–05.12.2026 (hentet 2026-11-05).
  const item = {
    package: {
      routelist: [{
        dTime: 1795635000,
        aTime: 1795702500,
        drTime: 1796479800,
        arTime: 1796597400,
        fly_duration_secs: 92700,
        return_duration_secs: 92400,
        tripdata: {
          flyFrom: "PVG", flyTo: "BGO", airlines: "Hainan Airlines, Norwegian",
          spec: [
            "PVG;PEK;HU;7612;1795635000;1795643700;HU;Y;145;102547",
            "PEK;BER;HU;489;1795663200;1795675200;HU;Y;620;488719",
            "BER;BGO;DY;1161;1795695900;1795702500;DY;Y;110;96000",
          ],
        },
        backdata: {
          flyFrom: "BGO", flyTo: "PVG", airlines: "KLM, China Southern Airlines",
          spec: [
            "BGO;AMS;KL;1168;1796479800;1796486400;KL;Y;110;88117",
            "AMS;PKX;CZ;346;1796502900;1796563200;CZ;Y;585;548735",
            "PKX;PVG;CZ;8889;1796589000;1796597400;CZ;Y;140;124282",
          ],
        },
      }],
    },
  };
  const legs = readPanFlightsFlightLegs(item, readPanFlightsLegMinutes(item, true), readPanFlightsLegStopCounts(item));
  assert.deepEqual(legs, [
    { durationMinutes: 1545, stopCount: 2, route: "PVG → PEK → BER → BGO", carriers: ["Hainan Airlines", "Norwegian"], timeRange: "19:30-14:15" },
    { durationMinutes: 1540, stopCount: 2, route: "BGO → AMS → PKX → PVG", carriers: ["KLM", "China Southern Airlines"], timeRange: "14:10-22:50" },
  ]);
  // Én vei: bare turen.
  assert.equal(readPanFlightsFlightLegs(item, readPanFlightsLegMinutes(item, false), readPanFlightsLegStopCounts(item))?.length, 1);
});

test("Kiwi detail stops split into legs at the card's endpoints", () => {
  // SegmentStop-kodene fra Kiwis detaljvisning PVG⇄BGO (hentet 2026-11-05), med flyplassbytte TRF/OSL.
  const codes = ["PVG", "MAN", "MAN", "TRF", "OSL", "BGO", "BGO", "CPH", "CPH", "AMS", "AMS", "PVG"];
  const sectors = [{ destination: "BGO", stopCount: 2 }, { destination: "PVG", stopCount: 2 }];
  assert.deepEqual(readKiwiDetailLegRoutes(codes, sectors), ["PVG → MAN → TRF/OSL → BGO", "BGO → CPH → AMS → PVG"]);
  // Feil antall stopp eller ufullstendige flyvninger gir ingen rute.
  assert.deepEqual(readKiwiDetailLegRoutes(codes, [{ destination: "BGO", stopCount: 1 }, { destination: "PVG", stopCount: 2 }]), []);
  assert.deepEqual(readKiwiDetailLegRoutes(codes.slice(0, 5), sectors), []);
  assert.deepEqual(readKiwiDetailLegRoutes(codes.slice(0, 6), [{ destination: "BGO", stopCount: undefined }]), ["PVG → MAN → TRF/OSL → BGO"]);

  assert.equal(readKiwiCardLegTimeRange("Utgående\n\n02:15\n22h\n17:15\nPVG\n\n2 stopp · flyplassbytte · Manchester, Oslo\n\nBGO"), "02:15-17:15");
  assert.equal(readKiwiCardLegTimeRange("ingen tider"), undefined);
});
