import assert from "node:assert/strict";
import { test } from "node:test";
import { buildYsOffers } from "../src/backend/providers/ys.js";

const logger = { info() {}, warn() {}, error() {} };

function card(title: string, description: string, href: string): string {
  return `<div class="fordeler-card" data-categories="x">
    <div class="thumb"><a href="${href}" target="_blank"><img src="https://ys.no/a.jpg" alt=""></a></div>
    <h3 class="fordeler-card-title text-x"><a href="${href}">${title}</a></h3>
    <p class="text-lg">${description}</p>
  </div>`;
}

// The news teasers above the grid; the last one wraps the whole grid, which
// used to turn every grid benefit into one "Nordea 50 %" offer.
const CONTENT = `
<article class="post-article"><span class="boldtext">YS Fordel</span><p>Ny medlemsavtale - 25 % rabatt hos Stormberg!</p><a href="https://www.stormberg.com/no/kampanje/ys">Les</a></article>
<article class="post-article"><span class="boldtext"></span><h2 class="postheading">Nordea</h2><p>Hvilke betingelser får du som YS-medlem i Nordea.</p>
<section><div class="fordeler-grid">
${card("Gjensidige forsikring", "Som medlem får du svært gode rabatter på forsikring hos Gjensidige, som noe over 60% av medlemmene benytter seg av!", "/medlemsfordeler/gjensidige/")}
${card("Nordea", "Nordea har nylig gjort justeringer i rentene som kan slå ut positivt på boliglån for YS-medlemmer.", "https://www.nordea.no/privat/fagforbund/ys/")}
${card("Stormberg", "25% rabatt! Enten du skal ut på tur …", "https://www.stormberg.com/no/kampanje/ys")}
${card("Radisson hotels", "Her får du som YS-medlem rabatt på 10-20 %. NB! For å få rabatten må dere benytte koden 090673.", "https://www.radissonhotels.com/no-no/")}
${card("Markisemannen", "Ny og svært god medlemsfordel på solskjerming! Medlemsrabatt HELE året på ALLE produkter", "https://www.markisemannen.no/ys-fordel/")}
${card("Kinoklubben", "Se gode filmer på kino til halv pris! YS-medlemmer får 40 % rabatt og 2 medlemskap til prisen av 1 hos Kinoklubben!", "https://www.kinoklubb.no/BliMedlem/OpprettBruker?rabattkode=YS")}
${card("Filmweb", "10% rabatt på Filmweb Kinogavekort.", "https://kinogavekort.no/Digital?discountCode=YSKINO")}
${card("AVIS", "25% rabatt på leiebil hos Avis. Benytt kode X199101. Avtalen gjelder ukedager.", "https://www.avis.no/leiebil-tilbud/partnere/andre-partnere/ys")}
${card("Esso", "Esso Mastercard Drivstoff rabatt på 52 øre/liter på pumpepris, 20% rabatt pluss hver 6 bilvask gratis", "https://essomastercard.no/ys/")}
${card("Milrab", "30% på STOIX og Eagle 20% på Aclima, Salomon og Swix", "https://milrab.no/ys-fordeler")}
</div></section></article>`;

test("YS offers come from the benefit grid, one per partner card", () => {
  const offers = buildYsOffers(CONTENT, { generatedAt: "2026-11-12T00:00:00.000Z", logger, overrides: { ys: {} } as never });
  const byName = new Map(offers.map((offer) => [offer.merchantName, offer]));

  assert.equal(byName.has("YS Fordel"), false);
  // Internal links have no merchant domain; a bank rate tweak has no reward.
  assert.equal(byName.has("Gjensidige forsikring"), false);
  assert.equal(byName.has("Nordea"), false);
  assert.equal(byName.get("Stormberg")?.reward, "25 %");
  assert.deepEqual(byName.get("Stormberg")?.domains, ["stormberg.com"]);
  assert.equal(byName.get("Radisson hotels")?.reward, "10-20 %");
  assert.equal(byName.get("Radisson hotels")?.discountCode, "090673");
  assert.equal(byName.get("Markisemannen")?.reward, "Rabatt");
  // The 40 % membership discount, not the club's half-price tickets.
  assert.equal(byName.get("Kinoklubben")?.reward, "40 %");
  assert.equal(byName.get("Kinoklubben")?.discountCode, undefined);
  assert.equal(byName.get("Filmweb")?.discountCode, "YSKINO");
  assert.equal(byName.get("AVIS")?.discountCode, "X199101");
  assert.equal(byName.get("Esso")?.reward, "0,52 kr/l");
  assert.equal(byName.get("Milrab")?.reward, "20-30 %");
  assert.match(byName.get("AVIS")?.terms ?? "", /gjelder ukedager[\s\S]*Krever medlemskap i et YS-forbund\./);
});

test("YS falls back to the article teasers when the page has no grid", () => {
  const offers = buildYsOffers(
    `<article class="post-article"><span class="boldtext">Storytel</span><p>Få 30 dager gratis – deretter 20 % rabatt på Storytel Premium.</p><a href="https://www.storytel.com/no/c/ys">Les</a></article>`,
    { generatedAt: "2026-11-12T00:00:00.000Z", logger, overrides: { ys: {} } as never },
  );
  assert.equal(offers.length, 1);
  assert.equal(offers[0]?.reward, "20 %");
});
