// Dev-verifisering av hotellpris-kildene (FINN/Vio, Skyscanner, momondo).
// Replikerer extensionens API-kall (samme endepunkter/headere) i ekte Chrome
// og skriver ut billigste totalpris per kilde, slik at panelet kan verifiseres
// mot det sidene selv viser.
//
// Bruk:
//   node scripts/dev/verify-hotel-sources.mjs --hotel "Carlton Hotel Bangkok Sukhumvit" --city Bangkok --in 2026-08-28 --out 2026-08-31 --adults 2 --rooms 1
//   node scripts/dev/verify-hotel-sources.mjs --source finn --hotel "Scandic Bergen City" --city Bergen --in 2026-09-09 --out 2026-09-17

import { createRequire } from "node:module";

const require = createRequire(new URL("../../node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/package.json", import.meta.url));
const { chromium } = require("playwright");

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, all) => {
    if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
    return pairs;
  }, []),
);

const meta = {
  hotelName: args.hotel ?? "Carlton Hotel Bangkok Sukhumvit",
  destinationName: args.city,
  checkIn: args.in ?? "2026-08-28",
  checkOut: args.out ?? "2026-08-31",
  adults: Number(args.adults ?? 2),
  rooms: Number(args.rooms ?? 1),
};
const source = args.source ?? "alle";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const uuid = () => crypto.randomUUID();

const query = meta.destinationName !== undefined && !meta.hotelName.toLowerCase().includes(meta.destinationName.toLowerCase())
  ? `${meta.hotelName} ${meta.destinationName}`
  : meta.hotelName;

const VIO_KEY = "vio_website_8f7d6e5c4b3a2d1e0f9c8b7a6d5e4f3c";
const VIO_HOST = "https://d3ky5oye7kybzk.cloudfront.net";

function vioRoomsParam() {
  const base = Math.floor(meta.adults / meta.rooms);
  const extra = meta.adults % meta.rooms;
  return Array.from({ length: meta.rooms }, (_, index) => String(base + (index < extra ? 1 : 0))).join("|");
}

async function verifyFinn() {
  const base = {
    checkIn: meta.checkIn, checkOut: meta.checkOut, rooms: vioRoomsParam(), currency: "NOK", language: "no",
    brand: "finn", userCountry: "NO", optimizeRooms: "false", getAllOffers: "true", searchId: uuid(), anonymousId: uuid(),
  };
  const anchorRes = await fetch(`${VIO_HOST}/anchor?${new URLSearchParams({ ...base, query })}`, { headers: { "x-api-key": VIO_KEY } });
  const anchor = await anchorRes.json();
  console.log(`FINN anchor: ${anchorRes.status} type=${anchor.anchorType} ${anchor.anchor?.objectID} «${anchor.anchor?.hotelName}»`);
  const hotelId = (anchor.anchor?.objectID ?? "").replace(/^hotel:/, "");
  if (!/^\d+$/.test(hotelId)) return;

  for (let attempt = 0; attempt < 8; attempt++) {
    if (attempt > 0) await sleep(1100);
    const params = new URLSearchParams({ ...base, hotelIds: hotelId, clientRequestId: uuid() });
    const response = await fetch(`${VIO_HOST}/offers/poll?${params}`, { headers: { "x-api-key": VIO_KEY } });
    const value = await response.json();
    const offers = value.results?.[0]?.offers ?? [];
    const quotes = offers
      .map((offer) => ({ provider: offer.metadata?.brandInfo?.brandName ?? offer.providerCode, total: Math.round(offer.rate.base + offer.rate.taxes + offer.rate.hotelFees) }))
      .sort((left, right) => left.total - right.total);
    console.log(`  poll ${attempt + 1}: complete=${value.status?.complete} ${quotes.slice(0, 5).map((quote) => `${quote.provider} ${quote.total}`).join(", ")}`);
    if (value.status?.complete) break;
  }
  console.log(`  deeplink: https://hotell.finn.no/Hotel/${hotelId}/no?checkIn=${meta.checkIn}&checkOut=${meta.checkOut}&rooms=${vioRoomsParam()}`);
}

async function verifySkyscanner(context) {
  const page = await context.newPage();
  await page.goto("https://www.skyscanner.no/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await sleep(4000);

  const suggestRes = await page.request.get(`https://www.skyscanner.no/g/autosuggest-search/api/v1/search-hotel/NO/nb-NO/${encodeURIComponent(query)}`, { headers: { Accept: "application/json" } });
  if (!suggestRes.ok()) { console.log("Skyscanner autosuggest:", suggestRes.status()); return; }
  const suggestions = await suggestRes.json();
  const hotel = suggestions.find((item) => item.class === "Hotel");
  console.log(`Skyscanner autosuggest: ${suggestions.length} treff, hotell=${hotel?.entity_id} «${hotel?.entity_name}» (${hotel?.hierarchy})`);
  if (hotel === undefined) return;

  const payload = {
    hotelId: hotel.entity_id, entityId: "", filters: [], priceType: "PRICE_TYPE_PER_NIGHT",
    travellerContext: { market: "NO", locale: "nb-NO", currency: "NOK", checkinDate: meta.checkIn, checkoutDate: meta.checkOut, adults: meta.adults, childrenAges: [], rooms: meta.rooms },
    requestContext: { debug: false },
    sessionId: uuid().replace(/-/g, ""),
  };
  for (let attempt = 0; attempt < 8; attempt++) {
    if (attempt > 0) await sleep(1200);
    const response = await page.request.post("https://www.skyscanner.no/g/hotel-unified-bff/v1/HotelDetailPrice", {
      headers: { "Content-Type": "application/json", Accept: "application/json", "x-user-agent": "M;B2B;web" },
      data: payload,
    });
    if (!response.ok()) { console.log("  HotelDetailPrice:", response.status(), (await response.text()).slice(0, 120)); return; }
    const value = await response.json();
    const quotes = (value.offers ?? [])
      .map((offer) => ({ provider: offer.partner?.name, total: Math.round(offer.price?.priceWithAllTaxes ?? offer.price?.secondaryPrice ?? 0), room: offer.roomName }))
      .filter((quote) => quote.total > 0)
      .sort((left, right) => left.total - right.total);
    console.log(`  poll ${attempt + 1}: ${value.pollingStatus} minTotal=${value.priceSummary?.minTotalPrice} ${quotes.slice(0, 5).map((quote) => `${quote.provider} ${quote.total} (${quote.room})`).join(", ")}`);
    if (value.pollingStatus === "SEARCH_STATUS_COMPLETED") {
      console.log(`  deeplink: ${value.detailsPageUrl}`);
      break;
    }
  }
}

async function verifyMomondo(context) {
  const page = await context.newPage();
  await page.goto("https://www.momondo.no/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await sleep(3000);

  const suggestRes = await page.request.get(`https://www.momondo.no/mvm/smartyv2/search?${new URLSearchParams({ f: "j", s: "50", where: query, lc_cc: "NO", lc: "no", sv: "5" })}`, { headers: { Accept: "application/json" } });
  const suggestions = await suggestRes.json();
  const hotel = suggestions.find((item) => item.loctype === "hotel");
  console.log(`momondo smarty: ${suggestions.length} treff, hotell hid=${hotel?.hid} placeID=${hotel?.placeID} «${hotel?.hotelname}» (${hotel?.cityonly})`);
  if (hotel === undefined) return;

  const slugify = (value) => value.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const roomsPart = meta.rooms > 1 ? `/${meta.rooms}rooms` : "";
  const detailUrl = `https://www.momondo.no/hotel-search/${slugify(hotel.hotelname)},${slugify(hotel.cityonly ?? "")}-p${hotel.placeID}-h${hotel.hid}-details/${meta.checkIn}/${meta.checkOut}/${meta.adults}adults${roomsPart}?pm=total`;
  console.log(`  deeplink: ${detailUrl}`);

  const html = await (await page.request.get(detailUrl, { headers: { Accept: "text/html" } })).text();
  const formToken = html.match(/window\.R9\.formToken\s*=\s*'([^']+)'/)?.[1] ?? html.match(/window\.R9\.formToken\s*=\s*"([^"]+)"/)?.[1];
  console.log(`  formToken: ${formToken !== undefined ? "ok" : "MANGLER"}`);
  if (formToken === undefined) return;

  const params = new URLSearchParams({ hid: hotel.hid, checkin: meta.checkIn, checkout: meta.checkOut, rooms: String(meta.rooms), adults: String(meta.adults), childAges: "", priceMode: "total" });
  const ratesRes = await page.request.get(`https://www.momondo.no/i/api/search/dynamic/hotels/rates?${params}`, {
    headers: { Accept: "application/json", "X-CSRF": formToken, "x-kayak-session-error-check": "iris" },
  });
  if (!ratesRes.ok()) { console.log("  rates:", ratesRes.status(), (await ratesRes.text()).slice(0, 150)); return; }
  const rates = await ratesRes.json();
  const quotes = [];
  const selected = rates.selectedBookingOption;
  if (selected?.totalPrice?.price !== undefined) quotes.push({ provider: selected.localizedProviderName, total: selected.totalPrice.price, room: "(valgt)" });
  for (const group of rates.groups ?? []) {
    for (const row of group.rows ?? []) {
      for (const option of row.bookingOptions ?? []) {
        if (option.totalPrice?.price !== undefined) quotes.push({ provider: option.localizedProviderName, total: option.totalPrice.price, room: row.localizedDescription });
      }
    }
  }
  quotes.sort((left, right) => left.total - right.total);
  console.log(`  rates: ${quotes.length} opsjoner, billigste: ${quotes.slice(0, 5).map((quote) => `${quote.provider} ${quote.total} (${quote.room})`).join(", ")}`);
}

const browser = await chromium.launch({ headless: false, channel: "chrome", args: ["--disable-blink-features=AutomationControlled"] });
const context = await browser.newContext({ locale: "nb-NO", timezoneId: "Europe/Oslo" });
try {
  if (source === "alle" || source === "finn") await verifyFinn();
  if (source === "alle" || source === "skyscanner") await verifySkyscanner(context);
  if (source === "alle" || source === "momondo") await verifyMomondo(context);
} finally {
  await browser.close();
}
