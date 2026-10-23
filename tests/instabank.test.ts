import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { fetchInstabank } from "../src/backend/providers/instabank.js";
import { collectProviderOffers } from "../src/backend/provider-offers.js";
import { buildCashbackIndex, findOffersForHostname, isCashbackIndex, isCashbackOffer, type CashbackOffer } from "../src/shared/cashback.js";
import { getActiveCardBenefits, getCardBenefitOffers, getFreeCards, osloDate, watchCardBenefitDate } from "../src/shared/card-benefits.js";
import { buildProviderMeta, FREE_CARDS, PROVIDER_TIPS } from "../src/shared/provider-data.js";
import { calculateCashback, calculateCashbackMaxKr } from "../src/shared/reward-calculation.js";
import { isCashbackFoundMessage, isOffersForUrlResponse } from "../src/shared/extension-messages.js";
import { createCashbackIndexCache, type CachedIndex } from "../src/extension/cashback-index-cache.js";

const generatedAt = "2026-10-23T12:00:00.000Z";
const logger = { info() {}, warn() {}, error() {} };
const months = ["Januar", "Februar", "Mars", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Desember"];
const descriptions = ["hjem og møbler", "hotell", "byggevarer", "bil", "hage", "klær", "alle kjøp", "hotell", "elektronikk", "sportsutstyr", "all netthandel", "alle kjøp"];
function catalogue(options: { count?: number; year?: number; rate?: number } = {}) {
  return `<html><body><script>throw new Error("must not execute")</script>
    <p>I oktober ${options.year ?? 2026} gir vi deg 5 % rabatt.</p>
    <p>Fast grønn rabatt i tillegg: Fast månedlig 5 % rabatt for kollektiv og elbillading.</p>
    ${months.slice(0, options.count ?? 12).map((month, index) => `<div class="elementor-icon-box-content">
      <h3><span>${month}</span></h3><p class="elementor-icon-box-description">${index === 6 || index === 11 ? 3 : options.rate ?? 5} % på ${descriptions[index]}</p></div>`).join("")}
    <div class="elementor-widget-text-editor"><p><strong>Oktober: Rabatt på sportsutstyr</strong></p><p>MCC-koder</p><ul><li>5941 – Sporting Goods Stores</li></ul></div>
    <ul><li>Maks rabatt pr måned er kr 500</li><li>Maks rabatt pr år er kr 3 000</li><li>Ved retur av kjøp motregnes eventuelt tildelt rabatt</li><li>Det beregnes ikke rabatt ved uttak, kontooverføringer eller regningsbetaling</li></ul>
    </body></html>`;
}
const costs = `<html><body><ul><li>Nominell rente 18,9 %</li><li>Termingebyr 40 kr</li><li>Valutapåslag 2 %</li></ul><p>Du har ikke har en rentefri periode.</p></body></html>`;

async function withSource(
  run: (urls: { startUrl: string; cardUrl: string }, requests: string[]) => Promise<void>,
  options: { body?: string; cardBody?: string; status?: number; disconnect?: string; transient?: boolean } = {},
) {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const path = request.url!;
    requests.push(path);
    const count = requests.filter((url) => url === path).length;
    if (options.disconnect === path && count === 1) { request.socket.destroy(); return; }
    if (options.transient && path === "/discounts" && count < 3) {
      response.writeHead(503, { "Content-Type": "text/html" }).end("temporarily unavailable");
      return;
    }
    response.writeHead(path === "/discounts" ? options.status ?? 200 : 200, { "Content-Type": "text/html" });
    response.end(path === "/discounts" ? options.body ?? catalogue() : options.cardBody ?? costs);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run({ startUrl: `http://127.0.0.1:${address.port}/discounts`, cardUrl: `http://127.0.0.1:${address.port}/card` }, requests);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function offersFromSource() {
  let offers: CashbackOffer[] = [];
  await withSource(async (urls) => { offers = await fetchInstabank({ ...urls, generatedAt, logger }); });
  return offers;
}

test("Instabank crawls the full calendar, actual rates, MCC terms and costs without inventing merchant mappings", async () => {
  await withSource(async (urls, requests) => {
    const offers = await fetchInstabank({ ...urls, generatedAt, logger });
    assert.equal(offers.length, 13);
    assert.deepEqual(requests, ["/discounts", "/card"]);
    assert.ok(offers.every(isCashbackOffer));
    assert.ok(offers.every((offer) => offer.domains.length === 0 && offer.activationUrl === "https://instabank.no/kredittkort"));
    const active = getActiveCardBenefits(offers, new Date(generatedAt));
    assert.deepEqual(active.map((offer) => [offer.reward, offer.cardBenefit?.category]), [["5 %", "sportsutstyr"], ["5 %", "kollektivtransport og elbillading"]]);
    const october = active[0]!;
    assert.deepEqual(october.cardBenefit, { kind: "monthly", category: "sportsutstyr", validFrom: "2026-10-01", validUntil: "2026-10-31" });
    for (const expected of ["5941", "500", "3 000", "40 kr", "18,9 %", "2 %", "Ingen rentefri periode", "Forskuddsbetaling", "ikke bekreftet", "Kilde:"]) assert.ok(october.terms.includes(expected), expected);
    assert.equal(calculateCashback(october, 10000), "");
    assert.equal(calculateCashbackMaxKr(october, 10000), 0);
    assert.equal(calculateCashback(active[1]!, 10000), "");
    assert.equal(offers.find((offer) => offer.cardBenefit?.validFrom === "2026-07-01")?.reward, "3 %");
    const index = buildCashbackIndex(offers, generatedAt, {}, buildProviderMeta());
    assert.ok(isCashbackIndex(index));
    assert.equal(getCardBenefitOffers(index.offers).length, 13);
    assert.equal(findOffersForHostname(index, "xxl.no").length, 0);
    assert.deepEqual(index.providers?.instabank, {
      name: "Instabank", bg: "#00ff85", fg: "#333f48", tip: buildProviderMeta().instabank!.tip,
    });
    assert.ok(isOffersForUrlResponse({ ok: true, offers: [], cardOffers: index.offers, providers: index.providers }));
    assert.ok(isCashbackFoundMessage({ type: "cashback-found", offers: [], cardOffers: index.offers, providers: index.providers }));
  });
});

test("calendar selection changes at Oslo midnight and never promotes an old year into a new one", async () => {
  const offers = await offersFromSource();
  assert.equal(osloDate(new Date("2026-10-31T22:59:59Z")), "2026-10-31");
  assert.equal(getActiveCardBenefits(offers, new Date("2026-10-31T22:59:59Z"))[0]?.cardBenefit?.category, "sportsutstyr");
  assert.equal(osloDate(new Date("2026-10-31T23:00:00Z")), "2026-11-01");
  assert.equal(getActiveCardBenefits(offers, new Date("2026-10-31T23:00:00Z"))[0]?.cardBenefit?.category, "all netthandel");
  assert.deepEqual(getActiveCardBenefits(offers, new Date("2026-11-08T12:00:01Z")), []);
  const refreshed = offers.map((offer) => ({ ...offer, updatedAt: "2026-12-31T12:00:00Z" }));
  assert.equal(getActiveCardBenefits(refreshed, new Date("2026-12-31T23:00:00Z")).filter((offer) => offer.cardBenefit?.kind === "monthly").length, 0);
});

test("invalid benefit metadata is rejected all the way through persisted indexes and extension messages", async () => {
  const [offer] = await offersFromSource();
  for (const cardBenefit of [
    { kind: "monthly", category: "sportsutstyr", validFrom: "2026-02-30", validUntil: "2026-03-01" },
    { kind: "monthly", category: "sportsutstyr", validFrom: "2026-11-01", validUntil: "2026-10-31" },
    { kind: "monthly", category: "", validFrom: "2026-10-01", validUntil: "2026-10-31" },
    { kind: "ongoing", category: "transport", validUntil: "yesterday" },
  ]) {
    const invalid = { ...offer!, cardBenefit };
    assert.equal(isCashbackOffer(invalid), false);
    assert.equal(isOffersForUrlResponse({ ok: true, offers: [], cardOffers: [invalid] }), false);
    assert.equal(isCashbackFoundMessage({ type: "cashback-found", offers: [], cardOffers: [invalid] }), false);
  }
});

test("the current benefit joins the free cards as a conditional card with this month, the next ones and the caps in its tooltip", async () => {
  const offers = await offersFromSource();
  const cards = getFreeCards(offers, new Date(generatedAt));
  assert.deepEqual(cards.slice(1), FREE_CARDS);
  const card = cards[0]!;
  assert.deepEqual({ ...card, tip: undefined }, {
    pct: 0.05, label: "Instabank", badge: "instabank", url: "https://instabank.no/kredittkort",
    approx: false, conditional: true, tip: undefined,
  });
  assert.deepEqual(card.tip.split("\n"), [
    "Oktober: 5 % på sportsutstyr",
    "November: 5 % på all netthandel",
    "Desember: 3 % på alle kjøp",
    "Alltid: 5 % på kollektivtransport og elbillading",
    "Maks rabatt pr måned er kr 500. Maks rabatt pr år er kr 3 000.",
    ...PROVIDER_TIPS.instabank!.split("\n"),
  ]);
  const december = offers.map((offer) => ({ ...offer, updatedAt: "2026-12-14T12:00:00.000Z" }));
  assert.equal(getFreeCards(december, new Date("2026-12-15T12:00:00Z"))[0]?.pct, 0.03);
  assert.equal(getFreeCards([], new Date(generatedAt)), FREE_CARDS);
  assert.equal(getFreeCards(offers, new Date("2026-11-08T12:00:01Z")), FREE_CARDS);
});

test("an already open page updates once when the Oslo date changes and the watcher can be disposed", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: new Date("2026-10-31T22:59:30Z") });
  let updates = 0;
  const dispose = watchCardBenefitDate(() => { updates++; });
  t.mock.timers.tick(60000);
  assert.equal(updates, 1);
  t.mock.timers.tick(60000);
  assert.equal(updates, 1);
  dispose();
  t.mock.timers.tick(86400000);
  assert.equal(updates, 1);
});

test("Crawlee retries dropped calendar and card connections and transient server errors", async () => {
  for (const options of [{ disconnect: "/discounts" }, { disconnect: "/card" }, { transient: true }]) {
    await withSource(async (urls, requests) => {
      const offers = await fetchInstabank({ ...urls, generatedAt, logger });
      assert.equal(offers.length, 13);
      assert.equal(requests.filter((url) => url === (options.disconnect ?? "/discounts")).length, options.transient ? 3 : 2);
    }, options);
  }
});

test("missing calendars, stale source years and missing financial terms fail for the bounded provider fallback", async () => {
  for (const options of [
    { body: catalogue({ count: 11 }) }, { body: catalogue({ year: 2025 }) },
    { cardBody: "<p>Ingen gebyropplysninger</p>" }, { status: 403 },
  ]) {
    await withSource(async (urls) => {
      await assert.rejects(fetchInstabank({ ...urls, generatedAt, logger }), /Instabank:/);
    }, options);
  }
  const offers = await offersFromSource();
  const recent = offers.map((offer) => ({ ...offer, updatedAt: new Date(Date.now() - 13 * 86400000).toISOString() }));
  const warnings: string[] = [];
  const collect = (previous: CashbackOffer[]) => collectProviderOffers({
    label: "Instabank", provider: "instabank", logger: { ...logger, warn: (message) => { warnings.push(message); } },
    fallbackWhenEmpty: true, reusePreviousOnFailure: true, maxPreviousOfferAgeDays: 14,
    previousOffersByProvider: new Map([["instabank", previous]]), run: () => { throw new Error("connection dropped"); },
  });
  assert.deepEqual(await collect(recent), recent);
  assert.deepEqual(await collect(recent.map((offer) => ({ ...offer, updatedAt: new Date(Date.now() - 15 * 86400000).toISOString() }))), []);
  assert.ok(warnings.some((message) => /14 day fallback limit/.test(message)));
});

test("older bundled indexes and caches update to Instabank and keep its metadata during an offline restart", async () => {
  const offers = await offersFromSource();
  const old = buildCashbackIndex([], "2026-10-22T12:00:00.000Z");
  const next = buildCashbackIndex(offers, generatedAt, {}, buildProviderMeta());
  let saved: CachedIndex | undefined = { downloadedAt: generatedAt, index: old };
  const options = {
    readBundled: async () => old, readCached: async () => saved,
    writeCached: async (value: CachedIndex) => { saved = value; }, fetchRemote: async () => next,
  };
  assert.equal(getActiveCardBenefits((await createCashbackIndexCache(options).get()).offers, new Date(generatedAt)).length, 2);
  const restarted = createCashbackIndexCache({ ...options, fetchRemote: async () => { throw new Error("offline"); } });
  const cached = await restarted.get();
  assert.equal(cached.providers?.instabank?.bg, "#00ff85");
  assert.equal(getCardBenefitOffers(cached.offers).length, 13);
});
