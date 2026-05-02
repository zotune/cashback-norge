import { CheerioCrawler, Configuration, MemoryStorage } from "crawlee";
import type { CashbackOffer } from "../../shared/cashback.js";

const BUTIKKER_URL = "https://www.norskfamilie.no/netthandel/butikker/";

const SLUG_TO_DOMAIN: Record<string, string> = {
  adlibris: "adlibris.com",
  apotekhjemno: "apotekhjem.no",
  "askeladden-navnelapper": "askeladden.no",
  bagbrokers: "bagbrokers.no",
  "bakeren-og-kokken": "bakerenogkokken.no",
  bemz: "bemz.com",
  bodystore: "bodystore.com",
  bubbleroom: "bubbleroom.no",
  "christiania-glasmagasin": "glasmagasinet.no",
  coolstuff: "coolstuff.no",
  "daniel-wellington": "danielwellington.com",
  devold: "devold.no",
  elektroimportren: "elektroimportoren.no",
  euroflorist: "euroflorist.no",
  fotoknudsen: "fotoknudsen.no",
  "grnt-fokus": "grontfokus.no",
  homeroom: "homeroom.no",
  hotelscom: "hotels.com",
  "i-love-dogs": "ilovedogs.no",
  inkclub: "inkclub.com",
  inkmann: "inkmann.no",
  jotex: "jotex.no",
  karcher: "kaercher.com",
  lensway: "lensway.no",
  life: "life.no",
  loccitane: "no.loccitane.com",
  lufthansa: "lufthansa.com",
  lunehjemno: "lunehjem.no",
  "munk-store": "munkstore.com",
  newport: "newport.se",
  "nly-man": "nlyman.com",
  "nordic-choice-hotels": "nordicchoicehotels.no",
  "polarn-o-pyret": "polarnopyret.no",
  "skogstad-sport": "skogstadsport.no",
  slikkepott: "slikkepott.no",
  smartphoto: "smartphoto.no",
  stormberg: "stormberg.no",
  timarco: "timarco.no",
  tirendo: "tirendo.no",
  "urban-pioneers": "urbanpioneers.com",
  vetzoo: "vetzoo.no",
  "vy-buss": "vy.no",
};

export async function crawlNorskfamilie(): Promise<CashbackOffer[]> {
  const generatedAt = new Date().toISOString();
  const offers: CashbackOffer[] = [];

  const storage = new MemoryStorage({ persistStorage: false });
  const config = new Configuration();
  config.useStorageClient(storage);

  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 1,
    requestHandler: async ({ $ }) => {
      $(".list-shop").each((_i, el) => {
        const card = $(el);
        const name = card.find("img.img-fluid").attr("alt")?.trim();
        if (!name) return;

        const rateText = card.find(".shop-comission").text().trim();
        const reward = rateText.replace(/\s+/g, " ").trim();
        if (!reward || reward === "\u00a0") return;

        const partnerLink = card.find('a[href*="/partner/"]').attr("href") ?? "";
        const slugMatch = partnerLink.match(/\/partner\/([^/]+)\//);
        const slug = slugMatch?.[1] ?? "";

        const domain = SLUG_TO_DOMAIN[slug];
        const sourceUrl = `https://www.norskfamilie.no${partnerLink}`;

        offers.push({
          provider: "norskfamilie",
          merchantName: name,
          domains: domain ? [domain] : [],
          reward,
          sourceUrl,
          activationUrl: sourceUrl,
          terms: "",
          updatedAt: generatedAt,
        });
      });
    },
  }, config);

  await crawler.run([BUTIKKER_URL]);
  return offers;
}
