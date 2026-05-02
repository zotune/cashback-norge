export const EB_PER_TRUMF_KR = 13.5;

export const PROVIDER_NAMES: Record<string, string> = {
  trumf: "Trumf",
  klarna: "Klarna",
  remember: "re:member",
  sas: "SAS EB",
  tfbank: "TF Bank",
  dnb: "DNB",
  curve: "Curve Pro",
  rabattkode: "Rabattkode",
  norskfamilie: "NF",
  logbuy: "LogBuy",
  obos: "OBOS",
};

export const PROVIDER_TIPS: Record<string, string> = {
  trumf: "Trumf-bonus. Aktiver i Trumf-appen.\n1 Trumf-kr ≈ 13,5 SAS EuroBonus-poeng.",
  klarna: "Klarna+ medlemskap.\nPlus: +0,5% (49 kr/mnd), Max: +1% (99 kr/mnd).",
  remember: "re:member kredittkort.\nAktiver tilbud i re:member-appen før kjøp.",
  sas: "SAS EuroBonus-poeng.\nAktiver tilbud på SAS sine sider.\nKr-verdi basert på Trumf-kurs (1 kr = 13,5 EB).",
  tfbank: "TF Bank Mastercard.\nAktiver tilbud i TF Bank-appen.",
  dnb: "DNB Spare. Aktiver i DNB-appen.",
  rabattkode: "Rabattkode fra rabattkode.no.\nLim inn koden i handlekurven.",
  norskfamilie: "Norsk Familieøkonomi.\nKrever medlemskap. Aktiver kjøp via norskfamilie.no.",
};

export const PROVIDER_COLORS: Record<string, { bg: string; fg: string }> = {
  remember: { bg: "#111111", fg: "#ff9900" },
  klarna: { bg: "#ffa8cd", fg: "#0b051d" },
  trumf: { bg: "#07006b", fg: "#ffffff" },
  sas: { bg: "#00005c", fg: "#ffffff" },
  tfbank: { bg: "#e30613", fg: "#ffffff" },
  dnb: { bg: "#14555a", fg: "#ffffff" },
  curve: { bg: "#000000", fg: "#ffffff" },
  rabattkode: { bg: "#e74c3c", fg: "#ffffff" },
  norskfamilie: { bg: "#ff6600", fg: "#ffffff" },
  logbuy: { bg: "#d81939", fg: "#ffffff" },
  obos: { bg: "#003087", fg: "#ffffff" },
};

export type BonusCard = {
  pct: number;
  ebPer100kr?: number;
  label: string;
  badge: string;
  url: string;
  approx: boolean;
  tip: string;
};

export const FREE_CARDS: BonusCard[] = [
  {
    pct: 0.0074, ebPer100kr: 10, label: "SAS Amex", badge: "sas-amex", approx: true,
    url: "https://www.americanexpress.com/nb-no/kredittkort/sas-classic/",
    tip: "10 EB/100 kr. Gratis kort.\n2-for-1 på SAS-flyvninger i Europa.\nKr-verdi basert på Trumf-kurs (1 kr = 13,5 EB).",
  },
  {
    pct: 0.0074, ebPer100kr: 10, label: "SAS MC", badge: "sas-amex", approx: true,
    url: "https://saseurobonusmastercard.no/kortene/mastercard/",
    tip: "10 EB/100 kr. Gratis kort (Mastercard).\nAksepteres flere steder enn Amex.\nKr-verdi basert på Trumf-kurs (1 kr = 13,5 EB).",
  },
  {
    pct: 0.0059, ebPer100kr: 8, label: "Lunar EB", badge: "lunar", approx: true,
    url: "https://www.lunar.app/no/privat/sas-eurobonus",
    tip: "8 EB/100 kr (netthandel)\n20 EB/100 kr på SAS.no\nGratis kort.",
  },
  {
    pct: 0.005, label: "Norwegian", badge: "norwegian", approx: false,
    url: "https://www.banknorwegian.no/kredittkort/cashback/",
    tip: "0,5 % cashback (1:1 kr mot faktura)\neller CashPoints (1:1 kr på Norwegian.no).\nGratis kort, ingen årsavgift.",
  },
];

export const PREMIUM_CARDS: BonusCard[] = [
  {
    pct: 0.01, label: "Curve", badge: "curve", approx: false,
    url: "https://www.curve.com/join#D5GXXJJD",
    tip: "Velg butikken i Curve-appen.\nMaks 6 butikker (Pro, €9,99/mnd)\neller 12 (Pro+, €17,99/mnd).\nKombineres med annen cashback.",
  },
  {
    pct: 0.0075, label: "Klarna+", badge: "klarna", approx: false,
    url: "https://www.klarna.com/no/medlemskap/",
    tip: "Plus: +0,5 % (49 kr/mnd)\nMax: +1 % (99 kr/mnd)\nKombineres med annen cashback.",
  },
];

export const REVOLUT_SUBSCRIPTIONS: Record<string, string> = {
  "nordvpn.com": "NordVPN Complete",
  "tinder.com": "Tinder Gold",
  "ft.com": "Financial Times Premium Digital",
  "wework.com": "WeWork (3 pass/mnd)",
  "masterclass.com": "MasterClass Unlimited",
  "chess.com": "Chess.com Diamond",
  "classpass.com": "ClassPass (20 credits/mnd)",
  "makeheadway.com": "Headway",
  "wolt.com": "Wolt+",
  "headspace.com": "Headspace",
  "freeletics.com": "Freeletics",
  "sleepcycle.com": "Sleep Cycle",
  "picsart.com": "Picsart",
  "perplexity.ai": "Perplexity",
  "theathletic.com": "The Athletic",
  "laundryheap.com": "Laundryheap+",
};

export const SUPPORT_LINKS = [
  { text: "Kron: 200 kr gratis i fond →", emoji: "💰", url: "https://kron.no/app/invitert/nvu4d" },
  { text: "Horde: Oversikt over alle kort + nedbetaling →", emoji: "📊", url: "https://app.horde.no/66CS/verve?code=kloube" },
  { text: "Kjøp en kaffe til utvikler →", emoji: "☕", url: "https://buymeacoffee.com/adore" },
  { text: "Revolut: Gratis valutaveksling + bonus →", emoji: "💳", url: "https://revolut.com/referrals?r=FELPJK" },
  { text: "Crypto.com: 3-6 mnd gratis Spotify/Netflix →", emoji: "🎵", url: "https://crypto.com/app/ns3fma5hou" },
  { text: "Curve: Samle alle kort i ett + gratis valutaveksling →", emoji: "💱", url: "https://www.curve.com/join#D5GXXJJD" },
];

export const MERCHANT_ALIASES: Record<string, string> = {
  "auto europe no": "auto europe",
  "christiania glassmagasin": "christiania glasmagasin",
  "hunkemöller": "hunkemøller",
  "jakt og friluft": "jakt & friluft",
  "kinoklubben": "kinoklubb",
  "kitchn": "kitch'n",
  "l\u00b4occitane": "l'occitane",
  "nordic print": "nordicprint",
  "nordicprint": "nordicprint",
  "pyret og snäckan": "pyret & snäckan",
  "racketspesialisten": "racketspecialisten",
  "sky showtime": "skyshowtime",
  "scandic hotels": "scandic",
  "ellos no": "ellos",
  "elite hotels of sweden": "elite hotels",
  "db journey": "db",
  "db™": "db",
  "dbjourney": "db",
  "budget leiebiler": "budget",
  "amisol travel": "amisol",
  "radisson hotels": "radisson hotel group",
  "norton by symantec": "norton",
  "marshall-hodetelefoner": "marshall",
  "lyko online ab": "lyko",
  "babyshop.no": "babyshop",
  "barbershop.no": "barbershop",
  "batteriexperten.com": "batteriexperten",
  "bladkongen.no": "bladkongen",
  "bodystore.no": "bodystore",
  "cs megastore": "computersalg",
  "cs megastore ": "computersalg",
  "dekkonline.com": "dekkonline",
  "elektroimportøren.no": "elektroimportøren",
  "emp-shop.no": "emp",
  "ginatricot.com": "gina tricot",
  "ginatricot": "gina tricot",
  "gullfunn.no": "gullfunn",
  "hbo nordic": "hbo max",
  "ilovedogs.no": "i love dogs",
  "inkclub.no": "inkclub",
  "inkclub.com": "inkclub",
  "interflora.no": "interflora",
  "kinogavekort.no": "kinogavekort",
  "kinoklubb.no": "kinoklubb",
  "lampemesteren.no": "lampemesteren",
  "lensway.no": "lensway",
  "life.no": "life",
  "lunehjem.no": "lunehjem",
  "makeupmekka.no": "makeup mekka",
  "makeupmekka": "makeup mekka",
  "nelly.com": "nelly",
  "nlyman": "nly man",
  "nordicnest": "nordic nest",
  "outnorth.no": "outnorth",
  "parfym.no": "parfym",
  "polarnopyret.no": "polarn o. pyret",
  "sportmann.no": "sportmann",
  "stormberg.com": "stormberg",
  "tirendo.no": "tirendo",
  "urverket.no": "urverket",
  "vistaprint.no": "vistaprint",
  "vpg.no": "vpg",
  "weekday.com": "weekday",
  "zoo.no": "zoo",
  "elon.no": "elon",
  "kicks.no": "kicks",
  "autodude.no / valostore.no": "autodude",
  "vetzoo.no": "vetzoo",
  "new vetzoo.no kco v.3 b2b recurring": "vetzoo",
  "veromoda": "vero moda",
};
