import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchUnio } from "../src/backend/providers/unio.js";

const logger = { info() {}, warn() {}, error() {} };
const FOOTER = `<p>Unios medlemsprodukter: <a href="https://www.unio.no/medlemsprodukter/avis/">Avis</a> Bertel O. Steen BMW Cutters</p>`;

function page(slug: string, title: string, html: string) {
  return {
    id: slug.length,
    slug,
    link: `https://www.unio.no/medlemsprodukter/${slug}/`,
    title: { rendered: title },
    content: { rendered: `${html}${FOOTER}` },
    modified_gmt: "2026-01-01T00:00:00",
  };
}

const PAGES = [
  page("avis", "Avis", `<p>Inntil 30 prosent rabatt på leie av personbiler og varebiler i Norge. Rabatten gjelder ikke på forsikring.</p>
    <p>Slik får du Unio-rabatten: Oppgi rabattnummer W330405 ved bestilling. Ved bestilling på avis.no, oppgi rabattkode (AWD-nummer) eller bestill via lenken nedenfor.</p>
    <a href="https://www.avis.no/leiebil-tilbud/partnere/andre-partnere/unio">Trykk her</a>`),
  page("cutters", "Cutters", `<p>Unios medlemsfordeler gir deg hele 20 prosent rabatt på hårklipp hos Cutters. Anvend koden samhold20 i appen eller på cutters.no.</p><a href="https://cutters.no/uniorabatt">Les</a>`),
  page("extra-optical", "Extra Optical", `<p>Bruk rabattkode i kassen og du får 20 prosent rabatt. Rabattkoden gjelder alle briller.</p><a href="https://extraoptical.no/unio-eo-medlem">Les</a>`),
  page("esso-mastercard", "Esso drivstoffrabatt", `<p>Unio-medlemmer får drivstoffrabatt hos Esso på 52 øre* per liter. Glem heller ikke at du også har 20 prosent rabatt på bilvask. Med Esso Mastercard får du også 15 prosent rabatt på Strawberry-hotell.</p>
    <p>Vilkår Effektiv rente ved kreditt på kr 15 000 over 12 md. er 31,13 prosent.</p><a href="https://essomastercard.no/unio">Søk</a>`),
  page("stormberg", "Stormberg", `<p>Unios medlemmer får 30 prosent rabatt på ordinære priser.</p><a href="https://www.stormberg.com/no/kampanje/unio">Her</a> <a href="https://etiskhandel.no/">Initiativ for Etisk Handel</a>`),
  page("de-historiske", "De Historiske", `<a href="https://be.synxis.com/?chain=9083&amp;promo=unio">Bestill her</a><p>Medlemmer gis 10 prosent rabatt på overnatting.</p><a href="http://www.dehistoriske.no">De Historiske</a>`),
  page("nordea", "Nordea", `<p>Her får du gode medlemspriser på boliglån og andre banktjenester.</p><a href="https://www.nordea.no/privat/fagforbund/unio/">Les mer</a>`),
];

test("Unio reads codes, maximum rates, fuel discounts and merchant domains", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(PAGES), {
    headers: { "content-type": "application/json" },
  }));
  const offers = await fetchUnio({ generatedAt: "2026-11-12T00:00:00.000Z", logger });
  const byName = new Map(offers.map((offer) => [offer.merchantName, offer]));

  assert.equal(byName.get("Avis")?.reward, "opptil 30 %");
  assert.equal(byName.get("Avis")?.discountCode, "W330405");
  assert.equal(byName.get("Cutters")?.discountCode, "samhold20");
  assert.equal(byName.get("Extra Optical")?.discountCode, undefined);
  assert.equal(byName.get("Esso drivstoffrabatt")?.reward, "0,52 kr/l");
  assert.doesNotMatch(byName.get("Esso drivstoffrabatt")?.terms ?? "", /effektiv rente/i);
  assert.deepEqual(byName.get("Stormberg")?.domains, ["stormberg.com"]);
  assert.deepEqual(byName.get("De Historiske")?.domains, ["dehistoriske.no"]);
  assert.equal(byName.get("Nordea")?.reward, "Medlemspris");
  for (const offer of offers) assert.doesNotMatch(offer.terms, /Unios medlemsprodukter/);
});
