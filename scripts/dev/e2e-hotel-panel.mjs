// E2E-test av hotellprispanelet med bygget extension på ekte hotellsider
// (skyscanner/hotell.finn.no/momondo/booking.com). Dumper kortene fra shadow
// root og sidens egen synlige toppris, slik at billigste-pris kan verifiseres.
//
// Bruk:
//   node scripts/dev/e2e-hotel-panel.mjs [--target skyscannerhotel|finnhotel|momondohotel|booking|hotelscom|tripcom|agodahotel|expediahotel|skyscannersearch|finnsearch|momondosearch|agodasearch|expediasearch|hotelscomsearch|bookingsearch|triplist] [--url <URL>]
// Husk `pnpm run build:extension` først.

import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(new URL("../../node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/package.json", import.meta.url));
const { chromium } = require("playwright");

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, all) => {
    if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
    return pairs;
  }, []),
);

const TARGET_URLS = {
  skyscannerhotel: "https://www.skyscanner.no/hotels/norway/bergen-hotels/scandic-bergen-city/ht-105481843?adults=2&checkin=2026-09-09&checkout=2026-09-17&rooms=1",
  finnhotel: "https://hotell.finn.no/Hotel/1878462/no?checkIn=2026-08-13&checkOut=2026-08-21&rooms=2&currency=NOK&lang=no&locale=no&userCountry=NO",
  momondohotel: "https://www.momondo.no/hotel-search/Carlton-Hotel-Bangkok-Sukhumvit,Bangkok-p18056-h5948637-details/2026-08-28/2026-08-31/2adults?pm=total",
  booking: "https://www.booking.com/hotel/th/carlton-bangkok-sukhumvit.html?checkin=2026-08-28&checkout=2026-08-31&group_adults=2&no_rooms=1&group_children=0",
  hotelscom: "https://www.hotels.com/ho419194/renaissance-shanghai-caohejing-hotel-shanghai-china/?chkin=2026-08-28&chkout=2026-08-31&rm1=a2&destination=Shanghai%2C+China",
  tripcom: "https://www.trip.com/hotels/detail/?cityEnName=Shanghai&hotelId=65568600&checkIn=2026-08-28&checkOut=2026-08-31&adult=2&children=0&crn=1&curr=NOK&locale=en-XX",
  agodahotel: "https://www.agoda.com/en-gb/starr-hotel-shanghai/hotel/shanghai-cn.html?adults=2&children=0&rooms=1&checkIn=2026-08-28&los=3&currencyCode=NOK&travellerType=1",
  agodasearch: "https://www.agoda.com/en-gb/search?city=3987&checkIn=2026-08-28&checkOut=2026-08-31&rooms=1&adults=2&children=0&currency=NOK&textToSearch=Shanghai",
  expediahotel: "https://www.expedia.com/Shanghai-Hotels-Renaissance-Shanghai-Caohejing-Hotel.h5389992.Hotel-Information?chkin=2026-08-28&chkout=2026-08-31&rm1=a2&destination=Shanghai%2C+China",
  expediasearch: "https://www.expedia.com/Hotel-Search?destination=Shanghai%2C%20China&regionId=3145&startDate=2026-08-28&endDate=2026-08-31&adults=2&rooms=1&sort=RECOMMENDED",
  hotelscomsearch: "https://www.hotels.com/Hotel-Search?regionId=3145&sort=RECOMMENDED&startDate=2026-08-28&endDate=2026-08-31&destination=Shanghai%2C+China",
  bookingsearch: "https://www.booking.com/searchresults.en-gb.html?ss=Shanghai%2C+Shanghai+Area%2C+China&dest_id=-1924465&dest_type=city&checkin=2026-08-28&checkout=2026-08-31&group_adults=2&no_rooms=1&group_children=0",
  triplist: "https://www.trip.com/hotels/list?city=2&cityName=Shanghai&checkIn=2026-08-28&checkOut=2026-08-31&crn=1&adult=2&children=0&searchWord=Shanghai",
  skyscannersearch: "https://www.skyscanner.no/hotels/search?entity_id=27538759&checkin=2026-09-09&checkout=2026-09-17&adults=2&rooms=1",
  finnsearch: "https://hotell.finn.no/Hotel/Search?placeId=57663&checkIn=2026-08-13&checkOut=2026-08-21&rooms=2&userSearch=1",
  momondosearch: "https://www.momondo.no/hotel-search/Bangkok,Thailand-p18056/2026-08-28/2026-08-31/2adults",
};

const target = args.target ?? "skyscannerhotel";
const url = args.url ?? TARGET_URLS[target];
if (url === undefined) {
  console.log("Ukjent --target. Gyldige:", Object.keys(TARGET_URLS).join(", "));
  process.exit(1);
}
const extensionPath = new URL("../../dist/extension", import.meta.url).pathname;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const profileDir = mkdtempSync(join(tmpdir(), "klarna-e2e-hotel-"));
const context = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  locale: "nb-NO",
  timezoneId: "Europe/Oslo",
  viewport: { width: 1440, height: 1000 },
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    "--disable-blink-features=AutomationControlled",
  ],
});

const page = await context.newPage();

const acceptConsent = async () => {
  for (let attempt = 0; attempt < 6; attempt++) {
    for (const frame of page.frames()) {
      for (const name of ["Godta alle", "Aksepter alle", "Accept all", "Godta"]) {
        const btn = frame.getByRole("button", { name, exact: false }).first();
        if (await btn.isVisible().catch(() => false)) {
          await btn.click().catch(() => {});
          await sleep(1500);
          return;
        }
      }
    }
    await sleep(1500);
  }
};

const readHotelPanel = () => page.evaluate(() => {
  const host = document.getElementById("cashback-varsler-notice");
  const root = host?.shadowRoot;
  if (!root) return undefined;
  return [...root.querySelectorAll("a.price-match-card")].map((link) => ({
    text: link.textContent?.trim().replace(/\s+/g, " ") ?? "",
    title: link.getAttribute("title") ?? "",
    href: link.href,
  }));
});

const readHotelTooltips = () => page.evaluate(() => {
  const root = document.getElementById("cashback-varsler-notice")?.shadowRoot;
  if (!root) return [];
  return [...root.querySelectorAll(".offer-tooltip")]
    .map((el) => el.textContent?.trim().replace(/\s+/g, " ") ?? "")
    .filter((text) => /natt|Leverandører|Åpner samme søk/i.test(text));
});

const dumpPanel = async (label, budgetMs) => {
  const startedAt = Date.now();
  let cards;
  while (Date.now() - startedAt < budgetMs) {
    cards = await readHotelPanel();
    if (cards !== undefined && cards.length >= 2) break;
    await sleep(2000);
  }
  await sleep(15000);
  cards = await readHotelPanel();
  console.log(`\n=== ${label}`);
  if (cards === undefined || cards.length === 0) {
    console.log("  (ingen hotellkort funnet)");
    return;
  }
  for (const card of cards) {
    console.log("  ", card.text, card.title ? `[${card.title}]` : "", "::", card.href.slice(0, 160));
  }
  for (const tooltip of await readHotelTooltips()) {
    console.log("  tooltip:", tooltip.slice(0, 400));
  }
};

const dumpVisibleTopPrices = async () => {
  const text = await page.evaluate(() => (document.body?.innerText ?? "").replace(/ /g, " "));
  const lines = text.split("\n").map((line) => line.trim()).filter((line) => /(?:\d[\d ]*\s*kr|kr\s*\d)/i.test(line));
  console.log("\nSidens egne priser (første 12 pris-linjer):");
  for (const line of lines.slice(0, 12)) console.log("  |", line.slice(0, 120));
};

try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await acceptConsent();
  await dumpPanel(`panel @ ${target}`, 90000);
  await dumpVisibleTopPrices();
} finally {
  await context.close();
  rmSync(profileDir, { recursive: true, force: true });
}
