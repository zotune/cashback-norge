/** Ren flysøk-logikk som deles av utvidelsen og testene: søkeparametre, reisende,
 * datovindu, stopp-/bagasje-/reisetidsfilter og kildenes URL-/dataformater. */
import { isRecord } from "./cashback.js";
import {
  addDaysToIsoDate,
  isString,
  parseJsonValue,
  readIataCodeValue,
  readIsoDateValue,
  readNonNegativeIntegerValue,
  readNumberValue,
  readPositiveIntegerValue,
  readPositiveNumberValue,
  readRecordArray,
  readStringValue,
} from "./values.js";

export type FlightCabinClass = "economy" | "premium" | "business" | "first";

export type FlightSearchMeta = {
  origin: string;
  destination: string;
  outboundDate: string;
  inboundDate?: string;
  adults: number;
  youths: number;
  // Barn 2–11 år og spedbarn 0–1 år (på fanget), som FINN og flyselskapene skiller.
  children: number;
  infants: number;
  // Barnas alder når siden oppgir den; ellers brukes FLIGHT_DEFAULT_CHILD_AGE.
  childAges?: number[];
  cabinClass?: FlightCabinClass;
  // 0 = kun direkte; undefined = alle.
  maxStops?: number;
  includeCabinBag?: boolean;
  includeCheckedBag?: boolean;
  // Maks reisetid per etappe (hver vei) i minutter, inkl. bytter.
  maxDurationMinutes?: number;
  dateFlex?: FlightDateFlex;
};

// Dager før/etter valgt utreise- og hjemreisedato (PanFlights' ff:/tf: i v2-URL-en).
export type FlightDateFlex = {
  outboundBefore: number;
  outboundAfter: number;
  inboundBefore: number;
  inboundAfter: number;
};

export type FlightDateCombination = {
  outboundDate: string;
  inboundDate?: string;
};

// Kilder som krever alder (Skyscanner, momondo) får en alder i barnebåndet 2–11 år
// når siden bare oppgir antall; barnepris gjelder hele båndet hos flyselskapene.
export const FLIGHT_DEFAULT_CHILD_AGE = 7;

export const FLIGHT_INFANT_AGE = 1;

// Kilder som ikke leser stopp/bagasje fra URL-en (PanFlights, Trip.com) får filtrene
// som eget parameter; innholdsskriptet krysser dem av når siden åpnes.
export const FLIGHT_LINK_FILTERS_PARAM = "cbvFilters";

// momondo støtter ±1–3 dager per etappe, både i URL-en og i poll-API-ets flex-felt.
export const MOMONDO_FLIGHT_FLEX_VALUES = ["exact", "plusminusone", "plusminustwo", "plusminusthree"] as const;

export function normalizeFlightSearchMeta(meta: FlightSearchMeta): FlightSearchMeta | undefined {
  const origin = readIataCodeValue(meta.origin);
  const destination = readIataCodeValue(meta.destination);
  const outboundDate = readIsoDateValue(meta.outboundDate);
  const inboundDate = meta.inboundDate !== undefined ? readIsoDateValue(meta.inboundDate) : undefined;
  if (origin === undefined || destination === undefined || outboundDate === undefined || origin === destination) {
    return undefined;
  }
  const normalizedMeta: FlightSearchMeta = {
    origin,
    destination,
    outboundDate,
    ...(inboundDate !== undefined ? { inboundDate } : {}),
    // Ungdom (12+) er voksne hos sammenligningskildene (FINN: «Barn over 12 år regnes som voksne»).
    adults: Math.max(1, Math.trunc(meta.adults) + Math.max(0, Math.trunc(meta.youths))),
    youths: 0,
    children: Math.max(0, Math.trunc(meta.children)),
    infants: Math.max(0, Math.trunc(meta.infants)),
    ...(meta.childAges !== undefined && meta.childAges.length === Math.trunc(meta.children) &&
      meta.childAges.every((age) => Number.isInteger(age) && age >= 2 && age <= 11)
      ? { childAges: meta.childAges }
      : {}),
    ...(meta.cabinClass !== undefined ? { cabinClass: meta.cabinClass } : {}),
    ...(meta.maxStops !== undefined ? { maxStops: Math.max(0, Math.min(3, Math.trunc(meta.maxStops))) } : {}),
    ...(meta.includeCabinBag === true ? { includeCabinBag: true } : {}),
    ...(meta.includeCheckedBag === true ? { includeCheckedBag: true } : {}),
    ...(meta.maxDurationMinutes !== undefined && meta.maxDurationMinutes > 0 ? { maxDurationMinutes: Math.round(meta.maxDurationMinutes) } : {}),
    ...(meta.dateFlex !== undefined ? { dateFlex: meta.dateFlex } : {}),
  };
  return isFlightSearchPassengerMatchSupported(normalizedMeta) ? normalizedMeta : undefined;
}

// Spedbarn sitter på fanget til en voksen, så det kan ikke være flere spedbarn enn voksne.
export function isFlightSearchPassengerMatchSupported(flightMeta: FlightSearchMeta): boolean {
  return flightMeta.adults > 0 && flightMeta.infants <= flightMeta.adults;
}

export function readFlightChildAges(flightMeta: FlightSearchMeta): number[] {
  return flightMeta.childAges ?? Array.from({ length: flightMeta.children }, () => FLIGHT_DEFAULT_CHILD_AGE);
}

// Ett sete per voksen og barn; spedbarn sitter på fanget (bagasje følger setene).
export function countFlightSeatedPassengers(flightMeta: FlightSearchMeta): number {
  return flightMeta.adults + flightMeta.children;
}

// Aldersliste (2–11 = barn, 0–1 = spedbarn) slik Skyscanner og momondo tar den.
export function readFlightPassengerAges(ages: number[]): Pick<FlightSearchMeta, "children" | "infants" | "childAges"> {
  const childAges = ages.filter((age) => age >= 2 && age <= 11);
  return { children: childAges.length, infants: ages.filter((age) => age < 2).length, childAges };
}

export function readFlightCabinClassValue(value: unknown): FlightCabinClass | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replace(/[^a-zæøå]/g, "");
  if (normalized.length === 0) return undefined;
  if (/^(?:economy|okonomi|økonomi|ekonomi)$/.test(normalized)) return "economy";
  if (normalized.includes("premium")) return "premium";
  if (normalized.includes("business")) return "business";
  if (/^first(?:class)?$|f[oø]rsteklasse/.test(normalized)) return "first";
  return undefined;
}

export function exceedsFlightMaxStops(flightMeta: FlightSearchMeta, stopCounts: Array<number | undefined>): boolean {
  if (flightMeta.maxStops === undefined) return false;
  const maxStops = flightMeta.maxStops;
  return stopCounts.some((stopCount) => stopCount !== undefined && stopCount > maxStops);
}

export function exceedsFlightMaxDuration(flightMeta: FlightSearchMeta, legDurationsMinutes: Array<number | undefined>): boolean {
  const { maxDurationMinutes } = flightMeta;
  if (maxDurationMinutes === undefined) return false;
  return legDurationsMinutes.some((durationMinutes) => durationMinutes !== undefined && durationMinutes > maxDurationMinutes);
}

export function isIsoDateWithinDays(date: string | undefined, centerDate: string, daysBefore: number, daysAfter: number): boolean {
  if (date === undefined) return false;
  const time = new Date(`${date}T00:00:00Z`).getTime();
  const centerTime = new Date(`${centerDate}T00:00:00Z`).getTime();
  if (Number.isNaN(time) || Number.isNaN(centerTime)) return false;
  const dayOffset = Math.round((time - centerTime) / (24 * 60 * 60 * 1000));
  return dayOffset >= -daysBefore && dayOffset <= daysAfter;
}

export function formatFlightDateFlexWindow(before: number, after: number): string {
  return before === after ? `±${before}` : `-${before}/+${after}`;
}

export function formatFlightDateFlexDays(dateFlex: FlightDateFlex, roundTrip: boolean): string {
  const outbound = formatFlightDateFlexWindow(dateFlex.outboundBefore, dateFlex.outboundAfter);
  const inbound = formatFlightDateFlexWindow(dateFlex.inboundBefore, dateFlex.inboundAfter);
  return !roundTrip || outbound === inbound ? `${outbound} d` : `${outbound}/${inbound} d`;
}

// Datovinduet starter aldri før dagens dato; valgt dato beholdes uansett.
export function shiftFlightDateNotBeforeToday(isoDate: string, days: number, now = new Date()): string {
  if (days === 0) return isoDate;
  const shiftedDate = addDaysToIsoDate(isoDate, days) ?? isoDate;
  if (days > 0) return shiftedDate;
  const today = [
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const earliestDate = today < isoDate ? today : isoDate;
  return shiftedDate < earliestDate ? earliestDate : shiftedDate;
}

// Alle dato-kombinasjoner i vinduet, valgt dato først og deretter nærmeste.
export function listFlightDateFlexCombinations(
  flightMeta: FlightSearchMeta,
  dateFlex: FlightDateFlex,
  now = new Date(),
): FlightDateCombination[] {
  const listDates = (centerDate: string, before: number, after: number): Array<{ date: string; offset: number }> => {
    const firstDate = shiftFlightDateNotBeforeToday(centerDate, -before, now);
    const dates: Array<{ date: string; offset: number }> = [];
    for (let offset = -before; offset <= after; offset++) {
      const date = addDaysToIsoDate(centerDate, offset);
      if (date !== undefined && date >= firstDate) dates.push({ date, offset });
    }
    return dates;
  };

  const outboundDates = listDates(flightMeta.outboundDate, dateFlex.outboundBefore, dateFlex.outboundAfter);
  const { inboundDate } = flightMeta;
  const combinations: Array<FlightDateCombination & { distance: number }> = inboundDate === undefined
    ? outboundDates.map(({ date, offset }) => ({ outboundDate: date, distance: Math.abs(offset) }))
    : outboundDates.flatMap((outbound) => {
      return listDates(inboundDate, dateFlex.inboundBefore, dateFlex.inboundAfter)
        .filter((inbound) => inbound.date >= outbound.date)
        .map((inbound) => ({
          outboundDate: outbound.date,
          inboundDate: inbound.date,
          distance: Math.abs(outbound.offset) + Math.abs(inbound.offset),
        }));
    });
  return combinations
    .sort((left, right) => left.distance - right.distance)
    .map(({ distance: _distance, ...combination }) => combination);
}

export function buildFlightDateCombinationKey(combination: { outboundDate: string; inboundDate?: string | undefined }): string {
  return `${combination.outboundDate}|${combination.inboundDate ?? ""}`;
}

// v2-tillegg: ff:<før>,<etter> for utreise og tf:<før>,<etter> for hjemreise (som
// PanFlights' «+/- N dager»). Manuelle tidsrom (td:/ud:) støttes ikke ennå.
export function readPanFlightsDateFlex(extraParts: string[], roundTrip: boolean): FlightDateFlex | undefined {
  const readWindow = (key: string): [number, number] => {
    const value = extraParts.find((part) => part.startsWith(`${key}:`))?.slice(key.length + 1);
    const [before, after] = (value ?? "").split(",").map((day) => readNonNegativeIntegerValue(day));
    return before !== undefined ? [before, after ?? before] : [0, 0];
  };
  const [outboundBefore, outboundAfter] = readWindow("ff");
  const [inboundBefore, inboundAfter] = roundTrip ? readWindow("tf") : [0, 0];
  return outboundBefore + outboundAfter + inboundBefore + inboundAfter > 0
    ? { outboundBefore, outboundAfter, inboundBefore, inboundAfter }
    : undefined;
}

export type FlightLinkFilters = Pick<FlightSearchMeta, "maxStops" | "includeCabinBag" | "includeCheckedBag">;

// "stops:1,cabin,checked" ↔ maks stopp og bagasje.
export function buildFlightLinkFiltersValue(flightMeta: FlightSearchMeta): string | undefined {
  const parts = [
    flightMeta.maxStops !== undefined ? `stops:${flightMeta.maxStops}` : undefined,
    flightMeta.includeCabinBag === true ? "cabin" : undefined,
    flightMeta.includeCheckedBag === true ? "checked" : undefined,
  ].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? parts.join(",") : undefined;
}

export function readFlightLinkFilters(parsedUrl: URL): FlightLinkFilters | undefined {
  const value = parsedUrl.searchParams.get(FLIGHT_LINK_FILTERS_PARAM);
  if (value === null) return undefined;
  const parts = value.split(",");
  const maxStops = readNonNegativeIntegerValue(parts.find((part) => part.startsWith("stops:"))?.slice("stops:".length));
  return {
    ...(maxStops !== undefined ? { maxStops } : {}),
    ...(parts.includes("cabin") ? { includeCabinBag: true } : {}),
    ...(parts.includes("checked") ? { includeCheckedBag: true } : {}),
  };
}

// momondos fs-filter (verifisert 2026-11-01): stops=0,1 = maks ett stopp, bfc/cfc = antall
// hånd-/innsjekkede bagasjer i prisassistenten.
export function buildMomondoFlightFilterValue(flightMeta: FlightSearchMeta): string | undefined {
  const parts = [
    flightMeta.maxStops !== undefined && flightMeta.maxStops < 2
      ? `stops=${Array.from({ length: flightMeta.maxStops + 1 }, (_, stops) => stops).join(",")}`
      : undefined,
    flightMeta.includeCabinBag === true ? "bfc=1" : undefined,
    flightMeta.includeCheckedBag === true ? "cfc=1" : undefined,
    // legdur=-N = maks N minutter per etappe (verifisert 2026-11-01).
    flightMeta.maxDurationMinutes !== undefined ? `legdur=-${flightMeta.maxDurationMinutes}` : undefined,
  ].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? parts.join(";") : undefined;
}

export function readMomondoFlightFilters(parsedUrl: URL): FlightLinkFilters {
  const filters = new Map((parsedUrl.searchParams.get("fs") ?? "").split(";").map((part) => {
    const [key = "", value = ""] = part.split("=");
    return [key, value] as const;
  }));
  const stopValues = (filters.get("stops") ?? "").split(",").map((value) => readNonNegativeIntegerValue(value));
  const maxStops = filters.has("stops") && stopValues.every((value): value is number => value !== undefined && value < 2)
    ? Math.max(...stopValues.filter((value): value is number => value !== undefined))
    : undefined;
  return {
    ...(maxStops !== undefined ? { maxStops } : {}),
    ...((readNonNegativeIntegerValue(filters.get("bfc")) ?? 0) > 0 ? { includeCabinBag: true } : {}),
    ...((readNonNegativeIntegerValue(filters.get("cfc")) ?? 0) > 0 ? { includeCheckedBag: true } : {}),
    ...(readPositiveIntegerValue(filters.get("legdur")?.replace(/^-/, "")) !== undefined
      ? { maxDurationMinutes: readPositiveIntegerValue(filters.get("legdur")?.replace(/^-/, "")) }
      : {}),
  };
}

// momondos passasjerkoder (verifisert 2026-11-02): ADT, CHD med alder, INL = spedbarn på fanget.
export function buildMomondoPassengerDetails(flightMeta: FlightSearchMeta): Array<{ ptc: string; age?: number }> {
  return [
    ...Array.from({ length: flightMeta.adults }, () => ({ ptc: "ADT" })),
    ...readFlightChildAges(flightMeta).map((age) => ({ ptc: "CHD", age })),
    ...Array.from({ length: flightMeta.infants }, () => ({ ptc: "INL" })),
  ];
}

// Sti-segmenter for reisende: "2adults" og "children-7-1L" (L = spedbarn på fanget).
// Med barn må voksne alltid oppgis ("1adults"); "1adult" ignorerer barna.
export function buildMomondoPassengerPathParts(flightMeta: FlightSearchMeta): string[] {
  const hasChildren = flightMeta.children > 0 || flightMeta.infants > 0;
  return [
    ...(flightMeta.adults > 1 || hasChildren ? [`${flightMeta.adults}adults`] : []),
    ...(hasChildren
      ? [["children", ...readFlightChildAges(flightMeta).map(String), ...Array.from({ length: flightMeta.infants }, () => "1L")].join("-")]
      : []),
  ];
}

export function readMomondoPassengerPathParts(parts: string[]): Pick<FlightSearchMeta, "adults" | "children" | "infants" | "childAges"> | undefined {
  const adults = readPositiveIntegerValue(parts.map((part) => part.match(/^(\d+)adults?$/i)?.[1]).find((value) => value !== undefined));
  const childPart = parts.find((part) => /^children(-\d+[LS]?)+$/i.test(part));
  if (adults === undefined && childPart === undefined) return undefined;
  const childTokens = childPart?.split("-").slice(1) ?? [];
  const childAges = childTokens
    .filter((token) => /^\d+$/.test(token))
    .map(Number)
    .filter((age) => age >= 2 && age <= 11);
  return {
    adults: adults ?? 1,
    children: childAges.length,
    infants: childTokens.filter((token) => /^\d+[LS]$/i.test(token) || Number(token) < 2).length,
    childAges,
  };
}

// "2026-11-10-flexible-3days" → ["2026-11-10", 3].
export function readMomondoFlexibleDatePart(value: string | undefined): [string | undefined, number] {
  const match = value?.match(/^(\d{4}-\d{2}-\d{2})(?:-flexible-(\d+)days?)?$/i);
  if (match === null || match === undefined) return [value, 0];
  return [match[1], match[2] !== undefined ? Number(match[2]) : 0];
}

export function readMomondoFlightFlexDays(before: number, after: number): number {
  return Math.min(Math.max(before, after), MOMONDO_FLIGHT_FLEX_VALUES.length - 1);
}

export function formatMomondoLuggageValue(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const cleaned = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (/^inkludert$/i.test(cleaned)) return "inkl.";
  if (/^ukjent$/i.test(cleaned)) return "ukjent";
  if (/ikke\s+inkludert|ikke\s+inkl/i.test(cleaned)) return "ikke inkl.";
  return cleaned;
}

// Bagasjefilter fra opprinnelsessiden: forkast tilbud der momondo eksplisitt sier
// at bagasjen ikke er inkludert ("Ukjent" beholdes — heller usikker enn borte).
export function isMomondoBookingOptionMatchingBaggage(bookingOption: Record<string, unknown>, flightMeta: FlightSearchMeta): boolean {
  if (flightMeta.includeCabinBag !== true && flightMeta.includeCheckedBag !== true) return true;

  // status "INCLUDED" = bagasjen (gratis eller med gebyr) er med i prisen. Uten status
  // godtas bare visningsteksten "Inkludert"; "Ukjent" betyr ukjent totalpris.
  const fees = isRecord(bookingOption.fees) ? bookingOption.fees : undefined;
  const isIncluded = (bagData: unknown, display: unknown): boolean => {
    const status = isRecord(bagData) ? readStringValue(bagData.status) : undefined;
    return status !== undefined ? status === "INCLUDED" : formatMomondoLuggageValue(readStringValue(display)) === "inkl.";
  };
  if (flightMeta.includeCabinBag === true && !isIncluded(fees?.carryOnBagData, fees?.carryOnDisplay)) return false;
  if (flightMeta.includeCheckedBag === true && !isIncluded(fees?.checkedBagData, fees?.checkedBagDisplay)) return false;
  return true;
}

// Trip.com merker hver pris med FREE_CARRY_ON_BAGGAGE/FREE_CHECKED_BAGGAGE (verifisert i
// FlightListSearchSSE 2026-11-01). Uten merket er bagasjen ikke bekreftet inkludert.
export function isTripComPolicyMatchingBaggage(policy: Record<string, unknown>, flightMeta: FlightSearchMeta): boolean {
  if (flightMeta.includeCabinBag !== true && flightMeta.includeCheckedBag !== true) return true;
  const flags = new Set((Array.isArray(policy.policyFlags) ? policy.policyFlags : []).filter(isString));
  if (flightMeta.includeCabinBag === true && !flags.has("FREE_CARRY_ON_BAGGAGE")) return false;
  if (flightMeta.includeCheckedBag === true && !flags.has("FREE_CHECKED_BAGGAGE")) return false;
  return true;
}

export function readPanFlightsPackageRecord(item: Record<string, unknown>): Record<string, unknown> | undefined {
  return isRecord(item.package) ? item.package : undefined;
}

export function readPanFlightsRouteLegStopCount(route: Record<string, unknown>, dataKey: "tripdata" | "backdata"): number | undefined {
  const legData = isRecord(route[dataKey]) ? route[dataKey] : undefined;
  const specs = Array.isArray(legData?.spec) ? legData.spec.filter(isString) : [];
  return specs.length > 0 ? Math.max(0, specs.length - 1) : undefined;
}

export function readPanFlightsLegStopCounts(item: Record<string, unknown>): Array<number | undefined> {
  const routeList = readRecordArray(readPanFlightsPackageRecord(item)?.routelist);
  const outboundRoute = routeList[0];
  if (outboundRoute === undefined) return [];
  return [
    readPanFlightsRouteLegStopCount(outboundRoute, "tripdata"),
    readPanFlightsRouteLegStopCount(outboundRoute, "backdata") ??
      (routeList[1] !== undefined ? readPanFlightsRouteLegStopCount(routeList[1], "tripdata") : undefined),
  ];
}

// Reisetid per etappe i minutter, inkl. bytter: package.duration er hele reisen én vei
// (også med separate billetter), package.legduration den lengste etappen tur/retur.
export function readPanFlightsLegDurationsMinutes(item: Record<string, unknown>, roundTrip: boolean): Array<number | undefined> {
  const packageRecord = readPanFlightsPackageRecord(item);
  return [roundTrip
    ? readPositiveNumberValue(packageRecord?.legduration)
    : readPositiveNumberValue(packageRecord?.duration) ?? readPositiveNumberValue(item.duration)];
}

// PanFlights legger bagasjeavgiften til prisen i nettleseren (updateOfferFee):
// baggage.bin = håndbagasje, baggage["1"] = én innsjekket, per passasjer. Ukjent
// avgift (mangler/negativ) betyr ukjent totalpris, og tilbudet utelates.
export function readPanFlightsBaggageFee(baggage: unknown, flightMeta: FlightSearchMeta): number | undefined {
  if (flightMeta.includeCabinBag !== true && flightMeta.includeCheckedBag !== true) return 0;
  if (!isRecord(baggage)) return undefined;

  let feePerPassenger = 0;
  if (flightMeta.includeCabinBag === true) {
    const cabinFee = readNumberValue(baggage.bin);
    if (cabinFee === undefined || cabinFee < 0) return undefined;
    feePerPassenger += cabinFee;
  }
  if (flightMeta.includeCheckedBag === true) {
    if (baggage.unit !== undefined) {
      // Inkluderte kolli: minst ett innsjekket kolli gir ingen ekstra avgift.
      const includedPieces = baggage.unit === "pcs" ? readNumberValue(baggage.amount) ?? 0 : 1;
      if (includedPieces < 1) return undefined;
    } else {
      const checkedFee = readNumberValue(baggage["1"]);
      if (checkedFee === undefined || checkedFee < 0) return undefined;
      feePerPassenger += checkedFee;
    }
  }
  return Math.round(feePerPassenger * countFlightSeatedPassengers(flightMeta));
}

export function formatPanFlightsEpochDate(epochSeconds: number | undefined): string | undefined {
  if (epochSeconds === undefined) return undefined;
  const date = new Date(epochSeconds * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

export function readPanFlightsRouteLegDate(
  route: Record<string, unknown>,
  dataKey: "tripdata" | "backdata",
  timeKey: "dTime" | "drTime",
  origin: string,
  destination: string,
): string | undefined {
  const legData = isRecord(route[dataKey]) ? route[dataKey] : undefined;
  return readStringValue(legData?.flyFrom)?.toUpperCase() === origin &&
    readStringValue(legData?.flyTo)?.toUpperCase() === destination
    ? formatPanFlightsEpochDate(readNumberValue(route[timeKey]))
    : undefined;
}

// Returnerer reisens faktiske datoer når rute og datoer passer søket (±dateFlex).
export function matchPanFlightsFlightSearchDates(
  item: Record<string, unknown>,
  flightMeta: FlightSearchMeta,
  dateFlex: FlightDateFlex | undefined,
): { outboundDate: string; inboundDate?: string } | undefined {
  const routeList = readRecordArray(readPanFlightsPackageRecord(item)?.routelist);
  const outboundRoute = routeList[0];
  if (outboundRoute === undefined) return undefined;
  const outboundDate = readPanFlightsRouteLegDate(outboundRoute, "tripdata", "dTime", flightMeta.origin, flightMeta.destination);
  if (outboundDate === undefined || !isIsoDateWithinDays(outboundDate, flightMeta.outboundDate, dateFlex?.outboundBefore ?? 0, dateFlex?.outboundAfter ?? 0)) {
    return undefined;
  }

  const requestedInboundDate = flightMeta.inboundDate;
  if (requestedInboundDate === undefined) return { outboundDate };

  const inboundDate = [
    readPanFlightsRouteLegDate(outboundRoute, "backdata", "drTime", flightMeta.destination, flightMeta.origin),
    ...routeList.map((route) => readPanFlightsRouteLegDate(route, "tripdata", "dTime", flightMeta.destination, flightMeta.origin)),
  ].find((date) => isIsoDateWithinDays(date, requestedInboundDate, dateFlex?.inboundBefore ?? 0, dateFlex?.inboundAfter ?? 0));
  return inboundDate !== undefined && inboundDate >= outboundDate ? { outboundDate, inboundDate } : undefined;
}

// Widerøe: /en/book-flight/flight eller /bestill-flybillett/flygning med d_city, a_city,
// d_day + d_month (YYYYMM), triptype=1 (én vei) eller 2 med r_day + r_month (verifisert
// 2026-11-02). Andre reisendetyper enn pax=adt er ikke sett ennå; ukjente verdier gir
// ingen treff fremfor feil søk.
export function extractWideroeFlightSearchMeta(parsedUrl: URL): FlightSearchMeta | undefined {
  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  if (hostname !== "wideroe.no" || !/^\/(?:[a-z]{2}\/)?(?:book-flight\/flight|bestill-flybillett\/flygning)\/?$/i.test(parsedUrl.pathname)) {
    return undefined;
  }
  const tripType = parsedUrl.searchParams.get("triptype");
  if (tripType !== "1" && tripType !== "2") return undefined;

  const readDate = (dayKey: string, monthKey: string): string | undefined => {
    const month = parsedUrl.searchParams.get(monthKey)?.match(/^(\d{4})(\d{2})$/);
    const day = readPositiveIntegerValue(parsedUrl.searchParams.get(dayKey));
    return month !== null && month !== undefined && day !== undefined
      ? readIsoDateValue(`${month[1]}-${month[2]}-${String(day).padStart(2, "0")}`)
      : undefined;
  };
  const origin = readIataCodeValue(parsedUrl.searchParams.get("d_city")?.toUpperCase());
  const destination = readIataCodeValue(parsedUrl.searchParams.get("a_city")?.toUpperCase());
  const outboundDate = readDate("d_day", "d_month");
  const inboundDate = tripType === "2" ? readDate("r_day", "r_month") : undefined;
  const paxTokens = (parsedUrl.searchParams.get("pax") ?? "").toLowerCase().split(/[,;]/).filter(Boolean);
  if (origin === undefined || destination === undefined || outboundDate === undefined) return undefined;
  if (tripType === "2" && (inboundDate === undefined || inboundDate < outboundDate)) return undefined;
  if (paxTokens.length === 0 || paxTokens.some((token) => token !== "adt")) return undefined;

  return normalizeFlightSearchMeta({
    origin,
    destination,
    outboundDate,
    ...(inboundDate !== undefined ? { inboundDate } : {}),
    adults: paxTokens.length,
    youths: 0,
    children: 0,
    infants: 0,
  });
}

// KLM/Air France: sessionStorage-verdiene bwsfe-state-connections (rute og dato per etappe) og
// bwc-bw-tagging-state (kabin og reisende), verifisert på klm.no 2026-11-02. Tagging-dataene
// brukes bare når ruten samsvarer, så et tidligere søk ikke blandes inn.
export function readAirFranceKlmFlightSearchMeta(
  connectionsText: string | undefined,
  taggingText: string | undefined,
): FlightSearchMeta | undefined {
  const connections = readRecordArray(parseJsonValue(connectionsText ?? ""));
  const outbound = connections[0];
  const inbound = connections[1];
  const readCode = (place: unknown): string | undefined => readIataCodeValue(isRecord(place) ? place.code : undefined);
  const origin = readCode(outbound?.origin);
  const destination = readCode(outbound?.destination);
  const outboundDate = readIsoDateValue(outbound?.departureDate);
  if (origin === undefined || destination === undefined || outboundDate === undefined || connections.length > 2) return undefined;
  // Tur/retur bare når andre etappe går motsatt vei; åpne kjever og flere byer støttes ikke.
  const inboundDate = inbound === undefined ? undefined : readIsoDateValue(inbound.departureDate);
  if (inbound !== undefined && (inboundDate === undefined || readCode(inbound.origin) !== destination || readCode(inbound.destination) !== origin)) {
    return undefined;
  }

  const tagging = parseJsonValue(taggingText ?? "");
  const flow = isRecord(tagging) && isRecord(tagging.flow) ? tagging.flow : undefined;
  if (flow === undefined || readStringValue(flow.z_origin) !== origin || readStringValue(flow.z_destination) !== destination) return undefined;
  const cabinClass = readFlightCabinClassValue(flow.z_search_cabin_code ?? flow.z_cabin_code);

  return normalizeFlightSearchMeta({
    origin,
    destination,
    outboundDate,
    ...(inboundDate !== undefined ? { inboundDate } : {}),
    // Seniorer og ungdom er voksne hos sammenligningskildene.
    adults: (readNonNegativeIntegerValue(flow.z_nb_adults) ?? 0) + (readNonNegativeIntegerValue(flow.z_nb_seniors) ?? 0),
    youths: readNonNegativeIntegerValue(flow.z_nb_youth) ?? 0,
    children: readNonNegativeIntegerValue(flow.z_nb_children) ?? 0,
    infants: readNonNegativeIntegerValue(flow.z_nb_infants) ?? 0,
    ...(cabinClass !== undefined ? { cabinClass } : {}),
  });
}

// Norwegian og Lufthansa (Amadeus): sessionStorage-nøkkelen airBoundsSearch med det valgte
// søket (verifisert 2026-11-02): itineraries per etappe, travelers med passasjerkoder, cabin
// (bare Lufthansa) og directFlights.
export function readAmadeusAirBoundsFlightSearchMeta(stateText: string | undefined): FlightSearchMeta | undefined {
  const state = parseJsonValue(stateText ?? "");
  if (!isRecord(state) || !isRecord(state.entities)) return undefined;
  const selectedId = readStringValue(state.selectedAirBoundsSearchId);
  const search = selectedId !== undefined && isRecord(state.entities[selectedId]) ? state.entities[selectedId] : undefined;
  if (search === undefined) return undefined;

  const itineraries = readRecordArray(search.itineraries);
  const outbound = itineraries[0];
  const inbound = itineraries[1];
  const origin = readIataCodeValue(outbound?.originLocationCode);
  const destination = readIataCodeValue(outbound?.destinationLocationCode);
  // departureDateTime er "2026-11-20T00:00:00.000"; datoen er de ti første tegnene.
  const readDate = (value: unknown): string | undefined => readIsoDateValue(readStringValue(value)?.slice(0, 10));
  const outboundDate = readDate(outbound?.departureDateTime);
  if (origin === undefined || destination === undefined || outboundDate === undefined || itineraries.length > 2) return undefined;
  const inboundDate = inbound === undefined ? undefined : readDate(inbound.departureDateTime);
  if (inbound !== undefined && (
    inboundDate === undefined ||
    readIataCodeValue(inbound.originLocationCode) !== destination ||
    readIataCodeValue(inbound.destinationLocationCode) !== origin
  )) {
    return undefined;
  }

  // ADT/YTH/SRC er voksne hos sammenligningskildene, CHD barn og INF spedbarn; ukjente koder
  // gir ingen treff fremfor et feil antall reisende.
  const passengerCodes = readRecordArray(search.travelers).map((traveler) => readStringValue(traveler.passengerTypeCode)?.toUpperCase());
  const countCodes = (codes: string[]): number => passengerCodes.filter((code) => code !== undefined && codes.includes(code)).length;
  const adults = countCodes(["ADT", "YTH", "YCD", "SRC"]);
  const children = countCodes(["CHD"]);
  const infants = countCodes(["INF"]);
  if (passengerCodes.length === 0 || adults + children + infants !== passengerCodes.length) return undefined;
  const cabinClass = readFlightCabinClassValue(search.cabin);

  return normalizeFlightSearchMeta({
    origin,
    destination,
    outboundDate,
    ...(inboundDate !== undefined ? { inboundDate } : {}),
    adults,
    youths: 0,
    children,
    infants,
    ...(cabinClass !== undefined ? { cabinClass } : {}),
    ...(outbound?.directFlights === true ? { maxStops: 0 } : {}),
  });
}
