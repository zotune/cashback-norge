import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDomainLookup } from "../src/backend/domain-lookup.js";
import type { ProviderOverrides } from "../src/backend/provider-overrides.js";
import { crawlLogbuy, parseLogbuyReward } from "../src/backend/providers/logbuy.js";
import { withPages } from "./coupon-test-server.js";

const generatedAt = "2026-11-13T12:00:00.000Z";
const logger = { info() {}, warn() {}, error() {} };

function detail(headline: string, items: string[]): string {
  return `<html><body><p class="text-medium">${headline}</p>
    <div class="text-block__richtext"><ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul></div>
    <div class="panel"><div itemprop="text"><p>Første svar.</p></div></div></body></html>`;
}

test("LogBuy keeps «opptil», never invents a rate and reads the minimum purchase", async () => {
  assert.equal(parseLogbuyReward("Opptil 30 % rabatt på Samsung-produkter."), "opptil 30 %");
  assert.equal(parseLogbuyReward("750 kr i rabatt på alle pakkereiser."), "750 kr");
  assert.equal(parseLogbuyReward("Rabatt på drivstoff hos Circle K."), "Rabatt");

  const list = `<html><body>
    <div><a class="product-finder__card-link" href="/rabatter/blivakker-rabattkode"></a><h3 class="product-finder__card-title">Blivakker</h3></div>
    <div><a class="product-finder__card-link" href="/rabatter/hotels-rabattkode"></a><h3 class="product-finder__card-title">Hotels.com</h3></div>
    <div><a class="product-finder__card-link" href="/rabatter/circle-k-rabattkode"></a><h3 class="product-finder__card-title">Circle K</h3></div>
  </body></html>`;
  const pages = {
    "/rabatter": list,
    "/rabatter/blivakker-rabattkode": detail("15 % rabatt på Blivakker.no.", ["15 % fast LogBuy-rabatt <span>ved kjøp over 799 kr</span>"]),
    "/rabatter/hotels-rabattkode": detail("10 % rabatt på hotellovernatting via Hotels.com.", ["10 % fast LogBuy-rabatt"]),
    "/rabatter/circle-k-rabattkode": detail("Rabatt på drivstoff hos Circle K.", []),
  };
  const overrides = { logbuy: { blivakker: ["blivakker.no"], "circle-k": ["circlek.no"] } } as unknown as ProviderOverrides;
  const domainLookup = buildDomainLookup([{
    provider: "remember", merchantName: "Hotels.com", domains: ["hotels.com", "jdoqocy.com"], reward: "5 %",
    sourceUrl: "", activationUrl: "", terms: "", updatedAt: generatedAt,
  }]);

  await withPages(pages, async (origin) => {
    const offers = await crawlLogbuy({
      domainLookup, generatedAt, logger, maxRequestsPerCrawl: 10, overrides, startUrl: `${origin}/rabatter`,
    });
    const byName = new Map(offers.map((offer) => [offer.merchantName, offer]));
    assert.deepEqual(byName.get("Blivakker")?.rewardCalculation, { minimumPurchaseNok: 799, minimumPurchaseExclusive: true });
    assert.deepEqual(byName.get("Hotels.com")?.domains, ["hotels.com"]);
    assert.equal(byName.get("Circle K")?.reward, "Rabatt");
    assert.match(byName.get("Circle K")?.terms ?? "", /Krever LogBuy-tilgang/);
  });
});
