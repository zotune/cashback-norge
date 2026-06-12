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

// Sony WH-1000XM6: korte kanoniske titler hos Godpris/Klarna («WH-1000XM6 - Black»)
// ble tidligere avvist av signal-overlapp-kravet, og sølv feilmatchet LinkBuds Fit.
// Forventet: godpris + klarna matcher riktig fargevariant, aldri LinkBuds/WF-1000XM6.
const sonyBlackMessage: GetPriceMatchForProductMessage = {
  type: "get-price-match-for-product",
  url: "https://www.komplett.no/product/1323734/tv-lyd-bilde/hodetelefoner-tilbehoer/hodetelefoner/sony-wh-1000xm6-traadloese-hodetelefoner-over-ear-sort",
  searchTerm: "Sony WH-1000XM6 trådløse hodetelefoner, Over-Ear (sort)",
  productPageClue: true,
  price: 3990,
  currency: "NOK",
  codes: ["1323734", "WH1000XM6B.CE7", "4548736162617"],
  organizationName: "Komplett",
};

const sonySilverMessage: GetPriceMatchForProductMessage = {
  ...sonyBlackMessage,
  url: "https://www.komplett.no/product/1323735/tv-lyd-bilde/hodetelefoner-tilbehoer/hodetelefoner/sony-wh-1000xm6-traadloese-hodetelefoner-over-ear-soelv",
  searchTerm: "Sony WH-1000XM6 trådløse hodetelefoner, Over-Ear (sølv)",
  // EAN slik spec-tabell-høsteren i content.ts finner den på produktsiden.
  codes: ["WH1000XM6S.CE7", "4548736162662"],
};

const sonySandstoneMessage: GetPriceMatchForProductMessage = {
  ...sonyBlackMessage,
  url: "https://www.komplett.no/product/1323736/tv-lyd-bilde/hodetelefoner-tilbehoer/hodetelefoner/sony-wh-1000xm6-traadloese-hodetelefoner-over-ear-sandstone",
  searchTerm: "Sony WH-1000XM6 trådløse hodetelefoner, Over-Ear (Sandstone)",
  codes: ["4548736176850"],
};

// Prisjakt-/csmegastore-sider har 8-sifrede produkt-ID-er i URL-en som tidligere
// ble feiltolket som EAN-8 og forgiftet kodesøkene (Hansgrohe/KS Tools-feilmatchene).
// Forventet: aldri Hansgrohe/KS Tools/iPhone 17e/Osmo Action 6 i resultatene.
const roborockPrisjaktMessage: GetPriceMatchForProductMessage = {
  type: "get-price-match-for-product",
  url: "https://www.prisjakt.no/product.php?p=16151403",
  searchTerm: "Roborock Saros 20 Sonic Complete",
  productPageClue: true,
  price: 9990,
  currency: "NOK",
  organizationName: "VVSkupp",
};

const iphonePrisjaktMessage: GetPriceMatchForProductMessage = {
  type: "get-price-match-for-product",
  url: "https://www.prisjakt.no/product.php?p=14969878",
  searchTerm: "Apple iPhone 17 5G 8GB RAM 256GB",
  productPageClue: true,
  price: 10358,
  currency: "NOK",
  organizationName: "Linné Elektronik",
};

const djiCsMegastoreMessage: GetPriceMatchForProductMessage = {
  type: "get-price-match-for-product",
  url: "https://www.csmegastore.no/i/24656085/dji-osmo-action-4-standard-combo",
  searchTerm: "DJI Osmo Action 4 Standard Combo",
  productPageClue: true,
  price: 2990,
  currency: "NOK",
  organizationName: "CS MEGASTORE",
};

const iphoneCsMegastoreMessage: GetPriceMatchForProductMessage = {
  type: "get-price-match-for-product",
  url: "https://www.csmegastore.no/i/24678529/apple-iphone-17-256gb-white",
  searchTerm: "Apple iPhone 17 256GB White",
  productPageClue: true,
  price: 10416,
  currency: "NOK",
  organizationName: "CS MEGASTORE",
};

// Pixel 10-bundle hos Komplett: "10a" så ut som enhet (10 ampere) og slapp forbi
// tallmodell-guarden, så Prisradar viste Pixel 10a til 4490. Forventet: aldri 10a/Pro/XL.
const pixel10KomplettMessage: GetPriceMatchForProductMessage = {
  type: "get-price-match-for-product",
  url: "https://www.komplett.no/product/1340671/mobil-tablets-klokker/mobiltelefoner/google-pixel-10-128gb-obsidian",
  searchTerm: "Google Pixel 10 128GB (Obsidian)",
  productPageClue: true,
  price: 6490,
  currency: "NOK",
  codes: ["1340671", "K078846Z279-BNDL"],
  organizationName: "Komplett",
};

// Pixel 10 Pro XL-bundle: Prisjakt kjenner verken bundle-URL-en eller bundle-EAN,
// så URL-/kodesøk feiler — fritekst-fallbacken skal finne p=15031511 (og ikke Pro/Fold).
const pixel10ProXlKomplettMessage: GetPriceMatchForProductMessage = {
  type: "get-price-match-for-product",
  url: "https://www.komplett.no/product/1340662/mobil-tablets-klokker/mobiltelefoner/google-pixel-10-pro-xl-256gb-obsidian",
  searchTerm: "Google Pixel 10 Pro XL 256GB (Obsidian)",
  productPageClue: true,
  price: 12990,
  currency: "NOK",
  codes: ["1340662"],
  organizationName: "Komplett",
};

for (const [label, message] of [
  ["komplett", komplettMessage],
  ["komplett (entity-searchTerm)", komplettDirtyMessage],
  ["lyko", lykoMessage],
  ["sony svart", sonyBlackMessage],
  ["sony sølv", sonySilverMessage],
  ["sony sandstone", sonySandstoneMessage],
  ["roborock @ prisjakt", roborockPrisjaktMessage],
  ["iphone 17 @ prisjakt", iphonePrisjaktMessage],
  ["dji osmo action 4 @ csmegastore", djiCsMegastoreMessage],
  ["iphone 17 hvit @ csmegastore", iphoneCsMegastoreMessage],
  ["pixel 10 @ komplett", pixel10KomplettMessage],
  ["pixel 10 pro xl @ komplett", pixel10ProXlKomplettMessage],
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
