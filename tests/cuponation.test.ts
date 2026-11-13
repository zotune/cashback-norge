import assert from "node:assert/strict";
import { test } from "node:test";
import { crawlCuponation } from "../src/backend/providers/cuponation.js";
import { withPages } from "./coupon-test-server.js";

const generatedAt = "2026-11-13T12:00:00.000Z";

function voucher(overrides: Record<string, unknown>) {
  return {
    type: "code", code: "CODE10", caption: { first: "10%", second: "rabatt" }, captions: [],
    endTime: "2026-12-01T22:59:00Z", isExpired: false, expiration: { label: "" },
    retailer: { name: "Shop", merchantUrl: "https://www.shop.no/" },
    termsAndConditions: { text: "" }, title: "Få 10% rabatt", ...overrides,
  };
}

function page(vouchers: unknown[]): string {
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { vouchers } } })}</script></body></html>`;
}

test("CupoNation uses the caption value, keeps opptil and minimum purchase, and drops expired codes", async () => {
  const warnings: string[] = [];
  const logger = { info() {}, warn: (message: string) => warnings.push(message), error() {} };
  const html = page([
    voucher({ code: "CU15KOND", caption: { first: "15%", second: "rabatt" }, title: "Sikre deg 15% rabatt i dag med vår egen Kondomeriet rabattkode",
      retailer: { name: "Kondomeriet", merchantUrl: "https://www.kondomeriet.no/" },
      termsAndConditions: { text: "<p>Salgsvarer er ekskludert. Gjelder kjøp på minst 600 kr</p>" } }),
    voucher({ code: "Atollsno", caption: { first: "70%", second: "rabatt" }, title: "Spar hele 70% med vår NordVPN rabattkode",
      retailer: { name: "NordVPN", merchantUrl: "https://nordvpn.com/no/" },
      termsAndConditions: { text: "<p>Bruk rabattkoden og få opptil 70% rabatt på et kvalifiserende abonnement.</p>" } }),
    voucher({ code: "PRØVWOLT", caption: { first: "100 kr", second: "rabatt" }, title: "Wolt-koden gir deg 100 kr avslag",
      retailer: { name: "Wolt", merchantUrl: "https://wolt.com/nb" },
      termsAndConditions: { text: "<ul>\n<li><p>Kan ikke kombineres med andre tilbud</p></li>\n<li><p>Gjelder &quot;Basic&quot; &amp; mer</p></li>\n</ul>" } }),
    voucher({ code: "OLD20", endTime: "2026-11-01T22:59:00Z" }),
    voucher({ code: "GONE20", isExpired: true }),
    voucher({ code: "Kode via app" }),
    voucher({ type: "deal", code: "" }),
  ]);

  await withPages({ "/topp-20": html }, async (origin) => {
    const offers = await crawlCuponation({ generatedAt, logger, startUrl: `${origin}/topp-20` });
    assert.deepEqual(offers.map((offer) => offer.discountCode), ["CU15KOND", "Atollsno", "PRØVWOLT"]);
    const [kondomeriet, nordvpn, wolt] = offers;
    assert.equal(kondomeriet?.reward, "15 %");
    assert.deepEqual(kondomeriet?.rewardCalculation, { minimumPurchaseNok: 600 });
    assert.equal(nordvpn?.reward, "opptil 70 %");
    assert.equal(wolt?.reward, "100 kr");
    assert.equal(wolt?.terms, "Wolt-koden gir deg 100 kr avslag\nGyldig til 01.12.2026\n- Kan ikke kombineres med andre tilbud\n- Gjelder \"Basic\" & mer");
    assert.deepEqual(warnings, []);
  });
});

test("CupoNation reports a changed page layout instead of silently finding no codes", async () => {
  const warnings: string[] = [];
  const logger = { info() {}, warn: (message: string) => warnings.push(message), error() {} };
  await withPages({ "/topp-20": "<html><body>Ny layout</body></html>" }, async (origin) => {
    const offers = await crawlCuponation({ generatedAt, logger, startUrl: `${origin}/topp-20` });
    assert.deepEqual(offers, []);
    assert.match(warnings.join("\n"), /CupoNation: no vouchers in the __NEXT_DATA__ of http:\/\/127\.0\.0\.1:\d+\/topp-20/);
  });
});
