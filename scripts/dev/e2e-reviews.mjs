// E2E for «Anmeldelser» in the built extension: opens real product pages, waits for the price
// match, asserts the reviews section (scores, Norwegian tests only, copy button) and screenshots it.
// node scripts/dev/e2e-reviews.mjs [--url <produktside>] [--out <dir>]
import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const require = createRequire(new URL("../../node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/package.json", import.meta.url));
const { chromium } = require("playwright");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => { if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]]); return pairs; }, []));
const urls = args.url ? [args.url] : ["https://godpris.no/produkt/15346856", "https://www.komplett.no/product/1346176/gaming/konsoller/playstation/playstation-5-pro-2tb"];
const out = args.out ?? tmpdir();
const extensionPath = new URL("../../dist/extension", import.meta.url).pathname;
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "klarna-reviews-")), {
  headless: false, locale: "nb-NO", timezoneId: "Europe/Oslo", viewport: { width: 1440, height: 1000 },
  permissions: ["clipboard-read", "clipboard-write"],
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, "--disable-blink-features=AutomationControlled"],
});
let failures = 0;
try {
  for (const [index, url] of urls.entries()) {
    const page = await context.newPage();
    console.log(`\n=== ${url}`);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      const handle = await page.waitForFunction(() => {
        const root = document.getElementById("cashback-varsler-notice")?.shadowRoot;
        const section = root?.querySelector(".reviews-section");
        return section ? {
          rows: [...section.querySelectorAll(".reviews-row")].map((row) => ({ text: row.innerText.replace(/\s+/g, " "), href: row.href })),
        } : false;
      }, null, { timeout: 60000, polling: 1000 });
      const result = await handle.jsonValue();
      console.log(JSON.stringify(result, null, 1));
      assert.ok(result.rows.every((row) => /^(Butikken|Kjøpere av varen|Tester av varen) /.test(row.text)), "rows: Butikken, Kjøpere av varen, Tester av varen");
      assert.ok(result.rows.length > 0, "at least one review row");
      for (const row of result.rows) assert.ok(/^https:\/\/(www\.)?(godpris\.no|prisjakt\.no|prisradar\.no|klarna\.com\/no)\//.test(row.href), `comparison-site link: ${row.href}`);
      await page.evaluate(() => document.getElementById("cashback-varsler-notice").shadowRoot.querySelector(".reviews-copy").click());
      await page.waitForTimeout(500);
      const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
      assert.match(copied, /HTML-side/, "prompt copied");
      console.log(`copied ${copied.length} chars`);
      await page.evaluate(() => document.getElementById("cashback-varsler-notice").shadowRoot.querySelector(".reviews-section").scrollIntoView({ block: "center" }));
      const box = await page.evaluate(() => { const r = document.getElementById("cashback-varsler-notice").shadowRoot.querySelector(".reviews-row").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      await page.mouse.move(box.x, box.y);
      await page.waitForTimeout(700);
      const tip = await page.evaluate(() => [...document.getElementById("cashback-varsler-notice").shadowRoot.querySelectorAll(".price-match-tooltip.visible, .offer-tooltip.visible")].map((t) => t.innerText.replace(/\s+/g, " ")).join(" | "));
      console.log(`tooltip: ${tip}`);
      assert.match(tip, /Prisjakt|Godpris|Klarna|Tek|techradar|Komputer/, "row tooltip names the sources");
      await page.screenshot({ path: join(out, `reviews-${index}.png`) });
      console.log(`OK, screenshot ${join(out, `reviews-${index}.png`)}`);
    } catch (error) {
      failures += 1;
      console.log(`FAIL ${error instanceof Error ? error.message : error}`);
      await page.screenshot({ path: join(out, `reviews-${index}-fail.png`) }).catch(() => {});
    }
  }
} finally {
  await context.close();
}
process.exitCode = failures ? 1 : 0;
