import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";

test("Sparebørsen campaign rates name the ordinary rate in the tooltip", async (t) => {
  const partner = (extra: Record<string, unknown>) => ({
    name: "Butikk", slug: "butikk", websiteUrl: "https://butikk.example", cashbackPercent: 4.8, cashbackType: "percentage",
    cashbackCurrency: null, active: true, segments: [{ name: "Standard", cashbackValue: 4.8, cashbackType: "percentage", currency: null }],
    baseCashbackPercent: 4, campaignApplies: true, ...extra,
  });
  const partners = [
    partner({}),
    partner({ name: "Uten kampanje", slug: "uten", websiteUrl: "https://uten.example", baseCashbackPercent: 4.8, campaignApplies: false }),
    partner({ name: "Segmenter", slug: "seg", websiteUrl: "https://seg.example", cashbackPercent: 1, baseCashbackPercent: 0.7,
      segments: [{ name: "Nye kunder", cashbackValue: 5.7, cashbackType: "percentage", currency: null }, { name: "Andre", cashbackValue: 1, cashbackType: "percentage", currency: null }] }),
  ];
  const server = createServer((_request, response) => response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ success: true, data: { partners } })));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const { fetchSpareborsen } = await import("../src/backend/providers/spareborsen.js");
  const offers = await fetchSpareborsen({ generatedAt: "2026-10-31T00:00:00.000Z", logger: { info() {}, warn() {}, error() {} }, apiUrls: [`http://127.0.0.1:${address.port}/api/partners`] });
  const byName = new Map(offers.map((offer) => [offer.merchantName, offer]));
  assert.equal(byName.get("Butikk")?.reward, "4,8 %");
  assert.equal(byName.get("Butikk")?.terms, "Forhøyet kampanjesats hos Sparebørsen: +0,8 prosentpoeng. Vanlig sats: 4 %. Kampanjen er tidsbegrenset.");
  assert.equal(byName.get("Uten kampanje")?.terms, "");
  assert.equal(byName.get("Segmenter")?.terms, "5,7 % – Nye kunder\n1 % – Andre\n\nForhøyede kampanjesatser hos Sparebørsen. Kampanjen er tidsbegrenset.");
});
