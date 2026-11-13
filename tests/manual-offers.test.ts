import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readManualOffers } from "../src/backend/manual-offers.js";

test("a manual offer older than 14 days no longer hides the live offer", async () => {
  const offer = {
    provider: "klarna", merchantName: "Farmasiet", domains: ["farmasiet.no"], reward: "4 %",
    sourceUrl: "https://www.klarna.com/no/store/", activationUrl: "https://www.klarna.com/no/store/", terms: "",
  };
  const dir = await mkdtemp(join(tmpdir(), "manual-offers-"));
  const file = join(dir, "manual.json");
  await writeFile(file, JSON.stringify([
    { ...offer, updatedAt: "2026-05-01T00:00:00.000Z" },
    { ...offer, merchantName: "Fresh", updatedAt: "2026-11-10T00:00:00.000Z" },
  ]));
  const offers = await readManualOffers(file, new Date("2026-11-13T00:00:00.000Z"));
  assert.deepEqual(offers.map((entry) => entry.merchantName), ["Fresh"]);
});
