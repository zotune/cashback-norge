import assert from "node:assert/strict";
import { test } from "node:test";
import type { CashbackOffer } from "../src/shared/cashback.js";
import { buildCashbackIndex, findOffersForHostname } from "../src/shared/cashback.js";
import { getOfferCampaignLabel, getVisibleOfferKey, prioritizeOffersForPage } from "../src/shared/offer-context.js";
import { getOfferActivationKey, isOfferActivated } from "../src/extension/activation-state.js";

function offer(cid: string, overrides: Partial<CashbackOffer> = {}): CashbackOffer {
  return {
    provider: "cbn", merchantName: "Uno Score", domains: ["unoscore.no"], reward: "105 kr",
    sourceUrl: "https://www.unoscore.no", // Existing bundled/cached index format.
    activationUrl: `https://orsearchlink.com/click.track?CID=${cid}&AFID=570033`,
    terms: "", updatedAt: "2026-11-03T10:00:00Z", ...overrides,
  };
}
const debt = offer("451581");
const credit = offer("451327", { reward: "55 kr" });

test("same-domain support campaigns keep separate rows and action labels", () => {
  assert.notEqual(getVisibleOfferKey(debt), getVisibleOfferKey(credit));
  assert.equal(getOfferCampaignLabel(debt), "Gjeldsoversikt");
  assert.equal(getOfferCampaignLabel(credit), "Kredittscore");
  assert.equal(getVisibleOfferKey(debt), getVisibleOfferKey(offer("451581", {
    activationUrl: "https://oriomed.com/click.track?CID=451581&AFID=570033&ADID=2606148&SID=",
  })));
  assert.equal(isOfferActivated(credit, getOfferActivationKey(debt)), false);
});

test("current Uno page takes precedence over payout without removing the other heart", () => {
  const offers = [debt, credit];
  for (const url of ["https://app.unoscore.no/kredittscore?info=logg-inn", "https://unoscore.no/kredittscore/"]) {
    assert.deepEqual(prioritizeOffersForPage(offers, url), [credit, debt]);
  }
  for (const path of ["/gjeldsoversikt", "/statistikk/gjeldsoversikt", "/gjeldfri"]) {
    assert.deepEqual(prioritizeOffersForPage([credit, debt], `https://app.unoscore.no${path}`), [debt, credit]);
  }
  assert.deepEqual(offers, [debt, credit]);
});

test("extension hostname lookup returns both approved campaigns from an existing index", () => {
  const namedDebt = { ...debt, merchantName: "Uno Score - Gjeldsoversikt" };
  const namedCredit = { ...credit, merchantName: "Uno Score - Kredittsjekk" };
  const index = buildCashbackIndex([namedDebt, namedCredit], "2026-11-03T10:00:00Z");
  for (const host of ["unoscore.no", "www.unoscore.no", "app.unoscore.no"]) {
    assert.deepEqual(findOffersForHostname(index, host).map(getOfferCampaignLabel), ["Gjeldsoversikt", "Kredittscore"]);
  }
  const ordinary = buildCashbackIndex([
    { ...namedDebt, provider: "trumf", reward: "5 %" },
    { ...namedCredit, provider: "trumf", reward: "3 %" },
  ], "2026-11-03T10:00:00Z");
  assert.equal(findOffersForHostname(ordinary, "unoscore.no").length, 1);
  const samePayout = buildCashbackIndex([debt, { ...credit, reward: debt.reward }], "2026-11-03T10:00:00Z");
  assert.equal(samePayout.offers.length, 2);
  assert.equal(samePayout.domainIndex["unoscore.no"]?.length, 2);
  assert.equal(findOffersForHostname(samePayout, "unoscore.no").length, 2);
});

test("unknown paths, lookalike hosts and unrelated providers retain their order", () => {
  for (const url of ["https://unoscore.no/", "https://unoscore.no/kredittscore-annet", "https://unoscore.no.evil.test/kredittscore", "invalid"]) {
    assert.deepEqual(prioritizeOffersForPage([debt, credit], url), [debt, credit]);
  }
  for (const overrides of [{ provider: "trumf" }, { domains: ["other.no"] }, { activationUrl: "https://other.no/?CID=451327" }]) {
    assert.equal(getOfferCampaignLabel(offer("451327", overrides)), undefined);
  }
  assert.equal(getVisibleOfferKey(offer("1", { provider: "trumf" })), getVisibleOfferKey(offer("2", { provider: "trumf" })));
  assert.notEqual(getVisibleOfferKey(offer("1")), getVisibleOfferKey(offer("2")));
});
