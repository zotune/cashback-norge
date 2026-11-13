import {
  normalizeDomainInput,
  toBaseDomain,
  uniqueStrings,
} from "../shared/cashback.js";

export function merchantDomainsFromUrl(input: string): string[] {
  try {
    const parsedUrl = new URL(input);
    return merchantDomainsFromHostname(parsedUrl.hostname);
  } catch {
    return [];
  }
}

export function merchantDomainsFromHostname(hostname: string): string[] {
  const normalizedDomain = normalizeDomainInput(hostname);

  if (!isDomainLike(normalizedDomain)) {
    return [];
  }

  const baseDomain = toBaseDomain(normalizedDomain);
  return uniqueStrings([normalizedDomain, baseDomain]);
}

export function isDomainLike(value: string): boolean {
  return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(value.trim());
}

// Click/redirect hosts of affiliate networks and ad servers. They forward to
// the shop but are never the shop's own domain (arket.prf.hn, go.adt291.com,
// ad.doubleclick.net, c.trackmytarget.com).
const AFFILIATE_TRACKING_DOMAINS = [
  "a9yw.net", "addrevenue.io", "adrecord.com", "adtr.co", "adtraction.com", "anrdoezrs.net",
  "awin1.com", "bttn.io", "dartsearch.net", "doubleclick.net", "dpbolvw.net", "emjcd.com",
  "evyy.net", "ftjcfx.com", "go2cloud.org", "jdoqocy.com", "kqzyfj.com", "lduhtrp.net",
  "linksynergy.com", "madmetrics.com", "ojrq.net", "partner-ads.com", "prf.hn", "pxf.io",
  "qksrv.net", "sjv.io", "skimresources.com", "tkqlhce.com", "tradedoubler.com",
  "tradetracker.net", "trackmytarget.com", "webgains.com",
];
// Adtraction's numbered click domains (go.adt291.com, adt284.net) and Impact
// custom domains (imp.i222351.net).
const AFFILIATE_TRACKING_PATTERNS = [/(?:^|\.)adt\d+\.(?:com|net)$/, /(?:^|\.)i\d+\.net$/];
// A contact address is no shop: Storytel once got outlook.com this way.
const WEBMAIL_DOMAINS = ["outlook.com", "hotmail.com", "live.com", "gmail.com", "googlemail.com", "yahoo.com", "icloud.com"];

export function isAffiliateTrackingHost(hostname: string): boolean {
  const host = normalizeDomainInput(hostname);
  return AFFILIATE_TRACKING_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`)) ||
    AFFILIATE_TRACKING_PATTERNS.some((pattern) => pattern.test(host));
}

export function isAffiliateTrackingUrl(url: URL): boolean {
  if (isAffiliateTrackingHost(url.hostname)) return true;
  // HasOffers/Everflow click endpoints on a brand subdomain, e.g.
  // go.nordvpn.net/aff_c?offer_id=… — the shop itself lives elsewhere.
  return /^\/aff_c\/?$/i.test(url.pathname) && url.searchParams.has("offer_id");
}

/** Hosts that never identify a merchant: tracking redirects and webmail. */
export function isNonMerchantHost(hostname: string): boolean {
  const host = normalizeDomainInput(hostname);
  return isAffiliateTrackingHost(host) ||
    WEBMAIL_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}
