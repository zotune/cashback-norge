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
  assert.equal(parseStudentTorgetReward("", "Spar opp til 40 % + 10 % ekstra med StudentTorgets rabattkode!"), "opptil 10-40 %");
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
