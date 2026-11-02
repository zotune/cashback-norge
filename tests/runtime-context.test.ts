import assert from "node:assert/strict";
import { test } from "node:test";
import { createContentScriptContextGuard } from "../src/extension/runtime-context.js";

test("old page callbacks stop after an extension reload and clean up once", () => {
  let runtimeId: string | undefined = "test-extension";
  let cleanups = 0;
  let storageReads = 0;
  const active = createContentScriptContextGuard(() => runtimeId, () => { cleanups++; }, false);
  const rerender = (): void => { if (active()) storageReads++; };
  rerender();
  runtimeId = undefined;
  for (let attempt = 0; attempt < 5; attempt++) rerender();
  assert.equal(storageReads, 1);
  assert.equal(cleanups, 1);
  // En ny runtime gjør ikke det gamle innholdsskriptet gyldig igjen.
  runtimeId = "new-extension";
  assert.equal(active(), false);
});

test("an invalidated runtime getter is handled and userscripts need no Chrome runtime", () => {
  let cleanups = 0;
  const read = (): string => { throw new Error("Extension context invalidated."); };
  const extension = createContentScriptContextGuard(read, () => { cleanups++; }, false);
  assert.equal(extension(), false);
  assert.equal(extension(), false);
  assert.equal(cleanups, 1);
  const userscript = createContentScriptContextGuard(read, () => { cleanups++; }, true);
  assert.equal(userscript(), true);
  assert.equal(cleanups, 1);
});
