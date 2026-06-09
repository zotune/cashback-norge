// E2E-test av extensionens flypanel på en ekte FINN-resultatside.
// Laster dist/extension i Playwrights bundled Chromium (Chrome 137+ ignorerer --load-extension)
// og sammenligner panelets beste pris med FINN-sidas egen «Billigst»-pris,
// både rett etter første render og etter modningsrundene (backoff opptil ~63 s).
//
// Bruk:
//   node scripts/dev/e2e-finn-flight.mjs --runs 3 --url "https://www.finn.no/reise/flybilletter/resultat/?..."

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

const url = args.url
  ?? "https://www.finn.no/reise/flybilletter/resultat/?tripType=roundtrip&requestedOrigin=BGO.AIRPORT&requestedDestination=SYD.AIRPORT&requestedDepartureDate=17.09.2026&requestedReturnDate=24.09.2026&adults=1&cabinType=economy";
const runs = Number(args.runs ?? 3);
const extensionPath = new URL("../../dist/extension", import.meta.url).pathname;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const NBSP_PATTERN = new RegExp(String.fromCharCode(160), "g");

async function runOnce(label) {
  const profileDir = mkdtempSync(join(tmpdir(), "klarna-e2e-"));
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
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    const startedAt = Date.now();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    const readPanelText = () => page.evaluate(() => {
      const host = document.getElementById("cashback-varsler-notice");
      return host?.shadowRoot?.textContent ?? "";
    });
    const readPanelPrices = (panelText) => [...panelText.replace(NBSP_PATTERN, " ").matchAll(/([\d][\d ]*)\s?kr/g)]
      .map((match) => Number(match[1].replace(/ /g, "")))
      .filter((amount) => amount > 500);

    // Vent til panelet viser en kr-pris (eller gi opp etter 90 s).
    let earlyPanelText = "";
    while (Date.now() - startedAt < 90_000) {
      earlyPanelText = await readPanelText();
      if (/\d[\d\s ]*\s?kr/.test(earlyPanelText)) break;
      await sleep(1000);
    }
    const panelSeconds = Math.round((Date.now() - startedAt) / 1000);
    const earlyPrices = readPanelPrices(earlyPanelText);

    // La modningsrundene og FINN-sida bli ferdige.
    await sleep(75_000);
    const finalPanelText = await readPanelText();
    const finalPrices = readPanelPrices(finalPanelText);
    const pageBilligst = await page.evaluate(() => {
      const text = (document.body?.innerText ?? "").replace(new RegExp(String.fromCharCode(160), "g"), " ");
      const match = text.match(/Billigst\s*\n[^\n]*\n\s*([\d ]+)\s*kr/);
      return match ? match[1].replace(/ /g, "") : undefined;
    });

    console.log(`\n=== Kjøring ${label} ===`);
    console.log(`Panel klart etter ${panelSeconds}s. Beste tidlig: ${earlyPrices.length > 0 ? Math.min(...earlyPrices) : "?"} kr, beste etter modning: ${finalPrices.length > 0 ? Math.min(...finalPrices) : "?"} kr`);
    console.log(`FINN-sidas «Billigst» (etter modning): ${pageBilligst ?? "?"} kr`);
    if (pageBilligst !== undefined && finalPrices.length > 0) {
      const best = Math.min(...finalPrices);
      const verdict = best <= Number(pageBilligst) ? "OK (panelet ≤ sidas billigste)" : `BOM (panelet ${best} > sidas ${pageBilligst})`;
      console.log(`Vurdering: ${verdict}`);
    }
  } finally {
    await context.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
}

for (let i = 1; i <= runs; i++) {
  await runOnce(i);
}
