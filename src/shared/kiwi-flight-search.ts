// Kiwi.com: søket går mot det offentlige GraphQL-API-et som kiwi.com selv bruker
// (api.skypicker.com/umbrella/v2/graphql). Svaret uten sidens signerte kw-*-tokens var
// identisk med sidens eget svar (samme reiser, priser og rekkefølge, verifisert 2026-11-05
// for PVG⇄BGO og BGO⇄Shanghai med bagasje, stopp- og reisetidsfilter). Tokens etterlignes
// ikke. Spørringen ber bare om feltene vi bruker; filtrene speiler Kiwi-lenken fra panelet.
import { isRecord } from "./cashback.js";
import {
  buildFlightLegDetails,
  exceedsFlightMaxDuration,
  exceedsFlightMaxStops,
  formatFlightLegRoute,
  type FlightCabinClass,
  type FlightLegDetails,
  type FlightSearchMeta,
  type FlightSortMode,
  shiftFlightDateNotBeforeToday,
  sumFlightLegMinutes,
} from "./flight-search.js";
import { readRecordArray, readStringValue } from "./values.js";

export const KIWI_GRAPHQL_URL = "https://api.skypicker.com/umbrella/v2/graphql";

const KIWI_PLACES_QUERY = "query KiwiPlace($search: PlacesSearchInput, $filter: PlacesFilterInput, $options: PlacesOptionsInput) { places(search: $search, filter: $filter, options: $options, first: 5) { ... on PlaceConnection { edges { node { __typename id legacyId slug ... on City { code } } } } } }";

const KIWI_SECTOR_FRAGMENT = "fragment KiwiSector on Sector { duration sectorSegments { segment { source { station { code } localTime } destination { station { code } localTime } carrier { name } followingTechnicalStop } } }";
const KIWI_ITINERARY_FRAGMENT = "fragment KiwiItinerary on Itinerary { __typename id duration price { amount } ... on ItineraryOneWay { sector { ...KiwiSector } } ... on ItineraryReturn { outbound { ...KiwiSector } inbound { ...KiwiSector } } }";
const KIWI_RESULT_SELECTION = "__typename ... on AppError { error: message } ... on Itineraries { metadata { hasMorePending topResults { best { ...KiwiItinerary } cheapest { ...KiwiItinerary } fastest { ...KiwiItinerary } } } itineraries { ...KiwiItinerary } }";
const KIWI_RETURN_QUERY = `query KiwiReturn($search: SearchReturnInput, $filter: ItinerariesFilterInput, $options: ItinerariesOptionsInput) { returnItineraries(search: $search, filter: $filter, options: $options) { ${KIWI_RESULT_SELECTION} } } ${KIWI_ITINERARY_FRAGMENT} ${KIWI_SECTOR_FRAGMENT}`;
const KIWI_ONE_WAY_QUERY = `query KiwiOneWay($search: SearchOnewayInput, $filter: ItinerariesFilterInput, $options: ItinerariesOptionsInput) { onewayItineraries(search: $search, filter: $filter, options: $options) { ${KIWI_RESULT_SELECTION} } } ${KIWI_ITINERARY_FRAGMENT} ${KIWI_SECTOR_FRAGMENT}`;

const KIWI_API_CABIN_CLASSES: Record<FlightCabinClass, string> = {
  economy: "ECONOMY",
  premium: "PREMIUM_ECONOMY",
  business: "BUSINESS",
  first: "FIRST_CLASS",
};
const KIWI_API_SORT: Record<FlightSortMode, string> = { best: "QUALITY", cheapest: "PRICE", fastest: "DURATION" };

export type KiwiPlaceType = "AIRPORT" | "CITY";

export function buildKiwiPlacesUrl(term: string, placeType: KiwiPlaceType): string {
  const params = new URLSearchParams({
    featureName: "UmbrellaPlacesQuery",
    query: KIWI_PLACES_QUERY,
    variables: JSON.stringify({ search: { term }, filter: { onlyTypes: [placeType] }, options: { locale: "no" } }),
  });
  return `${KIWI_GRAPHQL_URL}?${params.toString()}`;
}

export type KiwiPlace = { id: string; slug: string; code?: string };

export function readKiwiPlaces(value: unknown, placeType: KiwiPlaceType): KiwiPlace[] {
  const places = isRecord(value) && isRecord(value.data) && isRecord(value.data.places) ? value.data.places : undefined;
  return readRecordArray(places?.edges).flatMap((edge) => {
    const node = isRecord(edge.node) ? edge.node : undefined;
    const id = readStringValue(node?.id);
    const slug = readStringValue(node?.slug);
    const code = readStringValue(placeType === "AIRPORT" ? node?.legacyId : node?.code);
    return id !== undefined && slug !== undefined ? [{ id, slug, ...(code !== undefined ? { code } : {}) }] : [];
  });
}

/** Flyplass-ID-en kan bygges direkte; by-ID-en («City:shanghai_cn») må slås opp. */
export function buildKiwiAirportId(code: string): string {
  return `Station:airport:${code.toUpperCase()}`;
}

export type KiwiSearchPlaces = { origin: string; destination: string };

export function buildKiwiItinerariesRequest(
  flightMeta: FlightSearchMeta,
  places: KiwiSearchPlaces,
  sortMode: FlightSortMode,
): { url: string; body: string } {
  const { dateFlex } = flightMeta;
  const dateRange = (date: string, before = 0, after = 0) => ({
    start: `${shiftFlightDateNotBeforeToday(date, -before)}T00:00:00`,
    end: `${shiftFlightDateNotBeforeToday(date, after)}T23:59:59`,
  });
  const roundTrip = flightMeta.inboundDate !== undefined;
  const handBags = flightMeta.includeCabinBag === true ? 1 : 0;
  const holdBags = flightMeta.includeCheckedBag === true ? 1 : 0;
  const bags = (count: number, value: number) => Array.from({ length: count }, () => value);
  const variables = {
    search: {
      itinerary: {
        source: { ids: [places.origin] },
        destination: { ids: [places.destination] },
        outboundDepartureDate: dateRange(flightMeta.outboundDate, dateFlex?.outboundBefore, dateFlex?.outboundAfter),
        ...(flightMeta.inboundDate !== undefined
          ? { inboundDepartureDate: dateRange(flightMeta.inboundDate, dateFlex?.inboundBefore, dateFlex?.inboundAfter) }
          : {}),
      },
      passengers: {
        adults: flightMeta.adults,
        children: flightMeta.children,
        infants: flightMeta.infants,
        adultsHoldBags: bags(flightMeta.adults, holdBags),
        adultsHandBags: bags(flightMeta.adults, handBags),
        childrenHoldBags: bags(flightMeta.children, holdBags),
        childrenHandBags: bags(flightMeta.children, handBags),
      },
      cabinClass: { cabinClass: KIWI_API_CABIN_CLASSES[flightMeta.cabinClass ?? "economy"], applyMixedClasses: false },
    },
    filter: {
      // Samme standardvalg som kiwi.com, så raden viser det Kiwi-lenken viser.
      ...(roundTrip ? { allowReturnFromDifferentCity: true } : {}),
      allowChangeInboundDestination: true,
      allowChangeInboundSource: true,
      allowDifferentStationConnection: true,
      enableSelfTransfer: true,
      enableThrowAwayTicketing: true,
      enableTrueHiddenCity: true,
      // Kiwi har bare hele timer; som lenken rundes det ned, og etappene kontrolleres etterpå.
      ...(flightMeta.maxDurationMinutes !== undefined ? { maxDuration: Math.max(1, Math.floor(flightMeta.maxDurationMinutes / 60)) } : {}),
      ...(flightMeta.maxStops !== undefined ? { maxStopsCount: flightMeta.maxStops } : {}),
      transportTypes: ["FLIGHT"],
      contentProviders: ["KIWI", "FRESH"],
      flightsApiLimit: 25,
      limit: 10,
    },
    options: {
      sortBy: KIWI_API_SORT[sortMode],
      currency: "nok",
      locale: "no",
      market: "no",
      partner: "skypicker",
      partnerMarket: "no",
      affilID: "skypicker",
      storeSearch: false,
    },
  };
  const featureName = roundTrip ? "SearchReturnItinerariesQuery" : "SearchOneWayItinerariesQuery";
  return {
    url: `${KIWI_GRAPHQL_URL}?featureName=${featureName}`,
    body: JSON.stringify({ query: roundTrip ? KIWI_RETURN_QUERY : KIWI_ONE_WAY_QUERY, variables }),
  };
}

export type KiwiItinerary = {
  id: string;
  amount: number;
  legs: FlightLegDetails[];
  legMinutes: Array<number | undefined>;
  durationMinutes?: number;
  outboundDate: string;
  inboundDate?: string;
  carriers: string[];
};

export type KiwiItinerariesResult = {
  itineraries: KiwiItinerary[];
  top: Partial<Record<FlightSortMode, KiwiItinerary>>;
  hasMorePending: boolean;
};

/** Flyplassene som godtas i hver ende (et bysøk gir byens flyplasser). */
export type KiwiSearchAirports = { origin: ReadonlySet<string>; destination: ReadonlySet<string> };

export function readKiwiItineraries(
  value: unknown,
  flightMeta: FlightSearchMeta,
  airports: KiwiSearchAirports,
): KiwiItinerariesResult {
  const data = isRecord(value) && isRecord(value.data) ? value.data : undefined;
  const result = isRecord(data?.returnItineraries) ? data.returnItineraries : isRecord(data?.onewayItineraries) ? data.onewayItineraries : undefined;
  if (result === undefined) {
    const errors = isRecord(value) && Array.isArray(value.errors)
      ? value.errors.map((error) => isRecord(error) ? readStringValue(error.message) : undefined).filter(Boolean).join("; ")
      : "";
    throw new Error(`Kiwi: uventet svar${errors !== "" ? ` (${errors})` : ""}`);
  }
  if (result.__typename === "AppError") throw new Error(`Kiwi: ${readStringValue(result.error) ?? "AppError"}`);
  const metadata = isRecord(result.metadata) ? result.metadata : undefined;
  const topResults = isRecord(metadata?.topResults) ? metadata.topResults : undefined;
  const read = (item: unknown) => isRecord(item) ? readKiwiItinerary(item, flightMeta, airports) : undefined;
  const top: Partial<Record<FlightSortMode, KiwiItinerary>> = {};
  for (const mode of ["best", "cheapest", "fastest"] as const) {
    const itinerary = read(topResults?.[mode]);
    if (itinerary !== undefined) top[mode] = itinerary;
  }
  const seen = new Set<string>();
  const itineraries = readRecordArray(result.itineraries)
    .map(read)
    .filter((itinerary): itinerary is KiwiItinerary => itinerary !== undefined)
    .filter((itinerary) => !seen.has(itinerary.id) && seen.add(itinerary.id) !== undefined);
  return { itineraries, top, hasMorePending: metadata?.hasMorePending === true };
}

type KiwiSectorSummary = { leg: FlightLegDetails; origin: string | undefined; destination: string | undefined; date: string | undefined; minutes: number | undefined; stopCount: number; carriers: string[] };

function readKiwiSector(sector: unknown): KiwiSectorSummary | undefined {
  if (!isRecord(sector)) return undefined;
  const segments = readRecordArray(sector.sectorSegments)
    .map((item) => isRecord(item.segment) ? item.segment : undefined)
    .filter((segment): segment is Record<string, unknown> => segment !== undefined);
  if (segments.length === 0) return undefined;
  const station = (end: unknown) => isRecord(end) && isRecord(end.station) ? readStringValue(end.station.code)?.toUpperCase() : undefined;
  const localTime = (end: unknown) => isRecord(end) ? readStringValue(end.localTime) : undefined;
  const airports = segments.map((segment) => ({ origin: station(segment.source), destination: station(segment.destination) }));
  // En teknisk mellomlanding på samme fly har ingen flyplass i svaret; da gis ingen rute.
  const technicalStops = segments.filter((segment) => segment.followingTechnicalStop === true).length;
  const stopCount = segments.length - 1 + technicalStops;
  const seconds = typeof sector.duration === "number" && Number.isFinite(sector.duration) ? sector.duration : undefined;
  const minutes = seconds !== undefined && seconds > 0 ? Math.round(seconds / 60) : undefined;
  const carriers = segments
    .map((segment) => isRecord(segment.carrier) ? readStringValue(segment.carrier.name) : undefined)
    .filter((carrier): carrier is string => carrier !== undefined);
  const departureTime = localTime(segments[0]?.source);
  const leg = buildFlightLegDetails({
    durationMinutes: minutes,
    stopCount,
    route: formatFlightLegRoute(airports, stopCount),
    departureTime,
    arrivalTime: localTime(segments[segments.length - 1]?.destination),
  }, carriers);
  return {
    leg,
    origin: airports[0]?.origin,
    destination: airports[airports.length - 1]?.destination,
    date: departureTime?.slice(0, 10),
    minutes,
    stopCount,
    carriers,
  };
}

function readKiwiItinerary(item: Record<string, unknown>, flightMeta: FlightSearchMeta, airports: KiwiSearchAirports): KiwiItinerary | undefined {
  const id = readStringValue(item.id);
  const price = isRecord(item.price) ? item.price : undefined;
  // Beløpet er en desimalstreng i NOK (valgt valuta), med bagasjen som er bedt om.
  const amount = Number(readStringValue(price?.amount));
  if (id === undefined || !Number.isFinite(amount) || amount <= 0) return undefined;
  const roundTrip = flightMeta.inboundDate !== undefined;
  const sectors = roundTrip
    ? [readKiwiSector(item.outbound), readKiwiSector(item.inbound)]
    : [readKiwiSector(item.sector)];
  if (sectors.some((sector) => sector === undefined)) return undefined;
  const [outbound, inbound] = sectors as KiwiSectorSummary[];
  // Samme endepunkter som søket; Kiwi kan ellers lande eller reise hjem fra en annen by.
  if (outbound === undefined || outbound.date === undefined ||
    !airports.origin.has(outbound.origin ?? "") || !airports.destination.has(outbound.destination ?? "")) return undefined;
  if (roundTrip && (inbound === undefined || inbound.date === undefined ||
    !airports.destination.has(inbound.origin ?? "") || !airports.origin.has(inbound.destination ?? ""))) return undefined;
  const legMinutes = (sectors as KiwiSectorSummary[]).map((sector) => sector.minutes);
  if (exceedsFlightMaxStops(flightMeta, (sectors as KiwiSectorSummary[]).map((sector) => sector.stopCount))) return undefined;
  if (exceedsFlightMaxDuration(flightMeta, legMinutes)) return undefined;
  const durationMinutes = sumFlightLegMinutes(legMinutes);
  return {
    id,
    amount: Math.round(amount),
    legs: (sectors as KiwiSectorSummary[]).map((sector) => sector.leg),
    legMinutes,
    ...(durationMinutes !== undefined ? { durationMinutes } : {}),
    outboundDate: outbound.date,
    ...(inbound?.date !== undefined ? { inboundDate: inbound.date } : {}),
    carriers: [...new Set((sectors as KiwiSectorSummary[]).flatMap((sector) => sector.carriers))],
  };
}
