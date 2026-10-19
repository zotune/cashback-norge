import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { fetchGratisbursdag } from "../src/backend/providers/gratisbursdag.js";
import { readProviderOverrides } from "../src/backend/provider-overrides.js";
import { buildCashbackIndex, findOffersForHostname, isCashbackIndex, isCashbackOffer } from "../src/shared/cashback.js";
import { buildProviderMeta } from "../src/shared/provider-data.js";
import { calculateCashback, calculateCashbackMaxKr, formatCompactRewardLabel } from "../src/shared/reward-calculation.js";

const generatedAt = "2026-10-19T12:00:00.000Z";
const logger = { info() {}, warn() {}, error() {} };
const entry = {
  id: 1, brandName: "Example", offer: "Gratis kaffe", description: "Hent gaven i appen.",
  requirements: ["Kundeklubb", "Registrert fødselsdato"], locations: ["Fysiske butikker"],
  validity: "5 dager fra bursdagen", confirmed: false, value: "Gratis kaffe", offerType: "gratis",
};

async function withCatalogue(
  entries: unknown[],
  run: (startUrl: string, requests: string[]) => Promise<void>,
  options: { status?: number; script?: string; filename?: string; disconnectOnce?: "page" | "script" } = {},
) {
  const requests: string[] = [];
  const filename = options.filename ?? "index-new-hash.js";
  let disconnected = false;
  const server = createServer((request, response) => {
    requests.push(request.url!);
    if (!disconnected && options.disconnectOnce === (request.url === "/" ? "page" : "script")) {
      disconnected = true;
      request.socket.destroy();
      return;
    }
    if (request.url === "/") {
      response.setHeader("Content-Type", "text/html");
      response.end(`<script src="https://unrelated.invalid/analytics.js"></script><script type="module" src="/assets/${filename}"></script>`);
    } else if (request.url === `/assets/${filename}`) {
      response.writeHead(options.status ?? 200, { "Content-Type": "text/javascript" });
      // If any third-party code is evaluated, the crawler test must fail.
      response.end(options.script ?? `throw new Error("must not execute");const offers=JSON.parse(\`${JSON.stringify(entries)}\`);`);
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}/`, requests);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function input(startUrl: string) {
  return {
    startUrl, generatedAt, logger,
    overrides: await readProviderOverrides("data/provider-overrides.json"),
    domainLookup: new Map([["example", ["shop.example"]]]),
  };
}

test("discovers the current bundle safely and carries useful birthday terms through the index", async () => {
  await withCatalogue([entry], async (startUrl, requests) => {
    const offers = await fetchGratisbursdag(await input(startUrl));
    const offer = offers[0]!;
    assert.deepEqual(requests, ["/", "/assets/index-new-hash.js"]);
    assert.equal(offers.length, 1);
    assert.equal(offer.reward, "0 kr totalsum");
    assert.equal(formatCompactRewardLabel(offer), "0 kr totalsum");
    assert.equal(calculateCashback(offer, 1000), "");
    assert.equal(offer.discountCode, undefined);
    for (const detail of ["Gratis kaffe", "Hent gaven i appen", "Kundeklubb", "Registrert fødselsdato", "5 dager", "Fysiske butikker", "ubekreftet", "ikke cashback"]) {
      assert.ok(offer.terms.includes(detail), detail);
    }
    assert.equal(offer.activationUrl, "https://gratisbursdag.no/");
    const index = buildCashbackIndex(offers, generatedAt, {}, buildProviderMeta());
    assert.equal(isCashbackIndex(index), true);
    assert.deepEqual(findOffersForHostname(index, "www.shop.example"), offers);
    assert.deepEqual(index.providers?.gratisbursdag, {
      name: "Gratis gaver", tip: buildProviderMeta().gratisbursdag!.tip, bg: "#7c3aed", fg: "#ffffff",
    });
  });
});

test("normalizes percentages, vouchers, points and free gifts without using purchase thresholds as rewards", async () => {
  const rows = [
    { ...entry, brandName: "Boots Apotek", offerType: "rabatt", offer: "30% rabatt på kjøp over 300 kr", value: "30% rabatt", description: "Gjelder ordinære varer, ikke legemidler.", confirmed: true },
    { ...entry, id: 2, brandName: "Mester Grønn", offer: "Kupong", value: "Kupong", description: "Få kupong på 50kr på bursdagen." },
    { ...entry, id: 3, brandName: "XXL", offerType: "rabatt", offer: "1000 poeng (30 kr)", value: "1000 poeng (30 kr)" },
    { ...entry, id: 4, brandName: "Blivakker", offerType: "rabatt", offer: "10% rabatt ved kjøp over 799 kr", value: "10% rabatt", description: "Personlig kode. Gyldig i fire dager. Gjelder ikke salgsvarer." },
    { ...entry, id: 5, brandName: "Sabrura", offerType: "rabatt", offer: "2 for 1 på buffet", value: "2 for 1" },
    { ...entry, id: 6, brandName: "Ringo", offerType: "rabatt", offer: "20% rabatt på en valgfri leke", value: "20% rabatt" },
  ];
  await withCatalogue(rows, async (startUrl) => {
    const offers = await fetchGratisbursdag(await input(startUrl));
    const get = (name: string) => offers.find((offer) => offer.merchantName === name)!;
    assert.equal(get("Boots Apotek").reward, "30 %");
    assert.equal(calculateCashback(get("Boots Apotek"), 299), "");
    assert.equal(calculateCashback(get("Boots Apotek"), 300), "");
    assert.equal(calculateCashbackMaxKr(get("Boots Apotek"), 300), 0);
    assert.equal(calculateCashback(get("Boots Apotek"), 1000), "300 kr");
    assert.equal(calculateCashbackMaxKr(get("Boots Apotek"), 1000), 300);
    assert.match(get("Boots Apotek").terms, /bekreftet/);
    assert.equal(get("Mester Grønn").reward, "50 kr");
    assert.equal(get("XXL").reward, "30 kr");
    assert.equal(get("Blivakker").reward, "10 %");
    assert.equal(calculateCashback(get("Blivakker"), 799), "");
    assert.equal(calculateCashback(get("Blivakker"), 1000), "100 kr");
    assert.match(get("Blivakker").terms, /Gjelder ikke salgsvarer/);
    assert.equal(get("Sabrura").reward, "2 for 1");
    assert.equal(calculateCashback(get("Sabrura"), 1000), "");
    assert.equal(get("Ringo").reward, "20 %");
    assert.equal(calculateCashback(get("Ringo"), 1000), "");
    assert.equal(calculateCashbackMaxKr(get("Ringo"), 1000), 0);
    assert.equal(get("Blivakker").discountCode, undefined);
    assert.ok(offers.every(isCashbackOffer));
  });
});

test("explicit domains beat ambiguous cross-provider matches and unknown shops stay visible on the site", async () => {
  await withCatalogue([{ ...entry, brandName: "Talkmore" }, { ...entry, id: 2, brandName: "Unknown shop" }], async (startUrl) => {
    const options = await input(startUrl);
    options.domainLookup.set("talkmore", ["cartrawler.com", "talkmore.no"]);
    const offers = await fetchGratisbursdag(options);
    const talkmore = offers.find((offer) => offer.merchantName === "Talkmore")!;
    assert.deepEqual(talkmore.domains, ["talkmore.no"]);
    assert.deepEqual(offers.find((offer) => offer.merchantName === "Unknown shop")!.domains, []);
    assert.equal(findOffersForHostname(buildCashbackIndex(offers, generatedAt), "cartrawler.com").length, 0);
  });
});

test("HTTP errors, changed schemas and missing catalogues fail for the bounded provider fallback", async () => {
  for (const options of [
    { status: 503 },
    { script: "const changed = [];" },
    { script: 'JSON.parse(`[{"brandName":"Broken"}]`)' },
  ]) {
    await withCatalogue([entry], async (startUrl) => {
      await assert.rejects(fetchGratisbursdag(await input(startUrl)), /Gratis Bursdag:/);
    }, options);
  }
});

test("Crawlee retries a dropped page or JavaScript connection instead of losing all birthday offers", async () => {
  for (const disconnectOnce of ["page", "script"] as const) {
    await withCatalogue([entry], async (startUrl, requests) => {
      const offers = await fetchGratisbursdag(await input(startUrl));
      assert.equal(offers.length, 1);
      assert.equal(offers[0]!.merchantName, "Example");
      const retriedUrl = disconnectOnce === "page" ? "/" : "/assets/index-new-hash.js";
      assert.equal(requests.filter((url) => url === retriedUrl).length, 2);
    }, { disconnectOnce });
  }
});

test("new calculation rules validate persisted indexes and leave existing reward calculations intact", () => {
  const offer = {
    provider: "example", merchantName: "Example", domains: ["shop.example"], reward: "20 %",
    terms: "", sourceUrl: "https://shop.example", activationUrl: "https://shop.example", updatedAt: generatedAt,
  };
  assert.equal(calculateCashback(offer, 1000), "200 kr");
  assert.equal(calculateCashbackMaxKr(offer, 1000), 200);
  assert.equal(calculateCashback({ ...offer, rewardCalculation: { minimumPurchaseNok: 1000 } }, 1000), "200 kr");
  assert.equal(isCashbackOffer({ ...offer, rewardCalculation: { minimumPurchaseNok: -1 } }), false);
  assert.equal(isCashbackOffer({ ...offer, rewardCalculation: { singleItemOnly: "true" } }), false);
});
