import assert from "node:assert/strict";
import { test } from "node:test";
import type { CashbackOffer } from "../src/shared/cashback.js";
import { matchesOfferQuickFilter, matchesOfferQuickFilters } from "../src/shared/offer-filters.js";

function offer(overrides: Partial<CashbackOffer>): CashbackOffer {
  return {
    provider: "trumf", merchantName: "Butikk", domains: [], reward: "5 %",
    sourceUrl: "https://example.no/fordel", activationUrl: "https://example.no/fordel",
    terms: "", updatedAt: "2026-10-11T10:00:00.000Z", ...overrides,
  };
}

test("electricity benefits are found across union and cashback providers", () => {
  for (const provider of ["agrol", "lofavor", "trumf"]) {
    assert.equal(matchesOfferQuickFilter(offer({ provider, merchantName: "Fjordkraft", domains: ["fjordkraft.no"] }), "strom"), true);
  }
});

test("a mobile offer stays separate from electricity at the same merchant", () => {
  const mobile = offer({ merchantName: "TrøndelagKraft mobil", domains: ["trondelagkraft.no"] });
  const electricity = offer({ merchantName: "TrøndelagKraft", domains: ["minside.trondelagkraft.no"] });
  assert.equal(matchesOfferQuickFilter(mobile, "mobil"), true);
  assert.equal(matchesOfferQuickFilter(mobile, "strom"), false);
  assert.equal(matchesOfferQuickFilter(electricity, "strom"), true);
  assert.equal(matchesOfferQuickFilter(electricity, "mobil"), false);
});

test("a specific broadband link overrides a telecom merchant's general services", () => {
  const broadband = offer({ merchantName: "Telia", domains: ["telia.no"], sourceUrl: "https://example.no/telia-bredb%C3%A5nd-og-tv/" });
  assert.equal(matchesOfferQuickFilter(broadband, "bredband"), true);
  assert.equal(matchesOfferQuickFilter(broadband, "mobil"), false);
  assert.equal(matchesOfferQuickFilter(offer({ merchantName: "NextGenTel Mobil", domains: ["nextgentel.no"] }), "bredband"), false);
});

test("tracking domains and missing domains do not hide known mobile offers", () => {
  assert.equal(matchesOfferQuickFilter(offer({ merchantName: "Talkmore", domains: ["cartrawler.com"] }), "mobil"), true);
  assert.equal(matchesOfferQuickFilter(offer({ merchantName: "Trøndermobil" }), "mobil"), true);
});

test("place names, car dealers and lookalike domains do not become utility offers", () => {
  for (const merchantName of ["FOSS Sport Strømmen", "Glød Lillestrøm", "Tannklinikken Degerstrøm"]) {
    assert.equal(matchesOfferQuickFilter(offer({ merchantName }), "strom"), false);
  }
  assert.equal(matchesOfferQuickFilter(offer({ merchantName: "Mobile", domains: ["mobile.no"] }), "mobil"), false);
  assert.equal(matchesOfferQuickFilter(offer({ domains: ["not-talkmore.no"] }), "mobil"), false);
  assert.equal(matchesOfferQuickFilter(offer({ merchantName: "Holdit", sourceUrl: "https://studentkortet.no/rabatter/elektronikk/mobil/holdit/" }), "mobil"), false);
});

test("student filtering checks the individual offer's eligibility", () => {
  assert.equal(matchesOfferQuickFilter(offer({ provider: "studentkortet", merchantName: "Talkmore" }), "student"), true);
  assert.equal(matchesOfferQuickFilter(offer({ provider: "trumf", merchantName: "Talkmore" }), "student"), false);
  assert.equal(matchesOfferQuickFilter(offer({ terms: "Vis gyldig studentbevis." }), "student"), true);
  assert.equal(matchesOfferQuickFilter(offer({}), ""), true);
});

test("electricity filtering excludes solar equipment and chargers at electricity suppliers", () => {
  const farco = offer({ merchantName: "Farco", domains: ["farco.no"], sourceUrl: "https://www.knbf.no/medlemsfordeler/farco-as-litiumbatterier-solceller-tilbehor/" });
  const charger = offer({ merchantName: "Zaptec Go 2", domains: ["tibber.com"] });
  const solar = offer({ merchantName: "Solcellekraft", domains: ["solcellekraft.no"] });
  assert.equal(matchesOfferQuickFilter(farco, "strom"), false);
  assert.equal(matchesOfferQuickFilter(charger, "strom"), false);
  assert.equal(matchesOfferQuickFilter(solar, "strom"), false);
  assert.equal(matchesOfferQuickFilter(offer({ merchantName: "Strømavtale fra Tibber", domains: ["tibber.com"] }), "strom"), true);
});

test("topic toggles combine with OR while student eligibility applies to each selected topic", () => {
  const studentMobile = offer({ provider: "studentkortet", merchantName: "Talkmore" });
  const mobile = offer({ provider: "trumf", merchantName: "Talkmore" });
  const electricity = offer({ merchantName: "Fjordkraft" });
  const unrelatedStudentOffer = offer({ provider: "studentkortet", merchantName: "Holdit" });
  assert.equal(matchesOfferQuickFilters(mobile, ["strom", "mobil"]), true);
  assert.equal(matchesOfferQuickFilters(electricity, ["strom", "mobil"]), true);
  assert.equal(matchesOfferQuickFilters(studentMobile, new Set(["mobil", "student"])), true);
  assert.equal(matchesOfferQuickFilters(mobile, ["mobil", "student"]), false);
  assert.equal(matchesOfferQuickFilters(unrelatedStudentOffer, ["mobil", "student"]), false);
  assert.equal(matchesOfferQuickFilters(unrelatedStudentOffer, ["student"]), true);
  assert.equal(matchesOfferQuickFilters(mobile, []), true);
  assert.equal(matchesOfferQuickFilters(unrelatedStudentOffer, []), true);
});
