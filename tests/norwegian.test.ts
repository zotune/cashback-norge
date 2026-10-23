import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { test } from "node:test";
import { fetchNorwegianReward } from "../src/backend/providers/norwegian.js";
import { readProviderOverrides } from "../src/backend/provider-overrides.js";
import { collectProviderOffers } from "../src/backend/provider-offers.js";
import { buildCashbackIndex, findOffersForHostname, isCashbackIndex } from "../src/shared/cashback.js";
import { createCashbackIndexCache, type CachedIndex } from "../src/extension/cashback-index-cache.js";

const generatedAt = "2026-10-23T12:00:00.000Z";
const logger = { info() {}, warn() {}, error() {} };
const page = (content: string) => `<html><head><title>Norwegian Reward</title></head><body>
  <header><a href="https://cars.cartrawler.com/">10 % CashPoints</a></header>
  <main>${content}</main><footer>25 % CashPoints <a href="https://unrelated.no">Book</a></footer>
  <script>throw new Error("third-party code must not execute")</script></body></html>`;

async function withServer(
  handler: (request: IncomingMessage, response: ServerResponse, requests: string[]) => void,
  run: (origin: string, requests: string[]) => Promise<void>,
) {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url!);
    response.setHeader("Content-Type", "text/html");
    handler(request, response, requests);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}`, requests);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function input(origin: string) {
  return {
    apiUrl: `${origin}/api/gridlist`, gridListId: 310184, generatedAt, logger,
    overrides: await readProviderOverrides("data/provider-overrides.json"),
    partnerSources: [
      { slug: "avis", merchantName: "AVIS", url: `${origin}/avis`, termsUrl: `${origin}/avis-terms` },
      { slug: "talkmore", merchantName: "Talkmore", url: `${origin}/talkmore` },
      { slug: "parkvia", merchantName: "ParkVia", url: `${origin}/parkvia` },
    ],
  };
}

test("public partner sources restore verified offers when Norwegian blocks the catalogue", async () => {
  await withServer((request, response) => {
    if (request.url!.startsWith("/api/")) { response.writeHead(403).end("Blocked"); return; }
    if (request.url === "/avis-terms") {
      response.end(page("<p>Norwegian Reward-nummer og AWD W131400 må oppgis av &ldquo;leietakeren&rdquo;. Ellers 3 % CashPoints. Gjelder ikke avgifter.</p>"));
      return;
    }
    response.end(page(request.url === "/avis"
      ? '<h1>Norwegian Reward</h1><p>&bull; 10 % CashPoints. Opptil 15 % rabatt.</p><p>Oppgi Reward-nummer. Gratis ekstra sjåfør.</p><li><input type="checkbox"><label>Booking input</label></li>'
      : request.url === "/talkmore"
        ? "<h1>Norwegian Reward</h1><p>500 CashPoints i velkomstgave.</p><h2>Opptjening av 3 % CashPoints</h2><p>Kun privatkunder. Kan ikke kombineres med Trumf. Registrer Reward-nummer på Mine Sider.</p>"
        : "<h1>Tjen opptil 25 % CashPoints på parkeringen</h1><p>Norwegian Reward</p>"));
  }, async (origin, requests) => {
    const warnings: string[] = [];
    const options = await input(origin);
    const offers = await fetchNorwegianReward({ ...options, logger: { ...logger, warn: (message) => { warnings.push(message); } } });
    assert.equal(offers.length, 3);
    assert.deepEqual(offers.map((offer) => [offer.merchantName, offer.domains, offer.reward]), [
      ["AVIS", ["avis.no"], "10 %"], ["ParkVia", ["parkvia.com"], "Opptil 25 %"], ["Talkmore", ["talkmore.no"], "3 %"],
    ]);
    const talkmore = offers.find((offer) => offer.merchantName === "Talkmore")!;
    assert.equal(talkmore.updatedAt, generatedAt);
    assert.equal(talkmore.sourceUrl, `${origin}/talkmore`);
    assert.equal(talkmore.activationUrl, talkmore.sourceUrl);
    const avis = offers.find((offer) => offer.merchantName === "AVIS")!;
    assert.match(avis.terms, /AWD W131400/);
    assert.match(avis.terms, /Gjelder ikke avgifter/);
    assert.match(avis.terms, /“leietakeren”/);
    assert.doesNotMatch(avis.terms, /&bull;|&ldquo;|Booking input/);
    assert.equal(avis.reward, "10 %");
    assert.match(talkmore.terms, /500 CashPoints/);
    assert.match(talkmore.terms, /ikke kombineres med Trumf/);
    assert.doesNotMatch(talkmore.terms, /25 %|10 %|must not execute/);
    assert.equal(requests.filter((url) => url.startsWith("/api/")).length, 1);
    assert.ok(warnings.some((warning) => /HTTP 403.*api\/gridlist/.test(warning)));
    const index = buildCashbackIndex(offers, generatedAt);
    assert.equal(isCashbackIndex(index), true);
    assert.equal(findOffersForHostname(index, "www.talkmore.no")[0]?.reward, "3 %");
    assert.equal(findOffersForHostname(index, "cars.cartrawler.com").length, 0);
  });
});

test("catalogue requests stay bounded and ignore navigation rates, foreign links and tracking domains", async () => {
  await withServer((request, response) => {
    if (request.url!.startsWith("/api/")) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ items: [
        { heading: "Example", url: "/no/reward/vare-partnere/example/" },
        { heading: "Example", url: "/no/reward/vare-partnere/example/" },
        { heading: "No benefit", url: "/no/reward/vare-partnere/bagtag/" },
        { heading: "Tracking only", url: "/no/reward/vare-partnere/call-com/" },
        { heading: "Internal", url: "/no/reward/vare-partnere/flybilletter/" },
        { heading: "Foreign", url: "https://foreign.invalid/no/reward/vare-partnere/shop/" },
        { heading: "Invalid", url: "http://[" },
        { heading: "Unrelated", url: "/no/other" },
      ] }));
    } else if (request.url!.includes("/example/")) {
      response.end(page('<h1>Norwegian Reward: 7,5 % CashPoints</h1><a href="https://www.example.no/start">Aktiver</a>'));
    } else if (request.url!.includes("/bagtag/")) {
      response.end(page("<h1>Norwegian Reward: Bagtag</h1><p>Ingen prosentfordel.</p>"));
    } else {
      response.end(page('<h1>Norwegian Reward: 5 % CashPoints</h1><a href="https://tracker.invalid/out">Bestill</a>'));
    }
  }, async (origin, requests) => {
    const offers = await fetchNorwegianReward({ ...await input(origin), partnerSources: [] });
    assert.equal(offers.length, 1);
    assert.equal(offers[0]?.reward, "7,5 %");
    assert.deepEqual(offers[0]?.domains, ["example.no"]);
    assert.equal(requests.length, 4);
  });
});

test("Crawlee retries dropped catalogue and partner connections", async () => {
  for (const disconnect of ["/api/", "/talkmore"]) {
    let disconnected = false;
    await withServer((request, response) => {
      if (!disconnected && request.url!.startsWith(disconnect)) {
        disconnected = true;
        request.socket.destroy();
        return;
      }
      if (request.url!.startsWith("/api/")) {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ items: [{ heading: "Talkmore", url: "/no/reward/vare-partnere/talkmore/" }] }));
      } else {
        response.end(page("<h1>Norwegian Reward</h1><p>3 % CashPoints</p>"));
      }
    }, async (origin, requests) => {
      const options = await input(origin);
      const offers = await fetchNorwegianReward({ ...options, partnerSources: [options.partnerSources[1]!] });
      assert.equal(offers.length, 1);
      assert.equal(offers[0]?.sourceUrl, `${origin}/talkmore`);
      assert.equal(requests.filter((url) => url.startsWith(disconnect)).length, 2);
    });
  }
});

test("a changed or blocked partner source cannot publish fabricated rewards or bypass the 14-day fallback", async () => {
  await withServer((request, response) => {
    if (request.url!.startsWith("/api/")) response.writeHead(403).end("Blocked");
    else response.end(page("<p>500 CashPoints, 20 % rabatt. Norwegian Reward</p>"));
  }, async (origin) => {
    const options = await input(origin);
    const run = () => fetchNorwegianReward({ ...options, partnerSources: [options.partnerSources[1]!] });
    await assert.rejects(run, /current CashPoints rate missing.*talkmore/);
    const previous = {
      provider: "norwegian", merchantName: "Talkmore", domains: ["talkmore.no"], reward: "3 %",
      sourceUrl: "https://talkmore.no", activationUrl: "https://talkmore.no", terms: "Norwegian Reward",
      updatedAt: new Date(Date.now() - 13 * 86400000).toISOString(),
    };
    const collect = (updatedAt: string) => collectProviderOffers({
      label: "Norwegian Reward", provider: "norwegian", logger, run,
      fallbackWhenEmpty: true, reusePreviousOnFailure: true, maxPreviousOfferAgeDays: 14,
      previousOffersByProvider: new Map([["norwegian", [{ ...previous, updatedAt }]]]),
    });
    assert.equal((await collect(previous.updatedAt))[0]?.updatedAt, previous.updatedAt);
    assert.deepEqual(await collect(new Date(Date.now() - 15 * 86400000).toISOString()), []);
  });
});

test("existing extensions download restored Norwegian offers and keep them across an offline restart", async () => {
  const old = buildCashbackIndex([], "2026-10-22T06:00:00.000Z");
  const restored = buildCashbackIndex([{
    provider: "norwegian", merchantName: "Talkmore", domains: ["talkmore.no"], reward: "3 %",
    sourceUrl: "https://talkmore.no/privat/vilkar/partnere/norwegian",
    activationUrl: "https://talkmore.no/privat/vilkar/partnere/norwegian", terms: "Norwegian Reward", updatedAt: generatedAt,
  }], generatedAt);
  let saved: CachedIndex | undefined = { downloadedAt: generatedAt, index: old };
  const options = {
    now: () => Date.parse(generatedAt), readBundled: async () => old,
    readCached: async () => saved, writeCached: async (value: CachedIndex) => { saved = value; },
    fetchRemote: async () => restored,
  };
  const cache = createCashbackIndexCache(options);
  assert.equal(findOffersForHostname(await cache.get(), "talkmore.no")[0]?.provider, "norwegian");
  const restarted = createCashbackIndexCache({ ...options, fetchRemote: async () => { throw new Error("offline"); } });
  assert.equal(findOffersForHostname(await restarted.get(), "talkmore.no")[0]?.reward, "3 %");
  assert.equal(saved?.index, restored);
});
