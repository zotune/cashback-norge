import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { buildDomainLookup } from "../src/backend/domain-lookup.js";
import type { ProviderOverrides } from "../src/backend/provider-overrides.js";
import { crawlStudentTorget, parseStudentTorgetReward } from "../src/backend/providers/studenttorget.js";

const generatedAt = "2026-10-31T12:00:00.000Z";
const logger = { info() {}, warn() {}, error() {} };

function overrides(): ProviderOverrides {
  const empty = {};
  return {
    trumf: empty, klarna: empty, remember: empty, sas: empty, tfbank: empty, obos: empty, bob: empty,
    usbl: empty, bate: empty, tobb: empty, logbuy: empty, naf: empty, tekna: empty, nito: empty,
  };
}

// Mirrors the live detail-page markup (job-main-info-block, jobad-subtitle,
// jobad-info-block, cp-info-right-block with an optional fa-globe link).
function detailPage(subtitle: string, body: string, website = ""): string {
  return `<html><body><div class="job-main-info-block"><div class="job-main-info-block__content">
    <h1 class="jobad-title">Studentrabatt</h1>
    ${subtitle ? `<h2 class="jobad-subtitle" style="padding-bottom: 0;">${subtitle}</h2>` : ""}
    <div class="jobad-info-block">
      <div><p>${body}</p></div>
    </div></div>
    <div class="cp-info-right-block"><div>${
      website ? `<i class="fa fa-globe"></i><a href="${website}">Nettside</a>` : "<span>Ingen lenke</span>"
    }</div></div>
  </div></body></html>`;
}

function profiledCard(offer: { slug: string; id: number; name: string }, badge: string): string {
  return `<div class="cp_vacancy_block"><a href="/studentrabatt/${offer.slug}/${offer.id}"><div class="cp_vacancy_image__label">${badge}</div></a>
    <div class="cp_vacancies_content_item_title"><a href="/studentrabatt/${offer.slug}/${offer.id}">${offer.name} - Studentrabatt</a></div>
    <div class="cp_vacancies_content_item_description">Studentrabatt</div></div>`;
}

test("detail pages are read for every profiled offer and every unprofiled offer that will be published", async () => {
  // The live listing is shuffled on every request. Profiled cards are read
  // regardless of their position; Domino's is an unprofiled entry without a
  // website link that is published through a name lookup after 31 entries
  // without a website (the old early stop gave up before reaching it).
  const bislet = { slug: "bislet-bilutleie", id: 938279, name: "Bislet Bilutleie" };
  const appleMusic = { slug: "apple-music", id: 938397, name: "Apple Music" };
  const fillers = Array.from({ length: 31 }, (_value, index) => ({ slug: `bar-${index}`, id: 900000 + index, name: `Bar ${index}` }));
  const dominos = { slug: "dominos", id: 938333, name: "Dominos Pizza" };
  const unprofiled = [...fillers, dominos];
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const path = request.url ?? "/";
    requests.push(path);
    if (path === "/studentrabatter") {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end([
        profiledCard(appleMusic, "STUDENTRABATT!"),
        profiledCard(bislet, "20%"),
        ...unprofiled.map((offer) => {
          return `<div class="discount-box-unprofiled"><a href="/studentrabatt/${offer.slug}/${offer.id}">${offer.name} - Studentrabatt</a></div>`;
        }),
      ].join("\n"));
      return;
    }
    if (path === `/studentrabatt/${bislet.slug}/${bislet.id}`) {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(detailPage("Studenter får 20 % rabatt på leiebil.", "Vis studentbevis.", "https://www.bisletbilutleie.no/"));
      return;
    }
    if (path === `/studentrabatt/${appleMusic.slug}/${appleMusic.id}`) {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(detailPage("Apple Music har studentrabatt.", "Besøk Apple Music for mer informasjon."));
      return;
    }
    if (path === `/studentrabatt/${dominos.slug}/${dominos.id}`) {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(detailPage(
        "Vi gir studenter 20% rabatt på medium pizza - hver dag, hele året.",
        "Ta med gyldig studentbevis og vis frem i kassen.",
      ));
      return;
    }
    if (path.startsWith("/studentrabatt/bar-")) {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(detailPage("", "Ta kontakt for mer informasjon."));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const domainLookup = buildDomainLookup([{
    provider: "klarna", merchantName: "Dominos Pizza", domains: ["dominos.no"], reward: "1 %",
    sourceUrl: "", activationUrl: "", terms: "", updatedAt: generatedAt,
  }]);

  try {
    const offers = await crawlStudentTorget({ baseUrl, domainLookup, generatedAt, logger, overrides: overrides() });
    const byName = new Map(offers.map((offer) => [offer.merchantName, offer]));
    // Apple Music has neither a website link nor a lookup match: not published.
    assert.deepEqual([...byName.keys()].sort(), ["Bislet Bilutleie", "Dominos Pizza"]);

    const dominosOffer = byName.get("Dominos Pizza");
    assert.deepEqual(dominosOffer?.domains, ["dominos.no"]);
    assert.equal(dominosOffer?.reward, "20 %");
    assert.match(dominosOffer?.terms ?? "", /20% rabatt på medium pizza/);
    assert.match(dominosOffer?.terms ?? "", /gyldig studentbevis/);

    const bisletOffer = byName.get("Bislet Bilutleie");
    assert.deepEqual(bisletOffer?.domains, ["bisletbilutleie.no"]);
    assert.equal(bisletOffer?.reward, "20 %");

    // Both profiled detail pages and Domino's are read once; unprofiled
    // entries that can never be published are not fetched at all.
    const detailRequests = requests.filter((path) => path.startsWith("/studentrabatt/"));
    assert.deepEqual(detailRequests.sort(), [
      `/studentrabatt/${appleMusic.slug}/${appleMusic.id}`,
      `/studentrabatt/${bislet.slug}/${bislet.id}`,
      `/studentrabatt/${dominos.slug}/${dominos.id}`,
    ]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("student prices stated in the detail text are read as totals", () => {
  // Live texts (studenttorget.no, 2026-10-31).
  assert.equal(
    parseStudentTorgetReward("", "", "Studenter får undersøkelse, røntgenbilder og enkel rens til kr 740,-.\nDet er gratis parkering i vår underetasje."),
    "740 kr totalsum",
  );
  assert.equal(
    parseStudentTorgetReward("", "Vi hjelper deg med flyttingen! For kun 1250,- får du både bil og medhjelper i hele 75 minutter. Ønsker du en medhjelper til, betaler du kun 500,- ekstra."),
    "1250 kr totalsum",
  );
  assert.equal(
    parseStudentTorgetReward("", "", "Stuenter kan spille så mye man vil du vil etter kl 19:00 mandag til torsdag for kr 149,-. Må vise studentbevis."),
    "149 kr totalsum",
  );
  assert.equal(
    parseStudentTorgetReward("", "Glad i film? Verdensteateret Cinemateket har studentrabatt!", "Verdensteatret har rabatterte billetter på alle ordinære kinoforestillinger til kr. 120,- (ordinær pris kr. 130,-) I tillegg kan man kjøpe medlemskap til kr. 100,-"),
    "120 kr totalsum",
  );
  assert.equal(
    parseStudentTorgetReward("", "", "Kiropraktor første gang: Normalpris: 680,- Studentpris: 580,-\nMassasje: Normalpris: 580,- Studentpris: 460,-"),
    "460-580 kr totalsum",
  );
  assert.equal(parseStudentTorgetReward("", "Kun 110 kr for en kaffe"), "110 kr totalsum");
  assert.equal(
    parseStudentTorgetReward("", "", "Studenter betaler kr 100,- i inngangsbillett\nHusk gyldig studentbevis!"),
    "100 kr totalsum",
  );
  // A monthly fee is a unit price, not the total.
  assert.equal(parseStudentTorgetReward("", "", "Som student betaler 300,- per måned (veil. pris 375,-)"), "");
});

test("discounts, maximums and unit prices are not misread as a student price", () => {
  assert.equal(parseStudentTorgetReward("OPPTIL -30%", ""), "opptil 30 %");
  // Hotels.com's own sale is up to 40 %; the student code adds 10 % on top.
  assert.equal(parseStudentTorgetReward("", "Spar opp til 40 % + 10 % ekstra med StudentTorgets rabattkode!"), "10 %");
  assert.equal(parseStudentTorgetReward("", "Du får 200 kr i rabatt på første time."), "200 kr");
  // A maximum is not a price.
  assert.equal(parseStudentTorgetReward("", "Gavekort på inntil 300,- per student"), "");
  assert.equal(parseStudentTorgetReward("", "Vi gir deg opp til 300,- tilbake"), "");
  // Hourly and starting prices are not the total.
  assert.equal(parseStudentTorgetReward("", "", "Golfsimulator: 250,- per time (Normalpris 300,- per time)"), "");
  assert.equal(parseStudentTorgetReward("", "", "16:00: 395,- (studentpris kr. 295,-/timen)"), "");
  assert.equal(parseStudentTorgetReward("", "", "Dameklipp student fra 620,-"), "");
  // The source states no amount: keep it unknown.
  assert.equal(parseStudentTorgetReward("", "Apple Music har studentrabatt.", "Besøk Apple Music for mer informasjon."), "");
});

test("free-text rewards: only this merchant's discount, bundles, prefixed prices and per-unit prices", () => {
  // Live texts (studenttorget.no, 2026-11-12), trimmed.
  // Emirates: "inntil 100 % bonus-Miles" is a loyalty perk, not the discount.
  assert.equal(parseStudentTorgetReward("", "", "Bruk tilbudskoden STUDENT for å få opptil 10 % rabatt på Economy Class-priser og 5 % rabatt på Premium Economy- og Business Class-priser.\nEtter hvert som du går opp i medlemsnivå, vil du opptjene inntil 100 % bonus-Miles på hver flygning."), "opptil 5-10 %");
  // Min Kiropraktor: the student association's refund is not the clinic's discount.
  assert.equal(parseStudentTorgetReward("", "", "Kiropraktor første gang 550kr.\nSIA refunderer i tillegg til studentrabatten opp til 40 % av behandlingen."), "");
  assert.equal(parseStudentTorgetReward("-15 %", ""), "15 %");
  // A bare "45,-" badge is the student price; "-1000 kr" is money off.
  assert.equal(parseStudentTorgetReward("45,-", ""), "45 kr totalsum");
  assert.equal(parseStudentTorgetReward("-1000 kr", ""), "1 000 kr");
  assert.equal(parseStudentTorgetReward("", "", "Bli medlem i Norsk Folkehjelp for kroner 100, og støtt deres humanitære arbeid. Ordinærpris er 200,-"), "100 kr totalsum");
  assert.equal(parseStudentTorgetReward("", "", "Kjøp for 4 personer i samme aktivitet, og få den femte personen gratis!"), "5 for 4");
  // Per-person and starting prices stay unknown rather than become a total.
  assert.equal(parseStudentTorgetReward("", "", "Megazone: 80,- per person (Normalpris 120,-)\nBowling: 60,- per person per serie inkludert sko"), "");
  assert.equal(parseStudentTorgetReward("", "", "STUDENTPRIS\nStudentbilletter fra kun kr. 120,- !"), "");
});

test("a free trial period is a promotion, not a permanent free price", async () => {
  const bookbeat = { slug: "bookbeat", id: 939942, name: "BookBeat" };
  const server = createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/html" });
    if (request.url === "/studentrabatter") {
      response.end(profiledCard(bookbeat, "STUDENTRABATT!"));
    } else {
      response.end(detailPage("Få 90 dager gratis med BookBeat. Nyt over 1 million lydbøker og e-bøker.", "Fyll livet med historier.", "https://www.bookbeat.com/no"));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    const offers = await crawlStudentTorget({ baseUrl, domainLookup: buildDomainLookup([]), generatedAt, logger, overrides: overrides() });
    assert.equal(offers.length, 1);
    assert.equal(offers[0]?.reward, "0 kr totalsum");
    assert.deepEqual(offers[0]?.promotion, { label: "90 dager gratis", priceNok: 0 });
    assert.deepEqual(offers[0]?.domains, ["bookbeat.com"]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("shuffled listing pages are re-read until every advertised offer is seen", async () => {
  // Live behaviour: every page request returns a new random order.
  const all = Array.from({ length: 6 }, (_v, i) => ({ slug: `butikk-${i}`, id: 1000 + i, name: `Butikk ${i}` }));
  let call = 0;
  const pageRequests: string[] = [];
  const server = createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/html" });
    const url = request.url ?? "";
    if (url.startsWith("/studentrabatter")) {
      pageRequests.push(url);
      // Two cards per page, two pages; the order rotates per request.
      const offset = (call++ * 2) % all.length;
      const cards = [all[offset]!, all[(offset + 1) % all.length]!];
      response.end(`<p>Viser ${all.length} studentrabatter</p>${cards.map((o) => profiledCard(o, "10%")).join("")}<a href="/studentrabatter?page=2">2</a>`);
    } else {
      response.end(detailPage("", "10 % studentrabatt", `https://${url.split("/")[2]}.example/`));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    const offers = await crawlStudentTorget({ baseUrl, domainLookup: buildDomainLookup([]), generatedAt, logger, overrides: overrides() });
    assert.equal(offers.length, 6);
    // Bounded: stops as soon as all advertised offers are seen.
    assert.ok(pageRequests.length <= 1 + 6 * 3, `requests: ${pageRequests.length}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
