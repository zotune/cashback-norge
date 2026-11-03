import type { CashbackOffer } from "./cashback.js";

// Public Orion campaign IDs, verified against the approved offers and landing
// pages. Resolve these from the click link so older cached indexes work too.
const UNO_CAMPAIGNS: Record<string, { label: string; paths: readonly string[] }> = {
  "451581": { label: "Gjeldsoversikt", paths: ["/gjeldfri", "/gjeldsoversikt", "/statistikk/gjeldsoversikt"] },
  "451327": { label: "Kredittscore", paths: ["/kredittscore"] },
};
const ORION_CLICK_HOSTS = new Set(["orsearchlink.com", "oriomed.com", "ormarkmed.com", "orionious.com"]);

function unoCampaignId(offer: CashbackOffer): string | undefined {
  if (offer.provider !== "cbn" || !offer.domains.some(domain => domain.replace(/^www\./, "") === "unoscore.no")) return undefined;
  try {
    const url = new URL(offer.activationUrl);
    if (!ORION_CLICK_HOSTS.has(url.hostname) || url.pathname !== "/click.track") return undefined;
    const id = url.searchParams.get("CID") ?? "";
    return UNO_CAMPAIGNS[id] ? id : undefined;
  } catch { return undefined; }
}

export function getOfferCampaignLabel(offer: CashbackOffer): string | undefined {
  const id = unoCampaignId(offer);
  return id ? UNO_CAMPAIGNS[id]!.label : undefined;
}

// Ordinary cashback rows still collapse per provider/code. Separate affiliate
// campaigns must retain their own action even when they share a merchant domain.
export function getVisibleOfferKey(offer: CashbackOffer): string {
  if (offer.provider === "cbn") {
    return `cbn:${unoCampaignId(offer) ?? (offer.activationUrl || offer.merchantName)}`;
  }
  return `${offer.provider}:${offer.discountCode ?? ""}`;
}

export function prioritizeOffersForPage(offers: CashbackOffer[], pageUrl: string): CashbackOffer[] {
  let page: URL;
  try { page = new URL(pageUrl); } catch { return offers; }
  if (!/^https?:$/.test(page.protocol) || !["unoscore.no", "www.unoscore.no", "app.unoscore.no"].includes(page.hostname)) return offers;
  const relevant = (offer: CashbackOffer): boolean => {
    const id = unoCampaignId(offer);
    return id !== undefined && UNO_CAMPAIGNS[id]!.paths.some(path => page.pathname === path || page.pathname.startsWith(`${path}/`));
  };
  // A stable partition retains all other offers and their original reward order.
  return [...offers.filter(relevant), ...offers.filter(offer => !relevant(offer))];
}
