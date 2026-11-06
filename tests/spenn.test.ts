import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import { test } from "node:test";
import { buildSpennOffers, fetchSpennSource } from "../src/backend/providers/spenn.js";
import { requiresSpennExtension, SPENN_EXTENSION_URL } from "../src/shared/provider-data.js";

const NORWAY_SITE_ID = "4aefb3fa-6549-11ef-be75-0aaed722973b";
const STORES = { rate: "a1", dropped: "b2", hanging: "c3" };

function refunderPage(rate: string, merchant: string) {
  return `<html><head><title>Tjen ${rate} Spenn per 10 kr hos ${merchant}</title></head><body>Hos ${merchant} tjener du ${rate} Spenn per 10 kr.</body></html>`;
}

async function readBody(request: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of request) body += chunk;
  return body;
}

async function withSource(
  run: (contentfulUrl: string, requests: string[], catalogBaseUrl: string) => Promise<void>,
  options: { contentfulStatus?: number; failingStores?: number; catalog?: (link: (store: string) => string) => Record<string, unknown>; statusHash?: string; contentfulItems?: (link: (store: string) => string) => unknown[] } = {},
) {
  const requests: string[] = [];
  let base = "";
  const link = (store: string) => `${base}/refunder.com/click?site=${NORWAY_SITE_ID}&store=${store}`;
  const failing = Array.from({ length: options.failingStores ?? 0 }, (_value, index) => `f${index}`);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url!, base);
    if (url.pathname.startsWith("/catalog/")) {
      requests.push(`catalog:${url.pathname.slice("/catalog/".length)}`);
      if (options.catalog === undefined) { response.writeHead(404).end("missing"); return; }
      const catalog = { ...options.catalog(link), content_hash: "a".repeat(64) };
      const body = url.pathname.endsWith("status.json")
        ? { version: 1, market: "NO", files: { nb: { catalog: options.statusHash ?? catalog.content_hash, strings: "b".repeat(64) } } }
        : url.pathname.endsWith("catalog.nb.json") ? catalog : undefined;
      if (body === undefined) { response.writeHead(404).end("missing"); return; }
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(body));
      return;
    }
    if (url.pathname === "/contentful") {
      const { variables } = JSON.parse(await readBody(request)) as { variables: { skip: number; limit: number } };
      requests.push(`contentful:${variables.skip}`);
      if (options.contentfulStatus !== undefined) {
        response.writeHead(options.contentfulStatus, { "Content-Type": "text/plain" }).end("unavailable");
        return;
      }
      // A full first page must lead to a second page request.
      const items = options.contentfulItems !== undefined ? options.contentfulItems(link) : variables.skip === 0
        ? Array.from({ length: variables.limit }, () => ({ title: "Annet", longDescription: null, merchant: null, externalTarget: null }))
        : [
          { title: "Rate", longDescription: "**1 Spenn per 10 kr**", merchant: { name: "Rate Store" }, externalTarget: { link: link(STORES.rate) } },
          { title: "Dropped", longDescription: "**1 Spenn per 10 kr**", merchant: { name: "Dropped Store" }, externalTarget: { link: link(STORES.dropped) } },
          { title: "Hanging", longDescription: "**2,5 Spenn per 10 kr**", merchant: { name: "Hanging Store" }, externalTarget: { link: link(STORES.hanging) } },
          ...failing.map((store) => ({ title: store, longDescription: null, merchant: { name: store }, externalTarget: { link: link(store) } })),
        ];
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ data: { offerCollection: { items } } }));
      return;
    }
    const store = url.searchParams.get("store")!;
    requests.push(`refunder:${store}`);
    const count = requests.filter((entry) => entry === `refunder:${store}`).length;
    if (store === STORES.dropped && count === 1) { request.socket.destroy(); return; }
    if (store === STORES.hanging) return;
    if (failing.includes(store)) { response.writeHead(404, { "Content-Type": "text/html" }).end("gone"); return; }
    response.writeHead(200, { "Content-Type": "text/html" }).end(refunderPage(store === STORES.rate ? "6,5" : "3", store));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  base = `http://127.0.0.1:${address.port}`;
  try {
    await run(`${base}/contentful`, requests, `${base}/catalog`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("Spenn pages through Contentful, retries a dropped refunder connection and falls back to Contentful after a timeout", async () => {
  await withSource(async (contentfulUrl, requests, catalogBaseUrl) => {
    const warnings: string[] = [];
    const logger = { info() {}, warn: (message: string) => { warnings.push(message); }, error() {} };
    const source = await fetchSpennSource({ logger, catalogBaseUrl, contentfulUrl, navigationTimeoutSecs: 1 });
    // Without the extension catalogue the Contentful store list is the backup.
    assert.equal(source.catalog, undefined);
    assert.ok(warnings.some((message) => /extension catalogue .*status\.json failed \(HTTP 404/.test(message)));
    assert.deepEqual(requests.filter((entry) => entry.startsWith("contentful")), ["contentful:0", "contentful:100"]);
    assert.equal(requests.filter((entry) => entry === `refunder:${STORES.dropped}`).length, 2);
    assert.equal(requests.filter((entry) => entry === `refunder:${STORES.hanging}`).length, 3);
    assert.equal(source.refunderRates.size, 2);
    assert.ok(warnings.some((message) => message.includes(`store=${STORES.hanging}`) && /failed after retries/.test(message)));

    const offers = buildSpennOffers({ source, domainLookup: new Map(), generatedAt: "2026-10-23T12:00:00.000Z", logger });
    assert.deepEqual(
      offers.map((offer) => [offer.merchantName, offer.reward]).sort(),
      [["Dropped Store", "3 %"], ["Hanging Store", "2,5 %"], ["Rate Store", "6,5 %"]],
    );
  });
});

test("Spenn stops refunder pages after repeated failures and reports Contentful errors with the request", async () => {
  await withSource(async (contentfulUrl, requests, catalogBaseUrl) => {
    const warnings: string[] = [];
    const logger = { info() {}, warn: (message: string) => { warnings.push(message); }, error() {} };
    const source = await fetchSpennSource({ logger, catalogBaseUrl, contentfulUrl, navigationTimeoutSecs: 1, maxRefunderFailures: 2 });
    assert.ok(warnings.some((message) => /stopping refunder pages after 2 failures/.test(message)));
    assert.ok(requests.filter((entry) => entry.startsWith("refunder:f")).length < 20);
    assert.ok(source.items.length > 100);
  }, { failingStores: 20 });

  await withSource(async (contentfulUrl, _requests, catalogBaseUrl) => {
    const logger = { info() {}, warn() {}, error() {} };
    await assert.rejects(
      fetchSpennSource({ logger, catalogBaseUrl, contentfulUrl, navigationTimeoutSecs: 1 }),
      /Spenn: extension catalogue .*status\.json failed \(HTTP 404\); Contentful offers request \(skip 0\) to http:\/\/127\.0\.0\.1:\d+\/contentful failed after retries \(503/,
    );
  }, { contentfulStatus: 503 });
});

// Shape of spenn-cdn.refunder.com/extension/v1/no/catalog.nb.json (fetched 2026-11-05).
function catalogStore(link: (store: string) => string, id: string, name: string, rate: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    id, name, logo: "", description: "", terms: "", spenn: "", category: "", extension: { popup: true },
    rate: { unit: rate.fixed === true ? null : "per 10 kr", fixed: false, up_to: false, condition: null, ...rate },
    match_rules: [{ host: `${id}.no`, include_subdomains: true, path: "", query: {} }],
    activation_url: `${link(id)}&source=browser-extension&spennId={spennId}`,
    ...extra,
  };
}

test("Spenn uses the extension catalogue: fixed bonuses, verified hosts, up-to breakdowns and Contentful direct offers", async () => {
  await withSource(async (contentfulUrl, requests, catalogBaseUrl) => {
    const warnings: string[] = [];
    const logger = { info() {}, warn: (message: string) => { warnings.push(message); }, error() {} };
    const source = await fetchSpennSource({ logger, catalogBaseUrl, contentfulUrl, navigationTimeoutSecs: 1 });
    assert.ok(source.catalog);
    // Only the "opp til" store needs its refunder page for the category breakdown.
    assert.deepEqual(requests.filter((entry) => entry.startsWith("refunder:")).sort(), ["refunder:a1", "refunder:upto"]);
    const offers = buildSpennOffers({ source, domainLookup: new Map(), generatedAt: "2026-11-05T12:00:00.000Z", logger });
    const byName = new Map(offers.map((offer) => [offer.merchantName, offer]));
    assert.deepEqual([...byName.keys()].sort(), ["Card Brand", "Direct Brand", "Farmasiet.no", "Lindex", "Nordnet", "Rate Store", "Up To"]);
    const nordnet = byName.get("Nordnet")!;
    assert.equal(nordnet.reward, "192 kr");
    assert.deepEqual(nordnet.domains, ["nordnet.no"]);
    // The click link needs the shopper's SpennID, so the offer points to Spenn's own extension.
    assert.equal(nordnet.activationUrl, SPENN_EXTENSION_URL);
    assert.ok(requiresSpennExtension(nordnet));
    assert.match(nordnet.terms!, /^1 920 Spenn \(1 Spenn = 10 øre\)\.\nGjelder: Nytt depot\.\nKrever Spenns egen nettleserutvidelse/);
    assert.ok(offers.every((offer) => !/spennId|refunder\.com\/click/i.test(offer.activationUrl ?? "")));
    // Breakdown from the refunder page when its maximum matches the catalogue; "Up To"'s page
    // disagrees (3 %), so the catalogue maximum stays with its qualifier.
    assert.equal(byName.get("Rate Store")!.reward, "6,5 %");
    assert.equal(byName.get("Up To")!.reward, "opptil 4,8 %");
    assert.deepEqual(byName.get("Lindex")!.domains, ["lindex.no"]);
    assert.equal(byName.get("Farmasiet.no")!.reward, "3,4 %");
    // Contentful keeps direct offers, but its refunder stores and renamed duplicates do not reappear.
    assert.equal(byName.get("Direct Brand")!.reward, "5 %");
    // App brands start in the Spenn app (their web page fails without it), as Spenn's extension says.
    assert.equal(byName.get("Direct Brand")!.activationUrl, "https://app.spenngroup.com/home");
    assert.match(byName.get("Direct Brand")!.terms!, /Opptjeningen skjer ikke gjennom nettleserutvidelsen\. Start kjøpet fra Spenn-appen\./);
    assert.deepEqual(byName.get("Direct Brand")!.domains, ["directbrand.no"]);
    assert.deepEqual(byName.get("Card Brand")!.domains, ["cardbrand.com", "cardbrand.no"]);
    // Card brands keep their link and say which loyalty login is needed.
    assert.equal(byName.get("Card Brand")!.activationUrl, "https://www.cardbrand.no/spenn");
    assert.match(byName.get("Card Brand")!.terms!, /Logg inn som Card Reward-medlem for å tjene Spenn\./);
    assert.ok(!requiresSpennExtension(byName.get("Direct Brand")!));
    assert.ok(!byName.has("Old Refunder Store") && !byName.has("Farmasiet"));
    assert.ok(warnings.some((message) => /skipping Implausible/.test(message)));
  }, {
    catalog: (link) => ({
      version: 1, generated_at: "2026-11-05T10:45:04+01:00", market: "NO", locale: "nb", currency: "NOK", campaigns: [], links: {}, stand_down: {},
      // Shape of the catalogue's direct_brands (OneCall: kind "app", Norwegian: kind "card").
      direct_brands: [
        { id: "d1", name: "Direct Brand", logo: "", kind: "app", programme: null, app_url: "https://app.spenngroup.com/home", match_rules: [{ host: "directbrand.no", include_subdomains: true, path: "", query: {} }] },
        { id: "d2", name: "Card Brand", logo: "", kind: "card", programme: "Card Reward", app_url: null, match_rules: [{ host: "cardbrand.com", include_subdomains: true, path: "", query: {} }] },
      ],
      stores: [
        catalogStore(link, "nordnet", "Nordnet", { value: 1920, fixed: true, condition: "Nytt depot" }, { spenn: "1 920 Spenn" }),
        catalogStore(link, "a1", "Rate Store ", { value: 6.5, up_to: true }),
        catalogStore(link, "upto", "Up To", { value: 4.8, up_to: true }),
        catalogStore(link, "lindex", "Lindex", { value: 2.4 }, { match_rules: [
          { host: "lindex.no", include_subdomains: true, path: "", query: {} },
          { host: "lindex.com", include_subdomains: true, path: "/no", query: {} },
        ] }),
        catalogStore(link, "farmasiet", "Farmasiet.no", { value: 3.4 }),
        catalogStore(link, "implausible", "Implausible", { value: 37.9 }),
      ],
    }),
    contentfulItems: (link) => [
      { title: "Old", longDescription: "**2 Spenn per 10 kr**", merchant: { name: "Old Refunder Store" }, externalTarget: { link: link("old") } },
      { title: "Farmasiet", longDescription: "**3,4 Spenn per 10 kr**", merchant: { name: "Farmasiet" }, externalTarget: { link: "https://www.farmasiet.no/spenn" } },
      { title: "Direct", longDescription: "Tjen **5 Spenn per 10 kr**", merchant: { name: "Direct Brand" }, externalTarget: { link: "https://www.directbrand.no/spenn" } },
      { title: "Card", longDescription: "Tjen **1 Spenn per 10 kr**", merchant: { name: "Card Brand" }, externalTarget: { link: "https://www.cardbrand.no/spenn" } },
    ],
  });
});

test("Spenn rejects a catalogue whose content_hash does not match status.json", async () => {
  await withSource(async (contentfulUrl, _requests, catalogBaseUrl) => {
    const warnings: string[] = [];
    const logger = { info() {}, warn: (message: string) => { warnings.push(message); }, error() {} };
    const source = await fetchSpennSource({ logger, catalogBaseUrl, contentfulUrl, navigationTimeoutSecs: 1 });
    assert.equal(source.catalog, undefined);
    assert.ok(warnings.some((message) => /content_hash a{64} does not match status\.json \(c{64}\)/.test(message)));
  }, {
    statusHash: "c".repeat(64),
    catalog: () => ({ generated_at: "2026-11-05T10:45:04+01:00", market: "NO", locale: "nb", stores: [] }),
    contentfulItems: () => [],
  });
});
