import assert from "node:assert/strict";
import { test } from "node:test";
import { formatTooltipHtml, parseTooltipSections } from "../src/shared/tooltip-content.js";

test("offer terms use a heading and short chips, preserving long exclusions verbatim", () => {
  const exclusion = 'Visse produkter og merker er ekskludert fra studentrabatten, disse merkes som "Kan ikke kombineres med rabattkoder" på produktets/merkets side og i kassen hos Lyko.';
  const [section] = parseTooltipSections(`- Gjelder på ordinær pris.\n- Kan ikke kombineres med andre kampanjer.\n- ${exclusion}\nKrever Studentkortet-medlemskap.`);
  assert.equal(section?.title, "Gjelder på ordinær pris.");
  assert.deepEqual(section?.items, [
    { kind: "chip", text: "Kan ikke kombineres med andre kampanjer." },
    { kind: "text", text: exclusion },
    { kind: "chip", text: "Krever Studentkortet-medlemskap." },
  ]);
});

test("coupon descriptions, unconfirmed validity and complete brand exclusions are retained", () => {
  const exclusion = "Kan ikke kombineres med andre rabatter. Gjelder ikke adventskalender, The Ordinary, Eminence, Dr Dennis Gross, VICHY, Sensai, Creed, Sisley, La Roche Posay, Nanolash, Dyson, Bellami, Kérastase, Redken eller Elixir Cosmeceuticals.";
  const [section] = parseTooltipSections(`15% rabatt på hele kjøpet med Lyko rabattkode! 💋\nUbekreftet sluttdato\n${exclusion}`);
  assert.equal(section?.title, undefined);
  assert.equal(section?.items[1]?.text, "Ubekreftet sluttdato");
  assert.deepEqual(section?.items[2], { kind: "text", text: exclusion });
});

test("bullet styles and explicit headings work without turning URLs or warnings into chips", () => {
  const sections = parseTooltipSections(["# Vilkår\n• Medlemskap\n* App kreves\n- Kun på nett", "⚠ Betales med kort", "Kilde: https://example.test/tilbud"]);
  assert.equal(sections[0]?.title, "Vilkår");
  assert.deepEqual(sections[0]?.items.map((item) => item.text), ["Medlemskap", "App kreves", "Kun på nett"]);
  assert.equal(sections[1]?.items[0]?.kind, "text");
  assert.equal(sections[2]?.items[0]?.kind, "text");
});

test("HTML rendering escapes every source string and does not clip later terms", () => {
  const text = '# <img src=x onerror="alert(1)">\n<script>alert(1)</script>\n\n' + Array.from({ length: 45 }, (_, i) => `Vilkår ${i}`).join("\n");
  const html = formatTooltipHtml(text);
  assert.ok(!html.includes("<img")); assert.ok(!html.includes("<script"));
  assert.match(html, /&lt;img/); assert.match(html, /&lt;script&gt;/);
  assert.ok(html.includes("Vilkår 44"));
  assert.equal(formatTooltipHtml("\n \n"), "");
});

test("dates, amounts and numbered terms retain their leading digits", () => {
  const lines = ["1. november 2026", "15 % på ordinære varer", "1) Registrer deg før kjøpet"];
  assert.deepEqual(parseTooltipSections(lines.join("\n"))[0]?.items.map((item) => item.text), lines);
});

const categoryRates = [
  "2 % – i reward-rabatt på din ordre",
  "2 % – i reward-rabatt på mobil och apple laptops",
  "2 % – i reward-rabatt på Laptops, Desktop PCs, Tablets, Games, Consoles, Smartwatches, VR, Toys & Gadgets",
  "2 % – i reward-rabatt på Monitors, Graphics Cards, CPU, Mainboards, Dust & Cleaning, Tools & Garden, PC Bu",
  "2 % – i reward-rabatt på HiFi, TV, Smart Home, Appliances",
  "2 % – i reward-rabatt på Komplett PC (KPC), Cases/PSU/Fans, Projectors, White Goods",
  "3 % – i reward-rabatt på PC Server/UPS, Printers/Skanners, Networking, Mice/Keyboards, Memory, Gaming Peri",
  "3 % – i reward-rabatt på Cables, TV Accessories, Office Supply, PC Accessories, Phones/Tablet Accessories",
].join("\n");

test("category commissions use consistent rate headings and individual category chips regardless of line length", () => {
  const sections = parseTooltipSections(categoryRates);
  assert.deepEqual(sections.map((section) => section.title), ["2 % reward-rabatt", "3 % reward-rabatt"]);
  assert.deepEqual(sections.map((section) => section.items.length), [25, 11]);
  assert.ok(sections.every((section) => section.items.every((item) => item.kind === "chip")));
  assert.ok(sections[0]!.items.some((item) => item.text === "Komplett PC (KPC)"));
  assert.ok(sections[0]!.items.some((item) => item.text === "Cases/PSU/Fans"));
  assert.ok(sections[1]!.items.some((item) => item.text === "Mice/Keyboards"));
  assert.ok(sections[1]!.items.some((item) => item.text === "Phones/Tablet Accessories"));
});

test("conditions stay between rate groups, and commas inside a category name are preserved", () => {
  const sections = parseTooltipSections("2 % – i reward-rabatt på PC (Nordic, svart), TV\n⚠ Krever betaling med kort\n2 % – i reward-rabatt på Laptops");
  assert.deepEqual(sections[0]!.items.map((item) => item.text), ["PC (Nordic, svart)", "TV"]);
  assert.equal(sections[1]!.items[0]!.text, "⚠ Krever betaling med kort");
  assert.equal(sections[2]!.title, "2 % reward-rabatt");
  assert.deepEqual(parseTooltipSections("Opptil 3 % – cashback på Klær\n3 % – cashback på Sko").map((section) => section.title), ["Opptil 3 % cashback", "3 % cashback"]);
  assert.deepEqual(parseTooltipSections("10 EUR – bonus på Klær\n10 kr – bonus på Sko").map((section) => section.title), ["10 EUR bonus", "10 kr bonus"]);
});

test("calculated amounts belong to the rate rather than the final category", async () => {
  const { formatBreakdownWithAmounts } = await import("../src/shared/reward-calculation.js");
  const amount = formatBreakdownWithAmounts(categoryRates, 1000);
  const sections = parseTooltipSections(amount);
  assert.deepEqual(sections.map((section) => section.title), ["2 % (20 kr) reward-rabatt", "3 % (30 kr) reward-rabatt"]);
  assert.ok(sections.every((section) => section.items.every((item) => !item.text.includes("kr)"))));
  assert.deepEqual(parseTooltipSections(formatBreakdownWithAmounts("2,5 % – cashback på Mat, Blomster", 500))[0], {
    title: "2,5 % (12,50 kr) cashback", items: [{ kind: "chip", text: "Mat" }, { kind: "chip", text: "Blomster" }],
  });
});
