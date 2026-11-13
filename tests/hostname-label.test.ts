import assert from "node:assert/strict";
import { test } from "node:test";
import { decodePunycode, hostnameDisplayLabel, toUnicodeHostname } from "../src/shared/hostname-label.js";

test("punycode hosts are shown with their Norwegian letters", () => {
  assert.equal(toUnicodeHostname("xn--trndermobil-hgb.no"), "trøndermobil.no");
  assert.equal(toUnicodeHostname("www.xn--strmpris-74a.no"), "www.strømpris.no");
  assert.equal(toUnicodeHostname("xn--smungene-b0a.no"), "småungene.no");
  assert.equal(hostnameDisplayLabel("xn--trndermobil-hgb.no"), "Trøndermobil");
  assert.equal(hostnameDisplayLabel("www.elkjop.no"), "Elkjop");
  // Round trip against the platform encoder.
  for (const name of ["blåbær.no", "ærlig.no", "jølstad.no", "münchen.de"]) {
    assert.equal(toUnicodeHostname(new URL(`https://${name}`).hostname), name);
  }
});

test("malformed punycode stays as it was instead of becoming garbage", () => {
  assert.equal(decodePunycode("!!"), undefined);
  assert.equal(toUnicodeHostname("xn--!!.no"), "xn--!!.no");
});
