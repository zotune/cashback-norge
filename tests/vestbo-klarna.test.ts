import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { parseKlarnaAppSections } from "../src/backend/providers/klarna.js";
import { fetchVestbo, parseBenefitCards } from "../src/backend/providers/vestbo.js";
import type { ProviderOverrides } from "../src/backend/provider-overrides.js";

const silentLogger = { info() {}, warn() {}, error() {} };

// Excerpt of the WP REST payload for vestbo.no page 9544 (2026-11-03 edit):
// WordPress texturized the closing quote of the Kongeparken campaign URL into
// &#8243; so the link ends there instead of with &raquo;.
const VESTBO_CONTENT = [
  "[vc_single_image onclick=&raquo;custom_link&raquo; image=&raquo;9561&#8243; link=&raquo;https://vestbo.no/mitt-medlemskap/selge-boligen-din/&raquo; img_link_target=&raquo;_blank&raquo;]",
  "[vc_column_text]\nE-takst til kr 1.500*\n[/vc_column_text][/vc_column][vc_column]",
  "[vc_single_image image=&raquo;9562&#8243; img_size=&raquo;medium&raquo;]",
  "[vc_column_text]\n20 % rabatt på svømmekurs\n[/vc_column_text][/vc_column][/vc_row][vc_row][vc_column]",
  "[vc_single_image onclick=&raquo;custom_link&raquo; image=&raquo;19659&#8243; link=&raquo;hederbank.no&raquo; img_link_target=&raquo;_blank&raquo;]",
  "[vc_column_text]\nBoliglån typisk 1% under storbank\nIngen skjulte gebyrer\n[/vc_column_text][/vc_column][/vc_row][vc_row][vc_column]",
  "[vc_single_image onclick=&raquo;custom_link&raquo; image=&raquo;9927&#8243; css_animation=&raquo;none&raquo; link=&raquo;https://kampanje.kongeparken.no/no/se-gjore/2726520/dagspass-2026-vestbo/showdetails?search=cbispid%3D2726520&#8243; img_link_target=&raquo;_blank&raquo;]",
  "[vc_column_text]\n<p>20% rabatt på dagsbilletter hos Kongeparken!</p>\n<p>Klikk HER for bestiling! </p>\n[/vc_column_text][/vc_column][/vc_row]",
].join("\t");

test("Vestbo: a link closed by a texturized &#8243; is still read as a benefit card", () => {
  const cards = parseBenefitCards(VESTBO_CONTENT);
  assert.deepEqual(cards.map((card) => card.link), [
    "https://vestbo.no/mitt-medlemskap/selge-boligen-din/",
    "hederbank.no",
    "https://kampanje.kongeparken.no/no/se-gjore/2726520/dagspass-2026-vestbo/showdetails?search=cbispid%3D2726520",
  ]);
});

async function withVestboServer(
  respond: (res: import("node:http").ServerResponse) => void,
  run: (url: string) => Promise<void>,
) {
  const server = createServer((_req, res) => respond(res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}/wp-json/wp/v2/pages/9544`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const overrides = {
  vestbo: { "kampanje.kongeparken.no": ["kongeparken.no"] },
} as unknown as ProviderOverrides;

test("Vestbo: the campaign subdomain maps to the merchant domain; internal and rewardless cards are skipped", async () => {
  await withVestboServer((res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ content: { rendered: VESTBO_CONTENT } }));
  }, async (apiUrl) => {
    const offers = await fetchVestbo({ apiUrl, generatedAt: "2026-11-10T00:00:00.000Z", logger: silentLogger, overrides });
    assert.equal(offers.length, 1);
    const [offer] = offers;
    assert.equal(offer?.merchantName, "Kongeparken");
    assert.deepEqual(offer?.domains, ["kongeparken.no"]);
    assert.equal(offer?.reward, "20 %");
    assert.doesNotMatch(offer?.terms ?? "", /Klikk HER/i);
  });
});

test("Vestbo: HTTP errors and a changed payload fail with the source and status", async () => {
  await withVestboServer((res) => {
    res.statusCode = 503;
    res.end("unavailable");
  }, async (apiUrl) => {
    await assert.rejects(
      fetchVestbo({ apiUrl, generatedAt: "", logger: silentLogger, overrides }),
      /Vestbo API returned 503/,
    );
  });
  await withVestboServer((res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ title: "no content" }));
  }, async (apiUrl) => {
    await assert.rejects(
      fetchVestbo({ apiUrl, generatedAt: "", logger: silentLogger, overrides }),
      /unexpected data format/,
    );
  });
});

test("Klarna app API: deals become percentage offers; missing or invalid amounts are skipped, not zero", () => {
  const offers = parseKlarnaAppSections([
    {
      title: "Featured",
      deals: [
        { merchantName: "FLOYD", cashbackAmount: 550, oldCashbackAmount: null, dealUrl: "https://www.floyd.no", isUpTo: false, storeKrn: "", endedAt: null },
        { merchantName: "Byttdekk", cashbackAmount: 350, oldCashbackAmount: null, dealUrl: "http://www.byttdekk.com", isUpTo: true, storeKrn: "", endedAt: null },
        { merchantName: "Broken", cashbackAmount: Number.NaN, oldCashbackAmount: null, dealUrl: "https://broken.no", isUpTo: false, storeKrn: "", endedAt: null },
      ],
    },
    { title: "Fashion", deals: [{ merchantName: "floyd", cashbackAmount: 100, oldCashbackAmount: null, dealUrl: "https://www.floyd.no", isUpTo: false, storeKrn: "", endedAt: null }] },
  ], "2026-11-10T00:00:00.000Z", silentLogger);

  assert.deepEqual(offers.map((offer) => [offer.merchantName, offer.reward, offer.domains]), [
    ["FLOYD", "5,5 %", ["floyd.no"]],
    ["Byttdekk", "1-3,5 %", ["byttdekk.com"]],
  ]);
});

test("Klarna app API: sections without deals yield no offers", () => {
  assert.deepEqual(parseKlarnaAppSections([{ title: "Featured", deals: [] }], "", silentLogger), []);
});
