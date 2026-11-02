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
export function readPanFlightsDateFlex(extraParts: string[], outboundDate: string, inboundDate?: string): FlightDateFlex | undefined {
  const readValue = (key: string): string | undefined => extraParts.find((part) => part.startsWith(`${key}:`))?.slice(key.length + 1);
  // «+/- N dager» er ff:<før>,<etter>. «Tidsrom» er ff:manual med sluttdatoen i td: (utreise)
  // eller tf:manual med ud: (hjemreise), fra PanFlights' egen URL-bygger.
  const readWindow = (flexKey: string, endKey: string, startDate: string | undefined): [number, number] => {
    const value = readValue(flexKey);
    if (value === "manual" && startDate !== undefined) {
      const endDate = readIsoDateValue(readValue(endKey)?.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"));
      const days = endDate === undefined ? undefined : Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86400000);
      return days !== undefined && days >= 0 ? [0, days] : [0, 0];
    }
    const [before, after] = (value ?? "").split(",").map((day) => readNonNegativeIntegerValue(day));
    return before !== undefined ? [before, after ?? before] : [0, 0];
  };
  const [outboundBefore, outboundAfter] = readWindow("ff", "td", outboundDate);
  const [inboundBefore, inboundAfter] = inboundDate !== undefined ? readWindow("tf", "ud", inboundDate) : [0, 0];
  return outboundBefore + outboundAfter + inboundBefore + inboundAfter > 0
    ? { outboundBefore, outboundAfter, inboundBefore, inboundAfter }
    : undefined;
}

export type FlightSortMode = "best" | "cheapest" | "fastest";
export const FLIGHT_LINK_SORT_PARAM = "cbvSort";

const FLIGHT_FASTEST_MAX_PRICE_FACTOR = 4;

type FlightSortableCandidate = { amount: number; sortAmount?: number; durationMinutes?: number };

// Samlet reisetid krever tid for alle etapper; ellers kan ikke reisen sammenlignes på varighet.
export function sumFlightLegMinutes(legMinutes: Array<number | undefined>, expectedLegs = legMinutes.length): number | undefined {
  if (legMinutes.length === 0 || legMinutes.length !== expectedLegs) return undefined;
  let total = 0;
  for (const minutes of legMinutes) {
    if (minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) return undefined;
    total += minutes;
  }
  return total;
}

// candidates er i kildens egen «beste»-rekkefølge. Raskest finnes bare når reisetiden er kjent.
export function selectFlightSortCandidate<T extends FlightSortableCandidate>(candidates: T[], mode: FlightSortMode): T | undefined {
  if (mode === "best") return candidates[0];
  const amountOf = (candidate: T): number => candidate.sortAmount ?? candidate.amount;
  // En reise til mange ganger prisen (f.eks. 233 000 mot 15 000 kr) er ikke et reelt «raskest»-valg.
  const fastestPriceLimit = Math.min(...candidates.map(amountOf)) * FLIGHT_FASTEST_MAX_PRICE_FACTOR;
  let selected: T | undefined;
  for (const candidate of candidates) {
    if (mode === "cheapest") {
      if (selected === undefined || amountOf(candidate) < amountOf(selected)) selected = candidate;
      continue;
    }
    if (candidate.durationMinutes === undefined || amountOf(candidate) > fastestPriceLimit) continue;
    if (
      selected === undefined ||
      candidate.durationMinutes < (selected.durationMinutes ?? Number.POSITIVE_INFINITY) ||
      (candidate.durationMinutes === selected.durationMinutes && amountOf(candidate) < amountOf(selected))
    ) {
      selected = candidate;
    }
  }
  return selected;
}

// Beholder de første radene, men aldri på bekostning av billigste og raskeste reise.
export function limitFlightCandidates<T extends FlightSortableCandidate>(candidates: T[], limit: number): T[] {
  const limited = candidates.slice(0, limit);
  for (const mode of ["cheapest", "fastest"] as const) {
    const winner = selectFlightSortCandidate(candidates, mode);
    if (winner !== undefined && !limited.includes(winner)) limited.push(winner);
  }
  return limited;
}

export type FlightSortVariant = {
  shopName: string;
  price: string;
  amount: number;
  sortAmount?: number;
  currency: string;
  productUrl: string;
  offerUrl?: string;
  durationText?: string;
  durationMinutes?: number;
};

type FlightSortableOffer = FlightSortableCandidate & {
  durationText?: string;
  baggageExcluded?: boolean;
  alternatives?: FlightSortableCandidate[];
  flightSortVariants?: Partial<Record<"cheapest" | "fastest", FlightSortVariant>>;
};

// Bytter hver kildes rad til valgt sortering uten nye kall. Kilder uten varianten (f.eks. Google,
// eller ukjent reisetid) beholder «Best». Bagasje som ikke er bekreftet, og rader uten pris, står sist.
export function applyFlightSortMode<T extends FlightSortableOffer>(offers: T[], mode: FlightSortMode): T[] {
  if (mode === "best" || !offers.some((offer) => offer.flightSortVariants !== undefined)) return offers;
  const amountOf = (candidate: FlightSortableCandidate): number => candidate.sortAmount ?? candidate.amount;
  const durationOf = (candidate: FlightSortableCandidate): number => candidate.durationMinutes ?? Number.POSITIVE_INFINITY;
  const compare = (left: FlightSortableCandidate, right: FlightSortableCandidate): number => {
    return mode === "fastest"
      ? durationOf(left) - durationOf(right) || amountOf(left) - amountOf(right)
      : amountOf(left) - amountOf(right);
  };
  return offers
    .map((offer) => {
      const variant = offer.flightSortVariants?.[mode];
      const { durationText: _durationText, durationMinutes: _durationMinutes, ...base } = offer;
      const selected = (variant !== undefined ? { ...base, ...variant } : offer) as T;
      return selected.alternatives !== undefined
        ? { ...selected, alternatives: [...selected.alternatives].sort(compare) }
        : selected;
    })
    .sort((left, right) => {
      const excluded = Number(left.baggageExcluded === true) - Number(right.baggageExcluded === true);
      return excluded !== 0 ? excluded : compare(left, right);
    });
}

const FLIGHT_SORT_URL_VALUES: Record<string, Record<FlightSortMode, string>> = {
  finn: { best: "agony_asc", cheapest: "priceAmount_asc", fastest: "tripDuration_asc" },
  momondo: { best: "bestflight_a", cheapest: "price_a", fastest: "duration_a" },
  panflights: { best: "quality", cheapest: "price", fastest: "duration" },
  kiwi: { best: "quality", cheapest: "price", fastest: "duration" },
};

export function buildFlightSortUrlValue(source: "finn" | "momondo" | "panflights" | "kiwi", mode: FlightSortMode): string {
  return FLIGHT_SORT_URL_VALUES[source]?.[mode] ?? "";
}

export function readFlightSortUrlValue(source: "finn" | "momondo" | "panflights" | "kiwi", value: string | null): FlightSortMode | undefined {
  const values = FLIGHT_SORT_URL_VALUES[source];
  if (value === null || values === undefined) return undefined;
  return (["best", "cheapest", "fastest"] as const).find((mode) => values[mode] === value);
}

// «resultater sortert etter beste» / «Rimeligste» / «Raskeste» på Skyscanner, faner på Trip.com.
export function readFlightSortLabel(text: string | undefined): FlightSortMode | undefined {
  const normalized = text?.toLowerCase() ?? "";
  if (/rimeligste|cheapest/.test(normalized)) return "cheapest";
  if (/raskeste|fastest/.test(normalized)) return "fastest";
  if (/\bbeste\b|recommended/.test(normalized)) return "best";
  return undefined;
}

// Reisetid for hele reisen: fly_duration_secs og return_duration_secs ligger på første rute.
export function readPanFlightsLegMinutes(item: Record<string, unknown>, roundTrip: boolean): Array<number | undefined> {
  const packageRecord = isRecord(item.package) ? item.package : undefined;
  const routes = readRecordArray(packageRecord?.routelist);
  const route = routes[0];
  const minutes = (seconds: unknown): number | undefined => {
    const value = readPositiveNumberValue(seconds);
    return value !== undefined ? Math.round(value / 60) : undefined;
  };
  const outbound = minutes(route?.fly_duration_secs);
  if (!roundTrip) return [outbound];
  return [outbound, minutes(route?.return_duration_secs) ?? minutes(routes[1]?.fly_duration_secs)];
}

export type FlightLinkFilters = Pick<FlightSearchMeta, "maxStops" | "includeCabinBag" | "includeCheckedBag" | "maxDurationMinutes">;

// "stops:1,cabin,checked,dur:1500" ↔ maks stopp, bagasje og maks minutter per etappe.
export function buildFlightLinkFiltersValue(flightMeta: FlightSearchMeta): string | undefined {
  const parts = [
    flightMeta.maxStops !== undefined ? `stops:${flightMeta.maxStops}` : undefined,
    flightMeta.includeCabinBag === true ? "cabin" : undefined,
    flightMeta.includeCheckedBag === true ? "checked" : undefined,
    flightMeta.maxDurationMinutes !== undefined ? `dur:${flightMeta.maxDurationMinutes}` : undefined,
  ].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? parts.join(",") : undefined;
}

export function readFlightLinkFilters(parsedUrl: URL): FlightLinkFilters | undefined {
  const value = parsedUrl.searchParams.get(FLIGHT_LINK_FILTERS_PARAM);
  if (value === null) return undefined;
  const parts = value.split(",");
  const maxStops = readNonNegativeIntegerValue(parts.find((part) => part.startsWith("stops:"))?.slice("stops:".length));
  const maxDurationMinutes = readPositiveIntegerValue(parts.find((part) => part.startsWith("dur:"))?.slice("dur:".length));
  return {
    ...(maxStops !== undefined ? { maxStops } : {}),
    ...(parts.includes("cabin") ? { includeCabinBag: true } : {}),
    ...(parts.includes("checked") ? { includeCheckedBag: true } : {}),
    ...(maxDurationMinutes !== undefined ? { maxDurationMinutes } : {}),
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
  const maxDurationMinutes = readPositiveIntegerValue(filters.get("legdur")?.replace(/^-/, ""));
  return {
    ...(maxStops !== undefined ? { maxStops } : {}),
    ...((readNonNegativeIntegerValue(filters.get("bfc")) ?? 0) > 0 ? { includeCabinBag: true } : {}),
    ...((readNonNegativeIntegerValue(filters.get("cfc")) ?? 0) > 0 ? { includeCheckedBag: true } : {}),
    ...(maxDurationMinutes !== undefined ? { maxDurationMinutes } : {}),
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

export type MomondoFlexibleDateOption = FlightDateCombination & { amount: number; sortAmount?: number };

export type MomondoFlexibleDatePollState<T extends MomondoFlexibleDateOption> = {
  searchId?: string;
  filterState?: string;
  options: T[];
  complete: boolean;
};

// Et fleksibelt søk må fortsette med samme searchId. Stabil topprangering betyr
// ikke at de andre datoene er ferdige, og et tomt delresultat erstatter ikke treff.
export async function pollMomondoFlexibleDateOptions<T extends MomondoFlexibleDateOption>(
  state: MomondoFlexibleDatePollState<T>,
  input: {
    requestResults: (searchId: string | undefined, filterState: string | undefined) => Promise<unknown>;
    readOptions: (result: Record<string, unknown>) => T[];
    readFilterState: (result: Record<string, unknown>) => string | undefined;
    wait: (milliseconds: number) => Promise<void>;
    attempts: number;
    intervalMs: number;
  },
): Promise<void> {
  for (let attempt = 0; attempt < input.attempts && !state.complete; attempt++) {
    if (attempt > 0) await input.wait(input.intervalMs);
    const value = await input.requestResults(state.searchId, state.filterState);
    if (!isRecord(value) || !Array.isArray(value.results)) continue;
    const searchId = readStringValue(value.searchId);
    if (searchId !== undefined) state.searchId = searchId;

    // Ikke vis det ufiltrerte øyeblikksbildet når flyplassfilter må settes først.
    const nextFilterState = state.filterState ?? input.readFilterState(value);
    if (state.filterState === undefined && nextFilterState !== undefined) {
      state.filterState = nextFilterState;
      state.options = [];
      continue;
    }

    const options = input.readOptions(value);
    state.complete = readStringValue(value.status) === "complete";
    // Ferdige svar er autoritative, også når tilbud er blitt dyrere eller borte.
    // Under lasting beholdes billigste bekreftede treff for hver datokombinasjon.
    const byDate = new Map<string, T>();
    for (const option of state.complete ? options : [...state.options, ...options]) {
      const key = buildFlightDateCombinationKey(option);
      const previous = byDate.get(key);
      if (previous === undefined || (option.sortAmount ?? option.amount) < (previous.sortAmount ?? previous.amount)) {
        byDate.set(key, option);
      }
    }
    state.options = [...byDate.values()];
  }
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

// Trip.com: transSectionList[] er flyvningene, og flightInfo.stopList[] er mellomlandinger på
// samme flynummer (f.eks. AY817 HEL-ARN-BGO). Trips eget stoppfilter teller begge.
export function readTripComJourneyStopCount(journey: Record<string, unknown>): number {
  const sections = readRecordArray(journey.transSectionList);
  const intermediateStops = sections.reduce((count, section) => {
    const flightInfo = isRecord(section.flightInfo) ? section.flightInfo : undefined;
    return count + readRecordArray(flightInfo?.stopList).length;
  }, 0);
  return Math.max(0, sections.length - 1) + intermediateStops;
}

// Uten flaggene svarer Trip.com med billigste billett uten bagasje, og reiser med bagasje mot
// høyere pris mangler. Siden selv sender journeyNoList [1], også for tur/retur (verifisert 2026-11-02).
export function buildTripComBaggageFilterFlags(flightMeta: FlightSearchMeta): Array<Record<string, unknown>> {
  return [
    flightMeta.includeCabinBag === true ? "FreeCarryOnBaggage" : undefined,
    flightMeta.includeCheckedBag === true ? "FreeCheckedBaggage" : undefined,
  ]
    .filter((flag): flag is string => flag !== undefined)
    .map((flag) => ({ flag, allow: true, journeyNoList: [1] }));
}

// "Total 16h 30m 46h 30m" i varighetsfilteret og "Total 16h 30m–30h 30m" i filterbrikken.
export function readTripComTotalDurationRange(text: string): { minMinutes: number; maxMinutes: number } | undefined {
  const match = text.match(/Total\s+(\d+)h(?:\s+(\d+)m)?\s*[–-]?\s*(\d+)h(?:\s+(\d+)m)?/i);
  if (match === null) return undefined;
  return {
    minMinutes: Number(match[1]) * 60 + Number(match[2] ?? 0),
    maxMinutes: Number(match[3]) * 60 + Number(match[4] ?? 0),
  };
}

// Skyscanners stopps-parameter ekskluderer kategorier: "!oneStop,!twoPlusStops" = kun direkte.
export function readSkyscannerMaxStopsParam(value: string | null): number | undefined {
  const excluded = (value ?? "").split(",").map((part) => part.trim().replace(/^!/, "").toLowerCase());
  if (!excluded.includes("twoplusstops")) return undefined;
  return excluded.includes("onestop") ? 0 : 1;
}

export function buildSkyscannerFareAttributesParam(flightMeta: FlightSearchMeta): string | undefined {
  const attributes = [
    flightMeta.includeCabinBag === true ? "cabin-bag" : undefined,
    flightMeta.includeCheckedBag === true ? "checked-bag" : undefined,
  ].filter((attribute): attribute is string => attribute !== undefined);
  return attributes.length > 0 ? attributes.join(",") : undefined;
}

export function readSkyscannerFareAttributesParam(value: string | null): Pick<FlightSearchMeta, "includeCabinBag" | "includeCheckedBag"> {
  const attributes = (value ?? "").toLowerCase().split(",");
  return {
    ...(attributes.includes("cabin-bag") ? { includeCabinBag: true } : {}),
    ...(attributes.includes("checked-bag") ? { includeCheckedBag: true } : {}),
  };
}

// Uten options.fareAttributes er fareAttributes tom i web-unified-search (verifisert 2026-11-02).
export function buildSkyscannerSearchOptions(flightMeta: FlightSearchMeta): Record<string, unknown> | undefined {
  const selectedFareAttributes = [
    flightMeta.includeCabinBag === true ? "CABIN_BAG" : undefined,
    flightMeta.includeCheckedBag === true ? "CHECKED_BAG" : undefined,
  ].filter((attribute): attribute is string => attribute !== undefined);
  return selectedFareAttributes.length > 0 ? { fareAttributes: { selectedFareAttributes } } : undefined;
}

// assessment "INCLUDED" = bagasjen er med i prisen, også når fee.amount viser at den er et gebyr
// (samme regel som momondo). FEE, UNAVAILABLE og UNKNOWN betyr at prisen ikke dekker bagasjen.
export function isSkyscannerPricingOptionMatchingBaggage(pricingOption: Record<string, unknown>, flightMeta: FlightSearchMeta): boolean {
  if (flightMeta.includeCabinBag !== true && flightMeta.includeCheckedBag !== true) return true;
  const fareAttributes = isRecord(pricingOption.fareAttributes) ? pricingOption.fareAttributes : undefined;
  const isIncluded = (baggage: unknown): boolean => isRecord(baggage) && readStringValue(baggage.assessment) === "INCLUDED";
  if (flightMeta.includeCabinBag === true && !isIncluded(fareAttributes?.cabinBaggage)) return false;
  if (flightMeta.includeCheckedBag === true && !isIncluded(fareAttributes?.checkedBaggage)) return false;
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

// Skyscanner og Trip.com har ikke datovindu i søket, så hver dato er et eget søk. Tur/retur ganger
// datoene, så der holdes vinduet mindre: ±3 dager ville gitt 49 søk per kilde.
export function capFlightDateFlexForSeparateSearches(dateFlex: FlightDateFlex, roundTrip: boolean): FlightDateFlex {
  const maxDays = roundTrip ? 1 : 3;
  return {
    outboundBefore: Math.min(dateFlex.outboundBefore, maxDays),
    outboundAfter: Math.min(dateFlex.outboundAfter, maxDays),
    inboundBefore: Math.min(dateFlex.inboundBefore, maxDays),
    inboundAfter: Math.min(dateFlex.inboundAfter, maxDays),
  };
}

// Lenkene panelet åpner. De bærer søket, filtrene og sorteringen til hver kilde.
export type FinnFlightSearchScope = "exact" | "metropolitan";

export const PANFLIGHTS_AUTO_SEARCH_PARAM = "cbvAutoSearch";

export const TRIP_COM_DEFAULT_CURRENCY = "USD";

export const TRIP_COM_BASE_URL = "https://us.trip.com";

export function buildSkyscannerFlightSearchUrl(flightMeta: FlightSearchMeta, sortMode: FlightSortMode = "best"): string {
  const pathParts = [
    flightMeta.origin.toLowerCase(),
    flightMeta.destination.toLowerCase(),
    compactIsoDate(flightMeta.outboundDate).slice(2),
    flightMeta.inboundDate !== undefined ? compactIsoDate(flightMeta.inboundDate).slice(2) : undefined,
  ].filter((part): part is string => part !== undefined);
  const params = new URLSearchParams({
    adults: String(flightMeta.adults),
    adultsv2: String(flightMeta.adults),
    cabinclass: buildSkyscannerCabinClass(flightMeta).toLowerCase().replace(/_/g, ""),
    childrenv2: [...readFlightChildAges(flightMeta), ...Array.from({ length: flightMeta.infants }, () => FLIGHT_INFANT_AGE)].join("|"),
    inboundaltsenabled: "false",
    outboundaltsenabled: "false",
    preferdirects: flightMeta.maxStops === 0 ? "true" : "false",
    rtn: flightMeta.inboundDate !== undefined ? "1" : "0",
  });
  // Skyscanners stoppfilter ekskluderer kategorier: "!oneStop,!twoPlusStops" = kun direkte.
  if (flightMeta.maxStops === 0) params.set("stops", "!oneStop,!twoPlusStops");
  else if (flightMeta.maxStops === 1) params.set("stops", "!twoPlusStops");
  const fareAttributes = buildSkyscannerFareAttributesParam(flightMeta);
  if (fareAttributes !== undefined) params.set("fare-attributes", fareAttributes);
  // duration = maks minutter per etappe; siden setter reisetidsfilteret ut fra den (verifisert 2026-11-02).
  if (flightMeta.maxDurationMinutes !== undefined) params.set("duration", String(flightMeta.maxDurationMinutes));
  // Skyscanner har ikke sorteringen i URL-en; utvidelsen velger fanen når siden er lastet.
  if (sortMode !== "best") params.set(FLIGHT_LINK_SORT_PARAM, sortMode);
  return `https://www.skyscanner.no/transport/flights/${pathParts.join("/")}/?${params.toString()}`;
}

export function buildSkyscannerCabinClass(flightMeta: FlightSearchMeta): string {
  switch (flightMeta.cabinClass) {
    case "premium": return "PREMIUM_ECONOMY";
    case "business": return "BUSINESS";
    case "first": return "FIRST";
    default: return "ECONOMY";
  }
}

export function buildPanFlightsFlightSearchUrl(flightMeta: FlightSearchMeta, sortMode: FlightSortMode = "best"): string {
  const outboundDate = compactIsoDate(flightMeta.outboundDate);
  const inboundDate = flightMeta.inboundDate !== undefined ? compactIsoDate(flightMeta.inboundDate) : undefined;
  const path = inboundDate !== undefined ? "roundtrip" : "oneway";
  const v2 = inboundDate !== undefined
    ? `${flightMeta.origin}_${flightMeta.destination}_${outboundDate}_${inboundDate}`
    : `${flightMeta.origin}_${flightMeta.destination}_${outboundDate}`;
  // pad/pch/pin = voksne, barn og spedbarn; PanFlights fyller ut skjemaet fra dem (verifisert 2026-11-02).
  const params = new URLSearchParams({
    v2,
    order: buildFlightSortUrlValue("panflights", sortMode),
    pad: String(flightMeta.adults),
    ...(flightMeta.children > 0 ? { pch: String(flightMeta.children) } : {}),
    ...(flightMeta.infants > 0 ? { pin: String(flightMeta.infants) } : {}),
    [PANFLIGHTS_AUTO_SEARCH_PARAM]: "1",
  });
  const linkFilters = buildFlightLinkFiltersValue(flightMeta);
  if (linkFilters !== undefined) params.set(FLIGHT_LINK_FILTERS_PARAM, linkFilters);
  return `https://panflights.no/nb/${path}/?${params.toString()}`;
}

// Google Flights' q=-parameter forstår kun rute+datoer (kabin/passasjerer/stopp i
// fritekst knekker parsingen). tfs=-parameteren er en base64url-protobuf som bærer
// alt: legs (felt 3: dato f2, maks stopp f5, fra f13.f2, til f14.f2), passasjerer
// (felt 8, 1=voksen), kabin (felt 9: 1=economy 2=premium 3=business 4=first) og
// turtype (felt 19: 1=tur/retur 2=én vei). Felt 13 er bagasje (f2 hånd, f3 innsjekket), og felt 12
// i hver etappe er maks minutter reisetid (verifisert 2026-11-02).
export function buildGoogleFlightsSearchUrl(flightMeta: FlightSearchMeta): string {
  const params = new URLSearchParams({
    tfs: buildGoogleFlightsTfsParam(flightMeta),
    hl: "nb",
    curr: "NOK",
  });
  return `https://www.google.com/travel/flights?${params.toString()}`;
}

export function buildGoogleFlightsTfsParam(flightMeta: FlightSearchMeta): string {
  const bytes: number[] = [
    ...encodeProtoBytesField(3, encodeGoogleFlightsLeg(flightMeta.outboundDate, flightMeta.origin, flightMeta.destination, flightMeta.maxStops, flightMeta.maxDurationMinutes)),
    ...(flightMeta.inboundDate !== undefined
      ? encodeProtoBytesField(3, encodeGoogleFlightsLeg(flightMeta.inboundDate, flightMeta.destination, flightMeta.origin, flightMeta.maxStops, flightMeta.maxDurationMinutes))
      : []),
  ];
  // Felt 8 per reisende: 1 = voksen, 2 = barn, 4 = spedbarn på fanget.
  for (let index = 0; index < flightMeta.adults; index++) {
    bytes.push(...encodeProtoVarintField(8, 1));
  }
  for (let index = 0; index < flightMeta.children; index++) {
    bytes.push(...encodeProtoVarintField(8, 2));
  }
  for (let index = 0; index < flightMeta.infants; index++) {
    bytes.push(...encodeProtoVarintField(8, 4));
  }
  bytes.push(...encodeProtoVarintField(9, readGoogleFlightsSeatValue(flightMeta)));
  if (flightMeta.includeCabinBag === true || flightMeta.includeCheckedBag === true) {
    bytes.push(...encodeProtoBytesField(13, [
      ...encodeProtoVarintField(2, flightMeta.includeCabinBag === true ? 1 : 0),
      ...encodeProtoVarintField(3, flightMeta.includeCheckedBag === true ? 1 : 0),
    ]));
  }
  bytes.push(...encodeProtoVarintField(19, flightMeta.inboundDate !== undefined ? 1 : 2));
  return encodeBase64Url(bytes);
}

export function encodeGoogleFlightsLeg(
  date: string,
  origin: string,
  destination: string,
  maxStops: number | undefined,
  maxDurationMinutes: number | undefined,
): number[] {
  return [
    ...encodeProtoStringField(2, date),
    ...(maxStops !== undefined ? encodeProtoVarintField(5, maxStops) : []),
    ...(maxDurationMinutes !== undefined ? encodeProtoVarintField(12, maxDurationMinutes) : []),
    ...encodeProtoBytesField(13, encodeProtoStringField(2, origin.toUpperCase())),
    ...encodeProtoBytesField(14, encodeProtoStringField(2, destination.toUpperCase())),
  ];
}

export function readGoogleFlightsSeatValue(flightMeta: FlightSearchMeta): number {
  switch (flightMeta.cabinClass) {
    case "premium": return 2;
    case "business": return 3;
    case "first": return 4;
    default: return 1;
  }
}

export function encodeProtoVarint(value: number): number[] {
  const bytes: number[] = [];
  let remaining = Math.max(0, Math.trunc(value));
  do {
    const byte = remaining % 128;
    remaining = Math.floor(remaining / 128);
    bytes.push(remaining > 0 ? byte | 0x80 : byte);
  } while (remaining > 0);
  return bytes;
}

export function encodeProtoVarintField(fieldNumber: number, value: number): number[] {
  return [...encodeProtoVarint(fieldNumber * 8), ...encodeProtoVarint(value)];
}

export function encodeProtoStringField(fieldNumber: number, value: string): number[] {
  const encoded = [...new TextEncoder().encode(value)];
  return [...encodeProtoVarint(fieldNumber * 8 + 2), ...encodeProtoVarint(encoded.length), ...encoded];
}

export function encodeProtoBytesField(fieldNumber: number, bytes: number[]): number[] {
  return [...encodeProtoVarint(fieldNumber * 8 + 2), ...encodeProtoVarint(bytes.length), ...bytes];
}

export function encodeBase64Url(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildTripComFlightSearchUrl(flightMeta: FlightSearchMeta, sortMode: FlightSortMode = "best"): string {
  const params = new URLSearchParams({
    dcity: flightMeta.origin.toLowerCase(),
    acity: flightMeta.destination.toLowerCase(),
    ddate: flightMeta.outboundDate,
    triptype: flightMeta.inboundDate !== undefined ? "rt" : "ow",
    class: buildTripComCabinClassParam(flightMeta),
    lowpricesource: "searchform",
    quantity: String(flightMeta.adults),
    // childqty/babyqty verifisert 2026-11-02; totalPrice gjelder da alle reisende.
    ...(flightMeta.children > 0 ? { childqty: String(flightMeta.children) } : {}),
    ...(flightMeta.infants > 0 ? { babyqty: String(flightMeta.infants) } : {}),
    searchboxarg: "t",
    nonstoponly: flightMeta.maxStops === 0 ? "on" : "off",
    locale: "en-US",
    curr: TRIP_COM_DEFAULT_CURRENCY,
  });
  if (flightMeta.inboundDate !== undefined) params.set("rdate", flightMeta.inboundDate);
  // Trip husker filtre mellom søk; "none" lar utvidelsen fjerne filtre søket ikke har.
  params.set(FLIGHT_LINK_FILTERS_PARAM, buildFlightLinkFiltersValue(flightMeta) ?? "none");
  if (sortMode !== "best") params.set(FLIGHT_LINK_SORT_PARAM, sortMode);
  return `${TRIP_COM_BASE_URL}/flights/showfarefirst?${params.toString()}`;
}

export function buildTripComCabinClassParam(flightMeta: FlightSearchMeta): string {
  switch (flightMeta.cabinClass) {
    case "premium": return "s";
    case "business": return "c";
    case "first": return "f";
    default: return "y";
  }
}

const KIWI_CABIN_CLASSES: Record<FlightCabinClass, string> = {
  economy: "ECONOMY",
  premium: "PREMIUM_ECONOMY",
  business: "BUSINESS",
  first: "FIRST_CLASS",
};

// Kiwi krever stedsnavn i stien. Lenken bærer IATA-koder, og innholdsskriptet bytter dem mot
// navnene når siden åpnes. Parametrene er verifisert mot kiwi.com (2026-11-02).
export function buildKiwiFlightSearchUrl(flightMeta: FlightSearchMeta, sortMode: FlightSortMode = "best"): string {
  const { dateFlex } = flightMeta;
  const formatDate = (date: string, before = 0, after = 0): string => {
    return before === 0 && after === 0
      ? date
      : `${shiftFlightDateNotBeforeToday(date, -before)}_${shiftFlightDateNotBeforeToday(date, after)}`;
  };
  const pathParts = [
    flightMeta.origin,
    flightMeta.destination,
    formatDate(flightMeta.outboundDate, dateFlex?.outboundBefore, dateFlex?.outboundAfter),
    flightMeta.inboundDate !== undefined
      ? formatDate(flightMeta.inboundDate, dateFlex?.inboundBefore, dateFlex?.inboundAfter)
      : "no-return",
  ];
  const params = new URLSearchParams({
    adults: String(flightMeta.adults),
    children: String(flightMeta.children),
    infants: String(flightMeta.infants),
  });
  if (flightMeta.cabinClass !== undefined && flightMeta.cabinClass !== "economy") {
    params.set("cabinClass", `${KIWI_CABIN_CLASSES[flightMeta.cabinClass]}-false`);
  }
  const bags = buildKiwiBagsParam(flightMeta);
  if (bags !== undefined) params.set("bags", bags);
  // Kiwi tilbyr bare direkte, opptil 1 og opptil 2 stopp. «true» tillater stopp med overnatting, som «Alle».
  if (flightMeta.maxStops !== undefined && flightMeta.maxStops <= 2) params.set("stopNumber", `${flightMeta.maxStops}~true`);
  // Hele timer per etappe. Runder ned, så ingen reise blir lengre enn valgt grense.
  if (flightMeta.maxDurationMinutes !== undefined) {
    params.set("flightDurationMax", String(Math.max(1, Math.floor(flightMeta.maxDurationMinutes / 60))));
  }
  if (sortMode !== "best") params.set("sortBy", buildFlightSortUrlValue("kiwi", sortMode));
  return `https://www.kiwi.com/no/search/results/${pathParts.join("/")}?${params.toString()}`;
}

// «håndbagasje.innsjekket» per passasjer: _ mellom passasjerer og - mellom voksne og barn. Spedbarn har ingen.
function buildKiwiBagsParam(flightMeta: FlightSearchMeta): string | undefined {
  if (flightMeta.includeCabinBag !== true && flightMeta.includeCheckedBag !== true) return undefined;
  const bag = `${flightMeta.includeCabinBag === true ? 1 : 0}.${flightMeta.includeCheckedBag === true ? 1 : 0}`;
  return [flightMeta.adults, flightMeta.children]
    .filter((count) => count > 0)
    .map((count) => Array.from({ length: count }, () => bag).join("_"))
    .join("-");
}

export function readKiwiBagsParam(value: string | null): Pick<FlightSearchMeta, "includeCabinBag" | "includeCheckedBag"> {
  const [cabinBags, checkedBags] = (value?.split(/[_-]/)[0] ?? "").split(".").map(Number);
  return {
    ...((cabinBags ?? 0) > 0 ? { includeCabinBag: true } : {}),
    ...((checkedBags ?? 0) > 0 ? { includeCheckedBag: true } : {}),
  };
}

export type KiwiSearchPath = { origin: string; destination: string; outbound: string; inbound?: string };

export function readKiwiSearchPath(parsedUrl: URL): KiwiSearchPath | undefined {
  if (parsedUrl.hostname.replace(/^www\./, "").toLowerCase() !== "kiwi.com") return undefined;
  const match = parsedUrl.pathname.match(/^\/[a-z]{2}\/search\/results\/([^/]+)\/([^/]+)\/([^/]+)(?:\/([^/]+))?\/?$/);
  if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) return undefined;
  return {
    origin: match[1],
    destination: match[2],
    outbound: match[3],
    ...(match[4] !== undefined && match[4] !== "no-return" ? { inbound: match[4] } : {}),
  };
}

// «2026-11-08_2026-11-14» er et datovindu; midtpunktet regnes som valgt dato.
export function readKiwiDatePart(value: string): { date: string; flexDays: number } | undefined {
  const [start, end] = value.split("_");
  if (start === undefined || readIsoDateValue(start) === undefined) return undefined;
  if (end === undefined) return { date: start, flexDays: 0 };
  if (readIsoDateValue(end) === undefined) return undefined;
  const flexDays = Math.floor((Date.parse(end) - Date.parse(start)) / 86_400_000 / 2);
  const date = addDaysToIsoDate(start, flexDays);
  return date !== undefined && flexDays >= 0 ? { date, flexDays } : undefined;
}

export function buildMomondoFlightSearchUrl(flightMeta: FlightSearchMeta, sortMode: FlightSortMode = "best"): string {
  const { dateFlex } = flightMeta;
  const formatDate = (date: string, flexDays: number): string => {
    if (flexDays === 0) return date;
    return `${date}-flexible-${flexDays}${flexDays === 1 ? "day" : "days"}`;
  };
  const pathParts = [
    `${flightMeta.origin}-${flightMeta.destination}`,
    formatDate(flightMeta.outboundDate, dateFlex !== undefined ? readMomondoFlightFlexDays(dateFlex.outboundBefore, dateFlex.outboundAfter) : 0),
    flightMeta.inboundDate !== undefined
      ? formatDate(flightMeta.inboundDate, dateFlex !== undefined ? readMomondoFlightFlexDays(dateFlex.inboundBefore, dateFlex.inboundAfter) : 0)
      : undefined,
    ...buildMomondoPassengerPathParts(flightMeta),
    flightMeta.cabinClass !== undefined && flightMeta.cabinClass !== "economy" ? flightMeta.cabinClass : undefined,
  ].filter((part): part is string => part !== undefined);
  // Med datovindu sorteres på pris, så de billigste kombinasjonene kommer med i svaret.
  const params = new URLSearchParams({ sort: dateFlex !== undefined ? "price_a" : buildFlightSortUrlValue("momondo", sortMode) });
  const momondoFilters = buildMomondoFlightFilterValue(flightMeta);
  if (momondoFilters !== undefined) params.set("fs", momondoFilters);
  return `https://www.momondo.no/flight-search/${pathParts.map(encodeURIComponent).join("/")}?${params.toString()}`;
}

export function buildFinnFlightSearchUrl(
  flightMeta: FlightSearchMeta,
  scope: FinnFlightSearchScope = "exact",
): string {
  const params = new URLSearchParams({
    adults: String(flightMeta.adults),
    // FINN: barn 2–11 år og spedbarn 0–1 år som antall.
    ...(flightMeta.children > 0 ? { children: String(flightMeta.children) } : {}),
    ...(flightMeta.infants > 0 ? { infants: String(flightMeta.infants) } : {}),
    // finn aksepterer economy|premium|business|first (verifisert mot søkeskjemaet).
    cabinType: flightMeta.cabinClass ?? "economy",
    requestedDepartureDate: flightMeta.outboundDate,
    requestedDestination: `${flightMeta.destination}.${scope === "metropolitan" ? "METROPOLITAN_AREA" : "AIRPORT"}`,
    requestedOrigin: `${flightMeta.origin}.${scope === "metropolitan" ? "METROPOLITAN_AREA" : "AIRPORT"}`,
    tripType: flightMeta.inboundDate !== undefined ? "roundtrip" : "oneway",
  });
  if (scope === "exact") {
    const exactAirportParams = buildFinnFlightExactAirportParams(flightMeta);
    for (const [key, value] of exactAirportParams.entries()) {
      params.set(key, value);
    }
  }
  if (flightMeta.inboundDate !== undefined) {
    params.set("requestedReturnDate", flightMeta.inboundDate);
  }
  // Filtrene leses fra URL-en av FINNs resultatside, så lenken åpner samme filtrerte søk.
  if (flightMeta.includeCabinBag === true) params.set("handLuggage", "true");
  if (flightMeta.includeCheckedBag === true) params.set("checkedLuggage", "true");
  if (flightMeta.maxStops !== undefined) params.set("maximumNumberOfStops", String(flightMeta.maxStops));
  if (flightMeta.maxDurationMinutes !== undefined) params.set("durationTo", String(flightMeta.maxDurationMinutes));
  return `https://www.finn.no/reise/flybilletter/resultat/?${params.toString()}`;
}

export function buildFinnFlightExactAirportParams(flightMeta: FlightSearchMeta): URLSearchParams {
  const params = new URLSearchParams({
    departureAirportLeg1: flightMeta.origin,
    arrivalAirportLeg1: flightMeta.destination,
  });
  if (flightMeta.inboundDate !== undefined) {
    params.set("departureAirportLeg2", flightMeta.destination);
    params.set("arrivalAirportLeg2", flightMeta.origin);
  }
  return params;
}

export function compactIsoDate(value: string): string {
  return value.replace(/-/g, "");
}
