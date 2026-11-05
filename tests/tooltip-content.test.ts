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
