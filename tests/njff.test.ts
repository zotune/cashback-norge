import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTerms } from "../src/backend/providers/njff.js";

test("NJFF terms leave out the article byline and keep «kr.» amounts whole", () => {
  const terms = buildTerms([
    "Publisert: 15. juli 2025 kl. 11.28 Sist oppdatert: 28. juli 2026 kl. 09.34 TEKST NJFF DEL Molteberg Nilsen tilbyr følgende tjenester for NJFFs medlemmer: - 15% rabatt på alle advokattjenester.",
    "Ordinær pris er kr. 6479. Som medlem får du medlemspris.",
  ].join("\n"));
  assert.doesNotMatch(terms, /Publisert|TEKST|DEL/);
  assert.match(terms, /^Molteberg Nilsen tilbyr/);
  assert.match(terms, /Ordinær pris er kr\. 6479\./);
});
