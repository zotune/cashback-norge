import assert from "node:assert/strict";
import { test } from "node:test";
import { GROCERY_CHAIN_LIST, GROCERY_CHAINS, getGroceryChain, getGroceryOfferLink, getGrocerySearchQuery, getGroceryUnitPrice, getGroceryCardBonus } from "../src/shared/grocery-chains.js";
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
  assert.equal(getGroceryChain("Gigaboks")?.bg, "#e4143b");
  assert.equal(getGroceryOfferLink("Holdbart", "Rustica Pizza").url, "https://www.holdbart.no/search?q=Rustica%20Pizza");
  assert.match(getGroceryOfferLink("Afood Market", "Ramen").url, /^https:\/\/etilbudsavis\.no\/soek\//);
  assert.equal(getGroceryCardBonus("Gigaboks"), undefined);
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

test("grocery offers link to the chain's product search, or to the flyer offer on eTilbudsavis", () => {
  assert.equal(getGrocerySearchQuery("Alt av Frostachips 150 G"), "Frostachips");
  assert.equal(getGrocerySearchQuery("Mills Kaviar Tube 185 g"), "Mills Kaviar Tube");
  assert.equal(getGrocerySearchQuery("Tine Lettmelk 1% 1,75 l"), "Tine Lettmelk 1%");
  assert.deepEqual(getGroceryOfferLink("MENY", "Mills Kaviar"), { url: "https://meny.no/sok?query=Mills%20Kaviar&expanded=products", label: "Se varen hos MENY" });
  assert.equal(getGroceryOfferLink("oda", "Kaviar").url, "https://oda.com/no/search/products/?q=Kaviar");
  assert.equal(getGroceryOfferLink("Obs", "LEGO City").url, "https://www.obs.no/sok?q=LEGO%20City");
  assert.match(getGroceryOfferLink("Obs", "Kaviar").label, /nettutvalg.*matvarer kan mangle/);
  assert.equal(getGroceryOfferLink("KIWI", "Kålrot").url, "https://etilbudsavis.no/soek/K%C3%A5lrot");
  assert.match(getGroceryOfferLink("REMA 1000", "Pizza").label, /eTilbudsavis/);
});

test("grocery unit prices are read from the flyer text, and chain cards are found per chain", () => {
  assert.deepEqual(getGroceryUnitPrice("185 g. Pr stk. Pr kg 162,16\nFørpris 37,90"), { amount: 162.16, unit: "kg" });
  assert.deepEqual(getGroceryUnitPrice("150 g pr. pk\n193,33/KG"), { amount: 193.33, unit: "kg" });
  assert.deepEqual(getGroceryUnitPrice("Zero, 250 ml\nEnh.pris 27,60 pr. l\nFørpris 13,90"), { amount: 27.6, unit: "l" });
  assert.deepEqual(getGroceryUnitPrice("300/350 g. Pr pose Pr kg 78,86/89,67"), { amount: 78.86, unit: "kg" });
  assert.deepEqual(getGroceryUnitPrice("0,5l, stort utvalg (35,80/l)"), { amount: 35.8, unit: "l" });
  assert.deepEqual(getGroceryUnitPrice("REMA 1000, 500 g, 39,80 pr. kg"), { amount: 39.8, unit: "kg" });
  assert.deepEqual(getGroceryUnitPrice("et utvalg, 0,33 l + pant 26,97/liter"), { amount: 26.97, unit: "l" });
  assert.equal(getGroceryUnitPrice("Pr stk"), undefined);
  assert.equal(getGroceryUnitPrice("Hvite, Unik, 6 stk. Enh.pris 2,48 pr. stk."), undefined);
  assert.equal(getGroceryCardBonus("KIWI")?.id, "trumf");
  assert.equal(getGroceryCardBonus("Obs")?.id, "coop");
  assert.equal(getGroceryCardBonus("REMA 1000"), undefined);
});

test("a flyer price per kilo or for one stated pack size is a unit price; multipacks and pieces are not", () => {
  const kg = { unit: "g", from: 1000, to: 1000 };
  assert.deepEqual(getGroceryUnitPrice("Ca. 1,2 kg, urøkt, lam, First Price, pr. kg", { amount: 279, quantity: kg }), { amount: 279, unit: "kg" });
  assert.deepEqual(getGroceryUnitPrice("2 varianter. 1 kg", { amount: 239, quantity: kg }), { amount: 239, unit: "kg" });
  assert.deepEqual(getGroceryUnitPrice("Fryst. 500 g", { amount: 50, quantity: { unit: "g", from: 500, to: 500 } }), { amount: 100, unit: "kg" });
  // A printed unit price still wins.
  assert.deepEqual(getGroceryUnitPrice("Nordfjord, 299,00 pr. kg", { amount: 299, quantity: kg }), { amount: 299, unit: "kg" });
  // "6 x 47 g": the quantity is one bar, the price the pack.
  assert.equal(getGroceryUnitPrice("6 x 47 g Freia pr. pk", { amount: 59, quantity: { unit: "g", from: 47, to: 47 } }), undefined);
  assert.equal(getGroceryUnitPrice("20 stk. Unik, pr. stk. 0,99", { amount: 19.9, quantity: { unit: "pcs", from: 1, to: 1 } }), undefined);
  // "Pr kg" with a 100 g quantity is ambiguous.
  assert.equal(getGroceryUnitPrice("Krydret. Pr kg", { amount: 29.9, quantity: { unit: "g", from: 100, to: 100 } }), undefined);
  assert.equal(getGroceryUnitPrice("ca 1.5 kg", { amount: 359, quantity: { unit: "g", from: 1000, to: 1000 } }), undefined);
});

test("multi-buys and «fra»-sizes give no unit price from the flyer price", () => {
  assert.equal(getGroceryUnitPrice("TILBUD 3 FOR 100 STOR-PLATER Utvalget kan variere. Fra 150 g", { amount: 100, quantity: { unit: "g", from: 150, to: 150 } }), undefined);
  assert.equal(getGroceryUnitPrice("COOP MEDLEMS-KUPP! 2 for 110 Ikke-medlem? 400 g", { amount: 110, quantity: { unit: "g", from: 400, to: 400 } }), undefined);
  assert.equal(getGroceryUnitPrice("10-pk, 125 g", { amount: 39.9, quantity: { unit: "g", from: 125, to: 125 } }), undefined);
});
