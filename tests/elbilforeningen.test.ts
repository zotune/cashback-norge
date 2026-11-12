import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { extractElbilReward, fetchElbil } from "../src/backend/providers/elbilforeningen.js";
import type { ProviderOverrides } from "../src/backend/provider-overrides.js";

const silentLogger = { info() {}, warn() {}, error() {} };

test("Elbilforeningen: a list dash after a date is not a range, equity is not a discount, 100 % off is free", () => {
  // elbil.no/wp-json/wp/v2/membership-benefit (topcamp, elbillan-…, viking-skilt; 2026-11-12)
  assert.equal(
    extractElbilReward("Du får:\n\n- 10 % rabatt på opphold i perioden 29.06–09.08\n\n- 20 % rabatt resten av året."),
    "10-20 %",
  );
  assert.equal(
    extractElbilReward("Vi kan gi deg vårt beste tilbud dersom du gikk inn med 20% egenkapital når du kjøpte bilen.\nVi kan tilby nominell rente fra 6,40%."),
    "",
  );
  assert.equal(
    extractElbilReward("Medlemmer i Norsk elbilforening får 100% rabatt og gratis frakt på alle skilt i Vikings nettbutikk med rabattkode."),
    "0 kr totalsum",
  );
  assert.equal(
    extractElbilReward("Medlemspris eierskiftekontroll\nOrdinær pris: kr 3 720,-\nPris for medlemmer: kr 3 000,-\nNår du kjøper Aviloo-batterihelsetest og Viking Eierskiftekontroll sammen, får du ytterligere rabatt. I tillegg til dine allerede reduserte medlemspriser får du henholdsvis kr. 400 i rabatt på total og kr. 300 i rabatt på basis."),
    "Medlemspris",
  );
});

test("Elbilforeningen: an Outlook safelink is unwrapped to the partner's domain", async () => {
  const content = '<p>Som medlem får du 15 % rabatt på abonnementet.</p><p><a href="https://eur02.safelinks.protection.outlook.com/?url=https%3A%2F%2Fsupport.storytel.com%2Fhc%2Fno&amp;data=x">Ta kontakt med Storytel her</a></p>';
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify([{ slug: "storytel", link: "https://elbil.no/medlemsfordeler/storytel/", title: { rendered: "Storytel" }, content: { rendered: content } }]));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  try {
    const offers = await fetchElbil({
      apiUrl: `http://127.0.0.1:${address.port}/wp-json/wp/v2/membership-benefit`,
      generatedAt: "2026-11-12T00:00:00.000Z",
      logger: silentLogger,
      overrides: {} as ProviderOverrides,
    });
    assert.equal(offers.length, 1);
    assert.deepEqual(offers[0]?.domains, ["storytel.com"]);
    assert.equal(offers[0]?.reward, "15 %");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
