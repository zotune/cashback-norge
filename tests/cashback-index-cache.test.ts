import assert from "node:assert/strict";
import { test } from "node:test";
import { createCashbackIndexCache, type CachedIndex } from "../src/extension/cashback-index-cache.js";
import { buildCashbackIndex, findOffersForHostname } from "../src/shared/cashback.js";
import { buildProviderMeta } from "../src/shared/provider-data.js";

const oldIndex = buildCashbackIndex([], "2026-10-17T06:00:00.000Z");
const cachedIndex = buildCashbackIndex([], "2026-10-18T06:00:00.000Z");
const newIndex = buildCashbackIndex([{
  provider: "gratisbursdag", merchantName: "Godt Brød", domains: ["godtbrod.no"], reward: "0 kr totalsum",
  terms: "Kaffe og bolle. Krever Bakekompis-medlemskap.", sourceUrl: "https://gratisbursdag.no/",
  activationUrl: "https://gratisbursdag.no/", updatedAt: "2026-10-19T06:00:00.000Z",
}], "2026-10-19T06:00:00.000Z", {}, buildProviderMeta());
const now = Date.parse("2026-10-19T08:00:00.000Z");

test("the first lookup awaits the published index even when yesterday's cache was downloaded recently", async () => {
  let written: CachedIndex | undefined;
  const cache = createCashbackIndexCache({
    now: () => now,
    readBundled: async () => oldIndex,
    readCached: async () => ({ downloadedAt: new Date(now).toISOString(), index: cachedIndex }),
    writeCached: async (value) => { written = value; },
    fetchRemote: async () => newIndex,
  });
  const offers = findOffersForHostname(await cache.get(), "www.godtbrod.no");
  assert.equal(offers.length, 1);
  assert.equal(offers[0]!.provider, "gratisbursdag");
  assert.equal(written?.index.providers?.gratisbursdag?.name, "Gratis bursdag");
});

test("restarting offline keeps the newer cached offers instead of replacing them with the bundled index", async () => {
  const writes: CachedIndex[] = [];
  const cache = createCashbackIndexCache({
    now: () => now,
    readBundled: async () => oldIndex,
    readCached: async () => ({ downloadedAt: "2026-10-18T06:00:00.000Z", index: newIndex }),
    writeCached: async (value) => { writes.push(value); },
    fetchRemote: async () => { throw new Error("offline"); },
  });
  assert.equal(await cache.refresh(), newIndex);
  assert.equal((await cache.get()).offers.length, 1);
  assert.equal(writes.length, 0);
});

test("concurrent tab and popup lookups share one download and do not return the old index first", async () => {
  let resolveRemote!: (value: typeof newIndex) => void;
  let started!: () => void;
  const remoteStarted = new Promise<void>((resolve) => { started = resolve; });
  let calls = 0;
  const cache = createCashbackIndexCache({
    now: () => now,
    readBundled: async () => oldIndex,
    readCached: async () => undefined,
    writeCached: async () => {},
    fetchRemote: () => { calls++; started(); return new Promise((resolve) => { resolveRemote = resolve; }); },
  });
  let firstResolved = false;
  const first = cache.get().then((index) => { firstResolved = true; return index; });
  const second = cache.get();
  const startup = cache.refresh();
  await remoteStarted;
  assert.equal(firstResolved, false);
  assert.equal(calls, 1);
  resolveRemote(newIndex);
  assert.deepEqual(await Promise.all([first, second, startup]), [newIndex, newIndex, newIndex]);
});

test("periodic refresh and a manual refresh pick up new offers without downgrading newer bundled data", async () => {
  let time = now;
  let calls = 0;
  let remote = cachedIndex;
  const cache = createCashbackIndexCache({
    now: () => time,
    readBundled: async () => oldIndex,
    readCached: async () => undefined,
    writeCached: async () => {},
    fetchRemote: async () => { calls++; return remote; },
  });
  assert.equal(await cache.get(), cachedIndex);
  time += 14 * 60 * 1000;
  assert.equal(await cache.get(), cachedIndex);
  assert.equal(calls, 1);
  remote = newIndex;
  assert.equal(await cache.refresh(), newIndex);
  assert.equal(calls, 2);
  remote = oldIndex;
  time += 15 * 60 * 1000;
  assert.equal(await cache.get(), newIndex);
  assert.equal(calls, 3);
});

test("a failed download backs off briefly and then retries while retaining available offers", async () => {
  let time = now;
  let calls = 0;
  const cache = createCashbackIndexCache({
    now: () => time,
    readBundled: async () => cachedIndex,
    readCached: async () => undefined,
    writeCached: async () => {},
    fetchRemote: async () => { if (++calls === 1) throw new Error("connection reset"); return newIndex; },
  });
  assert.equal(await cache.get(), cachedIndex);
  assert.equal(await cache.get(), cachedIndex);
  assert.equal(calls, 1);
  time += 60 * 1000;
  assert.equal(await cache.get(), newIndex);
  assert.equal(calls, 2);
});

test("unavailable extension storage does not discard freshly downloaded offers", async () => {
  const cache = createCashbackIndexCache({
    now: () => now,
    readBundled: async () => oldIndex,
    readCached: async () => { throw new Error("storage unavailable"); },
    writeCached: async () => { throw new Error("storage unavailable"); },
    fetchRemote: async () => newIndex,
  });
  assert.equal(await cache.get(), newIndex);
  assert.equal(await cache.get(), newIndex);
});
