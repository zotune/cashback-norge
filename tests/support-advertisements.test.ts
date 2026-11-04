import assert from "node:assert/strict";
import { test } from "node:test";
import { INSTABANK_AD, SUPPORT_LINKS } from "../src/shared/provider-data.js";
import { isInstabankAdActive, selectSupportAdvertisement } from "../src/shared/support-advertisements.js";

const november = new Date("2026-11-04T12:00:00Z");

test("Instabank gets 80 percent and every other support link remains reachable", () => {
  const picks = Array.from({ length: 1000 }, (_, i) => selectSupportAdvertisement((i + 0.5) / 1000, november));
  assert.equal(picks.filter(pick => pick === INSTABANK_AD).length, 800);
  assert.deepEqual(new Set(picks.filter(pick => pick !== INSTABANK_AD)), new Set(SUPPORT_LINKS));
  assert.equal(selectSupportAdvertisement(0.799999, november), INSTABANK_AD);
  assert.equal(selectSupportAdvertisement(0.8, november), SUPPORT_LINKS[0]);
  assert.equal(selectSupportAdvertisement(1, november), SUPPORT_LINKS.at(-1));
});

test("campaign expiry follows Oslo midnight", () => {
  assert.equal(isInstabankAdActive(new Date("2026-10-31T22:59:59Z")), false);
  assert.equal(isInstabankAdActive(new Date("2026-10-31T23:00:00Z")), true);
  const expired = new Date("2026-12-31T23:00:00Z");
  assert.equal(isInstabankAdActive(expired), false);
  for (const draw of [0, 0.5, 0.8, 0.99]) assert.notEqual(selectSupportAdvertisement(draw, expired), INSTABANK_AD);
});
