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

test("Sparebørsen keeps every segment amount, the partner's own terms and no tracking domains", async (t) => {
  const partner = (extra: Record<string, unknown>) => ({
    name: "Butikk", slug: "butikk", websiteUrl: "https://butikk.example", cashbackPercent: 4.8, cashbackType: "percentage",
    cashbackCurrency: null, active: true, customTerms: null, segments: [{ name: "Standard", cashbackValue: 4.8, cashbackType: "percentage", currency: null }],
    baseCashbackPercent: 4.8, campaignApplies: false, ...extra,
  });
  const fixed = (name: string, value: number) => ({ name, cashbackValue: value, cashbackType: "fixed", currency: "NOK" });
  // Shapes from the live API (2026-11-12).
  const partners = [
    partner({ name: "SkyShowtime", slug: "skyshowtime", websiteUrl: "https://www.skyshowtime.com/no", cashbackType: "fixed", cashbackCurrency: "NOK",
      cashbackPercent: 176, baseCashbackPercent: 176, segments: [fixed("Årsabonnement", 176), fixed("Månedsabonnement", 46.4)],
      customTerms: "Beløpet er en engangsbonus for å tegne et nytt abonnement. Er du kunde fra før, utløser ikke fornyelsen noen utbetaling." }),
    partner({ name: "Trøndermobil", slug: "trondermobil", websiteUrl: "https://trøndermobil.no", cashbackType: "fixed", cashbackCurrency: "NOK",
      cashbackPercent: 150, baseCashbackPercent: 150, segments: [fixed("Bonus", 300), fixed("10-20GB & Fri Data", 250), fixed("1-8 GB", 150)] }),
    partner({ name: "iHerb", slug: "iherb", websiteUrl: "https://iherb.prf.hn/click/camref:1011l5ngLD/pubref:392358-467324-[td_guid]/ar:[td_affiliate_id]" }),
    partner({ name: "NordVPN", slug: "nordvpn", websiteUrl: "https://go.nordvpn.net/aff_c?offer_id=417&aff_id=56052&url_id=10302" }),
    // The API's single segment (19 %) is not the partner value the base rate belongs to.
    partner({ name: "Uppababy", slug: "uppababy", websiteUrl: "https://uppababy.no", cashbackPercent: 4.8, baseCashbackPercent: 4, campaignApplies: true,
      segments: [{ name: "Øvrige kjøp", cashbackValue: 19, cashbackType: "percentage", currency: null }] }),
    partner({ name: "Nordhost - Hosting på norsk siden 1999", slug: "nordhost", websiteUrl: "https://nordhost.no", segments: [] }),
    partner({ name: "Barnas Bokverden - Tanum Bokklubber", slug: "barnas", websiteUrl: "https://barnasbokverden.no", cashbackType: "fixed",
      cashbackPercent: 163.2, baseCashbackPercent: 163.2, segments: [fixed("Lead", 163.2)] }),
    partner({ name: "DJI", slug: "dji", websiteUrl: "https://store.dji.com/no", cashbackPercent: 0, segments: [] }),
  ];
  const server = createServer((_request, response) => response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ success: true, data: { partners } })));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const { fetchSpareborsen } = await import("../src/backend/providers/spareborsen.js");
  const offers = await fetchSpareborsen({
    generatedAt: "2026-11-12T00:00:00.000Z", logger: { info() {}, warn() {}, error() {} },
    apiUrls: [`http://127.0.0.1:${address.port}/api/partners`], overrides: { nordvpn: ["nordvpn.com"] },
  });
  const byName = new Map(offers.map((offer) => [offer.merchantName, offer]));

  // Not just the partner-level 176/150 kr: the page shows "46,4 til 176 kr" and "150 til 300 kr".
  assert.equal(byName.get("SkyShowtime")?.reward, "46,4-176 kr");
  assert.equal(byName.get("SkyShowtime")?.terms,
    "176 kr – Årsabonnement\n46,4 kr – Månedsabonnement\n\nBeløpet er en engangsbonus for å tegne et nytt abonnement. Er du kunde fra før, utløser ikke fornyelsen noen utbetaling.");
  assert.equal(byName.get("Trøndermobil")?.reward, "150-300 kr");
  assert.equal(byName.get("Barnas Bokverden - Tanum Bokklubber")?.reward, "163,2 kr");

  // A tracking host is not the shop; an explicit override still wins.
  assert.deepEqual(byName.get("iHerb")?.domains, []);
  assert.deepEqual(byName.get("NordVPN")?.domains, ["nordvpn.com"]);

  assert.equal(byName.get("Uppababy")?.reward, "19 %");
  assert.equal(byName.get("Uppababy")?.terms, "Forhøyede kampanjesatser hos Sparebørsen. Kampanjen er tidsbegrenset.");

  assert.ok(byName.has("Nordhost"));
  assert.equal(byName.has("DJI"), false);
});
