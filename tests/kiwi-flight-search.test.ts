import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { FlightSearchMeta } from "../src/shared/flight-search.js";
import {
  buildKiwiAirportId,
  buildKiwiItinerariesRequest,
  buildKiwiPlacesUrl,
  readKiwiItineraries,
  readKiwiPlaces,
} from "../src/shared/kiwi-flight-search.js";

// Svar fra api.skypicker.com for BGO⇄Shanghai 11.11.–17.12.2026, maks 1 stopp, begge bagasjetyper
// og 20 t (hentet 2026-11-05, tre første reiser beholdt).
const fixture = () => JSON.parse(readFileSync(new URL("./fixtures/kiwi-return-itineraries.json", import.meta.url), "utf8"));
const search: FlightSearchMeta = {
  origin: "BGO", destination: "SHA", destinationScope: "city", outboundDate: "2026-11-11", inboundDate: "2026-12-17",
  adults: 1, children: 0, infants: 0, maxStops: 1, includeCabinBag: true, includeCheckedBag: true, maxDurationMinutes: 1245,
};
const airports = { origin: new Set(["BGO"]), destination: new Set(["SHA", "PVG"]) };

test("Kiwi request mirrors the Kiwi link: places, dates, bags, stops, whole hours and sorting", () => {
  const request = buildKiwiItinerariesRequest(
    { ...search, adults: 2, children: 1, dateFlex: { outboundBefore: 1, outboundAfter: 2, inboundBefore: 0, inboundAfter: 0 } },
    { origin: "City:bergen_no", destination: "City:shanghai_cn" },
    "cheapest",
  );
  assert.equal(request.url, "https://api.skypicker.com/umbrella/v2/graphql?featureName=SearchReturnItinerariesQuery");
  const { query, variables } = JSON.parse(request.body);
  assert.match(query, /returnItineraries\(search: \$search/);
  assert.deepEqual(variables.search.itinerary.source, { ids: ["City:bergen_no"] });
  assert.deepEqual(variables.search.itinerary.outboundDepartureDate, { start: "2026-11-10T00:00:00", end: "2026-11-13T23:59:59" });
  assert.deepEqual(variables.search.itinerary.inboundDepartureDate, { start: "2026-12-17T00:00:00", end: "2026-12-17T23:59:59" });
  assert.deepEqual(variables.search.passengers, {
    adults: 2, children: 1, infants: 0, adultsHoldBags: [1, 1], adultsHandBags: [1, 1], childrenHoldBags: [1], childrenHandBags: [1],
  });
  // 1245 min → 20 hele timer, som flightDurationMax i Kiwi-lenken.
  assert.equal(variables.filter.maxDuration, 20);
  assert.equal(variables.filter.maxStopsCount, 1);
  assert.equal(variables.options.sortBy, "PRICE");
  assert.equal(variables.options.currency, "nok");

  const oneWay = buildKiwiItinerariesRequest({ origin: "OSL", destination: "BGO", outboundDate: "2026-12-01", adults: 1, children: 0, infants: 0, cabinClass: "business" }, { origin: buildKiwiAirportId("osl"), destination: buildKiwiAirportId("BGO") }, "best");
  const oneWayBody = JSON.parse(oneWay.body);
  assert.match(oneWay.url, /SearchOneWayItinerariesQuery$/);
  assert.match(oneWayBody.query, /onewayItineraries\(search: \$search/);
  assert.equal(oneWayBody.variables.search.itinerary.inboundDepartureDate, undefined);
  assert.equal(oneWayBody.variables.search.itinerary.source.ids[0], "Station:airport:OSL");
  assert.equal(oneWayBody.variables.search.cabinClass.cabinClass, "BUSINESS");
  assert.equal(oneWayBody.variables.filter.maxStopsCount, undefined);
  assert.equal(oneWayBody.variables.filter.allowReturnFromDifferentCity, undefined);
});

test("Kiwi itineraries give price, legs with airports, times and carriers, and the sort winners", () => {
  const result = readKiwiItineraries(fixture(), search, airports);
  assert.equal(result.hasMorePending, false);
  assert.deepEqual(result.itineraries.map((itinerary) => itinerary.amount), [9970, 18096, 18273]);
  const [klm] = result.itineraries;
  assert.equal(klm?.outboundDate, "2026-11-11");
  assert.equal(klm?.inboundDate, "2026-12-17");
  assert.deepEqual(klm?.legs, [
    { durationMinutes: 920, stopCount: 1, route: "BGO → AMS → PVG", carriers: ["KLM Royal Dutch Airlines"], timeRange: "10:50-09:10" },
    { durationMinutes: 1155, stopCount: 1, route: "PVG → AMS → BGO", carriers: ["KLM Royal Dutch Airlines"], timeRange: "11:10-23:25" },
  ]);
  assert.equal(klm?.durationMinutes, 2075);
  assert.equal(result.top.best?.amount, 9970);
  assert.equal(result.top.cheapest?.amount, 9970);
  assert.equal(result.top.fastest?.amount, 20215);
  assert.equal(result.top.fastest?.durationMinutes, 1930);
});

test("Kiwi drops itineraries outside the search and reports errors and changed formats", () => {
  // Strengere filter: ingen av reisene har to etapper under 15 t.
  assert.equal(readKiwiItineraries(fixture(), { ...search, maxDurationMinutes: 900 }, airports).itineraries.length, 0);
  assert.equal(readKiwiItineraries(fixture(), { ...search, maxStops: 0 }, airports).itineraries.length, 0);
  // Bare Hongqiao godtatt: KLM lander i Pudong og utelates.
  assert.equal(readKiwiItineraries(fixture(), search, { origin: new Set(["BGO"]), destination: new Set(["SHA"]) }).itineraries.length, 0);
  // Teknisk mellomlanding uten flyplass gir antall stopp uten rute.
  const technical = fixture();
  technical.data.returnItineraries.itineraries[0].outbound.sectorSegments[0].segment.followingTechnicalStop = true;
  const technicalLeg = readKiwiItineraries(technical, { ...search, maxStops: 2 }, airports).itineraries[0]?.legs[0];
  assert.equal(technicalLeg?.stopCount, 2);
  assert.equal(technicalLeg?.route, undefined);
  // Ugyldig pris gir ingen reise, aldri 0 kr.
  const noPrice = fixture();
  noPrice.data.returnItineraries.itineraries[0].price.amount = "";
  assert.ok(!readKiwiItineraries(noPrice, search, airports).itineraries.some((itinerary) => itinerary.amount === 0));
  assert.throws(() => readKiwiItineraries({ data: { returnItineraries: { __typename: "AppError", error: "rate limited" } } }, search, airports), /Kiwi: rate limited/);
  assert.throws(() => readKiwiItineraries({ errors: [{ message: "Cannot query field" }] }, search, airports), /Kiwi: uventet svar \(Cannot query field\)/);
});

test("Kiwi places resolve the city ID for city searches", () => {
  assert.match(buildKiwiPlacesUrl("SHA", "CITY"), /featureName=UmbrellaPlacesQuery/);
  const places = readKiwiPlaces({ data: { places: { edges: [
    { node: { __typename: "City", id: "City:shanghai_cn", legacyId: "shanghai_cn", slug: "shanghai-kina", code: "SHA" } },
    { node: { __typename: "City", id: "City:xiamen_cn", legacyId: "xiamen_cn", slug: "xiamen-kina", code: "XMN" } },
  ] } } }, "CITY");
  assert.equal(places.find((place) => place.code === "SHA")?.id, "City:shanghai_cn");
  assert.deepEqual(readKiwiPlaces({ data: { places: { edges: [{ node: { id: "Station:airport:PVG", legacyId: "PVG", slug: "pudong" } }] } } }, "AIRPORT"), [{ id: "Station:airport:PVG", slug: "pudong", code: "PVG" }]);
});
