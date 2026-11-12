import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTerms, extractKnbfReward } from "../src/backend/providers/knbf.js";

test("KNBF prefers the member price over the issue included with membership", () => {
  const text = [
    "Som kollektivt eller personlig medlem vil du få Båtens Verden hjem i postkassen 1 ggr/år gratis, samt resterende utgaver tilsendt digitalt.",
    "For kun kr 290,- kan du få alle seks utgaver tilsendt hjem på døra (ordinær pris kr 490,-).",
  ].join("\n");
  assert.equal(extractKnbfReward(text), "290 kr totalsum");
  // A free service without a price stays free.
  assert.equal(extractKnbfReward("KNBF tilbyr inntil 1 times gratis juridisk førstehjelp fra Båtadvokaten."), "0 kr totalsum");
});

test("KNBF terms keep abbreviations and bare rate lines whole", () => {
  const terms = buildTerms([
    "Nå kan du få rabatt på kursene D5L og D5LA med henholdsvis kr. 6.000,- og kr. 1.500,- basert på gjeldende pris.",
    "• 10% på alt i nettbutikk",
    "kr. 19,- (inkl. MVA) per måned. Veiledende pris er kr. 29,-",
  ].join("\n"));
  assert.match(terms, /henholdsvis kr\. 6\.000,- og kr\. 1\.500,-/);
  assert.match(terms, /10% på alt i nettbutikk/);
  assert.match(terms, /kr\. 19,- \(inkl\. MVA\) per måned\./);
});
