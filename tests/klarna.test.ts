import assert from "node:assert/strict";
import { test } from "node:test";
import { parseKlarnaStores, type KlarnaStore } from "../src/backend/providers/klarna.js";

// Shapes from the klarna.com/no/store/?type=CASHBACK dehydrated store state (2026-11-13).
function store(name: string, discount: NonNullable<KlarnaStore["cashbackDiscount"]>, merchantUrl = `${name.toLowerCase()}.no`): KlarnaStore {
  return {
    storeKrn: `krn:retailer-directory-eu:store:online:00000000-0000-0000-0000-00000000000${name.length % 10}`,
    displayName: name,
    storeDirectUrl: "https://clk.klarna.com/no/gotostore/v1/home/store/00000000-0000-0000-0000-000000000001",
    cashbackDiscount: discount,
    otcUrl: `https://app.klarna.com/one-time-card/start?merchantUrl=${merchantUrl}&origin=klarna.com_merchant_page`,
  };
}

const label = (body: string, upTo: boolean) => ({ prefix: upTo ? "Opp til" : "", body, suffix: "cashback" });

test("Klarna store directory: base rate, rate-table range for «Opp til», up-to kept without a table, terms from conditions", () => {
  const offers = parseKlarnaStores([
    store("AGV", { discountPercentage: 350, discountLabel: label("3.5%", false), showUpToPrefix: false, conditions: { cashbackRates: [{ value: 350, type: "percentage", name: "Default" }], exclusionsStructured: [] } }),
    store("Zooplus", { discountPercentage: 200, discountLabel: label("2%", true), showUpToPrefix: true, conditions: { cashbackRates: [{ value: 200, type: "percentage", name: "New customer" }, { value: 100, type: "percentage", name: "Existing customer, Early-stage customer" }], exclusionsStructured: ["Gift cards"] } }),
    store("Sephora", { discountPercentage: 650, discountLabel: label("6.5%", true), showUpToPrefix: true, conditions: { cashbackRates: [{ value: 650, type: "percentage", name: "Sephora collection" }, { value: 400, type: "percentage", name: "All others" }, { value: 200, type: "percentage", name: "Kayali" }] } }, "sephora.se"),
    store("SkyShowtime", { discountPercentage: 1050, discountLabel: label("10.5%", true), showUpToPrefix: true }),
    store("Dyson", { discountPercentage: 250, discountLabel: label("2.5%", false), showUpToPrefix: false, endedAt: "2026-11-15T21:00:00.000Z", conditions: { cashbackRates: [{ value: 250, type: "percentage", name: "Default" }], exclusionsStructured: ["Spares and accessories"] } }),
    store("Broken", { discountPercentage: Number.NaN, discountLabel: label("", false), showUpToPrefix: false }),
  ], "https://www.klarna.com/no/store/?type=CASHBACK&page=1", "2026-11-13T00:00:00.000Z");

  assert.deepEqual(offers.map((offer) => [offer.merchantName, offer.reward, offer.domains]), [
    ["AGV", "3,5 %", ["agv.no"]],
    ["Zooplus", "1-2 %", ["zooplus.no"]],
    ["Sephora", "2-6,5 %", ["sephora.se"]],
    ["SkyShowtime", "opptil 10,5 %", ["skyshowtime.no"]],
    ["Dyson", "2,5 %", ["dyson.no"]],
  ]);
  assert.equal(offers[0]?.terms, "Cashback i appen Klarna i kassen");
  assert.equal(offers[1]?.terms, "Cashback i appen Klarna i kassen. Satser: New customer 2 %; Existing customer, Early-stage customer 1 %. Gjelder ikke: Gift cards");
  assert.equal(offers[4]?.terms, "Cashback i appen Klarna i kassen. Gjelder ikke: Spares and accessories. Kampanjesats til 15.11.2026");
});
