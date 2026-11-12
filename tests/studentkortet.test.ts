import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { buildDomainLookup } from "../src/backend/domain-lookup.js";
import type { ProviderOverrides } from "../src/backend/provider-overrides.js";
import { crawlStudentkortet, merchantDomainFromTarget } from "../src/backend/providers/studentkortet.js";
import type { CashbackOffer } from "../src/shared/cashback.js";

const generatedAt = "2026-11-12T12:00:00.000Z";

function overrides(): ProviderOverrides {
  const empty = {};
  return {
    trumf: empty, klarna: empty, remember: empty, sas: empty, tfbank: empty, obos: empty, bob: empty,
    usbl: empty, bate: empty, tobb: empty, logbuy: empty, naf: empty, tekna: empty, nito: empty,
  };
}

// Mirrors the live listing markup (studentkortet.no/rabatter, 2026-11-12).
function card(path: string, name: string, title: string): string {
  return `<li class="col-1-5 mobile-col-1-2"><div class="offer panel"><div class="offer-img">
    <a href="/rabatter/${path}/"><img src="/media/1/${name}.png" alt="${name} logo"></a></div>
    <a href="/rabatter/${path}/" style="text-decoration: none;"><div class="offer-title" style="background-color: #00A55A;">${title}</div></a></div></li>`;
}

function detail(slug: string, buttons: string[], terms: string[]): string {
  return `<html><body>${buttons.map((b) => `<button class="wide codebutton greyed-out open-login box">Vis rabattkode ${b}</button>`).join("")}
    ${terms.map((t) => `<div class="ac-content">${t}</div>`).join("")}
    <a href="/videresending/${slug}/${slug}/">Til butikken</a></body></html>`;
}

test("tracking hosts are never merchant domains; the destination comes from the link or the merchant name", () => {
  // Live redirect targets (studentkortet.no/videresending, 2026-11-12).
  assert.equal(merchantDomainFromTarget("https://www.awin1.com/cread.php?awinmid=24784&awinaffid=324421&ued=https%3A%2F%2Fwww.acer.com%2Fno-no%2F&clickref2=__Nettside"), "acer.com");
  assert.equal(merchantDomainFromTarget("https://arket.prf.hn/click/camref:1101l4aXpf/destination:https%3A%2F%2Fwww.arket.com%2Fen_nok%2Findex.html"), "arket.com");
  assert.equal(merchantDomainFromTarget("https://www.tkqlhce.com/click-4366362-17316018?url=https%3A%2F%2Fsteamerystockholm.com%2Fen-no"), "steamerystockholm.com");
  assert.equal(merchantDomainFromTarget("https://go.adt231.net/t/t?a=2071024546&as=1039643907&t=2&tk=1&url=voltfashion.com/no/oversikt/&epi=__Nettside"), "voltfashion.com");
  assert.equal(merchantDomainFromTarget("https://tc.tradetracker.net/?c=19891&m=12&a=110381&r=&u=%2F"), "");
  assert.equal(merchantDomainFromTarget("https://c.trackmytarget.com/thtsc2"), "");
  assert.equal(merchantDomainFromTarget("https://edblad.sjv.io/n4oBro"), "");
  assert.equal(merchantDomainFromTarget("https://imp.i222351.net/aMjYM"), "");
  assert.equal(merchantDomainFromTarget("https://go.adt291.com/t/t?a=2048947483&as=1039643907&t=2&tk=1&epi=__Nettside"), "");
  // A merchant's own tracking subdomain stands for its shop.
  assert.equal(merchantDomainFromTarget("https://to.haglofs.com/t/t?a=1"), "haglofs.com");
  assert.equal(merchantDomainFromTarget("https://no-pin.loccitane.com/x"), "loccitane.com");
  assert.equal(merchantDomainFromTarget("https://www.facebook.com/studentkortet"), "");
});

test("listing cards, redirects, free trials, maxima and minimum orders from the live markup", async () => {
  const pages: Record<string, string> = {
    "/rabatter": [
      // A promoted navbar logo (alt "Logo", no title) before the first card
      // used to swallow Nelly's card.
      `<div class="navbar-promoted-item"><a href="/rabatter/mote/klaer/nelly/"><img src="/media/n.png" alt="Logo"></a></div>`,
      card("mote/klaer/nelly", "Nelly", "Spar 10%"),
      card("mote/annet/beckmann", "Beckmann", "Spar 20%"),
      card("mote/annet/strikkia", "Strikkia", "Spar 10%"),
      card("hybelen/renhold/dyson", "Dyson", "Spar 15%"),
      card("boeker/annet/bookbeat", "BookBeat", "90 dager gratis"),
      card("tjenester/&#248;konomi/revolut", "Revolut", "F&#229; 300 kr"),
      card("lokale/oslo/kafe", "Kafe", "Spar 10%"),
    ].join(""),
    "/rabatter/mote/klaer/nelly/": detail("nelly", ["10% Rabatt"], ["- Gjelder ved kjøp over 500 kr<br>- Gratis frakt ved kjøp over 449 kr"]),
    "/videresending/nelly/nelly/": `redirectAfterSeconds("https://www.awin1.com/cread.php?awinmid=19563&amp;ued=https%3A%2F%2Fnelly.com%2Fno%2F", 2)`,
    "/rabatter/mote/annet/beckmann/": detail("beckmann", ["20% Rabatt"], ["- Gjelder kun produkter i ung/student-kategorien."]),
    "/videresending/beckmann/beckmann/": `redirectAfterSeconds("https://c.trackmytarget.com/thtsc2", 2)`,
    "/rabatter/mote/annet/strikkia/": detail("strikkia", ["10% Rabatt"], ["- Minimum ordre 400kr."]),
    "/videresending/strikkia/strikkia/": `redirectAfterSeconds("https://c.trackmytarget.com/?a=abc&i=3d760a", 2)`,
    "/rabatter/hybelen/renhold/dyson/": detail("dyson", ["Opptil 15% Rabatt", "5% ekstra p&#229; Black Friday"], ["- Utvalgte produkter", "- Gjelder Black Friday"]),
    "/videresending/dyson/dyson/": `redirectAfterSeconds("https://www.awin1.com/cread.php?awinmid=25181&amp;ued=https%3A%2F%2Fwww.dyson.no%2Faffiliates", 2)`,
    "/rabatter/boeker/annet/bookbeat/": detail("bookbeat", [], ["- Gjelder nye kunder. Deretter ordinær pris."]),
    "/videresending/bookbeat/bookbeat/": `redirectAfterSeconds("https://www.bookbeat.no/kampanje", 2)`,
    "/rabatter/tjenester/%C3%B8konomi/revolut/": detail("revolut", [], ["- Få 300 kr når du oppretter konto."]),
    "/videresending/revolut/revolut/": `redirectAfterSeconds("https://www.revolut.com/no-NO/", 2)`,
  };
  const requested: string[] = [];
  const server = createServer((request, response) => {
    requested.push(request.url ?? "");
    const body = pages[request.url ?? ""];
    response.writeHead(body === undefined ? 404 : 200, { "Content-Type": "text/html" });
    response.end(body ?? "not found");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const warnings: string[] = [];
  try {
    const address = server.address();
    const origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    // Strikkia is known to another provider by name; Beckmann is not.
    const lookup = buildDomainLookup([{ provider: "klarna", merchantName: "Strikkia", domains: ["strikkia.no"], reward: "5 %",
      sourceUrl: "", activationUrl: "", terms: "", updatedAt: generatedAt } satisfies CashbackOffer]);
    const offers = await crawlStudentkortet({ domainLookup: lookup, generatedAt, overrides: overrides(), startUrl: `${origin}/rabatter`,
      logger: { info() {}, error() {}, warn: (message: string) => warnings.push(message) } });
    const byName = new Map(offers.map((offer) => [offer.merchantName, offer]));

    assert.deepEqual([...byName.keys()].sort(), ["BookBeat", "Dyson", "Nelly", "Revolut", "Strikkia"]);
    assert.deepEqual(byName.get("Nelly")?.domains, ["nelly.com"]);
    // "over 500 kr" is exclusive; the free-shipping threshold is not the rule.
    assert.deepEqual(byName.get("Nelly")?.rewardCalculation, { minimumPurchaseNok: 500, minimumPurchaseExclusive: true });
    assert.deepEqual(byName.get("Strikkia")?.domains, ["strikkia.no"]);
    assert.deepEqual(byName.get("Strikkia")?.rewardCalculation, { minimumPurchaseNok: 400 });
    assert.ok(warnings.some((warning) => /no domain for "Beckmann"/.test(warning)));
    assert.equal(byName.get("Dyson")?.reward, "opptil 5-15 %");
    assert.equal(byName.get("BookBeat")?.reward, "0 kr totalsum");
    assert.deepEqual(byName.get("BookBeat")?.promotion, { label: "90 dager gratis", priceNok: 0 });
    assert.deepEqual(byName.get("BookBeat")?.domains, ["bookbeat.no"]);
    assert.equal(byName.get("Revolut")?.reward, "300 kr");
    assert.equal(byName.get("Revolut")?.sourceUrl, `${origin}/rabatter/tjenester/%C3%B8konomi/revolut/`);
    assert.ok(!requested.some((url) => url.startsWith("/rabatter/lokale")));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("a failing redirect page is reported with its URL and does not stop other offers", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/rabatter") {
      response.writeHead(200);
      response.end(card("mote/klaer/nelly", "Nelly", "Spar 10%"));
    } else if (request.url === "/rabatter/mote/klaer/nelly/") {
      response.writeHead(200);
      response.end(detail("nelly", [], ["- Gjelder alt"]));
    } else {
      response.writeHead(503, "Service Unavailable");
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const warnings: string[] = [];
  try {
    const address = server.address();
    const origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    const lookup = buildDomainLookup([{ provider: "klarna", merchantName: "Nelly", domains: ["nelly.com"], reward: "5 %",
      sourceUrl: "", activationUrl: "", terms: "", updatedAt: generatedAt } satisfies CashbackOffer]);
    const offers = await crawlStudentkortet({ domainLookup: lookup, generatedAt, overrides: overrides(), startUrl: `${origin}/rabatter`,
      logger: { info() {}, error() {}, warn: (message: string) => warnings.push(message) } });
    assert.deepEqual(offers.map((offer) => offer.domains), [["nelly.com"]]);
    assert.ok(warnings.some((warning) => /redirect page .*\/videresending\/nelly\/nelly\/ failed: .*HTTP 503/.test(warning)));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
