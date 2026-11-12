import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTerms, cleanMerchantName, selectMerchantDomains } from "../src/backend/providers/horselsforbundet.js";

test("Hørselsforbundet merchant names and domains come from the merchant, not the headline", () => {
  assert.equal(cleanMerchantName("Smartbriller som tekster samtalen – rabatt hos Optiker G Krogh"), "Optiker G Krogh");
  assert.equal(cleanMerchantName("Vindux: 40 % på vinduer og dører"), "Vindux");
  assert.equal(cleanMerchantName("Brilleland"), "Brilleland");
  assert.deepEqual(
    selectMerchantDomains(["evenrealities.com", "optikergkrogh.no"], "Optiker G Krogh", "smartbriller-optiker-g-krogh"),
    ["optikergkrogh.no"],
  );
  assert.deepEqual(selectMerchantDomains(["tryg.no"], "Tryg", "tryg"), ["tryg.no"]);
});

test("Hørselsforbundet terms do not split at «nr.»", () => {
  const terms = buildTerms("10 % rabatt på kontaktlinser. 50 % rabatt på brille nr. 2 de første 30 dagene.");
  assert.match(terms, /50 % rabatt på brille nr\. 2 de første 30 dagene\./);
});
