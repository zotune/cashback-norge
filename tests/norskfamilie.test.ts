import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTerms } from "../src/backend/providers/norskfamilie.js";

test("Norskfamilie terms carry rate statements and exclusions, not product copy or buttons", () => {
  const terms = buildTerms([
    "Bemz tilbyr over 100 farger, inkludert 100 % bomull og ren lin.",
    "Mellom 7% og 12%.",
    "Vi gjør oppmerksom på at du ikke får penger tilbake for moms, frakt eller øvrige håndteringskostnader.",
    "5% tilbake",
    "Gå til butikk",
    "Logg inn for å få penger tilbake når du handler på nett",
  ]);
  assert.equal(terms, [
    "Mellom 7% og 12%.",
    "Vi gjør oppmerksom på at du ikke får penger tilbake for moms, frakt eller øvrige håndteringskostnader.",
    "5% tilbake",
  ].join("\n"));
});
