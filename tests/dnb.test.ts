import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { fetchDnb, fetchDnbSupertilbud } from "../src/backend/providers/dnb.js";

const generatedAt = "2026-10-08T12:00:00.000Z";
const logger = { info() {}, warn() {}, error() {} };
const card = {
  title: "Example shop",
  offer: "10%",
  description: "Selected products.",
  hidden: false,
  url: { href: "https://www.example.no/shop", path: "www.example.no/shop" },
};
const codeSection = (code: string) => ({
  priceContent: { title: "Benytt rabattkode:", price: code },
});

// Match DNB's public Next.js transport without depending on its HTML layout.
function flightPage(sections: unknown[]): string {
  const record = `48:${JSON.stringify(["$", "$L4a", null, {
    children: ["$", "main", null, { pageData: { content: { sections } } }],
  }])}\n`;
  const split = Math.floor(record.length / 2);
  return `<html><body><script>self.__next_f.push([0])</script>
    <script>self.__next_f.push(${JSON.stringify([1, "1:I[123,[],\"default\"]\n" + record.slice(0, split)])})</script>
    <script nonce="example">self.__next_f.push(${JSON.stringify([1, record.slice(split)])});</script>
    <script>throw new Error("third-party scripts must not execute")</script></body></html>`;
}

async function withPage(
  body: string,
  run: (url: string) => Promise<void>,
  status = 200,
): Promise<void> {
  const server = createServer((_request, response) => {
    response.writeHead(status, { "Content-Type": body.startsWith("{") ? "application/json" : "text/html" });
    response.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}/offers`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("regular discounts decode split Flight records and use the current page code", async () => {
  const sections = [codeSection("DNB5437"), { cardDiscountsItems: [
    card,
    { ...card, title: "Hidden", hidden: true },
    { ...card, title: "No discount", offer: "0" },
    { ...card, title: "No URL", url: { href: "", path: "" } },
  ] }];
  await withPage(flightPage(sections), async (pageDataUrl) => {
    const offers = await fetchDnb({ pageDataUrl, generatedAt, logger });
    assert.equal(offers.length, 1);
    assert.deepEqual(offers[0], {
      provider: "dnb",
      merchantName: "Example shop",
      domains: ["example.no"],
      reward: "10%",
      sourceUrl: "https://www.dnb.no/kundeprogram/fordeler/faste-rabatter",
      activationUrl: "https://www.dnb.no/kundeprogram/fordeler/faste-rabatter",
      terms: "Selected products.\nRabattkode: DNB5437. Betal med DNB-kort.",
      discountCode: "DNB5437",
      updatedAt: generatedAt,
    });
  });
});

test("a rotated code is picked up without a code change", async () => {
  await withPage(flightPage([codeSection("DNB9999"), { cardDiscountsItems: [card] }]), async (pageDataUrl) => {
    const [offer] = await fetchDnb({ pageDataUrl, generatedAt, logger });
    assert.equal(offer?.discountCode, "DNB9999");
    assert.match(offer!.terms, /DNB9999/);
    assert.doesNotMatch(offer!.terms, /DNB4935|DNB5437/);
  });
});

test("explicit legacy JSON URLs remain supported", async () => {
  const content = JSON.stringify({ sections: [codeSection("DNB5437"), { cardDiscountsItems: [card] }] });
  const body = JSON.stringify({ result: { data: { aemPage: { data: { content } } } } });
  await withPage(body, async (pageDataUrl) => {
    const offers = await fetchDnb({ pageDataUrl, generatedAt, logger });
    assert.equal(offers.length, 1);
    assert.equal(offers[0]?.discountCode, "DNB5437");
  });
});

test("active Supertilbud preserve each shop's reward, code and terms", async () => {
  const sections = [{
    title: "Supertilbud torsdag 8. – lørdag 10. oktober.",
    superOfferItems: [
      { ...card, offer: "25", description: [{ type: "paragraph", children: [{ text: "Selected products." }] }],
        disclaimer: [{ type: "paragraph", children: [{ text: "Rabattkode: SHOP25. Kun i nettbutikk." }] }] },
      { ...card, title: "Shop without code", offer: "20%", description: [], disclaimer: [] },
    ],
  }];
  await withPage(flightPage(sections), async (pageDataUrl) => {
    const offers = await fetchDnbSupertilbud({ pageDataUrl, generatedAt, logger });
    assert.equal(offers.length, 2);
    assert.equal(offers[0]?.reward, "25 %");
    assert.equal(offers[0]?.discountCode, "SHOP25");
    assert.match(offers[0]!.terms, /8\. – lørdag 10\. oktober/);
    assert.match(offers[0]!.terms, /Kun i nettbutikk/);
    assert.equal(offers[1]?.reward, "20%");
    assert.equal(offers[1]?.discountCode, undefined);
    assert.doesNotMatch(offers[1]!.terms, /Rabattkode|DNBSUPER75/);
    assert.equal(offers[0]?.sourceUrl, "https://www.dnb.no/kundeprogram/fordeler/supertilbud/manedens-tilbud");
  });
});

test("a month without Supertilbud is a valid empty result", async () => {
  await withPage(flightPage([{ title: "Månedens tilbud", description: "Akkurat nå er det ikke noe Supertilbud." }]), async (pageDataUrl) => {
    assert.deepEqual(await fetchDnbSupertilbud({ pageDataUrl, generatedAt, logger }), []);
  });
});

test("a 404 or changed payload fails clearly instead of publishing fabricated offers", async () => {
  await withPage("Not found", async (pageDataUrl) => {
    await assert.rejects(fetchDnb({ pageDataUrl, generatedAt, logger }), /returned 404/);
  }, 404);
  await withPage("<html>Unrecognized page</html>", async (pageDataUrl) => {
    await assert.rejects(fetchDnbSupertilbud({ pageDataUrl, generatedAt, logger }), /structured page content not found/);
  });
  await withPage(flightPage([{ cardDiscountsItems: [card] }]), async (pageDataUrl) => {
    await assert.rejects(fetchDnb({ pageDataUrl, generatedAt, logger }), /no current discount code/);
  });
});
