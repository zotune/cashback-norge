import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createTrustpilotClient, isFreshTrustpilotResult, isTrustpilotProfile, readTrustpilotPage, readTrustpilotSearch,
  TRUSTPILOT_CACHE_PREFIX, TRUSTPILOT_MAX_AGE_MS, trustpilotDomain, trustpilotPageDomain, trustpilotSearchUrl, type TrustpilotRequest, type TrustpilotResult } from "../src/shared/trustpilot.js";
import { isCaptureStoreReviewsMessage } from "../src/shared/extension-messages.js";
import { buildReviewAiPrompt } from "../src/shared/product-reviews.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/trustpilot-komplett.json", import.meta.url), "utf8"));
const html = (value: unknown = fixture.page) => `<script type="application/json" id="__NEXT_DATA__">${JSON.stringify(value)}</script>`;
const domain = "komplett.no";
const pageUrl = "https://no.trustpilot.com/review/www.komplett.no";
const now = Date.parse("2026-11-08T19:00:00Z");

function harness(request: TrustpilotRequest, initial?: TrustpilotResult) {
  let clock = now;
  const storage = new Map<string, unknown>(initial ? [[TRUSTPILOT_CACHE_PREFIX + domain, initial]] : []);
  const client = createTrustpilotClient({ request, now: () => clock, read: async (key) => storage.get(key), write: async (key, value) => { storage.set(key, value); } });
  return { client, storage, advance: (ms: number) => { clock += ms; } };
}

test("Trustpilot: exact domain, TrustScore rather than rounded stars, real profile links", () => {
  const profile = readTrustpilotSearch(fixture.search, domain)!;
  assert.equal(profile.score, 2.4);
  assert.equal(profile.count, 1661);
  assert.equal(profile.url, pageUrl);
  assert.equal(isTrustpilotProfile(profile), true);
  const wrong = structuredClone(fixture.search);
  wrong.businessUnits[0].identifyingName = "www.komplett.dk";
  assert.equal(readTrustpilotSearch(wrong, domain), undefined);
  wrong.businessUnits[0].identifyingName = "www.komplett.no";
  wrong.businessUnits[0].websiteUrl = "https://komplett.no.evil.example";
  assert.equal(readTrustpilotSearch(wrong, domain), undefined);
  for (const score of [undefined, null, "2.4", 0, -1, 6, Infinity]) {
    const data = structuredClone(fixture.search); data.businessUnits[0].score.trustScore = score;
    assert.equal(readTrustpilotSearch(data, domain), undefined);
  }
  assert.throws(() => readTrustpilotSearch({ reviews: [] }, domain), /format/);
});

test("Trustpilot page: bounded recent reviews, explicit verification and replies; no script execution", () => {
  const profile = readTrustpilotPage(html(), domain)!;
  assert.equal(profile.reviews.length, 3);
  assert.equal(profile.reviews[0]?.verified, true);
  assert.equal(profile.reviews[1]?.verified, false);
  assert.equal(profile.reviews[1]?.reply, "Takk for tilbakemeldingen.");
  assert.equal(readTrustpilotPage(html(), "komplett.dk"), undefined);
  assert.equal(readTrustpilotPage('<script id="__NEXT_DATA__">not json</script>', domain), undefined);
  assert.equal(readTrustpilotPage("<h1>Verifying your connection</h1>", domain), undefined);
  const data = structuredClone(fixture.page);
  data.props.pageProps.reviews[0].isPending = true;
  data.props.pageProps.reviews[1].filtered = true;
  data.props.pageProps.reviews[2].rating = 99;
  assert.equal(readTrustpilotPage(html(data), domain)?.reviews.length, 0);
});

test("Trustpilot URLs and message validation prevent unrelated pages from seeding a store rating", async () => {
  assert.equal(trustpilotDomain("https://www.komplett.no/product/123?secret=1"), domain);
  assert.equal(trustpilotDomain("http://localhost"), undefined);
  assert.equal(trustpilotDomain("https://127.0.0.1"), undefined);
  assert.equal(trustpilotDomain("https://user:password@komplett.no"), undefined);
  assert.equal(trustpilotPageDomain(pageUrl), domain);
  for (const url of ["https://evil.example/review/www.komplett.no", "https://no.trustpilot.com/reviews/1", "http://no.trustpilot.com/review/komplett.no", "https://no.trustpilot.com/review/komplett.no/transparency"]) assert.equal(trustpilotPageDomain(url), undefined);
  assert.equal(new URL(trustpilotSearchUrl(domain)).searchParams.get("query"), domain);
  const profile = readTrustpilotPage(html(), domain)!;
  const { client, storage } = harness(async () => { throw new Error("unused"); });
  assert.equal(await client.capture(profile, "https://www.komplett.no"), undefined);
  assert.equal(await client.capture(profile, "https://no.trustpilot.com/review/komplett.dk"), undefined);
  assert.equal(storage.size, 0);
  assert.ok(await client.capture(profile, pageUrl));
  assert.equal(isCaptureStoreReviewsMessage({ type: "capture-store-reviews", profile: { ...profile, url: "https://evil.example" } }), false);
  assert.equal(isCaptureStoreReviewsMessage({ type: "capture-store-reviews", profile: { ...profile, reviews: [{ ...profile.reviews[0], verified: "true" }] } }), false);
});

test("shared client: API first, one profile, concurrent calls coalesced and 24h cache retained on restart", async () => {
  const urls: string[] = [];
  const request: TrustpilotRequest = async (url) => { urls.push(url); return { status: 200, text: url.includes("/api/") ? JSON.stringify(fixture.search) : html() }; };
  const { client, storage, advance } = harness(request);
  const results = await Promise.all([client.get(domain), client.get(domain)]);
  assert.equal(urls.length, 2);
  assert.equal(results[0]?.status, "ok");
  assert.deepEqual(results[0], results[1]);
  if (results[0]?.status === "ok") assert.equal(results[0].profile.reviews.length, 3);
  await client.get(domain); assert.equal(urls.length, 2);
  const restarted = createTrustpilotClient({ read: async (key) => storage.get(key), write: async () => {}, request: async () => { throw new Error("offline"); }, now: () => now });
  assert.deepEqual(await restarted.get(domain), results[0]);
  advance(TRUSTPILOT_MAX_AGE_MS);
  await client.get(domain); assert.equal(urls.length, 4);
  assert.equal(isFreshTrustpilotResult(results[0], domain, now - 1), false);
  assert.equal(isFreshTrustpilotResult(results[0], "another.no", now), false);
});

test("WAF and rate limits: no false zero/empty result, no retry on 403/429, bounded failure cache", async () => {
  for (const status of [403, 429]) {
    let calls = 0;
    const { client, advance } = harness(async () => { calls++; return { status, text: "<h1>Verifying connection</h1>" }; });
    const result = await client.get(domain);
    assert.equal(result?.status, "blocked");
    if (result?.status !== "ok") assert.match(result?.reason ?? "", new RegExp(String(status)));
    assert.equal(calls, status === 429 ? 1 : 2);
    await client.get(domain); assert.equal(calls, status === 429 ? 1 : 2);
    advance(5 * 60 * 1000); await client.get(domain);
    assert.equal(calls, status === 429 ? 2 : 4);
  }
});

test("failure modes: bounded 5xx/network retries, format failure differs from no match, profile fallback", async () => {
  for (const failure of ["503", "connection closed", "timeout"]) {
    let calls = 0;
    const { client } = harness(async () => { calls++; if (failure === "503") return { status: 503, text: "" }; throw new Error(failure); });
    const result = await client.get(domain);
    assert.equal(result?.status, "unavailable");
    assert.equal(calls, 4);
    if (result?.status !== "ok") assert.match(result?.reason ?? "", /Trustpilot.*profilsiden/);
  }
  const mismatch = harness(async (url) => ({ status: url.includes("/api/") ? 200 : 404, text: JSON.stringify({ businessUnits: [] }) }));
  assert.equal((await mismatch.client.get(domain))?.status, "not-found");
  const malformed = harness(async () => ({ status: 200, text: "{}" }));
  assert.equal((await malformed.client.get(domain))?.status, "unavailable");
  const fallback = harness(async (url) => ({ status: url.includes("/api/") ? 403 : 200, text: html() }));
  assert.equal((await fallback.client.get(domain))?.status, "ok");
  const summaryOnly = harness(async (url) => ({ status: url.includes("/api/") ? 200 : 403, text: JSON.stringify(fixture.search) }));
  const result = await summaryOnly.client.get(domain);
  assert.equal(result?.status, "ok");
  if (result?.status === "ok") assert.deepEqual(result.profile.reviews, []);
});

test("an open profile captured during a blocked lookup wins over the failed request", async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const { client } = harness(async () => { await blocked; return { status: 403, text: "" }; });
  const pending = client.get(domain);
  await new Promise((resolve) => setImmediate(resolve));
  const captured = await client.capture(readTrustpilotPage(html(), domain)!, pageUrl);
  release();
  assert.deepEqual(await pending, captured);
});

test("AI copy identifies TrustScore as a separate shop score with the correct source", () => {
  const prompt = buildReviewAiPrompt({ productName: "Test", summary: { critics: [], users: [], userCount: 0 }, store: readTrustpilotPage(html(), domain)!, date: "8. nov. 2026" });
  assert.match(prompt, /Trustpilot \(TrustScore/);
  assert.doesNotMatch(prompt, /hos Prisjakt/);
});
