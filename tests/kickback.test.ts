import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDomainLookup } from "../src/backend/domain-lookup.js";
import { crawlKickback } from "../src/backend/providers/kickback.js";
import { withPages } from "./coupon-test-server.js";

const generatedAt = "2026-11-13T12:00:00.000Z";
const logger = { info() {}, warn() {}, error() {} };

function promotion(code: string, partner: string, slug: string, title: string, terms: string, kind = "voucher-code"): string {
  return `<article class="node node--type-promotion list-module ${kind}" data-payload="${code}" data-partner-name="${partner}" data-href="/rabattkode/${slug}#promo-1">
    <h3 class="node__title">${title}</h3><div class="field-to-formatted">Ubekreftet sluttdato</div>
    <div class="term-collapse"><div class="inner">${terms}</div></div></article>`;
}

test("Kickback keeps the code's minimum purchase and does not call a gift 'Gratis'", async () => {
  const pages = {
    "/": `<html><body>
      ${promotion("VPG10VG", "VPG", "vpg", "Få 10% rabatt på ditt kjøp over 2000 kr med VPG rabattkode", "Gjelder ikke nedsatte varer.")}
      ${promotion("GAVE", "Gaveshop", "gaveshop", "Gratis gave ved kjøp", "Så lenge lageret rekker.")}
      ${promotion("", "Deal", "deal", "Salg", "", "deal")}
    </body></html>`,
    "/rabattkode/vpg": `<html><body><a href="https://www.vpg.no">Til VPG</a></body></html>`,
    "/rabattkode/gaveshop": `<html><body><a href="https://gaveshop.no/">Til butikken</a><a href="https://www.google.com/x">x</a></body></html>`,
  };

  await withPages(pages, async (origin) => {
    const offers = await crawlKickback({
      domainLookup: buildDomainLookup([]), generatedAt, logger, maxRequestsPerCrawl: 10, startUrl: `${origin}/`,
    });
    const byCode = new Map(offers.map((offer) => [offer.discountCode, offer]));
    assert.deepEqual([...byCode.keys()].sort(), ["GAVE", "VPG10VG"]);
    assert.equal(byCode.get("VPG10VG")?.reward, "10 %");
    assert.deepEqual(byCode.get("VPG10VG")?.rewardCalculation, { minimumPurchaseNok: 2000, minimumPurchaseExclusive: true });
    assert.deepEqual(byCode.get("VPG10VG")?.domains, ["vpg.no"]);
    assert.equal(byCode.get("GAVE")?.reward, "Rabattkode");
    assert.deepEqual(byCode.get("GAVE")?.domains, ["gaveshop.no"]);
  });
});
