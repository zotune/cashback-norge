import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTerms } from "../src/backend/providers/revmatikerforbundet.js";

test("Revmatikerforbundet terms keep «kr.» amounts and bare rate lines", () => {
  const terms = buildTerms("Rabatt til NRF medlemmer: Inntil kr. 1000 for reiser til Albir.\n15 % på alle produkter i nettbutikken.");
  assert.match(terms, /Inntil kr\. 1000 for reiser til Albir\./);
  assert.match(terms, /15 % på alle produkter i nettbutikken\./);
  assert.doesNotMatch(buildTerms("Bruk rabattkoden NRF15 i kassen."), /NRF15/);
});
