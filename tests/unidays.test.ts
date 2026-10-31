import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchUnidays } from "../src/backend/providers/unidays.js";
import { calculateCashback } from "../src/shared/reward-calculation.js";

const generatedAt = "2026-10-31T12:00:00.000Z";
const logger = { info() {}, warn() {}, error() {} };

test("UNiDAYS student prices are totals, and offers without an amount stay unknown", async (t) => {
  // Live partner records (api.myunidays.com/partners, UD-Region NO, 2026-10-31), trimmed.
  const content = [
    { id: "apple", displayName: "Apple Music", defaultPerkSubdomain: "applemusic", isEnabled: true },
    { id: "ipsos", displayName: "Ipsos iSay", defaultPerkSubdomain: "ipsosisay", isEnabled: true },
    { id: "acer", displayName: "Acer", defaultPerkSubdomain: "acer", isEnabled: true },
  ];
  const partners = [
    { id: "apple", name: "Apple Music", description: "", benefits: [
      { id: "a", name: "Kun 65 kr/mnd og gratis Apple TV", type: "perk", url: "https://www.myunidays.com/perks/a" },
    ] },
    { id: "ipsos", name: "Ipsos iSay", description: "", benefits: [
      { id: "i", name: "Gi tilbakemeldinger. Få belønninger", type: "perk", url: "https://www.myunidays.com/perks/i" },
    ] },
    { id: "acer", name: "Acer", description: "", benefits: [
      { id: "c", name: "15% rabatt", type: "perk", url: "https://www.myunidays.com/perks/c" },
    ] },
  ];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    return new Response(JSON.stringify(url.includes("content.myunidays.com") ? content : { partners }));
  });

  const offers = await fetchUnidays({ generatedAt, logger });
  const byName = new Map(offers.map((offer) => [offer.merchantName, offer]));

  const appleMusic = byName.get("Apple Music");
  assert.equal(appleMusic?.reward, "65 kr totalsum");
  // The tooltip keeps the monthly unit and the extra from the source text.
  assert.match(appleMusic?.terms ?? "", /^Kun 65 kr\/mnd og gratis Apple TV\n/);
  // A price is not a discount: nothing is calculated from it.
  assert.equal(calculateCashback({ provider: "unidays", reward: appleMusic?.reward ?? "" }, 500), "");

  assert.equal(byName.get("Ipsos iSay")?.reward, "?");
  assert.equal(byName.get("Acer")?.reward, "15 %");
});
