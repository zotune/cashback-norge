import assert from "node:assert/strict";
import { test } from "node:test";
import { extractHuseierneReward } from "../src/backend/providers/huseierne.js";

// huseierne.no member discounts (Krisesikker.no, 2026-11-12)
test("Huseierne: an «opptil» amount keeps the qualifier; fixed rates stay as they are", () => {
  assert.equal(
    extractHuseierneReward("Krisesikker.no\nSom medlem i Huseierne får du opptil 800 kr rabatt på komplett beredskapspakke."),
    "opptil 800 kr",
  );
  assert.equal(extractHuseierneReward("20 % rabatt hos Canadian Outdoor\nSom medlem får du 20 % rabatt på varer."), "20 %");
});
