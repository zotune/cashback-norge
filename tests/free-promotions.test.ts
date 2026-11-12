import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { test } from "node:test";
import { buildCashbackIndex, findOffersForHostname, isCashbackOffer, isCashbackIndex, uniqueOffers } from "../src/shared/cashback.js";
import { readFreePromotion } from "../src/shared/free-promotions.js";
import { matchesOfferQuickFilter, matchesOfferQuickFilters } from "../src/shared/offer-filters.js";
import { getVisibleOfferKey } from "../src/shared/offer-context.js";
import { calculateCashback, calculateCashbackMaxKr, formatCompactRewardLabel, formatRewardLabel, getMaxRewardPercent } from "../src/shared/reward-calculation.js";
import { buildProviderMeta } from "../src/shared/provider-data.js";
import { fetchGratis, fetchGjerrigknark, readFreeOffers, type FreeOffersInput } from "../src/backend/providers/free-offers.js";
import { fetchSparelosen, readSparelosenPlans } from "../src/backend/providers/sparelosen.js";
import { promotionDomains } from "../src/backend/providers/promotion-domains.js";
import { readProviderOverrides } from "../src/backend/provider-overrides.js";
import { collectProviderOffers } from "../src/backend/provider-offers.js";
import { createCashbackIndexCache, type CachedIndex } from "../src/extension/cashback-index-cache.js";

const generatedAt = "2026-11-07T12:00:00.000Z";
const logger = { info() {}, warn() {}, error() {} };
const input: FreeOffersInput = {
  generatedAt, logger, overrides: await readProviderOverrides("data/provider-overrides.json"),
  domainLookup: new Map([["fabel", ["fabel.no"]], ["ice", ["ice.no"]]]),
};
const fixture = async (name: string) => JSON.parse(await readFile(`tests/fixtures/free-promotions/${name}.json`, "utf8"));
const gratis = await fixture("gratis");
const gk = await fixture("gk");
const plans = await fixture("sparelosen");
const script = (data: unknown) => `const plans=JSON.parse(\`${JSON.stringify(data)}\`); throw new Error("must never execute third-party code");`;

test("free benefits use explicit zero prices; gift values, postage, points and purchases do not become cashback", () => {
  assert.deepEqual(readFreePromotion("Fabel gratis i 6 uker", "Deretter 199 kr/mnd. Må sies opp."), { label: "6 uker gratis", priceNok: 0 });
  assert.deepEqual(readFreePromotion("BookBeat gratis i 60 dager", "For nye kunder."), { label: "60 dager gratis", priceNok: 0 });
  assert.deepEqual(readFreePromotion("Gratis bursdagsgave verdt 500 kr", "Krever kundeklubb."), { label: "Gratis", priceNok: 0 });
  for (const text of ["Du betaler porto", "Porto må dekkes", "Frakt koster 29 kr", "Porto og ekspedisjon tilkommer", "Få gaven ved kjøp over 300 kr", "Øvrige vilkår ukjent."]) {
    assert.equal(readFreePromotion("Gratis gave", text)?.priceNok, undefined, text);
  }
  assert.equal(readFreePromotion("Gratis gave", "59 kr i porto, ingen kjøpeplikt")?.priceNok, 59);
  assert.equal(readFreePromotion("Prøvepakke for 169 kr med fri frakt", "Verdi 599 kr")?.priceNok, 169);
  assert.equal(readFreePromotion("Konkurranse: vinn gratis ting", ""), undefined);
  assert.equal(readFreePromotion("2000 poeng gratis", ""), undefined);
  assert.equal(readFreePromotion("150 kroner gratis til Foodora", "Minstekjøp 300 kr"), undefined);
  assert.equal(readFreePromotion("Gratis gave", "Ingen kjøpsplikt eller porto.")?.priceNok, 0);
});

test("real Gratis JSON carries free periods, paid postage and full conditions through the shared index", () => {
  const offers = readFreeOffers(gratis, "gratis", input);
  const fabel = offers.find((offer) => offer.merchantName === "Fabel")!;
  assert.equal(fabel.reward, "0 kr totalsum");
  // Data keeps the shared "0 kr totalsum" standard; clients show "Gratis",
  // and a free trial keeps its period.
  assert.equal(formatCompactRewardLabel(fabel), "6 uker gratis");
  assert.equal(formatCompactRewardLabel({ ...fabel, promotion: { label: "Gratis", priceNok: 0 } }), "Gratis");
  assert.equal(formatRewardLabel(fabel.reward, fabel.provider), "Gratis");
  assert.equal(formatCompactRewardLabel({ ...fabel, promotion: undefined }), "Gratis");
  // A paid fixed price is not free.
  assert.equal(formatCompactRewardLabel({ ...fabel, promotion: undefined, reward: "45 kr totalsum" }), "45 kr totalsum");
  assert.equal(formatRewardLabel("10 kr totalsum", "studenttorget"), "10 kr totalsum");
  assert.match(fabel.terms, /betalt periode|betalt abonnement/);
  assert.match(fabel.terms, /ikke kontrollert av Cashback Norge/);
  assert.equal(fabel.activationUrl, fabel.sourceUrl);
  assert.equal(matchesOfferQuickFilter(fabel, "gratis"), true);
  const disney = offers.find((offer) => offer.merchantName === "Disneyklubben")!;
  assert.equal(disney.promotion?.priceNok, 59);
  assert.equal(matchesOfferQuickFilter(disney, "gratis"), false);
  assert.ok(offers.filter((offer) => offer.merchantName === "Bestselgerklubben").every((offer) => !matchesOfferQuickFilter(offer, "gratis")));
  assert.ok(offers.every(isCashbackOffer));
  for (const offer of offers) {
    assert.equal(calculateCashback(offer, 1000), "");
    assert.equal(calculateCashbackMaxKr(offer, 1000), 0);
    assert.equal(getMaxRewardPercent(offer), 0);
  }
  const index = buildCashbackIndex(offers, generatedAt, {}, buildProviderMeta());
  assert.equal(isCashbackIndex(index), true);
  assert.equal(findOffersForHostname(index, "registrering.fabel.no")[0]?.promotion?.label, "6 uker gratis");
  assert.deepEqual(index.providers?.gratis && [index.providers.gratis.name, index.providers.gratis.bg, index.providers.gratis.fg], ["Gratis", "#ffdd00", "#000000"]);
  assert.equal(index.providers?.sparelosen?.bg, "#00473f");
  assert.equal(index.providers?.gjerrigknark?.fg, "#000000");
  assert.equal(index.providers?.gjerrigknark?.bg, "#b4d8d8");
  assert.equal(isCashbackOffer({ ...fabel, promotion: { label: "Gratis", priceNok: -1 } }), false);
  assert.equal(isCashbackOffer({ ...fabel, promotion: { label: "Gratis", priceNok: Infinity } }), false);
  assert.equal(isCashbackOffer({ ...fabel, promotion: { label: "" } }), false);
});

test("inactive, unpublished, expired and malformed source rows are excluded; schema changes trigger fallback", () => {
  const base = gratis.result.find((row: any) => row.source?.link?.provider === "Fabel");
  for (const change of [{ active: false }, { visible: false }, { publish_time: "2030-01-01" }, { valid_until_time: "2026-11-06" }, { valid_until_time: "invalid" }]) {
    assert.deepEqual(readFreeOffers({ result: [{ ...base, source: { ...base.source, ...change } }] }, "gratis", input), []);
  }
  assert.throws(() => readFreeOffers({ items: [] }, "gratis", input), /schema/);
  assert.throws(() => readFreeOffers({ result: [{ title: null }] }, "gratis", input), /schema/);
  assert.throws(() => readFreeOffers({ result: Array(251).fill(base) }, "gratis", input), /250/);
});

test("Gjerrigknark reads structured descriptions without mistaking postage or discount thresholds for free trials", () => {
  const offers = readFreeOffers(gk, "gjerrigknark", input);
  assert.equal(offers.find((offer) => offer.merchantName === "Fabel")?.promotion?.priceNok, 0);
  assert.equal(offers.find((offer) => offer.merchantName === "Medical.no")?.promotion?.priceNok, undefined);
  assert.equal(offers.some((offer) => offer.merchantName === "Foodora"), false);
});

test("Sparelosen includes only marked campaigns, keeps subscription prices and separate plan identities", () => {
  const offers = readSparelosenPlans(script(plans), input);
  assert.equal(offers.length, 3);
  const ice = offers.find((offer) => offer.merchantName === "Ice")!;
  assert.equal(ice.promotion?.label, "99 kr/mnd i 2 mnd");
  assert.equal(ice.promotion?.priceNok, 99);
  assert.equal(ice.reward, "Prøvetilbud", "older clients must not read the subscription price as cashback");
  assert.equal(matchesOfferQuickFilter(ice, "mobil"), true);
  assert.equal(matchesOfferQuickFilters(ice, ["mobil", "gratis"]), false);
  assert.equal(matchesOfferQuickFilter({ ...ice, promotion: { label: "Gratis i 2 mnd", priceNok: 0 } }, "gratis"), true);
  assert.equal(matchesOfferQuickFilter({ ...ice, promotion: undefined, reward: "0 kr totalsum", provider: "gratisbursdag" } as any, "gratis"), true);
  assert.equal(matchesOfferQuickFilter({ ...ice, promotion: undefined, reward: "30 %", provider: "gratisbursdag" } as any, "gratis"), false);
  const second = { ...ice, promotion: { ...ice.promotion!, id: "other-plan" } };
  assert.notEqual(getVisibleOfferKey(ice), getVisibleOfferKey(second));
  assert.equal(uniqueOffers([ice, ice, second]).length, 2);
  for (const price of ["", "unknown", -1, null]) {
    assert.equal(readSparelosenPlans(script([{ ...plans[0], Price: price, Trial: "Yes" }]), input).length, 0);
  }
  assert.throws(() => readSparelosenPlans("window.plans=[]", input), /schema/);
});

test("merchant domains use overrides and verified destinations; trackers never create merchant notifications", () => {
  const resolve = (merchantName: string, destination: string) => promotionDomains({ ...input, provider: "gratis", merchantName, destination });
  assert.deepEqual(resolve("Fabel", "https://ssormed.com/click.track?CID=1"), ["fabel.no"]);
  assert.deepEqual(resolve("Unknown", "https://ssormed.com/click.track?CID=1"), []);
  assert.deepEqual(resolve("Nextory", "https://go.adt242.com/t/t?url=https%3A%2F%2Fwww.nextory.no%2Fsignup"), ["nextory.no"]);
  assert.deepEqual(resolve("Ice", "https://service.no"), ["ice.no"]);
  assert.deepEqual(resolve("Unknown", "https://unknown.evil.com"), []);
  assert.deepEqual(promotionDomains({ ...input, provider: "gratis", merchantName: "Fabel", destination: "https://fabel.no", overrides: { ...input.overrides, gratis: { fabel: [] } } }), []);
});

async function withServer(handler: (request: IncomingMessage, response: ServerResponse) => void, run: (url: string) => Promise<void>) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try { await run(`http://127.0.0.1:${address.port}/`); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
}

test("Crawlee retries transient HTTP errors and discovers only the current first-party Sparelosen component", async () => {
  let attempts = 0;
  await withServer((_request, response) => {
    attempts++;
    response.setHeader("Content-Type", "application/json");
    response.statusCode = attempts < 3 ? 500 : 200;
    response.end(JSON.stringify(gratis));
  }, async (startUrl) => {
    assert.ok((await fetchGratis({ ...input, startUrl })).length);
    assert.equal(attempts, 3);
  });
  const urls: string[] = [];
  await withServer((request, response) => {
    urls.push(request.url!);
    if (request.url?.endsWith(".js")) { response.setHeader("Content-Type", "application/javascript"); response.end(script(plans)); }
    else { response.setHeader("Content-Type", "text/html"); response.end(request.url === "/" ? '<a href="/mobilabonnement/">Mobil</a>' : '<astro-island component-url="/_astro/MobilKalk.current-hash.js"></astro-island><script src="https://unrelated.invalid/test.js"></script>'); }
  }, async (startUrl) => {
    assert.equal((await fetchSparelosen({ ...input, startUrl })).length, 3);
    assert.deepEqual(urls, ["/", "/mobilabonnement/", "/_astro/MobilKalk.current-hash.js"]);
  });
});

test("permanent errors, malformed JSON, disconnects and timeouts are bounded; one failed provider retains only fresh cached data", async () => {
  for (const mode of ["429", "json", "disconnect", "timeout"] as const) {
    let attempts = 0;
    await withServer((request, response) => {
      attempts++;
      if (mode === "disconnect") { request.socket.destroy(); return; }
      if (mode === "timeout") return;
      response.setHeader("Content-Type", "application/json");
      response.statusCode = mode === "429" ? 429 : 200;
      response.end("invalid json");
    }, async (startUrl) => {
      await assert.rejects(fetchGjerrigknark({ ...input, startUrl, timeoutSecs: 1 }), /gjerrigknark: .*failed after retries/);
      assert.equal(attempts, 3, mode);
    });
  }
  const previous = readFreeOffers(gratis, "gratis", input);
  const collect = (updatedAt: string) => collectProviderOffers({
    provider: "gratis", label: "Gratis", logger, fallbackWhenEmpty: true, reusePreviousOnFailure: true,
    maxPreviousOfferAgeDays: 14, previousOffersByProvider: new Map([["gratis", previous.map((offer) => ({ ...offer, updatedAt }))]]),
    run: () => { throw new Error("HTTP 429"); },
  });
  const recent = new Date(Date.now() - 86400000).toISOString();
  assert.ok((await collect(recent)).every((offer) => offer.updatedAt === recent));
  assert.deepEqual(await collect("2020-01-01T00:00:00.000Z"), []);
  assert.ok(readSparelosenPlans(script(plans), input).length);
});

test("an extension with an older bundled index loads new provider metadata and keeps newer promotions after restart", async () => {
  const current = buildCashbackIndex(readFreeOffers(gratis, "gratis", input), generatedAt, {}, buildProviderMeta());
  const old = buildCashbackIndex([], "2026-11-01T06:00:00.000Z");
  let saved: CachedIndex | undefined;
  const cache = createCashbackIndexCache({ readBundled: async () => old, readCached: async () => undefined,
    writeCached: async (value) => { saved = value; }, fetchRemote: async () => current });
  assert.equal(findOffersForHostname(await cache.get(), "fabel.no")[0]?.promotion?.priceNok, 0);
  assert.equal(saved?.index.providers?.gratis?.bg, "#ffdd00");
  const restarted = createCashbackIndexCache({ readBundled: async () => old, readCached: async () => saved,
    writeCached: async () => {}, fetchRemote: async () => { throw new Error("offline"); } });
  assert.equal(findOffersForHostname(await restarted.get(), "fabel.no")[0]?.promotion?.label, "6 uker gratis");
});
