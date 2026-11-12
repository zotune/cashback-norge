import assert from "node:assert/strict";
import { test } from "node:test";
import { benefitTerms, discountCodeFromText, parseBenefitListPage, rewardFromText } from "../src/backend/benefit-list-page.js";

test("list-page rewards keep opptil and do not read club ticket prices as 50 %", () => {
  assert.equal(rewardFromText("Thon Hotels Inntil 18 % rabatt på overnatting, ledsager bor gratis."), "opptil 18 %");
  assert.equal(
    rewardFromText("Som medlem i RS får du nå et helt års medlemskap i Kinoklubben til kun 125 kr (ordinær pris 179 kr)! Gled deg til mange gode filmer på kino til HALV PRIS!"),
    "Medlemspris",
  );
  assert.equal(rewardFromText("PlussMobil gir halv pris på mobilabonnementer for RS-medlemmer"), "50 %");
  assert.equal(rewardFromText("Kroner 1000 i avslag på kjøp av sykkel."), "1 000 kr");
});

test("list-page codes and terms come from the offer block", () => {
  assert.equal(discountCodeFromText("Legg inn rabattkoden RSMEDLEM eller gå via knappen under."), "RSMEDLEM");
  assert.equal(discountCodeFromText("Alltid 17 % rabatt. Avtalekode: D000004481"), "D000004481");
  assert.equal(discountCodeFromText("Bruk rabattkoden i kassen."), undefined);
  assert.equal(benefitTerms("", "Krever medlemskap."), "Krever medlemskap.");
  const long = `${"Første setning er her. ".repeat(30)}Slutt`;
  const terms = benefitTerms(long, "Krever medlemskap.");
  assert.ok(terms.length < long.length);
  assert.match(terms, /\.\nKrever medlemskap\.$/);
});

test("parseBenefitListPage carries the block code", () => {
  const html = `<div class="card"><p>10 % rabatt på Filmweb Kinogavekort. Legg inn rabattkoden RSMEDLEM.</p><a href="https://kinogavekort.no/">Bestill her</a></div>`;
  const [offer] = parseBenefitListPage(html, /rs\.no$/, { kind: "divClass", className: "card" });
  assert.equal(offer?.reward, "10 %");
  assert.equal(offer?.discountCode, "RSMEDLEM");
  assert.equal(offer?.domain, "kinogavekort.no");
});
