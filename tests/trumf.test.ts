import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { parseTrumfBenefitOffer, type TrumfBenefitSummary } from "../src/backend/providers/trumf.js";
import type { ProviderOverrides } from "../src/backend/provider-overrides.js";

// cheerio is not a direct dependency; load the copy Crawlee itself parses with.
const crawleeRequire = createRequire(createRequire(import.meta.url).resolve("crawlee"));
const { load } = crawleeRequire("cheerio") as typeof import("cheerio");

const overrides = { trumf: {} } as unknown as ProviderOverrides;

function benefitPage(lines: string[]): ReturnType<typeof load> {
  return load(`<html><body><div class="articleWrapper_articleContainer__x">${lines.map((line) => `<p>${line}</p>`).join("")}</div></body></html>`);
}

function parse(slug: string, title: string, description: string, lines: string[]) {
  const summary: TrumfBenefitSummary = { slug, title, description, tags: [] };
  return parseTrumfBenefitOffer(benefitPage(lines), `https://www.trumf.no/${slug}`, summary, overrides, "2026-11-13T00:00:00.000Z");
}

// Lines from trumf.no/fordeler/{kiwi,spar,joker} on 2026-11-13.
test("Trumf fordeler: product-only rates (bleier, Libero, bonusprodukter) do not widen the basket range", () => {
  const kiwi = parse("fordeler/kiwi", "KIWI", "Ekstra Trumf-bonus med KIWI PLUSS aktivert", [
    "1 % Trumf-bonus på alle dagligvarer",
    "3 % Trumf-bonus hver gang det er Trippel-Trumf",
    "15 % Trumf-bonus på fersk frukt og grønt med KIWI PLUSS aktivert",
    "50 % Trumf-bonus på bleier, bind og tamponger med KIWI PLUSS aktivert.**",
    "Gode Trumf-fordeler hos KIWI Spar Trumf-bonus på alt du handler av dagligvarer hos KIWI, i tillegg får du hele 15 % Trumf-bonus på all fersk frukt og grønt og 50 % Trumf-bonus på bleier, bind og tamponger.",
  ]);
  assert.equal(kiwi?.reward, "1-3 %");
  assert.match(kiwi?.terms ?? "", /50 % Trumf-bonus på bleier/);

  const spar = parse("fordeler/spar", "SPAR", "51 % avslag i kassen på Libero bleier", [
    "1 % Trumf-bonus på alle dagligvarer",
    "3 % Trumf-bonus hver gang det er Trippel-Trumf",
    "51 % prisavslag på Libero-bleier",
  ]);
  assert.equal(spar?.reward, "1-3 %");

  const joker = parse("fordeler/joker", "Joker", "Ekstra Trumf-bonus med Joker GLAD aktivert", [
    "1 % Trumf-bonus på alle dagligvarer",
    "3 % Trumf-bonus hver gang det er Trippel-Trumf",
    "6 % Trumf-bonus hver mandag med Joker GLAD aktivert",
  ]);
  assert.equal(joker?.reward, "1-6 %");

  // Without any basket-wide rate the stated rates are still used.
  const shop = parse("fordeler/kiwi", "KIWI", "", ["15 % Trumf-bonus på fersk frukt og grønt"]);
  assert.equal(shop?.reward, "15 %");
});
