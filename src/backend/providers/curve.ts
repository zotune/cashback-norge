// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import type { CashbackOffer } from "../../shared/cashback.js";
import type { Logger } from "../logger.js";

type CurveRetailer = {
  name: string;
  domains: string[];
};

export type FetchCurveInput = {
  generatedAt: string;
  logger: Logger;
};

export function fetchCurve(input: FetchCurveInput): CashbackOffer[] {
  const curveUrl = "https://help.curve.com/en_gb/1-cashback-retailers-rk1gJoBMh";
  const curveInviteUrl = "https://www.curve.com/join#D5GXXJJD";
  const offers: CashbackOffer[] = [];

  for (const retailer of CURVE_RETAILERS) {
    offers.push({
      provider: "curve",
      merchantName: retailer.name,
      domains: retailer.domains,
      reward: "1 %",
      sourceUrl: curveUrl,
      activationUrl: curveInviteUrl,
      terms: "Krever Curve Pro eller Pro+. Velg butikken i Curve-appen. Maks 6 (Pro) eller 12 (Pro+) butikker.",
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`Found ${offers.length} Curve 1% cashback retailers`);
  return offers;
}

const CURVE_RETAILERS: CurveRetailer[] = [
  // Bills / Telecom
  { name: "Telia", domains: ["telia.no", "telia.se"] },
  { name: "ExpressVPN", domains: ["expressvpn.com"] },
  { name: "Patreon", domains: ["patreon.com"] },

  // Entertainment
  { name: "Deezer", domains: ["deezer.com"] },
  { name: "Disney+", domains: ["disneyplus.com"] },
  { name: "HBO Nordic", domains: ["hbonordic.com", "max.com"] },
  { name: "Netflix", domains: ["netflix.com"] },
  { name: "Nintendo", domains: ["nintendo.no", "nintendo.com"] },
  { name: "PlayStation Network", domains: ["store.playstation.com"] },
  { name: "Spotify", domains: ["spotify.com"] },
  { name: "Steam", domains: ["store.steampowered.com"] },
  { name: "TIDAL", domains: ["tidal.com"] },
  { name: "Xbox", domains: ["xbox.com"] },

  // Food & Drink
  { name: "Burger King", domains: ["burgerking.no"] },
  { name: "Deliveroo", domains: ["deliveroo.com"] },
  { name: "Domino's", domains: ["dominos.no", "dominos.com"] },
  { name: "Foodora", domains: ["foodora.no"] },
  { name: "HelloFresh", domains: ["hellofresh.no", "hellofresh.com"] },
  { name: "Just Eat", domains: ["just-eat.no"] },
  { name: "KFC", domains: ["kfc.no"] },
  { name: "McDonald's", domains: ["mcdonalds.no"] },
  { name: "Starbucks", domains: ["starbucks.com"] },
  { name: "Subway", domains: ["subway.com"] },
  { name: "Uber Eats", domains: ["ubereats.com"] },
  { name: "Wolt", domains: ["wolt.com"] },

  // Groceries
  { name: "Aldi", domains: ["aldi.no"] },
  { name: "Coop", domains: ["coop.no"] },
  { name: "SPAR", domains: ["spar.no"] },
  { name: "Marks & Spencer", domains: ["marksandspencer.com"] },

  // Health & Fitness
  { name: "Gymshark", domains: ["gymshark.com"] },
  { name: "Oura", domains: ["ouraring.com"] },
  { name: "Peloton", domains: ["onepeloton.com"] },

  // Lifestyle
  { name: "Decathlon", domains: ["decathlon.no", "decathlon.com"] },

  // Shopping
  { name: "AliExpress", domains: ["aliexpress.com"] },
  { name: "Amazon", domains: ["amazon.com", "amazon.co.uk", "amazon.de", "amazon.se"] },
  { name: "Apple", domains: ["apple.com"] },
  { name: "ASOS", domains: ["asos.com"] },
  { name: "Benetton", domains: ["benetton.com"] },
  { name: "Boots", domains: ["boots.com"] },
  { name: "DigitalOcean", domains: ["digitalocean.com"] },
  { name: "Foot Locker", domains: ["footlocker.no", "footlocker.com"] },
  { name: "Gap", domains: ["gap.com"] },
  { name: "H&M", domains: ["hm.com"] },
  { name: "HBO Max", domains: ["max.com"] },
  { name: "IKEA", domains: ["ikea.com", "ikea.no"] },
  { name: "JD Sports", domains: ["jdsports.no", "jdsports.com"] },
  { name: "Media Markt", domains: ["mediamarkt.no", "mediamarkt.com"] },
  { name: "New Look", domains: ["newlook.com"] },
  { name: "Primark", domains: ["primark.com"] },
  { name: "River Island", domains: ["riverisland.com"] },
  { name: "Selfridges", domains: ["selfridges.com"] },
  { name: "Zara", domains: ["zara.com"] },

  // Transport
  { name: "Bolt", domains: ["bolt.eu"] },
  { name: "EasyPark", domains: ["easypark.no", "easypark.com"] },
  { name: "Ruter", domains: ["ruter.no"] },
  { name: "TIER", domains: ["tier.app"] },
  { name: "Voi", domains: ["voiscooters.com"] },
  { name: "Uber", domains: ["uber.com"] },

  // Travel
  { name: "Booking.com", domains: ["booking.com"] },
  { name: "BP", domains: ["bp.com"] },
  { name: "easyJet", domains: ["easyjet.com"] },
  { name: "Shell", domains: ["shell.no", "shell.com"] },
  { name: "Trainline", domains: ["thetrainline.com"] },
];
