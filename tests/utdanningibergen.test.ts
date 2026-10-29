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
