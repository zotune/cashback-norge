import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import {
  buildCashbackIndex,
  type CashbackOffer,
} from "../src/shared/cashback.js";
import {
  collectProviderOffers,
  type CollectProviderOffersOptions,
} from "../src/backend/provider-offers.js";

const NOW = "2026-10-04T11:31:20.000Z";
const DAY_MS = 24 * 60 * 60 * 1000;

function offer(ageDays: number, provider = "norwegian"): CashbackOffer {
  return {
    provider,
    merchantName: `${provider} shop`,
    domains: [`${provider}-shop.no`],
    reward: "5 %",
    sourceUrl: `https://${provider}.example/partner`,
    activationUrl: `https://${provider}.example/partner`,
    terms: "",
    updatedAt: new Date(Date.parse(NOW) - ageDays * DAY_MS).toISOString(),
  };
}

function fixture(t: TestContext, previousOffers: CashbackOffer[] = []) {
  t.mock.method(Date, "now", () => Date.parse(NOW));
  const warnings: string[] = [];
  const options: CollectProviderOffersOptions = {
    label: "Norwegian Reward",
    logger: {
      info() {},
      error() {},
      warn(message) { warnings.push(message); },
    },
    fallbackWhenEmpty: true,
    maxPreviousOfferAgeDays: 14,
    previousOffersByProvider: new Map([["norwegian", previousOffers]]),
    provider: "norwegian",
    reusePreviousOnFailure: true,
    run: () => { throw new Error("Norwegian Reward returned 401 Unauthorized"); },
  };
  return { options, warnings };
}

test("expired Norwegian fallback does not block publishing another provider", async (t) => {
  const { options, warnings } = fixture(t, [offer(14.1)]);
  const freshOffer = offer(0, "dnb");
  const results = await Promise.all([
    collectProviderOffers(options),
    collectProviderOffers({ ...options, label: "DNB", provider: "dnb", run: () => [freshOffer] }),
  ]);
  const index = buildCashbackIndex(results.flat(), NOW);

  assert.deepEqual(index.offers, [freshOffer]);
  assert.deepEqual(index.domainIndex["dnb-shop.no"], [freshOffer]);
  assert.equal(index.domainIndex["norwegian-shop.no"], undefined);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /401 Unauthorized.*14\.1 days old.*14 day fallback limit.*skipping provider/);
});

test("a failed source reuses fresh offers without changing their timestamps", async (t) => {
  const previousOffer = offer(13);
  const { options, warnings } = fixture(t, [previousOffer]);
  const result = await collectProviderOffers(options);

  assert.deepEqual(result, [previousOffer]);
  assert.equal(result[0]!.updatedAt, previousOffer.updatedAt);
  assert.match(warnings[0]!, /keeping 1 offers.*13 days old/);
});

test("the fallback remains valid exactly at the 14 day limit", async (t) => {
  const previousOffer = offer(14);
  const { options } = fixture(t, [previousOffer]);
  assert.deepEqual(await collectProviderOffers(options), [previousOffer]);
});

test("an empty crawl reuses a fresh fallback", async (t) => {
  const previousOffer = offer(1);
  const { options, warnings } = fixture(t, [previousOffer]);
  assert.deepEqual(await collectProviderOffers({ ...options, run: () => [] }), [previousOffer]);
  assert.match(warnings[0]!, /produced no offers.*keeping 1 offers/);
});

test("an empty crawl omits an expired fallback", async (t) => {
  const { options, warnings } = fixture(t, [offer(16.1)]);
  assert.deepEqual(await collectProviderOffers({ ...options, run: () => [] }), []);
  assert.match(warnings[0]!, /produced no offers.*16\.1 days old.*skipping provider/);
});

test("a source is still attempted after it has dropped out of the previous index", async (t) => {
  const { options, warnings } = fixture(t);
  assert.deepEqual(await collectProviderOffers(options), []);
  assert.match(warnings[0]!, /no previous offers available.*skipping provider/);

  const recoveredOffer = offer(0);
  let attempts = 0;
  const result = await collectProviderOffers({
    ...options,
    run: () => { attempts++; return [recoveredOffer]; },
  });
  assert.deepEqual(result, [recoveredOffer]);
  assert.equal(attempts, 1);
  assert.equal(warnings.length, 1);
});

test("fallback with an invalid timestamp is omitted with a warning", async (t) => {
  const { options, warnings } = fixture(t, [{ ...offer(0), updatedAt: "invalid" }]);
  assert.deepEqual(await collectProviderOffers(options), []);
  assert.match(warnings[0]!, /no valid updatedAt.*skipping provider/);
});

test("a fresh offer from another source cannot extend a filtered fallback", async (t) => {
  const oldRabatta = { ...offer(16, "rabattkode"), sourceUrl: "https://rabatta.app/no/shop" };
  const freshRabattkode = { ...offer(0, "rabattkode"), sourceUrl: "https://rabattkode.no/shop" };
  const { options, warnings } = fixture(t);
  const result = await collectProviderOffers({
    ...options,
    label: "Rabatta",
    provider: "rabattkode",
    previousOffersByProvider: new Map([["rabattkode", [oldRabatta, freshRabattkode]]]),
    previousOfferFilter: (previousOffer) => new URL(previousOffer.sourceUrl).hostname === "rabatta.app",
  });
  assert.deepEqual(result, []);
  assert.match(warnings[0]!, /Rabatta:.*16 days old.*skipping provider/);
});

test("successful crawls replace stale offers with fresh results", async (t) => {
  const { options, warnings } = fixture(t, [offer(16)]);
  const freshOffer = offer(0);
  assert.deepEqual(await collectProviderOffers({ ...options, run: () => [freshOffer] }), [freshOffer]);
  assert.deepEqual(warnings, []);
});

test("sources without fallback enabled still propagate their errors", async (t) => {
  const { options, warnings } = fixture(t, [offer(1)]);
  await assert.rejects(
    collectProviderOffers({ ...options, reusePreviousOnFailure: false }),
    /Norwegian Reward: failed \(Norwegian Reward returned 401 Unauthorized\)/,
  );
  assert.deepEqual(warnings, []);
});
