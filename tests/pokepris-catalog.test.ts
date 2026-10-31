import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildPokeprisCatalog, collectPokeprisCatalog, fetchPokeprisCatalog, writePokeprisCatalog } from "../src/backend/pokepris-catalog.js";
import { findPokeprisCatalogProduct, isFreshPokeprisCatalog, isPokeprisCatalog, POKEPRIS_CATALOG_URL, type PokeprisCatalog } from "../src/shared/pokepris-catalog.js";
import { findPokeprisPriceMatch } from "../src/shared/pokepris-price-match.js";
import type { GetPriceMatchForProductMessage } from "../src/shared/extension-messages.js";
import { readNextFlightValues } from "../src/shared/product-data.js";
import { isSameProductUrl, normalizeProductUrlKey } from "../src/shared/product-match.js";

const generatedAt = "2026-10-31T06:00:00.000Z";
const actionId = "40" + "b".repeat(40);
const messages: string[] = [];
const logger = { info: (line: string) => messages.push(line), warn: (line: string) => messages.push(line), error: (line: string) => messages.push(line) };

function flight(value: unknown): string {
  return `<script>self.__next_f.push(${JSON.stringify([1, `1:${JSON.stringify(value)}\n`])})</script>`;
}

function row(id: number, canonicalId: string, name: string, productUrl: string | null, extra: Record<string, unknown> = {}) {
  return { id, name, category: "etb", set_name: "Prismatic Evolutions", store_name: "Butikk", in_stock: false, product_url: productUrl, canonical_id: canonicalId, current_price: 999, redacted: false, ...extra };
}

type Source = { requests: string[]; posts: Array<Record<string, unknown>>; origin: string };

// A local Pokepris with the public pages, the store-filtered action and the
// failure modes the crawl must survive.
async function withPokepris(run: (source: Source) => Promise<void>, options: {
  action?: boolean; rows?: (body: Record<string, unknown>) => { products: unknown[]; hasMore: boolean } | undefined;
  postStatus?: (body: Record<string, unknown>, count: number) => number | "drop" | undefined;
} = {}) {
  const requests: string[] = [];
  const posts: Array<Record<string, unknown>> = [];
  let origin = "";
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const path = request.url!;
      requests.push(`${request.method} ${path}`);
      const count = requests.filter((entry) => entry === `${request.method} ${path}`).length;
      if (request.method === "POST") {
        assert.equal(request.headers["next-action"], actionId);
        const input = (JSON.parse(body) as Array<Record<string, unknown>>)[0]!;
        posts.push(input);
        const status = options.postStatus?.(input, posts.filter((post) => JSON.stringify(post) === JSON.stringify(input)).length);
        if (status === "drop") { request.socket.destroy(); return; }
        if (status !== undefined) { response.writeHead(status).end("unavailable"); return; }
        const result = options.rows?.(input) ?? defaultRows(input);
        response.writeHead(200, { "Content-Type": "text/x-component" }).end(`0:{"a":"$@1"}\n1:${JSON.stringify({ ...result, total: Array.isArray(result.products) ? result.products.length : 0 })}\n`);
        return;
      }
      if (path === "/butikker" && count === 1) { request.socket.destroy(); return; }
      const pages: Record<string, [string, string]> = {
        "/": ["text/html", '<script src="/_next/static/chunks/with-action.js"></script><script src="/_next/static/chunks/newest.js"></script><script src="https://outside.example/x.js"></script>'],
        "/_next/static/chunks/newest.js": ["application/javascript", "no action here"],
        "/_next/static/chunks/with-action.js": ["application/javascript", options.action === false ? "nothing" : `r=(0,t.createServerReference)("${actionId}",t.callServer,void 0,t.findSourceMapURL,"getProducts");`],
        // Translations reuse the key "stores"; only the record list counts.
        "/butikker": ["text/html", flight({ labels: { stores: "Butikker" } }) + flight({ stores: [{ id: 1, name: "Kort & Spill", url: "https://kort.example" }, { id: 2, name: "Ø-butikken", url: "https://oe.example" }] })],
        "/sitemap.xml": ["application/xml", `<urlset><url><loc>${origin}/butikk/kort-and-spill</loc></url><url><loc>${origin}/butikk/oe-butikken</loc></url><url><loc>${origin}/butikk/skjult</loc></url><url><loc>https://elsewhere.example/butikk/x</loc></url></urlset>`],
        "/butikk/skjult": ["text/html", flight({ stores: "Butikker" }) + flight({ initialProducts: { products: [] }, stores: [{ id: 3, name: "Skjult" }], fixedStore: 3 })],
      };
      const page = pages[path];
      if (page === undefined) { response.writeHead(404).end(); return; }
      response.writeHead(200, { "Content-Type": page[0] }).end(page[1]);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  origin = `http://127.0.0.1:${address.port}`;
  try {
    await run({ requests, posts, origin });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function defaultRows(input: Record<string, unknown>): { products: unknown[]; hasMore: boolean } {
  const page = Number(input.offset) / Number(input.limit);
  if (input.storeId === 1 && input.language === "en") {
    return page === 0 ? {
      hasMore: true,
      products: [
        row(500, "en_prismatic_evolutions_elite_trainer_box", "Prismatic Evolutions Elite Trainer Box", "https://www.kort.example/p/pe-etb?utm_source=pokepris"),
        row(900, "en_unique_pe_etb_misc", "PE ETB misc", "https://kort.example/p/misc"),
        row(901, "en_prismatic_evolutions_booster_box", "Prismatic Evolutions Booster Box", "https://kort.example/p/pe-box", { category: null }),
        row(902, "en_prismatic_evolutions_bundle", "Prismatic Evolutions Bundle", null, { redacted: true }),
      ],
    } : { hasMore: false, products: [row(510, "en_journey_together_elite_trainer_box", "Journey Together Elite Trainer Box", "https://kort.example/p/shared")] };
  }
  if (input.storeId === 2 && input.language === "en") {
    return { hasMore: false, products: [
      // Two store-listing IDs for one product; the product list's ID represents it.
      row(300, "en_prismatic_evolutions_elite_trainer_box", "Prismatic Evolutions Elite Trainer Box", "https://oe.example/pe-etb?variant=2"),
      row(520, "en_surging_sparks_elite_trainer_box", "Surging Sparks Elite Trainer Box", "https://kort.example/p/shared"),
    ] };
  }
  // The unfiltered list, with each product's own (main) ID.
  if (input.storeId === undefined && input.language === "en") {
    return { hasMore: false, products: [row(250, "en_prismatic_evolutions_elite_trainer_box", "Prismatic Evolutions Elite Trainer Box", null, { redacted: true })] };
  }
  if (input.storeId === 3 && input.language === "jp") {
    return { hasMore: false, products: [row(700, "jp_terastal_festival_booster_box", "Terastal Festival Booster Box [JP]", "https://skjult.example/terastal", { category: "booster_box", set_name: null })] };
  }
  return { hasMore: false, products: [] };
}

test("the catalog crawl discovers the action and every store, reads both languages, and keeps only comparable merchant URLs", async () => {
  await withPokepris(async ({ requests, posts, origin }) => {
    const catalog = await fetchPokeprisCatalog({ generatedAt, logger, origin });
    assert.ok(isPokeprisCatalog(catalog));
    assert.equal(catalog.source, origin);
    // The action is found in the newest script first, then the next one; nothing external.
    assert.deepEqual(requests.filter((entry) => entry.includes("/chunks/")), ["GET /_next/static/chunks/newest.js", "GET /_next/static/chunks/with-action.js"]);
    assert.ok(requests.every((entry) => !entry.includes("outside.example")));
    // A dropped store list is retried; only the store missing from it is opened.
    assert.equal(requests.filter((entry) => entry === "GET /butikker").length, 2);
    assert.deepEqual(requests.filter((entry) => entry.startsWith("GET /butikk/")), ["GET /butikk/skjult"]);
    assert.deepEqual([...new Set(posts.map((post) => `${post.storeId ?? "all"}:${post.language}`))].sort(), ["1:en", "1:jp", "2:en", "2:jp", "3:en", "3:jp", "all:en", "all:jp"]);
    assert.ok(posts.every((post) => post.inStockOnly === false && post.tcg === "pokemon" && post.limit === 200));
    assert.deepEqual(posts.filter((post) => post.storeId === 1 && post.language === "en").map((post) => post.offset), [0, 200]);
    assert.deepEqual(catalog.products.map((product) => [product.id, product.canonicalId, product.language]), [
      [250, "en_prismatic_evolutions_elite_trainer_box", "en"],
      [510, "en_journey_together_elite_trainer_box", "en"],
      [520, "en_surging_sparks_elite_trainer_box", "en"],
      [700, "jp_terastal_festival_booster_box", "jp"],
    ]);
    // Tracking is dropped, variants kept; a URL linked to two products is ambiguous.
    assert.deepEqual(catalog.urls, {
      "kort.example/p/pe-etb": 250,
      "oe.example/pe-etb?variant=2": 250,
      "skjult.example/terastal": 700,
    });
    assert.equal(findPokeprisCatalogProduct(catalog, ["https://kort.example/p/pe-etb/?utm_campaign=x"])?.id, 250);
    assert.equal(findPokeprisCatalogProduct(catalog, ["https://oe.example/pe-etb"]), undefined);
    assert.ok(messages.some((line) => /omitted 1 merchant URLs/.test(line) && line.includes("kort.example/p/shared")));
  });
});

test("server errors and dropped connections are retried, and a source failure names the source, request and cause", async () => {
  await withPokepris(async ({ posts, origin }) => {
    const catalog = await fetchPokeprisCatalog({ generatedAt, logger, origin });
    assert.equal(catalog.products.length, 4);
    assert.equal(posts.filter((post) => post.storeId === 2 && post.language === "en").length, 3);
  }, { postStatus: (input, count) => input.storeId === 2 && input.language === "en" && count < 3 ? (count === 1 ? "drop" : 503) : undefined });

  await withPokepris(async ({ posts, origin }) => {
    await assert.rejects(fetchPokeprisCatalog({ generatedAt, logger, origin }), (error: Error) =>
      /Pokepris catalog: 6\/6 store queries failed/.test(error.message) && /POST http:\/\/127\.0\.0\.1:\d+\/ .*"storeId":1/.test(error.message) && /\b429\b/.test(error.message));
    // Each store and product-list query is tried three times, then the crawl stops.
    assert.equal(posts.length, 8 * 3);
  }, { postStatus: () => 429 });

  await withPokepris(async ({ requests, origin }) => {
    await assert.rejects(fetchPokeprisCatalog({ generatedAt, logger, origin }), /getProducts action not found in 2 homepage scripts/);
    assert.ok(requests.every((entry) => !entry.startsWith("POST")));
  }, { action: false });
});

test("pagination stops at the page limit, and a changed response format fails without retries", async () => {
  await withPokepris(async ({ posts, origin }) => {
    await assert.rejects(fetchPokeprisCatalog({ generatedAt, logger, origin, maxPagesPerQuery: 3 }), /6\/6 store queries failed/);
    assert.equal(posts.filter((post) => post.storeId !== undefined).length, 6 * 3);
    assert.equal(posts.filter((post) => post.storeId === undefined).length, 2 * 30);
    assert.ok(messages.some((line) => /Kort & Spill \(en\) has more pages than the limit; stopped there/.test(line)));
  }, { rows: () => ({ products: [], hasMore: true }) });

  await withPokepris(async ({ posts, origin }) => {
    await assert.rejects(fetchPokeprisCatalog({ generatedAt, logger, origin }), /invalid getProducts response for Kort & Spill \(en, page 1\)/);
    assert.equal(posts.length, 8);
  }, { rows: () => ({ items: [] }) as never });
});

test("a failed or suspiciously small crawl keeps the previous catalog for 14 days with its own date", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pokepris-catalog-"));
  try {
    const path = join(directory, "pokepris-catalog.json");
    const previous = buildPokeprisCatalog(Array.from({ length: 20 }, (_, index) => ({
      id: index + 1, canonicalId: `en_product_${index}_elite_trainer_box`, name: `Product ${index} Elite Trainer Box`, category: "etb", productUrl: `https://shop.example/p/${index}`,
    })), "2026-10-25T06:00:00.000Z", "https://www.pokepris.no").catalog;
    await writePokeprisCatalog(path, previous);
    const written: unknown = JSON.parse(await readFile(path, "utf8"));
    assert.deepEqual(written, previous);
    // Header, one line per product, separator, one line per URL, closing line.
    assert.equal((await readFile(path, "utf8")).trimEnd().split("\n").length, 1 + 20 + 1 + 20 + 1);

    await withPokepris(async ({ origin }) => {
      // Three URLs where the previous catalog had twenty: the format probably changed.
      const reused = await collectPokeprisCatalog({ generatedAt, logger, origin, previousPath: path });
      assert.equal(reused?.generatedAt, "2026-10-25T06:00:00.000Z");
      assert.ok(messages.some((line) => /only 3 merchant URLs, previous catalog had 20; reusing the catalog generated 2026-10-25/.test(line)));
      const stale = await collectPokeprisCatalog({ generatedAt: "2026-11-09T06:00:00.000Z", logger, origin, previousPath: path });
      assert.equal(stale, undefined);
    });
    await withPokepris(async ({ origin }) => {
      const fresh = await collectPokeprisCatalog({ generatedAt, logger, origin, previousPath: join(directory, "missing.json") });
      assert.equal(fresh?.generatedAt, generatedAt);
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// --- Client lookup through the published catalog ---

const productUrl = "https://www.pokepris.no/produkt/300";
const merchantUrl = "https://kort.example/p/pe-etb";
const message: GetPriceMatchForProductMessage = {
  type: "get-price-match-for-product", url: merchantUrl,
  // No language on the merchant page and a retailer-specific title.
  searchTerm: "Pokémon TCG Prismatic Evolutions ETB", productPageClue: true, price: 1999, currency: "NOK",
};
const catalog: PokeprisCatalog = {
  version: 1, generatedAt: new Date().toISOString(), source: "https://www.pokepris.no",
  products: [
    { id: 300, canonicalId: "en_prismatic_evolutions_elite_trainer_box", name: "Prismatic Evolutions Elite Trainer Box", category: "etb", language: "en" },
    { id: 301, canonicalId: "jp_prismatic_evolutions_elite_trainer_box", name: "Prismatic Evolutions Elite Trainer Box [JP]", category: "etb", language: "jp" },
  ],
  urls: { "kort.example/p/pe-etb": 300, "center.example/pc-etb": 300 },
};

type Seller = { url: string; price: number; stock?: string; title?: string; shop?: string; jsonLd?: boolean };
function productPage(sellers: Seller[], id = 300, language = "Engelsk") {
  const name = "Prismatic Evolutions Elite Trainer Box";
  const shop = (seller: Seller) => seller.shop ?? new URL(seller.url).hostname;
  const offers = sellers.filter((seller) => seller.jsonLd !== false).map((seller) => ({
    "@type": "Offer", price: seller.price, priceCurrency: "NOK", url: seller.url, seller: { name: shop(seller) },
    availability: `https://schema.org/${seller.stock ?? "InStock"}`, itemCondition: "https://schema.org/NewCondition",
  }));
  const rows = sellers.map((seller) => ({ product_url: seller.url, product_name: seller.title ?? `Pokémon ${name}`, store_name: shop(seller),
    current_price: seller.price, in_stock: (seller.stock ?? "InStock") === "InStock", is_preorder: false, redacted: false }));
  return `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", brand: { name: "Pokémon" }, name,
    additionalProperty: [{ name: "Språk", value: language }], offers: { "@type": "AggregateOffer", offers } })}</script>` +
    flight({ product: { id, name }, lowestPrice: rows[0], otherInStockPrices: rows.slice(1), outOfStockPrices: [] });
}

// null: the catalog request returns no body.
function transport(pages: Record<string, string>, catalogText: string | null = JSON.stringify(catalog)) {
  const requests: string[] = [];
  const request = async (url: string, init?: { method?: string }) => {
    requests.push(`${init?.method ?? "GET"} ${url}`);
    if (url === POKEPRIS_CATALOG_URL) return catalogText ?? undefined;
    return pages[url] ?? '<a href="/sett">Alle sett</a>';
  };
  return { request, requests };
}

test("a merchant URL in the catalog opens its price list directly, without title search or language guessing", async () => {
  const fixture = transport({ [productUrl]: productPage([
    { url: merchantUrl, price: 1999 }, { url: "https://cheap.example/pe-etb", price: 1799 },
  ]) });
  const result = await findPokeprisPriceMatch(message, fixture.request, { useCatalog: true });
  assert.equal(result?.productUrl, productUrl);
  assert.equal(result?.amount, 1799);
  assert.equal(result?.offerUrl, "https://cheap.example/pe-etb");
  assert.equal(result?.matchedCurrentMerchant, true);
  assert.equal(result?.matchedExactProduct, true);
  assert.deepEqual(fixture.requests, [`GET ${POKEPRIS_CATALOG_URL}`, `GET ${productUrl}`]);
  // The catalog is cached for the transport.
  await findPokeprisPriceMatch(message, fixture.request, { useCatalog: true });
  assert.equal(fixture.requests.filter((entry) => entry.includes("pokepris-catalog")).length, 1);
});

test("a sold-out merchant row from the page data proves identity even when JSON-LD omits it", async () => {
  const fixture = transport({ [productUrl]: productPage([
    { url: merchantUrl, price: 1999, stock: "OutOfStock", jsonLd: false }, { url: "https://cheap.example/pe-etb", price: 1799 },
  ]) });
  const result = await findPokeprisPriceMatch(message, fixture.request, { useCatalog: true });
  assert.equal(result?.amount, 1799);
  assert.equal(result?.matchedCurrentMerchant, true);
  assert.deepEqual(result?.alternatives?.map((item) => item.amount), [1799]);
});

test("a catalog association is not trusted when the merchant's own title is another edition or language", async () => {
  const pokemonCenter = "https://center.example/pc-etb";
  const diagnostics: string[] = [];
  const fixture = transport({ [productUrl]: productPage([
    { url: pokemonCenter, price: 2999, title: "Pokémon Center Prismatic Evolutions Elite Trainer Box", stock: "OutOfStock", jsonLd: false },
    { url: "https://cheap.example/pe-etb", price: 1799 },
  ]) });
  const result = await findPokeprisPriceMatch({ ...message, url: pokemonCenter, searchTerm: "Pokémon Center Prismatic Evolutions Elite Trainer Box" },
    fixture.request, { useCatalog: true, onDiagnostic: (event) => diagnostics.push(event.reason) });
  assert.equal(result, undefined);
  // The page title conflicts before any offer is read; ordinary search finds no Pokémon Center ETB.
  assert.ok(diagnostics.includes("product-variant-mismatch"));
  assert.ok(diagnostics.includes("no-matching-catalog-product"));

  const japanese = transport({ [productUrl]: productPage([{ url: merchantUrl, price: 1999 }]) });
  assert.equal(await findPokeprisPriceMatch({ ...message, searchTerm: `${message.searchTerm} Japansk` }, japanese.request, { useCatalog: true }), undefined);

  // The merchant's row itself names another edition: identity is not confirmed.
  const rowDiagnostics: string[] = [];
  const mislinked = transport({ [productUrl]: productPage([
    { url: merchantUrl, price: 2999, title: "Pokémon Center Prismatic Evolutions Elite Trainer Box" }, { url: "https://cheap.example/pe-etb", price: 1799 },
  ]) });
  assert.equal(await findPokeprisPriceMatch(message, mislinked.request, { useCatalog: true, onDiagnostic: (event) => rowDiagnostics.push(event.reason) }), undefined);
  assert.ok(rowDiagnostics.includes("current-merchant-offer-not-verified"));
});

test("comparison pages search the catalog instead of Pokepris' action, filtered by language", async () => {
  const comparison = { ...message, url: "https://www.prisjakt.no/product.php?p=1", searchTerm: "Pokémon TCG Prismatic Evolutions Elite Trainer Box", productLanguage: "en" };
  const fixture = transport({ [productUrl]: productPage([{ url: "https://cheap.example/pe-etb", price: 1799 }]) });
  const result = await findPokeprisPriceMatch(comparison, fixture.request, { useCatalog: true, requestJson: async () => undefined });
  assert.equal(result?.productUrl, productUrl);
  assert.deepEqual(fixture.requests, [`GET ${POKEPRIS_CATALOG_URL}`, `GET ${productUrl}`]);
});

test("a missing, invalid or stale catalog falls back to Pokepris' public search with a diagnostic", async () => {
  const stale = { ...catalog, generatedAt: "2026-01-01T00:00:00.000Z" };
  assert.equal(isFreshPokeprisCatalog(stale), false);
  for (const catalogText of [null, "<html>404</html>", JSON.stringify({ ...catalog, urls: { "kort.example/p/pe-etb": 999 } }), JSON.stringify(stale)]) {
    const diagnostics: string[] = [];
    const fixture = transport({}, catalogText);
    await findPokeprisPriceMatch(message, fixture.request, { useCatalog: true, useSearchApi: false, onDiagnostic: (event) => diagnostics.push(event.reason) });
    assert.ok(diagnostics.some((reason) => reason.startsWith("catalog-unavailable: Pokepris catalog:")), String(catalogText).slice(0, 40));
    assert.ok(fixture.requests.includes("GET https://www.pokepris.no/"));
  }
});

test("Next text rows are skipped by UTF-8 length so the following row is still read", () => {
  const text = '{"name":"Pokémon – æøå 🎴"}';
  const length = new TextEncoder().encode(text).length.toString(16);
  const html = `<script>self.__next_f.push(${JSON.stringify([1, `5:T${length},${text}6:{"product":{"id":1}}\n7:["after"]\n`])})</script>`;
  assert.deepEqual(readNextFlightValues(html), [{ product: { id: 1 } }, ["after"]]);
});

test("product URL keys drop tracking but keep variants, host case and trailing slashes aside", () => {
  assert.equal(normalizeProductUrlKey("https://WWW.Shop.example/p/etb/?utm_source=x&variant=2&gclid=y"), "shop.example/p/etb?variant=2");
  assert.equal(isSameProductUrl("https://shop.example/p/etb?b=2&a=1", "http://www.shop.example/p/etb/?a=1&b=2"), true);
  assert.equal(isSameProductUrl("https://shop.example/p/etb?variant=1", "https://shop.example/p/etb"), false);
  assert.equal(isSameProductUrl("https://shop.example/P/etb", "https://shop.example/p/etb"), false);
  assert.equal(isSameProductUrl(undefined, undefined), false);
});
