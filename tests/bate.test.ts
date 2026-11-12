import assert from "node:assert/strict";
import { test } from "node:test";
import { extractBateReward } from "../src/backend/providers/bate.js";

test("Bate: a free extra with a brokerage contract is not a free product; a stated value is used", () => {
  // bate.no/fordeler/meglerhuset-rele and /aktiv-eiendomsmegling-rogaland (2026-11-12)
  assert.equal(
    extractBateReward("Boligsalg på Haugalandet\nDu får gratis fotograf ved inngåelse av megleroppdrag på alle typer boliger (verdi 4 960 kr.)."),
    "4 960 kr",
  );
  assert.equal(
    extractBateReward("Rabatter ved boligsalg\ngratis fotograf og 1 time interiørveiledning\nDu får gratis fotograf og 1 time interiørveiledning ved inngåelse av megleroppdrag på alle typer boliger*."),
    "Medlemsfordel",
  );
  // A free item on its own stays the shared free standard.
  assert.equal(extractBateReward("Gratis inngang\nAlle medlemmer kommer gratis inn"), "0 kr totalsum");
});

test("Bate: a loan product named by its loan-to-value ratio is not a 55 % discount", () => {
  assert.equal(
    extractBateReward("Rogaland Sparebank\nbetingelsene for Bate-medlemmer er alltid bedre enn bankens ordinære betingelser\nBate Grønt boliglån\nBate boliglån 55 %"),
    "Medlemsfordel",
  );
});

test("Bate: every rate in a structured line counts, including the lower one of two", () => {
  assert.equal(
    extractBateReward("Dagspass:35 % rabatt på ordinær pris\nBateLodge:15 % rabatt i lavsesong, 10 % rabatt i høysesong"),
    "10-35 %",
  );
  assert.equal(
    extractBateReward("10 % rabatt på flytting til fastpris og timepris\n5 - 25 % rabatt på utvask fast-/ og timepris"),
    "5-25 %",
  );
});
