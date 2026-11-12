import assert from "node:assert/strict";
import { test } from "node:test";
import { extractKnaReward } from "../src/backend/providers/kna.js";

// kna.no/wp-json/wp/v2/medlemsfordeler (wurth, hurtigruta-carglass; 2026-11-12)
test("KNA: an «opptil/inntil» maximum is kept instead of turning examples into a range", () => {
  assert.equal(
    extractKnaReward("KNA medlemmer får tilgang på produktspesifikke rabatter på opptil 45%.\nFor eksempel: Du kan få 31% på kappe- og slipeskiver, 30% på flere skrutrekkere og opp til 40% på diverse piper.", "all-percentages"),
    "opptil 45 %",
  );
  assert.equal(
    extractKnaReward("Du får også inntil 40% rabatt på frontruteskift dersom du må skifte rute uten forsikringsavtale.", undefined),
    "opptil 40 %",
  );
  assert.equal(extractKnaReward("Medlemmer av KNA får 20% på alt av racingtelt og tilbehør.", "all-percentages"), "20 %");
});
