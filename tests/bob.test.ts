import assert from "node:assert/strict";
import { test } from "node:test";
import { extractBobReward } from "../src/backend/providers/bob.js";

test("BOB: a lowest-price guarantee with a free inspection is a member price, not a free product", () => {
  // bob.no/medlem-og-beboer/medlemsfordeler/ (Fasadeprodukter, 2026-11-12)
  assert.equal(
    extractBobReward("Fasadeprodukter\nSom BOB-medlem er du alltid garantert laveste pris på innvendig og utvendig solskjerming, gardinlengder, garasjeporter, pergola og tilbehør hos Fasadeprodukter. Du får også gratis befaring."),
    "Medlemspris",
  );
});

test("BOB: free entry stays free, two-for-one stays a two-for-one and percentages win", () => {
  assert.equal(
    extractBobReward("Førde Volleyball\nAlle BOB-medlemmer kommer gratis inn på Førde Volleyball sine hjemmekamper i Øyrane Arena."),
    "0 kr totalsum",
  );
  assert.equal(
    extractBobReward("Førde IL\nSom BOB-medlem kan du kjøpe to billetter til prisen av én på alle Førde IL sine hjemmekamper"),
    "2 for 1",
  );
  assert.equal(
    extractBobReward("Advokattjenester\nFå gratis og uforpliktende vurdering i inntil 30 minutter, og 15 prosent rabatt på gjeldende timesatser."),
    "15 %",
  );
});
