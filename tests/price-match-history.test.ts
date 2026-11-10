import assert from "node:assert/strict";
import { test } from "node:test";
import { describePriceHistory, findPriceMatchHistory, isDealPriceHistory } from "../src/shared/deal-price-history.js";

const klarnaOffer = { source: "klarna", productUrl: "https://www.klarna.com/no/shopping/pl/cl97/5869423/Mobiltelefoner/Apple-iPhone-16/", shopName: "Elkjøp", amount: 9990, currency: "NOK" };
const klarnaHistory = (productId: string, lowest: number) => ({
  productId, currencyCode: "NOK", lowest,
  history: [{ price: 10990, timestamp: "2025-01-02T00:00:00Z" }, { price: lowest, timestamp: "2026-03-01T00:00:00Z" }],
});

test("price-match history: Klarna reads its own product's two-year history; another product ID is ignored", async () => {
  const urls: string[] = [];
  const history = await findPriceMatchHistory(klarnaOffer, async (url) => { urls.push(url); return klarnaHistory("5869423", 9490); }, async () => undefined);
  assert.match(urls[0]!, /pricehistory\/product\/5869423\/NO\/DAY\?.*TWO_YEARS/);
  assert.deepEqual(history && { low: history.lowestPriceEver, range: history.historyRange }, { low: 9490, range: "2y" });
  assert.equal(await findPriceMatchHistory(klarnaOffer, async () => klarnaHistory("111", 9490), async () => undefined), undefined);
});

test("price-match history: the lowest includes today's price, so a fresh low reads as the lowest", async () => {
  const history = await findPriceMatchHistory({ ...klarnaOffer, amount: 8990 }, async () => klarnaHistory("5869423", 9490), async () => undefined);
  assert.equal(history?.lowestPriceEver, 8990);
  const note = describePriceHistory(8990, history!, "Klarna");
  assert.deepEqual(note && [note.atLow, note.value, note.label], [true, "Laveste", "2 år"]);
  assert.match(note!.title, /^Laveste registrerte varepris hos Klarna de siste to årene: 8\s990\skr, inkludert dagens pris\. Dagens pris er på laveste registrerte nivå\. Registrert siden 2\. januar 2025\. .*Frakt er ikke med\.$/);
});

test("price-match history: Godpris asks for the offer's own shop and price; Prisradar posts its GraphQL history", async () => {
  let godprisUrl = "";
  const godpris = await findPriceMatchHistory(
    { source: "godpris", productUrl: "https://godpris.no/produkt/123456", shopName: "Power", amount: 8990, currency: "NOK" },
    async () => undefined,
    async (url) => { godprisUrl = url; return "<p>Billigste pris de siste tre månedene er kr <span>8 490</span></p>"; },
  );
  assert.equal(godprisUrl, "https://godpris.no/api/product/history-section?id=i_123456&price=8990&shop=Power");
  assert.deepEqual(godpris && [godpris.lowestPriceEver, godpris.historyRange], [8490, "3m"]);
  assert.equal(describePriceHistory(8990, godpris!, "Godpris")?.value, "−5,6 %");
  assert.equal(describePriceHistory(8990, godpris!, "Godpris")?.label, "til lavpris");

  let init: { method?: string; body?: string } | undefined;
  const prisradar = await findPriceMatchHistory(
    { source: "prisradar", productUrl: "https://prisradar.no/produkter/apple-iphone-16-128gb", shopName: "Komplett", amount: 9000, currency: "NOK" },
    async (_url, requestInit) => { init = requestInit; return { data: { ProductPriceHistory: [{ price: 9900, date: { iso: "2024-05-01T00:00:00Z" } }, { price: 8100, date: { iso: "2025-11-27T00:00:00Z" } }] } }; },
    async () => undefined,
  );
  assert.equal(init?.method, "POST");
  assert.match(init?.body ?? "", /"slug":"apple-iphone-16-128gb"/);
  assert.deepEqual(prisradar && [prisradar.lowestPriceEver, prisradar.historyRange], [8100, "all"]);
  assert.equal(describePriceHistory(9000, prisradar!, "Prisradar")?.value, "−10 %");
});

test("price-match history: other sources, other currencies, missing IDs and changed formats give no history", async () => {
  const never = async () => { throw new Error("no request expected"); };
  assert.equal(await findPriceMatchHistory({ ...klarnaOffer, source: "prisjakt" }, never, never), undefined);
  assert.equal(await findPriceMatchHistory({ ...klarnaOffer, currency: "SEK" }, never, never), undefined);
  assert.equal(await findPriceMatchHistory({ ...klarnaOffer, amount: Number.NaN }, never, never), undefined);
  assert.equal(await findPriceMatchHistory({ ...klarnaOffer, productUrl: "https://www.klarna.com/no/" }, never, never), undefined);
  assert.equal(await findPriceMatchHistory(klarnaOffer, async () => ({ productId: "5869423", currencyCode: "NOK", history: [] }), never), undefined);
  assert.equal(await findPriceMatchHistory({ source: "godpris", productUrl: "https://godpris.no/produkt/1", shopName: "X", amount: 10, currency: "NOK" }, never, async () => "<p>Ingen historikk</p>"), undefined);
});

test("price-match history: runtime validation rejects unknown ranges and non-finite prices", () => {
  assert.equal(isDealPriceHistory({ lowestPriceEver: 100, historyRange: "2y", historyScope: "product" }), true);
  assert.equal(isDealPriceHistory({ lowestPriceEver: 0, historyRange: "2y", historyScope: "product" }), false);
  assert.equal(isDealPriceHistory({ lowestPriceEver: Number.POSITIVE_INFINITY, historyRange: "2y", historyScope: "product" }), false);
  assert.equal(isDealPriceHistory({ lowestPriceEver: 100, historyRange: "1w", historyScope: "product" }), false);
  assert.equal(isDealPriceHistory({ lowestPriceEver: 100, historyRange: "all", historyScope: "product", historyStartedAt: "not a date" }), false);
});
