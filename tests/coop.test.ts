import assert from "node:assert/strict";
import { test } from "node:test";
import { extractCoopDiscountCode, isCoopRewardStated } from "../src/backend/providers/coop.js";

// Texts from coop.no/medlem/fordeler (2026-11-13).
test("Coop: a maintained reward stays only while the page still states its amounts", () => {
  assert.equal(isCoopRewardStated("50 kr", "Vintersalg – 100 kr ekstra rabatt per natt*\nTilbudet gjelder opphold på minst to netter."), false);
  assert.equal(isCoopRewardStated("600 kr", "Som Coop-medlem får du alltid minst 600 kr i rabatt hos Ving."), true);
  assert.equal(isCoopRewardStated("0,25-0,45 kr/l", "45 øre bonus per liter på betjente stasjoner og 25 øre på ubetjente."), true);
  assert.equal(isCoopRewardStated("0,25-0,45 kr/l", "Alltid 45 øre bonus per liter drivstoff hos Circle K!"), false);
  assert.equal(isCoopRewardStated("50-100 kr totalsum", "kampbilletter til maks 100 kr (voksen) og 50kr (barn)"), true);
});

test("Coop: a promo code written on the page becomes the discount code; a login hint does not", () => {
  assert.equal(extractCoopDiscountCode("For å utløse rabatten må du skrive inn promo-kode ved bestilling. Bruk promokode «coopmedlem» ved bestilling."), "coopmedlem");
  assert.equal(extractCoopDiscountCode("Logg inn og se rabattkode"), undefined);
});
