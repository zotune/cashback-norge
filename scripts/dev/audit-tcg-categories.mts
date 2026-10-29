// Bounded live audit; product IDs come from category responses, never a fixture list.
// pnpm exec tsx scripts/dev/audit-tcg-categories.mts [--reuse-snapshots]
import { CheerioCrawler, Configuration, MemoryStorage } from "crawlee";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { isRecord } from "../../src/shared/cashback.js";
import { readComparisonProductLdJson, readLdJsonScripts, readProductLanguage, readStructuredProductCodes } from "../../src/shared/product-data.js";
import { readTcgProductKind } from "../../src/shared/tcg-product-match.js";
import { readProductCodesFromUrl } from "../../src/shared/product-match.js";
import { findPokeprisPriceMatch, type PokeprisDiagnostic } from "../../src/shared/pokepris-price-match.js";
import { findGodprisPriceMatch } from "../../src/shared/godpris-price-match.js";
import { findPrisradarPriceMatch } from "../../src/shared/prisradar-price-match.js";
import { findKlarnaPriceMatch } from "../../src/shared/klarna-price-match.js";
import type { GetPriceMatchForProductMessage } from "../../src/shared/extension-messages.js";

const output = "dist/preview";
const snapshotDir = `${output}/tcg-snapshots`;
const sources = [
  { name: "Klarna", url: "https://www.klarna.com/no/shopping/cl/cl613/Kort-brettspill/", limit: 48 },
  { name: "Prisradar", url: "https://prisradar.no/kategorier/pokemon", limit: 50 },
  { name: "Godpris", url: "https://godpris.no/kategori/2603?b=Pokemon", limit: 36 },
];
const reuse = process.argv.includes("--reuse-snapshots");
const crawleeRequire = createRequire(import.meta.resolve("crawlee"));
const { load } = createRequire(crawleeRequire.resolve("@crawlee/cheerio"))("cheerio");
await mkdir(snapshotDir, { recursive: true });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const lists = new Map<string, string[]>();
const messages = new Map<string, GetPriceMatchForProductMessage>();
const failures = new Map<string, string>();
const categoryProducts = new Map<string, Record<string, unknown>>();
const categoryMetadataFallbacks = new Set<string>();

function readMessage(html: string, url: string): GetPriceMatchForProductMessage {
  const $ = load(html);
  let product = readComparisonProductLdJson(html, url);
  let rawName = typeof product?.name === "string" ? product.name : $("h1").first().text().trim();
  if (rawName.length < 3 || /access denied|verify.*robot/i.test($("title").text())) {
    const fallback = categoryProducts.get(url);
    if (typeof fallback?.name !== "string") throw new Error(`Product metadata unavailable: ${url}`);
    product = fallback;
    rawName = fallback.name;
    categoryMetadataFallbacks.add(url);
  }
  const brand = isRecord(product?.brand) ? product.brand.name : product?.brand;
  const name = (typeof brand === "string" && !rawName.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${rawName}` : rawName).replace(/\s+/g, " ").trim();
  const language = readProductLanguage(product, [name]);
  return { type: "get-price-match-for-product", url, searchTerm: name, productPageClue: true,
    codes: [...new Set([...readStructuredProductCodes(product), ...readProductCodesFromUrl(url)])],
    ...(typeof brand === "string" ? { productBrand: brand } : {}),
    ...(language !== undefined ? { productLanguage: language } : {}) };
}

if (reuse) {
  for (const product of JSON.parse(await readFile(`${snapshotDir}/klarna-category-products.json`, "utf8"))) {
    categoryProducts.set(new URL(`/no/shopping${product.url}`, sources[0]!.url).href, product);
  }
  const manifest = JSON.parse(await readFile(`${snapshotDir}/manifest.json`, "utf8")) as Array<[string, string[]]>;
  for (const [source, urls] of manifest) {
    lists.set(source, urls);
    for (const url of urls) {
      try { messages.set(url, readMessage(await readFile(`${snapshotDir}/${hash(url)}.html`, "utf8"), url)); }
      catch (error) { failures.set(url, String(error)); }
    }
  }
} else {
  const config = new Configuration();
  config.useStorageClient(new MemoryStorage({ persistStorage: false }));
  const crawler = new CheerioCrawler({
    maxConcurrency: 1, maxRequestRetries: 2, maxRequestsPerCrawl: 150,
    navigationTimeoutSecs: 30, requestHandlerTimeoutSecs: 30, ignoreSslErrors: false,
    requestHandler: async ({ request, $, body }) => {
      const html = Buffer.isBuffer(body) ? body.toString("utf8") : body;
      await writeFile(`${snapshotDir}/${hash(request.url)}.html`, html);
      const source = sources.find((item) => item.name === request.userData.source)!;
      if (request.userData.stage === "category") {
        const urls = lists.get(source.name) ?? [];
        let found: string[] = [];
        if (source.name === "Klarna") {
          const initial = JSON.parse($("#initial_payload").text());
          const query = initial.__DEHYDRATED_QUERY_STATE__?.queries?.find((entry: { queryKey: string[] }) => entry.queryKey[0] === "cl-list-data-query");
          const products = query?.state?.data?.pages?.flatMap((page: { products: Array<{ url: string }> }) => page.products) ?? [];
          found = products.map((product: { url: string }) => new URL(`/no/shopping${product.url}`, source.url).href);
          for (const product of products) categoryProducts.set(new URL(`/no/shopping${product.url}`, source.url).href, product);
          await writeFile(`${snapshotDir}/klarna-category-products.json`, JSON.stringify([...categoryProducts.values()]));
        } else if (source.name === "Godpris") {
          found = readLdJsonScripts(html).filter(isRecord).filter((entry) => entry["@type"] === "ItemList")
            .flatMap((entry) => Array.isArray(entry.itemListElement) ? entry.itemListElement.filter(isRecord).map((item) => item.url).filter((url): url is string => typeof url === "string") : []);
        } else {
          found = $("a[href^='/produkter/']").toArray().map((element) => new URL($(element).attr("href")!, source.url).href);
        }
        if (found.length === 0) throw new Error(`${source.name}: no category product data`);
        const combined = [...new Set([...urls, ...found])].slice(0, source.limit);
        lists.set(source.name, combined);
        await crawler.addRequests(combined.filter((url) => !urls.includes(url)).map((url) => ({ url, userData: { stage: "product", source: source.name } })));
        if (source.name === "Klarna" && combined.length < source.limit && request.userData.page < 4) {
          const next = $("a[rel='next']").attr("href") ?? $("a[href*='page=']").toArray().map((element) => $(element).attr("href")!).find((url) => new URL(url, source.url).searchParams.get("page") === String(request.userData.page + 1));
          if (next) await crawler.addRequests([{ url: new URL(next, source.url).href, userData: { stage: "category", source: source.name, page: request.userData.page + 1 } }]);
        }
      } else messages.set(request.url, readMessage(html, request.url));
    },
    failedRequestHandler: async ({ request }, error) => { failures.set(request.url, error.message); },
  }, config);
  await crawler.run(sources.map((source) => ({ url: source.url, userData: { stage: "category", source: source.name, page: 1 } })));
  await writeFile(`${snapshotDir}/manifest.json`, JSON.stringify([...lists], null, 2));
}

let requests = 0;
for (const source of sources) if (!lists.get(source.name)?.length) throw new Error(`${source.name}: category could not be audited`);
const pending = new Map<string, Promise<string>>();
const requestText = async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
  const key = `${init?.method ?? "GET"} ${url} ${init?.body ?? ""}`;
  if (!pending.has(key)) pending.set(key, (async () => {
    const file = `${snapshotDir}/${hash(key)}.txt`;
    if (reuse) { try { return await readFile(file, "utf8"); } catch { /* Fetch missing public data. */ } }
    if (!init?.method || init.method === "GET") {
      try { return await readFile(`${snapshotDir}/${hash(url)}.html`, "utf8"); } catch { /* Not a crawled product. */ }
    }
    if (++requests > 500) throw new Error("Audit request limit reached");
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`${new URL(url).hostname} ${new URL(url).pathname}: HTTP ${response.status}`);
    const text = await response.text();
    await writeFile(file, text);
    return text;
  })());
  return pending.get(key)!;
};
const requestJson = async (url: string, init?: Parameters<typeof requestText>[1]) => JSON.parse(await requestText(url, init));
const results = [];
for (const source of sources) for (const url of lists.get(source.name) ?? []) {
  const message = messages.get(url);
  const row = { source: source.name, url, title: message?.searchTerm ?? "Metadata unavailable", kind: message ? readTcgProductKind(message.searchTerm) : undefined };
  try {
    if (!message) throw new Error(failures.get(url) ?? "Metadata missing");
    const diagnostics: PokeprisDiagnostic[] = [];
    const offer = await findPokeprisPriceMatch(message, requestText, { useSearchApi: false, requestJson, onDiagnostic: (event) => diagnostics.push(event) });
    let own;
    let ownSourceError: string | undefined;
    try {
      own = source.name === "Godpris" ? await findGodprisPriceMatch(message, requestJson, requestText)
        : source.name === "Prisradar" ? await findPrisradarPriceMatch(message, requestJson, requestText) : await findKlarnaPriceMatch(message, requestJson);
    } catch (error) { ownSourceError = String(error); }
    const result = { ...row, status: offer ? "matched" : "unmatched", ownSource: own !== undefined, diagnostics,
      ...(categoryMetadataFallbacks.has(url) ? { metadataSource: "category-fallback" } : {}),
      ...(ownSourceError !== undefined ? { ownSourceError } : {}),
      ...(offer ? { productUrl: offer.productUrl, price: offer.price } : {}) };
    results.push(result);
    console.log(`${source.name} ${results.filter((item) => item.source === source.name).length}: ${result.status} ${row.title}`);
  } catch (error) { results.push({ ...row, status: "error", error: String(error) }); console.warn(`${source.name}: ${row.title}: ${error}`); }
}
const summary = sources.map((source) => ({ source: source.name, categoryUrl: source.url,
  checked: results.filter((row) => row.source === source.name).length,
  matched: results.filter((row) => row.source === source.name && row.status === "matched").length,
  ownSource: results.filter((row) => row.source === source.name && "ownSource" in row && row.ownSource).length,
  categoryMetadataFallbacks: results.filter((row) => row.source === source.name && "metadataSource" in row).length,
  errors: results.filter((row) => row.source === source.name && row.status === "error").length }));
await writeFile(`${output}/tcg-category-audit.json`, JSON.stringify({ checkedAt: new Date().toISOString(), summary, results }, null, 2));
await writeFile(`${output}/tcg-category-audit.md`, `# Kontroll av topplister\n\nPokepris-treff for produkter hentet dynamisk fra kategoriene. Klarna: inntil 48 produkter via offentlig paginering; Prisradar og Godpris: første listeside. Dette er ikke en kontroll av hele katalogene.\n\n${summary.map((row) => `- ${row.source}: ${row.matched}/${row.checked} Pokepris-treff, ${row.ownSource} med pris fra egen kilde, ${row.errors} oppslagsfeil. ${row.categoryMetadataFallbacks} brukte kategoriens produktmetadata fordi produktsiden manglet metadata.`).join("\n")}\n\nManglende Pokepris-treff omfatter andre produkttyper, utsolgte varer, ukjent identitet/språk og mangler i de offentlige katalogdataene. En kilde uten kjøpbart tilbud regnes ikke som transportfeil. Rapporten tester adapterne med nettleserens GET-strategi fra Node; faktiske nettlesertester kommer i tillegg.\n\n| Kilde | Produkt | Pokepris / avvisning |\n| --- | --- | --- |\n${results.map((row) => `| ${row.source} | [${row.title.replaceAll("|", "\\|")}](${row.url}) | ${"productUrl" in row ? `[${row.price}](${row.productUrl})` : "error" in row ? row.error : row.diagnostics.map((entry) => entry.reason).join(", ") || "Utenfor Pokepris-området"} |`).join("\n")}\n`);
console.log(JSON.stringify({ summary, requests }));
