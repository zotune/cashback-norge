import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { crawlObos } from "../src/backend/providers/obos.js";
import type { ProviderOverrides } from "../src/backend/provider-overrides.js";

const silentLogger = { info() {}, warn() {}, error() {} };

// Shapes of www.obos.no/medlem/medlemsfordeler/<slug> (2026-11-12).
const PAGES: Record<string, string> = {
  "/medlem/medlemsfordeler": `<main>
    <a href="/medlem/medlemsfordeler/otovo"><h3>Otovo</h3></a>
    <a href="/medlem/medlemsfordeler/hadeland-glassverk"><h3>Hadeland Glassverk</h3></a>
    <a href="/medlem/medlemsfordeler/legalis"><h3>Legalis</h3></a>
  </main>`,
  "/medlem/medlemsfordeler/otovo": `<main><h1>Otovo</h1>
    <h2>Medlemsfordel</h2><ul><li>10 % rabatt på et nøkkelferdig solcelleanlegg, inkludert installasjon fra Otovo.</li></ul>
    <p><a href="https://www.otovo.no/obos">Få prisestimat</a></p>
    <h2>Lønnsomt</h2><p>Mange av kundene forteller at de sparer så mye som 50 prosent på strømregningen.</p>
  </main>`,
  "/medlem/medlemsfordeler/hadeland-glassverk": `<main><h1>Hadeland Glassverk</h1>
    <h2>Medlemsfordel</h2><ul>
      <li>30 % rabatt på glassmosaikk.</li>
      <li>15 % rabatt på overnatting på <a href="https://www.thorbjornrudhotell.no/">Thorbjørnrud Hotell</a>.</li>
      <li>15 % rabatt på alle varer på <a href="https://www.hadeland.com/">Hadeland Glassverk</a> og i nettbutikk.</li>
    </ul>
    <p><a href="https://www.thorbjornrudhotell.no/booking">Book hotell</a></p>
  </main>`,
  "/medlem/medlemsfordeler/legalis": `<main><h1>Legalis</h1>
    <h2>Medlemstilbud</h2><p>Fast rabattert timepris:</p><ul>
      <li>Advokat: 2290 kr per time (ordinær pris fra 3075 kr).</li>
    </ul><p>Fastpris på opprettelse av digitale juridiske dokumenter:</p><ul>
      <li>Testament: 2149 kroner.</li><li>Samboerkontrakt: 999 kroner.</li>
    </ul><p><a href="https://legalis.no/obos">Gå til Legalis</a></p>
  </main>`,
};

test("OBOS: the benefit block sets the reward, the merchant-named link sets the domain, hourly rates are not a discount", async () => {
  const server = createServer((req, res) => {
    const path = (req.url ?? "").replace(/\?.*$/, "");
    const body = PAGES[path];
    res.statusCode = body === undefined ? 404 : 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(`<!doctype html><html><body>${body ?? ""}</body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  try {
    const offers = await crawlObos({
      startUrl: `http://127.0.0.1:${address.port}/medlem/medlemsfordeler`,
      maxRequestsPerCrawl: 10,
      overrides: { obos: {} } as unknown as ProviderOverrides,
      generatedAt: "2026-11-12T00:00:00.000Z",
      logger: silentLogger,
    });
    const byName = new Map(offers.map((offer) => [offer.merchantName, offer]));
    assert.equal(byName.get("Otovo")?.reward, "10 %");
    assert.deepEqual(byName.get("Hadeland Glassverk")?.domains, ["hadeland.com"]);
    assert.equal(byName.get("Hadeland Glassverk")?.reward, "15-30 %");
    assert.equal(byName.get("Legalis")?.reward, "999-2 149 kr totalsum");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
