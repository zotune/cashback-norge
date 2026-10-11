import type { CashbackOffer } from "./cashback.js";

export const QUICK_FILTERS = [
  { id: "strom", label: "Strøm" },
  { id: "mobil", label: "Mobil" },
  { id: "bredband", label: "Bredbånd" },
  { id: "student", label: "Student" },
] as const;

export type QuickFilterId = typeof QUICK_FILTERS[number]["id"];
type Topic = Exclude<QuickFilterId, "student">;

const STUDENT_PROVIDERS = new Set(["studentkortet", "studenttorget", "unidays", "utdanningibergen"]);
const DOMAIN_TOPICS: Record<string, readonly Topic[]> = {
  "fjordkraft.no": ["strom"],
  "fortum.com": ["strom"],
  "ishavskraft.no": ["strom"],
  "kildenkraft.no": ["strom"],
  "polarkraft.no": ["strom"],
  "slipper.no": ["strom"],
  "tibber.com": ["strom"],
  "trondelagkraft.no": ["strom"],
  "chilimobil.no": ["mobil"],
  "ice.no": ["mobil"],
  "lyca-mobile.no": ["mobil"],
  "plussmobil.no": ["mobil"],
  "talkmore.no": ["mobil"],
  "xn--trndermobil-hgb.no": ["mobil"],
  "saily.com": ["mobil"],
  "airalo.com": ["mobil"],
  "holafly.com": ["mobil"],
  "bergenfiber.no": ["bredband"],
  "altibox.no": ["bredband"],
  "globalconnect.no": ["bredband"],
  "nextgentel.no": ["mobil", "bredband"],
  "telenor.no": ["mobil", "bredband"],
  "telia.no": ["mobil", "bredband"],
};
const MERCHANT_TOPICS: readonly [RegExp, Topic][] = [
  [/\b(?:fjordkraft|fortum|ishavskraft|kilden kraft|polar kraft|tibber|trondelagkraft)\b/, "strom"],
  [/\b(?:talkmore|ice|chilimobil|plussmobil|trondermobil|lyca[\s-]+mobile)\b/, "mobil"],
  [/\b(?:bergenfiber|altibox|globalconnect)\b/, "bredband"],
];

function fold(value: string): string {
  return value.toLowerCase().replace(/ø/g, "o").replace(/æ/g, "ae")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function urlPath(value: string): string {
  try { return decodeURIComponent(new URL(value).pathname); }
  catch { return ""; }
}

function explicitTopics(text: string, isMerchantName = false): Topic[] {
  const topics: Topic[] = [];
  if (/\b(?:strom|stromavtale\w*|stromsparing|stroemsparing|stromappen)\b/.test(text)) topics.push("strom");
  if ((isMerchantName && /\bmobil\b/.test(text)) || /\b(?:mobilabonnement\w*|mobildata|mobilregning\w*|mobiltelefoni|esim|chilimobil|plussmobil|trondermobil|lyca[\s-]+mobile)\b/.test(text)) topics.push("mobil");
  if (/\b(?:bredband\w*|fiber|fiberbredband\w*|internett)\b/.test(text)) topics.push("bredband");
  return topics;
}

export function matchesOfferQuickFilter(offer: CashbackOffer, filter: QuickFilterId | ""): boolean {
  if (filter === "") return true;
  if (filter === "student") {
    return STUDENT_PROVIDERS.has(offer.provider) ||
      /\b(?:studentrabatt\w*|studentpris\w*|studentbevis)\b/.test(fold(offer.terms));
  }

  // Classify each offer, since one merchant can sell both electricity and mobile.
  // A specific product in the title/link takes precedence over the merchant domain.
  const identity = fold([offer.merchantName, urlPath(offer.sourceUrl), urlPath(offer.activationUrl)].join(" "));
  // Equipment sold by an energy company is not an electricity contract.
  if (filter === "strom" && !/\bstromavtale\w*\b/.test(identity) &&
    /\b(?:solcelle\w*|litiumbatteri\w*|ladeboks\w*|hjemmelader\w*|zaptec\w*|inverter\w*)\b/.test(identity)) return false;
  const topics = [
    ...explicitTopics(fold(offer.merchantName), true),
    ...explicitTopics(fold([urlPath(offer.sourceUrl), urlPath(offer.activationUrl)].join(" "))),
  ];
  if (topics.length > 0) return topics.includes(filter);

  // Some crawlers only know a tracking domain, or have no merchant domain yet.
  const name = fold(offer.merchantName);
  if (MERCHANT_TOPICS.some(([pattern, topic]) => topic === filter && pattern.test(name))) return true;

  for (const domain of offer.domains) {
    const normalized = domain.toLowerCase();
    const base = Object.keys(DOMAIN_TOPICS).find(known => normalized === known || normalized.endsWith(`.${known}`));
    if (base && DOMAIN_TOPICS[base]?.includes(filter)) return true;
  }
  return false;
}

export function matchesOfferQuickFilters(offer: CashbackOffer, filters: Iterable<QuickFilterId>): boolean {
  const selected = [...filters];
  if (selected.includes("student") && !matchesOfferQuickFilter(offer, "student")) return false;
  const topics = selected.filter(filter => filter !== "student");
  return topics.length === 0 || topics.some(topic => matchesOfferQuickFilter(offer, topic));
}
