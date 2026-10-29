// Live assertions against the built extension on merchant and comparison pages.
// node scripts/dev/e2e-pokepris.mjs [--categories] [--userscript] [--offer-variants] [case names]
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
  { name: "pokepris", url: "https://www.pokepris.no/produkt/6373", productId: "6373" },
];
const requestedCases = process.argv.slice(2);
const offerVariants = requestedCases.includes("--offer-variants");
if (offerVariants) requestedCases.splice(requestedCases.indexOf("--offer-variants"), 1);
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
let offerFixture;
async function hoverPriceTooltip(page, row, tooltip) {
  // Product hydration can replace the panel just after the first mouseenter.
  // Retry the interaction on the current row; a broken hover still fails.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.mouse.move(1430, 10);
    await row.hover();
    try { await tooltip.waitFor({ state: "visible", timeout: 2000 }); return; }
    catch (error) { if (attempt === 2) throw error; }
  }
}
if (userscript) {
  // Verify the GM callback contract against real HTTP responses. This is an
  // isolated transport harness, not an installed Tampermonkey test.
  await context.exposeFunction("tcgGmHttp", async (request) => {
    if (offerFixture && request.url === offerFixture.url) return { status: 200, responseText: offerFixture.html };
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
  if (offerVariants) {
    // A captured association with deliberately inverted prices. This is an
    // explicit fixture test of the built clients, separate from live cases.
    const captured = JSON.parse(await readFile(new URL("../../tests/fixtures/pokepris-offer-variants.json", import.meta.url), "utf8"));
    const offers = captured.offers.map((entry, index) => ({ "@type": "Offer", seller: { name: entry.shop }, url: entry.url,
      price: index === 0 ? 499 : 1048, priceCurrency: "NOK", availability: "https://schema.org/InStock", itemCondition: "https://schema.org/NewCondition" }));
    const rows = captured.offers.map((entry, index) => ({ store_name: entry.shop, product_url: entry.url, product_name: entry.title,
      current_price: offers[index].price, in_stock: true, is_preorder: false, redacted: false }));
    const product = { "@type": "Product", name: captured.product.name, brand: { name: "Pokémon" },
      additionalProperty: [{ name: "Språk", value: captured.product.language }], offers: { "@type": "AggregateOffer", offers } };
    const prices = { product: captured.product, lowestPrice: rows[0], otherInStockPrices: rows.slice(1), outOfStockPrices: [] };
    const html = `<script type="application/ld+json">${JSON.stringify(product)}</script><script>self.__next_f.push(${JSON.stringify([1, `1:${JSON.stringify(prices)}\n`])})</script>`;
    const testPage = await context.newPage();
    let worker;
    try {
      if (userscript) {
        offerFixture = { url: captured.sourceUrl, html };
        await testPage.goto(captured.sourceUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await testPage.addScriptTag({ path: new URL("../../site/cashback-varsler.user.js", import.meta.url).pathname });
        const row = testPage.locator("#cashback-varsler-notice a.price-match-card").filter({ hasText: "Pokepris" });
        await row.waitFor({ state: "visible", timeout: 60_000 });
        assert.match(await row.innerText(), /1\s048\s*kr/);
        await row.hover();
        const tooltip = testPage.locator("#cashback-varsler-notice .offer-tooltip.visible").filter({ hasText: "Pokepris:" });
        await tooltip.waitFor({ state: "visible", timeout: 5000 });
        assert.match(await tooltip.innerText(), /Pokio/);
        assert.doesNotMatch(await tooltip.innerText(), /Wasteland|499\s*kr/);
      } else {
        worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker", { timeout: 10_000 });
        await worker.evaluate(({ url, html }) => {
          const original = globalThis.fetch;
          globalThis.restoreOfferFixture = () => { globalThis.fetch = original; delete globalThis.restoreOfferFixture; };
          globalThis.fetch = (input, init) => String(input) === url ? Promise.resolve(new Response(html, { headers: { "Content-Type": "text/html" } })) : original(input, init);
        }, { url: captured.sourceUrl, html });
        await testPage.goto(new URL("../popup.html", worker.url()).href);
        const response = await testPage.evaluate(({ url, name }) => chrome.runtime.sendMessage({ type: "get-price-match-for-product", url,
          searchTerm: `Pokémon ${name}`, productPageClue: true, price: 1048, currency: "NOK" }), { url: captured.sourceUrl, name: captured.product.name });
        assert.equal(response.ok, true);
        const result = response.offers.find((entry) => entry.source === "pokepris");
        assert.equal(result?.amount, 1048);
        assert.equal(result?.offerUrl, captured.offers[1].url);
        assert.equal(result?.alternatives.length, 1);
        assert.equal(result?.alternatives[0].shopName, "Pokio");
      }
      console.log(`Offer variant fixture (${userscript ? "GM callback harness + tooltip" : "built extension background"}): cheaper Pokémon Center rejected; standard Pokio 1048 retained`);
    } finally {
      offerFixture = undefined;
      if (worker) await worker.evaluate(() => globalThis.restoreOfferFixture?.());
      await testPage.close();
    }
  }
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
      if (pokepris === undefined) {
        const urls = [cases.find((testCase) => testCase.name === "klarna").url,
          "https://www.klarna.com/no/api/instant-search-edge-rest/public/search/suggest/NO?q=0196214142138",
          "https://www.pokepris.no/produkt/6501"];
        console.error("Klarna transport diagnosis", JSON.stringify(await worker.evaluate(async (urls) => Promise.all(urls.map(async (url) => {
          try { const response = await fetch(url, { signal: AbortSignal.timeout(8000) }); return { url, status: response.status }; }
          catch (error) { return { url, error: String(error) }; }
        })), urls)));
        const direct = await popup.evaluate(() => chrome.runtime.sendMessage({ type: "get-price-match-for-product",
          url: "https://www.pokepris.no/produkt/6501", searchTerm: "Pokémon Pitch Black Elite Trainer Box", productPageClue: true }));
        const directOffer = direct.offers?.find((offer) => offer.source === "pokepris");
        console.error("Direct Pokepris transport", JSON.stringify({ ok: direct.ok, productUrl: directOffer?.productUrl, amount: directOffer?.amount,
          alternatives: directOffer?.alternatives?.length }));
      }
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
      const tooltip = page.locator("#cashback-varsler-notice .offer-tooltip.visible").filter({ hasText: "Pokepris:" });
      await hoverPriceTooltip(page, row, tooltip);
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
