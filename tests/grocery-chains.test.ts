import assert from "node:assert/strict";
import { test } from "node:test";
import { GROCERY_CHAIN_LIST, GROCERY_CHAINS, getGroceryChain } from "../src/shared/grocery-chains.js";
import { getBrandChipCss, getDarkChipDeclarations } from "../src/shared/theme.js";

test("grocery chains have a unique slug, a label and hex colours for their chip", () => {
  assert.equal(new Set(GROCERY_CHAIN_LIST.map((chain) => chain.slug)).size, GROCERY_CHAIN_LIST.length);
  assert.deepEqual(GROCERY_CHAINS, GROCERY_CHAIN_LIST.map((chain) => chain.name));
  for (const chain of GROCERY_CHAIN_LIST) {
    assert.match(chain.slug, /^[a-z0-9-]+$/);
    assert.match(chain.bg, /^#[0-9a-f]{6}$/);
    assert.match(chain.fg, /^#[0-9a-f]{6}$/);
  }
  assert.equal(getGroceryChain("KIWI")?.bg, "#50b848");
  assert.equal(getGroceryChain("oda")?.label, "Oda");
  assert.equal(getGroceryChain("Biltema"), undefined);
});

test("brand chips soften white lettering and turn pale fills charcoal in dark mode", () => {
  assert.equal(getDarkChipDeclarations({ bg: "#004993", fg: "#ffffff" }), "color:#e5e5e5;");
  assert.match(getDarkChipDeclarations({ bg: "#e9e9ed", fg: "#c8102e" }), /^background:#34373d;/);
  assert.equal(getDarkChipDeclarations({ bg: "#fff200", fg: "#111111" }), "");
  assert.equal(getDarkChipDeclarations({ bg: "#ffffff", fg: "#000000", preserveInDark: true }), "");
  const css = getBrandChipCss(".badge-chain-obs", { bg: "#004993", fg: "#ffffff" });
  assert.match(css, /^\.badge-chain-obs \{ background: #004993; color: #ffffff; \}/);
  assert.match(css, /:root\[data-cbn-theme="dark"\] \.badge-chain-obs \{color:#e5e5e5;\}/);
});
