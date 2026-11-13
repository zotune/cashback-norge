import assert from "node:assert/strict";
import { test } from "node:test";
import { stripHtml } from "../src/shared/cashback.js";
import { extractBenefitReward } from "../src/shared/reward.js";
import { readMainContent, withUpToQualifier } from "../src/backend/providers/lofavor.js";

const url = "https://www.lofavor.no/ferie-og-opplevelser/s%C3%B8rmarka-konferansehotell";

test("LO Favør ignores teaser cards for other benefits and the page chrome", () => {
  const page = `<html><body><header><a href="https://www.lofavor.no/ferie-og-fritid/legoland">LEGOLAND 20 % rabatt</a></header>
    <section class="page-intro"><h1>Sørmarka konferansehotell</h1><p>Som medlem får du gode priser på overnatting.</p>
    <a href="https://www.sormarka.no/">Bestill</a></section>
    <section class="cards"><article><a href="/ferie-og-opplevelser/leiebil"><h2>Leiebil</h2>
      <p>Som medlem får du alltid 10 % i rabatt på leiebil fra Hertz.</p></a></article>
    <article><a href="${url}"><p>Denne fordelen</p></a></article></section>
    <script>var partnerMap = {"hertz.no": "Hertz"}</script></body><footer>15 % rabatt</footer></html>`;
  const main = readMainContent(page, url);
  const text = stripHtml(main);
  assert.doesNotMatch(text, /Hertz|LEGOLAND|15 %/);
  assert.match(text, /Denne fordelen/);
  assert.equal(extractBenefitReward(text), "");
  assert.match(main, /sormarka\.no/);
});

test("rates that are all maxima keep «opptil»", () => {
  const scandic = "Opptil 14 % rabatt på hotellrom\nOpptil 25 % rabatt for deg som er under 25 år";
  assert.equal(withUpToQualifier(extractBenefitReward(scandic), scandic), "opptil 14-25 %");
  const hertz = "Som medlem får du alltid 10 % i rabatt\n15 % rabatt på leiebil i høst";
  assert.equal(withUpToQualifier(extractBenefitReward(hertz), hertz), "10-15 %");
});
