import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import { test } from "node:test";
import { buildSpennOffers, fetchSpennSource } from "../src/backend/providers/spenn.js";

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
  run: (contentfulUrl: string, requests: string[]) => Promise<void>,
  options: { contentfulStatus?: number; failingStores?: number } = {},
) {
  const requests: string[] = [];
  let base = "";
  const link = (store: string) => `${base}/refunder.com/click?site=${NORWAY_SITE_ID}&store=${store}`;
  const failing = Array.from({ length: options.failingStores ?? 0 }, (_value, index) => `f${index}`);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url!, base);
    if (url.pathname === "/contentful") {
      const { variables } = JSON.parse(await readBody(request)) as { variables: { skip: number; limit: number } };
      requests.push(`contentful:${variables.skip}`);
      if (options.contentfulStatus !== undefined) {
        response.writeHead(options.contentfulStatus, { "Content-Type": "text/plain" }).end("unavailable");
        return;
      }
      // A full first page must lead to a second page request.
      const items = variables.skip === 0
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
    await run(`${base}/contentful`, requests);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("Spenn pages through Contentful, retries a dropped refunder connection and falls back to Contentful after a timeout", async () => {
  await withSource(async (contentfulUrl, requests) => {
    const warnings: string[] = [];
    const logger = { info() {}, warn: (message: string) => { warnings.push(message); }, error() {} };
    const source = await fetchSpennSource({ logger, contentfulUrl, navigationTimeoutSecs: 1 });
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
  await withSource(async (contentfulUrl, requests) => {
    const warnings: string[] = [];
    const logger = { info() {}, warn: (message: string) => { warnings.push(message); }, error() {} };
    const source = await fetchSpennSource({ logger, contentfulUrl, navigationTimeoutSecs: 1, maxRefunderFailures: 2 });
    assert.ok(warnings.some((message) => /stopping refunder pages after 2 failures/.test(message)));
    assert.ok(requests.filter((entry) => entry.startsWith("refunder:f")).length < 20);
    assert.ok(source.items.length > 100);
  }, { failingStores: 20 });

  await withSource(async (contentfulUrl) => {
    const logger = { info() {}, warn() {}, error() {} };
    await assert.rejects(
      fetchSpennSource({ logger, contentfulUrl, navigationTimeoutSecs: 1 }),
      /Spenn: Contentful offers request \(skip 0\) to http:\/\/127\.0\.0\.1:\d+\/contentful failed after retries \(503/,
    );
  }, { contentfulStatus: 503 });
});
