import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDomainLookup, lookupDomains } from "../src/backend/domain-lookup.js";
import { isAffiliateTrackingUrl, isNonMerchantHost } from "../src/backend/merchant-domains.js";

const offer = (merchantName: string, domains: string[]) => ({
  provider: "elbilforeningen", merchantName, domains, reward: "10 %",
  sourceUrl: "https://x", activationUrl: "https://x", terms: "", updatedAt: "2026-11-13T00:00:00.000Z",
}) as const;

test("tracking redirects and webmail hosts never spread through the name lookup", () => {
  const lookup = buildDomainLookup([
    offer("Storytel", ["outlook.com", "storytel.com"]),
    offer("Beckmann", ["c.trackmytarget.com"]),
    offer("Barcelo", ["ad.doubleclick.net"]),
  ]);
  assert.deepEqual(lookupDomains(lookup, "Storytel"), ["storytel.com"]);
  assert.deepEqual(lookupDomains(lookup, "Beckmann"), []);
  assert.deepEqual(lookupDomains(lookup, "Barcelo"), []);
  for (const host of ["arket.prf.hn", "go.adt291.com", "adt284.net", "imp.i222351.net", "hotmail.com"]) {
    assert.equal(isNonMerchantHost(host), true, host);
  }
  for (const host of ["storytel.com", "arket.com", "nordvpn.com"]) assert.equal(isNonMerchantHost(host), false, host);
  assert.equal(isAffiliateTrackingUrl(new URL("https://go.nordvpn.net/aff_c?offer_id=15&aff_id=1")), true);
});
