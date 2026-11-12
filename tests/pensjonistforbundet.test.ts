import assert from "node:assert/strict";
import { test } from "node:test";
import { extractPublicReward } from "../src/backend/providers/pensjonistforbundet.js";

test("Pensjonistforbundet: a cheap Kinoklubben membership is not a 50 % discount", () => {
  assert.equal(
    extractPublicReward(
      "Se film til halv pris på de fleste kinoer i Norge",
      "Meld deg inn i Kinoklubben til lav medlemspris, og få 50 % rabatt på kinobilletter på 12 utvalgte filmer i året.",
      "Filmweb Kinoklubb gir alle medlemmer årsmedlemskap i Kinoklubben til kun 75 kroner for ett år !",
    ),
    "Medlemspris",
  );
  assert.equal(extractPublicReward("45 % rabatt hos Fasadeprodukter", "45 % rabatt på all solskjerming."), "45 %");
});
