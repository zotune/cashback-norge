import assert from "node:assert/strict";
import { test } from "node:test";
import { crawlTrustdeals } from "../src/backend/providers/trustdeals.js";
import { withPages } from "./coupon-test-server.js";

const generatedAt = "2026-11-13T12:00:00.000Z";
const logger = { info() {}, warn() {}, error() {} };

// Front page: only the masked tail of each code; view page: the modal with
// the full code and the coupon's discount box (live markup, Nov 2026).
function frontCoupon(id: string, slug: string, title: string, tail: string, extraClass = ""): string {
  return `<article id="offer-${id}" data-slug="${slug}" data-offer="${id}" class="coupon similar sw ${extraClass}">
    <div class="left"><h3>${title}</h3><div class="link">Funnet på: <a href="/view/${slug}">${slug.split(".")[0]} rabattkode</a></div>
    <div class="button-box"><div class="button"><span class="label">Bruk denne koden</span><div class="snippet"><span class="code">${tail}</span></div></div></div></div>
  </article>`;
}

function viewPage(id: string, slug: string, title: string, box: string, code: string, terms = ""): string {
  return `<html><body><article id="offer-${id}" data-slug="${slug}" data-offer="${id}" class="coupon sw">
    <div class="left"><div class="discount-box"><span class="discount">${box}</span><span class="label">Rabatt</span></div></div>
    <div class="middle"><h3>${title}</h3>${terms ? `<div class="terms">- ${terms}</div>` : ""}</div>
    <div class="right"><div class="snippet"><span class="code">${code.slice(-4)}</span></div></div></article>
    <div id="modal" class="modal-code" data-id="${id}" data-slug="${slug}"><div class="modal-open"><div class="title">${title}</div>
    <div class="code-holder"><div class="code">${code}</div></div></div></div></body></html>`;
}

test("TrustDeals reads the full code from each coupon's view page, not the masked tail", async () => {
  const pages = {
    "/": `<html><body>
      ${frontCoupon("78269", "bedtime.no", "Bedtime – Få 10% rabatt med denne kupongen", "MDFF")}
      ${frontCoupon("78271", "bilpleiekongen.no", "Bilpleiekongen – Få 10% rabatt med denne kupongen", "MDJT")}
      ${frontCoupon("53730", "aliexpress.com", "Bruk vår rabattkode for 40Kr rabatt på din AliExpress-bestilling", "MJFS")}
      ${frontCoupon("46164", "farfetch.com", "15% rabatt når du melder deg på nyhetsbrevet", "46164OTK5")}
      ${frontCoupon("11111", "unique.no", "Personlig kode", "XXXX", "uq")}
    </body></html>`,
    "/view/bedtime.no?id=offer78269": viewPage("78269", "bedtime.no", "Bedtime – Få 10% rabatt med denne kupongen", "10%", "WELCOME10", "tilgjengelig for nye kunder"),
    "/view/bilpleiekongen.no?id=offer78271": viewPage("78271", "bilpleiekongen.no", "Bilpleiekongen – Få 10% rabatt med denne kupongen", "kr20", "TKHXS20", "minimumsbestillingsverdi på NOK130"),
    "/view/aliexpress.com?id=offer53730": viewPage("53730", "aliexpress.com", "Bruk vår rabattkode for 40Kr rabatt på din AliExpress-bestilling", "40Kr", "SMR12"),
    "/view/farfetch.com?id=offer46164": viewPage("46164", "farfetch.com", "15% rabatt når du melder deg på nyhetsbrevet", "15%", "Ingen kode nødvendig"),
  };

  await withPages(pages, async (origin, requests) => {
    const offers = await crawlTrustdeals({ generatedAt, logger, startUrl: `${origin}/` });
    assert.ok(!requests.some((path) => path.includes("unique.no")));
    const byCode = new Map(offers.map((offer) => [offer.discountCode, offer]));
    assert.deepEqual([...byCode.keys()].sort(), ["SMR12", "TKHXS20", "WELCOME10"]);

    assert.equal(byCode.get("WELCOME10")?.reward, "10 %");
    assert.equal(byCode.get("WELCOME10")?.terms, "Bedtime – Få 10% rabatt med denne kupongen\ntilgjengelig for nye kunder");
    assert.equal(byCode.get("SMR12")?.reward, "40 kr");
    // Box (20 kr) and headline (10 %) disagree: no reward is guessed.
    const bilpleie = byCode.get("TKHXS20");
    assert.equal(bilpleie?.reward, "Rabattkode");
    assert.match(bilpleie?.terms ?? "", /TrustDeals oppgir 20 kr for koden, men 10 % i overskriften/);
    assert.deepEqual(bilpleie?.rewardCalculation, { minimumPurchaseNok: 130 });
    assert.equal(bilpleie?.activationUrl, "https://bilpleiekongen.no");
  });
});

test("a failing view page drops only that coupon", async () => {
  const pages = {
    "/": `<html><body>
      ${frontCoupon("1", "a-shop.no", "Få 10% rabatt", "AAAA")}
      ${frontCoupon("2", "b-shop.no", "Få 20% rabatt", "BBBB")}
    </body></html>`,
    "/view/b-shop.no?id=offer2": viewPage("2", "b-shop.no", "Få 20% rabatt", "20%", "BSHOP20"),
  };
  await withPages(pages, async (origin, requests) => {
    const offers = await crawlTrustdeals({ generatedAt, logger, startUrl: `${origin}/` });
    assert.deepEqual(offers.map((offer) => offer.discountCode), ["BSHOP20"]);
    // The 404 page is retried a bounded number of times.
    assert.ok(requests.filter((path) => path.startsWith("/view/a-shop.no")).length <= 3);
  });
});
