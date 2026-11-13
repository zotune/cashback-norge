import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractBenefitReward,
  extractExplicitTotalPriceReward,
  extractUpToPercentageReward,
} from "../src/shared/reward.js";
import { calculateCashback, getMaxRewardPercent } from "../src/shared/reward-calculation.js";

// Live Pensjonistforbundet entry (2026-10-31): summary + ingress + content.
const legal24 = [
  "Rabatt på advokattjenester.",
  "Vi har inngått ny avtale om juridiske tjenester med Legal24 advokatfirma.",
  "### Medlemstilbud",
  "__Juridisk bistand__",
  "- Første 30 minutters samtale med advokat/fullmektig er gratis",
  "- Deretter timespris kroner 2.019,- inkludert mva.",
  "__Tilgang til digitale kontrakter/»selvbetjening» til fastpris__",
  "- Fremtidsfullmakt, kroner 1.599,-",
].join("\n");

// Live LOfavør page text (2026-10-31).
const legalis = [
  "Spar tid og penger med digitale kontrakter",
  "Første samtale på telefon er gratis",
  "Du får rabatt på en rekke digitale kontrakter gjennom Advokatfirmaet Legalis.",
  "- Enkle spørsmål besvares gratis",
  "- Du kan nå kontakte advokat i Legalis gratis via Chat",
].join("\n");

test("an unquantified discount is not shown as a free purchase because of incidental free extras", () => {
  assert.equal(extractBenefitReward(legal24), "Rabatt");
  assert.equal(extractBenefitReward(legalis), "Rabatt");
  // Vestbo card: the free inspection is an extra to a discounted purchase.
  assert.equal(extractBenefitReward("GRATIS befaring og Vestbo-rabatt"), "Rabatt");
});

test("a stated amount still wins over a free extra, and genuinely free items stay 0 kr totalsum", () => {
  assert.equal(extractBenefitReward("Første samtale er gratis. 20 % rabatt på timepris."), "20 %");
  assert.equal(extractBenefitReward("Du får 500 kr i rabatt. Gratis frakt."), "500 kr");
  // Free items keep the shared "0 kr totalsum" standard.
  assert.equal(extractBenefitReward("Gratis inngang"), "0 kr totalsum");
  assert.equal(extractBenefitReward("Som medlem i Syklistforeningen får du gratis sykkelsjekk hos Neptun Sport."), "0 kr totalsum");
  assert.equal(
    extractBenefitReward("Som medlem i NRF får du gratis medlemsskap på ambera.com/bli-medlem (verdi 1000 kr)."),
    "0 kr totalsum",
  );
  // Live Huseierne page: the benefit is free; plural "rabatter" comes from
  // navigation and cross-selling on the same page, not from this benefit.
  assert.equal(extractBenefitReward([
    "Rabatter",
    "Gratis depositumskonto i Storebrand Bank",
    "Som medlem av Huseierne kan du opprette en depositumskonto i Storebrand Bank helt gratis.",
    "Som medlem i Huseierne får du mange gode rabatter og avtaler på byggevarer.",
    "Gode rabatter på forsikring hos Storebrand",
  ].join("\n")), "0 kr totalsum");
});

test("an «opptil» qualifier attached to the percentage is kept", () => {
  assert.equal(
    extractUpToPercentageReward("Hver SAS-flyvning har en Young-rabatt på opptil 70 % av ordinær pris."),
    "opptil 70 %",
  );
  assert.equal(extractUpToPercentageReward("OPPTIL -30%"), "opptil 30 %");
  assert.equal(extractUpToPercentageReward("Spar opp til 40 % + 10 % ekstra"), "opptil 10-40 %");
  assert.equal(extractUpToPercentageReward("Rabatt på inntil 15 prosent"), "opptil 15 %");
  // "opptil" that qualifies something else does not make the rate a maximum.
  assert.equal(extractUpToPercentageReward("Gjelder opptil 4 personer. 20 % rabatt."), "20 %");
  assert.equal(extractUpToPercentageReward("20 % rabatt"), "20 %");
  assert.equal(extractUpToPercentageReward("Ingen prosent her"), "");

  // Clients rank the maximum but never calculate it as a guaranteed reward.
  const offer = { provider: "utdanningibergen", reward: "opptil 70 %" };
  assert.equal(getMaxRewardPercent(offer), 70);
  assert.equal(calculateCashback(offer, 1000), "");
});

test("explicit student and monthly prices are totals; hourly rates and ordinary prices are not", () => {
  assert.equal(extractExplicitTotalPriceReward("Kiropraktor første gang: Normalpris: 680,- Studentpris: 580,-"), "580 kr totalsum");
  assert.equal(extractExplicitTotalPriceReward("Studentpris kr. 295,-"), "295 kr totalsum");
  assert.equal(extractExplicitTotalPriceReward("16:00: 395,- (studentpris kr. 295,-/timen)"), "");
  assert.equal(extractExplicitTotalPriceReward("Studentpris 400 kr per time"), "");
  assert.equal(extractExplicitTotalPriceReward("Kun 65 kr/mnd og gratis Apple TV"), "65 kr totalsum");
  assert.equal(extractExplicitTotalPriceReward("Bare 99 kr per måned"), "99 kr totalsum");
  // "kun" without a monthly unit is not a recognised total here.
  assert.equal(extractExplicitTotalPriceReward("Kun 65 kr"), "");
  assert.equal(extractExplicitTotalPriceReward("Ordinær medlemspris 500 kr"), "");
});

test("audit 2026-11: shared reward parsing regressions found across providers", async () => {
  const { extractKrReward, extractOreLitreReward, extractPercentageReward, relevantBenefitRewardText } = await import("../src/shared/reward.js");
  // "på" after a percentage: JS \b is ASCII-only, so "å" never ended the word.
  assert.equal(relevantBenefitRewardText("10 % på Ekornes"), "10 % på Ekornes");
  assert.equal(extractBenefitReward("20 % på timepris inntil saken er løst."), "20 %");
  // An explicit discount beats a "halv pris" headline elsewhere in the text.
  assert.equal(extractBenefitReward("Se gode filmer på kino til halv pris! Som medlem får du 40 % rabatt på medlemskapet."), "40 %");
  assert.equal(extractBenefitReward("Halv pris på TU og Digi"), "50 %");
  // Footnote asterisk after øre.
  assert.equal(extractOreLitreReward("52 øre* per liter på drivstoff"), "0,52 kr/l");
  // "til kun N kr (ordinær pris M kr)" is the price paid.
  assert.equal(extractExplicitTotalPriceReward("Medlemskap i Kinoklubb til kun 125 kr (ordinær pris 179 kr)"), "125 kr totalsum");
  // A list dash on the next line or a date range is no percentage range.
  assert.equal(extractBenefitReward("- 10 % rabatt i perioden 29.06–09.08\n\n- 20 % rabatt resten av året"), "10-20 %");
  // Thousands separator "10.000" does not end the clause; a discount stays a discount.
  assert.equal(extractKrReward("Kr 10.000,- i rabatt på vederlaget"), "10 000 kr");
  // URL escapes are not percentages.
  assert.equal(extractPercentageReward("Les mer https://x.safelinks.protection.outlook.com/?data=05%7C02%7C0%7C1 og få 15 % rabatt"), "15 %");
  // "mellom 10 og 25 prosent" is a range.
  assert.equal(extractPercentageReward("Du får mellom 10 og 25 prosent rabatt"), "10-25 %");
});

test("a price paid ranks below a discount, the cheaper price first, and compact labels keep units", async () => {
  const { uniqueOffers } = await import("../src/shared/cashback.js");
  const { formatCompactRewardLabel } = await import("../src/shared/reward-calculation.js");
  const base = { provider: "utdanningibergen", merchantName: "Bergen Kino", domains: ["bergenkino.no"], sourceUrl: "https://x", activationUrl: "https://x", terms: "", updatedAt: "2026-11-13T00:00:00.000Z" } as const;
  assert.equal(uniqueOffers([{ ...base, reward: "120 kr totalsum" }, { ...base, reward: "20 kr" }])[0]?.reward, "20 kr");
  assert.equal(uniqueOffers([{ ...base, reward: "120 kr totalsum" }, { ...base, reward: "90 kr totalsum" }])[0]?.reward, "90 kr totalsum");
  assert.equal(formatCompactRewardLabel({ provider: "knbf", reward: "19 kr/mnd" }), "19 kr/mnd");
  assert.equal(formatCompactRewardLabel({ provider: "utdanningibergen", reward: "Fra 399 kr totalsum" }), "Fra 399 kr totalsum");
  assert.equal(formatCompactRewardLabel({ provider: "studenttorget", reward: "45 kr totalsum" }), "45 kr totalsum");
  assert.equal(formatCompactRewardLabel({ provider: "akks", reward: "170 kr/time" }), "170 kr/time");
});

test("rates keep two decimals and co.no is a public suffix", async () => {
  const { formatRewardNumber, extractPercentageReward } = await import("../src/shared/reward.js");
  const { toBaseDomain } = await import("../src/shared/cashback.js");
  assert.equal(formatRewardNumber(3.75), "3,75");
  assert.equal(formatRewardNumber(2.5), "2,5");
  assert.equal(extractPercentageReward("0,75 % cashback"), "0,75 %");
  assert.equal(toBaseDomain("autodoc.co.no"), "autodoc.co.no");
  assert.equal(toBaseDomain("www.autodoc.co.no"), "autodoc.co.no");
});
