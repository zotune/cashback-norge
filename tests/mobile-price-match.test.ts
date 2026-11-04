import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { findMobilePriceMatches, isMobilePriceDetails, mobileTierLabel } from "../src/shared/mobile-price-match.js";
import { buildMobileSupplierCatalog, findMobileSupplier, isMobileSupplierCatalog } from "../src/shared/mobile-suppliers.js";
import { getTekCataloguePlans, tekPlansUrl } from "../src/shared/tek-mobile-api.js";
import { findPriceMatches } from "../src/shared/price-match.js";
import { isGetPriceMatchForProductMessage } from "../src/shared/extension-messages.js";
import { createPublicCatalogStore } from "../src/shared/public-catalog.js";
const fixture = () => JSON.parse(readFileSync(new URL("./fixtures/tek-mobile.json", import.meta.url), "utf8"));
const networkFixture = () => JSON.parse(readFileSync(new URL("./fixtures/tek-mobile-networks.json", import.meta.url), "utf8"));
const message = { type: "get-price-match-for-product" as const, url: "https://www.ice.no/", searchTerm: "Mobilabonnement", mobile: true };
function transport(value = fixture(), calls: string[] = []) {
  return async (url: string, init?: { credentials?: RequestCredentials }) => {
    calls.push(url); assert.equal(init?.credentials, "omit");
    const u = new URL(url);
    const gb = String(Number(u.searchParams.get("usage[data]")) / 1000);
    const key = u.pathname.endsWith("mobile-broadband-plans") ? `broadband:${gb}` : gb;
    const network = u.searchParams.get("filter[network]");
    return network ? networkFixture()[`${key}:${network}`] : value[key];
  };
}

test("Tek: separate rows and correctly scoped alternatives for every data bracket, unlimited and optional broadband", async () => {
  const calls: string[] = [];
  let htmlCalls = 0;
  const offers = await findPriceMatches(message, transport(fixture(), calls), async () => { htmlCalls++; throw new Error("No campaign HTML should be requested"); });
  assert.equal(htmlCalls, 0);
  assert.ok(calls.length <= 27); assert.equal(new Set(calls).size, calls.length);
  assert.ok(calls.some((url) => new URL(url).searchParams.get("filter[network]") === "3"));
  assert.equal(offers[0]!.mobile?.requestedGb, 0);
  assert.deepEqual(offers.filter((x) => x.mobile?.category === "mobile").map((x) => x.mobile?.requestedGb), [0, 5, 10, 20, 30, 50]);
  const ten = offers.find((x) => x.mobile?.requestedGb === 10 && x.mobile.category === "mobile")!;
  assert.equal(ten.source, "tek"); assert.equal(ten.amount, 198);
  assert.equal(ten.mobile?.unlimitedData, false);
  assert.equal(mobileTierLabel(ten.mobile!), "≥10 GB");
  assert.equal(new URL(ten.productUrl).searchParams.get("data"), "10000");
  const five = offers.find((x) => x.mobile?.requestedGb === 5)!;
  assert.equal(new URL(five.productUrl).searchParams.get("data"), "5000");
  for (const offer of offers) {
    assert.ok(isMobilePriceDetails(offer.mobile));
    assert.ok(offer.alternatives!.length > 0 && offer.alternatives!.length <= 3);
    assert.deepEqual(offer.alternatives!.map((x) => x.mobile!.networkId).sort(), [1, 2, 3]);
    assert.ok(offer.alternatives!.every((x) => x.mobile?.category === offer.mobile?.category && x.mobile?.requestedGb === offer.mobile?.requestedGb));
  }
  const unlimited = offers.find((x) => x.mobile?.category === "unlimited")!;
  assert.match(unlimited.shopName, /fri data/i); assert.equal(unlimited.mobile?.speedMbps, 15); assert.equal(unlimited.mobile?.afterQuotaMbps, 3);
  assert.equal(unlimited.mobile?.unlimitedData, true);
  assert.equal(offers.at(-1)!.mobile?.category, "unlimited");
  assert.equal(offers.find((x) => x.mobile?.requestedGb === 50)!.mobile?.unlimitedData, true);
  assert.ok(!offers.some((offer) => offer.mobile?.category === "broadband"));
  const zero = offers[0]!;
  assert.equal(zero.amount, 70); assert.equal(zero.productName, "Happybytes");
  assert.equal(zero.mobile?.meteredData, true); assert.equal(zero.mobile?.includedGb, 0);
  assert.equal(mobileTierLabel(zero.mobile!), "0 GB"); assert.equal(zero.mobileBroadband, undefined);
  for (const offer of offers.slice(1)) {
    assert.equal(offer.mobileBroadband?.mobile?.category, "broadband");
    assert.equal(offer.mobileBroadband?.mobile?.requestedGb, offer.mobile?.requestedGb);
    assert.ok(isMobilePriceDetails(offer.mobileBroadband?.mobile));
  }
  assert.equal(offers.find((x) => x.mobile?.requestedGb === 30)!.amount, 297);
  assert.ok(!offers.some((x) => (x.mobile?.category as string) === "trial"));
  assert.ok(isGetPriceMatchForProductMessage(message));
  assert.ok(!isGetPriceMatchForProductMessage({ ...message, mobile: "yes" }));
});

test("Tek: a larger allowance can win a minimum-data bracket without being labelled as the requested quantity", async () => {
  const data = fixture();
  data[10].data[0].estimatedInvoice.total = 30000;
  data[10].data[1].estimatedInvoice.total = 30000;
  const ten = (await findMobilePriceMatches(message, transport(data))).find((offer) => offer.mobile?.category === "mobile" && offer.mobile.requestedGb === 10)!;
  assert.equal(ten.amount, 228); assert.equal(ten.mobile!.requestedGb, 10);
  assert.equal(ten.mobile!.includedGb, 12); assert.equal(ten.mobile!.unlimitedData, false);
  assert.equal(mobileTierLabel(ten.mobile!), "≥10 GB");
});

test("Tek: a missing-network failure leaves the other networks, and a wrongly filtered response is not accepted", async () => {
  const base = transport();
  const offers = await findMobilePriceMatches(message, async (url, init) => {
    if (new URL(url).searchParams.get("filter[network]") === "3") throw new Error("HTTP 503");
    return base(url, init);
  });
  const ten = offers.find((offer) => offer.mobile?.category === "mobile" && offer.mobile.requestedGb === 10)!;
  assert.deepEqual(ten.alternatives!.map((plan) => plan.mobile!.networkId).sort(), [1, 2]);
  assert.match(ten.details!, /Ice: HTTP 503/);
  const invalid = await findMobilePriceMatches(message, async (url, init) => {
    if (new URL(url).searchParams.get("filter[network]") === "3") return fixture()[10];
    return base(url, init);
  });
  assert.match(invalid.find((offer) => offer.mobile?.requestedGb === 10)!.details!, /feil mobilnett/);
});

test("Tek: usage estimate includes extra costs; never substitute the lower base fee or a sponsor priority", async () => {
  const data = fixture();
  const first = data[10].data[0]; first.estimatedInvoice.total = 29900; first.pricingModel.attributes.monthlyFee = "9900"; first.promoted = true;
  const offer = (await findMobilePriceMatches(message, transport(data))).find((x) => x.mobile?.requestedGb === 10);
  assert.equal(offer!.amount, 199); assert.equal(offer!.productName, "Verimo");
});

test("Tek: reject youth, family, prepaid, unsuitable usage, missing/nonfinite prices and wrong product type", async () => {
  for (const alter of [
    (r: any) => { r.features = [{ slug: "for-unge" }]; },
    (r: any) => { r.features = [{ slug: "familie" }]; },
    (r: any) => { r.features = [{ slug: "kontantkort" }]; },
    (r: any) => { r.estimatedInvoice.meetsUsageRequirements = false; },
    (r: any) => { delete r.estimatedInvoice.total; },
    (r: any) => { r.estimatedInvoice.total = Infinity; },
    (r: any) => { r.type = "mobile-broadband-plan"; },
  ]) {
    const data = fixture(); data[10].data.forEach(alter);
    const offers = await findMobilePriceMatches(message, transport(data));
    assert.ok(!offers.some((x) => x.mobile?.requestedGb === 10 && x.mobile.category === "mobile"));
    assert.ok(offers.some((x) => x.mobile?.requestedGb === 5));
  }
  assert.ok(!isMobilePriceDetails({ category: "mobile", requestedGb: 10, includedGb: NaN, network: "Ice" }));
});

test("Tek: one failed bracket/optional source does not hide 10 GB; rate limits stop subsequent Tek requests", async () => {
  const calls: string[] = [];
  const request = transport(fixture(), calls);
  const offers = await findMobilePriceMatches(message, async (url, init) => {
    if (url === tekPlansUrl(20)) throw new Error("HTTP 500"); return request(url, init);
  });
  const partial = offers.find((x) => x.mobile?.requestedGb === 10)!;
  assert.equal(partial.amount, 198); assert.match(partial.details!, /Ufullstendig oppslag/);
  let count = 0;
  await assert.rejects(findMobilePriceMatches(message, async () => { count++; throw new Error("HTTP 429"); }), /HTTP 429/);
  assert.equal(count, 2);
  await assert.rejects(findMobilePriceMatches(message, async () => ({})), /ugyldig plansvar/);
});

test("Tek: optional broadband failure keeps the mobile results and zero-data needs no broadband query", async () => {
  const calls: string[] = [];
  const base = transport(fixture(), calls);
  const offers = await findMobilePriceMatches(message, async (url, init) => {
    if (new URL(url).pathname.endsWith("mobile-broadband-plans")) throw new Error("HTTP 503");
    return base(url, init);
  });
  assert.equal(offers.length, 7);
  assert.ok(offers.every((offer) => offer.mobileBroadband === undefined));
  assert.equal(offers[0]!.amount, 70);
  assert.match(offers.find((offer) => offer.mobile?.requestedGb === 10)!.details!, /Mobilt bredbånd: HTTP 503/);
  assert.ok(!calls.some((url) => new URL(url).pathname.endsWith("mobile-broadband-plans") && new URL(url).searchParams.get("usage[data]") === "0"));
});

test("Tek domains: derive active operators from explicit destinations, never tracker/logo/name guesses", async () => {
  const rows = fixture()[10].data;
  rows[0].affiliateSignupUrl = "https://bestilling.plussmobil.no/order?campaign=public";
  rows[1].affiliateSignupUrl = "https://linkfusion.no/track?url=https%3A%2F%2Fbestilling.verimo.no%2F";
  const cat = buildMobileSupplierCatalog(rows, new Date().toISOString());
  assert.ok(isMobileSupplierCatalog(cat));
  assert.equal(findMobileSupplier("https://www.plussmobil.no/", cat)?.name, "PlussMobil");
  assert.equal(findMobileSupplier("https://verimo.no/", cat)?.name, "Verimo");
  for (const url of ["https://linkfusion.no/", "https://evil.plussmobil.no/", "https://plussmobil.no/minside/", "https://plussmobil.no.evil.com/"]) assert.equal(findMobileSupplier(url, cat), undefined);
  const old = { ...cat, generatedAt: new Date(Date.now() - 15 * 86_400_000).toISOString() };
  assert.equal(findMobileSupplier("https://plussmobil.no/", old), undefined);
  assert.throws(() => buildMobileSupplierCatalog(rows.map((r: any) => ({ ...r, affiliateSignupUrl: "https://ad-tracker.no/", logo: "https://plussmobil.no/image.png" })), new Date().toISOString()), /ingen verifiserte/);
  let count = 0;
  await assert.rejects(getTekCataloguePlans(async () => { count++; return { data: [], meta: { last_page: 9 } }; }), /8 sider/);
  assert.equal(count, 1);
});

test("shared catalogue store: offline restart preserves newer cache and original timestamp", async () => {
  const bundle = JSON.parse(readFileSync(new URL("../data/mobile-suppliers.json", import.meta.url), "utf8"));
  const newer = { ...bundle, generatedAt: new Date(Date.now() + 1000).toISOString() };
  let saved: unknown;
  const store = createPublicCatalogStore(bundle, isMobileSupplierCatalog);
  await store.load(async () => { throw new Error("offline"); }, { read: async () => newer, write: async (value) => { saved = value; } });
  assert.equal(store.get()?.generatedAt, newer.generatedAt); assert.deepEqual(saved, newer);
});
