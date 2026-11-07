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

test("the footer reuses dated card benefits and rebate limits, never inventing benefits without source data", async () => {
  const { getSupportAdvertisementTooltipParts } = await import("../src/shared/support-advertisements.js");
  const base = {
    provider: "instabank", merchantName: "Instabank", domains: [], reward: "3 %",
    sourceUrl: "https://instabank.no/kredittkort/rabatter", activationUrl: "https://instabank.no/kredittkort",
    updatedAt: "2026-11-04T12:00:00Z", terms: "Maks rabatt pr måned er kr 500\nMaks rabatt pr år er kr 3 000",
  };
  const offers = [
    { ...base, cardBenefit: { kind: "monthly" as const, category: "netthandel", validFrom: "2026-11-01", validUntil: "2026-11-30" } },
    { ...base, cardBenefit: { kind: "monthly" as const, category: "alle kjøp", validFrom: "2026-12-01", validUntil: "2026-12-31" } },
    { ...base, reward: "5 %", cardBenefit: { kind: "ongoing" as const, category: "kollektivtransport og elbillading" } },
  ];
  const text = getSupportAdvertisementTooltipParts(INSTABANK_AD, offers, november).join("\n");
  for (const detail of [/November: 3 %/, /Desember: 3 %/, /Alltid: 5 %/, /500/, /3\u00a0000/, /Ingen rentefri periode/, /22,85/]) assert.match(text, detail);
  const fallback = getSupportAdvertisementTooltipParts(INSTABANK_AD, [], november).join("\n");
  assert.doesNotMatch(fallback, /\b5 %/);
  assert.deepEqual(getSupportAdvertisementTooltipParts(SUPPORT_LINKS[0]!, offers, november), [SUPPORT_LINKS[0]!.detail]);
});
