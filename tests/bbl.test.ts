import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { fetchBbl } from "../src/backend/providers/bbl.js";
import type { ProviderOverrides } from "../src/backend/provider-overrides.js";

const silentLogger = { info() {}, warn() {}, error() {} };

// Shape of fordelerformedlemmer.no/kbbl __NEXT_DATA__ (2026-11-12).
const contracts = [
  { name: "Vindux", contractType: "National", bonusRate: 4, bonusText: "4 % bonus", discountText: "30 % på vinduer og dører", urlWebsite: "https://www.vindux.no" },
  { name: "Kärcher.no", contractType: "National", bonusRate: 10, bonusText: "10 % bonus", discountText: "Nettbutikk", urlWebsite: "https://www.karcher.com/no" },
  { name: "Lokal maler", contractType: "Local", bonusRate: 5, urlWebsite: "https://maler.example" },
];

test("BBL: the contract's discount rate is part of the reward next to its bonus rate", async () => {
  const page = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { propsInitialBblContracts: { contracts } } } })}</script></html>`;
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(page);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  try {
    const offers = await fetchBbl({
      pageUrl: `http://127.0.0.1:${address.port}/kbbl`,
      generatedAt: "2026-11-12T00:00:00.000Z",
      logger: silentLogger,
      overrides: {} as ProviderOverrides,
    });
    assert.deepEqual(offers.map((offer) => [offer.merchantName, offer.reward, offer.domains]), [
      ["Vindux", "4-30 %", ["vindux.no"]],
      ["Kärcher.no", "10 %", ["karcher.com"]],
    ]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
