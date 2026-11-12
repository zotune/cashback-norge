import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchUtdanningiBergen } from "../src/backend/providers/utdanningibergen.js";
import { collectProviderOffers } from "../src/backend/provider-offers.js";
import type { CashbackOffer } from "../src/shared/cashback.js";

const generatedAt = "2026-10-29T12:00:00.000Z";
const pageUrl = "https://www.utdanningibergen.no/studentrabatter/";
const valid = { id: 1, name: "Studentrabatt på en behandling", business_name: "Studentrabatt Eksempel",
  discount_type: "%", discount: 20, description: null, conditions: null, validTo: null,
  categories: [], link: "https://example.no/student", url: "eksempel" };
const fixture = (rows: unknown[]) => `<student-discounts :discounts="${JSON.stringify(rows).replaceAll('"', "&quot;")}"></student-discounts>`;

test("a missing merchant name does not stop the remaining student discounts", async (t) => {
  const warnings: string[] = [];
  const logger = { info() {}, error() {}, warn(message: string) { warnings.push(message); } };
  t.mock.method(globalThis, "fetch", async (url: string) => {
    assert.equal(url, pageUrl);
    return new Response(fixture([
      // The live failing record: the offer's name is not a merchant name.
      { ...valid, id: 19026, business_name: null, name: "Studentrabatt på medlemsskap i kommunikasjonsforeningen",
        link: "https://www.kommunikasjon.no/medlemsfordeler/for-studenter", discount_type: "fastpris", discount: 0 },
      valid,
      { ...valid, id: 3, business_name: " " },
    ]));
  });
  const offers = await fetchUtdanningiBergen({ generatedAt, logger });
  assert.equal(offers.length, 1);
  assert.equal(offers[0]?.merchantName, "Eksempel");
  assert.equal(offers[0]?.reward, "20 %");
  assert.deepEqual(offers[0]?.domains, ["example.no"]);
  assert.equal(offers[0]?.updatedAt, generatedAt);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0]!, /discount 19026.*studentrabatter.*missing business_name/);
  assert.match(warnings[1]!, /discount 3.*missing business_name/);
});

test("an entirely incomplete catalogue activates bounded fallback without refreshing old data", async (t) => {
  t.mock.method(Date, "now", () => Date.parse(generatedAt));
  t.mock.method(globalThis, "fetch", async () => new Response(fixture([{ ...valid, business_name: null }])));
  const warnings: string[] = [];
  const logger = { info() {}, error() {}, warn(message: string) { warnings.push(message); } };
  const previous: CashbackOffer = { provider: "utdanningibergen", merchantName: "Eksempel", domains: ["example.no"],
    reward: "20 %", sourceUrl: `${pageUrl}eksempel`, activationUrl: `${pageUrl}eksempel`, terms: "",
    updatedAt: "2026-10-28T12:00:00.000Z" };
  const options = { label: "Utdanning i Bergen", provider: "utdanningibergen", logger,
    fallbackWhenEmpty: true, reusePreviousOnFailure: true, maxPreviousOfferAgeDays: 14,
    previousOffersByProvider: new Map([["utdanningibergen", [previous]]]),
    run: () => fetchUtdanningiBergen({ generatedAt, logger }) };
  const offers = await collectProviderOffers(options);
  assert.deepEqual(offers, [previous]);
  assert.equal(offers[0]?.updatedAt, previous.updatedAt);
  assert.ok(warnings.some((warning) => /keeping 1 offers from previous index/.test(warning)));
  const expired = { ...previous, updatedAt: "2026-10-01T12:00:00.000Z" };
  assert.deepEqual(await collectProviderOffers({ ...options,
    previousOffersByProvider: new Map([["utdanningibergen", [expired]]]) }), []);
  assert.ok(warnings.some((warning) => /above the 14 day fallback limit.*skipping provider/.test(warning)));
});

test("rewards stated only in the description or conditions are read with the shared parsers", async (t) => {
  // Live records (utdanningibergen.no, 2026-10-31), trimmed.
  const rows = [
    { ...valid, id: 18644, business_name: "Specsavers", url: "specsavers", link: "https://www.specsavers.no/",
      discount_type: "fastpris", discount: 395, description: "<p>Adresse: Vågsallmenningen 4</p>",
      conditions: "<p>Kun synsundersøkelse + 25 % på komplett brille. Vis gyldig studentbevis. Se nettside for flere betingelser</p>" },
    { ...valid, id: 15900, business_name: "SAS", url: "sas", link: "https://www.sas.no/",
      discount_type: "%", discount: 0,
      description: "<p>Hver SAS-flyvning har en Young-rabatt på opptil 70 % av ordinær pris.For unge mellom 12 og 25 år.</p>",
      conditions: "<p>Reisende på ungdomsbilletter må kunne bevise alderen sin med gyldig legitimasjon.</p>" },
    { ...valid, id: 16027, business_name: "Widerøe", url: "wideroee", link: "https://www.wideroe.no/",
      discount_type: "NOK", discount: 0,
      description: "<p>For fulltidsstudenter mellom 26 og 31 år. Du må sjekke nettsider for pris, da denne varierer.</p>",
      conditions: "<p>Husk gyldig studentbevis, ellers blir du nektet ombordsstigning.</p>" },
    { ...valid, id: 18667, business_name: "Kunsthall 3.14", url: "kunsthall", link: "https://www.kunsthall314.art/",
      discount_type: "fastpris", discount: 0, description: "<p>Internasjonal samtidskunstgalleri i hjertet av Bergen.</p>",
      conditions: "<p>Gratis inngang</p>" },
    // A zero fixed price without a documented free offer is a missing amount.
    { ...valid, id: 4, business_name: "Ukjent pris", url: "ukjent", link: "https://ukjent.example/",
      discount_type: "fastpris", discount: 0, description: "<p>Studentrabatt på kurs.</p>", conditions: null },
    { ...valid, id: 5, business_name: "Zupperia", url: "zupperia", link: "https://zupperia.example/",
      discount_type: "%", discount: 15,
      description: "<p>Rabatt på alle retter. Tilbyr også 25% rabatt på utvalgte lunsjretter.</p>", conditions: null },
  ];
  t.mock.method(globalThis, "fetch", async () => new Response(fixture(rows)));
  const offers = await fetchUtdanningiBergen({ generatedAt, logger: { info() {}, warn() {}, error() {} } });
  const rewards = Object.fromEntries(offers.map((offer) => [offer.merchantName, offer.reward]));
  assert.deepEqual(rewards, {
    // The structured eye-test price stays first; the glasses discount is kept.
    Specsavers: "395 kr totalsum + 25 %",
    SAS: "opptil 70 %",
    Widerøe: "?",
    "Kunsthall 3.14": "0 kr totalsum",
    "Ukjent pris": "?",
    // The structured rate is not overridden by a narrower campaign in the text.
    Zupperia: "15 %",
  });
  const specsavers = offers.find((offer) => offer.merchantName === "Specsavers");
  assert.match(specsavers?.terms ?? "", /25 % på komplett brille/);
});

test("fixed prices keep their unit, structured rates keep the source's range and maximum", async (t) => {
  // Live records (utdanningibergen.no, 2026-11-12), trimmed.
  const rows = [
    { ...valid, id: 16919, name: "Studentmedlem månedspris - Bergen Fellesverksted", business_name: "Fellesverksted",
      url: "fv", link: "https://www.bergenfellesverksted.no/", discount_type: "fastpris", discount: 340,
      description: "<p>Verksted hvor alle over 18 år kan bli medlem.</p>", conditions: "<p>Vis gyldig studentbevis</p>" },
    { ...valid, id: 16592, name: "StudentPakke OneCall", business_name: "One Call", url: "onecall",
      link: "https://onecall.no/mobilabonnement/studentpakka", discount_type: "fastpris", discount: 279,
      description: "<p>Studentpakka. Vi spanderer månedsavgiften i feriemånedene juli og desember.</p>", conditions: null },
    { ...valid, id: 18206, name: "Studentrabatt øvingslokale band", business_name: "AKKS", url: "akks",
      link: "https://akks.no/bergen/", discount_type: "fastpris", discount: 170,
      description: "<p>Adresse: Georgernes Verft 12</p>", conditions: "<p>Gjelder Drop-in på øvingslokale for band. Minimum 2 timer.</p>" },
    { ...valid, id: 16028, name: "Studentrabatt Norwegian flybillett", business_name: "Norwegian", url: "norwegian",
      link: "https://www.norwegian.no/", discount_type: "fastpris", discount: 399,
      description: "<p>Ungdomsbilletter til dem under 26 år. Her vises bare fra-priser, så sjekk Norwegians nettsider for riktig pris.</p>", conditions: null },
    { ...valid, id: 15753, name: "Studentpris Medlemsskap i Kreftforeningen", business_name: "Kreftforeningen", url: "kreft",
      link: "https://kreftforeningen.no/", discount_type: "fastpris", discount: 195, description: "", conditions: "<p>Gjelder årlig medlemsskap</p>" },
    { ...valid, id: 17264, business_name: "Den Nationale Scene", url: "dns", link: "https://dns.no/", discount_type: "%", discount: 50,
      description: "<p>Opptil 50% rabatt på forestillinger. Spesialtilbud på SMS og e-post.</p>", conditions: null },
    { ...valid, id: 11027, business_name: "BAD og VVS", url: "badvvs", link: "https://bad-vvs.no/", discount_type: "%", discount: 10,
      description: "<p>Studenter med gyldig studentbevis får 2.5% – 10% rabatt avhengig av jobben.</p>", conditions: null },
    // A file on a CDN is not the merchant's shop.
    { ...valid, id: 18856, business_name: "Eline Bang", url: "eline", discount_type: "%", discount: 15,
      link: "https://cdn.shopify.com/s/files/1/0000/files/studentrabatt.pdf" },
  ];
  t.mock.method(globalThis, "fetch", async () => new Response(fixture(rows)));
  const warnings: string[] = [];
  const offers = await fetchUtdanningiBergen({ generatedAt, logger: { info() {}, error() {}, warn: (m: string) => warnings.push(m) } });
  const byName = Object.fromEntries(offers.map((offer) => [offer.merchantName, offer]));
  assert.deepEqual(Object.fromEntries(offers.map((offer) => [offer.merchantName, offer.reward])), {
    Fellesverksted: "340 kr/mnd",
    "One Call": "279 kr/mnd",
    AKKS: "170 kr/time",
    Norwegian: "Fra 399 kr totalsum",
    Kreftforeningen: "195 kr totalsum",
    "Den Nationale Scene": "opptil 50 %",
    "BAD og VVS": "2,5-10 %",
  });
  // A monthly price is the student's cost, never a calculable discount.
  assert.deepEqual(byName["One Call"]?.promotion, { label: "279 kr/mnd", priceNok: 279 });
  assert.equal(byName.Kreftforeningen?.promotion, undefined);
  assert.ok(warnings.some((warning) => /no usable domain for Eline Bang.*cdn\.shopify\.com/.test(warning)));
});

test("several entries for one merchant are merged instead of one silently replacing the others", async (t) => {
  const rows = [
    { ...valid, id: 11053, name: "Studentkino ", business_name: "Bergen Kino", url: "studentkino",
      link: "https://www.bergenkino.no/program/studentkino", discount_type: "fastpris", discount: 120,
      description: "<p>Konseptet «Studentkino» finner sted én onsdag i måneden.</p>", conditions: null },
    { ...valid, id: 16404, name: "Studentrabatt kinobillett", business_name: "Studentrabatt Bergen Kino", url: "bergen-kino-student",
      link: "https://www.bergenkino.no/program/studentkino", discount_type: "NOK", discount: 20,
      description: "<p>Bergen Kino tilbyr studenter minus kr. 20,- i studentrabatt på alle filmer hver mandag, tirsdag og onsdag hele året.</p>", conditions: null },
  ];
  t.mock.method(globalThis, "fetch", async () => new Response(fixture(rows)));
  const offers = await fetchUtdanningiBergen({ generatedAt, logger: { info() {}, warn() {}, error() {} } });
  assert.equal(offers.length, 1);
  // The discount on every Mon-Wed ticket is shown; the Studentkino price is
  // kept in the tooltip rather than dropped.
  assert.equal(offers[0]?.reward, "20 kr");
  assert.equal(offers[0]?.sourceUrl, `${pageUrl}bergen-kino-student`);
  assert.match(offers[0]!.terms, /minus kr\. 20,-/);
  assert.match(offers[0]!.terms, /Også: Studentkino \(120 kr totalsum\): Konseptet «Studentkino»/);
  assert.equal(offers[0]!.terms.match(/Studentrabatt via utdanningibergen\.no/g)?.length, 1);
});
