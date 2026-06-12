// E2E-test av flyprispanelet med bygget extension på en ekte finn.no-resultatside.
// Verifiserer at kabin/bagasje/stopp-parametre plukkes opp fra URL/DOM og at
// kildene (FINN/momondo/Skyscanner/Trip) søker med dem.
//
// Bruk:
//   node scripts/dev/e2e-flight-panel.mjs [--url <resultat-URL>] [--click-filters true]
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

const defaultUrl = "https://www.finn.no/reise/flybilletter/resultat/?tripType=roundtrip&requestedOrigin=BGO.AIRPORT&requestedDestination=SHA.METROPOLITAN_AREA&requestedDepartureDate=10.07.2026&requestedReturnDate=25.07.2026&adults=1&cabinType=economy";
const url = args.url ?? defaultUrl;
const clickFilters = args["click-filters"] === "true";
const extensionPath = new URL("../../dist/extension", import.meta.url).pathname;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const profileDir = mkdtempSync(join(tmpdir(), "klarna-e2e-flight-"));
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
  for (let attempt = 0; attempt < 8; attempt++) {
    for (const frame of page.frames()) {
      const btn = frame.getByRole("button", { name: "Godta alle", exact: false }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click().catch(() => {});
        await sleep(1500);
        return;
      }
    }
    await sleep(1500);
  }
};

const readFlightPanel = () => page.evaluate(() => {
  const host = document.getElementById("cashback-varsler-notice");
  const root = host?.shadowRoot;
  if (!root) return undefined;
  const cards = [...root.querySelectorAll("a")]
    .filter((link) => /finn\.no\/reise|momondo\.no|skyscanner|trip\.com|panflights|travellink/i.test(link.href))
    .map((link) => ({
      text: link.textContent?.trim().replace(/\s+/g, " ") ?? "",
      title: link.getAttribute("title") ?? "",
      href: link.href,
    }));
  return cards;
});

const dumpPanel = async (label, budgetMs) => {
  const startedAt = Date.now();
  let cards;
  while (Date.now() - startedAt < budgetMs) {
    cards = await readFlightPanel();
    if (cards !== undefined && cards.length >= 3) break;
    await sleep(2000);
  }
  await sleep(12000);
  cards = await readFlightPanel();
  console.log(`\n=== ${label}`);
  if (cards === undefined || cards.length === 0) {
    console.log("  (ingen flykort funnet)");
    return;
  }
  for (const card of cards) {
    console.log("  ", card.text, card.title ? `[${card.title}]` : "", "::", card.href.slice(0, 140));
  }
};

try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await acceptConsent();
  await dumpPanel(`panel @ ${url.slice(0, 110)}`, 90000);

  if (clickFilters) {
    // Klikk på finn-filtrene via inputens egen click() (label-kopier kan ligge i skjulte drawers).
    for (const labelText of ["1 stk. innsjekket bagasje", "Maks 1 stopp"]) {
      const clicked = await page.evaluate((text) => {
        for (const input of document.querySelectorAll('input[type="checkbox"], input[type="radio"]')) {
          const label = input.labels?.[0]?.innerText?.replace(/\s+/g, " ").trim();
          if (label === text) {
            input.click();
            return true;
          }
        }
        return false;
      }, labelText);
      console.log(`klikk "${labelText}":`, clicked);
      await sleep(1500);
    }
    const filterState = await page.evaluate(() => {
      return [...document.querySelectorAll('input[type="checkbox"], input[type="radio"]')]
        .map((input) => ({ label: input.labels?.[0]?.innerText?.replace(/\s+/g, " ").trim() ?? "", checked: input.checked }))
        .filter((entry) => /bagasje|stopp/i.test(entry.label) && entry.label.length < 40);
    });
    console.log("\nfilter-tilstand etter klikk:", JSON.stringify(filterState));
    await dumpPanel("panel etter innsjekket bagasje + maks 1 stopp", 90000);
  }
} finally {
  await context.close();
  rmSync(profileDir, { recursive: true, force: true });
}
