import assert from "node:assert/strict";
import { test } from "node:test";
import { extractSasPartnerTerms } from "../src/backend/providers/sas.js";

// Descriptions from the loyaltykey SAS shops API (2026-11-13).
test("SAS: partner earning rules after «Vilkår for denne partneren»/«Vennligst merk» become terms; marketing text does not", () => {
  assert.equal(
    extractSasPartnerTerms("<div>Agoda er en reiseplattform.</div><div><strong>Vilkår for denne partneren</strong></div><div>Du tjener kun poeng på hoteller, rom og opphold booket via nettsiden. Du kan ikke tjene poeng på bestillinger gjennom appen deres.</div>"),
    "Du tjener kun poeng på hoteller, rom og opphold booket via nettsiden. Du kan ikke tjene poeng på bestillinger gjennom appen deres.",
  );
  assert.equal(
    extractSasPartnerTerms("<p>Vennligst merk&nbsp;: Du kan ikke tjene poeng n&aring;r du kj&oslash;per dekk.</p>"),
    "Du kan ikke tjene poeng når du kjøper dekk.",
  );
  assert.equal(extractSasPartnerTerms("<div>Aarke er et svensk designmerke.</div>"), "");
  assert.equal(extractSasPartnerTerms(null), "");

  const long = extractSasPartnerTerms(`Vilkår for denne partneren ${"Du tjener poeng på kjøp. ".repeat(40)}`);
  assert.ok(long.length <= 500 && long.endsWith("kjøp."));
});
