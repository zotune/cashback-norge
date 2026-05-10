import {
  type CashbackOffer,
  normalizeDomainInput,
  uniqueOffers,
} from "../../shared/cashback.js";
import type { Logger } from "../logger.js";

const PARTNERS_API = "https://api.myunidays.com/partners";
const CONTENT_API = "https://content.myunidays.com/NO/partners";

/** Maps UNiDAYS partner subdomain/slug to actual merchant domain(s) */
const SLUG_TO_DOMAINS: Record<string, string[]> = {
  aimn: ["aimnactive.com"],
  acer: ["acer.com"],
  applemusic: ["music.apple.com"],
  bestseller: ["bestseller.com"],
  disney: ["disneyplus.com"],
  edhardy: ["edhardy.com"],
  emirates: ["emirates.com"],
  evernote: ["evernote.com"],
  expressvpn: ["expressvpn.com"],
  farfetch: ["farfetch.com"],
  glossybox: ["glossybox.no", "glossybox.com"],
  gymking: ["gymking.com"],
  hellofresh: ["hellofresh.no", "hellofresh.com"],
  hismile: ["hismileteeth.com"],
  hotels: ["hotels.com"],
  ipsosisay: ["i-say.com"],
  lookfantastic: ["lookfantastic.com"],
  mangooutlet: ["mangooutlet.com"],
  missoma: ["missoma.com"],
  mixcloud: ["mixcloud.com"],
  nba: ["nba.com"],
  netaporter: ["net-a-porter.com"],
  nordvpn: ["nordvpn.com"],
  omio: ["omio.com"],
  perlego: ["perlego.com"],
  qatarairways: ["qatarairways.com"],
  reebok: ["reebok.com"],
  shopbop: ["shopbop.com"],
  skullcandy: ["skullcandy.com"],
  smartbuyglasses: ["smartbuyglasses.com"],
  temu: ["temu.com"],
  weekday: ["weekday.com"],
  zalando: ["zalando.no", "zalando.com"],
};

type ContentPartner = {
  id: string;
  displayName: string;
  defaultPerkSubdomain: string;
  isEnabled: boolean;
};

type Benefit = {
  id: string;
  name: string;
  type: string;
  url: string;
};

type ApiPartner = {
  id: string;
  name: string;
  description: string;
  benefits: Benefit[];
};

export type FetchUnidaysInput = {
  generatedAt: string;
  logger: Logger;
};

export async function fetchUnidays(
  input: FetchUnidaysInput,
): Promise<CashbackOffer[]> {
  input.logger.info("UNiDAYS: fetching partners...");

  const [contentRes, apiRes] = await Promise.all([
    fetch(CONTENT_API, {
      signal: AbortSignal.timeout(30_000),
    }),
    fetch(PARTNERS_API, {
      headers: { "UD-Region": "NO" },
      signal: AbortSignal.timeout(30_000),
    }),
  ]);

  if (!contentRes.ok) {
    throw new Error(`UNiDAYS content API returned ${contentRes.status}`);
  }
  if (!apiRes.ok) {
    throw new Error(`UNiDAYS partners API returned ${apiRes.status}`);
  }

  const contentPartners = (await contentRes.json()) as ContentPartner[];
  const { partners: apiPartners } = (await apiRes.json()) as {
    partners: ApiPartner[];
  };

  // Build ID → slug mapping from content API
  const idToSlug = new Map<string, string>();
  for (const cp of contentPartners) {
    if (cp.isEnabled) {
      idToSlug.set(cp.id, cp.defaultPerkSubdomain);
    }
  }

  input.logger.info(
    `UNiDAYS: ${contentPartners.filter((p) => p.isEnabled).length} enabled partners, ${apiPartners.length} in API`,
  );

  const offers: CashbackOffer[] = [];

  for (const partner of apiPartners) {
    if (!partner.benefits.length) continue;

    const slug = idToSlug.get(partner.id);
    if (!slug) {
      input.logger.warn(
        `UNiDAYS: no slug for partner "${partner.name}" (${partner.id})`,
      );
      continue;
    }

    const rawDomains = SLUG_TO_DOMAINS[slug];
    if (!rawDomains) {
      input.logger.warn(
        `UNiDAYS: no domain map for slug "${slug}" (${partner.name})`,
      );
      continue;
    }

    const domains = rawDomains.flatMap((d) => normalizeDomainInput(d));

    for (const benefit of partner.benefits) {
      const reward = benefit.name.trim();
      if (!reward) continue;

      offers.push({
        provider: "unidays",
        merchantName: partner.name,
        domains,
        reward,
        sourceUrl: benefit.url,
        activationUrl: benefit.url,
        terms: "UNiDAYS studentrabatt. Krever gyldig UNiDAYS-konto.",
        updatedAt: input.generatedAt,
      });
    }
  }

  input.logger.info(`UNiDAYS: ${offers.length} offers`);

  return uniqueOffers(offers);
}
