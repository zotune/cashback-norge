import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { test } from "node:test";
import { fetchAddrevenue } from "../src/backend/providers/addrevenue.js";
import { fetchAwin } from "../src/backend/providers/awin.js";
import { fetchPartnerAds } from "../src/backend/providers/partnerads.js";
import { isCashbackOffer } from "../src/shared/cashback.js";

const generatedAt = "2026-11-12T12:00:00.000Z";
const logger = { info() {}, warn() {}, error() {} };

async function withServer(
  handler: (url: URL, response: ServerResponse, request: IncomingMessage) => void,
  run: (origin: string) => Promise<void>,
) {
  const server = createServer((request, response) => handler(new URL(request.url!, "http://localhost"), response, request));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function json(response: ServerResponse, value: unknown) {
  response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(value));
}

const program = (markets: string[], extra: Record<string, unknown> = {}) => ({
  status: "active", commissionType: "variable", commissionUnit: "%", commissionValue: "10.00", percent: "10.00", markets, ...extra,
});

// Shapes from Addrevenue API v2 (November 2026): ids are strings.
const relations = [
  { advertiserId: "1", advertiserName: "Liroma", status: "active", trackingLink: "https://addrevenue.io/t?c=1&a=1", programs: [program(["NO", "SE"])] },
  { advertiserId: "2", advertiserName: "Vitaliv", status: "active", trackingLink: "https://addrevenue.io/t?c=1&a=2",
    programs: [program([], { percent: "", commissionType: "fixed", commissionUnit: "NOK", commissionValue: "500.00", amount: "500.00", currency: "NOK" })] },
  { advertiserId: "3", advertiserName: "Paused in Norway", status: "active", trackingLink: "https://addrevenue.io/t?c=1&a=3", programs: [program(["NO"])] },
  { advertiserId: "4", advertiserName: "Swedish rate only", status: "active", trackingLink: "https://addrevenue.io/t?c=1&a=4",
    programs: [program(["SE"], { commissionValue: "30.00", percent: "30.00" }), program(["NO"], { status: "paused" })] },
  { advertiserId: "5", advertiserName: "Ended", status: "ended", trackingLink: "https://addrevenue.io/t?c=1&a=5", programs: [program(["NO"])] },
];
const advertisers = [
  { id: "1", displayName: "Liroma", url: "https://liromaredlight.se/", markets: {
    NO: { market: "NO", displayName: "Liroma", url: "https://liromaredlight.com/", redirectUrl: "https://liromaredlight.com/", status: "active", endedDate: null },
    SE: { market: "SE", url: "https://liromaredlight.se/", status: "active", endedDate: null },
  } },
  { id: "2", displayName: "Vitaliv", url: "https://vitaliv.com", markets: {
    NO: { market: "NO", displayName: "Vitaliv", url: "https://fclick.vitaliv.com/aff_c?offer_id=7&aff_id=1", redirectUrl: "https://vitaliv.com/no", status: "active", endedDate: null },
  } },
  { id: "3", displayName: "Paused in Norway", url: "https://paused.se", markets: {
    NO: { market: "NO", url: "https://paused.no", status: "paused", endedDate: null },
    SE: { market: "SE", url: "https://paused.se", status: "active", endedDate: null },
  } },
  { id: "4", displayName: "Swedish rate only", url: "https://onlyse.no", markets: {
    NO: { market: "NO", url: "https://onlyse.no", status: "active", endedDate: null },
  } },
];

test("Addrevenue matches string advertiser ids and keeps only the Norwegian market, programme and shop", async () => {
  await withServer((url, response) => {
    if (url.pathname === "/api/v2/relations") json(response, { results: relations, meta: { hasNextPage: false } });
    else if (url.pathname === "/api/v2/advertisers" && url.searchParams.get("channelId") === "77") json(response, { results: advertisers });
    else response.writeHead(404).end();
  }, async (origin) => {
    const offers = await fetchAddrevenue({ apiUrl: `${origin}/api/v2`, channelId: "77", token: "secret-token", generatedAt, logger });
    assert.ok(offers.every(isCashbackOffer));
    assert.deepEqual(offers.map((offer) => [offer.merchantName, offer.domains, offer.reward]), [
      // The Swedish advertiser URL is another market's shop.
      ["Liroma", ["liromaredlight.com"], "10 %"],
      // A tracking redirect is not the shop's domain.
      ["Vitaliv", ["vitaliv.com"], "500 kr"],
    ]);
  });
});

test("Partner-Ads drops programme taglines and never uses a click host as the shop domain", async () => {
  const xml = `<?xml version="1.0"?><programs>
    <program><programid>1</programid><programnavn>Nordhost - Hosting på norsk siden 1999</programnavn><programurl>https://nordhost.no/</programurl>
      <provisjon>10</provisjon><affiliatelink>https://www.partner-ads.com/no/klikbanner.php?partnerid=1&amp;bannerid=1</affiliatelink><status>Godkendt</status></program>
    <program><programid>2</programid><programnavn>Utefugl.no - Fuglemat</programnavn><programurl>https://utefugl.no/</programurl>
      <provisjon>8</provisjon><affiliatelink>https://www.partner-ads.com/no/klikbanner.php?partnerid=1&amp;bannerid=2</affiliatelink><status>Godkendt</status></program>
    <program><programid>3</programid><programnavn>Tropehagen Lade Arena</programnavn><programurl>https://lade.tropehagen.no/</programurl>
      <provisjon>8</provisjon><affiliatelink>https://www.partner-ads.com/no/klikbanner.php?partnerid=1&amp;bannerid=3</affiliatelink><status>Godkendt</status></program>
    <program><programid>4</programid><programnavn>Tracked</programnavn><programurl>https://shop.prf.hn/click/camref:1</programurl>
      <provisjon>8</provisjon><affiliatelink>https://www.partner-ads.com/no/klikbanner.php?partnerid=1&amp;bannerid=4</affiliatelink><status>Godkendt</status></program>
  </programs>`;
  await withServer((_url, response) => {
    response.writeHead(200, { "Content-Type": "application/xml" }).end(xml);
  }, async (origin) => {
    const offers = await fetchPartnerAds({ apiUrl: `${origin}/xml`, apiKey: "secret-key", generatedAt, logger });
    assert.deepEqual(offers.map((offer) => [offer.merchantName, offer.domains]), [
      ["Nordhost", ["nordhost.no"]],
      ["Tropehagen Lade Arena", ["lade.tropehagen.no"]],
      ["Utefugl.no", ["utefugl.no"]],
    ]);
  });
});

test("Awin ignores tracking, app-link and internal Shopify hosts in validDomains", async () => {
  const programme = {
    id: 42, name: "Pulsetto", status: "Active", linkStatus: "Online", displayUrl: "https://pulsetto.tech/",
    clickThroughUrl: "https://www.awin1.com/awclick.php?mid=42&id=1",
    validDomains: [
      { domain: "pulsetto.tech" }, { domain: "*.pulsetto.tech" }, { domain: "pulsetto-eu.myshopify.com" },
      { domain: "multitudebankplc.pxf.io" }, { domain: "voghion-affiliate.onelink.me" },
    ],
  };
  await withServer((url, response) => {
    if (url.pathname.endsWith("/programmes")) json(response, [programme]);
    else if (url.pathname.endsWith("/programmedetails")) json(response, { programmeInfo: programme, commissionRange: [{ min: 20, max: 20, type: "percentage" }] });
    else json(response, { commissionGroups: [] });
  }, async (origin) => {
    const offers = await fetchAwin({ apiUrl: origin, accessToken: "secret-token", publisherId: "1", generatedAt, logger });
    assert.deepEqual(offers.map((offer) => [offer.merchantName, offer.domains, offer.reward]), [["Pulsetto", ["pulsetto.tech"], "20 %"]]);
  });
});
