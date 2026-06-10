// Kjører findPriceMatches / enkeltkilder med en konstruert melding for feilsøking.
// Bruk: pnpm tsx scripts/dev/test-price-match.mts
import { findPriceMatches } from "../../src/shared/price-match.js";
import { findGodprisPriceMatch } from "../../src/shared/godpris-price-match.js";
import { findKlarnaPriceMatch } from "../../src/shared/klarna-price-match.js";
import { findPrisjaktPriceMatch } from "../../src/shared/prisjakt-price-match.js";
import type { GetPriceMatchForProductMessage } from "../../src/shared/extension-messages.js";

const komplettMessage: GetPriceMatchForProductMessage = {
  type: "get-price-match-for-product",
  url: "https://www.komplett.no/product/1326886/hjem-fritid/stoevsugere-rengjoering/robotstoevsugere/dreame-d20-robotstoevsuger-sort",
  searchTerm: "Dreame D20 Robotstøvsuger (sort)",
  productPageClue: true,
  price: 1490,
  currency: "NOK",
  codes: ["1326886", "RLD35GA-Black"],
  organizationName: "Komplett",
};

// Simulerer u-dekodet tittel (slik det var før entity-fiksen) — MPN/anker-retry skal redde dette.
const komplettDirtyMessage: GetPriceMatchForProductMessage = {
  ...komplettMessage,
  searchTerm: "Dreame D20 Robotst&#xF8;vsuger (sort)",
};

const lykoMessage: GetPriceMatchForProductMessage = {
  type: "get-price-match-for-product",
  url: "https://lyko.com/no/sawe-skin-science/sawe-skin-science-derm-alert-barrier-repair-cream-75-ml",
  searchTerm: "SAWE Skin Science Derm-Alert Barrier Repair Cream 75 ml",
  productPageClue: true,
  price: 411.75,
  currency: "NOK",
  packageAmount: 75,
  packageUnit: "ml",
  organizationName: "Lyko",
};

for (const [label, message] of [
  ["komplett", komplettMessage],
  ["komplett (entity-searchTerm)", komplettDirtyMessage],
  ["lyko", lykoMessage],
] as const) {
  console.log(`\n=== ${label}`);
  for (const [source, finder] of [
    ["godpris", () => findGodprisPriceMatch(message)],
    ["klarna", () => findKlarnaPriceMatch(message)],
    ["prisjakt", () => findPrisjaktPriceMatch(message)],
  ] as const) {
    try {
      const offer = await finder();
      console.log(source.padEnd(9), "→", offer === undefined ? "ingen match" : `${offer.productName} | ${offer.shopName} ${offer.price} | ${offer.productUrl}`);
    } catch (error) {
      console.log(source.padEnd(9), "→ FEIL", error);
    }
  }

  const offers = await findPriceMatches(message);
  console.log("pipeline  →", offers.length === 0 ? "ingen" : "");
  for (const offer of offers) {
    console.log(`   [${offer.source}] ${offer.productName} | ${offer.shopName} ${offer.price}`);
  }
}
