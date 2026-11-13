import assert from "node:assert/strict";
import { test } from "node:test";
import { extractElkjopReward } from "../src/backend/providers/elkjop.js";

// Card texts from elkjop.no/kundeklubb/partner-tilbud (2026-11-12).
test("Elkjøp partner cards: «Spar opptil» keeps the maximum as up-to; percentages and free periods unchanged", () => {
  assert.equal(extractElkjopReward("Spar opptil 1269- fra Hello Fresh\nSpar opptil 1299,- + gratis snacks i 4 måneder!"), "opptil 1 299 kr");
  assert.equal(extractElkjopReward("45 dager BookBeat Basic gratis, deretter -10% på månedspris!"), "10 %");
  assert.equal(extractElkjopReward("20% på Björn Borg\n20% avslag på bjornborg.com/no. Gjelder bare ordinære priser."), "20 %");
  assert.equal(extractElkjopReward("6 uker Fabel gratis\nMed Fabel får du ubegrenset strømming."), "6 uker gratis");
  assert.equal(extractElkjopReward("3 måneder Viaplay for prisen av 1\nGjelder for nye Viaplay-kunder."), "2 måneder gratis");
});
