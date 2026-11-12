import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchAkademikerne } from "../src/backend/providers/akademikerne.js";

const logger = { info() {}, warn() {}, error() {} };

function page(id: number, slug: string, title: string, excerpt: string, html: string) {
  return {
    id, slug, parent: 0, link: `https://www.akademikernepluss.no/${slug}/`,
    title: { rendered: title }, excerpt: { rendered: `<p>${excerpt}</p>` },
    content: { rendered: `<p>Tilbys via Akademikerne Pluss</p>${html}` },
  };
}

const PAGES = [
  page(1, "samsung", "Samsung", "Få opptil 50 prosent rabatt mot veiledende listepris.",
    `<p>TV: Fra 15 prosent medlemsrabatt</p><p>Hjem og husholdning: Fra 25 prosent medlemsrabatt</p><a href="https://www.samsung.com/no/offer/">Samsung</a>`),
  page(2, "vindux", "Vindux", "Via Akademikerne Pluss får du minst 40 % rabatt på vinduer og dører.",
    `<p>Gamle vinduer kan stå for opptil 40 % av varmetapet i en bolig.</p>
     <p>Hvis du reduserer dette med 15 %, betyr det en årlig besparelse på ca. 7 500 kroner.</p>
     <p>Som medlem får du minimum 40 prosent medlemsrabatt på vinduer og dører!</p><a href="https://vindux.no/">Vindux</a>`),
];

test("Akademikerne keeps opptil and ignores energy-saving percentages", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(PAGES), {
    headers: { "content-type": "application/json" },
  }));
  const offers = await fetchAkademikerne({
    generatedAt: "2026-11-12T00:00:00.000Z", logger,
    overrides: { akademikerne: {} } as never, domainLookup: new Map(),
  });
  const byName = new Map(offers.map((offer) => [offer.merchantName, offer]));
  assert.equal(byName.get("Samsung")?.reward, "opptil 15-50 %");
  assert.equal(byName.get("Vindux")?.reward, "40 %");
});
