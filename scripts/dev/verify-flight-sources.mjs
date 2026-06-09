// Dev-verifisering av flypris-kildene (FINN, momondo, Trip.com).
// Replikerer extensionens API-kall i en ekte Chrome-side og sammenligner
// med det nettsiden selv viser, slik at vi kan bekrefte Beste/Recommended-sortering.
//
// Bruk:
//   node scripts/dev/verify-flight-sources.mjs --source finn --origin OSL --destination LHR --out 2026-08-12 --in 2026-08-19
//   node scripts/dev/verify-flight-sources.mjs --source tripcom --origin SEL --destination TYO --out 2026-07-16 --in 2026-07-23

import { createRequire } from "node:module";

const require = createRequire(new URL("../../node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/package.json", import.meta.url));
const { chromium } = require("playwright");

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, all) => {
    if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
    return pairs;
  }, []),
);

const route = {
  origin: (args.origin ?? "OSL").toUpperCase(),
  destination: (args.destination ?? "LHR").toUpperCase(),
  outboundDate: args.out ?? "2026-08-12",
  inboundDate: args.in,
  adults: Number(args.adults ?? 1),
};
const source = args.source ?? "finn";
const headless = args.headless === "true";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fmt = (n) => (n === undefined ? "?" : `${Math.round(n)}`);
const fmtDur = (minutes) => {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return "?";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}t ${m}m`;
};

async function launch() {
  const browser = await chromium.launch({
    headless,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    locale: "nb-NO",
    timezoneId: "Europe/Oslo",
    viewport: { width: 1440, height: 1000 },
  });
  return { browser, context };
}

async function dumpVisibleResults(page, marker, length = 2600) {
  const text = await page.evaluate(() => document.body?.innerText ?? "");
  const normalized = text.replace(/ /g, " ");
  const index = marker !== undefined ? normalized.search(marker) : 0;
  return normalized.slice(Math.max(0, index), Math.max(0, index) + length);
}

// ---------- FINN ----------
async function verifyFinn(context) {
  const scope = args.scope === "metropolitan" ? "METROPOLITAN_AREA" : "AIRPORT";
  const params = new URLSearchParams({
    adults: String(route.adults),
    cabinType: "economy",
    requestedDepartureDate: route.outboundDate,
    requestedDestination: `${route.destination}.${scope}`,
    requestedOrigin: `${route.origin}.${scope}`,
    tripType: route.inboundDate !== undefined ? "roundtrip" : "oneway",
  });
  if (scope === "AIRPORT") {
    params.set("departureAirportLeg1", route.origin);
    params.set("arrivalAirportLeg1", route.destination);
  }
  if (route.inboundDate !== undefined) {
    params.set("requestedReturnDate", route.inboundDate);
    if (scope === "AIRPORT") {
      params.set("departureAirportLeg2", route.destination);
      params.set("arrivalAirportLeg2", route.origin);
    }
  }
  const url = `https://www.finn.no/reise/flybilletter/resultat/?${params.toString()}`;
  console.log("FINN URL:", url);

  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

  const nextData = await page.evaluate(() => {
    const text = document.getElementById("__NEXT_DATA__")?.textContent;
    try { return text ? JSON.parse(text) : undefined; } catch { return undefined; }
  });
  const searchData = nextData?.props?.pageProps?.searchData;
  const flightApiUrl = nextData?.props?.pageProps?.config?.flightApiUrl ?? "https://www.finn.no/travel-api/flight";
  if (!searchData?.searchId) {
    console.log("FINN: fant ikke searchId i __NEXT_DATA__");
    console.log(await dumpVisibleResults(page, undefined, 1200));
    return;
  }
  console.log("FINN searchId:", searchData.searchId);

  const pollParams = new URLSearchParams();
  for (const key of ["departureAirportLeg1", "arrivalAirportLeg1", "departureAirportLeg2", "arrivalAirportLeg2"]) {
    if (typeof searchData[key] === "string" && searchData[key].length > 0) pollParams.set(key, searchData[key]);
  }

  let result;
  let progress = 0;
  const maxPolls = Number(args.polls ?? 9);
  const startedAt = Date.now();
  for (let attempt = 0; attempt < maxPolls; attempt++) {
    await sleep(1100);
    pollParams.set("cacheBuster", String(Date.now()));
    pollParams.set("progress", String(progress));
    const pollUrl = `${flightApiUrl.replace(/\/$/, "")}/result/${encodeURIComponent(searchData.searchId)}?${pollParams.toString()}`;
    const response = await page.request.get(pollUrl, { headers: { Accept: "application/json" } });
    if (!response.ok()) { console.log("FINN poll status:", response.status()); continue; }
    const value = await response.json().catch(() => undefined);
    if (!value || !Array.isArray(value.trips)) continue;
    result = value;
    progress = typeof value.progress === "number" ? value.progress : progress;
    const cheapest = Math.min(...value.trips.flatMap((trip) => (Array.isArray(trip.offers) ? trip.offers : []).map((o) => o.priceAmount).filter((n) => typeof n === "number")));
    console.log(`  poll ${attempt + 1} (${Math.round((Date.now() - startedAt) / 1000)}s): progress=${progress}, trips=${value.trips.length}, billigst=${Number.isFinite(cheapest) ? Math.round(cheapest) : "?"}kr`);
    if (progress >= 100) break;
  }
  if (!result) { console.log("FINN: ingen API-resultater"); return; }

  console.log(`FINN API progress=${progress}, trips=${result.trips.length}. Topp 10 trips (API-rekkefølge):`);
  for (const trip of result.trips.slice(0, 10)) {
    const legs = Array.isArray(trip.legs) ? trip.legs : [];
    const legText = legs.map((leg) => {
      const segs = Array.isArray(leg.legs) ? leg.legs : Array.isArray(leg.segments) ? leg.segments : [];
      const duration = leg.duration ?? leg.durationMinutes;
      const carriers = [...new Set(segs.map((s) => s.airlineName ?? s.airline ?? s.carrier).filter(Boolean))].join("+");
      return `${leg.departureAirportCode ?? leg.origin ?? "?"}→${leg.arrivalAirportCode ?? leg.destination ?? "?"} ${fmtDur(duration)} ${carriers}`;
    }).join(" | ");
    const offers = Array.isArray(trip.offers) ? trip.offers : [];
    const offerText = offers.slice(0, 3).map((o) => `${o.brand} ${fmt(o.priceAmount)}kr`).join(", ");
    console.log(`  - [${offerText}] ${legText}`);
  }

  await page.waitForTimeout(4000);
  console.log("\nFINN synlig liste (utdrag):\n", await dumpVisibleResults(page, /Beste|Anbefalt|Billigst/i));
}

// ---------- momondo ----------
async function verifyMomondo(context) {
  const pathParts = [`${route.origin}-${route.destination}`, route.outboundDate, route.inboundDate].filter(Boolean);
  const url = `https://www.momondo.no/flight-search/${pathParts.join("/")}?sort=bestflight_a`;
  console.log("momondo URL:", url);

  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);

  const formToken = await page.evaluate(() => window.R9?.formToken);
  if (!formToken) {
    console.log("momondo: fant ikke formToken (bot-sjekk?). Synlig tekst:");
    console.log(await dumpVisibleResults(page, undefined, 800));
    return;
  }
  console.log("momondo formToken: ok");

  const payloadFor = (searchId) => ({
    filterParams: {},
    userSearchParams: {
      legs: [
        { origin: { locationType: "airports", airports: [route.origin] }, destination: { locationType: "airports", airports: [route.destination] }, date: route.outboundDate, flex: "exact" },
        ...(route.inboundDate ? [{ origin: { locationType: "airports", airports: [route.destination] }, destination: { locationType: "airports", airports: [route.origin] }, date: route.inboundDate, flex: "exact" }] : []),
      ],
      ...(searchId ? { searchId } : {}),
      passengers: Array.from({ length: route.adults }, () => "ADT"),
      passengerDetails: Array.from({ length: route.adults }, () => ({ ptc: "ADT" })),
      sortMode: "bestflight_a",
    },
    searchMetaData: { pageNumber: 1, searchTypes: [], ...(searchId ? { skipResultsInSecondPhase: false } : {}) },
  });

  let result;
  let searchId;
  for (let attempt = 0; attempt < 8; attempt++) {
    if (attempt > 0) await sleep(1200);
    const value = await page.evaluate(async ({ token, payload }) => {
      const response = await fetch("https://www.momondo.no/i/api/search/dynamic/flights/poll", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF": token, "x-kayak-session-error-check": "iris" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      try { return await response.json(); } catch { return { status: response.status }; }
    }, { token: formToken, payload: payloadFor(searchId) });
    if (!value || !Array.isArray(value.results)) { console.log("momondo poll:", JSON.stringify(value).slice(0, 200)); continue; }
    result = value;
    searchId = value.searchId ?? searchId;
    if (value.status === "complete" && attempt > 1) break;
  }
  if (!result) { console.log("momondo: ingen API-resultater"); return; }

  const segmentsById = result.segments ?? {};
  const airlines = result.airlines ?? {};
  const providers = result.providers ?? {};
  console.log(`momondo API results=${result.results.length}, status=${result.status}. Topp 10 (API-rekkefølge, uten self-transfer-filter):`);
  for (const item of result.results.slice(0, 10)) {
    const legs = Array.isArray(item.legs) ? item.legs : [];
    const legText = legs.map((leg) => {
      const segs = (Array.isArray(leg.segments) ? leg.segments : []).map((ref) => segmentsById[ref.id]).filter(Boolean);
      const duration = segs.reduce((total, seg) => total + (seg.duration ?? 0), 0);
      const carriers = [...new Set(segs.map((seg) => airlines[seg.airline]?.name ?? seg.airline))].join("+");
      const first = segs[0];
      const last = segs[segs.length - 1];
      return `${first?.origin ?? "?"}→${last?.destination ?? "?"} ${fmtDur(duration)} ${carriers}`;
    }).join(" | ");
    const options = (Array.isArray(item.bookingOptions) ? item.bookingOptions : []).slice(0, 3).map((option) => {
      const provider = providers[option.providerCode]?.displayName ?? option.providerCode;
      const amount = option.displayPrice?.price ?? option.fees?.totalPrice?.price ?? option.price;
      return `${provider} ${fmt(amount)}`;
    }).join(", ");
    const flags = [item.type === "fsr" ? "FSR" : undefined, item.hasSelfTransfer ? "selfTransfer" : undefined].filter(Boolean).join(",");
    console.log(`  - [${options}]${flags ? ` (${flags})` : ""} ${legText}`);
  }

  await page.waitForTimeout(6000);
  console.log("\nmomondo synlig liste (utdrag):\n", await dumpVisibleResults(page, /\bBest\b/i));
}

// ---------- Trip.com ----------
async function verifyTripCom(context) {
  const params = new URLSearchParams({
    dcity: route.origin.toLowerCase(),
    acity: route.destination.toLowerCase(),
    ddate: route.outboundDate,
    triptype: route.inboundDate !== undefined ? "rt" : "ow",
    class: "y",
    lowpricesource: "searchform",
    quantity: String(route.adults),
    searchboxarg: "t",
    nonstoponly: "off",
    locale: "en-US",
    curr: "USD",
  });
  if (route.inboundDate !== undefined) params.set("rdate", route.inboundDate);
  const url = `https://us.trip.com/flights/showfarefirst?${params.toString()}`;
  console.log("Trip.com URL:", url);

  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(15000);
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(700);
  }

  const buildPayload = (sortOrder, grade) => ({
    mode: 0,
    searchCriteria: {
      grade,
      realGrade: 1,
      tripType: route.inboundDate !== undefined ? 2 : 1,
      journeyNo: 1,
      passengerInfoType: { adultCount: route.adults, childCount: 0, infantCount: 0 },
      journeyInfoTypes: [
        { journeyNo: 1, departCode: route.origin, arriveCode: route.destination, departDate: route.outboundDate, departAirport: "", arriveAirport: "" },
        ...(route.inboundDate ? [{ journeyNo: 2, departCode: route.destination, arriveCode: route.origin, departDate: route.inboundDate, departAirport: "", arriveAirport: "" }] : []),
      ],
      policyId: null,
    },
    sortInfoType: { orderBy: sortOrder, direction: true, topList: [] },
    filterType: { filterFlagTypes: [], queryItemSettings: [], studentsSelectedStatus: true },
    tagList: [],
    flagList: ["NEED_RESET_SORT", "FullDataCache"],
    abtList: [
      { abCode: "250811_IBU_wjrankol", abVersion: "A" },
      { abCode: "251023_IBU_pricetool", abVersion: "E" },
      { abCode: "260302_IBU_farecardjc", abVersion: "B" },
    ],
    head: {
      cid: "", ctok: "", cver: "3", lang: "01", sid: "8888", syscode: "40", auth: "", xsid: "",
      extension: [
        { name: "source", value: "ONLINE" },
        { name: "sotpGroup", value: "Trip" },
        { name: "sotpLocale", value: "en-US" },
        { name: "sotpCurrency", value: "USD" },
        { name: "allianceID", value: "0" },
        { name: "sid", value: "0" },
        { name: "ouid", value: "" },
        { name: "uuid" },
        { name: "useDistributionType", value: "1" },
        { name: "flt_app_session_transactionId", value: `1-mf-${Date.now()}-WEB` },
        { name: "vid", value: `${Date.now()}.${Array.from({ length: 12 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]).join("")}` },
        { name: "pvid", value: "1" },
        { name: "Flt_SessionId", value: "1" },
        { name: "channel", value: "EnglishSite" },
        { name: "x-ua", value: "v=3_os=ONLINE_osv=10.15.7" },
        { name: "PageId", value: "10320667452" },
        { name: "clientTime", value: new Date().toISOString() },
        { name: "LowPriceSource", value: "searchForm" },
        { name: "Flt_BatchId", value: `${Date.now()}` },
        { name: "BlockTokenTimeout", value: "0" },
        { name: "full_link_time_scene", value: "pure_list_page" },
        { name: "xproduct", value: "baggage" },
        { name: "hotelEntrance", value: "Flight" },
        { name: "units", value: "METRIC" },
        { name: "sotpUnit", value: "METRIC" },
      ],
      Locale: "en-US", Language: "en", Currency: "USD", ClientID: "", appid: "700020",
    },
  });

  for (const [sortOrder, grade] of [["Score", 1], ["Direct", 1], ["Price", 1], ["Score", 3]]) {
    const text = await page.evaluate(async (payload) => {
      const response = await fetch("https://us.trip.com/restapi/soa2/27015/FlightListSearchSSE", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(payload),
        credentials: "omit",
      });
      return await response.text();
    }, buildPayload(sortOrder, grade));

    const records = text.split(/\n\n+/).flatMap((block) => {
      const data = block.split(/\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n").trim();
      if (data.length === 0 || data === "[DONE]") return [];
      try { return [JSON.parse(data)]; } catch { return []; }
    });
    const result = records.find((record) => Array.isArray(record.itineraryList)) ?? records[records.length - 1];
    if (!result || !Array.isArray(result.itineraryList)) {
      console.log(`Trip.com ${sortOrder}: ingen itineraryList (resp ${text.slice(0, 200)})`);
      continue;
    }
    const airlineNames = Object.fromEntries((result.airlineList ?? []).map((airline) => [airline.code ?? airline.airlineCode, airline.name ?? airline.airlineName]));
    console.log(`\nTrip.com sort=${sortOrder} grade=${grade}: ${result.itineraryList.length} itineraries, lowestPrice=${fmt(result.basicInfo?.lowestPrice?.totalPrice)}. Topp 10:`);
    for (const itinerary of result.itineraryList.slice(0, 10)) {
      const journeys = itinerary.journeyList ?? [];
      const legText = journeys.map((journey) => {
        const sections = journey.transSectionList ?? [];
        const carriers = [...new Set(sections.map((section) => airlineNames[section.flightInfo?.airlineCode] ?? section.flightInfo?.airlineCode))].join("+");
        const dep = sections[0]?.departDateTime?.slice(11, 16) ?? "?";
        const arr = sections[sections.length - 1]?.arriveDateTime?.slice(11, 16) ?? "?";
        const stops = Math.max(0, sections.length - 1);
        return `${dep}-${arr} ${fmtDur(journey.duration)} ${stops === 0 ? "direkte" : `${stops} stopp`} ${carriers}`;
      }).join(" | ");
      const price = itinerary.policies?.[0]?.price;
      const amount = price?.totalPrice ?? price?.averagePrice ?? price?.adult?.totalPrice;
      console.log(`  - $${fmt(amount)} ${legText}`);
    }
  }

  console.log("\nTrip.com synlig liste (utdrag):\n", await dumpVisibleResults(page, /Selected for You|Recommended/i, 5000));
}

const { browser, context } = await launch();
try {
  if (source === "finn") await verifyFinn(context);
  else if (source === "momondo") await verifyMomondo(context);
  else if (source === "tripcom") await verifyTripCom(context);
  else console.log("Ukjent --source:", source);
} finally {
  await browser.close();
}
