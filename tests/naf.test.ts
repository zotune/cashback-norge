import assert from "node:assert/strict";
import { test } from "node:test";
import { extractDetailReward } from "../src/backend/providers/naf.js";

// Shapes of NAF's commonarticles API (api …/commonarticles/<slug>, 2026-11-12).
test("NAF: an engraving discount or a campaign add-on does not widen the product discount", () => {
  assert.equal(extractDetailReward({
    discountBadge: "20 % rabatt",
    keyInformation: { items: ["Minimum 20 % rabatt på alle produkter", "50 % rabatt på gravering"] },
  }), "20 %");
  assert.equal(extractDetailReward({
    discountBadge: "Opptil 50 % rabatt",
    keyInformation: { items: ["20 % rabatt på komplett brille", "50 % rabatt på komplett brille nr. 2", "5 % rabatt i tillegg ved prosentkampanjer"] },
  }), "20-50 %");
});

test("NAF: a single rate stated as opptil keeps the qualifier", () => {
  assert.equal(extractDetailReward({
    discountBadge: "Opptil 24 % rabatt",
    keyInformation: { items: ["Opptil 24 % rabatt på ny MC-forsikring", "Mulighet for Gjensidiges kundeutbytte"] },
  }), "opptil 24 %");
  assert.equal(extractDetailReward({
    discountBadge: "Opptil 35 % rabatt",
    keyInformation: { items: ["Ulike rabatter gjennom sesongen"] },
  }), "opptil 35 %");
});

test("NAF: link escapes are not percentages; the badge's saving and a free service are read", () => {
  assert.equal(extractDetailReward({
    discountBadge: "Spar opptil kr 1500,–",
    keyInformation: { items: ["Zaptec Go 2 medlemspris 9490,- (ordinær pris 10990,-)", "5 års garanti"] },
    body: [{ _type: "link", href: "https://eur02.safelinks.protection.outlook.com/?url=https%3A%2F%2Fwww.zaptec.com&data=05%7C02%7C0%7C0%7C6390" }],
  }), "opptil 1 500 kr");
  assert.equal(extractDetailReward({ discountBadge: "Gratis", keyInformation: null }), "0 kr totalsum");
});
