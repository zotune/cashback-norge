import assert from "node:assert/strict";
import { test } from "node:test";

const created: string[] = [];
const removed: number[] = [];
const session = new Map<string, unknown>();
const removedListeners: Array<(tabId: number) => void> = [];
let nextTabId = 1;

Object.assign(globalThis, {
  chrome: {
    runtime: { lastError: undefined },
    storage: {
      session: {
        get: async (key: string) => (session.has(key) ? { [key]: session.get(key) } : {}),
        set: async (values: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(values)) session.set(key, value);
        },
      },
    },
    tabs: {
      create: (options: { url: string; active: boolean }, callback: (tab: { id: number }) => void) => {
        assert.equal(options.active, false);
        created.push(options.url);
        callback({ id: nextTabId++ });
      },
      remove: async (tabId: number) => {
        removed.push(tabId);
      },
      onRemoved: { addListener: (listener: (tabId: number) => void) => removedListeners.push(listener) },
    },
  },
});

const { finishKiwiPriceProbe, getKiwiFlightPrices, installKiwiPriceProbeCleanup } = await import("../src/extension/kiwi-price-probe.js");
const url = (origin: string): string => `https://www.kiwi.com/no/search/results/${origin}/FOR/2026-12-09/no-return?adults=1`;
const prices = { best: { amount: 5750, durationMinutes: 1635 } };
const requester = { tabId: 10, windowId: 7 };
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
installKiwiPriceProbeCleanup();

test("a search opens one hidden tab, closes it and reuses the price", async () => {
  const [first, second] = [getKiwiFlightPrices(url("BGO"), requester), getKiwiFlightPrices(url("BGO"), requester)];
  await flush();
  assert.equal(created.length, 1);
  assert.match(created[0]!, /cbvPriceProbe=1/);
  finishKiwiPriceProbe(1, prices);
  assert.deepEqual(await first, prices);
  assert.deepEqual(await second, prices);
  assert.deepEqual(removed, [1]);
  assert.deepEqual(await getKiwiFlightPrices(url("BGO"), requester), prices);
  assert.equal(created.length, 1);
});

test("a newer search in the same tab replaces the older one without remembering it as empty", async () => {
  const older = getKiwiFlightPrices(url("OSL"), requester);
  await flush();
  const newer = getKiwiFlightPrices(url("TRD"), requester);
  await flush();
  assert.equal(await older, undefined);
  assert.deepEqual(removed, [1, 2]);
  finishKiwiPriceProbe(3, prices);
  assert.deepEqual(await newer, prices);
  assert.deepEqual(removed, [1, 2, 3]);
  const retry = getKiwiFlightPrices(url("OSL"), requester);
  await flush();
  assert.equal(created.length, 4);
  finishKiwiPriceProbe(4, prices);
  assert.deepEqual(await retry, prices);
});

test("searches in different tabs do not stop each other, up to a limit", async () => {
  const pending = ["AES", "ALF", "EVE"].map((origin, index) => getKiwiFlightPrices(url(origin), { tabId: 20 + index }));
  await flush();
  const [firstTabId, ...otherTabIds] = created.slice(4).map((_, index) => 5 + index);
  assert.equal(created.length, 7);
  assert.equal(removed.includes(firstTabId!), false);
  assert.equal(await getKiwiFlightPrices(url("HAU"), { tabId: 30 }), undefined);
  assert.equal(created.length, 7);
  for (const [index, tabId] of [firstTabId!, ...otherTabIds].entries()) {
    finishKiwiPriceProbe(tabId, prices);
    assert.deepEqual(await pending[index], prices);
  }
});

test("a closed tab ends the search, and other sites are never opened", async () => {
  const pending = getKiwiFlightPrices(url("SVG"), requester);
  await flush();
  removedListeners[0]!(nextTabId - 1);
  assert.equal(await pending, undefined);
  const before = created.length;
  assert.equal(await getKiwiFlightPrices("https://example.com/no/search/results/a/b", requester), undefined);
  assert.equal(created.length, before);
});

test("a result from an unknown tab still closes that tab", () => {
  finishKiwiPriceProbe(99, undefined);
  assert.equal(removed.at(-1), 99);
});
