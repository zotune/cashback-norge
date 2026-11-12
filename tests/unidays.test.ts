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
  // A monthly subscription price, not a one-off total or a discount.
  assert.equal(appleMusic?.reward, "65 kr/mnd");
  assert.deepEqual(appleMusic?.promotion, { label: "65 kr/mnd", priceNok: 65 });
  // The tooltip keeps the monthly unit and the extra from the source text.
  assert.match(appleMusic?.terms ?? "", /^Kun 65 kr\/mnd og gratis Apple TV\n/);
  // A price is not a discount: nothing is calculated from it.
  assert.equal(calculateCashback({ provider: "unidays", reward: appleMusic?.reward ?? "", promotion: appleMusic?.promotion }, 500), "");

  assert.equal(byName.get("Ipsos iSay")?.reward, "?");
  assert.equal(byName.get("Acer")?.reward, "15 %");
});

test("all perks of a partner form one offer that keeps maxima, extras and minimum orders", async (t) => {
  // Live perks (api.myunidays.com/partners, UD-Region NO, 2026-11-12).
  const perks: Record<string, string[]> = {
    acer: ["15% rabatt", "5 % ekstra rabatt på nedsatt pris"],
    mangooutlet: ["Opp til 80% rabatt + 5% ekstra"],
    qatarairways: ["Fly til MotoGP™ & spar opptil 10%*", "Fly til Formula 1® & spar opptil 12%*", "Opptil 10 % rabatt på flyreiser"],
    temu: ["30% rabatt for bestillinger NOK 429+, begrenset til NOK 275, Kun nye brukere"],
    hellofresh: ["opptil 1200 kr rabatt på de første 4 boksene", "Spar 35% på første boks "],
    airalo: ["15% rabatt på det første eSIM-et", "10% rabatt på ditt neste eSIM fra Airalo"],
  };
  const content = Object.keys(perks).map((slug) => ({ id: slug, displayName: slug, defaultPerkSubdomain: slug, isEnabled: true }));
  const partners = Object.entries(perks).map(([slug, names]) => ({ id: slug, name: slug, description: "",
    benefits: names.map((name, i) => ({ id: `${slug}${i}`, name, type: "perk", url: `https://www.myunidays.com/perks/${slug}${i}` })) }));
  t.mock.method(globalThis, "fetch", async (url: string) =>
    new Response(JSON.stringify(url.includes("content.myunidays.com") ? content : { partners })));
  const offers = await fetchUnidays({ generatedAt, logger });
  const byName = new Map(offers.map((offer) => [offer.merchantName, offer]));
  assert.equal(offers.length, 6);
  assert.equal(byName.get("acer")?.reward, "5-15 %");
  assert.match(byName.get("acer")!.terms, /^15% rabatt\n5 % ekstra rabatt på nedsatt pris\n/);
  // The outlet's own sale is not the student discount.
  assert.equal(byName.get("mangooutlet")?.reward, "5 %");
  assert.equal(byName.get("qatarairways")?.reward, "opptil 10-12 %");
  assert.equal(byName.get("temu")?.reward, "30 %");
  assert.deepEqual(byName.get("temu")?.rewardCalculation, { minimumPurchaseNok: 429 });
  assert.equal(calculateCashback(byName.get("temu")!, 400), "");
  assert.equal(byName.get("hellofresh")?.reward, "35 %");
  assert.equal(byName.get("hellofresh")?.activationUrl, "https://www.myunidays.com/perks/hellofresh1");
  assert.match(byName.get("hellofresh")!.terms, /opptil 1200 kr rabatt/);
  assert.deepEqual(byName.get("airalo")?.domains, ["airalo.com"]);
});
