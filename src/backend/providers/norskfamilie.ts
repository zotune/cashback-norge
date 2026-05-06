import { CheerioCrawler, Configuration, MemoryStorage } from "crawlee";
import type { CashbackOffer } from "../../shared/cashback.js";
import { extractKrReward, extractPercentageReward, normalizeRewardLabel } from "../../shared/reward.js";

const BUTIKKER_URL = "https://www.norskfamilie.no/netthandel/butikker/";
const LABEL_LIST = "list";
const LABEL_DETAIL = "detail";

const SLUG_TO_DOMAIN: Record<string, string> = {
  adlibris: "adlibris.com",
  apotekhjemno: "apotekhjem.no",
  "askeladden-navnelapper": "navnelapper.no",
  bagbrokers: "bagbrokers.no",
  "bakeren-og-kokken": "bakerenogkokken.no",
  bemz: "bemz.com",
  bodystore: "bodystore.com",
  bubbleroom: "bubbleroom.no",
  "christiania-glasmagasin": "cg.no",
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
  "nordic-choice-hotels": "strawberry.no",
  "polarn-o-pyret": "polarnopyret.no",
  "skogstad-sport": "skogstadsport.no",
  slikkepott: "slikkepott.no",
  smartphoto: "smartphoto.no",
  stormberg: "stormberg.com",
  timarco: "timarco.no",
  tirendo: "tirendo.no",
  "urban-pioneers": "urbanpioneers.com",
  vetzoo: "vetzoo.no",
  "vy-buss": "vybuss.no",
};

export async function crawlNorskfamilie(): Promise<CashbackOffer[]> {
  const generatedAt = new Date().toISOString();
  const offersBySlug = new Map<string, CashbackOffer>();

  const storage = new MemoryStorage({ persistStorage: false });
  const config = new Configuration();
  config.useStorageClient(storage);

  const crawler = new CheerioCrawler({
    maxConcurrency: 4,
    maxRequestsPerCrawl: 100,
    requestHandler: async ({ $, request }) => {
      const label = request.label ?? LABEL_LIST;

      if (label === LABEL_DETAIL) {
        const slug = readSlug(request.url);
        const offer = offersBySlug.get(slug);
        if (offer === undefined) return;

        const detailText = $(".shopping-content").first().text().replace(/\s+/g, " ").trim();
        const detailReward = extractPercentageReward(detailText) || extractKrReward(detailText);
        if (detailReward !== "") {
          offer.reward = detailReward;
        }
        return;
      }

      const detailRequests: Array<{ url: string; label: string }> = [];

      $(".list-shop").each((_i, el) => {
        const card = $(el);
        const name = card.find("img.img-fluid").attr("alt")?.trim();
        if (!name) return;

        const rateText = card.find(".shop-comission").text().trim();
        const normalizedRateText = rateText.replace(/\s+/g, " ").trim();
        const reward = extractPercentageReward(normalizedRateText) || extractKrReward(normalizedRateText) ||
          normalizeRewardLabel(normalizedRateText);
        if (!reward || reward === "\u00a0") return;

        const partnerLink = card.find('a[href*="/partner/"]').attr("href") ?? "";
        const slugMatch = partnerLink.match(/\/partner\/([^/]+)\//);
        const slug = slugMatch?.[1] ?? "";

        const domain = SLUG_TO_DOMAIN[slug];
        const sourceUrl = new URL(partnerLink, BUTIKKER_URL).toString();

        offersBySlug.set(slug, {
          provider: "norskfamilie",
          merchantName: name,
          domains: domain ? [domain] : [],
          reward,
          sourceUrl,
          activationUrl: sourceUrl,
          terms: "",
          updatedAt: generatedAt,
        });

        detailRequests.push({ url: sourceUrl, label: LABEL_DETAIL });
      });

      await crawler.addRequests(detailRequests);
    },
  }, config);

  await crawler.run([{ url: BUTIKKER_URL, label: LABEL_LIST }]);
  return [...offersBySlug.values()];
}

function readSlug(url: string): string {
  const match = url.match(/\/partner\/([^/]+)\//);
  return match?.[1] ?? "";
}
