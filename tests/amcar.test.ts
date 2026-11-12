import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAmcarOffers } from "../src/backend/providers/amcar.js";
import type { ProviderOverrides } from "../src/backend/provider-overrides.js";

const silentLogger = { info() {}, warn() {}, error() {} };
const input = {
  overrides: {} as ProviderOverrides,
  domainLookup: new Map<string, string[]>(),
  generatedAt: "2026-11-12T00:00:00.000Z",
  logger: silentLogger,
};

// Excerpt of https://amcar.no/rabattavtaler/rabattavtaler (2026-11-12).
const AMCAR_PAGE = `<section><div class="body">
<h3>Offisielle samarbeidspartnere:<br />IF FORSIKRING</h3>
<p>Medlemmer i AMCAR får en rekke fordeler og rabatter på sine private forsikringer.&nbsp;<a href="https://www.if.no/privat/partner/amcar " target="_blank">www.if.no</a></p>
<h3>Gytis Autek AS</h3>
<p>Gytis Autek AS utvikler og selger modelltilpasset biltilbehør. Som medlem i AMCAR får du 15% rabatt ved bruk av deres rabattkode. Rabattkoden finner du <a href="https://amcar.no/rabattavtaler/rabattkoder">her</a>.&nbsp;<br /><br /><a href="http://www.gytisautek.no">www.gytisautek.no</a>&nbsp;</p>
<h3>RIIS BILGLASS</h3>
<p>Som AMCAR-medlem får du følgende:<br />-Gratis spylervæske opptil 4 liter per fylling ved reparasjon av steinsprut og ruteskift<br />- -50% på vindusviskere ved frontrute skift og steinsprut reparasjon på person/varebil.<br />- Gratis steinsprutplaster</p>
<p>Rabattsatser for biler uten glassforsikring:<br />-Frontruter 42%<br />-Side/bakruter 20%<br />-Lim 30%<br />-Steinsprutreparasjon kr. 700,- eks. mva.</p>
</div><div class="image"></div></section>`;

test("AMCAR: partner label is not the merchant name; rate lists and redeem sentences stay in the terms without the login-code pointer", () => {
  const offers = buildAmcarOffers(AMCAR_PAGE, input);
  const byName = new Map(offers.map((offer) => [offer.merchantName, offer]));

  const ifOffer = byName.get("If");
  assert.ok(ifOffer, `merchant names: ${[...byName.keys()].join(", ")}`);
  assert.deepEqual(ifOffer.domains, ["if.no"]);

  const gytis = byName.get("Gytis Autek");
  assert.equal(gytis?.reward, "15 %");
  assert.match(gytis?.terms ?? "", /15% rabatt ved bruk av deres rabattkode/);
  assert.doesNotMatch(gytis?.terms ?? "", /finner du/);

  const riis = byName.get("Riis Bilglass");
  assert.equal(riis?.reward, "20-50 %");
  for (const line of ["-Frontruter 42%", "-Side/bakruter 20%", "-Lim 30%"]) {
    assert.ok(riis?.terms.includes(line), `${line} missing from ${riis?.terms}`);
  }
});

test("AMCAR: a page without merchant sections fails instead of producing no offers", () => {
  assert.throws(() => buildAmcarOffers("<html><body>Vedlikehold</body></html>", input), /no merchant sections/);
});
