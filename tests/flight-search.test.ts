import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildFlightLinkFiltersValue,
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
  readMomondoFlightFilters,
  readMomondoPassengerPathParts,
  readPanFlightsBaggageFee,
  readPanFlightsDateFlex,
  readPanFlightsLegDurationsMinutes,
  readPanFlightsLegStopCounts,
  readSkyscannerFareAttributesParam,
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
