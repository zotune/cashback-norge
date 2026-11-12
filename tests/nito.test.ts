import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanTableLabel, extractNitoReward, extractStrictTableReward } from "../src/backend/providers/nito.js";

test("NITO keeps opptil and labels a discount without a rate", () => {
  assert.equal(extractNitoReward("Dette får du?\nOpptil 18% rabatt\nved leie av bil i Norge\nOpptil 15% rabatt"), "opptil 15-18 %");
  assert.equal(extractNitoReward("Dette får du\nRabatt på hotellovernatting"), "Rabatt");
  assert.equal(extractNitoReward("Dette får du:\nGratis heiskort\nfor to personer"), "0 kr totalsum");
});

test("NITO table cells may qualify the rate; financing terms are not a rate", () => {
  assert.equal(extractStrictTableReward("2 % på veil. pris"), "2 %");
  assert.equal(extractStrictTableReward("2 % i tillegg på eksisterende kampanje"), "2 %");
  assert.equal(extractStrictTableReward("7,5 %"), "7,5 %");
  assert.equal(extractStrictTableReward("Rabatt gjelder ikke"), undefined);
  assert.equal(cleanTableLabel("Kampanje på #5 (2,99% rente eller prisavslag)"), "Kampanje på #5");
});
