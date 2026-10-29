// Live assertions against the built extension on merchant and comparison pages.
// node scripts/dev/e2e-pokepris.mjs [--categories] [--userscript] [case names]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(new URL("../../node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/package.json", import.meta.url));
const { chromium } = require("playwright");
const extensionPath = new URL("../../dist/extension", import.meta.url).pathname;
const outputDir = new URL("../../dist/preview", import.meta.url).pathname;
const cases = [
  { name: "klarna", url: "https://www.klarna.com/no/shopping/pl/cl613/3584064629/Kort-brettspill/Pokemon-Mega-Evolution-Pitch-Black-Elite-Trainer-Box/", productId: "6501" },
  { name: "maxgaming", url: "https://www.maxgaming.no/no/pokemon/pokemon-mega-dream-ex-booster-boks-japansk?utm_source=prisjakt&utm_medium=cpc&utm_campaign=prisjakt", productId: "3326" },
  { name: "prisjakt", url: "https://www.prisjakt.no/product.php?p=15845117", productId: "3326" },
  { name: "cardero", url: "https://www.cardero.no/products/pokemon-prismatic-evolutions-elite-trainer-box-kopi", productId: "3594" },
];
const requestedCases = process.argv.slice(2);
const userscript = requestedCases.includes("--userscript");
if (userscript) requestedCases.splice(requestedCases.indexOf("--userscript"), 1);
if (requestedCases.includes("--categories")) {
  const audit = JSON.parse(await readFile(join(outputDir, "tcg-category-audit.json"), "utf8"));
  requestedCases.splice(requestedCases.indexOf("--categories"), 1);
  for (const source of ["Prisradar", "Godpris"]) {
    const match = audit.results.find((row) => row.source === source && row.status === "matched");
    assert.ok(match, `${source}: no matched audit case`);
    const name = `${source.toLowerCase()}-category`;
    cases.push({ name, url: match.url, productId: new URL(match.productUrl).pathname.split("/")[2] });
    requestedCases.push(name);
  }
}
assert.ok(requestedCases.every((name) => name === "klarna-api" || cases.some((testCase) => testCase.name === name)), "Unknown case name");
const selectedCases = cases.filter((testCase) => requestedCases.length === 0 || requestedCases.includes(testCase.name));
await mkdir(outputDir, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "pokepris-e2e-"));
const context = await chromium.launchPersistentContext(profile, {
  headless: true, channel: "chromium", locale: "nb-NO", viewport: { width: 1440, height: 1000 },
  args: userscript ? [] : [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
if (userscript) {
  // Verify the GM callback contract against real HTTP responses. This is an
  // isolated transport harness, not an installed Tampermonkey test.
  await context.exposeFunction("tcgGmHttp", async (request) => {
    const response = await context.request.fetch(request.url, { method: request.method ?? "GET", headers: request.headers,
      ...(request.data !== undefined ? { data: request.data } : {}), timeout: 15_000 });
    return { status: response.status(), responseText: await response.text() };
  });
  await context.addInitScript(() => {
    window.GM_getValue = (_key, fallback) => fallback;
    window.GM_setValue = () => {};
    window.GM_xmlhttpRequest = (request) => {
      window.tcgGmHttp({ url: request.url, method: request.method, headers: request.headers, data: request.data }).then((result) => {
        let response = result.responseText;
        if (request.responseType === "json") { try { response = JSON.parse(response); } catch { /* Client handles malformed JSON. */ } }
        request.onload?.({ ...result, response });
      }).catch((error) => request.onerror?.({ error: String(error) }));
    };
  });
}
try {
  // The product page can return Access Denied while its public API still works.
  // Exercise the real background transport independently of that page's UI.
  if (!userscript && (requestedCases.length === 0 || requestedCases.includes("klarna") || requestedCases.includes("klarna-api"))) {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker", { timeout: 10_000 });
    const popup = await context.newPage();
    try {
      await popup.goto(new URL("../popup.html", worker.url()).href);
      const response = await popup.evaluate((url) => chrome.runtime.sendMessage({
        type: "get-price-match-for-product", url,
        searchTerm: "Pokémon Mega Evolution Pitch Black Elite Trainer Box", productPageClue: true,
        price: 949, currency: "NOK",
      }), cases.find((testCase) => testCase.name === "klarna").url);
      assert.equal(response.ok, true);
      const offers = response.offers ?? [response.offer].filter(Boolean);
      const pokepris = offers.find((offer) => offer.source === "pokepris");
      assert.equal(pokepris?.productUrl, "https://www.pokepris.no/produkt/6501");
      assert.ok(pokepris.amount > 0);
      assert.ok(offers.every((offer) => !offer.alternatives?.some((item) => /cardcenter/i.test(item.shopName) && item.amount === 990)));
      console.log(`Klarna background transport: ${pokepris.shopName} ${pokepris.price}; Cardcenter preorder excluded`);
    } finally { await popup.close(); }
  }
  for (const testCase of selectedCases) {
    const page = await context.newPage();
    try {
      await page.goto(testCase.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      if (userscript) {
        try { await page.addScriptTag({ path: new URL("../../site/cashback-varsler.user.js", import.meta.url).pathname }); }
        catch (error) {
          // addScriptTag also reports caught CSP failures of the optional index
          // fetch. Keep the site's CSP and still assert the GM-backed price row.
          if (!String(error).includes("Connecting to 'https://cashbacknorge.no/cashback-index.json' violates")) throw error;
        }
      }
      const row = page.locator("#cashback-varsler-notice a.price-match-card").filter({ hasText: "Pokepris" });
      await row.waitFor({ state: "visible", timeout: 60_000 });
      assert.equal(await row.getAttribute("href"), `https://www.pokepris.no/produkt/${testCase.productId}`);
      if (testCase.productId === "3326") assert.match(await row.innerText(), /\[JP\]/);
      const badge = row.locator(".provider-pokepris");
      const colors = () => badge.evaluate((element) => [getComputedStyle(element).backgroundColor, getComputedStyle(element).color]);
      assert.deepEqual(await colors(), ["rgb(0, 0, 0)", "rgb(255, 255, 255)"]);
      await row.hover();
      const tooltip = page.locator("#cashback-varsler-notice .offer-tooltip.visible").filter({ hasText: "Pokepris:" });
      await tooltip.waitFor({ state: "visible", timeout: 5000 });
      assert.match(await tooltip.innerText(), /Frakt ukjent/i);
      await page.screenshot({ path: join(outputDir, `pokepris-${testCase.name}.png`) });
      await page.emulateMedia({ colorScheme: "dark" });
      await page.waitForFunction(() => document.querySelector("#cashback-varsler-notice")?.getAttribute("data-cbn-theme") === "dark");
      assert.deepEqual(await colors(), ["rgb(0, 0, 0)", "rgb(255, 255, 255)"]);
      await page.setViewportSize({ width: 390, height: 844 });
      await row.locator("..").getByRole("button", { name: "Vis detaljer om prissammenligningen" }).click();
      await tooltip.waitFor({ state: "visible", timeout: 5000 });
      const bounds = await tooltip.boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 391, JSON.stringify(bounds));
      await page.screenshot({ path: join(outputDir, `pokepris-${testCase.name}-mobile.png`) });
      console.log(`${testCase.name} (${userscript ? "GM callback harness" : "extension"}): ${await row.innerText()} — desktop, dark theme and mobile passed`);
    } catch (error) {
      console.error("Page diagnosis", JSON.stringify(await page.evaluate(() => ({ title: document.title, heading: document.querySelector("h1")?.textContent, text: document.body.innerText.slice(0, 450), notice: document.querySelector("#cashback-varsler-notice")?.shadowRoot?.textContent?.slice(-1500) }))));
      await page.screenshot({ path: join(outputDir, `pokepris-${testCase.name}-failure.png`) });
      throw error;
    } finally { await page.close(); }
  }
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
