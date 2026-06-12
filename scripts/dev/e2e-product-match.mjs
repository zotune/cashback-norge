// E2E-test av prismatch-panelet på ekte produktsider med bygget extension.
// Laster dist/extension i Playwrights bundled Chromium og dumper prismatch-radene
// fra shadow-rooten, slik at matching kan verifiseres mot det sidene faktisk viser.
//
// Bruk:
//   node scripts/dev/e2e-product-match.mjs --url "https://www.komplett.no/product/..."

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

const urls = args.url !== undefined ? [args.url] : [
  "https://www.komplett.no/product/1326886/hjem-fritid/stoevsugere-rengjoering/robotstoevsugere/dreame-d20-robotstoevsuger-sort",
  "https://lyko.com/no/sawe-skin-science/sawe-skin-science-derm-alert-barrier-repair-cream-75-ml",
];
const extensionPath = new URL("../../dist/extension", import.meta.url).pathname;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  for (const url of urls) {
    console.log(`\n=== ${url}`);
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

      const readPriceMatches = () => page.evaluate(() => {
        const host = document.getElementById("cashback-varsler-notice");
        const root = host?.shadowRoot;
        if (!root) return undefined;
        const rows = [...root.querySelectorAll("a")]
          .filter((link) => /prisjakt|godpris|klarna\.com|prisradar|sesum|enhver|kassal|google\.com\/search/i.test(link.href))
          .map((link) => `${link.textContent?.trim().replace(/\s+/g, " ")} :: ${link.href}`);
        return { text: root.textContent ?? "", rows };
      });

      const startedAt = Date.now();
      let result;
      while (Date.now() - startedAt < 60_000) {
        result = await readPriceMatches();
        if (result !== undefined && result.rows.length > 0) break;
        await sleep(1500);
      }
      // La eventuelle etternølere (retry-runder) komme inn.
      await sleep(8000);
      result = await readPriceMatches();

      if (result === undefined) {
        console.log("  (panel ikke funnet)");
      } else if (result.rows.length === 0) {
        console.log("  (ingen prismatch-rader)");
        console.log("  paneltekst:", result.text.slice(0, 300).replace(/\s+/g, " "));
      } else {
        for (const row of result.rows) console.log("  ", row);
      }
    } finally {
      await page.close();
    }
  }
} finally {
  await context.close();
  rmSync(profileDir, { recursive: true, force: true });
}
