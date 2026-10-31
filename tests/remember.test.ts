import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { log, LogLevel } from "crawlee";
import { crawlRemember } from "../src/backend/providers/remember.js";
import type { ProviderOverrides } from "../src/backend/provider-overrides.js";

const generatedAt = "2026-10-31T12:00:00.000Z";
const logger = { info() {}, warn() {}, error() {} };

// Trimmed from the live re:member store page (2026-10-31). The page header
// renders the structured commission ("6% i reward-rabatt på alt du kjøper");
// the editorial terms still describe an older 4 % rate.
const babyshop = {
  name: "Babyshop.no", slug: "babyshop", shopUrl: "/reward/rabatt/babyshop",
  affiliateUrl: "https://www.awin1.com/cread.php?awinmid=33725&awinaffid=324565",
  maxPercentageValue: 6, maxFixedValue: 0,
  commission: [{ description: "i reward-rabatt på alt du kjøper", type: "PERCENTAGE", value: 6 }],
  terms: "<h2>På Babyshop.no kan du:</h2>\r\n<ul>\r\n<li>Finne produkter fra over 180 merker</li>\r\n<li>Få 4 % reward-rabatt</li>\r\n" +
    "<li>Bruke eventuelle Babyshop.no rabattkode for å få kampanjepriser i tillegg til reward-rabatten</li>\r\n</ul>\r\n" +
    "<h2>Benytt deg av reward-rabatten</h2>\r\nVed fordelsprogrammet re:member reward får du 4 % reward-rabatt på Babyshop.no. " +
    "For å benytte deg av rabatten må du logge deg inn og klikke på «Til butikk». Husk å betale med re:member-kortet ditt.\r\n\r\n" +
    "Vi gjør oppmerksom på at du ikke får reward-rabatt på moms, frakt eller øvrige håndteringskostnader.",
};
const dustin = {
  name: "Dustin Home", slug: "dustin-home", shopUrl: "/reward/rabatt/dustin-home",
  affiliateUrl: "", maxPercentageValue: 2, maxFixedValue: 0,
  commission: [{ description: "i reward-rabatt på alt du kjøper", type: "PERCENTAGE", value: 2 }],
  terms: "<h2>Dustin Home rabatt</h2>\r\nPå Dustin Home får du opptil 3 % reward-rabatt via fordelsprogrammet re:member reward. " +
    "Du kan kombindere reward-rabatten med eventuelle rabattkoder eller tilbud som nettbutikken har. \r\n\r\n" +
    "Du får fri frakt ved kjøp over 3000 kr.",
};
const sobling = {
  name: "Sobling", slug: "sobling", shopUrl: "/reward/rabatt/sobling",
  affiliateUrl: "", maxPercentageValue: 7, maxFixedValue: 0,
  commission: [{ description: "i reward-rabatt på alt du kjøper", type: "PERCENTAGE", value: 7 }],
  terms: "Husk! Merverdiavgift på 25% (produkter med verdi på 200 kroner eller mer) kan bli lagt til prisen.",
};
const directDeal = {
  name: "Gant Direct Deals", slug: "gant-direct-deals", shopUrl: "/reward/rabatt/gant-direct-deals",
  affiliateUrl: "https://deals.awardit.com/no?code=1", maxPercentageValue: 0, maxFixedValue: 0,
  commission: [{ description: "i reward-rabatt. Direkterabatt trekkes i stedet fra i kassen.", type: "NOK", value: 0 }],
  terms: "Prisavslag skjer direkte ved betaling med re:member-kortet i kassen og gir ikke belønningsrabatt på etterskudd.",
};
// Fixed commissions carry the currency as their type; the page renders
// "134 NOK i reward-rabatt på Dentway Starter Kit" and "251 SEK i reward-rabatt …".
const dentway = {
  name: "Dentway", slug: "dentway", shopUrl: "/reward/rabatt/dentway",
  affiliateUrl: "", maxPercentageValue: 0, maxFixedValue: 134,
  commission: [
    { description: "i reward-rabatt på Dentway Starter Kit", type: "NOK", value: 134 },
    { description: "i reward-rabatt på Dentway White Strips", type: "NOK", value: 117 },
    { description: "i reward-rabatt på tannkremer", type: "NOK", value: 33 },
  ],
  terms: "Vi gjør oppmerksom på at du ikke får reward-rabatt for mva, frakt eller øvrige håndteringskostnader.",
};
const hellofresh = {
  name: "HelloFresh", slug: "hellofresh", shopUrl: "/reward/rabatt/hellofresh",
  affiliateUrl: "", maxPercentageValue: 0, maxFixedValue: 251,
  commission: [
    { description: "i reward-rabatt ved første bestilling av måltidskasse som ny kunde", type: "SEK", value: 251 },
    { description: "ved reaktivering reaktivering av abonnement", type: "SEK", value: 75 },
  ],
  terms: "",
};
const stores = [babyshop, dustin, sobling, directDeal, dentway, hellofresh];

function storePage(store: unknown): string {
  return `<html><body><h1>Store</h1><script id="__NEXT_DATA__" type="application/json">${
    JSON.stringify({ props: { pageProps: { store } } })
  }</script></body></html>`;
}

async function withRemember(run: (startUrl: string) => Promise<void>) {
  const server = createServer((request, response) => {
    const path = request.url ?? "/";
    if (path === "/reward/rabatt") {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(stores.map((store) => `<a href="${store.shopUrl}">${store.name}</a>`).join(""));
      return;
    }
    const store = stores.find((candidate) => candidate.shopUrl === path);
    if (store === undefined) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(storePage(store));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const previousLevel = log.getLevel();
  log.setLevel(LogLevel.OFF);
  try {
    await run(`http://127.0.0.1:${address.port}/reward/rabatt`);
  } finally {
    log.setLevel(previousLevel);
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function overrides(): ProviderOverrides {
  const empty = {};
  return {
    trumf: empty, klarna: empty, sas: empty, tfbank: empty, obos: empty, bob: empty, usbl: empty,
    bate: empty, tobb: empty, logbuy: empty, naf: empty, tekna: empty, nito: empty,
    remember: {
      babyshop: ["babyshop.no"], "dustin-home": ["dustin.no"], sobling: ["sobling.com"],
      "gant-direct-deals": ["gant.no"], dentway: ["dentway.no"], hellofresh: ["hellofresh.no"],
    },
  };
}

test("re:member terms lead with the structured commission and drop stale rate claims", async () => {
  await withRemember(async (startUrl) => {
    const offers = await crawlRemember({
      startUrl, maxRequestsPerCrawl: 20, overrides: overrides(), generatedAt, logger,
    });
    const byName = new Map(offers.map((offer) => [offer.merchantName, offer]));

    const babyshopOffer = byName.get("Babyshop.no");
    assert.ok(babyshopOffer);
    // The structured commission is what re:member renders as the current rate.
    assert.equal(babyshopOffer.reward, "6 %");
    assert.match(babyshopOffer.terms, /^6 % – i reward-rabatt på alt du kjøper\n/);
    assert.doesNotMatch(babyshopOffer.terms, /4 %/);
    // Useful instructions and exclusions from the same prose are kept.
    assert.match(babyshopOffer.terms, /For å benytte deg av rabatten må du logge deg inn/);
    assert.match(babyshopOffer.terms, /Finne produkter fra over 180 merker/);
    assert.match(babyshopOffer.terms, /ikke får reward-rabatt på moms, frakt/);

    const dustinOffer = byName.get("Dustin Home");
    assert.ok(dustinOffer);
    assert.equal(dustinOffer.reward, "2 %");
    assert.match(dustinOffer.terms, /^2 % – i reward-rabatt på alt du kjøper\n/);
    assert.doesNotMatch(dustinOffer.terms, /opptil 3 %/);
    assert.match(dustinOffer.terms, /Du kan kombindere reward-rabatten med eventuelle rabattkoder/);
    assert.match(dustinOffer.terms, /fri frakt ved kjøp over 3000 kr/);

    // A percentage that is not a reward rate (VAT) is not treated as stale.
    const soblingOffer = byName.get("Sobling");
    assert.ok(soblingOffer);
    assert.equal(soblingOffer.reward, "7 %");
    assert.match(soblingOffer.terms, /Merverdiavgift på 25%/);

    // Direct Deals publish no reward amount; keep it unknown instead of inventing one.
    const directDealOffer = byName.get("Gant Direct Deals");
    assert.ok(directDealOffer);
    assert.equal(directDealOffer.reward, "");
    assert.match(directDealOffer.terms, /Prisavslag skjer direkte/);
  });
});

test("re:member fixed commissions keep every amount and their stated currency", async () => {
  await withRemember(async (startUrl) => {
    const offers = await crawlRemember({
      startUrl, maxRequestsPerCrawl: 20, overrides: overrides(), generatedAt, logger,
    });
    const byName = new Map(offers.map((offer) => [offer.merchantName, offer]));

    const dentwayOffer = byName.get("Dentway");
    assert.equal(dentwayOffer?.reward, "33-134 kr");
    assert.match(dentwayOffer?.terms ?? "", /^134 kr – i reward-rabatt på Dentway Starter Kit\n117 kr – .*\n33 kr – i reward-rabatt på tannkremer\n/);

    // Not "251 kr": the source states SEK, and the currency must not be guessed.
    const hellofreshOffer = byName.get("HelloFresh");
    assert.equal(hellofreshOffer?.reward, "75-251 SEK");
    assert.match(hellofreshOffer?.terms ?? "", /^251 SEK – i reward-rabatt ved første bestilling/);
  });
});
