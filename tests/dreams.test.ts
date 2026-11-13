import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { fetchDreams } from "../src/backend/providers/dreams.js";
import { isAffiliateTrackingUrl } from "../src/backend/providers/spareborsen.js";

const logger = { info() {}, warn() {}, error() {} };
const generatedAt = "2026-11-12T00:00:00.000Z";

const shop = (extra: Record<string, unknown>) => ({
  id: "x", name: "Butikk", link: "https://butikk.example/", categories: ["fashion"], enabled: true, featured: false,
  cashbackType: "%", cashbackValue: 5.6, ...extra,
});

// Shapes from the live shops API (2026-11-12).
const shops = [
  shop({ id: "td342636", name: "Barcelo Hotels & Resorts", categories: ["travel_and_transport"], cashbackValue: 4.2,
    link: "https://ad.doubleclick.net/ddm/trackclk/N79604.155530AFFILIATE.TRADEDOUB/B29445352.360681983;dc_trk_aid=551834080;u=0000_[td_affiliate_id]" }),
  shop({ id: "td384381", name: "Nespresso Nordic", cashbackValue: 8.4,
    link: "https://nespresso.prf.hn/click/camref:1011l5gai8/pubref:384381-464271-[td_guid]/ar:[td_affiliate_id]" }),
  shop({ id: "im24349NO", name: "Under Armour", categories: [], cashbackValue: 3.5, link: "https://www.underarmour.eu/en-se/" }),
  shop({ id: "im24350NO", name: "Under Armour", categories: [], cashbackValue: 2.8, link: "https://www.underarmour.no/en-no/" }),
  shop({ id: "im11210NO", name: "IDEAL OF SWEDEN", categories: [], cashbackValue: 7, link: "https://idealofsweden.com" }),
  shop({ id: "im11212NO", name: "IDEAL OF SWEDEN", categories: [], cashbackValue: 7, link: "https://idealofsweden.no" }),
  shop({ id: "at1", name: "Estore", cashbackValue: 3.5, link: "https://estore.no" }),
  shop({ id: "td2", name: "eStore", cashbackValue: 5.6, link: "https://estore.no/" }),
  shop({ id: "a", name: "MICAS AFFILIATE PROGRAM", link: "https://shopmicas.com" }),
  shop({ id: "b", name: "NN Hotels(GLOBAL)", link: "https://www.nnhotels.com/en" }),
  shop({ id: "c", name: "Philips Hue NO - AFF", link: "https://www.philips-hue.com/no-no" }),
  shop({ id: "d", name: "Wolt NOR", cashbackType: "fixed", cashbackValue: 72.4, link: "https://wolt.com" }),
  shop({ id: "e", name: "Omio Travel Partner Program", cashbackValue: 1.4, link: "https://www.omio.com" }),
  shop({ id: "im18904NO", name: "Headway: Fun & Easy Growth", cashbackType: "fixed", cashbackValue: 0, link: "https://makeheadway.com" }),
  shop({ id: "off", name: "Julegenser", enabled: false, link: "https://jule-genser.no/" }),
];

async function withServer(handler: Parameters<typeof createServer>[1], run: (url: string) => Promise<void>) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}/v1/cashback/shops?market_id=NO&token=secret-token`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("Dreams drops tracking-link hosts, merges storefronts and cleans programme names", async () => {
  await withServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(shops));
  }, async (apiUrl) => {
    const offers = await fetchDreams({ generatedAt, logger, apiUrl, overrides: { td384381: ["nespresso.com"] } });
    const byName = new Map(offers.map((offer) => [offer.merchantName, offer]));

    // ad.doubleclick.net is not Barcelo's shop; without a verified domain the offer stays site-only.
    assert.deepEqual(byName.get("Barcelo Hotels & Resorts")?.domains, []);
    assert.equal(byName.get("Barcelo Hotels & Resorts")?.reward, "4,2 %");
    assert.deepEqual(byName.get("Nespresso Nordic")?.domains, ["nespresso.com"]);

    // Two storefronts with their own rates: the range and which rate is where.
    const underArmour = byName.get("Under Armour");
    assert.equal(underArmour?.reward, "2,8-3,5 %");
    assert.deepEqual(underArmour?.domains, ["underarmour.eu", "underarmour.no"]);
    assert.match(underArmour?.terms ?? "", /^3,5 % – underarmour\.eu\n2,8 % – underarmour\.no\nCashback via Dreams-appen$/);
    assert.deepEqual(byName.get("IDEAL OF SWEDEN")?.domains, ["idealofsweden.com", "idealofsweden.no"]);
    assert.equal(byName.get("IDEAL OF SWEDEN")?.reward, "7 %");
    // Two programmes for the same shop: the higher rate is available.
    assert.equal(byName.get("Estore")?.reward, "5,6 %");

    for (const name of ["MICAS", "NN Hotels", "Philips Hue", "Wolt", "Omio"]) assert.ok(byName.has(name), name);
    assert.equal(byName.get("Wolt")?.reward, "72,4 kr");
    assert.equal(byName.get("Barcelo Hotels & Resorts")?.sourceUrl, "https://www.getdreams.com/no/cashback/butikker");
    assert.equal(byName.has("Headway: Fun & Easy Growth"), false);
    assert.equal(byName.has("Julegenser"), false);
    assert.equal(offers.length, 10);
  });
});

test("Dreams reports source, request and cause without the API token", async () => {
  let requests = 0;
  await withServer((_request, response) => {
    requests++;
    response.writeHead(503).end("busy");
  }, async (apiUrl) => {
    await assert.rejects(fetchDreams({ generatedAt, logger, apiUrl }), (error: Error) => {
      assert.match(error.message, /^Dreams API http:\/\/127\.0\.0\.1:\d+\/v1\/cashback\/shops\?market_id=NO&token=\*\*\* failed: attempt 1\/3: HTTP 503/);
      assert.doesNotMatch(error.message, /secret-token/);
      return true;
    });
    assert.equal(requests, 3);
  });
});

test("affiliate click URLs are not merchant domains", () => {
  const tracking = [
    "https://ad.doubleclick.net/ddm/trackclk/N1;dc_trk_aid=1", "https://iherb.prf.hn/click/camref:1", "https://go.adt291.com/t/t?a=1",
    "https://adt284.net/t/t?a=1", "https://budget.pxf.io/c/1/2/3", "https://vistaprintemea.sjv.io/c/1", "https://go.nordvpn.net/aff_c?offer_id=417&aff_id=1",
    "https://clk.tradedoubler.com/click?p=1", "https://r.bttn.io/?btn_url=x",
  ];
  for (const url of tracking) assert.equal(isAffiliateTrackingUrl(new URL(url)), true, url);
  for (const url of ["https://www.barcelo.com/", "https://nordvpn.com/", "https://www.adtech.no/", "https://go.example.com/aff_c"]) {
    assert.equal(isAffiliateTrackingUrl(new URL(url)), false, url);
  }
});
