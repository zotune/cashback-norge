// Dumper produktmetadata (JSON-LD, koder, titler) slik content-scriptet ville sett dem.
// Bruk: node scripts/dev/dump-product-meta.mjs <url>
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(repoRoot, "node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/package.json"));
const { chromium } = require("playwright");

const url = process.argv[2];
if (!url) {
  console.error("usage: node scripts/dev/dump-product-meta.mjs <url>");
  process.exit(1);
}

const browser = await chromium.launch({ headless: process.env.HEADFUL !== "1" });
const page = await browser.newPage({
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  viewport: { width: 1440, height: 900 },
});
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(3000);

const meta = await page.evaluate(() => {
  const ldJsonBlocks = [];
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      ldJsonBlocks.push(JSON.parse(script.textContent ?? ""));
    } catch {
      // ignore
    }
  }
  const flatten = (value) => Array.isArray(value) ? value.flatMap(flatten) : [value];
  const nodes = ldJsonBlocks.flatMap(flatten).flatMap((node) => {
    const graph = node && typeof node === "object" && Array.isArray(node["@graph"]) ? node["@graph"] : [];
    return [node, ...graph];
  });
  const products = nodes.filter((node) => {
    const type = node?.["@type"];
    const types = Array.isArray(type) ? type : [type];
    return types.some((t) => typeof t === "string" && t.toLowerCase() === "product");
  });
  return {
    title: document.title,
    h1: document.querySelector("h1")?.textContent?.trim(),
    ogTitle: document.querySelector('meta[property="og:title"]')?.content?.trim(),
    products,
  };
});

console.log(JSON.stringify(meta, null, 1));
await browser.close();
