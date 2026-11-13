import assert from "node:assert/strict";
import { test } from "node:test";
import { extractTobbReward } from "../src/backend/providers/tobb.js";

// tobb.no/fordeler/<slug> (2026-11-12)
test("TOBB: a discount in kroner is not a price paid, also with thousand separators or a TOBB prefix", () => {
  assert.equal(
    extractTobbReward("Rabatt for medlmmer\nKr 10.000,- i rabatt på vederlaget uansett boligtype*"),
    "10 000 kr",
  );
  assert.equal(extractTobbReward("Rabatt for medlemmer\nKr 25 i TOBB-rabatt pr. billett*"), "25 kr");
  assert.equal(
    extractTobbReward("Som TOBB-medlem får du kr 11 i bonus hver måned når du har strømavtale hos TrøndelagKraft.\nBestilling av Strømsmart gir 4kr ekstra i TOBB-bonus hver måned."),
    "11 kr",
  );
});

test("TOBB: every stated rate counts, a registration tier does not, and 2 for 1 is recognised", () => {
  assert.equal(extractTobbReward("10 - 20% TOBB-rabatt\n10 - 20% rabatt på materiell"), "10-20 %");
  assert.equal(extractTobbReward("5 % bonus og 10 % rabatt!"), "5-10 %");
  assert.equal(
    extractTobbReward("20% Anton Sport-bonus* på alle ordinære priser.\nNB! Under Min profil i Anton Club vil det framkomme at du er på 10 % bonus-nivå når du registrerer deg."),
    "20 %",
  );
  assert.equal(extractTobbReward("2 for 1\n2 billetter for prisen av 1\nGjelder på hjemmekamper."), "2 for 1");
});
