// Live coverage of the first Prisjakt TCG category page, using extension-mode lookup.
// pnpm exec tsx scripts/dev/audit-pokepris.mts [--catalog data/pokepris-catalog.json | --no-catalog]
// The published merchant-URL catalog is used by default, as in the clients.
import { Configuration, HttpCrawler, MemoryStorage } from "crawlee";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { POKEPRIS_CATALOG_URL } from "../../src/shared/pokepris-catalog.js";
import { findPokeprisPriceMatch, type PokeprisDiagnostic } from "../../src/shared/pokepris-price-match.js";
import { selectProductLdJson, readLdJsonScripts, readProductLanguage, readProductOfferLanguage } from "../../src/shared/product-data.js";
import { readTcgProductKind } from "../../src/shared/tcg-product-match.js";
import type { GetPriceMatchForProductMessage } from "../../src/shared/extension-messages.js";

const categoryUrl = "https://www.prisjakt.no/c/samlekortspill";
const outputDir = "dist/preview";
const args = process.argv.slice(2);
const useCatalog = !args.includes("--no-catalog");
const catalogPath = args.includes("--catalog") ? args[args.indexOf("--catalog") + 1] : undefined;
const localCatalog = catalogPath === undefined ? undefined : await readFile(catalogPath, "utf8");
const config = new Configuration();
config.useStorageClient(new MemoryStorage({ persistStorage: false }));
const messages = new Map<string, GetPriceMatchForProductMessage>();
const failures = new Map<string, string>();
let productUrls: string[] = [];
const crawler = new HttpCrawler({
  maxConcurrency: 1, maxRequestRetries: 2, maxRequestsPerCrawl: 51,
  navigationTimeoutSecs: 30, requestHandlerTimeoutSecs: 30, ignoreSslErrors: false,
  requestHandler: async ({ body, request }) => {
    const html = Buffer.isBuffer(body) ? body.toString("utf8") : body;
    if (request.url === categoryUrl) {
      productUrls = [...new Set([...html.matchAll(/href=["'](?:https:\/\/www\.prisjakt\.no)?\/product\.php\?p=(\d+)["']/g)]
        .map((match) => `https://www.prisjakt.no/product.php?p=${match[1]}`))].slice(0, 50);
      if (productUrls.length === 0) throw new Error("Prisjakt audit: category contained no product links");
      await crawler.addRequests(productUrls);
      return;
    }
    const product = selectProductLdJson(readLdJsonScripts(html));
    if (typeof product?.name !== "string") throw new Error(`Prisjakt audit: product metadata missing for ${request.url}`);
    const language = readProductLanguage(product, [product.name]) ?? readProductOfferLanguage(html, new URL(request.url).searchParams.get("p")!);
    messages.set(request.url, {
      type: "get-price-match-for-product", url: request.url, searchTerm: product.name,
      productPageClue: true, ...(language !== undefined ? { productLanguage: language } : {}),
    });
  },
  failedRequestHandler: async ({ request }, error) => { failures.set(request.url, error.message); },
}, config);
await crawler.run([categoryUrl]);

const cache = new Map<string, Promise<string | undefined>>();
const requestText = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
  const key = `${init?.method ?? "GET"} ${url} ${init?.body ?? ""}`;
  let pending = cache.get(key);
  if (url === POKEPRIS_CATALOG_URL && localCatalog !== undefined) return Promise.resolve(localCatalog);
  if (pending === undefined) {
    if (cache.size >= 250) throw new Error("Pokepris audit: request limit reached");
    pending = fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }).then(async (response) => {
      if (!response.ok) throw new Error(`Pokepris audit: ${url} HTTP ${response.status}`);
      return response.text();
    });
    cache.set(key, pending);
  }
  return pending;
};
const results = [];
for (const url of productUrls) {
  const message = messages.get(url);
  const row = { url, title: message?.searchTerm ?? "Metadata unavailable", language: message?.productLanguage ?? "unknown", kind: message === undefined ? undefined : readTcgProductKind(message.searchTerm) };
  try {
    const diagnostics: PokeprisDiagnostic[] = [];
    const offer = message === undefined ? undefined : await findPokeprisPriceMatch(message, requestText, { useSearchApi: false, useCatalog, onDiagnostic: (event) => diagnostics.push(event) });
    const result = { ...row, status: offer !== undefined ? "matched" : failures.has(url) ? "error" : "unmatched", diagnostics, ...(offer !== undefined ? { productUrl: offer.productUrl, productName: offer.productName, price: offer.price, details: offer.details } : {}), ...(failures.has(url) ? { error: failures.get(url) } : {}) };
    results.push(result);
    console.log(`${results.length}/${productUrls.length} ${result.status}: ${row.title}${offer !== undefined ? ` -> ${offer.productUrl}` : ""}`);
  } catch (error) {
    results.push({ ...row, status: "error", error: String(error) });
    console.warn(`${results.length}/${productUrls.length} error: ${row.title}: ${error}`);
  }
}
await mkdir(outputDir, { recursive: true });
const summary = { categoryUrl, catalog: useCatalog ? catalogPath ?? POKEPRIS_CATALOG_URL : "none", checkedAt: new Date().toISOString(), total: results.length, matched: results.filter((row) => row.status === "matched").length, errors: results.filter((row) => row.status === "error").length, pokeprisRequests: cache.size };
await writeFile(`${outputDir}/pokepris-audit.json`, JSON.stringify({ ...summary, results }, null, 2) + "\n");
const labels: Record<string, string> = {
  "no-matching-catalog-product": "Ingen entydig kandidat i offentlige katalogdata",
  "unsupported-product-form": "Produkttypen støttes ikke ennå",
  "unverified-product-identity": "Produktidentitet/språk kunne ikke bekreftes",
  "no-in-stock-offers": "Ingen kjøpbare tilbud på lager",
  "language-mismatch": "Annen eller ukjent språkvariant hos kandidaten",
  "set-name-mismatch": "Sett stemmer ikke",
  "product-name-mismatch": "Produktnavn stemmer ikke",
  "product-variant-mismatch": "Produktvariant stemmer ikke",
  "current-merchant-offer-not-verified": "Butikkens egen oppføring kunne ikke bekreftes",
};
const lines = results.map((row) => {
  const reasons = "diagnostics" in row ? [...new Set(row.diagnostics.map((event) => labels[event.reason] ?? event.reason))].join("; ") : "Transport-/metadatafeil";
  return `| [${row.title.replace(/\|/g, "\\|")}](${row.url}) | ${row.language} | ${row.status === "matched" && "productUrl" in row ? `[${row.price}](${row.productUrl})` : reasons} |`;
});
await writeFile(`${outputDir}/pokepris-audit.md`, `# Pokepris: kontroll av første Prisjakt-side\n\n${summary.matched}/${summary.total} bekreftede treff; ${summary.errors} transport-/metadatafeil. Katalog: ${summary.catalog}.\n\nKontrollen bruker samme oppslag som extensionen. Manglende treff betyr ikke nødvendigvis at Pokepris mangler produktet: offentlige katalogdata, lager og språk/produktidentitet må kunne bekreftes.\n\n| Prisjakt-produkt | Språk på Prisjakt | Pokepris / årsak |\n| --- | --- | --- |\n${lines.join("\n")}\n`);
console.log(JSON.stringify(summary));
