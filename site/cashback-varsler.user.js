// ==UserScript==
// @name         cashbacknorge.no
// @namespace    https://cashbacknorge.no/
// @version      1780792818
// @description  Vis cashback-tilbud automatisk på norske nettbutikker
// @author       zotune
// @icon         https://cashbacknorge.no/favicon.png
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      native-backend.cloud.pji.nu
// @connect      browser-extension-backend.cloud.pji.nu
// @connect      godpris.no
// @connect      api.augmentedsteam.com
// @connect      namx6ho175-dsn.algolia.net
// @connect      isthereanydeal.com
// @connect      www.klarna.com
// @connect      www.playstation.com
// @connect      store.playstation.com
// @connect      www.vinmonopolet.no
// @connect      vinmonopolet.no
// @connect      open.er-api.com
// @connect      gql.prisradar.no
// @connect      prisradar.no
// @connect      www.sesum.no
// @connect      sesum.no
// @connect      enhver.no
// @connect      api.enhver.no
// @run-at       document-idle
// @updateURL    https://cashbacknorge.no/cashback-varsler.user.js
// @downloadURL  https://cashbacknorge.no/cashback-varsler.user.js
// ==/UserScript==
(function() {
  "use strict";
  function readLocalStorageValue(key) {
    const value = localStorage.getItem(key);
    if (value === null) return void 0;
    try {
      return JSON.parse(value);
    } catch (_e) {
      return void 0;
    }
  }
  function writeLocalStorageValue(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_e) {
    }
  }
  async function readUserscriptStorageValue(key) {
    if (typeof GM_getValue === "function") {
      const value = GM_getValue(key, void 0);
      return value === void 0 ? readLocalStorageValue(key) : value;
    }
    if (typeof GM !== "undefined" && typeof GM.getValue === "function") {
      const value = await GM.getValue(key, void 0);
      return value === void 0 ? readLocalStorageValue(key) : value;
    }
    return readLocalStorageValue(key);
  }
  async function writeUserscriptStorageValue(key, value) {
    if (typeof GM_setValue === "function") {
      await GM_setValue(key, value);
      writeLocalStorageValue(key, value);
      return;
    }
    if (typeof GM !== "undefined" && typeof GM.setValue === "function") {
      await GM.setValue(key, value);
      writeLocalStorageValue(key, value);
      return;
    }
    writeLocalStorageValue(key, value);
  }
  const chrome = {
    runtime: {
      onMessage: { addListener() {
      } },
      sendMessage(_m, cb) {
        cb?.({ ok: false, reason: "userscript" });
      },
      get lastError() {
        return void 0;
      },
      getURL() {
        return "https://cashbacknorge.no/cashback-index.json";
      }
    },
    storage: {
      local: {
        get(keys, cb) {
          void (async () => {
            const r = {};
            const keyList = Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : Object.keys(keys ?? {});
            for (const k of keyList) {
              const v = await readUserscriptStorageValue(k);
              if (v !== void 0) r[k] = v;
            }
            cb(r);
          })();
        },
        set(items, cb) {
          void (async () => {
            for (const [k, v] of Object.entries(items)) {
              await writeUserscriptStorageValue(k, v);
            }
            cb?.();
          })();
        }
      }
    }
  };
  const EB_PER_TRUMF_KR$1 = 13.5;
  const PROVIDER_NAMES = {
    trumf: "Trumf",
    klarna: "Klarna",
    remember: "re:member",
    sas: "SAS",
    tfbank: "TF Bank",
    dnb: "DNB",
    curve: "Curve Pro",
    rabattkode: "Rabattkode",
    norskfamilie: "NF",
    logbuy: "LogBuy",
    obos: "OBOS",
    bob: "BOB",
    usbl: "USBL",
    bate: "Bate",
    tobb: "TOBB",
    naf: "NAF",
    tekna: "Tekna",
    nito: "NITO",
    sparebank1: "SB1 Ung",
    studentkortet: "Studentkortet",
    studenttorget: "StudentTorget",
    nettbonus: "NettBonus",
    spenn: "Spenn",
    spareborsen: "Sparebørsen",
    rabble: "rabble",
    dreams: "Dreams",
    utdanningibergen: "Utdanning i Bergen",
    unidays: "UNiDAYS",
    cbn: "♥",
    unio: "Unio"
  };
  const FREE_CARDS = [
    {
      pct: 74e-4,
      ebPer100kr: 10,
      label: "SAS Amex",
      badge: "sas-amex",
      approx: true,
      url: "https://www.americanexpress.com/nb-no/kredittkort/sas-classic/",
      tip: "10 EB/100 kr. Gratis kort.\n2-for-1 på SAS-flyvninger i Europa.\nKr-verdi basert på Trumf-kurs (1 kr = 13,5 EB)."
    },
    {
      pct: 5e-3,
      label: "Norwegian",
      badge: "norwegian",
      approx: false,
      url: "https://www.banknorwegian.no/kredittkort/cashback/",
      tip: "0,5 % cashback (1:1 kr mot faktura)\neller CashPoints (1:1 kr på Norwegian.no).\nGratis kort, ingen årsavgift."
    }
  ];
  const PREMIUM_CARDS = [
    {
      pct: 0.035,
      minPct: 0.02,
      maxPct: 0.05,
      label: "Crypto",
      badge: "crypto",
      approx: false,
      url: "https://crypto.com/app/ns3fma5hou",
      tip: "Crypto.com Visa-kort.\nPlatin: +2 % (400 kr/mnd), Jade/Obsidian: +5 %.\nKombineres med annen cashback."
    },
    {
      pct: 0.01,
      label: "Curve",
      badge: "curve",
      approx: false,
      url: "https://www.curve.com/join#D5GXXJJD",
      tip: "Velg butikken i Curve-appen.\nMaks 6 butikker (Pro, €9,99/mnd)\neller 12 (Pro+, €17,99/mnd).\nKombineres med annen cashback."
    },
    {
      pct: 75e-4,
      minPct: 5e-3,
      maxPct: 0.01,
      label: "Klarna",
      badge: "klarna",
      approx: false,
      url: "https://www.klarna.com/no/medlemskap/",
      tip: "Plus: +0,5 % (49 kr/mnd)\nMax: +1 % (99 kr/mnd)\nKombineres med annen cashback."
    }
  ];
  const REVOLUT_SUBSCRIPTIONS = {
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
    "laundryheap.com": "Laundryheap+"
  };
  const SUPPORT_LINKS = [
    { text: "Kron: 200 kr gratis i fond", emoji: "💰", url: "https://kron.no/app/invitert/nvu4d", affiliate: true },
    { text: "Horde: Oversikt over alle kort + nedbetaling", emoji: "📊", url: "https://app.horde.no/66CS/verve?code=kloube", affiliate: true },
    { text: "Kjøp en kaffe til utvikler ♥", emoji: "☕", url: "https://buymeacoffee.com/adore", affiliate: false },
    { text: "Wise: Gratis internasjonal overføring opptil 5 000 kr", emoji: "🌍", url: "https://wise.com/invite/dic/mikaele41", affiliate: true },
    { text: "Tibber strøm: 500 kr i Tibber Store eller 6 mnd fri avgift", emoji: "⚡", url: "https://invite.tibber.com/nwm7kene", affiliate: true },
    { text: "Revolut: Gratis valutaveksling + bonus", emoji: "💳", url: "https://revolut.com/referrals?r=FELPJK", affiliate: true },
    { text: "Crypto.com: 3-6 mnd gratis Spotify/Netflix", emoji: "🎵", url: "https://crypto.com/app/ns3fma5hou", affiliate: true },
    { text: "JujuKrypto: 100 kr gratis i NOK", emoji: "₿", url: "https://jujukrypto.no/referral/L1BsViuhUjJhvngHiroC", affiliate: true },
    { text: "NBX: 75 kr i BTC", emoji: "₿", url: "https://app.nbx.com/login/signup?referral=cjgOu54PvA", affiliate: true },
    { text: "Curve: Samle alle kort i ett + gratis valutaveksling", emoji: "💱", url: "https://www.curve.com/join#D5GXXJJD", affiliate: true },
    { text: "NettBonus: Inviter en venn og få 200 kr", emoji: "🎁", url: "https://nettbonus.no/r/28698", affiliate: true },
    { text: "Sparebørsen: 50 kr settes inn med en gang du registrerer deg", emoji: "💰", url: "https://spareborsen.no/ref/cmoxhkl4bhevrnv9d6uo77an5", affiliate: true }
  ];
  const EB_PER_TRUMF_KR = 13.5;
  function formatRewardLabel(reward, provider) {
    const trimmedReward = reward.trim();
    if (trimmedReward.length === 0 || isGenericMembershipReward(trimmedReward)) return "?";
    if (provider === "sas") {
      const converted = convertSasToPercent(trimmedReward);
      return converted !== "" ? converted : trimmedReward;
    }
    if (provider === "trumf") {
      const converted = convertTrumfToEb(trimmedReward);
      return converted !== "" ? `${trimmedReward} (${converted})` : trimmedReward;
    }
    return trimmedReward;
  }
  function isGenericMembershipReward(reward) {
    return /^(?:medlemsfordel|medlemstilbud|medlemspris)$/i.test(reward.trim());
  }
  function formatCompactRewardLabel(offer) {
    const label = formatRewardLabel(offer.reward, offer.provider);
    if (/\d+(?:[,.]\d+)?\s*kr\s*\/\s*/i.test(label) && label.includes("+")) {
      return label.replace(/\s+/g, " ");
    }
    const percentMatch = label.match(/(~)?(\d+(?:[,.]\d+)?\s*[-–]\s*\d+(?:[,.]\d+)?\s*%|\d+(?:[,.]\d+)?\s*%)/i);
    if (percentMatch !== null) {
      const prefix = percentMatch[1] ?? "";
      return (prefix + percentMatch[2]).replace(/\s+/g, " ");
    }
    const totalSumMatch = label.match(/\d[\d\s]*(?:[,.]\d+)?(?:\s*[-–]\s*\d[\d\s]*(?:[,.]\d+)?)?\s*kr\s+totalsum/i);
    if (totalSumMatch !== null) {
      return totalSumMatch[0].replace(/\s+/g, " ");
    }
    const krRangeMatch = label.match(/\d[\d\s]*(?:[,.]\d+)?\s*[-–]\s*\d[\d\s]*(?:[,.]\d+)?\s*kr(?:\/time|\s+per\s+time)?/i);
    if (krRangeMatch !== null) {
      return krRangeMatch[0].replace(/\s+/g, " ");
    }
    const krMatch = label.match(/\d[\d\s]*(?:[,.]\d+)?\s*kr(?:\/time|\s+per\s+time)?/i);
    if (krMatch !== null) {
      return krMatch[0].replace(/\s+/g, " ");
    }
    if (/gratis\s+frakt/i.test(label)) return "Gratis frakt";
    if (/gratis/i.test(label)) return "Gratis";
    return label.length <= 14 ? label : void 0;
  }
  function calculateCashback(offer, amount) {
    if (offer.provider === "cbn") {
      const pctMatch2 = offer.reward.match(/(\d+(?:[,.]\d+)?)\s*%/);
      if (pctMatch2 !== null) {
        const pct = Number.parseFloat(pctMatch2[1]?.replace(",", ".") ?? "0");
        return `${formatKr(amount * pct / 100)} kr til gode formål`;
      }
      const fixedKrMatch = offer.reward.match(/(\d+(?:[,.]\d+)?)\s*kr/i);
      if (fixedKrMatch !== null) {
        const fixedKr = Number.parseFloat(fixedKrMatch[1]?.replace(",", ".") ?? "0");
        return `${formatKr(fixedKr)} kr til gode formål`;
      }
      return "";
    }
    const reward = offer.reward.trim();
    const rangeMatch = reward.match(/^([\d,.]+)%?-([\d,.]+)\s*%$/);
    if (rangeMatch !== null) {
      const minPct = Number.parseFloat((rangeMatch[1] ?? "0").replace(",", "."));
      const maxPct = Number.parseFloat((rangeMatch[2] ?? "0").replace(",", "."));
      const minKr = amount * minPct / 100;
      const maxKr = amount * maxPct / 100;
      const label = minKr === maxKr ? `${formatKr(minKr)} kr` : `${formatKr(minKr)}-${formatKr(maxKr)} kr`;
      return addEbSuffix(label, minPct, maxPct, amount, offer.provider);
    }
    const pctMatch = reward.match(/^([\d,.]+)\s*%$/);
    if (pctMatch !== null) {
      const pct = Number.parseFloat((pctMatch[1] ?? "0").replace(",", "."));
      const kr = amount * pct / 100;
      return addEbSuffix(`${formatKr(kr)} kr`, pct, pct, amount, offer.provider);
    }
    const sasRateMatch = reward.match(/^([\d\s]+)\s*poeng\s+per\s+100\s*kr$/i);
    if (sasRateMatch !== null) {
      const points = Number.parseInt((sasRateMatch[1] ?? "0").replace(/\s/g, ""), 10);
      const eb = Math.round(amount * points / 100);
      const kr = amount * points / 100 / EB_PER_TRUMF_KR;
      return `~${formatKr(kr)} kr (~${eb} EB)`;
    }
    const sasFixedMatch = reward.match(/^([\d\s]+)\s*poeng$/i);
    if (sasFixedMatch !== null) {
      const points = Number.parseInt((sasFixedMatch[1] ?? "0").replace(/\s/g, ""), 10);
      const kr = points / EB_PER_TRUMF_KR;
      return `~${formatKr(kr)} kr (~${points} EB)`;
    }
    const klarnaMatch = reward.match(/^([\d.]+)%$/);
    if (klarnaMatch !== null) {
      const pct = Number.parseFloat(klarnaMatch[1] ?? "0");
      const kr = amount * pct / 100;
      return `${formatKr(kr)} kr`;
    }
    return "";
  }
  function formatBreakdownWithAmounts(terms, amount) {
    return terms.split("\n").map((line) => {
      const match = line.match(/^([\d,.]+)\s*%/);
      if (match !== null) {
        const pct = Number.parseFloat((match[1] ?? "0").replace(",", "."));
        const kr = amount * pct / 100;
        return `${line} (${formatKr(kr)} kr)`;
      }
      return line;
    }).join("\n");
  }
  function formatKr(value) {
    if (Number.isInteger(value)) {
      return value.toString();
    }
    return value.toFixed(2).replace(".", ",").replace(/,00$/, "");
  }
  function addEbSuffix(label, minPct, maxPct, amount, provider) {
    if (provider === "trumf") {
      const minEb = Math.round(amount * minPct / 100 * EB_PER_TRUMF_KR);
      const maxEb = Math.round(amount * maxPct / 100 * EB_PER_TRUMF_KR);
      const ebStr = minEb === maxEb ? `~${minEb} EB` : `~${minEb}-${maxEb} EB`;
      return `${label} (${ebStr})`;
    }
    if (provider === "sas") {
      const minEb = Math.round(amount * minPct / 100 * EB_PER_TRUMF_KR);
      const maxEb = Math.round(amount * maxPct / 100 * EB_PER_TRUMF_KR);
      const ebStr = minEb === maxEb ? `~${minEb} EB` : `~${minEb}-${maxEb} EB`;
      return `~${label} (${ebStr})`;
    }
    return label;
  }
  function convertSasToPercent(reward) {
    const fixedMatch = reward.match(/^([\d\s]+)\s*poeng$/i);
    if (fixedMatch !== null) {
      const points = Number.parseInt((fixedMatch[1] ?? "0").replace(/\s/g, ""), 10);
      const kr = Math.round(points / EB_PER_TRUMF_KR);
      return `~${kr} kr (~${points.toLocaleString("nb-NO")} EB)`;
    }
    const rateMatch = reward.match(/^([\d\s]+)\s*poeng\s+per\s+100\s*kr$/i);
    if (rateMatch !== null) {
      const points = Number.parseInt((rateMatch[1] ?? "0").replace(/\s/g, ""), 10);
      const pct = points / EB_PER_TRUMF_KR;
      return `~${formatNo(pct)} % (~${points} EB/100kr)`;
    }
    return "";
  }
  function convertTrumfToEb(reward) {
    const rangeMatch = reward.match(/^([\d,.]+)%?-([\d,.]+)\s*%$/);
    if (rangeMatch !== null) {
      const minPct = Number.parseFloat((rangeMatch[1] ?? "0").replace(",", "."));
      const maxPct = Number.parseFloat((rangeMatch[2] ?? "0").replace(",", "."));
      const minEb = Math.round(minPct * EB_PER_TRUMF_KR);
      const maxEb = Math.round(maxPct * EB_PER_TRUMF_KR);
      return `~${minEb}-${maxEb} EB/100kr`;
    }
    const pctMatch = reward.match(/^([\d,.]+)\s*%$/);
    if (pctMatch !== null) {
      const pct = Number.parseFloat((pctMatch[1] ?? "0").replace(",", "."));
      const ebPer100 = Math.round(pct * EB_PER_TRUMF_KR);
      return `~${ebPer100} EB/100kr`;
    }
    const krMatch = reward.match(/^([\d\s]+)\s*kr$/);
    if (krMatch !== null) {
      const kr = Number.parseInt((krMatch[1] ?? "0").replace(/\s/g, ""), 10);
      const eb = Math.round(kr * EB_PER_TRUMF_KR);
      return `~${eb.toLocaleString("nb-NO")} EB`;
    }
    return "";
  }
  function formatNo(value) {
    return value % 1 === 0 ? value.toString() : value.toFixed(1).replace(".", ",");
  }
  const PACKAGE_QUANTITY_PATTERN = /\b(\d+(?:[,.]\d+)?)\s*(kg|kgm|kilo|kilogram|g|gr|grm|gram|grams|l|ltr|liter|litre|dl|dlt|cl|clt|ml|mlt|stk|stykk|stykke|pcs|pc|pk|pakke|pack)(?=$|[^A-Za-z0-9])/gi;
  const GROCERY_CONTEXT_HOSTS = [
    "oda.com",
    "kolonial.no",
    "meny.no",
    "spar.no",
    "kiwi.no",
    "joker.no",
    "rema.no",
    "rema1000.no",
    "coop.no",
    "bunnpris.no",
    "holdbart.no",
    "europris.no",
    "matkroken.no",
    "naerbutikken.no",
    "sesum.no",
    "enhver.no"
  ];
  function readPackageQuantityFromText(text) {
    if (text === void 0) return void 0;
    const quantities = [];
    for (const match of text.matchAll(PACKAGE_QUANTITY_PATTERN)) {
      const amount = parseLocalizedNumber$2(match[1] ?? "");
      const unit = normalizePackageUnit(match[2] ?? "");
      if (unit === void 0 || !Number.isFinite(amount) || amount <= 0) continue;
      const normalizedAmount = normalizePackageAmount(amount * unit.multiplier);
      if (!isReasonablePackageQuantity(normalizedAmount, unit.unit)) continue;
      quantities.push({ amount: normalizedAmount, unit: unit.unit });
    }
    return quantities.find((quantity) => quantity.unit !== "pcs") ?? quantities[0];
  }
  function readPackageQuantityFromValue(value) {
    if (typeof value === "string" || typeof value === "number") {
      return readPackageQuantityFromText(String(value));
    }
    if (!isPlainRecord$6(value)) return void 0;
    const rawAmount = readNumberLike$6(value.value) ?? readNumberLike$6(value.amount) ?? readNumberLike$6(value.weight) ?? readNumberLike$6(value.volume);
    const rawUnit = readStringLike$5(value.unitText) ?? readStringLike$5(value.unitCode) ?? readStringLike$5(value.unit) ?? readStringLike$5(value.measurementTechnique);
    if (rawAmount === void 0 || rawUnit === void 0) {
      return readPackageQuantityFromText(Object.values(value).map((item) => String(item)).join(" "));
    }
    const unit = normalizePackageUnit(rawUnit);
    if (unit === void 0) return void 0;
    const amount = normalizePackageAmount(rawAmount * unit.multiplier);
    return isReasonablePackageQuantity(amount, unit.unit) ? { amount, unit: unit.unit } : void 0;
  }
  function isSamePackageQuantity(first, second) {
    if (first === void 0 || second === void 0 || first.unit !== second.unit) return false;
    return Math.abs(first.amount - second.amount) <= Math.max(0.5, first.amount * 0.01);
  }
  function buildPackageQuantityLabels(quantity) {
    if (quantity === void 0) return [];
    if (quantity.unit === "g") {
      const grams = formatPackageAmount(quantity.amount);
      const labels = [`${grams}g`, `${grams} g`];
      if (quantity.amount >= 1e3 && quantity.amount % 1e3 === 0) {
        const kilos = formatPackageAmount(quantity.amount / 1e3);
        labels.push(`${kilos}kg`, `${kilos} kg`);
      }
      return uniqueStrings$9(labels);
    }
    if (quantity.unit === "ml") {
      const milliliters = formatPackageAmount(quantity.amount);
      const labels = [`${milliliters}ml`, `${milliliters} ml`];
      if (quantity.amount >= 100 && quantity.amount % 10 === 0) {
        const liters = formatPackageAmount(quantity.amount / 1e3);
        labels.push(`${liters}l`, `${liters} l`);
      }
      if (quantity.amount % 10 === 0) {
        const centiliters = formatPackageAmount(quantity.amount / 10);
        labels.push(`${centiliters}cl`, `${centiliters} cl`);
      }
      return uniqueStrings$9(labels);
    }
    const pieces = formatPackageAmount(quantity.amount);
    return uniqueStrings$9([`${pieces}stk`, `${pieces} stk`, `${pieces}pk`, `${pieces} pk`]);
  }
  function isLikelyGroceryPriceMatchContext(...rawUrls) {
    return rawUrls.some((rawUrl) => {
      if (rawUrl === void 0) return false;
      try {
        const hostname = new URL(rawUrl).hostname.replace(/^www\./, "").toLowerCase();
        return GROCERY_CONTEXT_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
      } catch {
        return false;
      }
    });
  }
  function normalizePackageUnit(rawUnit) {
    const unit = transliterateNorwegianCharacters$4(rawUnit).normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-zA-Z]/g, "").toLowerCase();
    if (unit === "kg" || unit === "kgm" || unit === "kilo" || unit === "kilogram") return { unit: "g", multiplier: 1e3 };
    if (unit === "g" || unit === "gr" || unit === "grm" || unit === "gram" || unit === "grams") return { unit: "g", multiplier: 1 };
    if (unit === "l" || unit === "ltr" || unit === "liter" || unit === "litre") return { unit: "ml", multiplier: 1e3 };
    if (unit === "dl" || unit === "dlt") return { unit: "ml", multiplier: 100 };
    if (unit === "cl" || unit === "clt") return { unit: "ml", multiplier: 10 };
    if (unit === "ml" || unit === "mlt") return { unit: "ml", multiplier: 1 };
    if (unit === "stk" || unit === "stykk" || unit === "stykke" || unit === "pcs" || unit === "pc") {
      return { unit: "pcs", multiplier: 1 };
    }
    if (unit === "pk" || unit === "pakke" || unit === "pack") return { unit: "pcs", multiplier: 1 };
    return void 0;
  }
  function isReasonablePackageQuantity(amount, unit) {
    if (!Number.isFinite(amount) || amount <= 0) return false;
    if (unit === "pcs") return amount <= 200;
    return amount <= 1e5;
  }
  function normalizePackageAmount(amount) {
    return Number.isInteger(amount) ? amount : Number(amount.toFixed(2));
  }
  function formatPackageAmount(amount) {
    return Number.isInteger(amount) ? String(amount) : String(Number(amount.toFixed(2))).replace(".", ",");
  }
  function parseLocalizedNumber$2(value) {
    const compact = value.replace(/\s/g, "").replace(",", ".");
    const parsed = Number.parseFloat(compact);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  function readStringLike$5(value) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : void 0;
    }
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return void 0;
  }
  function readNumberLike$6(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return void 0;
    const parsed = parseLocalizedNumber$2(value);
    return Number.isFinite(parsed) ? parsed : void 0;
  }
  function transliterateNorwegianCharacters$4(value) {
    return value.replace(/[\u00C6\u00E6]/g, "ae").replace(/[\u00D8\u00F8]/g, "o").replace(/[\u00C5\u00E5]/g, "a");
  }
  function uniqueStrings$9(values) {
    return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
  }
  function isPlainRecord$6(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  const PRODUCT_TITLE_BASE_MATCH_SEPARATORS = [
    /\s+\|\s+/,
    /\s+[-\u2013\u2014]\s+/,
    /\s+\u2022\s+/
  ];
  const CANONICAL_MATCH_TOKENS$1 = /* @__PURE__ */ new Map([
    ["black", "svart"],
    ["carbon", "svart"],
    ["controller", "kontroller"],
    ["controllers", "kontroller"],
    ["gamepad", "kontroller"],
    ["gamepads", "kontroller"],
    ["joypad", "kontroller"],
    ["wireless", "tradlos"],
    ["sort", "svart"],
    ["white", "hvit"]
  ]);
  const CONDITION_VARIANT_TOKENS$1 = ["fornyet", "refurbished", "renewed", "brukt", "used", "preowned"];
  const GENERIC_PRODUCT_SIGNAL_TOKENS = /* @__PURE__ */ new Set([
    "antibacterial",
    "ansiktskrem",
    "cleansing",
    "hydrating",
    "intensive",
    "moisturising",
    "moisturizing",
    "protective",
    "repairing",
    "sensitive",
    "soothing"
  ]);
  function scoreProductTitleAgainstSearchTerm(searchTerm, title) {
    return Math.max(
      0,
      ...buildProductTitleBaseCandidates(searchTerm).map((candidate) => scoreProductTitleMatch(candidate, title))
    );
  }
  function isLikelySameProductTitle(searchTerm, title, minimumScore = 0.45) {
    return buildProductTitleBaseCandidates(searchTerm).some((candidate) => {
      return scoreProductTitleMatch(candidate, title) >= minimumScore && hasProductTitleSignalOverlap(candidate, title);
    });
  }
  function scoreProductTitleMatch(query, title) {
    const queryTokens = tokenizeMatchText$1(query);
    const titleTokens = new Set(tokenizeMatchText$1(title));
    if (queryTokens.length === 0 || titleTokens.size === 0) return 0;
    let matchedWeight = 0;
    let totalWeight = 0;
    for (const token of queryTokens) {
      const weight = token.length >= 6 ? 2 : token.length >= 4 ? 1.5 : 1;
      totalWeight += weight;
      if (titleTokens.has(token)) {
        matchedWeight += weight;
        continue;
      }
      if ([...titleTokens].some((titleToken) => titleToken.length >= 4 && (titleToken.startsWith(token) || token.startsWith(titleToken)))) {
        matchedWeight += weight * 0.5;
      }
    }
    const score = totalWeight > 0 ? matchedWeight / totalWeight : 0;
    return hasUnrequestedConditionVariant$1(queryTokens, titleTokens) ? score * 0.2 : score;
  }
  function hasProductTitleSignalOverlap(query, title) {
    const querySignals = tokenizeMatchText$1(query).filter(isProductSignalToken);
    if (querySignals.length === 0) return true;
    const titleTokens = tokenizeMatchText$1(title);
    if (titleTokens.length === 0) return false;
    return querySignals.some((queryToken) => {
      return titleTokens.some((titleToken) => {
        return titleToken === queryToken || titleToken.length >= 4 && (titleToken.startsWith(queryToken) || queryToken.startsWith(titleToken));
      });
    });
  }
  function isProductSignalToken(token) {
    return token.length >= 6 && /[a-z]/.test(token) && !/\d/.test(token) && !GENERIC_PRODUCT_SIGNAL_TOKENS.has(token);
  }
  function buildProductTitleBaseCandidates(searchTerm) {
    const normalizedSearchTerm = searchTerm.trim().replace(/\s+/g, " ");
    const separatorPrefixCandidates = PRODUCT_TITLE_BASE_MATCH_SEPARATORS.map((separator) => normalizedSearchTerm.split(separator)[0]);
    const buyTitleMatch = normalizedSearchTerm.match(/^(?:kj\u00f8p|kjop|buy)\s+(.+?)\s+(?:hos|at)\s+.+$/i);
    return uniqueStrings$8([
      normalizedSearchTerm,
      ...separatorPrefixCandidates,
      buyTitleMatch?.[1]
    ]).filter((candidate) => candidate.length >= 4);
  }
  function tokenizeMatchText$1(value) {
    const normalizedValue = transliterateNorwegianCharacters$3(value).normalize("NFD").replace(/\p{Diacritic}/gu, "");
    return uniqueStrings$8(normalizedValue.split(/[^A-Za-z0-9]+/).map(normalizeMatchToken$1).filter((token) => token !== void 0 && token.length >= 2).map(canonicalizeMatchToken$1));
  }
  function normalizeMatchToken$1(value) {
    const normalized = transliterateNorwegianCharacters$3(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
    return normalized.length > 0 ? normalized : void 0;
  }
  function canonicalizeMatchToken$1(token) {
    return CANONICAL_MATCH_TOKENS$1.get(token) ?? token;
  }
  function hasUnrequestedConditionVariant$1(queryTokens, titleTokens) {
    return CONDITION_VARIANT_TOKENS$1.some((token) => titleTokens.has(token) && !queryTokens.includes(token));
  }
  function transliterateNorwegianCharacters$3(value) {
    return value.replace(/[\u00C6\u00E6]/g, "ae").replace(/[\u00D8\u00F8]/g, "o").replace(/[\u00C5\u00E5]/g, "a");
  }
  function uniqueStrings$8(values) {
    return [...new Set(values.map((value) => value?.trim()).filter((value) => value !== void 0 && value.length > 0))];
  }
  const GODPRIS_PRODUCT_URL = "https://godpris.no/produkt/";
  const MIN_PRODUCT_TITLE_MATCH_SCORE = 0.45;
  const BAD_AVAILABILITY_STATUSES$3 = /* @__PURE__ */ new Set([
    "discontinued",
    "not_available",
    "not_in_stock",
    "out_of_stock"
  ]);
  const BRAND_MATCH_GROUPS = [
    ["apple"],
    ["google", "pixel"],
    ["microsoft", "xbox"],
    ["nintendo"],
    ["samsung"],
    ["sony", "playstation"]
  ];
  async function findGodprisPriceMatch(message, requestJson = fetchJson$6, requestText = fetchText$4) {
    if (!message.productPageClue && message.searchTerm.trim().length < 8) {
      return void 0;
    }
    const searchQueries = uniqueStrings$7([
      ...(message.codes ?? []).filter(isLikelyGtin$5),
      message.searchTerm
    ]);
    const packageQuantity = getMessagePackageQuantity$2(message);
    for (const query of searchQueries) {
      const productId = await fetchGodprisProductId(query, requestJson, message.searchTerm, packageQuantity);
      if (productId === void 0) continue;
      const html = await requestText(`${GODPRIS_PRODUCT_URL}${encodeURIComponent(productId)}`, {
        headers: { "Accept": "text/html,application/xhtml+xml" }
      });
      const offer = html !== void 0 ? readGodprisProductPage(html, productId, packageQuantity) : void 0;
      if (offer !== void 0) return offer;
    }
    return void 0;
  }
  async function fetchGodprisProductId(query, requestJson, titleHint, packageQuantity) {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 4) return void 0;
    const params = new URLSearchParams({ q: normalizedQuery });
    const value = await requestJson(`https://godpris.no/api/product/search?${params.toString()}`, {
      headers: { "Accept": "application/json" }
    });
    if (!isPlainRecord$5(value) || !Array.isArray(value.results)) return void 0;
    const isCodeQuery = isLikelyGtin$5(normalizedQuery);
    let bestMatch;
    for (const result of value.results) {
      if (!isPlainRecord$5(result)) continue;
      const id = readStringLike$4(result.id);
      if (id === void 0) continue;
      const title = readStringLike$4(result.title);
      const groupTitle = readStringLike$4(result.group_title);
      const brand = readStringLike$4(result.brand);
      const matchQuery = isCodeQuery && titleHint !== void 0 ? titleHint : normalizedQuery;
      const score = Math.max(
        scoreGodprisProductMatch(matchQuery, uniqueStrings$7([brand, title]).join(" "), brand, packageQuantity),
        scoreGodprisProductMatch(matchQuery, title ?? "", brand, packageQuantity),
        scoreGodprisProductMatch(matchQuery, groupTitle ?? "", brand, packageQuantity)
      );
      if (bestMatch === void 0 || score > bestMatch.score) {
        bestMatch = { id, score };
      }
    }
    return bestMatch !== void 0 && bestMatch.score >= MIN_PRODUCT_TITLE_MATCH_SCORE ? bestMatch.id : void 0;
  }
  function scoreGodprisProductMatch(query, title, brand, packageQuantity) {
    if (!isLikelySameProductTitle(query, title, MIN_PRODUCT_TITLE_MATCH_SCORE)) return 0;
    if (!isGodprisPackageQuantityCompatible(packageQuantity, title)) return 0;
    const score = scoreProductTitleAgainstSearchTerm(query, title);
    return hasGodprisBrandConflict(query, brand) ? score * 0.3 : score;
  }
  function hasGodprisBrandConflict(query, brand) {
    if (brand === void 0) return false;
    const queryTokens = new Set(tokenizeGodprisBrandText(query));
    const brandTokens = new Set(tokenizeGodprisBrandText(brand));
    if (queryTokens.size === 0 || brandTokens.size === 0) return false;
    const queryBrandGroups = BRAND_MATCH_GROUPS.filter((group) => group.some((token) => queryTokens.has(token)));
    if (queryBrandGroups.length === 0) return false;
    return !queryBrandGroups.some((group) => group.some((token) => brandTokens.has(token)));
  }
  function readGodprisProductPage(html, fallbackProductId, packageQuantity) {
    const page = readGodprisDataPage(html);
    const props = isPlainRecord$5(page?.props) ? page.props : void 0;
    const product = isPlainRecord$5(props?.product) ? props.product : void 0;
    const prices = Array.isArray(props?.prices) ? props.prices : [];
    if (product === void 0 || prices.length === 0) return void 0;
    const productId = readStringLike$4(product.id) ?? fallbackProductId;
    const rawProductName = readStringLike$4(product.title) ?? readStringLike$4(product.name);
    const productBrand = readStringLike$4(product.brand);
    const productName = withLeadingBrand$1(rawProductName, productBrand) ?? "Godpris-produkt";
    if (!isGodprisPackageQuantityCompatible(packageQuantity, productName)) return void 0;
    const offers = prices.map(readGodprisOffer).filter((offer) => offer !== void 0).sort((first, second) => first.amount - second.amount);
    const best = offers[0];
    if (best === void 0) return void 0;
    return {
      ...best,
      source: "godpris",
      sourceName: "Godpris",
      productName,
      productUrl: `${GODPRIS_PRODUCT_URL}${encodeURIComponent(productId)}`,
      alternatives: offers.slice(0, 8).map((offer) => ({
        shopName: offer.shopName,
        amount: offer.amount,
        currency: offer.currency,
        price: offer.price
      }))
    };
  }
  function getMessagePackageQuantity$2(message) {
    return message.packageAmount !== void 0 && message.packageUnit !== void 0 ? { amount: message.packageAmount, unit: message.packageUnit } : void 0;
  }
  function isGodprisPackageQuantityCompatible(expectedQuantity, productName) {
    if (expectedQuantity === void 0) return true;
    const productQuantity = readPackageQuantityFromText(productName);
    return productQuantity === void 0 || isSamePackageQuantity(expectedQuantity, productQuantity);
  }
  function readGodprisDataPage(html) {
    const match = html.match(/<div id="app" data-page="([^"]*)"/);
    if (match?.[1] === void 0) return void 0;
    try {
      return JSON.parse(decodeHtmlAttribute$1(match[1]));
    } catch {
      return void 0;
    }
  }
  function withLeadingBrand$1(productName, brandName) {
    if (productName === void 0) return void 0;
    if (brandName === void 0 || productName.toLowerCase().includes(brandName.toLowerCase())) return productName;
    return `${brandName} ${productName}`;
  }
  function readGodprisOffer(value) {
    if (!isPlainRecord$5(value)) return void 0;
    const shop = isPlainRecord$5(value.shop) ? value.shop : void 0;
    const amount = readNumberLike$5(value.price);
    const shopName = readStringLike$4(shop?.title) ?? readStringLike$4(value.shop_title);
    const availability = readStringLike$4(value.availability)?.toLowerCase();
    if (amount === void 0 || amount <= 0 || shopName === void 0) return void 0;
    if (availability !== void 0 && BAD_AVAILABILITY_STATUSES$3.has(availability)) return void 0;
    const offerUrl = readStringLike$4(value.click_url) ?? readStringLike$4(value.url);
    return {
      shopName,
      amount,
      currency: "NOK",
      price: formatNokPrice$5(amount),
      ...offerUrl !== void 0 ? { offerUrl } : {}
    };
  }
  async function fetchJson$6(url, init) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) return void 0;
      return response.json();
    } catch {
      return void 0;
    }
  }
  async function fetchText$4(url, init) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) return void 0;
      return response.text();
    } catch {
      return void 0;
    }
  }
  function formatNokPrice$5(amount) {
    const formatted = new Intl.NumberFormat("nb-NO", {
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2
    }).format(amount);
    return `${formatted} kr`;
  }
  function decodeHtmlAttribute$1(value) {
    return value.replace(/&quot;/g, '"').replace(/&#039;|&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  }
  function readStringLike$4(value) {
    if (typeof value !== "string" && typeof value !== "number") return void 0;
    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : void 0;
  }
  function readNumberLike$5(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return void 0;
    const parsed = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : void 0;
  }
  function tokenizeGodprisBrandText(value) {
    return uniqueStrings$7(value.split(/[^A-Za-z0-9\u00C6\u00D8\u00C5\u00E6\u00F8\u00E5]+/).map(normalizeGodprisBrandToken).filter((token) => token !== void 0 && token.length >= 2));
  }
  function normalizeGodprisBrandToken(value) {
    const normalized = value.replace(/[\u00C6\u00E6]/g, "ae").replace(/[\u00D8\u00F8]/g, "o").replace(/[\u00C5\u00E5]/g, "a").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
    return normalized.length > 0 ? normalized : void 0;
  }
  function uniqueStrings$7(values) {
    return [...new Set(values.map((value) => value?.trim()).filter((value) => value !== void 0 && value.length > 0))];
  }
  function isLikelyGtin$5(value) {
    const normalized = value.trim();
    return /^(?:\d{8}|\d{12,14})$/.test(normalized);
  }
  function isPlainRecord$5(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  const AUGMENTED_STEAM_PRICES_URL = "https://api.augmentedsteam.com/prices/v2";
  const ISTHEREANYDEAL_ORIGIN = "https://isthereanydeal.com";
  const ISTHEREANYDEAL_GEO_URL = `${ISTHEREANYDEAL_ORIGIN}/api/geo/`;
  const ISTHEREANYDEAL_GAME_INFO_URL = `${ISTHEREANYDEAL_ORIGIN}/api/game/info/`;
  const MAX_ITAD_ALTERNATIVES = 8;
  const MAX_STEAM_PURCHASE_TARGETS = 8;
  const STEAM_SHOP_ID = 61;
  const FALLBACK_ITAD_SHOP_IDS = [
    19,
    2,
    4,
    13,
    15,
    52,
    16,
    67,
    6,
    17,
    75,
    20,
    24,
    25,
    27,
    28,
    26,
    29,
    76,
    35,
    36,
    37,
    42,
    65,
    47,
    48,
    49,
    50,
    73,
    70,
    STEAM_SHOP_ID,
    62,
    64,
    72
  ];
  async function findIsthereanydealPriceMatch(message, requestJson = fetchJson$5, requestText = fetchText$3) {
    const appId = parseSteamAppId(message.url) ?? parseSteamAppId(message.productUrl);
    if (appId === void 0) return void 0;
    const appTarget = { type: "app", id: appId };
    let appInfo = readAugmentedSteamAppInfo(
      await fetchAugmentedSteamPrices([appTarget], requestJson),
      [appTarget]
    );
    if (appInfo?.infoUrl === void 0) {
      const purchaseTargets = await fetchSteamPurchaseTargets(message, requestText);
      appInfo = readAugmentedSteamAppInfo(
        await fetchAugmentedSteamPrices(purchaseTargets, requestJson),
        purchaseTargets
      );
    }
    if (appInfo?.infoUrl === void 0) return void 0;
    const pageContext = await fetchItadPageContext(appInfo.infoUrl, requestText);
    if (pageContext === void 0) return void 0;
    const gameInfo = await fetchItadGameInfoWithNok(pageContext, requestJson);
    const deals = readItadDeals(gameInfo, pageContext.shops).filter((deal) => deal.currency === "NOK").sort((first, second) => first.amount - second.amount);
    const bestDeal = deals[0];
    if (bestDeal === void 0) return void 0;
    const productName = pageContext.title ?? readSteamProductName(message) ?? "Steam-spill";
    const productUrl = pageContext.slug !== void 0 ? `${ISTHEREANYDEAL_ORIGIN}/game/${pageContext.slug}/info/` : pageContext.infoUrl;
    return {
      source: "isthereanydeal",
      sourceName: "IsThereAnyDeal",
      matchedCurrentMerchant: deals.some((deal) => deal.shopId === STEAM_SHOP_ID),
      shopName: bestDeal.shopName,
      amount: bestDeal.amount,
      sortAmount: bestDeal.amount,
      currency: bestDeal.currency,
      price: bestDeal.price,
      productName,
      productUrl,
      alternatives: deals.slice(0, MAX_ITAD_ALTERNATIVES).map(toPriceMatchAlternative)
    };
  }
  function isSteamAppProductUrl(rawUrl) {
    return parseSteamAppId(rawUrl) !== void 0;
  }
  function parseSteamAppId(rawUrl) {
    if (rawUrl === void 0) return void 0;
    try {
      const url = new URL(rawUrl);
      const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
      if (hostname !== "store.steampowered.com") return void 0;
      const appId = Number.parseInt(url.pathname.match(/^\/app\/(\d+)(?:\/|$)/i)?.[1] ?? "", 10);
      return Number.isInteger(appId) && appId > 0 ? appId : void 0;
    } catch {
      return void 0;
    }
  }
  async function fetchAugmentedSteamPrices(targets, requestJson) {
    if (targets.length === 0) return void 0;
    return requestJson(AUGMENTED_STEAM_PRICES_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        country: "NO",
        apps: targets.filter((target) => target.type === "app").map((target) => target.id),
        subs: targets.filter((target) => target.type === "sub").map((target) => target.id),
        bundles: targets.filter((target) => target.type === "bundle").map((target) => target.id),
        voucher: true,
        shops: FALLBACK_ITAD_SHOP_IDS
      })
    });
  }
  function readAugmentedSteamAppInfo(value, targets) {
    if (!isRecord$3(value) || !isRecord$3(value.prices)) return void 0;
    for (const target of targets) {
      const targetPrices = value.prices[`${target.type}/${target.id}`];
      if (!isRecord$3(targetPrices)) continue;
      const urls = isRecord$3(targetPrices.urls) ? targetPrices.urls : void 0;
      const infoUrl = typeof urls?.info === "string" && urls.info.length > 0 ? urls.info : void 0;
      if (infoUrl !== void 0) return { infoUrl };
    }
    return void 0;
  }
  async function fetchSteamPurchaseTargets(message, requestText) {
    const steamUrl = readSteamAppUrl(message.url) ?? readSteamAppUrl(message.productUrl);
    if (steamUrl === void 0) return [];
    const html = await requestText(steamUrl, {
      headers: { "Accept": "text/html" }
    });
    if (html === void 0) return [];
    return readSteamPurchaseTargets(html);
  }
  function readSteamAppUrl(rawUrl) {
    if (parseSteamAppId(rawUrl) === void 0 || rawUrl === void 0) return void 0;
    try {
      const url = new URL(rawUrl);
      url.searchParams.set("cc", "no");
      url.searchParams.set("l", "english");
      return url.toString();
    } catch {
      return void 0;
    }
  }
  function readSteamPurchaseTargets(html) {
    const targets = [];
    const seen = /* @__PURE__ */ new Set();
    const patterns = [
      { type: "sub", pattern: /\bname=["']subid["'][^>]*\bvalue=["'](\d+)["']/gi },
      { type: "bundle", pattern: /\bname=["']bundleid["'][^>]*\bvalue=["'](\d+)["']/gi },
      { type: "sub", pattern: /\/sub\/(\d+)(?:\/|["'?#])/gi },
      { type: "bundle", pattern: /\/bundle\/(\d+)(?:\/|["'?#])/gi }
    ];
    for (const { type, pattern } of patterns) {
      for (const match of html.matchAll(pattern)) {
        const id = Number.parseInt(match[1] ?? "", 10);
        const key = `${type}/${id}`;
        if (!Number.isInteger(id) || id <= 0 || seen.has(key)) continue;
        targets.push({ type, id });
        seen.add(key);
        if (targets.length >= MAX_STEAM_PURCHASE_TARGETS) return targets;
      }
    }
    return targets;
  }
  async function fetchItadPageContext(infoUrl, requestText) {
    const html = await requestText(infoUrl, {
      headers: { "Accept": "text/html" },
      credentials: "include"
    });
    if (html === void 0) return void 0;
    const globalState = parseScriptJson(html, /var g = (\{[\s\S]*?\});\s*var page = /);
    const pageState = parseScriptJson(html, /var page = (\[[\s\S]*?\]);\s*var /);
    if (!isRecord$3(globalState) || !Array.isArray(pageState)) return void 0;
    const user = isRecord$3(globalState.user) ? globalState.user : void 0;
    const token = typeof user?.token === "string" && user.token.length > 0 ? user.token : void 0;
    const visitorId = typeof user?.id === "string" && user.id.length > 0 ? user.id : void 0;
    const shops = readItadShops(globalState.shops);
    const pageProps = isRecord$3(pageState[1]) ? pageState[1] : void 0;
    const game = isRecord$3(pageProps?.game) ? pageProps.game : void 0;
    const gameId = typeof game?.id === "string" && game.id.length > 0 ? game.id : void 0;
    if (token === void 0 || gameId === void 0 || shops.size === 0) return void 0;
    const slug = typeof game?.slug === "string" && game.slug.length > 0 ? game.slug : void 0;
    const title = typeof game?.title === "string" && game.title.length > 0 ? game.title : void 0;
    return {
      gameId,
      infoUrl,
      ...slug !== void 0 ? { slug } : {},
      ...title !== void 0 ? { title } : {},
      token,
      ...visitorId !== void 0 ? { visitorId } : {},
      shops
    };
  }
  async function fetchItadGameInfoWithNok(pageContext, requestJson) {
    await setItadNokGeo(pageContext.token, requestJson);
    const gameInfo = await fetchItadGameInfo(pageContext.gameId, pageContext.token, requestJson);
    if (hasNokDeal(gameInfo)) return gameInfo;
    const cookie = buildItadCookieHeader(pageContext);
    if (cookie === void 0) return gameInfo;
    return fetchItadGameInfo(pageContext.gameId, pageContext.token, requestJson, cookie);
  }
  async function setItadNokGeo(token, requestJson) {
    await requestJson(ISTHEREANYDEAL_GEO_URL, {
      method: "POST",
      headers: itadJsonHeaders(token),
      body: JSON.stringify({ country: "NO", currency: "NOK" }),
      credentials: "include"
    });
  }
  async function fetchItadGameInfo(gameId, token, requestJson, cookie) {
    return requestJson(ISTHEREANYDEAL_GAME_INFO_URL, {
      method: "POST",
      headers: {
        ...itadJsonHeaders(token),
        ...cookie !== void 0 ? { "Cookie": cookie } : {}
      },
      body: JSON.stringify({ gid: gameId }),
      credentials: "include"
    });
  }
  function itadJsonHeaders(token) {
    return {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "ITAD-SessionToken": token
    };
  }
  function buildItadCookieHeader(pageContext) {
    if (pageContext.visitorId === void 0) return void 0;
    return [
      `sess2=${pageContext.token}`,
      `visitor=${pageContext.visitorId}`,
      "country=NO",
      "currency=NOK"
    ].join("; ");
  }
  function readItadShops(value) {
    const shops = /* @__PURE__ */ new Map();
    if (!isRecord$3(value)) return shops;
    for (const [rawId, rawShop] of Object.entries(value)) {
      const id = Number.parseInt(rawId, 10);
      const name = Array.isArray(rawShop) && typeof rawShop[0] === "string" ? rawShop[0] : void 0;
      if (Number.isInteger(id) && id > 0 && name !== void 0) {
        shops.set(id, name);
      }
    }
    return shops;
  }
  function readItadDeals(value, shops) {
    if (!isRecord$3(value) || !Array.isArray(value.deals)) return [];
    return value.deals.map((deal) => readItadDeal(deal, shops)).filter((deal) => deal !== void 0);
  }
  function hasNokDeal(value) {
    if (!isRecord$3(value) || !Array.isArray(value.deals)) return false;
    return value.deals.some((deal) => {
      if (!isRecord$3(deal)) return false;
      const price = readItadPrice(deal.priceNew);
      return price?.currency === "NOK";
    });
  }
  function readItadDeal(value, shops) {
    if (!isRecord$3(value)) return void 0;
    const shopId = readNumber$1(value.shop);
    const price = readItadPrice(value.priceNew);
    if (shopId === void 0 || price === void 0 || price.amount <= 0) return void 0;
    const shopName = shops.get(shopId);
    if (shopName === void 0) return void 0;
    const url = typeof value.url === "string" && value.url.length > 0 ? value.url : void 0;
    const voucher = typeof value.voucher === "string" && value.voucher.trim().length > 0 ? value.voucher.trim() : void 0;
    return {
      shopId,
      shopName,
      amount: price.amount,
      currency: price.currency,
      price: formatCurrency$1(price.amount, price.currency),
      ...url !== void 0 ? { url } : {},
      ...voucher !== void 0 ? { voucher } : {}
    };
  }
  function readItadPrice(value) {
    if (!Array.isArray(value) || value.length < 2) return void 0;
    const amountMinor = readNumber$1(value[0]);
    const currency = typeof value[1] === "string" ? value[1].toUpperCase() : void 0;
    if (amountMinor === void 0 || currency === void 0) return void 0;
    const scale = currencyScale(currency);
    return {
      amount: amountMinor / Math.pow(10, scale),
      currency
    };
  }
  function toPriceMatchAlternative(deal) {
    return {
      shopName: deal.shopName,
      amount: deal.amount,
      sortAmount: deal.amount,
      currency: deal.currency,
      price: deal.price,
      ...deal.voucher !== void 0 ? { shippingPrice: `kode ${deal.voucher}` } : {}
    };
  }
  function readSteamProductName(message) {
    const slugName = readSteamProductNameFromUrl(message.url) ?? readSteamProductNameFromUrl(message.productUrl);
    if (slugName !== void 0) return slugName;
    const cleaned = message.searchTerm.replace(/^spar\s+\d+\s*%\s+på\s+/i, "").replace(/\s+i\s+steam$/i, "").trim();
    return cleaned.length > 0 ? cleaned : void 0;
  }
  function readSteamProductNameFromUrl(rawUrl) {
    if (rawUrl === void 0) return void 0;
    try {
      const url = new URL(rawUrl);
      const match = url.pathname.match(/^\/app\/\d+\/([^/?#]+)/i);
      const slug = match?.[1];
      if (slug === void 0) return void 0;
      const name = decodeURIComponent(slug).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
      return name.length > 0 ? name : void 0;
    } catch {
      return void 0;
    }
  }
  function parseScriptJson(html, pattern) {
    const json = html.match(pattern)?.[1];
    if (json === void 0) return void 0;
    try {
      return JSON.parse(json);
    } catch {
      return void 0;
    }
  }
  function formatCurrency$1(amount, currency) {
    try {
      return new Intl.NumberFormat("nb-NO", {
        style: "currency",
        currency,
        maximumFractionDigits: currencyScale(currency)
      }).format(amount);
    } catch {
      return `${amount.toFixed(currencyScale(currency))} ${currency}`;
    }
  }
  function currencyScale(currency) {
    if ((/* @__PURE__ */ new Set(["JPY", "KRW", "CLP", "VND", "IDR"])).has(currency.toUpperCase())) return 0;
    if ((/* @__PURE__ */ new Set(["BHD", "KWD", "OMR"])).has(currency.toUpperCase())) return 3;
    return 2;
  }
  async function fetchJson$5(url, init) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) return void 0;
      const text = await response.text();
      return text.length > 0 ? JSON.parse(text) : void 0;
    } catch {
      return void 0;
    }
  }
  async function fetchText$3(url, init) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) return void 0;
      return response.text();
    } catch {
      return void 0;
    }
  }
  function readNumber$1(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return void 0;
    return value;
  }
  function isRecord$3(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  const ENHVER_GROCERIES_URL = "https://api.enhver.no/groceries";
  const ENHVER_PRODUCT_URL = "https://enhver.no/brands/kiwi/";
  const ENHVER_BRAND_NAMES = /* @__PURE__ */ new Map([
    [1, "Kiwi"],
    [2, "Coop Mega"],
    [3, "Meny"],
    [4, "Coop Obs"],
    [6, "Rema 1000"],
    [7, "Coop Prix"],
    [8, "Spar"],
    [9, "Coop Extra"],
    [10, "Bunnpris"],
    [12, "Holdbart"],
    [13, "Europris"]
  ]);
  async function findEnhverPriceMatch(message, requestJson = fetchJson$4, requestText = fetchText$2) {
    if (!isLikelyGroceryPriceMatchContext(message.url, message.productUrl)) return void 0;
    if (!hasGroceryIdentitySignal$1(message)) return void 0;
    const groceriesValue = await requestJson(ENHVER_GROCERIES_URL, {
      headers: { "Accept": "application/json" }
    });
    const groceries = readEnhverGroceries(groceriesValue);
    const grocery = findMatchingEnhverGrocery(message, groceries);
    if (grocery === void 0) return void 0;
    const productUrl = `${ENHVER_PRODUCT_URL}${encodeURIComponent(String(grocery.groceryId))}`;
    const html = await requestText(productUrl, {
      headers: { "Accept": "text/html,application/xhtml+xml" }
    });
    if (html === void 0) return void 0;
    const productName = readEnhverProductTitle(html, grocery) ?? grocery.name;
    const prices = readEnhverPrices(html, grocery.groceryId);
    if (prices.length === 0) return void 0;
    const sortedPrices = [...prices].sort((first, second) => first.amount - second.amount);
    const best = sortedPrices[0];
    if (best === void 0) return void 0;
    return {
      source: "enhver",
      sourceName: "Enhver",
      matchedExactProduct: true,
      shopName: best.shopName,
      amount: best.amount,
      currency: best.currency,
      price: best.price,
      productName,
      productUrl,
      alternatives: sortedPrices.slice(0, 10).map((price) => ({
        shopName: price.shopName,
        amount: price.amount,
        currency: price.currency,
        price: price.price
      }))
    };
  }
  function readEnhverGroceries(value) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => {
      if (!isPlainRecord$4(item)) return void 0;
      const groceryId = readNumberLike$4(item.groceryId);
      const name = readStringLike$3(item.name);
      if (groceryId === void 0 || name === void 0) return void 0;
      const ean = readStringLike$3(item.ean);
      const amount = readNumberLike$4(item.amount);
      const unit = readStringLike$3(item.unit);
      const desc = readStringLike$3(item.desc);
      const disabled = typeof item.disabled === "boolean" ? item.disabled : void 0;
      return {
        groceryId,
        name,
        ...ean !== void 0 ? { ean } : {},
        ...amount !== void 0 ? { amount } : {},
        ...unit !== void 0 ? { unit } : {},
        ...desc !== void 0 ? { desc } : {},
        ...disabled !== void 0 ? { disabled } : {}
      };
    }).filter((item) => item !== void 0 && item.disabled !== true);
  }
  function findMatchingEnhverGrocery(message, groceries) {
    const messageGtins = getLikelyGtins$1(message.codes);
    if (messageGtins.length > 0) {
      const exact = groceries.find((grocery) => {
        const groceryGtin = readLikelyGtin(grocery.ean);
        return groceryGtin !== void 0 && messageGtins.includes(groceryGtin);
      });
      if (exact !== void 0) return exact;
    }
    const messageQuantity = getMessagePackageQuantity$1(message);
    if (messageQuantity === void 0) return void 0;
    return groceries.find((grocery) => {
      const groceryQuantity = readEnhverPackageQuantity(grocery);
      if (!isSamePackageQuantity(messageQuantity, groceryQuantity)) return false;
      return isLikelySameGroceryTitle$1(message, grocery);
    });
  }
  function readEnhverPackageQuantity(grocery) {
    const directQuantity = grocery.amount !== void 0 && grocery.unit !== void 0 ? readPackageQuantityFromText(`${grocery.amount} ${grocery.unit}`) : void 0;
    return directQuantity ?? readPackageQuantityFromText(grocery.desc);
  }
  function isLikelySameGroceryTitle$1(message, grocery) {
    const title = [grocery.name, grocery.desc].filter((value) => value !== void 0).join(" ");
    if (!hasRequestedBrandSignal$1(message, title)) return false;
    return uniqueStrings$6([message.searchTerm, ...message.productTitleCandidates ?? []]).some((candidate) => isLikelySameProductTitle(candidate, title, 0.45));
  }
  function hasRequestedBrandSignal$1(message, title) {
    if (message.productBrand === void 0) return true;
    const brand = normalizeBrandText$1(message.productBrand);
    if (brand.length < 3) return true;
    return normalizeBrandText$1(title).includes(brand);
  }
  function readEnhverProductTitle(html, grocery) {
    const escapedName = escapeRegExp$1(String(grocery.groceryId));
    const pattern = new RegExp(`title:"((?:\\\\.|[^"\\\\])*)",groceryId:${escapedName},(?:(?!\\{title:)[\\s\\S])*?prices:\\[`);
    const rawTitle = html.match(pattern)?.[1];
    return rawTitle !== void 0 ? unescapeJsString(rawTitle).trim() || void 0 : void 0;
  }
  function readEnhverPrices(html, groceryId) {
    const escapedId = escapeRegExp$1(String(groceryId));
    const pattern = new RegExp(`title:"(?:\\\\.|[^"\\\\])*",groceryId:${escapedId},(?:(?!\\{title:)[\\s\\S])*?prices:\\[([^\\]]+)\\]`);
    const rawPrices = html.match(pattern)?.[1];
    if (rawPrices === void 0) return [];
    const prices = [];
    for (const match of rawPrices.matchAll(/\{brandId:(\d+),price:(\d+(?:\.\d+)?)\}/g)) {
      const brandId = Number.parseInt(match[1] ?? "", 10);
      const amount = Number.parseFloat(match[2] ?? "");
      const shopName = ENHVER_BRAND_NAMES.get(brandId);
      if (shopName === void 0 || !Number.isFinite(amount) || amount <= 0) continue;
      prices.push({
        shopName,
        amount,
        currency: "NOK",
        price: formatNokPrice$4(amount)
      });
    }
    return prices;
  }
  function hasGroceryIdentitySignal$1(message) {
    return getLikelyGtins$1(message.codes).length > 0 || getMessagePackageQuantity$1(message) !== void 0;
  }
  function getMessagePackageQuantity$1(message) {
    return message.packageAmount !== void 0 && message.packageUnit !== void 0 ? { amount: message.packageAmount, unit: message.packageUnit } : void 0;
  }
  async function fetchJson$4(url, init) {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Accept": "application/json",
        ...init?.headers ?? {}
      }
    });
    if (!response.ok) return void 0;
    return response.json();
  }
  async function fetchText$2(url, init) {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        ...init?.headers ?? {}
      }
    });
    if (!response.ok) return void 0;
    return response.text();
  }
  function formatNokPrice$4(amount) {
    return `${new Intl.NumberFormat("nb-NO", {
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2
    }).format(amount)} kr`;
  }
  function unescapeJsString(value) {
    try {
      return JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
    } catch {
      return value.replace(/\\u0026/g, "&").replace(/\\u003c/gi, "<").replace(/\\u003e/gi, ">").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
  }
  function readLikelyGtin(value) {
    const normalized = value?.replace(/\D/g, "");
    return normalized !== void 0 && isLikelyGtin$4(normalized) ? normalized : void 0;
  }
  function getLikelyGtins$1(codes) {
    return uniqueStrings$6((codes ?? []).map((code) => code.replace(/\D/g, "")).filter(isLikelyGtin$4));
  }
  function isLikelyGtin$4(value) {
    return /^\d{8,14}$/.test(value);
  }
  function readStringLike$3(value) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : void 0;
    }
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return void 0;
  }
  function readNumberLike$4(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return void 0;
    const parsed = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : void 0;
  }
  function escapeRegExp$1(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function normalizeBrandText$1(value) {
    return value.replace(/[\u00C6\u00E6]/g, "ae").replace(/[\u00D8\u00F8]/g, "o").replace(/[\u00C5\u00E5]/g, "a").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^A-Za-z0-9]+/g, "").toLowerCase();
  }
  function uniqueStrings$6(values) {
    return [...new Set(values.map((value) => value?.trim()).filter((value) => value !== void 0 && value.length > 0))];
  }
  function isPlainRecord$4(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  const KLARNA_PRODUCT_URL = "https://www.klarna.com/no/shopping";
  const KLARNA_SEARCH_URL = "https://www.klarna.com/no/api/instant-search-edge-rest/public/search/suggest/NO";
  const KLARNA_OFFERS_URL = "https://www.klarna.com/no/api/product-detail-edge-rest/public/product-detail/v0/offers/NO";
  const KLARNA_PRODUCT_PATH_PATTERN = /\/shopping\/pl\/(?:cl\d+\/)?(\d+)\//;
  const BAD_AVAILABILITY_STATUSES$2 = /* @__PURE__ */ new Set(["UNAVAILABLE", "UNAVAILABLE_ON_REQUEST", "TEMPORARILY_UNAVAILABLE"]);
  const BAD_STOCK_STATUSES$1 = /* @__PURE__ */ new Set(["OUT_OF_STOCK", "NOT_IN_STOCK"]);
  async function findKlarnaPriceMatch(message, requestJson = fetchJson$3) {
    if (!message.productPageClue && message.searchTerm.trim().length < 8) {
      return void 0;
    }
    const directProductId = readKlarnaProductIdFromUrl(message.url) ?? readKlarnaProductIdFromUrl(message.productUrl);
    if (directProductId !== void 0) {
      const directOffer = await fetchKlarnaOfferForProduct({
        id: directProductId,
        name: message.searchTerm,
        productUrl: `${KLARNA_PRODUCT_URL}/pl/${directProductId}/`
      }, requestJson);
      if (directOffer !== void 0) return directOffer;
    }
    const searchQueries = uniqueStrings$5([
      ...(message.codes ?? []).filter(isLikelyGtin$3),
      message.searchTerm
    ]);
    for (const query of searchQueries) {
      const product = await fetchKlarnaProduct(query, requestJson);
      if (product === void 0) continue;
      const offer = await fetchKlarnaOfferForProduct(product, requestJson);
      if (offer !== void 0) return offer;
    }
    return void 0;
  }
  async function fetchKlarnaProduct(query, requestJson) {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 4 || normalizedQuery.length > 100) return void 0;
    const params = new URLSearchParams({ q: normalizedQuery });
    const value = await requestJson(`${KLARNA_SEARCH_URL}?${params.toString()}`, {
      headers: { "Accept": "application/json" }
    });
    if (!isPlainRecord$3(value) || !Array.isArray(value.products)) return void 0;
    for (const product of value.products) {
      if (!isPlainRecord$3(product)) continue;
      const id = readStringLike$2(product.id);
      const name = readStringLike$2(product.name);
      const path = readStringLike$2(product.url);
      const lowestPrice = isPlainRecord$3(product.lowestPrice) ? product.lowestPrice : void 0;
      const currency = readStringLike$2(lowestPrice?.currency);
      const outOfStock = product.outOfStock === true;
      if (id !== void 0 && name !== void 0 && path !== void 0 && currency === "NOK" && !outOfStock) {
        return {
          id,
          name,
          productUrl: `${KLARNA_PRODUCT_URL}${path}`
        };
      }
    }
    return void 0;
  }
  async function fetchKlarnaOfferForProduct(product, requestJson) {
    const params = new URLSearchParams({
      af_ORIGIN: "NATIONAL",
      af_ITEM_CONDITION: "NEW,UNKNOWN",
      sortByPreset: "PRICE"
    });
    const value = await requestJson(`${KLARNA_OFFERS_URL}/${encodeURIComponent(product.id)}?${params.toString()}`, {
      headers: { "Accept": "application/json" }
    });
    if (!isPlainRecord$3(value) || !Array.isArray(value.offers)) return void 0;
    const merchants = isPlainRecord$3(value.merchants) ? value.merchants : {};
    const offers = dedupeKlarnaOffersByShop(value.offers.map((offer) => readKlarnaOffer(offer, merchants)).filter((offer) => offer !== void 0).sort(compareKlarnaOffersByPrice));
    const best = offers[0];
    if (best === void 0) return void 0;
    return {
      source: "klarna",
      sourceName: "Klarna",
      shopName: best.shopName,
      amount: best.amount,
      sortAmount: best.sortAmount,
      currency: best.currency,
      price: best.price,
      productName: product.name,
      productUrl: product.productUrl,
      ...best.offerUrl !== void 0 ? { offerUrl: best.offerUrl } : {},
      alternatives: offers.slice(0, 8).map((offer) => ({
        shopName: offer.shopName,
        amount: offer.amount,
        sortAmount: offer.sortAmount,
        currency: offer.currency,
        price: offer.price,
        shippingPrice: formatShippingPrice$2(offer.shippingAmount),
        ...offer.shippingAmount > 0 ? { totalPrice: formatNokPrice$3(offer.sortAmount) } : {}
      }))
    };
  }
  function dedupeKlarnaOffersByShop(offers) {
    const bestByShopName = /* @__PURE__ */ new Map();
    for (const offer of offers) {
      const key = normalizeShopName$1(offer.shopName);
      const existing = bestByShopName.get(key);
      if (existing === void 0 || offer.amount < existing.amount || offer.amount === existing.amount && offer.sortAmount < existing.sortAmount) {
        bestByShopName.set(key, offer);
      }
    }
    return [...bestByShopName.values()].sort(compareKlarnaOffersByPrice);
  }
  function compareKlarnaOffersByPrice(first, second) {
    const priceDifference = first.amount - second.amount;
    return priceDifference !== 0 ? priceDifference : first.sortAmount - second.sortAmount;
  }
  function normalizeShopName$1(value) {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
  }
  function readKlarnaOffer(value, merchants) {
    if (!isPlainRecord$3(value)) return void 0;
    const price = isPlainRecord$3(value.price) ? value.price : void 0;
    const campaignPrice = isPlainRecord$3(value.campaignPrice) ? value.campaignPrice : void 0;
    const campaignPriceValue = isPlainRecord$3(campaignPrice?.price) && isActiveKlarnaCampaignPrice(campaignPrice) ? campaignPrice.price : void 0;
    const effectivePrice = campaignPriceValue ?? price;
    const shippingCost = isPlainRecord$3(value.shippingCost) ? value.shippingCost : void 0;
    const amount = readNumberLike$3(effectivePrice?.amount);
    const shippingAmount = readNumberLike$3(shippingCost?.amount) ?? 0;
    const currency = readStringLike$2(effectivePrice?.currency);
    const merchantId = readStringLike$2(value.merchantId);
    const merchant = merchantId !== void 0 && isPlainRecord$3(merchants[merchantId]) ? merchants[merchantId] : void 0;
    const shopName = readStringLike$2(merchant?.name);
    const availability = readStringLike$2(value.availability)?.toUpperCase();
    const stockStatus = readStringLike$2(value.stockStatus)?.toUpperCase();
    if (amount === void 0 || amount <= 0 || currency !== "NOK" || shopName === void 0) return void 0;
    if (availability !== void 0 && BAD_AVAILABILITY_STATUSES$2.has(availability)) return void 0;
    if (stockStatus !== void 0 && BAD_STOCK_STATUSES$1.has(stockStatus)) return void 0;
    const offerUrl = toAbsoluteKlarnaUrl(readStringLike$2(value.url));
    return {
      shopName,
      amount,
      sortAmount: amount + shippingAmount,
      shippingAmount,
      currency,
      price: formatNokPrice$3(amount),
      ...offerUrl !== void 0 ? { offerUrl } : {}
    };
  }
  function isActiveKlarnaCampaignPrice(campaignPrice) {
    const effectiveDate = isPlainRecord$3(campaignPrice.salePriceEffectiveDate) ? campaignPrice.salePriceEffectiveDate : void 0;
    const startTime = readTimeValue(effectiveDate?.start);
    const endTime = readTimeValue(effectiveDate?.end);
    const now = Date.now();
    if (startTime !== void 0 && now < startTime) return false;
    if (endTime !== void 0 && now > endTime) return false;
    return true;
  }
  function readTimeValue(value) {
    if (typeof value !== "string") return void 0;
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : void 0;
  }
  async function fetchJson$3(url, init) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) return void 0;
      return response.json();
    } catch {
      return void 0;
    }
  }
  function readKlarnaProductIdFromUrl(rawUrl) {
    if (rawUrl === void 0) return void 0;
    try {
      const url = new URL(rawUrl);
      return url.hostname.endsWith("klarna.com") ? url.pathname.match(KLARNA_PRODUCT_PATH_PATTERN)?.[1] : void 0;
    } catch {
      return void 0;
    }
  }
  function toAbsoluteKlarnaUrl(value) {
    if (value === void 0) return void 0;
    try {
      return new URL(value, "https://www.klarna.com").toString();
    } catch {
      return void 0;
    }
  }
  function formatNokPrice$3(amount) {
    const formatted = new Intl.NumberFormat("nb-NO", {
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2
    }).format(amount);
    return `${formatted} kr`;
  }
  function formatShippingPrice$2(amount) {
    return amount <= 0 ? "fri frakt" : `frakt ${formatNokPrice$3(amount)}`;
  }
  function readStringLike$2(value) {
    if (typeof value !== "string" && typeof value !== "number") return void 0;
    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : void 0;
  }
  function readNumberLike$3(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return void 0;
    const parsed = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : void 0;
  }
  function isLikelyGtin$3(value) {
    const normalized = value.trim();
    return /^(?:\d{8}|\d{12,14})$/.test(normalized);
  }
  function uniqueStrings$5(values) {
    return [...new Set(values.map((value) => value?.trim()).filter((value) => value !== void 0 && value.length > 0))];
  }
  function isPlainRecord$3(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  const PRISJAKT_NATIVE_GRAPHQL_URL = "https://native-backend.cloud.pji.nu/v1/graphql";
  const PRISJAKT_NATIVE_AUTHORIZATION = "Bearer JaNdRgUkXp2s5u8x/A?D(G+KbPeShVmY";
  const PRISJAKT_PRODUCT_BY_OFFER_URL_QUERY = `
query SearchProductsByOfferURL($offerUrl: String!) {
  productsByOfferUrl(offerUrl: $offerUrl) {
    id
    name
    webUri
  }
}
`;
  const PRISJAKT_OFFER_LIST_QUERY = `
query OfferList($productId: Int!) {
  product(id: $productId) {
    id
    name
    webUri
    offers {
      externalUri
      condition
      availability {
        status
      }
      stock {
        status
      }
      shop {
        name
        currency
      }
      price {
        exclShipping
      }
      shipping {
        cheapest {
          shippingCost
        }
      }
    }
  }
}
`;
  async function findPrisjaktPriceMatch(message, requestJson = fetchJson$2) {
    if (!message.productPageClue && message.searchTerm.trim().length < 8) {
      return void 0;
    }
    const nativeOffer = await fetchNativePrisjaktPriceMatch(message, requestJson);
    if (nativeOffer !== void 0 && isNorwegianPriceMatchOffer(nativeOffer)) {
      return nativeOffer;
    }
    const codeSearchOffer = await fetchPrisjaktSearchByCodes(message.codes, requestJson);
    if (codeSearchOffer !== void 0 && isNorwegianPriceMatchOffer(codeSearchOffer)) {
      return codeSearchOffer;
    }
    return void 0;
  }
  async function fetchNativePrisjaktPriceMatch(message, requestJson) {
    try {
      const product = await fetchNativePrisjaktProductByOfferUrls([message.url, message.productUrl], requestJson);
      if (product === void 0) return void 0;
      const offer = await fetchBestNativePrisjaktOffer(product, requestJson);
      return offer !== void 0 ? { ...offer, matchedCurrentMerchant: true } : void 0;
    } catch {
      return void 0;
    }
  }
  async function fetchBestNativePrisjaktOffer(product, requestJson) {
    const offers = (await fetchNativePrisjaktOffers(product.id, requestJson)).filter((offer) => isNorwegianPriceMatchCurrency(offer.currency));
    if (offers.length === 0) return void 0;
    const sortedOffers = [...offers].sort(compareNativePrisjaktOffersByPrice);
    const bestOffer = sortedOffers[0];
    if (bestOffer === void 0) return void 0;
    return {
      source: "prisjakt",
      sourceName: "Prisjakt",
      shopName: bestOffer.shopName,
      amount: bestOffer.amount,
      sortAmount: bestOffer.sortAmount,
      currency: bestOffer.currency,
      price: formatPrisjaktPrice(bestOffer.amount, bestOffer.currency),
      productName: product.name,
      productUrl: product.productUrl,
      ...bestOffer.offerUrl !== void 0 ? { offerUrl: bestOffer.offerUrl } : {},
      alternatives: sortedOffers.slice(0, 8).map((offer) => ({
        shopName: offer.shopName,
        amount: offer.amount,
        sortAmount: offer.sortAmount,
        currency: offer.currency,
        price: formatPrisjaktPrice(offer.amount, offer.currency),
        shippingPrice: formatShippingPrice$1(offer.shippingAmount, offer.currency),
        ...offer.shippingAmount > 0 ? { totalPrice: formatPrisjaktPrice(offer.sortAmount, offer.currency) } : {}
      }))
    };
  }
  async function fetchNativePrisjaktProductByOfferUrls(offerUrls, requestJson) {
    const candidateUrls = uniqueStrings$4([
      ...offerUrls,
      ...offerUrls.map((url) => url !== void 0 ? toCanonicalProductPageUrl(url) : void 0)
    ]);
    for (const candidateUrl of candidateUrls) {
      const product = await fetchNativePrisjaktProductBySingleOfferUrl(candidateUrl, requestJson);
      if (product !== void 0) return product;
    }
    return void 0;
  }
  async function fetchNativePrisjaktProductBySingleOfferUrl(offerUrl, requestJson) {
    const value = await requestJson(PRISJAKT_NATIVE_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Authorization": PRISJAKT_NATIVE_AUTHORIZATION,
        "Content-Type": "application/json",
        "Market": "no"
      },
      body: JSON.stringify({
        operationName: "SearchProductsByOfferURL",
        query: PRISJAKT_PRODUCT_BY_OFFER_URL_QUERY,
        variables: { offerUrl }
      })
    });
    if (!isPlainRecord$2(value) || !isPlainRecord$2(value.data) || !Array.isArray(value.data.productsByOfferUrl)) {
      return void 0;
    }
    for (const product of value.data.productsByOfferUrl) {
      if (!isPlainRecord$2(product)) continue;
      const id = readNumberLike$2(product.id);
      const name = typeof product.name === "string" ? product.name : void 0;
      const productUrl = typeof product.webUri === "string" ? product.webUri : void 0;
      if (id !== void 0 && name !== void 0 && productUrl !== void 0) {
        return { id, name, productUrl };
      }
    }
    return void 0;
  }
  async function fetchNativePrisjaktOffers(productId, requestJson) {
    const value = await requestJson(PRISJAKT_NATIVE_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Authorization": PRISJAKT_NATIVE_AUTHORIZATION,
        "Content-Type": "application/json",
        "Market": "no"
      },
      body: JSON.stringify({
        operationName: "OfferList",
        query: PRISJAKT_OFFER_LIST_QUERY,
        variables: { productId }
      })
    });
    if (!isPlainRecord$2(value) || !isPlainRecord$2(value.data) || !isPlainRecord$2(value.data.product) || !Array.isArray(value.data.product.offers)) {
      return [];
    }
    return value.data.product.offers.map(readNativePrisjaktOffer).filter((offer) => offer !== void 0);
  }
  function readNativePrisjaktOffer(value) {
    if (!isPlainRecord$2(value)) return void 0;
    const shop = isPlainRecord$2(value.shop) ? value.shop : void 0;
    const price = isPlainRecord$2(value.price) ? value.price : void 0;
    const shipping = isPlainRecord$2(value.shipping) ? value.shipping : void 0;
    const availability = isPlainRecord$2(value.availability) ? value.availability : void 0;
    const stock = isPlainRecord$2(value.stock) ? value.stock : void 0;
    const cheapestShipping = isPlainRecord$2(shipping?.cheapest) ? shipping.cheapest : void 0;
    const shopName = typeof shop?.name === "string" ? shop.name : void 0;
    const currency = typeof shop?.currency === "string" ? shop.currency : void 0;
    const amount = typeof price?.exclShipping === "number" ? price.exclShipping : void 0;
    const shippingAmount = typeof cheapestShipping?.shippingCost === "number" ? cheapestShipping.shippingCost : 0;
    const condition = typeof value.condition === "string" ? value.condition : void 0;
    const availabilityStatus = typeof availability?.status === "string" ? availability.status : void 0;
    const stockStatus = typeof stock?.status === "string" ? stock.status : void 0;
    if (shopName === void 0 || currency === void 0 || amount === void 0) return void 0;
    if (condition !== void 0 && condition.toUpperCase() !== "NEW") return void 0;
    if (availabilityStatus !== void 0 && BAD_AVAILABILITY_STATUSES$1.has(availabilityStatus.toUpperCase())) return void 0;
    if (stockStatus !== void 0 && BAD_STOCK_STATUSES.has(stockStatus.toLowerCase())) return void 0;
    const offerUrl = typeof value.externalUri === "string" && value.externalUri.length > 0 ? value.externalUri : void 0;
    return {
      shopName,
      amount,
      sortAmount: amount + shippingAmount,
      shippingAmount,
      currency,
      ...offerUrl !== void 0 ? { offerUrl } : {}
    };
  }
  const BAD_AVAILABILITY_STATUSES$1 = /* @__PURE__ */ new Set(["NOT_AVAILABLE_FOR_ORDER"]);
  const BAD_STOCK_STATUSES = /* @__PURE__ */ new Set(["out_of_stock", "not_in_stock"]);
  function compareNativePrisjaktOffersByPrice(first, second) {
    const priceDifference = first.amount - second.amount;
    return priceDifference !== 0 ? priceDifference : first.sortAmount - second.sortAmount;
  }
  async function fetchPrisjaktSearch(searchTerm, requestJson) {
    const normalizedSearchTerm = searchTerm.trim();
    if (normalizedSearchTerm.length < 4) return void 0;
    const params = new URLSearchParams({
      term: normalizedSearchTerm,
      market: "NO",
      includePromotionDetails: "true"
    });
    const value = await requestJson(`https://browser-extension-backend.cloud.pji.nu/v1/search?${params.toString()}`, {
      headers: { "Content-Type": "application/json" }
    });
    const offer = readBestPrisjaktOffer(value);
    if (offer !== void 0) return offer;
    const product = readFirstPrisjaktSearchProduct(value);
    return product !== void 0 ? fetchBestNativePrisjaktOffer(product, requestJson) : void 0;
  }
  async function fetchPrisjaktSearchByCodes(codes, requestJson) {
    for (const code of uniqueStrings$4((codes ?? []).filter(isLikelyGtin$2))) {
      const offer = await fetchPrisjaktSearch(code, requestJson);
      if (offer !== void 0) return offer;
    }
    return void 0;
  }
  function readFirstPrisjaktSearchProduct(value) {
    if (!isPlainRecord$2(value)) return void 0;
    const details = Array.isArray(value.details) ? value.details : [];
    for (const detail of details) {
      if (!isPlainRecord$2(detail) || !isPlainRecord$2(detail.product)) continue;
      const id = readNumberLike$2(detail.product.id);
      const name = typeof detail.product.name === "string" ? detail.product.name : void 0;
      if (id !== void 0 && name !== void 0) {
        return {
          id,
          name,
          productUrl: `https://www.prisjakt.no/product.php?p=${encodeURIComponent(String(id))}`
        };
      }
    }
    return void 0;
  }
  function readBestPrisjaktOffer(value) {
    if (!isPlainRecord$2(value)) return void 0;
    const details = Array.isArray(value.details) ? value.details : [];
    const directProduct = isPlainRecord$2(value.product) ? value.product : void 0;
    const detail = details.find((entry) => {
      return isPlainRecord$2(entry) && Array.isArray(entry.offers) && entry.offers.length > 0;
    });
    const product = isPlainRecord$2(detail) && isPlainRecord$2(detail.product) ? detail.product : directProduct;
    const offers = isPlainRecord$2(detail) && Array.isArray(detail.offers) ? detail.offers : Array.isArray(value.offers) ? value.offers : [];
    if (!isPlainRecord$2(product) || offers.length === 0) return void 0;
    const productName = typeof product.name === "string" ? product.name : "Prisjakt-produkt";
    const productId = typeof product.id === "number" || typeof product.id === "string" ? String(product.id) : void 0;
    const parsedOffers = offers.map(readPrisjaktOffer).filter((offer) => offer !== void 0 && isNorwegianPriceMatchCurrency(offer.currency));
    parsedOffers.sort((first, second) => first.amount - second.amount);
    const best = parsedOffers[0];
    if (best === void 0) return void 0;
    return {
      ...best,
      source: "prisjakt",
      sourceName: "Prisjakt",
      productName,
      productUrl: productId !== void 0 ? `https://www.prisjakt.no/product.php?p=${encodeURIComponent(productId)}` : `https://www.prisjakt.no/search?query=${encodeURIComponent(productName)}`,
      alternatives: parsedOffers.slice(0, 8).map((offer) => ({
        shopName: offer.shopName,
        amount: offer.amount,
        currency: offer.currency,
        price: offer.price
      }))
    };
  }
  function readPrisjaktOffer(value) {
    if (!isPlainRecord$2(value)) return void 0;
    const shop = isPlainRecord$2(value.shop) ? value.shop : void 0;
    const price = isPlainRecord$2(value.price) && isPlainRecord$2(value.price.price) ? value.price.price : void 0;
    const scaledAmount = typeof price?.scaledAmount === "number" ? price.scaledAmount : void 0;
    const currency = typeof price?.currency === "string" ? price.currency : void 0;
    const shopName = typeof shop?.name === "string" ? shop.name : void 0;
    if (scaledAmount === void 0 || currency === void 0 || shopName === void 0) return void 0;
    const amount = scaledAmount / 100;
    const formatted = formatPrisjaktPrice(amount, currency);
    const url = typeof value.url === "string" && value.url.length > 0 ? value.url : typeof value.externalUrl === "string" && value.externalUrl.length > 0 ? value.externalUrl : void 0;
    return {
      shopName,
      amount,
      currency,
      price: formatted,
      ...url !== void 0 ? { offerUrl: url } : {}
    };
  }
  async function fetchJson$2(url, init) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) return void 0;
      return response.json();
    } catch {
      return void 0;
    }
  }
  function isNorwegianPriceMatchOffer(offer) {
    return isNorwegianPriceMatchCurrency(offer.currency);
  }
  function isNorwegianPriceMatchCurrency(currency) {
    return currency.trim().toUpperCase() === "NOK";
  }
  function formatPrisjaktPrice(amount, currency) {
    const formatted = new Intl.NumberFormat("nb-NO", {
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2
    }).format(amount);
    return `${formatted} ${currency === "NOK" ? "kr" : currency}`;
  }
  function formatShippingPrice$1(amount, currency) {
    return amount <= 0 ? "fri frakt" : `frakt ${formatPrisjaktPrice(amount, currency)}`;
  }
  function readNumberLike$2(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return void 0;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : void 0;
  }
  function toCanonicalProductPageUrl(rawUrl) {
    const parsedUrl = parseHttpUrl(rawUrl);
    if (parsedUrl === void 0) return void 0;
    return `${parsedUrl.origin}${parsedUrl.pathname}`;
  }
  function parseHttpUrl(url) {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:" ? parsedUrl : void 0;
    } catch {
      return void 0;
    }
  }
  function uniqueStrings$4(values) {
    return [...new Set(values.filter((value) => value !== void 0 && value.length > 0))];
  }
  function isLikelyGtin$2(value) {
    const normalized = value.trim();
    return /^(?:\d{8}|\d{12,14})$/.test(normalized);
  }
  function isPlainRecord$2(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  const PRISRADAR_GRAPHQL_URL = "https://gql.prisradar.no";
  const PRISRADAR_PRODUCT_URL = "https://prisradar.no/produkter/";
  const PRISRADAR_PRODUCT_PATH_PATTERN = /^\/produkter\/[^/?#]+\/?$/;
  const BAD_AVAILABILITY_STATUSES = /* @__PURE__ */ new Set([
    "discontinued",
    "not_available",
    "not_in_stock",
    "out_of_stock"
  ]);
  const SEARCH_SUGGESTIONS_QUERY = `
query SearchSuggestions($query: String!, $category: Int) {
  suggestions: SearchSuggestions(query: $query, category: $category) {
    products {
      id
      title
      price
      oldPrice
      slug
      image
    }
  }
}
`;
  async function findPrisradarPriceMatch(message, requestJson = fetchJson$1, requestText = fetchText$1, options = {}) {
    if (!message.productPageClue && message.searchTerm.trim().length < 8) {
      return void 0;
    }
    const directProductUrl = readPrisradarProductUrl(message.url) ?? readPrisradarProductUrl(message.productUrl);
    if (directProductUrl !== void 0) {
      const directOffer = await fetchPrisradarOfferForUrl(directProductUrl, requestText);
      if (directOffer !== void 0) return directOffer;
    }
    const codeOffer = await fetchPrisradarOfferForQueries(
      uniqueStrings$3([...(message.codes ?? []).filter(isLikelyGtin$1)]),
      requestJson,
      requestText
    );
    if (codeOffer !== void 0) return codeOffer;
    const slugOffer = await fetchPrisradarOfferForSlugCandidates(
      buildPrisradarSlugCandidates(message),
      requestText,
      message
    );
    if (slugOffer !== void 0) return slugOffer;
    const strictTextOffer = await fetchPrisradarOfferForQueries(
      buildPrisradarTextQueries(message.searchTerm),
      requestJson,
      requestText,
      message
    );
    if (strictTextOffer !== void 0) return strictTextOffer;
    if (options.allowLooseTextSearch !== true) return void 0;
    return fetchLoosePrisradarOfferForQueries(
      buildLoosePrisradarTextQueries(message.searchTerm, options.anchorSearchTerms ?? []),
      requestJson,
      requestText,
      uniqueStrings$3([message.searchTerm, ...options.anchorSearchTerms ?? []])
    );
  }
  async function fetchPrisradarOfferForQueries(queries, requestJson, requestText, message) {
    const candidates = /* @__PURE__ */ new Map();
    for (const query of queries) {
      const products = await fetchPrisradarProducts(query, requestJson);
      for (const product of products) {
        const existing = candidates.get(product.productUrl);
        if (existing === void 0 || product.matchScore > existing.matchScore) {
          candidates.set(product.productUrl, product);
        }
      }
    }
    const rankedProducts = [...candidates.values()].sort((first, second) => second.matchScore - first.matchScore).filter((product) => message === void 0 || product.matchScore >= (message.price !== void 0 ? 0.15 : 0.45)).filter((product) => message === void 0 || isCompatiblePrisradarProductVariant(product.title, [message.searchTerm])).slice(0, 8);
    const merchantKeys = message !== void 0 ? getCurrentMerchantKeys$1(message) : [];
    const matchedOffers = [];
    for (const product of rankedProducts) {
      const offer = await fetchPrisradarOfferForUrl(product.productUrl, requestText);
      if (offer === void 0) continue;
      if (message === void 0) return offer;
      const displayOffer = preferCurrentMerchantWhenTiedForBest(offer, merchantKeys);
      const merchantPriceDistance = getMerchantPriceDistance(displayOffer, merchantKeys, message.price);
      if (merchantPriceDistance !== void 0) {
        matchedOffers.push({ offer: { ...displayOffer, matchedCurrentMerchant: true }, product, merchantPriceDistance });
      }
    }
    matchedOffers.sort(comparePrisradarMatchedOffers);
    return matchedOffers[0]?.offer;
  }
  async function fetchLoosePrisradarOfferForQueries(queries, requestJson, requestText, anchorTerms) {
    const candidates = /* @__PURE__ */ new Map();
    for (const query of queries) {
      const products = await fetchPrisradarProducts(query, requestJson);
      for (const product of products) {
        const existing = candidates.get(product.productUrl);
        if (existing === void 0 || product.matchScore > existing.matchScore) {
          candidates.set(product.productUrl, product);
        }
      }
    }
    const rankedProducts = [...candidates.values()].sort((first, second) => second.matchScore - first.matchScore).filter((product) => product.matchScore >= 0.3).filter((product) => isCompatiblePrisradarProductVariant(product.title, anchorTerms)).slice(0, 8);
    for (const product of rankedProducts) {
      const offer = await fetchPrisradarOfferForUrl(product.productUrl, requestText);
      if (offer !== void 0) return offer;
    }
    return void 0;
  }
  async function fetchPrisradarOfferForSlugCandidates(slugs, requestText, message) {
    const merchantKeys = getCurrentMerchantKeys$1(message);
    const matchedOffers = [];
    for (const slug of slugs.slice(0, 6)) {
      const offer = await fetchPrisradarOfferForUrl(`${PRISRADAR_PRODUCT_URL}${encodeURIComponent(slug)}`, requestText);
      if (offer === void 0) continue;
      const product = {
        productUrl: offer.productUrl,
        title: offer.productName,
        matchScore: scorePrisradarProductAgainstSlugAndSearchTerms(slug, message.searchTerm, offer.productName)
      };
      if (product.matchScore < (message.price !== void 0 ? 0.15 : 0.45)) continue;
      if (!isCompatiblePrisradarProductVariant(product.title, [message.searchTerm])) continue;
      const displayOffer = preferCurrentMerchantWhenTiedForBest(offer, merchantKeys);
      const merchantPriceDistance = getMerchantPriceDistance(displayOffer, merchantKeys, message.price);
      if (merchantPriceDistance !== void 0) {
        matchedOffers.push({ offer: { ...displayOffer, matchedCurrentMerchant: true }, product, merchantPriceDistance });
      }
    }
    matchedOffers.sort(comparePrisradarMatchedOffers);
    return matchedOffers[0]?.offer;
  }
  async function fetchPrisradarProducts(query, requestJson) {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 4 || normalizedQuery.length > 120) return [];
    const value = await requestJson(PRISRADAR_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        operationName: "SearchSuggestions",
        query: SEARCH_SUGGESTIONS_QUERY,
        variables: { query: normalizedQuery }
      })
    });
    const suggestions = isPlainRecord$1(value) && isPlainRecord$1(value.data) && isPlainRecord$1(value.data.suggestions) ? value.data.suggestions : void 0;
    if (!Array.isArray(suggestions?.products)) return [];
    return suggestions.products.map((product) => readPrisradarProduct(product, normalizedQuery)).filter((product) => product !== void 0).sort((first, second) => second.matchScore - first.matchScore);
  }
  function readPrisradarProduct(value, query) {
    if (!isPlainRecord$1(value)) return void 0;
    const slug = readStringLike$1(value.slug);
    const title = readStringLike$1(value.title);
    if (slug === void 0 || title === void 0) return void 0;
    return {
      productUrl: `${PRISRADAR_PRODUCT_URL}${encodeURIComponent(slug)}`,
      title,
      matchScore: scorePrisradarProductMatch(query, title)
    };
  }
  function buildPrisradarTextQueries(searchTerm) {
    return uniqueStrings$3(
      buildSearchTermBaseCandidates(searchTerm).flatMap(buildPrisradarTextQueriesForSingleTerm)
    ).slice(0, 24);
  }
  function buildLoosePrisradarTextQueries(searchTerm, anchorTerms) {
    return uniqueStrings$3([searchTerm, ...anchorTerms].flatMap((term) => [
      ...buildPrisradarTextQueries(term),
      removeStandaloneNumberTokens(cleanPrisradarSearchQuery(normalizeProductPlatformAliases(term))),
      removeSearchNoiseTokens(removeStandaloneNumberTokens(cleanPrisradarSearchQuery(normalizeProductPlatformAliases(term))))
    ])).slice(0, 36);
  }
  function buildPrisradarTextQueriesForSingleTerm(searchTerm) {
    const normalizedSearchTerm = normalizeProductPlatformAliases(searchTerm).trim().replace(/\s+/g, " ");
    const compactUnitSearchTerm = compactMeasurementUnitSpacing(normalizedSearchTerm);
    const cleanedSearchTerm = removeDerivedAcronymTokens(cleanPrisradarSearchQuery(normalizedSearchTerm));
    const cleanedCompactUnitSearchTerm = removeDerivedAcronymTokens(cleanPrisradarSearchQuery(compactUnitSearchTerm));
    const withoutSize = normalizedSearchTerm.replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|cl|l|g|kg|stk|pk|pack)\b/gi, " ").replace(/\s+/g, " ").trim();
    const cleanedWithoutSize = removeDerivedAcronymTokens(cleanPrisradarSearchQuery(withoutSize));
    const cleanedWithoutStandaloneNumbers = removeStandaloneNumberTokens(cleanedSearchTerm);
    const cleanedWithoutSizeOrStandaloneNumbers = removeStandaloneNumberTokens(cleanedWithoutSize);
    const compactSearchTerm = removeSearchNoiseTokens(cleanedWithoutStandaloneNumbers);
    const compactWithoutSize = removeSearchNoiseTokens(cleanedWithoutSizeOrStandaloneNumbers);
    return uniqueStrings$3([
      normalizedSearchTerm,
      compactUnitSearchTerm !== normalizedSearchTerm ? compactUnitSearchTerm : void 0,
      cleanedSearchTerm,
      cleanedCompactUnitSearchTerm !== cleanedSearchTerm ? cleanedCompactUnitSearchTerm : void 0,
      withoutSize !== normalizedSearchTerm ? withoutSize : void 0,
      cleanedWithoutSize !== cleanedSearchTerm ? cleanedWithoutSize : void 0,
      cleanedWithoutStandaloneNumbers !== cleanedSearchTerm ? cleanedWithoutStandaloneNumbers : void 0,
      cleanedWithoutSizeOrStandaloneNumbers !== cleanedWithoutSize ? cleanedWithoutSizeOrStandaloneNumbers : void 0,
      compactSearchTerm !== cleanedWithoutStandaloneNumbers ? compactSearchTerm : void 0,
      compactWithoutSize !== cleanedWithoutSizeOrStandaloneNumbers ? compactWithoutSize : void 0
    ]);
  }
  function buildPrisradarSlugCandidates(message) {
    return uniqueStrings$3(
      [
        ...buildSearchTermBaseCandidates(message.searchTerm).flatMap(buildPrisradarSlugCandidatesForSingleTerm),
        ...buildPrisradarSlugCandidatesFromUrl(message.url),
        ...buildPrisradarSlugCandidatesFromUrl(message.productUrl)
      ]
    ).slice(0, 12);
  }
  function buildPrisradarSlugCandidatesForSingleTerm(searchTerm) {
    const normalizedSearchTerm = normalizeProductPlatformAliases(searchTerm).trim().replace(/\s+/g, " ");
    const compactUnitSearchTerm = compactMeasurementUnitSpacing(normalizedSearchTerm);
    const cleanedSearchTerm = removeDerivedAcronymTokens(cleanPrisradarSearchQuery(normalizedSearchTerm));
    const cleanedCompactUnitSearchTerm = removeDerivedAcronymTokens(cleanPrisradarSearchQuery(compactUnitSearchTerm));
    const withoutSize = normalizedSearchTerm.replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|cl|l|g|kg|stk|pk|pack)\b/gi, " ").replace(/\s+/g, " ").trim();
    const cleanedWithoutSize = removeDerivedAcronymTokens(cleanPrisradarSearchQuery(withoutSize));
    return uniqueStrings$3([
      slugifyPrisradarTitle(normalizedSearchTerm),
      compactUnitSearchTerm !== normalizedSearchTerm ? slugifyPrisradarTitle(compactUnitSearchTerm) : void 0,
      slugifyPrisradarTitle(cleanedSearchTerm),
      cleanedCompactUnitSearchTerm !== cleanedSearchTerm ? slugifyPrisradarTitle(cleanedCompactUnitSearchTerm) : void 0,
      withoutSize !== normalizedSearchTerm ? slugifyPrisradarTitle(withoutSize) : void 0,
      cleanedWithoutSize !== cleanedSearchTerm ? slugifyPrisradarTitle(cleanedWithoutSize) : void 0,
      slugifyPrisradarTitle(removeSearchNoiseTokens(cleanedSearchTerm))
    ]);
  }
  function buildPrisradarSlugCandidatesFromUrl(rawUrl) {
    if (rawUrl === void 0) return [];
    try {
      const url = new URL(rawUrl);
      const segments = url.pathname.split("/").map((segment) => decodeURIComponent(segment).trim()).filter((segment) => {
        const normalized = segment.toLowerCase();
        return normalized.length >= 4 && !/^\d+$/.test(normalized) && !GENERIC_PATH_SEGMENTS.has(normalized);
      });
      return uniqueStrings$3(segments.reverse().flatMap((segment) => [
        slugifyPrisradarTitle(normalizeProductPlatformAliases(segment.replace(/-/g, " "))),
        slugifyPrisradarTitle(segment)
      ]));
    } catch {
      return [];
    }
  }
  function buildSearchTermBaseCandidates(searchTerm) {
    const normalizedSearchTerm = normalizeProductPlatformAliases(searchTerm).trim().replace(/\s+/g, " ");
    const separatorPrefixCandidates = [
      normalizedSearchTerm.split(/\s+\|\s+/)[0],
      normalizedSearchTerm.split(/\s+•\s+/)[0],
      normalizedSearchTerm.split(/\s+[–—]\s+/)[0]
    ];
    const hyphenPrefixCandidates = separatorPrefixCandidates.flatMap((candidate) => {
      if (candidate === void 0) return [];
      const parts = candidate.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
      if (parts.length < 2) return [];
      return [
        parts[0],
        parts.slice(0, 2).join(" "),
        parts.slice(0, 3).join(" ")
      ];
    });
    const buyTitleMatch = normalizedSearchTerm.match(/^(?:kjøp|kjop|buy)\s+(.+?)\s+(?:hos|at)\s+.+$/i);
    return uniqueStrings$3([
      normalizedSearchTerm,
      ...separatorPrefixCandidates,
      ...hyphenPrefixCandidates,
      buyTitleMatch?.[1]
    ]).filter((candidate) => candidate.length >= 4);
  }
  function slugifyPrisradarTitle(value) {
    const slug = transliterateNorwegianCharacters$2(normalizeProductPlatformAliases(value)).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return slug.length >= 4 ? slug : void 0;
  }
  function cleanPrisradarSearchQuery(value) {
    return normalizeProductPlatformAliases(value).replace(/[()[\]{}]/g, " ").replace(/\s+[-–—:|/]\s+/g, " ").replace(/\s+/g, " ").trim();
  }
  function compactMeasurementUnitSpacing(value) {
    return value.replace(/\b(\d+(?:[.,]\d+)?)\s+(ml|cl|l|g|kg|mg|tb|gb|mb|cm|mm)\b/gi, "$1$2");
  }
  function removeDerivedAcronymTokens(value) {
    const keptTokens = [];
    const previousParts = [];
    for (const token of value.split(/\s+/)) {
      const normalizedToken = normalizeMatchToken(token);
      if (normalizedToken === void 0) continue;
      if (!isDerivedAcronymToken(normalizedToken, previousParts)) {
        keptTokens.push(token);
      }
      previousParts.push(...splitTokenParts(token));
    }
    return keptTokens.join(" ").replace(/\s+/g, " ").trim();
  }
  function removeStandaloneNumberTokens(value) {
    return value.split(/\s+/).filter((token) => !/^\d{1,2}$/.test(token)).join(" ").replace(/\s+/g, " ").trim();
  }
  function removeSearchNoiseTokens(value) {
    return value.split(/\s+/).filter((token) => {
      const normalizedToken = normalizeMatchToken(token);
      return normalizedToken !== void 0 && !SEARCH_NOISE_TOKENS.has(canonicalizeMatchToken(normalizedToken));
    }).join(" ").replace(/\s+/g, " ").trim();
  }
  function isDerivedAcronymToken(token, previousParts) {
    const letters = token.replace(/\d/g, "");
    const digits = token.replace(/\D/g, "");
    if (letters.length < 2 || letters.length > 5 || previousParts.length === 0) return false;
    const alphaParts = previousParts.filter((part) => /[a-z]/.test(part));
    const recentInitials = alphaParts.slice(-letters.length).map((part) => part[0]).join("");
    if (recentInitials !== letters) return false;
    if (digits.length === 0) return true;
    const previousDigits = previousParts.join("").replace(/\D/g, "");
    return [...digits].every((digit) => previousDigits.includes(digit));
  }
  function splitTokenParts(value) {
    return normalizeProductPlatformAliases(value).replace(/([a-zæøå])([A-ZÆØÅ])/g, "$1 $2").split(/[^A-Za-z0-9ÆØÅæøå]+/).map(normalizeMatchToken).filter((part) => part !== void 0);
  }
  function scorePrisradarProductMatch(query, title) {
    const queryTokens = tokenizeMatchText(query);
    const titleTokens = new Set(tokenizeMatchText(title));
    if (queryTokens.length === 0 || titleTokens.size === 0) return 0;
    let matchedWeight = 0;
    let totalWeight = 0;
    for (const token of queryTokens) {
      const weight = token.length >= 6 ? 2 : token.length >= 4 ? 1.5 : 1;
      totalWeight += weight;
      if (titleTokens.has(token)) {
        matchedWeight += weight;
        continue;
      }
      if ([...titleTokens].some((titleToken) => titleToken.length >= 4 && (titleToken.startsWith(token) || token.startsWith(titleToken)))) {
        matchedWeight += weight * 0.5;
      }
    }
    const score = totalWeight > 0 ? matchedWeight / totalWeight : 0;
    return hasUnrequestedConditionVariant(queryTokens, titleTokens) ? score * 0.2 : score;
  }
  function scorePrisradarProductAgainstSearchTerms(searchTerm, title) {
    return Math.max(...buildSearchTermBaseCandidates(searchTerm).map((candidate) => scorePrisradarProductMatch(candidate, title)));
  }
  function scorePrisradarProductAgainstSlugAndSearchTerms(slug, searchTerm, title) {
    return Math.max(
      scorePrisradarProductAgainstSearchTerms(searchTerm, title),
      scorePrisradarProductMatch(slug.replace(/-/g, " "), title)
    );
  }
  function hasUnrequestedConditionVariant(queryTokens, titleTokens) {
    return CONDITION_VARIANT_TOKENS.some((token) => titleTokens.has(token) && !queryTokens.includes(token));
  }
  function isCompatiblePrisradarProductVariant(title, anchorTerms) {
    const titleVariant = extractHardVariantGroups(title);
    return anchorTerms.every((anchorTerm) => !hasConflictingHardVariant(extractHardVariantGroups(anchorTerm), titleVariant));
  }
  function hasConflictingHardVariant(anchor, title) {
    return setsConflict(anchor.durations, title.durations) || setsConflict(anchor.sizes, title.sizes) || hasMissingRequiredSizeConflict(anchor.sizes, title.sizes) || hasMultipackConflict(anchor.multipacks, title.multipacks) || setsConflict(anchor.platforms, title.platforms) || setsConflict(anchor.colors, title.colors) || hasUnrequestedStorageAccessoryConflict(anchor, title);
  }
  function setsConflict(first, second) {
    return first.size > 0 && second.size > 0 && ![...first].some((value) => second.has(value));
  }
  function hasMultipackConflict(first, second) {
    if (first.size === 0 && second.size === 0) return false;
    if (first.size === 0 || second.size === 0) return true;
    return ![...first].some((value) => second.has(value));
  }
  function hasMissingRequiredSizeConflict(anchorSizes, titleSizes) {
    return hasConsumableSize(anchorSizes) && !hasConsumableSize(titleSizes);
  }
  function hasConsumableSize(sizes) {
    return [...sizes].some((size) => /\d(?:ml|cl|l|g|kg|mg)$/.test(size));
  }
  function hasUnrequestedStorageAccessoryConflict(anchor, title) {
    return anchor.platforms.size > 0 && anchor.storageAccessories.size === 0 && title.storageAccessories.size > 0;
  }
  function extractHardVariantGroups(value) {
    const normalizedValue = normalizeProductPlatformAliases(value).toLowerCase().replace(/,/g, ".");
    const tokens = new Set(tokenizeMatchText(normalizedValue));
    return {
      durations: new Set([...normalizedValue.matchAll(/\b(\d{1,3})\s*(?:h|hr|hrs|hour|hours|time|timer)\b/g)].map((match) => `${match[1]}h`)),
      sizes: new Set([...normalizedValue.matchAll(/\b(\d+(?:\.\d+)?)\s*(ml|cl|l|g|kg|mg|tb|gb|mb|cm|mm)\b/g)].map((match) => `${match[1]}${match[2]}`)),
      multipacks: extractMultipackVariants(normalizedValue, tokens),
      platforms: new Set([...normalizedValue.matchAll(/\bps[345]\b/g)].map((match) => match[0])),
      colors: new Set([...tokens].filter((token) => COLOR_VARIANT_TOKENS.has(token))),
      storageAccessories: new Set([...tokens].filter((token) => STORAGE_ACCESSORY_TOKENS.has(token)))
    };
  }
  function extractMultipackVariants(normalizedValue, tokens) {
    const multipacks = /* @__PURE__ */ new Set();
    for (const match of normalizedValue.matchAll(/\b([2-9]\d?)\s*x\s*\d+(?:\.\d+)?\s*[- ]?\s*(?:ml|cl|l|g|kg|mg|stk|pcs|pk|pack)?\b/g)) {
      multipacks.add(`${match[1]}x`);
    }
    for (const match of normalizedValue.matchAll(/\b([2-9]\d?)\s*(?:pack|pakning|pakninger|pakke|pk|stk|stykker)\b/g)) {
      multipacks.add(`${match[1]}x`);
    }
    if (tokens.has("duo")) multipacks.add("2x");
    if (tokens.has("trio")) multipacks.add("3x");
    return multipacks;
  }
  const CONDITION_VARIANT_TOKENS = ["fornyet", "refurbished", "renewed", "brukt", "used", "preowned"];
  const COLOR_VARIANT_TOKENS = /* @__PURE__ */ new Set(["hvit", "svart", "rod", "bla", "gronn", "gul", "rosa", "lilla", "solv", "gull", "gra", "brun", "oransje"]);
  const STORAGE_ACCESSORY_TOKENS = /* @__PURE__ */ new Set(["ssd", "nvme", "pcie", "heatsink", "harddisk", "lagring", "storage", "memory", "minne"]);
  const SEARCH_NOISE_TOKENS = /* @__PURE__ */ new Set(["tradlos", "kablet", "wired", "gaming", "bluetooth", "usb", "usbc", "wifi"]);
  const GENERIC_PATH_SEGMENTS = /* @__PURE__ */ new Set([
    "art",
    "category",
    "c",
    "gaming",
    "item",
    "kjop",
    "kjøp",
    "mus",
    "p",
    "produkt",
    "produkter",
    "product",
    "shop",
    "spill",
    "varer"
  ]);
  function tokenizeMatchText(value) {
    return uniqueStrings$3(splitTokenParts(value).map(canonicalizeMatchToken).filter((token) => token.length >= 2));
  }
  function normalizeMatchToken(value) {
    const normalized = transliterateNorwegianCharacters$2(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
    return normalized.length > 0 ? normalized : void 0;
  }
  function normalizeProductPlatformAliases(value) {
    return value.replace(/\bplaystation\s*([345])\b/gi, "ps$1").replace(/\bps\s+([345])\b/gi, "ps$1");
  }
  function canonicalizeMatchToken(token) {
    return CANONICAL_MATCH_TOKENS.get(token) ?? token;
  }
  const CANONICAL_MATCH_TOKENS = /* @__PURE__ */ new Map([
    ["wireless", "tradlos"],
    ["controller", "kontroller"],
    ["console", "konsoll"],
    ["white", "hvit"],
    ["black", "svart"],
    ["sort", "svart"],
    ["red", "rod"],
    ["blue", "bla"],
    ["green", "gronn"],
    ["yellow", "gul"],
    ["pink", "rosa"],
    ["purple", "lilla"],
    ["silver", "solv"],
    ["gold", "gull"],
    ["gray", "gra"],
    ["grey", "gra"],
    ["brown", "brun"],
    ["orange", "oransje"]
  ]);
  async function fetchPrisradarOfferForUrl(productUrl, requestText) {
    const html = await requestText(productUrl, {
      headers: { "Accept": "text/html,application/xhtml+xml" }
    });
    return html !== void 0 ? readPrisradarProductPage(html, productUrl) : void 0;
  }
  function readPrisradarProductPage(html, fallbackProductUrl) {
    const product = readPrisradarProductFromNextFlight(html);
    if (!isPlainRecord$1(product)) return void 0;
    const productName = readStringLike$1(product.title) ?? readStringLike$1(product.name) ?? "Prisradar-produkt";
    const productUrl = readStringLike$1(product.url) ?? fallbackProductUrl;
    const rawOffers = Array.isArray(product.offers) ? product.offers : [];
    const offers = dedupePrisradarOffersByShop(rawOffers.map(readPrisradarOffer).filter((offer) => offer !== void 0).sort(comparePrisradarOffersByPrice));
    const best = offers[0];
    if (best === void 0) return void 0;
    return {
      source: "prisradar",
      sourceName: "Prisradar",
      shopName: best.shopName,
      amount: best.amount,
      ...best.sortAmount !== void 0 ? { sortAmount: best.sortAmount } : {},
      currency: best.currency,
      price: best.price,
      productName,
      productUrl,
      alternatives: offers.slice(0, 8).map((offer) => ({
        shopName: offer.shopName,
        amount: offer.amount,
        ...offer.sortAmount !== void 0 ? { sortAmount: offer.sortAmount } : {},
        currency: offer.currency,
        price: offer.price,
        ...offer.shippingPrice !== void 0 ? { shippingPrice: offer.shippingPrice } : {},
        ...offer.totalPrice !== void 0 ? { totalPrice: offer.totalPrice } : {}
      }))
    };
  }
  function dedupePrisradarOffersByShop(offers) {
    const bestByShopName = /* @__PURE__ */ new Map();
    for (const offer of offers) {
      const key = normalizeShopName(offer.shopName);
      const existing = bestByShopName.get(key);
      if (existing === void 0 || offer.amount < existing.amount || offer.amount === existing.amount && (offer.sortAmount ?? offer.amount) < (existing.sortAmount ?? existing.amount)) {
        bestByShopName.set(key, offer);
      }
    }
    return [...bestByShopName.values()].sort(comparePrisradarOffersByPrice);
  }
  function comparePrisradarOffersByPrice(first, second) {
    const priceDifference = first.amount - second.amount;
    return priceDifference !== 0 ? priceDifference : (first.sortAmount ?? first.amount) - (second.sortAmount ?? second.amount);
  }
  function normalizeShopName(value) {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
  }
  function comparePrisradarMatchedOffers(first, second) {
    const distanceDifference = first.merchantPriceDistance - second.merchantPriceDistance;
    if (distanceDifference !== 0) return distanceDifference;
    const scoreDifference = second.product.matchScore - first.product.matchScore;
    if (scoreDifference !== 0) return scoreDifference;
    return first.offer.amount - second.offer.amount;
  }
  function preferCurrentMerchantWhenTiedForBest(offer, merchantKeys) {
    if (merchantKeys.length === 0 || offer.alternatives === void 0) return offer;
    const currentMerchantAlternative = offer.alternatives.find(
      (alternative) => isCurrentMerchantName$1(alternative.shopName, merchantKeys) && Math.abs(alternative.amount - offer.amount) < 0.01
    );
    if (currentMerchantAlternative === void 0) return offer;
    return {
      ...offer,
      shopName: currentMerchantAlternative.shopName,
      amount: currentMerchantAlternative.amount,
      ...currentMerchantAlternative.sortAmount !== void 0 ? { sortAmount: currentMerchantAlternative.sortAmount } : {},
      currency: currentMerchantAlternative.currency,
      price: currentMerchantAlternative.price
    };
  }
  function getMerchantPriceDistance(offer, merchantKeys, currentPrice) {
    if (merchantKeys.length === 0) return void 0;
    const merchantAmounts = [
      { shopName: offer.shopName, amount: offer.amount },
      ...offer.alternatives?.map((alternative) => ({ shopName: alternative.shopName, amount: alternative.amount })) ?? []
    ].filter((alternative) => isCurrentMerchantName$1(alternative.shopName, merchantKeys)).map((alternative) => alternative.amount);
    if (merchantAmounts.length === 0) return void 0;
    if (currentPrice === void 0 || currentPrice <= 0) return 0;
    return Math.min(...merchantAmounts.map((amount) => Math.abs(amount - currentPrice) / currentPrice));
  }
  function isCurrentMerchantName$1(shopName, merchantKeys) {
    const normalizedShopName = normalizeMerchantKey$1(shopName);
    if (normalizedShopName.length < 3) return false;
    return merchantKeys.some((merchantKey) => {
      return normalizedShopName.includes(merchantKey) || merchantKey.includes(normalizedShopName);
    });
  }
  function getCurrentMerchantKeys$1(message) {
    const hostKey = readMerchantKeyFromUrl$1(message.url);
    const organizationKey = message.organizationName !== void 0 ? normalizeMerchantKey$1(message.organizationName) : void 0;
    return uniqueStrings$3([hostKey, organizationKey]).filter((key) => key.length >= 3 && !GENERIC_MERCHANT_KEYS$1.has(key));
  }
  function readMerchantKeyFromUrl$1(rawUrl) {
    try {
      const hostname = new URL(rawUrl).hostname.replace(/^www\./, "").toLowerCase();
      const labels = hostname.split(".").filter((label2) => label2.length > 0);
      const label = labels.length >= 2 ? labels[labels.length - 2] : labels[0];
      return label !== void 0 ? normalizeMerchantKey$1(label) : void 0;
    } catch {
      return void 0;
    }
  }
  function normalizeMerchantKey$1(value) {
    return transliterateNorwegianCharacters$2(value).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
  }
  function transliterateNorwegianCharacters$2(value) {
    return value.replace(/[Ææ]/g, "ae").replace(/[Øø]/g, "o").replace(/[Åå]/g, "a");
  }
  const GENERIC_MERCHANT_KEYS$1 = /* @__PURE__ */ new Set(["butikk", "shop", "store", "nettbutikk", "online", "norge", "norway"]);
  function readPrisradarProductFromNextFlight(html) {
    const scripts = html.matchAll(/<script[^>]*>self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g);
    for (const match of scripts) {
      const encodedPayload = match[1];
      if (encodedPayload === void 0 || !encodedPayload.includes('\\"product\\":')) continue;
      const payload = decodeNextFlightString(encodedPayload);
      if (payload === void 0) continue;
      const productJson = extractJsonObjectAfter(payload, '"product":');
      if (productJson === void 0) continue;
      try {
        const product = JSON.parse(productJson.replace(/"\$undefined"/g, "null"));
        if (isPlainRecord$1(product)) return product;
      } catch {
        continue;
      }
    }
    return void 0;
  }
  function readPrisradarOffer(value) {
    if (!isPlainRecord$1(value)) return void 0;
    const shop = isPlainRecord$1(value.shop) ? value.shop : void 0;
    const amount = readNumberLike$1(value.price);
    const shopName = readStringLike$1(shop?.title) ?? readStringLike$1(value.shopTitle);
    const availability = readStringLike$1(value.availability)?.toLowerCase();
    const isUsed = value.isUsed === true;
    if (amount === void 0 || amount <= 0 || shopName === void 0 || isUsed) return void 0;
    if (availability !== void 0 && BAD_AVAILABILITY_STATUSES.has(availability)) return void 0;
    const shippingAmount = readShippingAmount(value);
    const sortAmount = shippingAmount !== void 0 ? amount + shippingAmount : void 0;
    return {
      shopName,
      amount,
      ...sortAmount !== void 0 ? { sortAmount } : {},
      currency: "NOK",
      price: formatNokPrice$2(amount),
      ...shippingAmount !== void 0 ? { shippingPrice: formatShippingPrice(shippingAmount) } : {},
      ...shippingAmount !== void 0 && shippingAmount > 0 ? { totalPrice: formatNokPrice$2(amount + shippingAmount) } : {}
    };
  }
  function readShippingAmount(value) {
    if (value.isFreeShipping === true) return 0;
    const amount = readNumberLike$1(value.shippingPrice);
    return amount !== void 0 && amount >= 0 ? amount : void 0;
  }
  async function fetchJson$1(url, init) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) return void 0;
      return response.json();
    } catch {
      return void 0;
    }
  }
  async function fetchText$1(url, init) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) return void 0;
      return response.text();
    } catch {
      return void 0;
    }
  }
  function readPrisradarProductUrl(rawUrl) {
    if (rawUrl === void 0) return void 0;
    try {
      const url = new URL(rawUrl);
      if (!url.hostname.replace(/^www\./, "").toLowerCase().endsWith("prisradar.no")) return void 0;
      return PRISRADAR_PRODUCT_PATH_PATTERN.test(url.pathname) ? `${url.origin}${url.pathname}` : void 0;
    } catch {
      return void 0;
    }
  }
  function decodeNextFlightString(value) {
    try {
      return JSON.parse(`"${value}"`);
    } catch {
      return void 0;
    }
  }
  function extractJsonObjectAfter(value, marker) {
    const markerIndex = value.indexOf(marker);
    if (markerIndex < 0) return void 0;
    const objectStart = value.indexOf("{", markerIndex + marker.length);
    if (objectStart < 0) return void 0;
    let depth = 0;
    let escaped = false;
    let inString = false;
    for (let index = objectStart; index < value.length; index += 1) {
      const character = value[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (character === "{") {
        depth += 1;
        continue;
      }
      if (character === "}") {
        depth -= 1;
        if (depth === 0) return value.slice(objectStart, index + 1);
      }
    }
    return void 0;
  }
  function formatNokPrice$2(amount) {
    const formatted = new Intl.NumberFormat("nb-NO", {
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2
    }).format(amount);
    return `${formatted} kr`;
  }
  function formatShippingPrice(amount) {
    return amount <= 0 ? "fri frakt" : `frakt ${formatNokPrice$2(amount)}`;
  }
  function readStringLike$1(value) {
    if (typeof value !== "string" && typeof value !== "number") return void 0;
    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : void 0;
  }
  function readNumberLike$1(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return void 0;
    const normalized = value.replace(/\s/g, "").replace(",", ".");
    if (normalized === "$undefined") return void 0;
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : void 0;
  }
  function isLikelyGtin$1(value) {
    const normalized = value.trim();
    return /^(?:\d{8}|\d{12,14})$/.test(normalized);
  }
  function uniqueStrings$3(values) {
    return [...new Set(values.map((value) => value?.trim()).filter((value) => value !== void 0 && value.length > 0))];
  }
  function isPlainRecord$1(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  const SESUM_ORIGIN = "https://www.sesum.no";
  const SESUM_PRODUCT_URL = `${SESUM_ORIGIN}/produkt/`;
  const MAX_SESUM_CANDIDATES = 10;
  async function findSesumPriceMatch(message, requestText = fetchText) {
    if (!message.productPageClue && message.searchTerm.trim().length < 8) return void 0;
    if (!isLikelyGroceryPriceMatchContext(message.url, message.productUrl)) return void 0;
    if (!hasGroceryIdentitySignal(message)) return void 0;
    const directProductUrl = readSesumProductUrl(message.url) ?? readSesumProductUrl(message.productUrl);
    const candidates = directProductUrl !== void 0 ? [directProductUrl] : buildSesumProductUrlCandidates(message);
    if (candidates.length === 0) return void 0;
    for (const productUrl of candidates) {
      const html = await requestText(productUrl, {
        headers: { "Accept": "text/html,application/xhtml+xml" }
      });
      if (html === void 0) continue;
      const offer = readSesumProductPage(html, productUrl, message);
      if (offer !== void 0) return offer;
    }
    return void 0;
  }
  function readSesumProductPage(html, productUrl, message) {
    if (isSesumNotFoundPage(html)) return void 0;
    const productName = readSesumProductName(html);
    const prices = readSesumPrices(html);
    if (productName === void 0 || prices.length === 0) return void 0;
    const pageGtin = readSesumGtin(html);
    const pageQuantity = readSesumPackageQuantity(html);
    const matchedByCode = pageGtin !== void 0 && getLikelyGtins(message.codes).includes(pageGtin);
    const matchedByQuantity = pageQuantity !== void 0 && isSamePackageQuantity(getMessagePackageQuantity(message), pageQuantity) && hasRequestedBrandSignal(message, productName) && isLikelySameGroceryTitle(message, productName);
    if (!matchedByCode && !matchedByQuantity) return void 0;
    const sortedPrices = [...prices].sort((first, second) => first.amount - second.amount);
    const best = sortedPrices[0];
    if (best === void 0) return void 0;
    return {
      source: "sesum",
      sourceName: "SeSum",
      matchedExactProduct: true,
      shopName: best.shopName,
      amount: best.amount,
      currency: best.currency,
      price: best.price,
      productName,
      productUrl,
      alternatives: sortedPrices.slice(0, 8).map((price) => ({
        shopName: price.shopName,
        amount: price.amount,
        currency: price.currency,
        price: price.price
      }))
    };
  }
  function isSesumNotFoundPage(html) {
    return /<title>\s*(?:Produkt ikke funnet|404\b|404: This page could not be found)/i.test(html) || /<h1[^>]*>\s*(?:Produkt ikke funnet|404\b)/i.test(html);
  }
  function hasGroceryIdentitySignal(message) {
    return getLikelyGtins(message.codes).length > 0 || getMessagePackageQuantity(message) !== void 0;
  }
  function buildSesumProductUrlCandidates(message) {
    const quantityLabels = buildPackageQuantityLabels(getMessagePackageQuantity(message));
    const brand = message.productBrand;
    const titles = uniqueStrings$2([
      message.searchTerm,
      ...message.productTitleCandidates ?? []
    ]).map(cleanGroceryTitleCandidate);
    const slugs = [];
    for (const title of titles) {
      if (title.length < 3) continue;
      slugs.push(slugifySesumTitle(title));
      const titleWithoutBrand = brand !== void 0 ? removeTokenPhrase(title, brand) : title;
      const titleWithoutQuantity = removePackageLabels(titleWithoutBrand, quantityLabels);
      for (const quantityLabel of quantityLabels) {
        slugs.push(slugifySesumTitle(`${titleWithoutQuantity} ${quantityLabel}`));
        if (brand !== void 0) {
          slugs.push(slugifySesumTitle(`${titleWithoutQuantity} ${quantityLabel} ${brand}`));
          slugs.push(slugifySesumTitle(`${brand} ${titleWithoutQuantity} ${quantityLabel}`));
        }
      }
    }
    return uniqueStrings$2(slugs).filter((slug) => slug.length >= 4).slice(0, MAX_SESUM_CANDIDATES).map((slug) => `${SESUM_PRODUCT_URL}${encodeURIComponent(slug)}`);
  }
  function cleanGroceryTitleCandidate(value) {
    return value.replace(/^(?:kj\u00f8p|kjop|bestill|buy)\s+/i, "").replace(/\s+(?:hos|at)\s+[^|-]+(?:[-|].*)?$/i, "").replace(/\s+[-|]\s+(?:Oda|MENY|KIWI|SPAR|REMA\s*1000|Coop(?:\s+Extra)?)\s*$/i, "").replace(/\s+[-|]\s+\d[\d\s]*(?:,\d{1,2})?\s*kr.*$/i, "").replace(/,\s*fra\s+\d[\d\s]*(?:,\d{1,2})?\s*kr.*$/i, "").replace(/\bfra\s+\d[\d\s]*(?:,\d{1,2})?\s*kr\b.*$/i, "").replace(/[.]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function removePackageLabels(value, quantityLabels) {
    let cleaned = value;
    for (const label of quantityLabels) {
      const escaped = escapeRegExp(label).replace(/\\ /g, "\\s*");
      cleaned = cleaned.replace(new RegExp(`\\b${escaped}\\b`, "gi"), " ");
    }
    return cleaned.replace(/\s+/g, " ").trim();
  }
  function removeTokenPhrase(value, phrase) {
    const escaped = escapeRegExp(phrase).replace(/\\ /g, "\\s+");
    return value.replace(new RegExp(`\\b${escaped}\\b`, "gi"), " ").replace(/\s+/g, " ").trim();
  }
  function slugifySesumTitle(value) {
    const normalized = transliterateNorwegianCharacters$1(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return normalized.length <= 80 ? normalized : trimSlug(normalized, 80);
  }
  function trimSlug(slug, maxLength) {
    const trimmed = slug.slice(0, maxLength);
    const lastDash = trimmed.lastIndexOf("-");
    return lastDash > 0 ? trimmed.slice(0, lastDash) : trimmed;
  }
  function readSesumProductUrl(rawUrl) {
    if (rawUrl === void 0) return void 0;
    try {
      const url = new URL(rawUrl);
      const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
      return hostname === "sesum.no" && /^\/produkt\/[^/]+\/?$/i.test(url.pathname) ? url.toString() : void 0;
    } catch {
      return void 0;
    }
  }
  function readSesumProductName(html) {
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
    const h1Text = h1 !== void 0 ? decodeHtml(stripHtml(h1)).trim() : void 0;
    if (h1Text !== void 0 && h1Text.length > 0) return h1Text;
    const ogTitle = readMetaContent(html, "og:title");
    const cleanOgTitle = ogTitle?.replace(/,\s*fra\s+.+$/i, "").trim();
    if (cleanOgTitle !== void 0 && cleanOgTitle.length > 0) return cleanOgTitle;
    const jsonLdName = readEscapedJsonLdString(html, "name");
    return jsonLdName !== void 0 && jsonLdName !== "next-size-adjust" ? jsonLdName : void 0;
  }
  function readSesumGtin(html) {
    const jsonLdGtin = readEscapedJsonLdString(html, "gtin13") ?? readEscapedJsonLdString(html, "gtin");
    if (jsonLdGtin !== void 0 && isLikelyGtin(jsonLdGtin)) return jsonLdGtin;
    const imageGtin = html.match(/bilder\.ngdata\.no\/(\d{8,14})\//)?.[1];
    return imageGtin !== void 0 && isLikelyGtin(imageGtin) ? imageGtin : void 0;
  }
  function readSesumPackageQuantity(html) {
    const flightQuantity = html.match(/\\"productWeight\\":(\d+(?:\.\d+)?),\\"productWeightUnit\\":\\"([^"\\]+)\\"/);
    if (flightQuantity?.[1] !== void 0 && flightQuantity[2] !== void 0) {
      const quantity = readPackageQuantityFromText(`${flightQuantity[1]} ${flightQuantity[2]}`);
      if (quantity !== void 0) return quantity;
    }
    return readPackageQuantityFromText([
      readMetaContent(html, "og:title"),
      readMetaContent(html, "description"),
      readSesumProductName(html)
    ].filter((value) => value !== void 0).join(" "));
  }
  function readSesumPrices(html) {
    const priceTablePrices = readSesumPriceTablePrices(html);
    if (priceTablePrices.length > 0) return priceTablePrices;
    return readSesumJsonLdOfferPrices(html);
  }
  function readSesumPriceTablePrices(html) {
    const rawPrices = readNextFlightJsonArray(html, "prices", "productWeight");
    if (!Array.isArray(rawPrices)) return [];
    return rawPrices.map((value) => {
      if (!isPlainRecord(value)) return void 0;
      const shopName = readStringLike(value.storeName) ?? readStringLike(value.chain);
      const amount = readNumberLike(value.price);
      if (shopName === void 0 || amount === void 0 || amount <= 0) return void 0;
      return {
        shopName,
        amount,
        currency: "NOK",
        price: formatNokPrice$1(amount)
      };
    }).filter((price) => price !== void 0);
  }
  function readSesumJsonLdOfferPrices(html) {
    const offersMatch = html.match(/\\"offers\\":\[(.*?)]},\\"dateModified\\"/);
    const rawOffers = offersMatch?.[1];
    if (rawOffers === void 0) return [];
    const offersJson = `[${unescapeNextFlightString(rawOffers)}]`;
    let offers;
    try {
      offers = JSON.parse(offersJson);
    } catch {
      return [];
    }
    if (!Array.isArray(offers)) return [];
    return offers.map((offer) => {
      if (!isPlainRecord(offer)) return void 0;
      const seller = isPlainRecord(offer.seller) ? offer.seller : void 0;
      const shopName = readStringLike(seller?.name);
      const amount = readNumberLike(offer.price);
      const currency = readStringLike(offer.priceCurrency) ?? "NOK";
      if (shopName === void 0 || amount === void 0 || amount <= 0 || currency !== "NOK") return void 0;
      return {
        shopName,
        amount,
        currency,
        price: formatNokPrice$1(amount)
      };
    }).filter((price) => price !== void 0);
  }
  function readNextFlightJsonArray(html, key, followingKey) {
    const escapedPattern = new RegExp(`\\\\"${escapeRegExp(key)}\\\\":(\\[[\\s\\S]*?\\]),\\\\"${escapeRegExp(followingKey)}\\\\":`);
    const escapedMatch = html.match(escapedPattern);
    if (escapedMatch?.[1] !== void 0) {
      try {
        const parsed = JSON.parse(unescapeNextFlightString(escapedMatch[1]));
        return Array.isArray(parsed) ? parsed : void 0;
      } catch {
        return void 0;
      }
    }
    const plainPattern = new RegExp(`"${escapeRegExp(key)}":(\\[[\\s\\S]*?\\]),"${escapeRegExp(followingKey)}":`);
    const plainMatch = html.match(plainPattern);
    if (plainMatch?.[1] === void 0) return void 0;
    try {
      const parsed = JSON.parse(plainMatch[1]);
      return Array.isArray(parsed) ? parsed : void 0;
    } catch {
      return void 0;
    }
  }
  function readEscapedJsonLdString(html, key) {
    const escaped = html.match(new RegExp(`\\\\\\\\"${escapeRegExp(key)}\\\\\\\\":\\\\\\\\"([^"\\\\]+)\\\\\\\\"`))?.[1];
    if (escaped !== void 0) return unescapeNextFlightString(escaped);
    const plain = html.match(new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*"([^"]+)"`))?.[1];
    return plain !== void 0 ? decodeHtml(plain) : void 0;
  }
  function readMetaContent(html, nameOrProperty) {
    const pattern = new RegExp(`<meta\\s+(?:name|property)=["']${escapeRegExp(nameOrProperty)}["'][^>]*content=["']([^"']*)["']`, "i");
    const alternatePattern = new RegExp(`<meta\\s+content=["']([^"']*)["'][^>]*(?:name|property)=["']${escapeRegExp(nameOrProperty)}["']`, "i");
    const raw = html.match(pattern)?.[1] ?? html.match(alternatePattern)?.[1];
    return raw !== void 0 ? decodeHtml(raw).trim() : void 0;
  }
  function isLikelySameGroceryTitle(message, title) {
    return uniqueStrings$2([message.searchTerm, ...message.productTitleCandidates ?? []]).some((candidate) => isLikelySameProductTitle(cleanGroceryTitleCandidate(candidate), title, 0.4));
  }
  function hasRequestedBrandSignal(message, title) {
    if (message.productBrand === void 0) return true;
    const brand = normalizeBrandText(message.productBrand);
    if (brand.length < 3) return true;
    return normalizeBrandText(title).includes(brand);
  }
  function getMessagePackageQuantity(message) {
    return message.packageAmount !== void 0 && message.packageUnit !== void 0 ? { amount: message.packageAmount, unit: message.packageUnit } : void 0;
  }
  async function fetchText(url, init) {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        ...init?.headers ?? {}
      }
    });
    if (!response.ok) return void 0;
    return response.text();
  }
  function formatNokPrice$1(amount) {
    return `${new Intl.NumberFormat("nb-NO", {
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2
    }).format(amount)} kr`;
  }
  function stripHtml(value) {
    return value.replace(/<[^>]*>/g, " ");
  }
  function decodeHtml(value) {
    return value.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  }
  function unescapeNextFlightString(value) {
    try {
      return JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
    } catch {
      return value.replace(/\\u0026/g, "&").replace(/\\u003c/gi, "<").replace(/\\u003e/gi, ">").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
  }
  function readStringLike(value) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : void 0;
    }
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return void 0;
  }
  function readNumberLike(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return void 0;
    const parsed = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : void 0;
  }
  function getLikelyGtins(codes) {
    return uniqueStrings$2((codes ?? []).map((code) => code.replace(/\D/g, "")).filter(isLikelyGtin));
  }
  function isLikelyGtin(value) {
    return /^\d{8,14}$/.test(value);
  }
  function transliterateNorwegianCharacters$1(value) {
    return value.replace(/[\u00C6\u00E6]/g, "ae").replace(/[\u00D8\u00F8]/g, "o").replace(/[\u00C5\u00E5]/g, "a");
  }
  function normalizeBrandText(value) {
    return transliterateNorwegianCharacters$1(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^A-Za-z0-9]+/g, "").toLowerCase();
  }
  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function uniqueStrings$2(values) {
    return [...new Set(values.map((value) => value?.trim()).filter((value) => value !== void 0 && value.length > 0))];
  }
  function isPlainRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  const TAXFREE_ORIGIN = "https://www.tax-free.no";
  const TAXFREE_ALGOLIA_URL = "https://namx6ho175-dsn.algolia.net/1/indexes/*/queries";
  const TAXFREE_ALGOLIA_APP_ID = "NAMX6HO175";
  const TAXFREE_ALGOLIA_API_KEY = "55252987cc07b733b24f13fc4754f42e";
  const TAXFREE_PRODUCT_INDEX = "prod_products";
  const TAXFREE_MAX_HITS = 8;
  const VINMONOPOLET_ORIGIN = "https://www.vinmonopolet.no";
  const TAXFREE_IDENTIFIER_LOOKUP_LIMIT = 4;
  const VINMONOPOLET_BARCODE_LOOKUP_LIMIT = 12;
  const VINMONOPOLET_SEARCH_LOOKUP_LIMIT = 20;
  const MIN_TAXFREE_TITLE_MATCH_SCORE = 0.7;
  const MIN_TAXFREE_SAME_VOLUME_TITLE_MATCH_SCORE = 0.55;
  const MIN_VINMONOPOLET_TITLE_MATCH_SCORE = 0.65;
  async function findTaxfreePriceMatch(message, requestJson = fetchJson) {
    if (!isVinmonopoletProductUrl(message.url)) {
      return void 0;
    }
    if (message.price === void 0 || message.volumeMl === void 0) {
      return void 0;
    }
    const queries = buildTaxfreeSearchQueries(message);
    if (queries.length === 0) {
      return void 0;
    }
    const response = await requestJson(TAXFREE_ALGOLIA_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Algolia-API-Key": TAXFREE_ALGOLIA_API_KEY,
        "X-Algolia-Application-Id": TAXFREE_ALGOLIA_APP_ID
      },
      body: JSON.stringify({
        requests: queries.map((query) => ({
          indexName: TAXFREE_PRODUCT_INDEX,
          query,
          params: new URLSearchParams({ hitsPerPage: String(TAXFREE_MAX_HITS) }).toString()
        }))
      })
    });
    const candidates = (await validateTaxfreeCandidatesAgainstVinmonopolet(
      readTaxfreeHits(response).map((hit) => readTaxfreeCandidate(hit, message)).filter((candidate) => candidate !== void 0),
      message,
      requestJson
    )).filter(isAllowedTaxfreeCandidate).sort(compareTaxfreeCandidates);
    const best = candidates[0];
    if (best === void 0) {
      return void 0;
    }
    if (message.currency === "NOK" && message.price !== void 0 && best.amount >= message.price) {
      return void 0;
    }
    return {
      source: "taxfree",
      sourceName: "Tax Free",
      shopName: "Tax Free Norway",
      amount: best.amount,
      sortAmount: best.amount,
      currency: "NOK",
      price: formatNokPrice(best.amount),
      productName: formatTaxfreeProductName(best),
      productUrl: best.productUrl
    };
  }
  async function findVinmonopoletPriceMatch(message, requestJson = fetchJson) {
    if (!isTaxfreeProductUrl(message.url)) {
      return void 0;
    }
    const currentTaxfreeCandidate = await findCurrentTaxfreeCandidate(message, requestJson);
    if (currentTaxfreeCandidate === void 0) {
      return void 0;
    }
    const vinmonopoletOffer = await findVinmonopoletOfferForTaxfreeCandidate(currentTaxfreeCandidate, requestJson);
    return vinmonopoletOffer !== void 0 ? buildVinmonopoletPriceMatchOffer(vinmonopoletOffer) : void 0;
  }
  function isVinmonopoletProductUrl(rawUrl) {
    if (rawUrl === void 0) return false;
    try {
      const url = new URL(rawUrl);
      const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
      return hostname === "vinmonopolet.no" && /\/p\/\d+(?:\/|$)/i.test(url.pathname);
    } catch {
      return false;
    }
  }
  function isTaxfreeProductUrl(rawUrl) {
    if (rawUrl === void 0) return false;
    try {
      const url = new URL(rawUrl);
      const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
      return hostname === "tax-free.no" && /^\/(?:no\/)?product\d+(?:\/|$)/i.test(url.pathname);
    } catch {
      return false;
    }
  }
  function readTaxfreeCandidate(value, message) {
    if (!isRecord$2(value)) return void 0;
    const productType = readString(value.type);
    if (productType !== void 0 && productType !== "ALCOHOL") return void 0;
    if (!hasTaxfreeStock(value)) return void 0;
    const amount = readNokPrice(value.price);
    const productName = readLocalizedString(value.name) ?? readString(value.name);
    const brandName = readLocalizedString(value.brandName) ?? readString(value.brandName);
    const productUrl = readTaxfreeProductUrl(value);
    const identifiers = readTaxfreeProductIdentifiers(value);
    const identifierMatch = hasSharedProductIdentifier(message.codes, identifiers);
    if (amount === void 0 || productName === void 0 || productUrl === void 0) {
      return void 0;
    }
    const volumeMl = readVolumeMl$1(readString(value.sizeName) ?? readString(value.size));
    const hasMatchingVolume = message.volumeMl !== void 0 && volumeMl !== void 0 && hasSameVolume(message.volumeMl, volumeMl);
    if (message.volumeMl !== void 0 && volumeMl !== void 0 && !hasMatchingVolume) {
      return void 0;
    }
    const vintageYear = readVintageYear(readLocalizedString(value.year) ?? readString(value.year));
    const messageVintageYear = readVintageYear(cleanTaxfreeSearchTerm(message.searchTerm)) ?? readVintageYear(readVinmonopoletProductSlugSearchTerm(message.url));
    if (!hasCompatibleVintage(messageVintageYear, vintageYear)) {
      return void 0;
    }
    const title = withLeadingBrand(productName, brandName);
    const matchTerms = buildTaxfreeMatchTerms(message);
    const score = Math.max(
      ...matchTerms.flatMap((term) => [
        scoreProductTitleAgainstSearchTerm(term, title),
        scoreProductTitleAgainstSearchTerm(term, productName)
      ])
    );
    const minTitleScore = hasMatchingVolume ? MIN_TAXFREE_SAME_VOLUME_TITLE_MATCH_SCORE : MIN_TAXFREE_TITLE_MATCH_SCORE;
    const titlePass = score >= minTitleScore;
    if (!identifierMatch && !titlePass && identifiers.length === 0) {
      return void 0;
    }
    const alcoholPercent = readNumber(value.alcoholByVolume);
    if (message.alcoholPercent !== void 0 && alcoholPercent !== void 0 && Math.abs(message.alcoholPercent - alcoholPercent) > 0.5) {
      return void 0;
    }
    const productCode = readTaxfreeProductCode(productUrl);
    return {
      amount,
      ...alcoholPercent !== void 0 ? { alcoholPercent } : {},
      ...brandName !== void 0 ? { brandName } : {},
      identifiers,
      identifierMatch,
      productName,
      ...productCode !== void 0 ? { productCode } : {},
      productUrl,
      score: identifierMatch ? Math.max(score, 1) : score,
      titlePass,
      ...vintageYear !== void 0 ? { vintageYear } : {},
      ...volumeMl !== void 0 ? { volumeMl } : {}
    };
  }
  async function findCurrentTaxfreeCandidate(message, requestJson) {
    const queries = buildCurrentTaxfreeProductQueries(message);
    if (queries.length === 0) {
      return void 0;
    }
    const response = await requestJson(TAXFREE_ALGOLIA_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Algolia-API-Key": TAXFREE_ALGOLIA_API_KEY,
        "X-Algolia-Application-Id": TAXFREE_ALGOLIA_APP_ID
      },
      body: JSON.stringify({
        requests: queries.map((query) => ({
          indexName: TAXFREE_PRODUCT_INDEX,
          query,
          params: new URLSearchParams({ hitsPerPage: String(TAXFREE_MAX_HITS) }).toString()
        }))
      })
    });
    const taxfreeProductCode = readTaxfreeProductCode(message.url) ?? readTaxfreeProductCode(message.productUrl);
    const candidates = readTaxfreeHits(response).map((hit) => readTaxfreeCandidate(hit, message)).filter((candidate) => candidate !== void 0).sort((first, second) => {
      const rankDifference = getCurrentTaxfreeCandidateRank(first, taxfreeProductCode, message) - getCurrentTaxfreeCandidateRank(second, taxfreeProductCode, message);
      if (rankDifference !== 0) return rankDifference;
      return second.score - first.score;
    });
    return candidates[0];
  }
  async function findVinmonopoletOfferForTaxfreeCandidate(candidate, requestJson) {
    for (const identifier of candidate.identifiers.slice(0, VINMONOPOLET_BARCODE_LOOKUP_LIMIT)) {
      const barcodeResponse = await fetchVinmonopoletProductForBarcode(identifier, requestJson);
      const barcodeOffer = readVinmonopoletProductOffer(barcodeResponse);
      if (barcodeOffer !== void 0 && hasCompatibleTaxfreeOffer(candidate, barcodeOffer)) {
        return barcodeOffer;
      }
      const productCode = readVinmonopoletProductCodeFromResponse(barcodeResponse);
      if (productCode === void 0) continue;
      const productResponse = await fetchVinmonopoletProductByCode(productCode, requestJson);
      const productOffer = readVinmonopoletProductOffer(productResponse);
      if (productOffer !== void 0 && hasCompatibleTaxfreeOffer(candidate, productOffer)) {
        return productOffer;
      }
    }
    return findVinmonopoletOfferBySearch(candidate, requestJson);
  }
  function hasCompatibleTaxfreeOffer(candidate, offer) {
    return hasCompatibleTaxfreeVolume(candidate, offer) && hasCompatibleVintage(candidate.vintageYear, offer.vintageYear);
  }
  function hasCompatibleTaxfreeVolume(candidate, offer) {
    return candidate.volumeMl === void 0 || offer.volumeMl === void 0 || hasSameVolume(candidate.volumeMl, offer.volumeMl);
  }
  function hasCompatibleVintage(firstYear, secondYear) {
    return firstYear === void 0 || firstYear === secondYear;
  }
  async function findVinmonopoletOfferBySearch(candidate, requestJson) {
    const queries = buildVinmonopoletSearchQueries(candidate);
    if (queries.length === 0) return void 0;
    const offers = [];
    for (const query of queries) {
      const response = await fetchVinmonopoletProductsBySearchTerm(query, requestJson);
      offers.push(
        ...readVinmonopoletSearchOffers(response).map((offer) => scoreVinmonopoletSearchOffer(candidate, offer)).filter((offer) => offer !== void 0)
      );
    }
    return offers.sort(compareVinmonopoletSearchOffers)[0];
  }
  function scoreVinmonopoletSearchOffer(candidate, offer) {
    if (candidate.volumeMl !== void 0 && offer.volumeMl !== void 0 && !hasSameVolume(candidate.volumeMl, offer.volumeMl)) {
      return void 0;
    }
    if (candidate.volumeMl !== void 0 && offer.volumeMl === void 0) {
      return void 0;
    }
    if (candidate.alcoholPercent !== void 0 && offer.alcoholPercent !== void 0 && Math.abs(candidate.alcoholPercent - offer.alcoholPercent) > 0.5) {
      return void 0;
    }
    if (!hasCompatibleVintage(candidate.vintageYear, offer.vintageYear)) {
      return void 0;
    }
    const title = withLeadingBrand(candidate.productName, candidate.brandName);
    const score = Math.max(
      scoreProductTitleAgainstSearchTerm(title, offer.productName),
      scoreProductTitleAgainstSearchTerm(candidate.productName, offer.productName),
      ...buildVinmonopoletSearchQueries(candidate).map((query) => scoreProductTitleAgainstSearchTerm(query, offer.productName))
    );
    if (score < MIN_VINMONOPOLET_TITLE_MATCH_SCORE) {
      return void 0;
    }
    return {
      ...offer,
      score
    };
  }
  function compareVinmonopoletSearchOffers(first, second) {
    return (second.score ?? 0) - (first.score ?? 0);
  }
  async function validateTaxfreeCandidatesAgainstVinmonopolet(candidates, message, requestJson) {
    const vinmonopoletProductCode = readVinmonopoletProductCode(message.url);
    if (vinmonopoletProductCode === void 0) {
      return candidates;
    }
    const lookupCache = /* @__PURE__ */ new Map();
    let lookupCount = 0;
    const validatedCandidates = [];
    for (const candidate of candidates) {
      let matchedCandidate;
      let sawBarcodeMismatch = false;
      for (const identifier of candidate.identifiers.slice(0, TAXFREE_IDENTIFIER_LOOKUP_LIMIT)) {
        if (lookupCount >= VINMONOPOLET_BARCODE_LOOKUP_LIMIT) break;
        let matchedProductCode = lookupCache.get(identifier);
        if (!lookupCache.has(identifier)) {
          lookupCount += 1;
          matchedProductCode = await fetchVinmonopoletProductCodeForBarcode(identifier, requestJson);
          lookupCache.set(identifier, matchedProductCode);
        }
        if (matchedProductCode === void 0) continue;
        if (matchedProductCode === vinmonopoletProductCode) {
          matchedCandidate = {
            ...candidate,
            score: Math.max(candidate.score, 1),
            vinmonopoletBarcodeMatch: true
          };
          sawBarcodeMismatch = false;
          break;
        }
        sawBarcodeMismatch = true;
      }
      if (matchedCandidate !== void 0) {
        validatedCandidates.push(matchedCandidate);
        continue;
      }
      validatedCandidates.push({
        ...candidate,
        ...sawBarcodeMismatch ? { vinmonopoletBarcodeMismatch: true } : {}
      });
    }
    return validatedCandidates;
  }
  function isAllowedTaxfreeCandidate(candidate) {
    if (candidate.vinmonopoletBarcodeMatch === true) return true;
    if (candidate.vinmonopoletBarcodeMismatch === true) return false;
    return candidate.identifierMatch || candidate.titlePass;
  }
  function compareTaxfreeCandidates(first, second) {
    const rankDifference = getTaxfreeCandidateRank(first) - getTaxfreeCandidateRank(second);
    if (rankDifference !== 0) return rankDifference;
    const amountDifference = first.amount - second.amount;
    if (amountDifference !== 0) return amountDifference;
    return second.score - first.score;
  }
  function getTaxfreeCandidateRank(candidate) {
    if (candidate.vinmonopoletBarcodeMatch === true) return 0;
    if (candidate.identifierMatch) return 1;
    return 2;
  }
  function buildVinmonopoletPriceMatchOffer(offer) {
    return {
      source: "vinmonopolet",
      sourceName: "Vinmonopolet",
      shopName: "Vinmonopolet",
      amount: offer.amount,
      sortAmount: offer.amount,
      currency: "NOK",
      price: formatNokPrice(offer.amount),
      productName: formatVinmonopoletProductName(offer),
      productUrl: offer.productUrl
    };
  }
  function formatVinmonopoletProductName(offer) {
    const size = offer.volumeMl !== void 0 ? formatVolume(offer.volumeMl) : void 0;
    return size !== void 0 ? `${offer.productName} (${size})` : offer.productName;
  }
  function getCurrentTaxfreeCandidateRank(candidate, taxfreeProductCode, message) {
    if (taxfreeProductCode !== void 0 && candidate.productCode !== void 0 && candidate.productCode === taxfreeProductCode) {
      return 0;
    }
    if (candidate.identifierMatch) return 1;
    if (message.volumeMl !== void 0 && candidate.volumeMl !== void 0 && hasSameVolume(message.volumeMl, candidate.volumeMl)) {
      return 2;
    }
    return 3;
  }
  async function fetchVinmonopoletProductCodeForBarcode(identifier, requestJson) {
    const value = await requestJson(
      `${VINMONOPOLET_ORIGIN}/vmpws/v2/vmp/products/barCodeSearch/${encodeURIComponent(identifier)}`,
      {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "X-Requested-With": "XMLHttpRequest"
        },
        credentials: "include"
      }
    );
    return readVinmonopoletProductCodeFromResponse(value);
  }
  async function fetchVinmonopoletProductForBarcode(identifier, requestJson) {
    return requestJson(
      `${VINMONOPOLET_ORIGIN}/vmpws/v2/vmp/products/barCodeSearch/${encodeURIComponent(identifier)}`,
      {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "X-Requested-With": "XMLHttpRequest"
        },
        credentials: "include"
      }
    );
  }
  async function fetchVinmonopoletProductByCode(productCode, requestJson) {
    return requestJson(
      `${VINMONOPOLET_ORIGIN}/vmpws/v3/vmp/products/${encodeURIComponent(productCode)}?fields=FULL`,
      {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "X-Requested-With": "XMLHttpRequest"
        },
        credentials: "include"
      }
    );
  }
  async function fetchVinmonopoletProductsBySearchTerm(searchTerm, requestJson) {
    const params = new URLSearchParams({
      query: searchTerm,
      currentPage: "0",
      pageSize: String(VINMONOPOLET_SEARCH_LOOKUP_LIMIT),
      fields: "FULL"
    });
    return requestJson(
      `${VINMONOPOLET_ORIGIN}/vmpws/v2/vmp/products/search?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "X-Requested-With": "XMLHttpRequest"
        },
        credentials: "include"
      }
    );
  }
  function readVinmonopoletProductCodeFromResponse(value) {
    if (!isRecord$2(value)) return void 0;
    const directCode = normalizeVinmonopoletProductCode(readString(value.code));
    if (directCode !== void 0) return directCode;
    const product = isRecord$2(value.product) ? value.product : void 0;
    return normalizeVinmonopoletProductCode(readString(product?.code));
  }
  function readVinmonopoletProductOffer(value) {
    const product = readVinmonopoletProductRecord(value);
    if (product === void 0) return void 0;
    const amount = readVinmonopoletProductPrice(product);
    const productName = readLocalizedString(product.name) ?? readString(product.name);
    const productUrl = readVinmonopoletProductUrlFromRecord(product);
    if (amount === void 0 || productName === void 0 || productUrl === void 0) {
      return void 0;
    }
    const volumeMl = readVinmonopoletProductVolumeMl(product);
    const alcoholPercent = readVinmonopoletAlcoholPercent$1(product);
    const vintageYear = readVinmonopoletVintageYear(product, productName);
    return {
      amount,
      ...alcoholPercent !== void 0 ? { alcoholPercent } : {},
      productName,
      productUrl,
      ...vintageYear !== void 0 ? { vintageYear } : {},
      ...volumeMl !== void 0 ? { volumeMl } : {}
    };
  }
  function readVinmonopoletProductRecord(value) {
    if (!isRecord$2(value)) return void 0;
    if (isRecord$2(value.product)) return value.product;
    if (isRecord$2(value.data)) return value.data;
    return value;
  }
  function readVinmonopoletSearchOffers(value) {
    if (!isRecord$2(value) || !Array.isArray(value.products)) return [];
    return value.products.map(readVinmonopoletProductOffer).filter((offer) => offer !== void 0);
  }
  function readVinmonopoletProductPrice(product) {
    return [
      product.price,
      product.currentPrice,
      product.salesPrice,
      product.basicPrice
    ].map(readVinmonopoletPriceValue).find((amount) => amount !== void 0);
  }
  function readVinmonopoletPriceValue(value) {
    if (isRecord$2(value)) {
      return readNumber(value.value) ?? readNumber(value.amount) ?? readNumber(value.price) ?? readNumber(value.formattedValue);
    }
    return readNumber(value);
  }
  function readVinmonopoletProductUrlFromRecord(product) {
    const directUrl = readString(product.url) ?? readString(product.productUrl);
    if (directUrl !== void 0) {
      return new URL(directUrl, VINMONOPOLET_ORIGIN).toString();
    }
    const code = readVinmonopoletProductCodeFromResponse(product);
    return code !== void 0 ? new URL(`/p/${encodeURIComponent(code)}`, VINMONOPOLET_ORIGIN).toString() : void 0;
  }
  function readVinmonopoletProductVolumeMl(product) {
    const stringVolume = [
      readFormattedValue(product.volume),
      product.volume,
      product.volumeFormatted,
      product.volumeString,
      product.productVolume,
      product.bottleVolume
    ].map(readString).find((value) => value !== void 0);
    const parsedStringVolume = readVolumeMl$1(stringVolume);
    if (parsedStringVolume !== void 0) return parsedStringVolume;
    const volumeRecordValue = readValueFromRecord(product.volume);
    if (volumeRecordValue !== void 0 && volumeRecordValue > 0) {
      return volumeRecordValue * 10;
    }
    const numericLiterVolume = [
      product.volumeInLiters,
      product.literVolume
    ].map(readNumber).find((value) => value !== void 0 && value > 0);
    if (numericLiterVolume !== void 0) return numericLiterVolume * 1e3;
    const numericVolume = [
      product.volumeValue,
      product.bottleVolume,
      product.volume
    ].map(readNumber).find((value) => value !== void 0 && value > 0);
    if (numericVolume === void 0) return void 0;
    return numericVolume <= 20 ? numericVolume * 1e3 : numericVolume;
  }
  function readVinmonopoletAlcoholPercent$1(product) {
    return [
      readValueFromRecord(product.alcohol),
      readNumber(product.alcohol),
      readNumber(product.alcoholPercent),
      readNumber(product.alcoholPercentage),
      readNumber(product.alcoholByVolume)
    ].find((value) => value !== void 0);
  }
  function readVinmonopoletVintageYear(product, productName) {
    return [
      product.vintage,
      product.vintageYear,
      product.year,
      product.harvestYear,
      productName
    ].map(readString).map(readVintageYear).find((year) => year !== void 0);
  }
  function readFormattedValue(value) {
    if (!isRecord$2(value)) return void 0;
    return readString(value.formattedValue) ?? readString(value.readableValue);
  }
  function readValueFromRecord(value) {
    if (!isRecord$2(value)) return void 0;
    return readNumber(value.value);
  }
  function readTaxfreeHits(value) {
    if (!isRecord$2(value) || !Array.isArray(value.results)) return [];
    return value.results.filter(isRecord$2).flatMap((result) => Array.isArray(result.hits) ? result.hits : []);
  }
  function readTaxfreeProductUrl(value) {
    const localizedUrls = isRecord$2(value.localizedUrls) ? value.localizedUrls : void 0;
    const url = readString(localizedUrls?.no) ?? readString(value.url);
    if (url !== void 0) {
      return new URL(withNorwegianPathPrefix(url), TAXFREE_ORIGIN).toString();
    }
    const code = readString(value.code);
    return code !== void 0 ? new URL(`/no/product${encodeURIComponent(code)}`, TAXFREE_ORIGIN).toString() : void 0;
  }
  function withNorwegianPathPrefix(path) {
    if (/^https?:\/\//i.test(path)) {
      const url = new URL(path);
      url.pathname = withNorwegianPathPrefix(url.pathname);
      return url.toString();
    }
    return /^\/no(?:\/|$)/i.test(path) ? path : `/no${path.startsWith("/") ? "" : "/"}${path}`;
  }
  function readNokPrice(value) {
    if (!isRecord$2(value)) return void 0;
    return readNumber(value.NOK);
  }
  function readLocalizedString(value) {
    if (!isRecord$2(value)) return void 0;
    return readString(value.no) ?? readString(value.en);
  }
  function readTaxfreeProductIdentifiers(value) {
    return uniqueValues([
      normalizeProductIdentifier(readString(value.ean)),
      ...Array.isArray(value.eanAliases) ? value.eanAliases.map((identifier) => normalizeProductIdentifier(readString(identifier))) : []
    ]);
  }
  function hasSharedProductIdentifier(sourceIdentifiers, candidateIdentifiers) {
    if (sourceIdentifiers === void 0 || candidateIdentifiers.length === 0) return false;
    const normalizedSourceIdentifiers = new Set(
      sourceIdentifiers.map((identifier) => normalizeProductIdentifier(identifier)).filter((identifier) => identifier !== void 0)
    );
    return candidateIdentifiers.some((identifier) => normalizedSourceIdentifiers.has(identifier));
  }
  function normalizeProductIdentifier(value) {
    if (value === void 0) return void 0;
    const digits = value.replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 14 ? digits : void 0;
  }
  function uniqueValues(values) {
    return [...new Set(values.filter((value) => value !== void 0))];
  }
  function hasTaxfreeStock(value) {
    const stockLists = [
      value.inOnlineStockIn,
      value.inStockIn,
      value.availableIn,
      value.availableInCodes,
      value.availableInAirportCodes
    ].filter(Array.isArray);
    return stockLists.length === 0 || stockLists.some((stockList) => stockList.length > 0);
  }
  function cleanTaxfreeSearchTerm(value) {
    return value.replace(/\s+\|\s+.*$/g, "").replace(/\s+-\s+Vinmonopolet$/i, "").trim().replace(/\s+/g, " ");
  }
  function buildTaxfreeSearchQueries(message) {
    const cleanSearchTerm = cleanTaxfreeSearchTerm(message.searchTerm);
    return uniqueValues([
      cleanSearchTerm,
      stripWineVintage(cleanSearchTerm),
      readVinmonopoletProductSlugSearchTerm(message.url),
      ...message.codes?.map(normalizeProductIdentifier) ?? []
    ]).filter((query) => query.length >= 4);
  }
  function buildCurrentTaxfreeProductQueries(message) {
    const cleanSearchTerm = cleanTaxfreeSearchTerm(message.searchTerm);
    return uniqueValues([
      readTaxfreeProductCode(message.url),
      readTaxfreeProductCode(message.productUrl),
      cleanSearchTerm,
      stripWineVintage(cleanSearchTerm),
      readTaxfreeProductSlugSearchTerm(message.url),
      ...message.codes?.map(normalizeProductIdentifier) ?? []
    ]).filter((query) => query.length >= 4);
  }
  function buildTaxfreeMatchTerms(message) {
    const cleanSearchTerm = cleanTaxfreeSearchTerm(message.searchTerm);
    return uniqueValues([
      cleanSearchTerm,
      stripWineVintage(cleanSearchTerm),
      readVinmonopoletProductSlugSearchTerm(message.url)
    ]).filter((query) => query.length >= 4);
  }
  function buildVinmonopoletSearchQueries(candidate) {
    const title = withLeadingBrand(candidate.productName, candidate.brandName);
    return uniqueValues([
      title,
      stripWineVintage(title),
      candidate.productName,
      stripWineVintage(candidate.productName),
      candidate.brandName
    ]).filter((query) => query.length >= 4);
  }
  function stripWineVintage(value) {
    if (value === void 0) return void 0;
    const withoutVintage = value.replace(/\b(?:19|20)\d{2}\b/g, " ").trim().replace(/\s+/g, " ");
    return withoutVintage.length > 0 && withoutVintage !== value ? withoutVintage : void 0;
  }
  function readVintageYear(value) {
    if (value === void 0) return void 0;
    const match = value.match(/\b((?:19|20)\d{2})\b/);
    if (match === null) return void 0;
    const year = Number.parseInt(match[1] ?? "", 10);
    return year >= 1900 && year <= 2099 ? year : void 0;
  }
  function readVinmonopoletProductSlugSearchTerm(rawUrl) {
    if (rawUrl === void 0) return void 0;
    try {
      const url = new URL(rawUrl);
      const segments = url.pathname.split("/").filter(Boolean);
      const productIndex = segments.findIndex((segment) => segment.toLowerCase() === "p");
      if (productIndex <= 0) return void 0;
      return decodeURIComponent(segments[productIndex - 1] ?? "").replace(/[-_]+/g, " ").trim().replace(/\s+/g, " ");
    } catch {
      return void 0;
    }
  }
  function readTaxfreeProductSlugSearchTerm(rawUrl) {
    if (rawUrl === void 0) return void 0;
    try {
      const url = new URL(rawUrl, TAXFREE_ORIGIN);
      const segments = url.pathname.split("/").filter(Boolean);
      const productSegment = segments.find((segment) => /^product\d+/i.test(segment));
      if (productSegment === void 0) return void 0;
      const slug = segments[segments.indexOf(productSegment) + 1];
      return slug !== void 0 ? decodeURIComponent(slug).replace(/[-_]+/g, " ").trim().replace(/\s+/g, " ") : void 0;
    } catch {
      return void 0;
    }
  }
  function readVinmonopoletProductCode(rawUrl) {
    if (rawUrl === void 0) return void 0;
    try {
      const url = new URL(rawUrl);
      const match = url.pathname.match(/\/p\/(\d+)(?:\/|$)/i);
      return normalizeVinmonopoletProductCode(match?.[1]);
    } catch {
      return void 0;
    }
  }
  function readTaxfreeProductCode(rawUrl) {
    if (rawUrl === void 0) return void 0;
    try {
      const url = new URL(rawUrl, TAXFREE_ORIGIN);
      const match = url.pathname.match(/\/(?:no\/)?product(\d+)(?:\/|$)/i);
      return normalizeTaxfreeProductCode(match?.[1]);
    } catch {
      return void 0;
    }
  }
  function normalizeVinmonopoletProductCode(value) {
    if (value === void 0) return void 0;
    const digits = value.replace(/\D/g, "");
    return digits.length > 0 ? digits : void 0;
  }
  function normalizeTaxfreeProductCode(value) {
    if (value === void 0) return void 0;
    const digits = value.replace(/\D/g, "");
    return digits.length > 0 ? digits : void 0;
  }
  function withLeadingBrand(productName, brandName) {
    if (brandName === void 0 || productName.toLowerCase().includes(brandName.toLowerCase())) {
      return productName;
    }
    return `${brandName} ${productName}`;
  }
  function formatTaxfreeProductName(candidate) {
    const title = appendVintageYear(
      withLeadingBrand(candidate.productName, candidate.brandName),
      candidate.vintageYear
    );
    const size = candidate.volumeMl !== void 0 ? formatVolume(candidate.volumeMl) : void 0;
    return size !== void 0 ? `${title} (${size})` : title;
  }
  function appendVintageYear(title, vintageYear) {
    if (vintageYear === void 0 || new RegExp(`\\b${vintageYear}\\b`).test(title)) {
      return title;
    }
    return `${title} ${vintageYear}`;
  }
  function formatVolume(volumeMl) {
    if (volumeMl >= 1e3 && volumeMl % 1e3 === 0) {
      return `${volumeMl / 1e3} l`;
    }
    if (volumeMl >= 1e3) {
      return `${formatNumber(volumeMl / 1e3)} l`;
    }
    if (volumeMl % 10 === 0) {
      return `${volumeMl / 10} cl`;
    }
    return `${formatNumber(volumeMl)} ml`;
  }
  function readVolumeMl$1(value) {
    if (value === void 0) return void 0;
    const match = value.match(/\b(\d+(?:[,.]\d+)?)\s*(ml|cl|l)\b/i);
    if (match === null) return void 0;
    const amount = parseLocalizedNumber$1(match[1] ?? "");
    const unit = match[2]?.toLowerCase();
    if (!Number.isFinite(amount) || amount <= 0 || unit === void 0) return void 0;
    if (unit === "ml") return amount;
    if (unit === "cl") return amount * 10;
    return amount * 1e3;
  }
  function hasSameVolume(firstMl, secondMl) {
    return Math.abs(firstMl - secondMl) <= Math.max(5, Math.min(firstMl, secondMl) * 0.03);
  }
  function readString(value) {
    if (typeof value !== "string" && typeof value !== "number") return void 0;
    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : void 0;
  }
  function readNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return void 0;
    const parsed = parseLocalizedNumber$1(value);
    return Number.isFinite(parsed) ? parsed : void 0;
  }
  function parseLocalizedNumber$1(value) {
    return Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
  }
  function formatNokPrice(amount) {
    return `${formatNumber(amount)} kr`;
  }
  function formatNumber(amount) {
    return new Intl.NumberFormat("nb-NO", {
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2
    }).format(amount);
  }
  async function fetchJson(url, init) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) return void 0;
      return response.json();
    } catch {
      return void 0;
    }
  }
  function isRecord$2(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  const MIN_ALLOWED_PRODUCT_TITLE_MATCH_SCORE = 0.45;
  async function findPriceMatches(message, requestJson, requestText) {
    if (isVinmonopoletProductUrl(message.url)) {
      const taxfreeOffer2 = await ignorePriceMatchFailure(findTaxfreePriceMatch(message, requestJson));
      return taxfreeOffer2 !== void 0 ? [taxfreeOffer2] : [];
    }
    if (isTaxfreeProductUrl(message.url)) {
      const vinmonopoletOffer = await ignorePriceMatchFailure(findVinmonopoletPriceMatch(message, requestJson));
      return vinmonopoletOffer !== void 0 ? [vinmonopoletOffer] : [];
    }
    if (isSteamAppProductUrl(message.url) || isSteamAppProductUrl(message.productUrl)) {
      const isthereanydealOffer2 = await ignorePriceMatchFailure(findIsthereanydealPriceMatch(message, requestJson, requestText));
      return isthereanydealOffer2 !== void 0 ? [isthereanydealOffer2] : [];
    }
    const [prisjaktOffer, godprisOffer, klarnaOffer, prisradarOffer, isthereanydealOffer, taxfreeOffer, sesumOffer, enhverOffer] = await Promise.all([
      ignorePriceMatchFailure(findPrisjaktPriceMatch(message, requestJson)),
      ignorePriceMatchFailure(findGodprisPriceMatch(message, requestJson, requestText)),
      ignorePriceMatchFailure(findKlarnaPriceMatch(message, requestJson)),
      ignorePriceMatchFailure(findPrisradarPriceMatch(message, requestJson, requestText)),
      ignorePriceMatchFailure(findIsthereanydealPriceMatch(message, requestJson, requestText)),
      ignorePriceMatchFailure(findTaxfreePriceMatch(message, requestJson)),
      ignorePriceMatchFailure(findSesumPriceMatch(message, requestText)),
      ignorePriceMatchFailure(findEnhverPriceMatch(message, requestJson, requestText))
    ]);
    const anchorOffers = [prisjaktOffer, klarnaOffer].filter((offer) => offer !== void 0);
    const anchorOffersMatchCurrentPage = isPriceMatchAllowedForCurrentPage(anchorOffers, message);
    const canUsePrisradarOffer = anchorOffersMatchCurrentPage || isKnownPriceMatchSourceProductUrl(message.url) || isKnownPriceMatchSourceProductUrl(message.productUrl);
    const relaxedPrisradarOffer = prisradarOffer === void 0 && anchorOffersMatchCurrentPage ? await findPrisradarPriceMatch(message, requestJson, requestText, {
      allowLooseTextSearch: true,
      anchorSearchTerms: anchorOffers.map((offer) => offer.productName)
    }) : void 0;
    const offers = [
      ...anchorOffers,
      godprisOffer,
      canUsePrisradarOffer ? prisradarOffer ?? relaxedPrisradarOffer : void 0,
      isthereanydealOffer,
      taxfreeOffer,
      sesumOffer,
      enhverOffer
    ].filter((offer) => offer !== void 0);
    const productAnchorTerms = uniqueStrings$1([
      message.searchTerm,
      ...anchorOffers.map((offer) => offer.productName)
    ]);
    const allowedOffers = offers.filter((offer) => isSupplementalPriceMatchOfferAligned(offer, productAnchorTerms)).filter((offer) => isPriceMatchOfferAllowedForCurrentPage(offer, message));
    if (!isPriceMatchAllowedForCurrentPage(allowedOffers, message)) {
      return [];
    }
    return allowedOffers.sort((first, second) => {
      const amountDifference = first.amount - second.amount;
      if (amountDifference !== 0) return amountDifference;
      return sourceRank(first) - sourceRank(second);
    });
  }
  function isSupplementalPriceMatchOfferAligned(offer, productAnchorTerms) {
    if (offer.source !== "godpris" && offer.source !== "prisradar") return true;
    return productAnchorTerms.some((anchorTerm) => isLikelySameProductTitle(anchorTerm, offer.productName));
  }
  async function ignorePriceMatchFailure(promise) {
    try {
      return await promise;
    } catch {
      return void 0;
    }
  }
  function isPriceMatchOfferAllowedForCurrentPage(offer, message) {
    if (isVinmonopoletProductUrl(message.url)) {
      return isContextualTaxfreeOffer(offer, message);
    }
    if (isTaxfreeProductUrl(message.url)) {
      return isContextualVinmonopoletOffer(offer, message);
    }
    if (isKnownPriceMatchSourceProductUrl(message.url) || isKnownPriceMatchSourceProductUrl(message.productUrl)) {
      return true;
    }
    if (offer.matchedExactProduct === true) {
      return true;
    }
    if (offer.matchedCurrentMerchant === true || hasCurrentMerchantOffer(offer, message)) {
      return true;
    }
    if (isContextualTaxfreeOffer(offer, message)) {
      return true;
    }
    if (isContextualVinmonopoletOffer(offer, message)) {
      return true;
    }
    return scoreProductTitleAgainstSearchTerm(message.searchTerm, offer.productName) >= MIN_ALLOWED_PRODUCT_TITLE_MATCH_SCORE;
  }
  function sourceRank(offer) {
    if (offer.source === "prisjakt") return 0;
    if (offer.source === "godpris") return 1;
    if (offer.source === "klarna") return 2;
    if (offer.source === "prisradar") return 3;
    if (offer.source === "sesum") return 4;
    if (offer.source === "enhver") return 5;
    if (offer.source === "isthereanydeal") return 6;
    if (offer.source === "taxfree") return 7;
    if (offer.source === "vinmonopolet") return 7;
    return 4;
  }
  function isPriceMatchAllowedForCurrentPage(offers, message) {
    if (isKnownPriceMatchSourceProductUrl(message.url) || isKnownPriceMatchSourceProductUrl(message.productUrl)) {
      return true;
    }
    return offers.some((offer) => {
      return offer.matchedCurrentMerchant === true || offer.matchedExactProduct === true || hasCurrentMerchantOffer(offer, message) || isContextualTaxfreeOffer(offer, message) || isContextualVinmonopoletOffer(offer, message);
    });
  }
  function isContextualTaxfreeOffer(offer, message) {
    return offer.source === "taxfree" && isVinmonopoletProductUrl(message.url);
  }
  function isContextualVinmonopoletOffer(offer, message) {
    return offer.source === "vinmonopolet" && isTaxfreeProductUrl(message.url);
  }
  function hasCurrentMerchantOffer(offer, message) {
    const merchantKeys = getCurrentMerchantKeys(message);
    if (merchantKeys.length === 0) return false;
    return [
      { shopName: offer.shopName, amount: offer.amount },
      ...offer.alternatives?.map((alternative) => ({ shopName: alternative.shopName, amount: alternative.amount })) ?? []
    ].some((alternative) => isCurrentMerchantName(alternative.shopName, merchantKeys));
  }
  function isKnownPriceMatchSourceProductUrl(rawUrl) {
    if (rawUrl === void 0) return false;
    try {
      const url = new URL(rawUrl);
      const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
      const pathname = url.pathname.toLowerCase();
      if (hostname.endsWith("prisjakt.no") || hostname.endsWith("prisjakt.nu") || hostname.endsWith("prisjakt.se") || hostname.endsWith("prisjagt.dk") || hostname.endsWith("pricespy.co.uk") || hostname.endsWith("pricespy.co.nz") || hostname.endsWith("hintaopas.fi") || hostname.endsWith("ledenicheur.fr")) {
        return pathname === "/product.php" && url.searchParams.has("p") || /^\/produkt(?:er)?\//.test(pathname);
      }
      if (hostname.endsWith("godpris.no")) return /^\/produkt\/[^/]+\/?$/.test(pathname);
      if (hostname.endsWith("tax-free.no")) return /^\/(?:no\/)?product\d+(?:\/|$)/.test(pathname);
      if (hostname.endsWith("vinmonopolet.no")) return /\/p\/\d+(?:\/|$)/.test(pathname);
      if (hostname.endsWith("klarna.com")) return /\/shopping\/pl\/(?:cl\d+\/)?\d+\//.test(pathname);
      if (hostname.endsWith("kelkoo.no")) return /^\/gtin\/\d+\/?$/.test(pathname);
      if (hostname.endsWith("prisradar.no")) return /^\/produkter\/[^/]+\/?$/.test(pathname);
      if (hostname.endsWith("sesum.no")) return /^\/produkt\/[^/]+\/?$/.test(pathname);
      if (hostname.endsWith("enhver.no")) return /^\/brands\/[^/]+\/\d+\/?$/.test(pathname);
      return false;
    } catch {
      return false;
    }
  }
  function isCurrentMerchantName(shopName, merchantKeys) {
    const normalizedShopName = normalizeMerchantKey(shopName);
    if (normalizedShopName.length < 3) return false;
    return merchantKeys.some((merchantKey) => normalizedShopName.includes(merchantKey) || merchantKey.includes(normalizedShopName));
  }
  function getCurrentMerchantKeys(message) {
    const hostKey = readMerchantKeyFromUrl(message.url);
    const organizationKey = message.organizationName !== void 0 ? normalizeMerchantKey(message.organizationName) : void 0;
    return uniqueStrings$1([hostKey, organizationKey]).filter((key) => key.length >= 3 && !GENERIC_MERCHANT_KEYS.has(key));
  }
  function readMerchantKeyFromUrl(rawUrl) {
    try {
      const hostname = new URL(rawUrl).hostname.replace(/^www\./, "").toLowerCase();
      const labels = hostname.split(".").filter((label2) => label2.length > 0);
      const label = labels.length >= 2 ? labels[labels.length - 2] : labels[0];
      return label !== void 0 ? normalizeMerchantKey(label) : void 0;
    } catch {
      return void 0;
    }
  }
  function normalizeMerchantKey(value) {
    return transliterateNorwegianCharacters(value).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
  }
  function transliterateNorwegianCharacters(value) {
    return value.replace(/[Ææ]/g, "ae").replace(/[Øø]/g, "o").replace(/[Åå]/g, "a");
  }
  function uniqueStrings$1(values) {
    return [...new Set(values.map((value) => value?.trim()).filter((value) => value !== void 0 && value.length > 0))];
  }
  const GENERIC_MERCHANT_KEYS = /* @__PURE__ */ new Set(["butikk", "shop", "store", "nettbutikk", "online", "norge", "norway"]);
  const PLAYSTATION_REGIONS = [
    { region: "NO", countryName: "Norge", flag: "🇳🇴", locale: "no-no" },
    { region: "US", countryName: "USA", flag: "🇺🇸", locale: "en-us" },
    { region: "GB", countryName: "UK", flag: "🇬🇧", locale: "en-gb" },
    { region: "IN", countryName: "India", flag: "🇮🇳", locale: "en-in" },
    { region: "TR", countryName: "Tyrkia", flag: "🇹🇷", locale: "tr-tr" },
    { region: "UA", countryName: "Ukraina", flag: "🇺🇦", locale: "uk-ua" },
    { region: "JP", countryName: "Japan", flag: "🇯🇵", locale: "ja-jp" },
    { region: "CA", countryName: "Canada", flag: "🇨🇦", locale: "en-ca" },
    { region: "AU", countryName: "Australia", flag: "🇦🇺", locale: "en-au" },
    { region: "NZ", countryName: "New Zealand", flag: "🇳🇿", locale: "en-nz" },
    { region: "DE", countryName: "Tyskland", flag: "🇩🇪", locale: "de-de" },
    { region: "FR", countryName: "Frankrike", flag: "🇫🇷", locale: "fr-fr" },
    { region: "ES", countryName: "Spania", flag: "🇪🇸", locale: "es-es" },
    { region: "IT", countryName: "Italia", flag: "🇮🇹", locale: "it-it" },
    { region: "PL", countryName: "Polen", flag: "🇵🇱", locale: "pl-pl" },
    { region: "SE", countryName: "Sverige", flag: "🇸🇪", locale: "sv-se" },
    { region: "DK", countryName: "Danmark", flag: "🇩🇰", locale: "da-dk" },
    { region: "FI", countryName: "Finland", flag: "🇫🇮", locale: "fi-fi" },
    { region: "CH", countryName: "Sveits", flag: "🇨🇭", locale: "de-ch" },
    { region: "BR", countryName: "Brasil", flag: "🇧🇷", locale: "pt-br" },
    { region: "MX", countryName: "Mexico", flag: "🇲🇽", locale: "es-mx" },
    { region: "KR", countryName: "Sør-Korea", flag: "🇰🇷", locale: "ko-kr" },
    { region: "HK", countryName: "Hongkong", flag: "🇭🇰", locale: "en-hk" },
    { region: "SG", countryName: "Singapore", flag: "🇸🇬", locale: "en-sg" },
    { region: "ZA", countryName: "Sør-Afrika", flag: "🇿🇦", locale: "en-za" }
  ];
  function isPlayStationProductUrl(url) {
    return parsePlayStationProductId(url) !== void 0 || parsePlayStationConceptId(url) !== void 0 || isPlayStationWebGamePageUrl(url);
  }
  function parsePlayStationProductId(url) {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
      if (hostname !== "store.playstation.com") {
        return void 0;
      }
      const productMatch = parsedUrl.pathname.match(/\/product\/([^/?#]+)/i);
      const productId = productMatch?.[1];
      return productId !== void 0 && productId.length > 0 ? decodeURIComponent(productId) : void 0;
    } catch {
      return void 0;
    }
  }
  function parsePlayStationConceptId(url) {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
      if (hostname !== "store.playstation.com") {
        return void 0;
      }
      const conceptMatch = parsedUrl.pathname.match(/\/concept\/(\d+)/i);
      return conceptMatch?.[1];
    } catch {
      return void 0;
    }
  }
  function isPlayStationWebGamePageUrl(url) {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
      if (hostname !== "playstation.com") {
        return false;
      }
      return /^\/[a-z]{2}(?:-[a-z]{2,4}){1,2}\/games\/[^/]+\/?$/i.test(parsedUrl.pathname);
    } catch {
      return false;
    }
  }
  async function findPlayStationRegionPrices(productUrl, textRequest = defaultTextRequest, jsonRequest = defaultJsonRequest) {
    const product = await resolvePlayStationProduct(productUrl, textRequest);
    if (product === void 0) {
      return void 0;
    }
    const ratesResponse = await jsonRequest("https://open.er-api.com/v6/latest/NOK");
    const rates = readNokBaseRates(ratesResponse);
    if (rates === void 0) {
      return void 0;
    }
    const entries = await mapWithConcurrency(PLAYSTATION_REGIONS, 5, async (region) => {
      const regionOffer = await resolvePlayStationRegionOffer(product, region, textRequest);
      if (regionOffer === void 0) {
        return void 0;
      }
      const { offer } = regionOffer;
      const nokRate = offer.currency === "NOK" ? 1 : rates.rates[offer.currency];
      if (typeof nokRate !== "number" || nokRate <= 0) {
        return void 0;
      }
      const nokAmount = offer.price / nokRate;
      const entry = {
        region: region.region,
        countryName: region.countryName,
        flag: region.flag,
        locale: region.locale,
        currency: offer.currency,
        price: offer.price,
        formattedPrice: formatCurrency(offer.price, offer.currency, region.locale),
        nokAmount,
        formattedNok: formatCurrency(nokAmount, "NOK", "nb-NO"),
        productUrl: regionOffer.productUrl
      };
      if (offer.name !== void 0) {
        entry.productName = offer.name;
      }
      return entry;
    });
    const validEntries = entries.filter((entry) => entry !== void 0);
    const productName = validEntries.find((entry) => entry.productName !== void 0)?.productName;
    const psPricesUrl = productName !== void 0 ? buildPsPricesNorwaySearchUrl(productName) : void 0;
    const prices = validEntries.sort((a, b) => a.nokAmount - b.nokAmount).map(({ productName: _productName, ...price }) => ({
      ...price,
      ...price.region === "NO" && psPricesUrl !== void 0 ? { priceHistoryUrl: psPricesUrl } : {}
    }));
    if (prices.length === 0) {
      return void 0;
    }
    const result = {
      productId: product.productId,
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      ...rates.updatedAt !== void 0 ? { ratesUpdatedAt: rates.updatedAt } : {},
      prices
    };
    if (productName !== void 0) {
      result.productName = productName;
    }
    return result;
  }
  function buildPsPricesNorwaySearchUrl(productName) {
    return `https://psprices.com/region-no/games/?q=${encodeURIComponent(productName)}`;
  }
  async function resolvePlayStationProduct(productUrl, textRequest) {
    const directProductId = parsePlayStationProductId(productUrl);
    const conceptIdFromUrl = parsePlayStationConceptId(productUrl);
    if (directProductId === void 0 && conceptIdFromUrl === void 0 && !isPlayStationWebGamePageUrl(productUrl)) {
      return void 0;
    }
    const html = await textRequest(productUrl);
    if (directProductId !== void 0 && html === void 0) {
      return { productId: directProductId };
    }
    if (html === void 0) {
      return void 0;
    }
    const productId = directProductId ?? extractPlayStationProductIdFromDataProductInfo(html) ?? extractPlayStationSku(html) ?? extractFirstProductIdFromHtml(html);
    if (productId === void 0) {
      return void 0;
    }
    const conceptId = conceptIdFromUrl ?? extractPlayStationConceptIdFromDataProductInfo(html) ?? extractPlayStationConceptIdFromHtml(html);
    return {
      productId,
      ...conceptId !== void 0 ? { conceptId } : {}
    };
  }
  async function resolvePlayStationRegionOffer(product, region, textRequest) {
    const localizedProductUrl = buildPlayStationProductUrl(region.locale, product.productId);
    const localizedHtml = await textRequest(localizedProductUrl);
    const localizedOffer = localizedHtml !== void 0 ? extractPlayStationOffer(localizedHtml) : void 0;
    if (localizedOffer !== void 0) {
      return {
        productId: product.productId,
        productUrl: localizedProductUrl,
        offer: localizedOffer
      };
    }
    if (product.conceptId === void 0) {
      return void 0;
    }
    const localizedConceptUrl = buildPlayStationConceptUrl(region.locale, product.conceptId);
    const conceptHtml = await textRequest(localizedConceptUrl);
    if (conceptHtml === void 0) {
      return void 0;
    }
    const regionalProductId = extractPlayStationSku(conceptHtml) ?? extractPlayStationProductIdFromDataProductInfo(conceptHtml) ?? extractFirstProductIdFromHtml(conceptHtml);
    if (regionalProductId === void 0) {
      return void 0;
    }
    const regionalProductUrl = buildPlayStationProductUrl(region.locale, regionalProductId);
    const conceptOffer = extractPlayStationOffer(conceptHtml);
    if (conceptOffer !== void 0) {
      return {
        productId: regionalProductId,
        productUrl: regionalProductUrl,
        offer: conceptOffer
      };
    }
    const regionalHtml = regionalProductId === product.productId ? localizedHtml : await textRequest(regionalProductUrl);
    const regionalOffer = regionalHtml !== void 0 ? extractPlayStationOffer(regionalHtml) : void 0;
    if (regionalOffer === void 0) {
      return void 0;
    }
    return {
      productId: regionalProductId,
      productUrl: regionalProductUrl,
      offer: regionalOffer
    };
  }
  function buildPlayStationProductUrl(locale, productId) {
    return `https://store.playstation.com/${locale}/product/${encodeURIComponent(productId)}`;
  }
  function buildPlayStationConceptUrl(locale, conceptId) {
    return `https://store.playstation.com/${locale}/concept/${encodeURIComponent(conceptId)}`;
  }
  function extractPlayStationProductIdFromDataProductInfo(html) {
    const productInfoMatches = html.matchAll(/\bdata-product-info=(["'])([\s\S]*?)\1/gi);
    for (const match of productInfoMatches) {
      const rawValue = match[2];
      if (rawValue === void 0 || rawValue.length === 0) {
        continue;
      }
      const parsed = parseJson(decodeHtmlAttribute(rawValue));
      const productId = readProductId(parsed);
      if (productId !== void 0) {
        return productId;
      }
    }
    return void 0;
  }
  function extractPlayStationConceptIdFromDataProductInfo(html) {
    const productInfoMatches = html.matchAll(/\bdata-product-info=(["'])([\s\S]*?)\1/gi);
    for (const match of productInfoMatches) {
      const rawValue = match[2];
      if (rawValue === void 0 || rawValue.length === 0) {
        continue;
      }
      const parsed = parseJson(decodeHtmlAttribute(rawValue));
      const conceptId = readConceptId(parsed);
      if (conceptId !== void 0) {
        return conceptId;
      }
    }
    return void 0;
  }
  function readProductId(value) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        const productId = readProductId(entry);
        if (productId !== void 0) return productId;
      }
      return void 0;
    }
    if (!isRecord$1(value)) {
      return void 0;
    }
    if (typeof value.productId === "string" && value.productId.length > 0) {
      return value.productId;
    }
    return readProductId(value.skus);
  }
  function readConceptId(value) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        const conceptId = readConceptId(entry);
        if (conceptId !== void 0) return conceptId;
      }
      return void 0;
    }
    if (!isRecord$1(value)) {
      return void 0;
    }
    const rawConceptId = value.conceptId;
    if (typeof rawConceptId === "string" && /^\d+$/.test(rawConceptId)) {
      return rawConceptId;
    }
    if (typeof rawConceptId === "number" && Number.isInteger(rawConceptId) && rawConceptId > 0) {
      return String(rawConceptId);
    }
    for (const nestedValue of Object.values(value)) {
      const conceptId = readConceptId(nestedValue);
      if (conceptId !== void 0) {
        return conceptId;
      }
    }
    return void 0;
  }
  function extractPlayStationSku(html) {
    const jsonScripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
    for (const script of jsonScripts) {
      const bodyMatch = script.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
      const body = bodyMatch?.[1]?.trim();
      if (body === void 0 || body.length === 0) {
        continue;
      }
      const parsed = parseJson(body);
      const sku = readSku(parsed);
      if (sku !== void 0) {
        return sku;
      }
    }
    return void 0;
  }
  function readSku(value) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        const sku = readSku(entry);
        if (sku !== void 0) return sku;
      }
      return void 0;
    }
    if (!isRecord$1(value) || typeof value.sku !== "string" || value.sku.length === 0) {
      return void 0;
    }
    return value.sku;
  }
  function extractFirstProductIdFromHtml(html) {
    const productMatch = html.match(/\/[a-z]{2}-[a-z]{2}\/product\/([A-Z0-9_-]+)/i);
    return productMatch?.[1];
  }
  function extractPlayStationConceptIdFromHtml(html) {
    const conceptMatch = html.match(/\\?["']?conceptId\\?["']?\s*:\s*\\?["']?(\d{4,})/i);
    return conceptMatch?.[1];
  }
  function extractPlayStationOffer(html) {
    const jsonScripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
    for (const script of jsonScripts) {
      const bodyMatch = script.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
      const body = bodyMatch?.[1]?.trim();
      if (body === void 0 || body.length === 0) {
        continue;
      }
      const parsed = parseJson(body);
      const offer = readProductOffer(parsed);
      if (offer !== void 0) {
        return offer;
      }
    }
    const priceMeta = html.match(/<meta[^>]+(?:property|name)=["'](?:product:price:amount|price)["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    const currencyMeta = html.match(/<meta[^>]+(?:property|name)=["'](?:product:price:currency|priceCurrency|currency)["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    const price = priceMeta?.[1] !== void 0 ? Number.parseFloat(priceMeta[1].replace(",", ".")) : Number.NaN;
    const currency = currencyMeta?.[1]?.toUpperCase();
    if (Number.isFinite(price) && currency !== void 0) {
      return { price, currency };
    }
    return void 0;
  }
  function readProductOffer(value) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        const offer2 = readProductOffer(entry);
        if (offer2 !== void 0) return offer2;
      }
      return void 0;
    }
    if (!isRecord$1(value)) {
      return void 0;
    }
    const offer = readFirstOffer$1(value.offers);
    if (offer === void 0) {
      return void 0;
    }
    return {
      ...typeof value.name === "string" ? { name: value.name } : {},
      ...offer
    };
  }
  function readFirstOffer$1(value) {
    const offer = Array.isArray(value) ? value[0] : value;
    if (!isRecord$1(offer)) {
      return void 0;
    }
    const rawPrice = typeof offer.price === "number" ? offer.price : typeof offer.price === "string" ? Number.parseFloat(offer.price.replace(",", ".")) : Number.NaN;
    const currency = typeof offer.priceCurrency === "string" ? offer.priceCurrency.toUpperCase() : void 0;
    if (!Number.isFinite(rawPrice) || currency === void 0) {
      return void 0;
    }
    return { price: rawPrice, currency };
  }
  function readNokBaseRates(value) {
    if (!isRecord$1(value) || value.result !== "success" || !isRecord$1(value.rates)) {
      return void 0;
    }
    const rates = {};
    for (const [currency, rate] of Object.entries(value.rates)) {
      if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
        rates[currency.toUpperCase()] = rate;
      }
    }
    if (Object.keys(rates).length === 0) {
      return void 0;
    }
    return {
      rates,
      ...typeof value.time_last_update_utc === "string" ? { updatedAt: value.time_last_update_utc } : {}
    };
  }
  async function mapWithConcurrency(items, concurrency, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;
    async function worker() {
      for (; ; ) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) {
          return;
        }
        results[index] = await mapper(items[index]);
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    return results;
  }
  async function defaultTextRequest(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) return void 0;
      return await response.text();
    } catch {
      return void 0;
    }
  }
  async function defaultJsonRequest(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) return void 0;
      return await response.json();
    } catch {
      return void 0;
    }
  }
  function parseJson(value) {
    try {
      return JSON.parse(value);
    } catch {
      return void 0;
    }
  }
  function decodeHtmlAttribute(value) {
    const namedEntities = {
      amp: "&",
      apos: "'",
      gt: ">",
      lt: "<",
      quot: '"'
    };
    return value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (entity, body) => {
      if (body.startsWith("#x") || body.startsWith("#X")) {
        const codePoint = Number.parseInt(body.slice(2), 16);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
      }
      if (body.startsWith("#")) {
        const codePoint = Number.parseInt(body.slice(1), 10);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
      }
      return namedEntities[body.toLowerCase()] ?? entity;
    });
  }
  function formatCurrency(amount, currency, locale) {
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: currencyUsesMinorUnits(currency) ? 2 : 0
      }).format(amount);
    } catch {
      return `${amount.toFixed(currencyUsesMinorUnits(currency) ? 2 : 0)} ${currency}`;
    }
  }
  function currencyUsesMinorUnits(currency) {
    return !(/* @__PURE__ */ new Set(["JPY", "KRW", "CLP", "VND"])).has(currency.toUpperCase());
  }
  function isRecord$1(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  const noWords = [
    "asshole",
    "dritt",
    "drittsekk",
    "faen",
    "faen i helvete",
    "fan",
    "fanken",
    "fitte",
    "forbanna",
    "forbannet",
    "forjævlig",
    "fuck",
    "fy faen",
    "føkk",
    "føkka",
    "føkkings",
    "jævla",
    "jævlig",
    "helvete",
    "helvetet",
    "kuk",
    "kukene",
    "kuker",
    "morraknuller",
    "morrapuler",
    "nigger",
    "pakkis",
    "pikk",
    "pokker",
    "ræva",
    "ræven",
    "satan",
    "shit",
    "sinnsykt",
    "skitt",
    "sotrør",
    "ståpikk",
    "ståpikkene",
    "ståpikker",
    "svartheiteste"
  ];
  const enWords = [
    "2g1c",
    "2 girls 1 cup",
    "acrotomophilia",
    "alabama hot pocket",
    "alaskan pipeline",
    "anal",
    "anilingus",
    "anus",
    "apeshit",
    "arsehole",
    "ass",
    "asshole",
    "assmunch",
    "auto erotic",
    "autoerotic",
    "babeland",
    "baby batter",
    "baby juice",
    "ball gag",
    "ball gravy",
    "ball kicking",
    "ball licking",
    "ball sack",
    "ball sucking",
    "bangbros",
    "bangbus",
    "bareback",
    "barely legal",
    "barenaked",
    "bastard",
    "bastardo",
    "bastinado",
    "bbw",
    "bdsm",
    "beaner",
    "beaners",
    "beaver cleaver",
    "beaver lips",
    "beastiality",
    "bestiality",
    "big black",
    "big breasts",
    "big knockers",
    "big tits",
    "bimbos",
    "birdlock",
    "bitch",
    "bitches",
    "black cock",
    "blonde action",
    "blonde on blonde action",
    "blowjob",
    "blow job",
    "blow your load",
    "blue waffle",
    "blumpkin",
    "bollocks",
    "bondage",
    "boner",
    "boob",
    "boobs",
    "booty call",
    "brown showers",
    "brunette action",
    "bukkake",
    "bulldyke",
    "bullet vibe",
    "bullshit",
    "bung hole",
    "bunghole",
    "busty",
    "butt",
    "buttcheeks",
    "butthole",
    "camel toe",
    "camgirl",
    "camslut",
    "camwhore",
    "carpet muncher",
    "carpetmuncher",
    "chocolate rosebuds",
    "cialis",
    "circlejerk",
    "cleveland steamer",
    "clit",
    "clitoris",
    "clover clamps",
    "clusterfuck",
    "cock",
    "cocks",
    "coprolagnia",
    "coprophilia",
    "cornhole",
    "coon",
    "coons",
    "creampie",
    "cum",
    "cumming",
    "cumshot",
    "cumshots",
    "cunnilingus",
    "cunt",
    "darkie",
    "date rape",
    "daterape",
    "deep throat",
    "deepthroat",
    "dendrophilia",
    "dick",
    "dildo",
    "dingleberry",
    "dingleberries",
    "dirty pillows",
    "dirty sanchez",
    "doggie style",
    "doggiestyle",
    "doggy style",
    "doggystyle",
    "dog style",
    "dolcett",
    "domination",
    "dominatrix",
    "dommes",
    "donkey punch",
    "double dong",
    "double penetration",
    "dp action",
    "dry hump",
    "dvda",
    "eat my ass",
    "ecchi",
    "ejaculation",
    "erotic",
    "erotism",
    "escort",
    "eunuch",
    "fag",
    "faggot",
    "fecal",
    "felch",
    "fellatio",
    "feltch",
    "female squirting",
    "femdom",
    "figging",
    "fingerbang",
    "fingering",
    "fisting",
    "foot fetish",
    "footjob",
    "frotting",
    "fuck",
    "fuck buttons",
    "fuckin",
    "fucking",
    "fucktards",
    "fudge packer",
    "fudgepacker",
    "futanari",
    "gangbang",
    "gang bang",
    "gay sex",
    "genitals",
    "giant cock",
    "girl on",
    "girl on top",
    "girls gone wild",
    "goatcx",
    "goatse",
    "god damn",
    "gokkun",
    "golden shower",
    "goodpoop",
    "goo girl",
    "goregasm",
    "grope",
    "group sex",
    "g-spot",
    "guro",
    "hand job",
    "handjob",
    "hard core",
    "hardcore",
    "hentai",
    "homoerotic",
    "honkey",
    "hooker",
    "horny",
    "hot carl",
    "hot chick",
    "how to kill",
    "how to murder",
    "huge fat",
    "humping",
    "incest",
    "intercourse",
    "jack off",
    "jail bait",
    "jailbait",
    "jelly donut",
    "jerk off",
    "jigaboo",
    "jiggaboo",
    "jiggerboo",
    "jizz",
    "juggs",
    "kike",
    "kinbaku",
    "kinkster",
    "kinky",
    "knobbing",
    "leather restraint",
    "leather straight jacket",
    "lemon party",
    "livesex",
    "lolita",
    "lovemaking",
    "make me come",
    "male squirting",
    "masturbate",
    "masturbating",
    "masturbation",
    "menage a trois",
    "milf",
    "missionary position",
    "mong",
    "motherfucker",
    "mound of venus",
    "mr hands",
    "muff diver",
    "muffdiving",
    "nambla",
    "nawashi",
    "negro",
    "neonazi",
    "nigga",
    "nigger",
    "nig nog",
    "nimphomania",
    "nipple",
    "nipples",
    "nsfw",
    "nsfw images",
    "nude",
    "nudity",
    "nutten",
    "nympho",
    "nymphomania",
    "octopussy",
    "omorashi",
    "one cup two girls",
    "one guy one jar",
    "orgasm",
    "orgy",
    "paedophile",
    "paki",
    "panties",
    "panty",
    "pedobear",
    "pedophile",
    "pegging",
    "penis",
    "phone sex",
    "piece of shit",
    "pikey",
    "pissing",
    "piss pig",
    "pisspig",
    "playboy",
    "pleasure chest",
    "pole smoker",
    "ponyplay",
    "poof",
    "poon",
    "poontang",
    "punany",
    "poop chute",
    "poopchute",
    "porn",
    "porno",
    "pornography",
    "prince albert piercing",
    "pthc",
    "pubes",
    "pussy",
    "queaf",
    "queef",
    "quim",
    "raghead",
    "raging boner",
    "rape",
    "raping",
    "rapist",
    "rectum",
    "reverse cowgirl",
    "rimjob",
    "rimming",
    "rosy palm",
    "rosy palm and her 5 sisters",
    "rusty trombone",
    "sadism",
    "santorum",
    "scat",
    "schlong",
    "scissoring",
    "semen",
    "sex",
    "sexcam",
    "sexo",
    "sexy",
    "sexual",
    "sexually",
    "sexuality",
    "shaved beaver",
    "shaved pussy",
    "shemale",
    "shibari",
    "shit",
    "shitblimp",
    "shitty",
    "shota",
    "shrimping",
    "skeet",
    "slanteye",
    "slut",
    "s&m",
    "smut",
    "snatch",
    "snowballing",
    "sodomize",
    "sodomy",
    "spastic",
    "spic",
    "splooge",
    "splooge moose",
    "spooge",
    "spread legs",
    "spunk",
    "strap on",
    "strapon",
    "strappado",
    "strip club",
    "style doggy",
    "suck",
    "sucks",
    "suicide girls",
    "sultry women",
    "swastika",
    "swinger",
    "tainted love",
    "taste my",
    "tea bagging",
    "threesome",
    "throating",
    "thumbzilla",
    "tied up",
    "tight white",
    "tit",
    "tits",
    "titties",
    "titty",
    "tongue in a",
    "topless",
    "tosser",
    "towelhead",
    "tranny",
    "tribadism",
    "tub girl",
    "tubgirl",
    "tushy",
    "twat",
    "twink",
    "twinkie",
    "two girls one cup",
    "undressing",
    "upskirt",
    "urethra play",
    "urophilia",
    "vagina",
    "venus mound",
    "viagra",
    "vibrator",
    "violet wand",
    "vorarephilia",
    "voyeur",
    "voyeurweb",
    "voyuer",
    "vulva",
    "wank",
    "wetback",
    "wet dream",
    "white power",
    "whore",
    "worldsex",
    "wrapping men",
    "wrinkled starfish",
    "xx",
    "xxx",
    "yaoi",
    "yellow showers",
    "yiffy",
    "zoophilia",
    "🖕"
  ];
  const PROFANITY_SET = new Set([...noWords, ...enWords].map((w) => w.toLowerCase()));
  const SUPABASE_URL = "https://tektckikcspxzhwjfzyn.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_FYwbz2OizGygwHzAJ4dbeQ_k4j6PX8s";
  async function fetchCodesForHost(hostname) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/discount_codes?hostname=eq.${encodeURIComponent(hostname)}&select=id,code,reward`,
        { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
      );
      if (!res.ok) return [];
      const rows = await res.json();
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) return [];
      const vRes = await fetch(
        `${SUPABASE_URL}/rest/v1/code_votes?code_id=in.(${ids.join(",")})&select=code_id,vote`,
        { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
      );
      const votes = vRes.ok ? await vRes.json() : [];
      return rows.map((r) => ({
        ...r,
        upvotes: votes.filter((v) => v.code_id === r.id && v.vote === 1).length,
        downvotes: votes.filter((v) => v.code_id === r.id && v.vote === -1).length
      }));
    } catch {
      return [];
    }
  }
  async function apiSubmitCode(hostname, code, reward) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ hostname, code, reward })
      });
      if (res.status === 409) return { ok: false, duplicate: true };
      if (res.status === 429) return { ok: false, rate_limited: true };
      if (!res.ok) return { ok: false };
      const data = await res.json();
      return { ok: true, ...data.id !== void 0 ? { id: data.id } : {} };
    } catch {
      return { ok: false };
    }
  }
  async function apiVote(codeId, vote, staticCode) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ code_id: codeId > 0 ? codeId : void 0, vote, ...staticCode ?? {} })
      });
      if (res.status === 429) return { rate_limited: true };
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }
  async function apiDeleteCode(codeId) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ id: codeId })
      });
      return res.ok;
    } catch {
      return false;
    }
  }
  async function fetchOwnedCodesForHost(hostname) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/owned-codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ hostname })
      });
      if (!res.ok) return /* @__PURE__ */ new Set();
      const data = await res.json();
      return new Set(data.ids ?? []);
    } catch {
      return /* @__PURE__ */ new Set();
    }
  }
  async function fetchMyVotes(hostname) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/my-votes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ hostname })
      });
      if (!res.ok) return {};
      const data = await res.json();
      const map = {};
      for (const v of data.votes ?? []) map[v.code_id] = v.vote;
      return map;
    } catch {
      return {};
    }
  }
  function showRateLimitFlash(near) {
    const existing = near.closest(".code-item-row")?.parentElement?.querySelector(".rate-limit-flash");
    if (existing) return;
    const flash = document.createElement("div");
    flash.className = "rate-limit-flash";
    flash.textContent = "Du har nådd grensen på 5 handlinger per dag.";
    flash.style.cssText = "font-size:11px;color:#e05555;padding:4px 8px;";
    near.closest(".code-item-row")?.insertAdjacentElement("afterend", flash);
    setTimeout(() => flash.remove(), 2500);
  }
  const CBN_LOGO_B64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRAD/AP8A/6C9p5MAAAAHdElNRQfqBQMQKDomKWayAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTA1LTAzVDE2OjI3OjM3KzAwOjAwpV2gRAAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0wNS0wM1QxNjoyNjo0MSswMDowMFLXT+UAAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMDUtMDNUMTY6NDA6NTgrMDA6MDC5W5FzAAAUAklEQVRo3sWaeZSeVZ3nP/dZ332pfa/sG0sWIeyJpEUgiiAIzdBo22qLOj2203NsHVpHjyAN4yiDCy5jWloElVFRtmAIxASSELJWZV8qlapUVWp7q95692e7d/4oEhIgG+f0md8573mf89z73Of7/W3P7y6CM4hS6kzNCCHetY8Qgvcibx/r5HFO12acy8P/kXImJZ1NgQDidJ1Pp92zgfF9nyAI0HUdXdcRQiClpFKpEAQBuVyOmpoawuHwOYN8V+Bvt8DpOp3OMm+/XyxWiEZDgEBKFTJNMV8IsUAplZZS5pVSe5RS2w3Dygqhkc8XiMdj5w34jNo7+Xe29pN/+VKR1as7CKSH67pzg8B/slAsTQwMjvjj2YlBx3EKlYpTzmTG/jI6OvbBtqaZlMtlxsezZxz3THhOEDsf9ziduH6AQKGUXKhp+oqeo4MLN27b25/J5b+16MqFqy6a0jI1pPHNwPWWZMcmBi3L/Gy54j7b3t50TonijO3vlUDfQ9/BfWYlWlUVxszp1H/voZTwvf+b6R+a9czqzWZow6vrp7z49LM9E3kjXyo5i//+M43zvvW1r+bQssViaTCRjN2ppOoLXI+G5ob3TOKMMfB20JkfPIq76Q30tlbE1g7EyAj20qV69oknp8du/cinjZbmaw/8nyfKMTMaalj1zEf7c/mPuX5AWzRK5Te/dUbnzrRrv3DPoaHhjIsQH6k43qN5zz0rgTPh0t61w8GDjP3sh4w+8TNK33uYzN4u/vafH+MR2Yx52WJ+9K/3I3StQcSit+V/++vHMLWXcd0vj7+8Ri8FxKzew0bX0Ig+4no02DY1lgVBYI9v2oLm+1UV19s8kSsumTdnqtGcTpwX+DNaoPvzXyTUfYTef7qXdMQiPTRK/rMftxAijhIx3TRrcPxZ9yy4ZIlz4MDVbqk0yy2XLW3GNIy2VgZ+8Tj5OYvoX7eGUa9EeyiOgWDC86g4Hu7gINJxYn6gjoxnJ67s7NyfmDVr6hjA2Ng4SilCto3reaTTqfMj0HH7Z1n54+/zvqnzaF28OKos7fLK3OnL9BdWzadxSutEsZLs6RtOBvVanNZWPfb+JfiA7/mIxgb8SBTz6quYOudCkkkDecO1VBsmthAoqfCDAL2+Fg+RrKtJ3ZROJWa2Ndd+W9NExnGcrGHovzNNY/BY31hFI0VV1Vvp+mSXeXs8GMcbh7/0DS5M1uDr+kW5rZvvi7a3fMCoq4664xMEpSKlSplwWeH6AZGP30Xq9o+hlEIAruNSKJRoue1WaqqSqGsuBSEAhQLEm7miXC7je0EkGg7dWFubRin1ueMgj/aPfiYZjx6sqk18SSnZdSatn0ziRAx079pLfNntYYrOv5az4zcHxUJUFkt4pRK+H+A4ZXzXwRECUVePkhLpeXiuR7FYplgs4zouUkpkECB9H+kHSM8n8Dyk51EqVib7lypwUo73A8nRgczs7EThRt/3ZwcyOGv+f4cLCSVQpaKtAtnkex5+xcXPF6jkC/ieh+c4+K4OLdPRGhtQUqIJweDIBE+v3IDyy7S3tXHzDTUEweTLj2tKCHDcgN88s4GmmhC9Azn+y2duOqHNIJBkxvOk4hHhBzJ5PnXYCQuoYhmt7AbS9yue7+MZOnJKO8YN16Ea6vHcCsMjGbZoUYLqmkkNArGIzcHDx3ht836mT2k4RXNv/YNp6BRLFX76qz/T3FTDcYxKKTzPp1AsU3FczfeDlOv650zgrWq0UEJNlKU0rcBadgPqk59kX7qBLV2DbHp6M12Hj5KdyOJXJli29NITL4/HbO7/yt8QBJJEPEQQyHfXlAb/8MkbufvWpdRWxwmkgjetFAQSx/WouD6+L9OuL9mxo4MFC+afOwHj2iuIF8uMtt/IK9E0m1b1cLh3Oz1HDhO4eZYvvYjWhhSWBpFI6BTtRiP2KRo/+fp4QagU2LZJQ20SqSbBHxepJL4f4Hk+nudVjY6VScWs87NA7/U3Ep45hR89+HP18oYNzL1oAR+4fC7TPjqfuTMauWThbPZt3MTB7R2YhvEOsCdXqUKIk4Cf2u/dwtL3Ja4f4PsBQSCrr1w8m46OXedH4PHnO8h7e9S+PX3yPy1fzOevX0xbay3RGdMwTQuh6WT270eODCJ0HRUEbwKdTJPyTbCaJji5xDolkwhxQvPH7wogkBIlwfMlvi/TlWLWEEL45xLMxvFO3/3pSkaNKDfN0tXFI4eozwwQueRChGbg+wG6ISiVikTr6xFCoOkajuszOJJDSkVjbQLbNskXKriejwAMQycWnXQvKg4oCaEwCBCOi/J9iEaQUiGVIpABgZTJYsUzTcv0z/QBO8UCSikOPfU8VZfMkZs//Z3Ay4/C7bdAPIGS8oQmfcelur0NXRNs6ejl4RWr2bDtMIGUXHPpdO79wnJ+8Nga1m/tAqGIhm3u+PD7uOe2K6h8/X5kdw/xhx9An9ZO4ZEf423tIPXD/0kgJy0YBIpAykSl5NgoyufiQifS6MSjv6T41e9Id2uHm9+zj66fP0bguqewl0FAqr6Ozr19/N2XH+OFtbtYMK+F6e21bNl5hN7+DJs6uimWXS6bP5WhTJ4Hf/wi+zq7CDZswln5IpWn/giBxNm0FW/3PoQmcL2AIAjwfR/f96OBVCFd1084Ws9wJ7t71p45BnTTwgyFldKE9E2D+iVXYYZtlFTs3bKNaCxKWUmMRJLv/ttL9A5kePS+u/jYjZeQLzoMjmSxTYPRsRzXL5nHj751F5//2q94Zk0HqlTEyxeRQOm3f8C+ZTlBdgJqqiEcwcuOoQA/kPheEHW9IKqkxup93+bwWCeGZvDpVb/mpW3f47pF//TuFsjls9QVPTXsV/yu5npiV1yGkgq34rD6ke/zb3fcxciOTvKuYM3G/VyzeAYf/eAiNA2S8RAXzmpmIl+mXHFY+/p+PnrPj3h29XbuvnkxM6uj+BM5goYmnK5uCk/+Dj87gapOIWwT3w8m3+UFuF4Q9n0Z7S6uYWptUyQVrrs9HW66asUNH2dY2/buLiSEYNwvo/3+Ab/TyXdF3rdQJRsaAcj09ZHbsh19/wESJQdfmGRzRVob0liWgVRvZZuRsTyViks8auG6Lp7vUSg5uJkx/HKZ8O03o104l9yKX1I5cgTqa8EwqFRcAjn5MStVXFsFItbvrp3/xOt/eGzd/m1PHhzq+vrVLUtCzZGZrNnzAGv3P/BOC7RuPchX6loIlHhw+Re+8IKmawihMXLwENZwhjY7QWt7O6mqJJGwyf7Dx8jmSpiGzshojnyxwuhYgSAI+MrnbuTZFV/imktm8vwrHRzZeRA/8DHft4DIJ/6aymgGp5iH2hqU0HBcD88PyBUqDI4PWs8f/t5/29HT9SdD126vjaWNoYnsFTsGtt0SsaJ/pQmzVjtpGnPiauIf7+Qb//shDBjzSmVfKYUMfCLpqtdiur49ads3pVua29tba8S1l83iN89t4nP3PsbcmU2s+ksnt1y/CMOYdIe1r+9jf9cxtu7soqEhTahcwFESqtJEl16F+ukvKO/eiUynkFJRLFYolyuUtW6Gsjst5QzfevGUJqbW1uL6in0DxxJdmf6fDBbGrLZE8z2hsHj8wRWf46uf/slb8wGAQ4cOEwTSbmysrxKGjlJQM2fW9uvWrvzi3ts+8ZOaKxb/e8gyL/mXf/gwZcdhzca9rHp1F9Nba5g5pZ7dB/pJxi1+98ImpFK0NKb4l/98E8lt6xiqSqDSCaivJ/TXtzL0YDdudTUVx6M/088x1uLo+2iNhJjZWEfJcVi39wAFxyFQiqNjY8naRIKqWemZhdAEcW3OqRYA8H0fKZVQSh2vFRFgzrt4AZu6Dh0q/fyXYyVDZ/rll7LioU9x6MgQjuMxpbWWupoEixdO4yPXLUKpyW9HbU2C2qoE5WlV2NdcCe1TyefyxO+4jtkLI0RnxdG8LdjxnbjmIZRyGMsKNoz3EA2bNNckmNdaTzwUZVdfhP6xcbKliRnvn7hLe9H+k3wHASklhULJk1Llj9c0hqHXPpUb0hJ1bdGJ5/5cG9uzl+BTd2P9zZ1cPLcNoU0uHQaBpL4mRUNtGpgs3mQQ4Hke1NcTpKrxvFESQQdBsBk33ku228E8avLh1gaWzbmN33ccYe3BTTQ1hUgnI/iBYmA8R2u1xoL2Jiquw2hhYsre5NqoEQ7y7yAAsHjxIjeTGe897lq6rs9YWHJSXVcujrJ1S9rv7cP9wzOsTk5l3Ipw11XT0aMRiEUm6xwpJ2drb5LyfZ9CoQL+EaqCP3Fs13rcUpl0Qw3JVBKhWVSywzA8yN8vWsi85lpWvPo82w6OEBgC2xY0puK8/4KpmLpOvuI0OqlSVSii55VSpxLIZrPk80WCIOhUyniTgDGtyrRm31c3beKGu+bGG3dsAtumo3uYvpzDLdtfQvT0YVxzBfrCBWhtLRCPIXUNT0ryRYdyoZdm9St6t/yFqsY0zfPbEXYY9BAYIcCmUqiQ6eng6rY5dFa3cejYNhqaEwQCJkoOe/uHSUZssoVyVcErNQS67HmHBVpaWshmcygl37Asc8wwtCpN0+K2bX1o8+7ulVvMUOju9y/ntgsaGd10jJqYhezswntlHerltYhkAtHchJg5HaZPpVJXx3DIpmXWHka71lJdE6KqLkx/zzj1rYJKpYLjaaRrE9iWoLrRZKxvN3csaGLfYBcFW6fiK8Ihg4GxPMmIRa5Ujo0Vx6fqlto0Mn7srWr0uHR27sUpO3vC4dBmXbeul1IidONj31y+ILehe9T8/ZbDvLh3mNGxIjcvmYt24Ty0wz34A4P4g8PIgWH8zdtxhSCjFNkLkkz5H9UUSyWaZiU42JXh9dcGWHbTXLb85QjTLmiiOg1CBdhCYooyMSvMVFNjbaZILBVhMFskFbFRMqDs+lreKU9zKdG5tQP97TFw3333kU6nvGKppFmWdZMQQtMNvcrt6Z6lfvfr9EeWLhRabT1v7D3Kgd5RehraEMuWEF+8kFBrE1rIQqFwXI+RUonQIpv6i1zChk8ibXK4q0Bvb4nRYznqG2PMvLCK3dsGGD46RjwcYFJBaQYHDg7xx71j5AKJG0hmtyaRStKfKZAMh448cserzzRe6rwziI90H8WyDFzXe8a2rXWRSGiZ73nazOU3TDn60svkH/4uH/7nL/NyQ4pZ7fUUHI8HV+1GoJje2MrFf3UxM6Ma1eUcXk8PseZOCA5hCQ9ZLjE2WiYzXMJ3fJZd10R2MMP6VV1cPL8K2gRCSTSjgO6WMFCELJ1ZbQkilkZH1xijuQptVc60R5/9ZKRndKz0DgKXXDqfw109aLqencjmHtB1fb5tm9VmNMqS+7/Ja7kCB3v6yRc0PjhtJpf17mdoSQu7RZjNAzle2tXLk+N5As9D+C532gEX6wayUsQtlhkeLtM+NY5b8di26RhVVSaptMWVl0bRZYGya4BeYjRbobk+SnVtGKfis7t7nImiSyxkopS0M8WcpZQsvevq9MjIKKVSmWuXXf3Kgf2HH6qqSn7btDDDdXVc/YPv8uILayjufAlv8BiZXzxB2A+4srmRq2bNwJ02jdH57fRh0TkwhlQZMEbwZAUnXwLp095ikU6EWb8lT6EYoiqhoJzD9X1EuJ7x4Rw7usv0xwWOqTuRqDEaC1lHZtSndkVDRqeNvn7vxr4Jo1o7/f7Axg1b0DSdbDYXmj69/f5UKv5fTcvQNF3HcVye+uNqzEMHM3U/+P5wqOKGLU2LIGVICmEJ29ZlPKZnIiGty3ZY/rdlGmdUQfYwEoUdNjFMQdHRUAgMfGzhIe0UVrKO19b3Fx/YWnyu0F69ZWpb9a5UItSVCkcH/9fXXsp//BvzCaswxb0SkTjLBsfmNzpQSpHNTkTb2pq/nkonvhQKWbamaei6TrlQGCz1Hn28/7mVK4/+8GfDbmbIVsKK26YZk4JI1nMjXdKPLL0nMu+K66o+E4hkSI4dQqgymq6h6ZMrFzJQEK4lUtfEQM8x1m3M/WTn4OwvbprS4zVPaSIaCiGUiSqZjLvDXDHtOu69+2HgLAS2b+2YXCkIAo729llz5s3+VDqV+FosFmnWdIEmNDRdl0LTuoSmvSJM4xVNaHssGASKgA8YnW+82FzY8NUV0+ryS+xEHW5+gqCcBRUgzBB2sgY7ojN09Bgdu/Jr+kbtTyhknz7msuvqm3jhx6/S29s7WZ29fdORs4jv+7z++lZ8X7J06eW88caOxalU4r/H49EbQyHb1vXJKcWba0GBECILjAohxgEXsMtlp2rjq+saRzY+ErsgvYvW1jihRBKhm/i+S3Eix9Gecae713+64Ebu9Utj3dF4nL/7+QhCaGfe8D4T+JM7v7p2E4VCiYamWvr7hqINDbUfiidin4rGwleGbCtuGPpplz6klOTzJTo69rB7/XOIofVBc+jIgKW7ftlVhVxe7XI87fe+Vr0yHZoo5frHab38Mu789utn0++5EwB47bXNKAQyCKipTnGoqzdaV1d9aSQSuiEUDl1tW9YM0zTSuq5ZQntzpU4qpJTKD4LSRK44tGd/z46ObZ3PjWx5ep0xvsPR7Gilt9Qyvqx1Z2AnGwncItMvX86H/vHx0+J4zwSOa3j16teIxaKUy2XC4TCXXbaAp5/+czydTrbalj1FN/QWXdeSCGHIICgFgRz1A3m04rhHwiHj2FO//ZNnDb5KKLcDMxLDDMUYHjjMvf/eQW3b3FPedSYc503g7QPs3HmEwWNHJvcKDAvTNLAsm3A4hB2y0DQN1/WolCs4rofjeriug6d8IkaYD3zgynMCeaYDJee0k3C+B0Hey8GRsz1z1tMq/7/lvZ6O+X97BNwJzZXdBQAAAABJRU5ErkJggg==";
  const HOST_ID = "cashback-varsler-notice";
  const COLLAPSED_STORAGE_KEY = "cashback-varsler-collapsed";
  const CHIPS_COLLAPSED_KEY = "cashback-varsler-chips-collapsed";
  const CODES_COLLAPSED_KEY = "cashback-varsler-codes-collapsed";
  const PRICE_MATCH_COLLAPSED_KEY = "cashback-varsler-price-match-collapsed";
  const REGION_PRICES_COLLAPSED_KEY = "cashback-varsler-region-prices-collapsed";
  const HIDDEN_HOSTS_KEY = "cashback-varsler-hidden-hosts";
  const PSN_GIFT_CARD_DEALS_URL = "https://gcdeals.net/no/explore?sort=relevance&category%5B0%5D=1&type%5B0%5D=1";
  const PSN_GIFT_CARD_REGION_URLS = {
    AU: "https://gcdeals.net/no/group/12/playstation-network-cards-aud-australia",
    BR: "https://gcdeals.net/no/group/15/playstation-network-cards-brl-brazil",
    CA: "https://gcdeals.net/no/group/16/playstation-network-cards-cad-canada",
    CH: "https://gcdeals.net/no/group/10/playstation-network-cards-chf-switzerland",
    DE: "https://gcdeals.net/no/group/3/playstation-network-cards-eur-germany",
    DK: "https://gcdeals.net/no/group/515/playstation-network-gift-cards-dkk-denmark",
    ES: "https://gcdeals.net/no/group/11/playstation-network-cards-eur-spain",
    FI: "https://gcdeals.net/no/group/5/playstation-network-cards-eur-finland",
    FR: "https://gcdeals.net/no/group/8/playstation-network-cards-eur-france",
    GB: "https://gcdeals.net/no/group/2/playstation-network-cards-gbp-united-kingdom",
    HK: "https://gcdeals.net/no/group/22/playstation-network-cards-hkd-hong-kong",
    IN: "https://gcdeals.net/no/group/518/playstation-network-gift-cards-inr-india",
    IT: "https://gcdeals.net/no/group/6/playstation-network-cards-eur-italy",
    JP: "https://gcdeals.net/no/group/28/playstation-network-cards-jpy-japan",
    KR: "https://gcdeals.net/no/group/1021/playstation-network-gift-cards-nok-south-korea",
    MX: "https://gcdeals.net/no/group/32/playstation-network-cards-usd-mexico",
    NO: "https://gcdeals.net/no/group/9/playstation-network-cards-nok-norway",
    NZ: "https://gcdeals.net/no/group/34/playstation-network-cards-nzd-new-zealand",
    PL: "https://gcdeals.net/no/group/4/playstation-network-cards-pln-poland",
    SE: "https://gcdeals.net/no/group/522/playstation-network-gift-cards-sek-sweden",
    SG: "https://gcdeals.net/no/group/41/playstation-network-cards-sgd-singapore",
    US: "https://gcdeals.net/no/group/1/playstation-network-cards-usd-united-states",
    TR: "https://gcdeals.net/no/group/1050/playstation-network-gift-cards-try-turkey",
    UA: "https://gcdeals.net/no/group/1078/playstation-network-gift-cards-uah-ukraine",
    ZA: "https://gcdeals.net/no/group/43/playstation-network-cards-zar-south-africa"
  };
  const ACTIVATED_OFFERS_STORAGE_KEY = "cashback-varsler-activated-offers";
  const OFFER_ACTIVATION_TTL_MS = 2 * 60 * 60 * 1e3;
  const CURRENT_HOST = window.location.hostname.replace(/^www\./, "").toLowerCase();
  const PRICE_MATCH_SOURCE_HOSTS = /* @__PURE__ */ new Set([
    "prisjakt.no",
    "prisjakt.nu",
    "prisjakt.se",
    "prisjagt.dk",
    "pricespy.co.uk",
    "pricespy.co.nz",
    "hintaopas.fi",
    "ledenicheur.fr",
    "godpris.no",
    "tax-free.no",
    "klarna.com",
    "kelkoo.no",
    "prisradar.no",
    "sesum.no",
    "enhver.no"
  ]);
  installOfferActivationClickTracker();
  chrome.runtime.onMessage.addListener((message) => {
    if (isCashbackFoundMessage(message)) {
      requestCurrentOffers();
      return;
    }
    if (isCashbackNoneMessage(message)) {
      requestCurrentOffers();
      return;
    }
    if (isRecord(message) && message.type === "toggle-notice") {
      chrome.storage.local.get(HIDDEN_HOSTS_KEY, (result) => {
        const hidden = Array.isArray(result[HIDDEN_HOSTS_KEY]) ? result[HIDDEN_HOSTS_KEY] : [];
        const isHidden = hidden.includes(CURRENT_HOST);
        if (isHidden) {
          const next = hidden.filter((h) => h !== CURRENT_HOST);
          chrome.storage.local.set({ [HIDDEN_HOSTS_KEY]: next });
          requestCurrentOffers();
        } else {
          chrome.storage.local.set({ [HIDDEN_HOSTS_KEY]: [...hidden, CURRENT_HOST] });
          clearNotice();
        }
      });
    }
  });
  requestCurrentOffers();
  installDynamicProductPageRefresh();
  function renderNoticeWithStoredState(offers, priceMatches = [], regionPrices) {
    const isUserscript = chrome.runtime.id === void 0;
    chrome.storage.local.get([COLLAPSED_STORAGE_KEY, CHIPS_COLLAPSED_KEY, CODES_COLLAPSED_KEY, PRICE_MATCH_COLLAPSED_KEY, REGION_PRICES_COLLAPSED_KEY, HIDDEN_HOSTS_KEY], (result) => {
      const hidden = Array.isArray(result[HIDDEN_HOSTS_KEY]) ? result[HIDDEN_HOSTS_KEY] : [];
      if (!isUserscript && hidden.includes(CURRENT_HOST)) return;
      const collapsed = result[COLLAPSED_STORAGE_KEY] === true;
      const chipsCollapsed = result[CHIPS_COLLAPSED_KEY] === true;
      const codesCollapsed = result[CODES_COLLAPSED_KEY] === true;
      const priceMatchCollapsed = result[PRICE_MATCH_COLLAPSED_KEY] === true;
      const regionPricesCollapsed = result[REGION_PRICES_COLLAPSED_KEY] === true;
      void readActivatedOffers().catch(() => ({})).then((activatedOffers) => {
        renderNotice(offers, collapsed, chipsCollapsed, codesCollapsed, priceMatchCollapsed, regionPricesCollapsed, activatedOffers, priceMatches, regionPrices);
      });
    });
  }
  function requestCurrentOffers() {
    void renderCurrentContext();
  }
  function installDynamicProductPageRefresh() {
    const parsedUrl = parseUrl(window.location.href);
    if (parsedUrl === void 0 || !isDynamicPriceMatchHost(parsedUrl)) {
      return;
    }
    if (document.body === null) {
      window.addEventListener("DOMContentLoaded", installDynamicProductPageRefresh, { once: true });
      return;
    }
    let timerId;
    let latestMetaKey = "";
    let latestUrl = window.location.href;
    const scheduleRefresh = () => {
      if (timerId !== void 0) {
        window.clearTimeout(timerId);
      }
      timerId = window.setTimeout(() => {
        const currentUrl = parseUrl(window.location.href);
        if (currentUrl === void 0 || !isDynamicPriceMatchProductPage(currentUrl)) {
          latestMetaKey = "";
          return;
        }
        const meta = extractProductPageMeta();
        const metaKey = meta === void 0 ? "" : [meta.searchTerm, meta.price, meta.currency, meta.packageAmount, meta.packageUnit, meta.volumeMl, meta.alcoholPercent].join("|");
        if (metaKey.length > 0 && metaKey !== latestMetaKey) {
          latestMetaKey = metaKey;
          requestCurrentOffers();
        }
      }, 250);
    };
    const scheduleLocationRefresh = () => {
      if (window.location.href !== latestUrl) {
        latestUrl = window.location.href;
        latestMetaKey = "";
      }
      scheduleRefresh();
    };
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function pushState(...args) {
      const result = originalPushState.apply(this, args);
      scheduleLocationRefresh();
      return result;
    };
    history.replaceState = function replaceState(...args) {
      const result = originalReplaceState.apply(this, args);
      scheduleLocationRefresh();
      return result;
    };
    window.addEventListener("popstate", scheduleLocationRefresh);
    window.addEventListener("hashchange", scheduleLocationRefresh);
    const observer = new MutationObserver((mutations) => {
      const hasExternalMutation = mutations.some((mutation) => {
        const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        return target === null || target.closest(`#${HOST_ID}`) === null;
      });
      if (hasExternalMutation) {
        scheduleRefresh();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    scheduleRefresh();
  }
  function hasBlockedHostname(blockedHosts, hostname) {
    return [...blockedHosts].some((blockedHost) => hostname === blockedHost || hostname.endsWith(`.${blockedHost}`));
  }
  async function renderCurrentContext() {
    const [offers, priceMatches, regionPrices] = await Promise.all([
      getCurrentOffers(),
      getPriceMatchesForCurrentPage(),
      getPlayStationRegionPricesForCurrentPage()
    ]);
    if (offers.length > 0 || priceMatches.length > 0 || (regionPrices?.prices.length ?? 0) > 0) {
      renderNoticeWithStoredState(offers, priceMatches, regionPrices);
      return;
    }
    clearNotice();
  }
  async function getCurrentOffers() {
    const message = {
      type: "get-offers-for-url",
      url: window.location.href
    };
    const response = await sendRuntimeMessage(message);
    if (response !== void 0 && isOffersForUrlResponse(response) && response.ok) {
      if (response.offers.length > 0) return response.offers;
    }
    return readBundledOffersForCurrentUrl();
  }
  async function readBundledOffersForCurrentUrl() {
    const parsedUrl = parseUrl(window.location.href);
    if (parsedUrl === void 0 || parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return [];
    }
    try {
      const response = await fetch(chrome.runtime.getURL("cashback-index.json"));
      const value = await response.json();
      if (!isCashbackIndex(value)) {
        return [];
      }
      return findOffersForHostname(value, parsedUrl.hostname);
    } catch {
      return [];
    }
  }
  async function getPriceMatchesForCurrentPage() {
    const productMeta = extractProductPageMeta();
    if (productMeta === void 0) return [];
    const message = {
      type: "get-price-match-for-product",
      ...productMeta
    };
    if (isUserscriptRuntime()) {
      return findPriceMatches(message, userscriptJsonRequest, userscriptTextRequest);
    }
    const response = await sendRuntimeMessage(message);
    if (response !== void 0 && isPriceMatchForProductResponse(response) && response.ok) {
      return response.offers ?? (response.offer !== void 0 ? [response.offer] : []);
    }
    return [];
  }
  async function getPlayStationRegionPricesForCurrentPage() {
    if (!isPlayStationProductUrl(window.location.href)) {
      return void 0;
    }
    const message = {
      type: "get-playstation-region-prices",
      url: window.location.href
    };
    if (isUserscriptRuntime()) {
      return findPlayStationRegionPrices(
        window.location.href,
        (url) => userscriptTextRequest(url),
        (url) => userscriptJsonRequest(url)
      );
    }
    const response = await sendRuntimeMessage(message);
    if (response !== void 0 && isPlayStationRegionPricesResponse(response) && response.ok) {
      return response.result;
    }
    return void 0;
  }
  function isUserscriptRuntime() {
    return chrome.runtime.id === void 0;
  }
  async function userscriptJsonRequest(url, init) {
    const gmRequest = typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function" ? GM.xmlHttpRequest : void 0;
    if (gmRequest !== void 0) {
      return new Promise((resolveValue) => {
        const requestOptions = {
          method: init?.method ?? "GET",
          url,
          timeout: 15e3,
          onload: (response) => {
            resolveValue(parseUserscriptJsonResponse(response));
          },
          onerror: () => resolveValue(void 0),
          ontimeout: () => resolveValue(void 0)
        };
        if (init?.headers !== void 0) requestOptions.headers = init.headers;
        if (init?.body !== void 0) requestOptions.data = init.body;
        const maybePromise = gmRequest(requestOptions);
        if (isPromiseLike(maybePromise)) {
          maybePromise.then(
            (response) => resolveValue(parseUserscriptJsonResponse(response)),
            () => resolveValue(void 0)
          );
        }
      });
    }
    try {
      const response = await fetch(url, init);
      if (!response.ok) return void 0;
      return response.json();
    } catch {
      return void 0;
    }
  }
  async function userscriptTextRequest(url, init) {
    const gmRequest = typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function" ? GM.xmlHttpRequest : void 0;
    if (gmRequest !== void 0) {
      return new Promise((resolveValue) => {
        const requestOptions = {
          method: init?.method ?? "GET",
          url,
          timeout: 15e3,
          onload: (response) => {
            resolveValue(readUserscriptTextResponse(response));
          },
          onerror: () => resolveValue(void 0),
          ontimeout: () => resolveValue(void 0)
        };
        if (init?.headers !== void 0) requestOptions.headers = init.headers;
        if (init?.body !== void 0) requestOptions.data = init.body;
        const maybePromise = gmRequest(requestOptions);
        if (isPromiseLike(maybePromise)) {
          maybePromise.then(
            (response) => resolveValue(readUserscriptTextResponse(response)),
            () => resolveValue(void 0)
          );
        }
      });
    }
    try {
      const response = await fetch(url, init);
      if (!response.ok) return void 0;
      return response.text();
    } catch {
      return void 0;
    }
  }
  function parseUserscriptJsonResponse(response) {
    if (!isRecord(response)) return void 0;
    const status = typeof response.status === "number" ? response.status : 200;
    if (status < 200 || status >= 300) return void 0;
    const body = response.response ?? response.responseText;
    if (typeof body !== "string") return body;
    try {
      return JSON.parse(body);
    } catch {
      return void 0;
    }
  }
  function readUserscriptTextResponse(response) {
    if (!isRecord(response)) return void 0;
    const status = typeof response.status === "number" ? response.status : 200;
    if (status < 200 || status >= 300) return void 0;
    const body = response.response ?? response.responseText;
    return typeof body === "string" ? body : void 0;
  }
  function isPromiseLike(value) {
    return isRecord(value) && typeof value.then === "function";
  }
  function sendRuntimeMessage(message) {
    return new Promise((resolveValue) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError !== void 0) {
          resolveValue(void 0);
          return;
        }
        resolveValue(response);
      });
    });
  }
  function extractProductPageMeta() {
    const parsedUrl = parseUrl(window.location.href);
    if (parsedUrl === void 0 || parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return void 0;
    }
    const normalizedHostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    if (hasBlockedHostname(PRICE_MATCH_SOURCE_HOSTS, normalizedHostname) && !isKnownPriceMatchSourceProductPage(parsedUrl)) {
      return void 0;
    }
    const vinmonopoletText = normalizedHostname === "vinmonopolet.no" ? document.body?.innerText.slice(0, 12e3) ?? "" : "";
    const productLdJson = findProductLdJson();
    const offer = readFirstOffer(productLdJson?.offers);
    const titleMeta = document.querySelector('meta[name="title"]')?.content.trim();
    const ogTitle = document.querySelector('meta[property="og:title"]')?.content.trim();
    const h1 = document.querySelector("h1")?.textContent?.trim();
    const codes = uniqueStrings([...collectProductCodes(productLdJson), ...collectProductCodesFromUrl(parsedUrl)]);
    const productPageClue = isVinmonopoletProductPage(parsedUrl) || isTaxfreeProductPage(parsedUrl) || hasProductStructuredDataSignal(productLdJson, offer, codes) || document.querySelector('meta[property="og:type"][content="product"]') !== null && (hasVisiblePriceSignal() || hasCommerceActionSignal()) || codes.length > 0 || isLikelyCommerceProductPage(parsedUrl);
    if (isLikelyProductListingPage(parsedUrl) && document.querySelector('meta[property="og:type"][content="product"]') === null && !isLikelyCommerceProductPage(parsedUrl)) {
      return void 0;
    }
    const productName = readStringValue(productLdJson?.name);
    const brandName = readBrandName(productLdJson?.brand);
    const vinmonopoletProductName = normalizedHostname === "vinmonopolet.no" ? readVinmonopoletProductName(parsedUrl, h1) : void 0;
    const searchTerm = vinmonopoletProductName ?? (productName !== void 0 ? brandName !== void 0 && !productName.toLowerCase().includes(brandName.toLowerCase()) ? `${brandName} ${productName}` : productName : h1 ?? titleMeta ?? ogTitle ?? document.title);
    const normalizedSearchTerm = searchTerm.trim().replace(/\s+/g, " ");
    const productTitleCandidates = uniqueStrings([
      normalizedSearchTerm,
      productName,
      brandName !== void 0 && productName !== void 0 && !productName.toLowerCase().includes(brandName.toLowerCase()) ? `${brandName} ${productName}` : void 0,
      h1,
      titleMeta,
      ogTitle,
      document.title
    ]);
    const packageQuantity = readProductPackageQuantity(productLdJson, productTitleCandidates);
    if (!productPageClue || normalizedSearchTerm.length < 8) {
      return void 0;
    }
    const visibleVinmonopoletPrice = vinmonopoletText.length > 0 ? readVinmonopoletPrice(vinmonopoletText) : void 0;
    const price = readNumberValue(offer?.price) ?? visibleVinmonopoletPrice;
    const currency = readStringValue(offer?.priceCurrency) ?? (visibleVinmonopoletPrice !== void 0 ? "NOK" : void 0);
    const productUrl = readUrlValue(productLdJson?.url);
    const organizationName = findOrganizationName();
    const volumeMl = vinmonopoletText.length > 0 ? readVinmonopoletVolumeMl(vinmonopoletText, price) : void 0;
    const alcoholPercent = vinmonopoletText.length > 0 ? readVinmonopoletAlcoholPercent(vinmonopoletText) : void 0;
    return {
      url: window.location.href,
      searchTerm: normalizedSearchTerm,
      productPageClue,
      ...price !== void 0 ? { price } : {},
      ...currency !== void 0 ? { currency } : {},
      ...productUrl !== void 0 ? { productUrl } : {},
      ...codes.length > 0 ? { codes } : {},
      ...productTitleCandidates.length > 0 ? { productTitleCandidates } : {},
      ...organizationName !== void 0 ? { organizationName } : {},
      ...brandName !== void 0 ? { productBrand: brandName } : {},
      ...packageQuantity !== void 0 ? { packageAmount: packageQuantity.amount, packageUnit: packageQuantity.unit } : {},
      ...volumeMl !== void 0 ? { volumeMl } : {},
      ...alcoholPercent !== void 0 ? { alcoholPercent } : {}
    };
  }
  function hasProductStructuredDataSignal(product, offer, codes) {
    if (product === void 0) return false;
    const productName = readStringValue(product.name);
    if (productName === void 0) return false;
    if (codes.length > 0) return true;
    if (readNumberValue(offer?.price) !== void 0 || readStringValue(offer?.priceCurrency) !== void 0) return true;
    return hasVisiblePriceSignal() && hasCommerceActionSignal();
  }
  function isLikelyProductListingPage(parsedUrl) {
    const pathname = parsedUrl.pathname.toLowerCase();
    const listingPath = /(?:^|\/)(?:search|sok|søk|resultat|results|kategori|category|categories|c|collections?|collections|list|listing)(?:\/|$)/i.test(pathname);
    const listingQuery = [...parsedUrl.searchParams.keys()].some((key) => /^(?:q|query|search|sok|søk|keyword|term|category|filter|sort|page)$/i.test(key));
    if (!listingPath && !listingQuery) return false;
    const productCardCount = document.querySelectorAll(
      [
        "[data-product-id]",
        "[data-productid]",
        "[data-product]",
        ".product-card",
        ".product-tile",
        ".product-item",
        ".product-list-item",
        "article"
      ].join(",")
    ).length;
    const visiblePriceCount = (document.body?.innerText.match(/\b(?:kr|NOK)\s?\d|\d[\d\s]*(?:,\d{2})?\s?(?:kr|NOK)\b/gi) ?? []).length;
    return productCardCount >= 2 || visiblePriceCount >= 3;
  }
  function isKnownPriceMatchSourceProductPage(parsedUrl) {
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    const pathname = parsedUrl.pathname.toLowerCase();
    if (hostname.endsWith("prisjakt.no") || hostname.endsWith("prisjakt.nu") || hostname.endsWith("prisjakt.se") || hostname.endsWith("prisjagt.dk") || hostname.endsWith("pricespy.co.uk") || hostname.endsWith("pricespy.co.nz") || hostname.endsWith("hintaopas.fi") || hostname.endsWith("ledenicheur.fr")) {
      return pathname === "/product.php" && parsedUrl.searchParams.has("p") || /^\/produkt(?:er)?\//.test(pathname);
    }
    if (hostname.endsWith("godpris.no")) {
      return /^\/produkt\/[^/]+\/?$/.test(pathname);
    }
    if (hostname.endsWith("tax-free.no")) {
      return /^\/(?:no\/)?product\d+(?:\/|$)/.test(pathname);
    }
    if (hostname.endsWith("klarna.com")) {
      return /\/shopping\/pl\/(?:cl\d+\/)?\d+\//.test(pathname);
    }
    if (hostname.endsWith("kelkoo.no")) {
      return /^\/gtin\/\d+\/?$/.test(pathname);
    }
    if (hostname.endsWith("prisradar.no")) {
      return /^\/produkter\/[^/]+\/?$/.test(pathname);
    }
    if (hostname.endsWith("sesum.no")) {
      return /^\/produkt\/[^/]+\/?$/.test(pathname);
    }
    if (hostname.endsWith("enhver.no")) {
      return /^\/brands\/[^/]+\/\d+\/?$/.test(pathname);
    }
    if (hostname.endsWith("store.steampowered.com")) {
      return /^\/app\/\d+(?:\/|$)/.test(pathname);
    }
    return false;
  }
  function isVinmonopoletProductPage(parsedUrl) {
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    return hostname === "vinmonopolet.no" && /\/p\/\d+(?:\/|$)/i.test(parsedUrl.pathname);
  }
  function isTaxfreeProductPage(parsedUrl) {
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    return hostname === "tax-free.no" && /^\/(?:no\/)?product\d+(?:\/|$)/i.test(parsedUrl.pathname);
  }
  function isDynamicPriceMatchProductPage(parsedUrl) {
    return isVinmonopoletProductPage(parsedUrl) || isTaxfreeProductPage(parsedUrl);
  }
  function isDynamicPriceMatchHost(parsedUrl) {
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    return hostname === "vinmonopolet.no" || hostname === "tax-free.no";
  }
  function readVinmonopoletProductName(parsedUrl, h1) {
    if (!isVinmonopoletProductPage(parsedUrl)) return void 0;
    if (h1 !== void 0 && h1.length >= 3 && h1.length <= 80) return h1;
    const segments = parsedUrl.pathname.split("/").filter(Boolean);
    const productIndex = segments.findIndex((segment) => segment.toLowerCase() === "p");
    if (productIndex <= 0) return void 0;
    try {
      return decodeURIComponent(segments[productIndex - 1] ?? "").replace(/[-_]+/g, " ").trim().replace(/\s+/g, " ") || void 0;
    } catch {
      return void 0;
    }
  }
  function isLikelyCommerceProductPage(parsedUrl) {
    if (isTaxfreeProductPage(parsedUrl)) {
      return true;
    }
    if (isSteamAppProductUrl(parsedUrl.toString())) {
      return true;
    }
    const strongProductishPath = /(?:^|\/)(?:product|produkt|produkter)\/[^/]+/i.test(parsedUrl.pathname) || /^\/(?:i|p)\/\d+\/[-\w%]+\/?$/i.test(parsedUrl.pathname);
    if (strongProductishPath && (hasVisiblePriceSignal() || hasCommerceActionSignal())) {
      return true;
    }
    const productishPath = /\b(product|produkt|produkter|p|i|item|shop|varer|sku)\b/i.test(parsedUrl.pathname) || [...parsedUrl.searchParams.keys()].some((key) => /\b(product|produkt|sku|mpn|gtin|ean)\b/i.test(key));
    if (!productishPath) return false;
    return hasVisiblePriceSignal() && hasCommerceActionSignal();
  }
  function hasVisiblePriceSignal() {
    if (document.querySelector('[itemprop="price"], meta[property="product:price:amount"], meta[property="og:price:amount"]') !== null) {
      return true;
    }
    const bodyText = document.body?.innerText.slice(0, 8e3) ?? "";
    return /\b(?:kr|NOK)\s?\d|\d[\d\s]*(?:,\d{2})?\s?(?:kr|NOK)\b/i.test(bodyText);
  }
  function hasCommerceActionSignal() {
    const commerceText = [
      "legg i handlekurv",
      "legg til handlekurv",
      "kjøp",
      "kjop",
      "add to cart",
      "add to basket"
    ];
    for (const element of document.querySelectorAll("button, a, input")) {
      const text = `${element.textContent ?? ""} ${element.value ?? ""} ${element.getAttribute("aria-label") ?? ""}`.trim().toLowerCase();
      if (commerceText.some((needle) => text.includes(needle))) return true;
    }
    return false;
  }
  function findProductLdJson() {
    for (const entry of readLdJsonEntries()) {
      const product = findTypedLdJson(entry, "Product");
      if (product !== void 0) return product;
    }
    return void 0;
  }
  function findOrganizationName() {
    for (const entry of readLdJsonEntries()) {
      const organization = findTypedLdJson(entry, "Organization") ?? findTypedLdJson(entry, "WebSite");
      const name = readStringValue(organization?.name);
      if (name !== void 0) return name;
      const offer = findTypedLdJson(entry, "Offer");
      const sellerName = readBrandName(offer?.seller);
      if (sellerName !== void 0) return sellerName;
    }
    return void 0;
  }
  function readLdJsonEntries() {
    const entries = [];
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        entries.push(JSON.parse(script.textContent ?? ""));
      } catch {
      }
    }
    return entries;
  }
  function findTypedLdJson(value, type) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findTypedLdJson(item, type);
        if (found !== void 0) return found;
      }
      return void 0;
    }
    if (!isRecord(value)) return void 0;
    const graph = value["@graph"];
    if (Array.isArray(graph)) {
      for (const item of graph) {
        const found = findTypedLdJson(item, type);
        if (found !== void 0) return found;
      }
    }
    const rawType = value["@type"];
    const types = Array.isArray(rawType) ? rawType : [rawType];
    return types.some((item) => item === type) ? value : void 0;
  }
  function readFirstOffer(value) {
    if (Array.isArray(value)) {
      return value.find(isRecord);
    }
    return isRecord(value) ? value : void 0;
  }
  function readBrandName(value) {
    if (typeof value === "string") return value.trim() || void 0;
    return isRecord(value) ? readStringValue(value.name) : void 0;
  }
  function readStringValue(value) {
    if (typeof value !== "string") return void 0;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : void 0;
  }
  function readNumberValue(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return void 0;
    const parsed = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : void 0;
  }
  function readUrlValue(value) {
    const url = readStringValue(value);
    return url !== void 0 && parseUrlWithBase(url, window.location.href) !== void 0 ? parseUrlWithBase(url, window.location.href)?.toString() : void 0;
  }
  function collectProductCodes(product) {
    if (product === void 0) return [];
    const codes = /* @__PURE__ */ new Set();
    for (const [key, value] of Object.entries(product)) {
      if (!/^(gtin|ean|barcode|sku|mpn)/i.test(key)) continue;
      const values = Array.isArray(value) ? value : [value];
      for (const item of values) {
        if (typeof item === "string" || typeof item === "number") {
          const code = String(item).trim();
          if (code.length > 0) codes.add(code);
        }
      }
    }
    return [...codes];
  }
  function collectProductCodesFromUrl(parsedUrl) {
    return uniqueStrings(`${parsedUrl.pathname} ${parsedUrl.search}`.match(/\b\d{8,14}\b/g) ?? []);
  }
  function readProductPackageQuantity(product, titleCandidates) {
    if (product !== void 0) {
      for (const value of [
        product.weight,
        product.size,
        product.netWeight,
        product.volume,
        product.additionalProperty
      ]) {
        const quantity = readPackageQuantityFromStructuredValue(value);
        if (quantity !== void 0) return quantity;
      }
    }
    const textQuantity = readPackageQuantityFromText([
      readStringValue(product?.description),
      ...titleCandidates
    ].filter((value) => value !== void 0).join(" "));
    return textQuantity;
  }
  function readPackageQuantityFromStructuredValue(value) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const quantity2 = readPackageQuantityFromStructuredValue(item);
        if (quantity2 !== void 0) return quantity2;
      }
      return void 0;
    }
    const quantity = readPackageQuantityFromValue(value);
    if (quantity !== void 0) return quantity;
    if (!isRecord(value)) return void 0;
    return readPackageQuantityFromText(Object.values(value).map((item) => String(item)).join(" "));
  }
  function uniqueStrings(values) {
    return [...new Set(values.map((value) => value?.trim()).filter((value) => value !== void 0 && value.length > 0))];
  }
  function readVinmonopoletPrice(text) {
    const match = text.match(/\bKr\s+(\d[\d\s]*(?:,\d{1,2})?)/i);
    if (match?.[1] === void 0) return void 0;
    const amount = parseLocalizedNumber(match[1].replace(/\s/g, ""));
    return Number.isFinite(amount) && amount > 0 ? amount : void 0;
  }
  function readVinmonopoletVolumeMl(text, price) {
    const priceLine = text.match(/\bKr\s+\d[\d\s]*(?:,\d{1,2})?[\s\S]{0,80}/i)?.[0];
    return readVolumeMl(priceLine) ?? readVolumeMl(text) ?? readVolumeMlFromLiterPrice(text, price);
  }
  function readVinmonopoletAlcoholPercent(text) {
    const match = text.match(/\bAlkohol\s+(\d+(?:[,.]\d+)?)\s*%/i);
    if (match?.[1] === void 0) return void 0;
    const amount = parseLocalizedNumber(match[1]);
    return Number.isFinite(amount) && amount > 0 ? amount : void 0;
  }
  function readVolumeMl(text) {
    if (text === void 0) return void 0;
    const match = text.match(/\b(\d+(?:[,.]\d+)?)\s*(ml|cl|l)(?=$|[^A-Za-z])/i);
    if (match === null) return void 0;
    const amount = parseLocalizedNumber(match[1] ?? "");
    const unit = match[2]?.toLowerCase();
    if (!Number.isFinite(amount) || amount <= 0 || unit === void 0) return void 0;
    if (unit === "ml") return amount;
    if (unit === "cl") return amount * 10;
    return amount * 1e3;
  }
  function readVolumeMlFromLiterPrice(text, price) {
    if (price === void 0 || price <= 0) return void 0;
    const unitPrice = readVinmonopoletUnitPricePerLiter(text);
    if (unitPrice === void 0 || unitPrice <= 0) return void 0;
    const volumeMl = Math.round(price / unitPrice * 1e3);
    if (!Number.isFinite(volumeMl) || volumeMl < 20 || volumeMl > 5e3) return void 0;
    const commonVolumeMl = [40, 50, 100, 187, 200, 250, 330, 350, 375, 500, 700, 750, 1e3, 1500, 1750, 2e3, 3e3];
    const closest = commonVolumeMl.reduce((best, candidate) => Math.abs(candidate - volumeMl) < Math.abs(best - volumeMl) ? candidate : best, commonVolumeMl[0] ?? volumeMl);
    return Math.abs(closest - volumeMl) <= Math.max(5, closest * 0.03) ? closest : volumeMl;
  }
  function readVinmonopoletUnitPricePerLiter(text) {
    const match = text.match(/\b(\d[\d\s]*(?:,\d{1,2})?)\s*kr\s*\/\s*l\b/i);
    if (match?.[1] === void 0) return void 0;
    const amount = parseLocalizedNumber(match[1].replace(/\s/g, ""));
    return Number.isFinite(amount) && amount > 0 ? amount : void 0;
  }
  function makeAdChip() {
    const chip = document.createElement("span");
    chip.textContent = "Ad";
    chip.style.cssText = "display:inline-block;font-size:9px;font-weight:600;color:#78909c;border:1px solid #78909c;border-radius:3px;padding:0 3px;margin-right:6px;vertical-align:middle;line-height:14px;";
    return chip;
  }
  function getCodeSourceProvider(codeOffer) {
    if (codeOffer.provider !== "rabattkode") {
      return codeOffer.provider;
    }
    const parsed = parseUrl(codeOffer.sourceUrl) ?? parseUrl(codeOffer.activationUrl);
    const hostname = parsed?.hostname.replace(/^www\./, "").toLowerCase() ?? "";
    if (hostname === "bob.no" || hostname.endsWith(".bob.no")) return "bob";
    if (hostname === "dnb.no" || hostname.endsWith(".dnb.no")) return "dnb";
    if (hostname === "tfbank.no" || hostname.endsWith(".tfbank.no")) return "tfbank";
    return void 0;
  }
  function createProviderBadgeWithActivation(offer, activeOfferKey, shadowRoot) {
    const providerWrap = document.createElement("span");
    providerWrap.className = "provider-wrap";
    const providerBadge = document.createElement("span");
    providerBadge.className = `provider-badge provider-${offer.provider}`;
    providerBadge.textContent = formatProviderName(offer.provider);
    if (isOfferActivated(offer, activeOfferKey)) {
      const activationBadge = document.createElement("span");
      activationBadge.className = "activation-badge";
      activationBadge.setAttribute("aria-label", `${formatProviderName(offer.provider)} cashback er aktivert for ${offer.merchantName}`);
      activationBadge.innerHTML = CHECK_ICON_SVG;
      const activationTooltip = document.createElement("div");
      activationTooltip.className = "status-tooltip";
      activationTooltip.textContent = `${formatProviderName(offer.provider)} cashback er aktivert for ${offer.merchantName}`;
      shadowRoot.append(activationTooltip);
      activationBadge.addEventListener("mouseenter", () => {
        positionStatusTooltipAbovePanel(activationTooltip, activationBadge, shadowRoot);
        activationTooltip.classList.add("visible");
      });
      activationBadge.addEventListener("mouseleave", () => {
        activationTooltip.classList.remove("visible");
      });
      providerWrap.append(activationBadge);
    }
    providerWrap.append(providerBadge);
    return providerWrap;
  }
  function installOfferActivationClickTracker() {
    document.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const link = target.closest("a[href]");
      const hasModifier = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
      const trumfActivationUrl = link !== null && isTrumfLogOfferClickUrl(link.href) ? link.href : void 0;
      const sasActivationUrl = isSasActivationClick(target, link) ? getCurrentSasOfferActivationUrl() : void 0;
      const nettbonusActivationUrl = isNettbonusActivationClick(target, link) ? getCurrentNettbonusOfferActivationUrl() : void 0;
      const spareborsenActivationUrl = isSpareborsenActivationClick(target) ? getCurrentSpareborsenOfferActivationUrl() : void 0;
      const rabbleActivationUrl = isRabbleActivationClick(target) ? getCurrentRabbleOfferActivationUrl() : void 0;
      const provider = trumfActivationUrl !== void 0 ? "trumf" : sasActivationUrl !== void 0 ? "sas" : nettbonusActivationUrl !== void 0 ? "nettbonus" : spareborsenActivationUrl !== void 0 ? "spareborsen" : rabbleActivationUrl !== void 0 ? "rabble" : void 0;
      const activationUrl = trumfActivationUrl ?? sasActivationUrl ?? nettbonusActivationUrl ?? spareborsenActivationUrl ?? rabbleActivationUrl;
      if (provider === void 0 || activationUrl === void 0) {
        return;
      }
      const canWaitForStorageBeforeNavigation = link !== null && (trumfActivationUrl !== void 0 || nettbonusActivationUrl !== void 0 || sasActivationUrl !== void 0 && isSasOutboundActivationUrl(link.href));
      if (link === null || !canWaitForStorageBeforeNavigation) {
        void markOfferActivated(provider, activationUrl);
        return;
      }
      const opensSameTab = link.target === "" || link.target === "_self";
      if (hasModifier || !opensSameTab) {
        void markOfferActivated(provider, activationUrl);
        return;
      }
      event.preventDefault();
      void markOfferActivated(provider, activationUrl).finally(() => {
        window.location.assign(link.href);
      });
    }, true);
  }
  function isOfferActivated(offer, activeOfferKey) {
    const activationKey = getProviderActivationKey(offer.provider, offer.activationUrl || offer.sourceUrl);
    return activationKey !== void 0 && activationKey === activeOfferKey;
  }
  function getLastActivatedOfferKey(offers, activatedOffers) {
    let latestKey;
    let latestActivatedAt = -1;
    for (const offer of offers) {
      const activationKey = getProviderActivationKey(offer.provider, offer.activationUrl || offer.sourceUrl);
      if (activationKey === void 0) {
        continue;
      }
      const activatedAt = activatedOffers[activationKey];
      if (typeof activatedAt === "number" && activatedAt > latestActivatedAt) {
        latestKey = activationKey;
        latestActivatedAt = activatedAt;
      }
    }
    return latestKey;
  }
  async function readActivatedOffers(now = Date.now()) {
    const stored = await getLocalStorageValue(ACTIVATED_OFFERS_STORAGE_KEY);
    const { activations, changed } = pruneStoredActivatedOffers(stored, now);
    if (isRecord(stored) && changed) {
      await setLocalStorageValue(ACTIVATED_OFFERS_STORAGE_KEY, activations);
    }
    return filterActivatedOffersForContext(activations, getCurrentActivationContext());
  }
  async function markOfferActivated(provider, rawUrl, now = Date.now()) {
    const activationKey = getProviderActivationKey(provider, rawUrl);
    if (activationKey === void 0) {
      return;
    }
    const stored = await getLocalStorageValue(ACTIVATED_OFFERS_STORAGE_KEY);
    const { activations } = pruneStoredActivatedOffers(stored, now);
    activations[getActivationStorageKey(getCurrentActivationContext(), activationKey)] = now;
    await setLocalStorageValue(ACTIVATED_OFFERS_STORAGE_KEY, activations);
  }
  function isTrumfLogOfferClickUrl(rawUrl) {
    const parsedUrl = parseUrl(rawUrl);
    if (parsedUrl === void 0) {
      return false;
    }
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    return hostname === "trumfnetthandel.no" && /^\/LogOfferClick\/\d+\/\d+\/?$/.test(parsedUrl.pathname);
  }
  function isSasActivationClick(target, link) {
    if (getCurrentSasOfferActivationUrl() === void 0) {
      return false;
    }
    if (link !== null && isSasOutboundActivationUrl(link.href)) {
      return true;
    }
    const clickable = target.closest("button,a,[role='button']");
    const text = clickable?.textContent?.trim().replace(/\s+/g, " ").toLowerCase();
    return text === "handle nå" || text === "shop now";
  }
  function getCurrentSasOfferActivationUrl() {
    const parsedUrl = parseUrl(window.location.href);
    if (parsedUrl === void 0) {
      return void 0;
    }
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
    if (hostname !== "onlineshopping.flysas.com" || pathParts.length < 4 || pathParts[1]?.toLowerCase() !== "butikker") {
      return void 0;
    }
    const port = parsedUrl.port.length > 0 ? `:${parsedUrl.port}` : "";
    const pathname = parsedUrl.pathname.length > 1 && parsedUrl.pathname.endsWith("/") ? parsedUrl.pathname.slice(0, -1) : parsedUrl.pathname;
    return `${parsedUrl.protocol}//${parsedUrl.hostname}${port}${pathname}`;
  }
  function isSasOutboundActivationUrl(rawUrl) {
    const parsedUrl = parseUrl(rawUrl);
    if (parsedUrl === void 0) {
      return false;
    }
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    return hostname === "go.adt246.net" || hostname.endsWith(".adt246.net") || parsedUrl.searchParams.get("utm_source")?.toLowerCase() === "adtraction" || parsedUrl.searchParams.get("utm_medium")?.toLowerCase() === "affiliate";
  }
  function isNettbonusActivationClick(_target, link) {
    if (getCurrentNettbonusOfferActivationUrl() === void 0) {
      return false;
    }
    if (link === null) {
      return false;
    }
    if (link.href === NETTBONUS_REFERRAL_URL) {
      return false;
    }
    return link.classList.contains("partnerDetailsAction") || link.id === "externalLink";
  }
  const NETTBONUS_REFERRAL_URL = "https://nettbonus.no/r/28698";
  const SPAREBORSEN_REFERRAL_URL = "https://spareborsen.no/ref/cmoxhkl4bhevrnv9d6uo77an5";
  function rewriteNettbonusLoginTriggers() {
    const loginLinks = document.querySelectorAll(
      'a.partnerDetailsAction[id^="loginTriggerOnDetails"]'
    );
    let found = false;
    for (const loginLink of loginLinks) {
      if (loginLink.getAttribute("href") === "/" || loginLink.getAttribute("href") === "") {
        const clone = loginLink.cloneNode(true);
        clone.href = NETTBONUS_REFERRAL_URL;
        clone.target = "_blank";
        clone.removeAttribute("id");
        const adLabel = document.createElement("span");
        adLabel.textContent = "Ad";
        adLabel.style.cssText = "display:inline-block;font-size:10px;font-weight:700;color:#000;background:#fff;border:1px solid #000;border-radius:3px;padding:1px 4px;margin-right:8px;vertical-align:middle;line-height:14px;";
        clone.prepend(adLabel);
        loginLink.replaceWith(clone);
        found = true;
      }
    }
    return found;
  }
  if (getCurrentNettbonusOfferActivationUrl() !== void 0 && !rewriteNettbonusLoginTriggers()) {
    const obs = new MutationObserver(() => {
      if (rewriteNettbonusLoginTriggers()) {
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 1e4);
  }
  if (isOnSpareborsenPartnerPage()) {
    installSpareborsenHandleButtonRewrite();
  }
  function isOnSpareborsenPartnerPage() {
    const parsedUrl = parseUrl(window.location.href);
    if (parsedUrl === void 0) return false;
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    return hostname === "spareborsen.no" && /^\/partnere\/[^/]+/.test(parsedUrl.pathname);
  }
  function installSpareborsenHandleButtonRewrite() {
    let latestRunId = 0;
    const scheduleRewrite = () => {
      latestRunId += 1;
      const runId = latestRunId;
      void rewriteSpareborsenHandleButtonWhenReady(runId, () => runId !== latestRunId);
    };
    scheduleRewrite();
    const observer = new MutationObserver(() => {
      scheduleRewrite();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 15e3);
  }
  async function rewriteSpareborsenHandleButtonWhenReady(_runId, isStale) {
    const state = await waitForSpareborsenAuthState(isStale);
    if (isStale() || state !== "logged-out") {
      return;
    }
    rewriteSpareborsenHandleButton();
  }
  async function waitForSpareborsenAuthState(isStale) {
    const startedAt = Date.now();
    let lastState = "unknown";
    let stableSince = 0;
    while (!isStale() && Date.now() - startedAt < 8e3) {
      const state = getSpareborsenAuthState();
      const ready = isSpareborsenPageReady();
      if (state !== "unknown" && ready) {
        if (state !== lastState) {
          lastState = state;
          stableSince = Date.now();
        }
        if (Date.now() - stableSince >= 400) {
          return state;
        }
      } else {
        lastState = "unknown";
        stableSince = 0;
      }
      await sleep(100);
    }
    return "unknown";
  }
  function getSpareborsenAuthState() {
    const header = document.querySelector("header");
    if (header === null) {
      return "unknown";
    }
    if (header.querySelector('a[href="/dashboard"], a[href="/wallet"], a[href="/dashboard/settings"]') !== null || [...header.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Logg ut")) {
      return "logged-in";
    }
    if (header.querySelector('a[href="/auth/login"], a[href="/auth/register"]') !== null || [...header.querySelectorAll("button")].some((button) => {
      const text = button.textContent?.trim();
      return text === "Logg inn" || text === "Kom i gang";
    })) {
      return "logged-out";
    }
    return "unknown";
  }
  function isSpareborsenPageReady() {
    const lbDot = document.querySelector("#lb-dot");
    if (lbDot !== null && getComputedStyle(lbDot).display !== "none") {
      return true;
    }
    return findSpareborsenHandleButton() !== null;
  }
  function findSpareborsenHandleButton() {
    for (const button of document.querySelectorAll("button")) {
      const text = button.textContent?.replace(/^Ad\s*/i, "").trim() ?? "";
      if (text.startsWith("Handle hos") && text.endsWith("→")) {
        return button;
      }
    }
    return null;
  }
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function rewriteSpareborsenHandleButton() {
    if (getSpareborsenAuthState() !== "logged-out") {
      return false;
    }
    const handleButton = findSpareborsenHandleButton();
    if (handleButton === null || handleButton.closest("a[data-cb-rewrite]") !== null) {
      return false;
    }
    const clone = handleButton.cloneNode(true);
    const link = document.createElement("a");
    link.href = SPAREBORSEN_REFERRAL_URL;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.style.textDecoration = "none";
    link.setAttribute("data-cb-rewrite", "1");
    const adLabel = document.createElement("span");
    adLabel.textContent = "Ad";
    adLabel.style.cssText = "display:inline-block;font-size:10px;font-weight:700;color:#000;background:#fff;border:1px solid #000;border-radius:3px;padding:1px 4px;margin-right:8px;vertical-align:middle;line-height:14px;";
    if (!clone.textContent?.trim().startsWith("Ad")) {
      clone.prepend(adLabel);
    }
    link.append(clone);
    handleButton.replaceWith(link);
    return true;
  }
  function getCurrentNettbonusOfferActivationUrl() {
    const parsedUrl = parseUrl(window.location.href);
    if (parsedUrl === void 0) {
      return void 0;
    }
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    if (hostname !== "nettbonus.no") {
      return void 0;
    }
    if (!/^\/details\/\d+\//.test(parsedUrl.pathname)) {
      return void 0;
    }
    return window.location.href;
  }
  function isSpareborsenActivationClick(target) {
    if (getCurrentSpareborsenOfferActivationUrl() === void 0) {
      return false;
    }
    const clickable = target.closest("button");
    const text = clickable?.textContent?.trim() ?? "";
    return text.startsWith("Handle hos") && text.endsWith("→");
  }
  function getCurrentSpareborsenOfferActivationUrl() {
    const parsedUrl = parseUrl(window.location.href);
    if (parsedUrl === void 0) {
      return void 0;
    }
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    if (hostname !== "spareborsen.no") {
      return void 0;
    }
    if (!/^\/partnere\/[^/]+/.test(parsedUrl.pathname)) {
      return void 0;
    }
    return window.location.href;
  }
  function isRabbleActivationClick(target) {
    if (getCurrentRabbleOfferActivationUrl() === void 0) {
      return false;
    }
    if (document.querySelector('a.ph__link--login-button[href="/login"]') !== null) {
      return false;
    }
    const clickable = target.closest("button,a,[role='button']");
    if (!clickable) return false;
    return clickable.classList.contains("online-cashback-offer-cta-button") || clickable.closest(".online-cashback-offer-cta") !== null;
  }
  function getCurrentRabbleOfferActivationUrl() {
    const parsedUrl = parseUrl(window.location.href);
    if (parsedUrl === void 0) {
      return void 0;
    }
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    if (hostname !== "rabble.no") {
      return void 0;
    }
    if (!/^\/online\/\d+-/.test(parsedUrl.pathname)) {
      return void 0;
    }
    return window.location.href;
  }
  function getProviderActivationKey(provider, rawUrl) {
    const normalizedUrl = normalizeActivationUrl(rawUrl);
    return normalizedUrl === void 0 ? void 0 : `${provider}:${normalizedUrl}`;
  }
  function getCurrentActivationContext() {
    const chromeWithExtension = typeof chrome === "undefined" ? void 0 : chrome;
    return chromeWithExtension?.extension?.inIncognitoContext === true ? "incognito" : "normal";
  }
  function pruneStoredActivatedOffers(value, now) {
    if (!isRecord(value)) {
      return { activations: {}, changed: false };
    }
    const activations = {};
    let changed = false;
    for (const [key, activatedAt] of Object.entries(value)) {
      if (typeof activatedAt === "number" && Number.isFinite(activatedAt) && now - activatedAt >= 0 && now - activatedAt < OFFER_ACTIVATION_TTL_MS) {
        const parsedKey = parseActivationStorageKey(key);
        if (parsedKey === void 0) {
          changed = true;
          continue;
        }
        const storageKey = getActivationStorageKey(parsedKey.context, parsedKey.activationKey);
        activations[storageKey] = Math.max(activations[storageKey] ?? -1, activatedAt);
        if (storageKey !== key) {
          changed = true;
        }
      } else {
        changed = true;
      }
    }
    return { activations, changed };
  }
  function filterActivatedOffersForContext(activations, context) {
    const filtered = {};
    const prefix = `${context}:`;
    for (const [storageKey, activatedAt] of Object.entries(activations)) {
      if (storageKey.startsWith(prefix)) {
        filtered[storageKey.slice(prefix.length)] = activatedAt;
      }
    }
    return filtered;
  }
  function getActivationStorageKey(context, activationKey) {
    return `${context}:${activationKey}`;
  }
  function parseActivationStorageKey(storageKey) {
    if (storageKey.startsWith("normal:")) {
      return { context: "normal", activationKey: storageKey.slice("normal:".length) };
    }
    if (storageKey.startsWith("incognito:")) {
      return { context: "incognito", activationKey: storageKey.slice("incognito:".length) };
    }
    if (storageKey.includes(":")) {
      return { context: "normal", activationKey: storageKey };
    }
    return void 0;
  }
  function normalizeActivationUrl(rawUrl) {
    const parsedUrl = parseUrl(rawUrl);
    if (parsedUrl === void 0 || parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return void 0;
    }
    const protocol = parsedUrl.protocol.toLowerCase();
    const hostname = parsedUrl.hostname.toLowerCase();
    const port = parsedUrl.port.length > 0 ? `:${parsedUrl.port}` : "";
    const pathname = parsedUrl.pathname.length > 1 && parsedUrl.pathname.endsWith("/") ? parsedUrl.pathname.slice(0, -1) : parsedUrl.pathname;
    return `${protocol}//${hostname}${port}${pathname}${parsedUrl.search}`;
  }
  function getLocalStorageValue(key) {
    return new Promise((resolveValue) => {
      chrome.storage.local.get([key], (items) => {
        const value = items[key];
        resolveValue(value);
      });
    });
  }
  function setLocalStorageValue(key, value) {
    return new Promise((resolveValue) => {
      chrome.storage.local.set({ [key]: value }, () => {
        resolveValue();
      });
    });
  }
  function renderNotice(offers, initialCollapsed, initialChipsCollapsed, initialCodesCollapsed, initialPriceMatchCollapsed, initialRegionPricesCollapsed, activatedOffers, priceMatches = [], regionPrices) {
    clearNotice();
    const host = document.createElement("div");
    host.id = HOST_ID;
    applyHostOverlayStyle(host);
    const shadowRoot = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
    :host {
      all: initial;
      background: transparent;
      border: 0;
      bottom: 16px;
      box-sizing: border-box;
      display: block;
      height: 0;
      inset: auto auto 16px 0;
      left: 0;
      margin: 0;
      overflow: visible;
      padding: 0;
      position: fixed;
      width: 0;
      z-index: 2147483647;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    *, *::before, *::after {
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .notice {
      display: flex;
      align-items: flex-end;
      bottom: 16px;
      left: 0;
      max-width: 100vw;
      position: fixed;
      width: max-content;
      z-index: 2147483647;
    }
    .side-tab {
      appearance: none;
      background: #ffffff;
      border: 1px solid #c9d7cf;
      border-left: none;
      border-radius: 0 8px 8px 0;
      box-shadow: 2px 4px 12px rgba(11, 25, 34, 0.12);
      color: #172026;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font: inherit;
      min-height: 40px;
      padding: 8px 5px;
      width: 26px;
      flex-shrink: 0;
      transition: min-height 0.25s ease, padding 0.25s ease;
    }
    .side-tab:hover {
      background: #f7faf8;
    }
    .side-tab-arrow {
      font-size: 16px;
      font-weight: 700;
      line-height: 1;
      display: block;
    }
    .side-tab-text {
      display: none;
      writing-mode: vertical-rl;
      text-orientation: mixed;
      transform: rotate(180deg);
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
      color: #172026;
      letter-spacing: 0.02em;
      margin-top: 6px;
      align-items: center;
      gap: 4px;
    }
    .side-tab-reward {
      color: #172026;
    }
    .side-tab-chip {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 4px;
      border-radius: 4px;
    }
    .notice.collapsed .side-tab {
      min-height: 80px;
      padding: 10px 5px;
    }
    .notice.collapsed .side-tab-arrow {
      display: none;
    }
    .notice.collapsed .side-tab-text {
      display: flex;
    }
    .panel {
      width: min(400px, calc(100vw - 70px));
      max-height: min(80vh, 760px);
      color: #172026;
      background: #ffffff;
      border: 1px solid #c9d7cf;
      border-radius: 8px;
      box-shadow: 0 14px 38px rgba(11, 25, 34, 0.2);
      overflow: hidden auto;
      overscroll-behavior: contain;
      margin-left: 4px;
      transform: translateZ(0);
      transition: width 0.25s ease, opacity 0.25s ease, margin-left 0.25s ease, border-width 0.25s ease;
    }
    .notice.collapsed .panel {
      width: 0;
      opacity: 0;
      margin-left: 0;
      border-width: 0;
      pointer-events: none;
    }
    .notice.no-transition .panel,
    .notice.no-transition .side-tab {
      transition: none;
    }
    .topline {
      height: 4px;
      background: linear-gradient(90deg, #1f8f5f, #f4b942);
    }
    .body {
      display: grid;
      align-content: start;
      gap: 10px;
      padding: 14px 14px 0 14px;
    }
    .header {
      align-items: center;
      display: grid;
      gap: 12px;
      grid-template-columns: 24px minmax(0, 1fr) auto;
      min-height: 32px;
    }
    .sum-input {
      background: #f7faf8;
      border: 1px solid #d8e3de;
      border-radius: 5px;
      color: #172026;
      font-family: inherit;
      font-size: 12px;
      height: 26px;
      outline: none;
      padding: 0 6px;
      text-align: right;
      width: 68px;
    }
    .sum-input:focus {
      border-color: #1f8f5f;
    }
    .sum-input::placeholder {
      color: #8a9a92;
      font-size: 11px;
    }
    .site-icon {
      background: #f7faf8;
      border: 1px solid #d8e3de;
      border-radius: 6px;
      height: 24px;
      object-fit: contain;
      padding: 3px;
      width: 24px;
    }
    .title {
      font-size: 14px;
      font-weight: 700;
      line-height: 1.25;
      margin: 0;
      overflow-wrap: anywhere;
    }
    .offer-list {
      display: grid;
      align-content: start;
      gap: 4px;
    }
    .offer-link.offer-link--best {
      color: #3a7d55;
    }
    .offer-link {
      align-items: center;
      background: #f7faf8;
      border: 1px solid #d8e3de;
      border-radius: 5px;
      color: #172026;
      display: grid;
      font-size: 14px;
      gap: 8px;
      grid-template-columns: minmax(0, 1fr) auto auto;
      padding: 5px 9px;
      text-decoration: none;
    }
    .offer-link .provider-badge {
      grid-column: 3;
    }
    .provider-wrap {
      align-items: center;
      display: inline-flex;
      gap: 5px;
      grid-column: 3;
      justify-content: flex-end;
      min-width: 0;
    }
    .activation-badge {
      align-items: center;
      background: #eaf7ef;
      border: 1px solid #a9d9bd;
      border-radius: 4px;
      color: #166b47;
      display: inline-flex;
      flex-shrink: 0;
      height: 18px;
      justify-content: center;
      line-height: 1;
      width: 18px;
    }
    .activation-badge svg {
      flex-shrink: 0;
      height: 12px;
      width: 12px;
    }
    .offer-label {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      font-size: 14px;
      font-weight: 700;
      gap: 6px;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }
    .provider-badge {
      align-items: center;
      border-radius: 5px;
      display: inline-flex;
      font-size: 11px;
      font-weight: 800;
      line-height: 1;
      min-height: 20px;
      padding: 0 6px;
      white-space: nowrap;
    }
    .provider-remember {
      background: #111111;
      color: #ff9900;
    }
    .provider-klarna {
      background: #ffa8cd;
      color: #0b051d;
    }
    .provider-trumf {
      background: #07006b;
      color: #ffffff;
    }
    .provider-sas {
      background: #00005c;
      color: #ffffff;
    }
    .provider-tfbank {
      background: #e30613;
      color: #ffffff;
    }
    .provider-dnb {
      background: #14555a;
      color: #ffffff;
    }
    .provider-curve {
      background: #000000;
      color: #ffffff;
    }
    .provider-crypto {
      background: #002d74;
      color: #ffffff;
    }
    .provider-rabattkode {
      background: #e74c3c;
      color: #ffffff;
    }
    .provider-norskfamilie {
      background: #ff6600;
      color: #ffffff;
    }
    .provider-revolut {
      background: #0666eb;
      color: #ffffff;
    }
    .provider-norwegian {
      background: #d81939;
      color: #ffffff;
    }
    .provider-logbuy {
      background: #d81939;
      color: #ffffff;
    }
    .provider-obos {
      background: #003087;
      color: #ffffff;
    }
    .provider-bob {
      background: #ffffff;
      border: 1px solid #d3e2dc;
      color: #5b2486;
    }
    .provider-usbl {
      background: #34413e;
      color: #ffffff;
    }
    .provider-bate {
      background: #ffffff;
      border: 1px solid #ef1c24;
      color: #ef1c24;
    }
    .provider-tobb {
      background: #00466b;
      color: #ffffff;
    }
    .provider-naf {
      background: #FFD100;
      color: #000000;
    }
    .provider-tekna {
      background: #ffffff;
      border: 1px solid #d3e2dc;
      color: #00a3ad;
    }
    .provider-nito {
      background: #c8e6b8;
      color: #003b00;
    }
    .provider-prisjakt {
      background: #00a9ce;
      color: #ffffff;
    }
    .provider-godpris {
      background: #21003f;
      color: #ffffff;
    }
    .provider-prisradar {
      background: #ffffff;
      border: 1px solid #d3e2dc;
      color: #0c4598;
    }
    .provider-sesum {
      background: #0f7b55;
      color: #ffffff;
    }
    .provider-enhver {
      background: #ff6b35;
      color: #ffffff;
    }
    .provider-isthereanydeal {
      background: #2d2f42;
      color: #ffffff;
    }
    .provider-gcdeals {
      background: #341083;
      color: #ffffff;
    }
    .provider-psprices {
      background: #2b2927;
      color: #ffffff;
      font-variant-caps: normal;
      text-transform: none;
    }
    .provider-taxfree {
      background: #e3000f;
      color: #ffffff;
    }
    .provider-vinmonopolet {
      background: #dff4eb;
      color: #092f33;
    }
    .provider-region {
      background: #eaf7ef;
      color: #166b47;
    }
    .provider-sparebank1 {
      background: #005aa4;
      color: #ffffff;
    }
    .provider-studentkortet {
      background: #1B2838;
      color: #ffffff;
    }
    .provider-studenttorget {
      background: #009fe3;
      color: #ffffff;
    }
    .provider-nettbonus {
      background: #5b0f8c;
      color: #ffffff;
    }
    .provider-spenn {
      background: #E51454;
      color: #ffffff;
    }
    .provider-spareborsen {
      background: #C9A24A;
      color: #1A1A1A;
    }
    .provider-rabble {
      background: #2d2145;
      color: #f8a6a6;
    }
    .provider-dreams {
      background: #a389d8;
      color: #1a1a1a;
    }
    .provider-utdanningibergen {
      background: #ffffff;
      color: #000000;
      border: 1px solid #ccc;
    }
    .provider-unidays {
      background: #00b140;
      color: #ffffff;
    }
    .provider-cbn {
      background: #f7d7e6;
      color: #8f164f;
    }
    .provider-unio {
      background: #ffffff;
      border: 1px solid #c9b896;
      color: #6b5330;
    }
    .provider-sas-amex {
      background: #00005c;
      color: #ffffff;
    }
    .provider-lunar {
      background: #2bb24c;
      color: #ffffff;
    }
    .copy-code-btn {
      align-items: center;
      color: #1f8f5f;
      cursor: pointer;
      display: inline-flex;
      flex-shrink: 0;
      padding: 4px;
      border-radius: 4px;
      position: relative;
    }
    .copy-code-btn:hover {
      color: #166b47;
    }
    .vote-btn {
      align-items: center;
      color: #b0c8bc;
      cursor: pointer;
      display: inline-flex;
      gap: 3px;
      padding: 4px;
      border-radius: 4px;
      font-size: 11px;
      line-height: 1;
      background: none;
      border: none;
    }
    .vote-btn:hover {
      color: #1f8f5f;
    }
    .vote-btn.voted {
      color: #1f8f5f;
    }
    .vote-btn.downvoted {
      color: #e05555;
    }
    .vote-count {
      font-size: 11px;
      font-weight: 600;
    }
    .add-code-btn {
      align-items: center;
      background: none;
      border: none;
      color: #b0c8bc;
      cursor: pointer;
      display: inline-flex;
      margin-left: auto;
      padding: 2px 4px;
      border-radius: 4px;
      line-height: 1;
    }
    .add-code-btn:hover {
      color: #1f8f5f;
    }
    .add-code-form {
      align-items: center;
      display: flex;
      gap: 6px;
      padding: 2px 0;
    }
    .add-code-form-inner {
      align-items: center;
      background: #f7faf8;
      border: 1px solid #d0dbd5;
      border-radius: 6px;
      display: flex;
      flex: 1;
      gap: 4px;
      min-width: 0;
      padding: 3px 6px;
    }
    .add-code-input {
      background: transparent;
      border: none;
      color: #172026;
      flex: 1;
      font-size: 12px;
      min-width: 0;
      padding: 4px 2px;
      font-family: inherit;
      outline: none;
    }
    .add-reward-input {
      flex: 0 0 48px;
      border-right: 1px solid #d0dbd5;
      padding-right: 6px;
    }
    .add-code-submit {
      align-items: center;
      background: none;
      border: none;
      border-radius: 4px;
      color: #1f8f5f;
      cursor: pointer;
      display: inline-flex;
      padding: 4px;
      flex-shrink: 0;
    }
    .add-code-submit:disabled {
      color: #b0c8bc;
      cursor: default;
    }
    .add-code-cancel {
      align-items: center;
      background: none;
      border: none;
      color: #8a9ba3;
      cursor: pointer;
      display: inline-flex;
      flex-shrink: 0;
      font-size: 14px;
      height: 22px;
      justify-content: center;
      padding: 0;
      width: 22px;
    }
    .add-code-cancel:hover {
      color: #172026;
    }
    .add-code-thanks {
      color: #1f8f5f;
      font-size: 11px;
      margin: 0;
      padding: 4px 0;
    }
    .delete-code-btn {
      align-items: center;
      background: none;
      border: none;
      color: #b0bec5;
      cursor: pointer;
      display: inline-flex;
      padding: 2px 3px;
      border-radius: 4px;
      flex-shrink: 0;
      font-size: 13px;
      line-height: 1;
    }
    .delete-code-btn:hover {
      color: #e05555;
    }
    .expired-section {
      margin-top: 4px;
      padding-top: 4px;
    }
    .expired-toggle {
      align-items: center;
      background: none;
      border: none;
      color: #8a9ba3;
      cursor: pointer;
      display: flex;
      font-size: 11px;
      gap: 4px;
      padding: 2px 0;
      width: 100%;
    }
    .expired-toggle:hover {
      color: #172026;
    }
    .expired-toggle-arrow {
      display: inline-block;
      font-size: 9px;
      transition: transform 0.15s;
    }
    .expired-section.collapsed .expired-toggle-arrow {
      transform: rotate(-90deg);
    }
    .expired-list {
      display: grid;
      gap: 4px;
      margin-top: 4px;
    }
    .expired-section.collapsed .expired-list {
      display: none;
    }
    .code-item.expired {
      opacity: 0.55;
    }
    .copy-code-tooltip {
      background: #1a1a2e;
      border-radius: 6px;
      color: #e0e0e0;
      font-size: 11px;
      font-weight: 400;
      line-height: 1.3;
      padding: 5px 8px;
      pointer-events: none;
      position: fixed;
      white-space: nowrap;
      z-index: 2147483647;
      display: none;
    }
    .copy-code-tooltip.visible {
      display: block;
    }
    .bonus-chips {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .chip-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .chip-group-label {
      color: #8a9a92;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    .chip-group-items {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .bonus-chips-section {
      margin-top: -4px;
      padding: 6px 0 4px;
    }
    .bonus-chips-toggle {
      align-items: center;
      appearance: none;
      background: none;
      border: none;
      color: #8a9a92;
      cursor: pointer;
      display: flex;
      font: inherit;
      font-size: 11px;
      gap: 4px;
      line-height: 1;
      margin-bottom: 5px;
      padding: 0;
    }
    .bonus-chips-toggle:hover {
      color: #4f5f66;
    }
    .bonus-chips-toggle-arrow {
      display: inline-block;
      font-size: 10px;
      transition: transform 0.15s;
    }
    .bonus-chips-section.collapsed .bonus-chips {
      display: none;
    }
    .bonus-chips-section.collapsed,
    .codes-section.collapsed,
    .price-match-section.collapsed {
      padding-bottom: 0;
    }
    .bonus-chips-section.collapsed .bonus-chips-toggle,
    .codes-section.collapsed .codes-toggle,
    .price-match-section.collapsed .price-match-toggle,
    .region-prices-section.collapsed .region-prices-toggle {
      margin-bottom: 0;
    }
    .bonus-chips-section.collapsed .bonus-chips-toggle-arrow {
      transform: rotate(-90deg);
    }
    .codes-section {
      margin-top: -4px;
      padding: 6px 0 4px;
    }
    .codes-toggle {
      align-items: center;
      appearance: none;
      background: none;
      border: none;
      color: #8a9a92;
      cursor: pointer;
      display: flex;
      font: inherit;
      font-size: 11px;
      gap: 4px;
      line-height: 1;
      margin-bottom: 5px;
      padding: 0;
      width: 100%;
    }
    .codes-toggle:hover {
      color: #4f5f66;
    }
    .codes-toggle-arrow {
      display: inline-block;
      font-size: 10px;
      transition: transform 0.15s;
    }
    .codes-section.collapsed .codes-list {
      display: none;
    }
    .codes-section.collapsed .expired-section {
      display: none !important;
    }
    .codes-section.collapsed .codes-toggle-arrow {
      transform: rotate(-90deg);
    }
    .price-match-section,
    .region-prices-section {
      margin-top: -4px;
      padding: 6px 0 4px;
    }
    .price-match-toggle,
    .region-prices-toggle {
      align-items: center;
      appearance: none;
      background: none;
      border: none;
      color: #8a9a92;
      cursor: pointer;
      display: flex;
      font: inherit;
      font-size: 11px;
      gap: 4px;
      line-height: 1;
      margin-bottom: 5px;
      padding: 0;
      width: 100%;
    }
    .price-match-toggle:hover,
    .region-prices-toggle:hover {
      color: #4f5f66;
    }
    .price-match-toggle-arrow,
    .region-prices-toggle-arrow {
      display: inline-block;
      font-size: 10px;
      transition: transform 0.15s;
    }
    .price-match-section.collapsed .price-match-card {
      display: none;
    }
    .region-prices-section.collapsed .region-price-card {
      display: none;
    }
    .price-match-section.collapsed .price-match-toggle-arrow,
    .region-prices-section.collapsed .region-prices-toggle-arrow {
      transform: rotate(-90deg);
    }
    .price-match-card,
    .region-price-card {
      align-items: center;
      background: #f7faf8;
      border: 1px solid #d8e3de;
      border-radius: 5px;
      color: #172026;
      display: grid;
      font-size: 12px;
      gap: 8px;
      grid-template-columns: minmax(0, 1fr) auto auto;
      padding: 6px 9px;
      text-decoration: none;
    }
    .region-price-card {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .region-price-card-with-action {
      grid-template-columns: minmax(0, 1fr) auto auto;
    }
    .region-price-main {
      color: inherit;
      display: contents;
      text-decoration: none;
    }
    .region-price-action {
      justify-self: end;
      text-decoration: none;
      white-space: nowrap;
    }
    .price-match-card.price-match-card--best .price-match-product,
    .price-match-card.price-match-card--best .price-match-price,
    .region-price-card.region-price-card--best .region-price-country,
    .region-price-card.region-price-card--best .region-price-nok {
      color: #3a7d55;
    }
    .price-match-card + .price-match-card,
    .region-price-card + .region-price-card {
      margin-top: 4px;
    }
    .price-match-title,
    .region-price-title {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .price-match-product,
    .region-price-country {
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .price-match-shop,
    .region-price-native {
      color: #5d6b71;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .price-match-price,
    .region-price-nok {
      color: #172026;
      font-weight: 800;
      white-space: nowrap;
    }
    .codes-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .code-item-row {
      align-items: center;
      display: flex;
      gap: 6px;
    }
    .code-item {
      align-items: center;
      background: #f7faf8;
      border: 1px solid #d8e3de;
      border-radius: 5px;
      display: flex;
      flex: 1;
      font-size: 12px;
      gap: 6px;
      min-width: 0;
      padding: 5px 9px;
    }
    .code-reward {
      font-weight: 700;
      white-space: nowrap;
    }
    .code-item-row--best .code-reward,
    .code-item-row--best .code-value {
      color: #3a7d55;
    }
    .code-value {
      color: #5d6b71;
      font-family: monospace;
      font-size: 11px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .code-copy-group {
      align-items: center;
      display: inline-flex;
      flex: 1 1 auto;
      gap: 4px;
      min-width: 0;
    }
    .code-source-badge {
      flex-shrink: 0;
      font-size: 11px;
      min-height: 22px;
      text-decoration: none;
    }
    .bonus-chip {
      align-items: center;
      background: #f0f4f2;
      border: 1px solid #d8e3de;
      border-radius: 20px;
      color: #172026;
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 600;
      gap: 4px;
      line-height: 1;
      padding: 5px 10px;
      text-decoration: none;
      white-space: nowrap;
    }
    .bonus-chip:hover {
      background: #e4ebe7;
    }
    .bonus-chip--best {
      color: #3a7d55;
    }
    .bonus-chip-label {
      font-weight: 800;
    }
    .bonus-chip .provider-badge {
      font-size: 9px;
      min-height: 16px;
      padding: 0 5px;
    }
    .bonus-chip-tooltip {
      background: #1a1a2e;
      border-radius: 8px;
      color: #e0e0e0;
      font-size: 11px;
      font-weight: 400;
      line-height: 1.5;
      max-width: 320px;
      padding: 8px 10px;
      pointer-events: none;
      position: fixed;
      white-space: pre-line;
      width: max-content;
      z-index: 2147483647;
      display: none;
    }
    .bonus-chip-tooltip.visible {
      display: block;
    }
    .offer-link-wrapper {
      position: relative;
    }
    .card-only-warn {
      color: #b0bec5;
      cursor: help;
      font-size: 11px;
      line-height: 1;
      user-select: none;
    }
    .app-chip {
      display: inline-block;
      font-size: 9px;
      font-weight: 600;
      color: #78909c;
      border: 1px solid #78909c;
      border-radius: 3px;
      padding: 0 3px;
      margin-right: 4px;
      vertical-align: middle;
      line-height: 14px;
      white-space: nowrap;
      cursor: help;
    }
    .offer-tooltip {
      background: #1a1a2e;
      border-radius: 8px;
      color: #e0e0e0;
      display: none;
      font-size: 11px;
      font-weight: 400;
      line-height: 1.5;
      max-width: 320px;
      padding: 8px 10px;
      pointer-events: none;
      position: fixed;
      white-space: normal;
      width: max-content;
      z-index: 2147483647;
    }
    .offer-tooltip-section + .offer-tooltip-section {
      margin-top: 8px;
    }
    .offer-tooltip-section + .offer-tooltip-section:has(.offer-tooltip-list) {
      margin-top: 14px;
    }
    .offer-tooltip-title {
      display: block;
      font-weight: 700;
      margin-bottom: 5px;
    }
    .offer-tooltip-text {
      display: block;
      white-space: pre-line;
    }
    .offer-tooltip-list {
      display: grid;
      gap: 4px;
      list-style: disc;
      margin: 0;
      padding-left: 16px;
    }
    .offer-tooltip-list li {
      padding-left: 2px;
    }
    .offer-tooltip.visible {
      display: block;
    }
    .support {
      padding: 6px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .support a {
      color: #8a9a92;
      font-size: 11px;
      line-height: 1.35;
      text-decoration: none;
    }
    .support a:hover {
      color: #4f5f66;
      text-decoration: underline;
    }
    .support-logo {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      flex-shrink: 0;
      opacity: 0.7;
    }
    .support-logo:hover {
      opacity: 1;
    }
    .conflict-warning {
      color: #d4830a;
      cursor: help;
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
      margin-left: 4px;
      vertical-align: middle;
    }
    .status-tooltip {
      background: #1a1a2e;
      border-radius: 8px;
      color: #e0e0e0;
      display: none;
      font-size: 11px;
      font-weight: 400;
      line-height: 1.5;
      max-width: 280px;
      padding: 8px 10px;
      pointer-events: none;
      position: fixed;
      white-space: pre-line;
      width: max-content;
      z-index: 2147483647;
    }
    .status-tooltip.visible {
      display: block;
    }
  `;
    const mainOffers = offers.filter((o) => o.provider !== "curve" && o.provider !== "rabattkode" && o.provider !== "dnb" && o.provider !== "tfbank");
    const activeOfferKey = getLastActivatedOfferKey(mainOffers, activatedOffers);
    const priceMatch = priceMatches[0];
    const bestRegionPrice = regionPrices?.prices[0];
    const curveOffer = offers.find((o) => o.provider === "curve");
    const CARD_ONLY_PROVIDERS = /* @__PURE__ */ new Set(["sparebank1", "remember", "tfbank"]);
    const APP_ONLY_PROVIDERS = /* @__PURE__ */ new Set(["klarna", "spenn", "dreams"]);
    const CRYPTO_SUBSCRIPTIONS = {
      "spotify.com": "Spotify",
      "netflix.com": "Netflix",
      "truthsocial.com": "Truth+"
    };
    const currentHost = window.location.hostname.replace(/^www\./, "").toLowerCase();
    const cryptoSubEntry = Object.entries(CRYPTO_SUBSCRIPTIONS).find(([d]) => currentHost === d || currentHost.endsWith(`.${d}`));
    const cryptoSub = cryptoSubEntry?.[1];
    const codeOffers = offers.filter((o) => o.provider === "rabattkode" || o.discountCode !== void 0 && o.discountCode.length > 0);
    const offer = mainOffers[0];
    if (offer === void 0 && codeOffers.length === 0 && priceMatch === void 0 && bestRegionPrice === void 0) {
      return;
    }
    const primaryOffer = offer ?? codeOffers[0];
    if (primaryOffer === void 0 && priceMatch === void 0 && bestRegionPrice === void 0) {
      return;
    }
    const notice = document.createElement("section");
    notice.className = "notice";
    const sideTabProvider = offer?.provider ?? (primaryOffer !== void 0 ? getCodeSourceProvider(primaryOffer) : void 0) ?? (priceMatch !== void 0 ? getPriceMatchProviderClass(priceMatch) : "region");
    const sideTab = document.createElement("button");
    sideTab.className = `side-tab side-tab-${sideTabProvider}`;
    sideTab.type = "button";
    sideTab.setAttribute("aria-label", "Collapse cashback offers");
    const sideTabArrow = document.createElement("span");
    sideTabArrow.className = "side-tab-arrow";
    sideTabArrow.textContent = "‹";
    const sideTabText = document.createElement("span");
    sideTabText.className = "side-tab-text";
    if (offer !== void 0) {
      const rewardSpan = document.createElement("span");
      rewardSpan.className = "side-tab-reward";
      rewardSpan.textContent = formatCompactRewardLabel(offer) ?? formatRewardLabel(offer.reward, offer.provider);
      const chipSpan = document.createElement("span");
      chipSpan.className = `side-tab-chip provider-${offer.provider}`;
      chipSpan.textContent = formatProviderName(offer.provider);
      sideTabText.append(rewardSpan, chipSpan);
    } else if (primaryOffer !== void 0) {
      const rewardSpan = document.createElement("span");
      rewardSpan.className = "side-tab-reward";
      rewardSpan.textContent = formatCompactRewardLabel(primaryOffer) ?? primaryOffer.reward;
      sideTabText.append(rewardSpan);
      const codeProvider = getCodeSourceProvider(primaryOffer);
      if (codeProvider !== void 0) {
        const chipSpan = document.createElement("span");
        chipSpan.className = `side-tab-chip provider-${codeProvider}`;
        chipSpan.textContent = formatProviderName(codeProvider);
        sideTabText.append(chipSpan);
      }
    } else if (priceMatch !== void 0) {
      const rewardSpan = document.createElement("span");
      rewardSpan.className = "side-tab-reward";
      rewardSpan.textContent = priceMatch.price;
      const chipSpan = document.createElement("span");
      chipSpan.className = `side-tab-chip provider-${getPriceMatchProviderClass(priceMatch)}`;
      chipSpan.textContent = getPriceMatchSourceName(priceMatch);
      sideTabText.append(rewardSpan, chipSpan);
    } else if (bestRegionPrice !== void 0) {
      const rewardSpan = document.createElement("span");
      rewardSpan.className = "side-tab-reward";
      rewardSpan.textContent = bestRegionPrice.formattedNok;
      const chipSpan = document.createElement("span");
      chipSpan.className = "side-tab-chip provider-region";
      chipSpan.textContent = `${bestRegionPrice.flag} Region`;
      sideTabText.append(rewardSpan, chipSpan);
    }
    sideTab.append(sideTabArrow, sideTabText);
    sideTab.addEventListener("click", () => {
      const isCollapsed = notice.classList.contains("collapsed");
      setCollapsed(notice, sideTab, sideTabArrow, !isCollapsed);
    });
    const panel = document.createElement("div");
    panel.className = "panel";
    const topLine = document.createElement("div");
    topLine.className = "topline";
    const body = document.createElement("div");
    body.className = "body";
    const header = document.createElement("div");
    header.className = "header";
    const siteIcon = createSiteIcon();
    const title = document.createElement("p");
    title.className = "title";
    title.textContent = offer !== void 0 ? `${formatOfferTitlePrefix(offer)} hos ${offer.merchantName}` : primaryOffer !== void 0 ? `Rabattkode hos ${primaryOffer.merchantName}` : priceMatch !== void 0 ? `Prismatch hos ${priceMatch.shopName}` : "Regionpriser";
    header.append(siteIcon, title);
    const sumInput = document.createElement("input");
    sumInput.className = "sum-input";
    sumInput.type = "text";
    sumInput.inputMode = "decimal";
    sumInput.placeholder = "Sum";
    sumInput.addEventListener("keydown", (e) => {
      if (e.key.length === 1 && !/[0-9.,]/.test(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault();
    });
    if (mainOffers.length > 0) {
      header.append(sumInput);
    }
    const rewardLabels = [];
    const tooltipElements = [];
    const offerList = document.createElement("div");
    offerList.className = "offer-list";
    for (const [offerIdx, currentOffer] of mainOffers.entries()) {
      const wrapper = document.createElement("div");
      wrapper.className = "offer-link-wrapper";
      const offerLink = document.createElement("a");
      const isBestOffer = offerIdx === 0;
      offerLink.className = isBestOffer ? "offer-link offer-link--best" : "offer-link";
      offerLink.href = currentOffer.provider === "trumf" || currentOffer.provider === "klarna" ? currentOffer.sourceUrl : currentOffer.activationUrl;
      offerLink.target = "_blank";
      offerLink.rel = "noreferrer";
      const offerLabel = document.createElement("span");
      offerLabel.className = "offer-label";
      const offerReward = document.createElement("span");
      offerReward.textContent = formatRewardLabel(currentOffer.reward, currentOffer.provider);
      rewardLabels.push({ element: offerReward, offer: currentOffer });
      const providerWrap = createProviderBadgeWithActivation(currentOffer, activeOfferKey, shadowRoot);
      if (currentOffer.provider === "nettbonus" || currentOffer.provider === "spareborsen") {
        const adChip = makeAdChip();
        providerWrap.prepend(adChip);
      }
      offerLabel.append(offerReward);
      if (currentOffer.discountCode !== void 0) {
        const code = currentOffer.discountCode;
        const copyBtn = document.createElement("span");
        copyBtn.className = "copy-code-btn";
        copyBtn.innerHTML = COPY_ICON_SVG;
        const copyTooltip = document.createElement("div");
        copyTooltip.className = "copy-code-tooltip";
        copyTooltip.textContent = `Kopier rabattkode: ${code}`;
        shadowRoot.append(copyTooltip);
        copyBtn.addEventListener("mouseenter", () => {
          const rect = copyBtn.getBoundingClientRect();
          copyTooltip.style.left = `${rect.left + rect.width / 2}px`;
          copyTooltip.style.top = `${rect.top - 30}px`;
          copyTooltip.style.transform = "translateX(-50%)";
          copyTooltip.classList.add("visible");
        });
        copyBtn.addEventListener("mouseleave", () => {
          copyTooltip.classList.remove("visible");
        });
        copyBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          navigator.clipboard.writeText(code).then(() => {
            copyBtn.innerHTML = CHECK_ICON_SVG;
            copyTooltip.textContent = "Kopiert!";
            copyTooltip.classList.add("visible");
            setTimeout(() => {
              copyBtn.innerHTML = COPY_ICON_SVG;
              copyTooltip.textContent = `Kopier rabattkode: ${code}`;
              copyTooltip.classList.remove("visible");
            }, 1500);
          });
        });
        offerLink.append(offerLabel, copyBtn, providerWrap);
      } else if (CARD_ONLY_PROVIDERS.has(currentOffer.provider)) {
        const warnIcon = document.createElement("span");
        warnIcon.className = "card-only-warn";
        warnIcon.textContent = "⚠";
        offerLink.append(offerLabel, warnIcon, providerWrap);
      } else if (APP_ONLY_PROVIDERS.has(currentOffer.provider)) {
        const appChip = document.createElement("span");
        appChip.className = "app-chip";
        appChip.textContent = "App";
        offerLink.append(offerLabel, appChip, providerWrap);
      } else {
        offerLink.append(offerLabel, providerWrap);
      }
      wrapper.append(offerLink);
      offerList.append(wrapper);
    }
    sumInput.addEventListener("input", () => {
      const raw = sumInput.value.replace(/[^0-9.,]/g, "").replace(",", ".");
      const amount = raw.length > 0 ? Number.parseFloat(raw) : 0;
      for (const el of shadowRoot.querySelectorAll(".code-reward[data-pct]")) {
        const pct = parseFloat(el.dataset.pct ?? "0");
        if (!el.dataset.origReward) el.dataset.origReward = el.textContent ?? "";
        const orig = el.dataset.origReward;
        if (pct > 0 && amount > 0) {
          el.textContent = `${Math.round(amount * pct / 100)} kr`;
        } else {
          el.textContent = orig;
        }
      }
      for (const { element, offer: offer2 } of rewardLabels) {
        if (amount > 0) {
          const result = calculateCashback(offer2, amount);
          element.textContent = result !== "" ? result : formatRewardLabel(offer2.reward, offer2.provider);
        } else {
          element.textContent = formatRewardLabel(offer2.reward, offer2.provider);
        }
      }
      for (const { element, offer: offer2 } of tooltipElements) {
        const fullReward = formatRewardLabel(offer2.reward, offer2.provider);
        const compact = formatCompactRewardLabel(offer2);
        compact !== void 0 && fullReward !== compact && !fullReward.startsWith(compact);
        const breakdown = amount > 0 ? formatBreakdownWithAmounts(offer2.terms, amount) : offer2.terms;
        const parts = [];
        if (breakdown) parts.push(breakdown);
        setTooltipContent(element, parts);
      }
      for (const { element, pct, minPct, maxPct, ebPer100kr, approx, defaultText } of bonusChipLabels) {
        if (amount > 0 && minPct != null && maxPct != null) {
          element.textContent = `+${formatKr(amount * minPct / 100)}-${formatKr(amount * maxPct / 100)} kr`;
        } else if (amount > 0) {
          const kr = formatKr(amount * pct / 100);
          if (ebPer100kr != null) {
            const eb = Math.round(amount * ebPer100kr / 100);
            element.textContent = `+~${kr} kr (~${eb} EB)`;
          } else {
            element.textContent = `+${approx ? "~" : ""}${kr} kr`;
          }
        } else {
          element.textContent = defaultText;
        }
      }
      chipsToggleText.textContent = "Ekstra cashback";
    });
    const bonusChipLabels = [];
    const bonusChips = document.createElement("div");
    bonusChips.className = "bonus-chips";
    const freeGroup = document.createElement("div");
    freeGroup.className = "chip-group";
    const freeLabel = document.createElement("span");
    freeLabel.className = "chip-group-label";
    freeLabel.textContent = "Gratis";
    const freeItems = document.createElement("div");
    freeItems.className = "chip-group-items";
    freeGroup.append(freeLabel, freeItems);
    function createBonusChip(card, overrideUrl) {
      const chip = document.createElement("a");
      chip.className = "bonus-chip";
      chip.href = overrideUrl ?? card.url;
      chip.target = "_blank";
      chip.rel = "noreferrer";
      const label = document.createElement("span");
      label.className = "bonus-chip-label";
      const ebInfo = card.ebPer100kr ? ` (~${card.ebPer100kr} EB/100kr)` : "";
      const pctStr = card.minPct != null && card.maxPct != null ? `${(card.minPct * 100).toFixed(2).replace(".", ",").replace(/0$/, "")}-${(card.maxPct * 100).toFixed(2).replace(".", ",").replace(/0$/, "")}` : (card.pct * 100).toFixed(2).replace(".", ",").replace(/0$/, "");
      label.textContent = `+${card.approx ? "~" : ""}${pctStr} %${ebInfo}`;
      const badge = document.createElement("span");
      badge.className = `provider-badge provider-${card.badge}`;
      badge.textContent = card.label;
      chip.append(label, badge);
      return { chip, label };
    }
    const firstOfferIsCardOnly = mainOffers.length > 0 && CARD_ONLY_PROVIDERS.has(mainOffers[0].provider);
    for (const [cardIdx, card] of FREE_CARDS.entries()) {
      const { chip, label } = createBonusChip(card);
      if (cardIdx === 0 && !firstOfferIsCardOnly) chip.classList.add("bonus-chip--best");
      bonusChipLabels.push({ element: label, pct: card.pct * 100, ...card.minPct != null ? { minPct: card.minPct * 100 } : {}, ...card.maxPct != null ? { maxPct: card.maxPct * 100 } : {}, ...card.ebPer100kr !== void 0 ? { ebPer100kr: card.ebPer100kr } : {}, approx: card.approx, defaultText: label.textContent ?? "" });
      freeItems.append(chip);
      addChipTooltip(chip, card.tip, shadowRoot);
    }
    bonusChips.append(freeGroup);
    const premiumGroup = document.createElement("div");
    premiumGroup.className = "chip-group";
    const premiumLabel = document.createElement("span");
    premiumLabel.className = "chip-group-label";
    premiumLabel.textContent = "Premium";
    const premiumItems = document.createElement("div");
    premiumItems.className = "chip-group-items";
    premiumGroup.append(premiumLabel, premiumItems);
    const currentHostname = window.location.hostname.replace(/^www\./, "").toLowerCase();
    const revolutSub = REVOLUT_SUBSCRIPTIONS[currentHostname];
    if (revolutSub !== void 0) {
      const revolutChip = document.createElement("a");
      revolutChip.className = "bonus-chip";
      revolutChip.href = "https://revolut.com/referrals?r=FELPJK";
      revolutChip.target = "_blank";
      revolutChip.rel = "noreferrer";
      const revolutLabel = document.createElement("span");
      revolutLabel.className = "bonus-chip-label";
      revolutLabel.textContent = "Inkludert";
      const revolutBadge = document.createElement("span");
      revolutBadge.className = "provider-badge provider-revolut";
      revolutBadge.textContent = "Revolut";
      revolutChip.append(revolutLabel, revolutBadge);
      premiumItems.append(revolutChip);
      addChipTooltip(revolutChip, `${revolutSub}
Inkludert i Premium (95 kr/mnd), Metal (170 kr/mnd) eller Ultra (700 kr/mnd)`, shadowRoot);
    }
    for (const card of PREMIUM_CARDS) {
      if (card.label === "Curve") continue;
      if (card.label === "Crypto" && cryptoSub !== void 0) continue;
      const { chip, label } = createBonusChip(card);
      if (card.label === "Crypto") {
        const badge = chip.querySelector(".provider-badge");
        const wrapper = document.createElement("span");
        wrapper.style.cssText = "display:inline-flex;align-items:center;gap:4px;";
        badge.replaceWith(wrapper);
        wrapper.append(makeAdChip(), badge);
      }
      bonusChipLabels.push({ element: label, pct: card.pct * 100, ...card.minPct != null ? { minPct: card.minPct * 100 } : {}, ...card.maxPct != null ? { maxPct: card.maxPct * 100 } : {}, approx: card.approx, defaultText: label.textContent ?? "" });
      premiumItems.append(chip);
      addChipTooltip(chip, card.tip, shadowRoot);
    }
    bonusChips.append(premiumGroup);
    const selectedGroup = document.createElement("div");
    selectedGroup.className = "chip-group";
    const selectedLabel = document.createElement("span");
    selectedLabel.className = "chip-group-label";
    selectedLabel.textContent = "Premium for enkelte butikker";
    const selectedItems = document.createElement("div");
    selectedItems.className = "chip-group-items";
    selectedGroup.append(selectedLabel, selectedItems);
    let hasSelectedItems = false;
    if (curveOffer !== void 0) {
      const curveCard = PREMIUM_CARDS.find((c) => c.label === "Curve");
      const { chip, label } = createBonusChip(curveCard, curveOffer.activationUrl);
      const badge = chip.querySelector(".provider-badge");
      const wrapper = document.createElement("span");
      wrapper.style.cssText = "display:inline-flex;align-items:center;gap:4px;";
      badge.replaceWith(wrapper);
      wrapper.append(makeAdChip(), badge);
      bonusChipLabels.push({ element: label, pct: curveCard.pct * 100, approx: curveCard.approx, defaultText: label.textContent ?? "" });
      addChipTooltip(chip, curveCard.tip, shadowRoot);
      selectedItems.append(chip);
      hasSelectedItems = true;
    }
    if (cryptoSub !== void 0) {
      const cryptoChip = document.createElement("a");
      cryptoChip.className = "bonus-chip";
      cryptoChip.href = "https://crypto.com/app/ns3fma5hou";
      cryptoChip.target = "_blank";
      cryptoChip.rel = "noreferrer";
      const cryptoChipLabel = document.createElement("span");
      cryptoChipLabel.className = "bonus-chip-label";
      cryptoChipLabel.textContent = "3-6 mnd gratis";
      const cryptoBadge = document.createElement("span");
      cryptoBadge.className = "provider-badge provider-crypto";
      cryptoBadge.textContent = "Crypto";
      cryptoChip.append(cryptoChipLabel, cryptoBadge);
      const cryptoAdWrapper = document.createElement("span");
      cryptoAdWrapper.style.cssText = "display:inline-flex;align-items:center;gap:4px;";
      cryptoBadge.replaceWith(cryptoAdWrapper);
      cryptoAdWrapper.append(makeAdChip(), cryptoBadge);
      addChipTooltip(cryptoChip, `Crypto.com Visa-kort.
Jade/Obsidian: 6 mnd gratis ${cryptoSub}
Platin: 3 mnd gratis ${cryptoSub}`, shadowRoot);
      selectedItems.append(cryptoChip);
      hasSelectedItems = true;
    }
    if (hasSelectedItems) bonusChips.append(selectedGroup);
    const chipsSection = document.createElement("div");
    chipsSection.className = "bonus-chips-section";
    if (initialChipsCollapsed) {
      chipsSection.classList.add("collapsed");
    }
    const chipsToggle = document.createElement("button");
    chipsToggle.className = "bonus-chips-toggle";
    chipsToggle.type = "button";
    const chipsToggleArrow = document.createElement("span");
    chipsToggleArrow.className = "bonus-chips-toggle-arrow";
    chipsToggleArrow.textContent = "▼";
    const chipsToggleText = document.createElement("span");
    chipsToggleText.textContent = "Ekstra cashback";
    chipsToggle.append(chipsToggleArrow, chipsToggleText);
    chipsToggle.addEventListener("click", () => {
      const isCollapsed = chipsSection.classList.toggle("collapsed");
      chrome.storage.local.set({ [CHIPS_COLLAPSED_KEY]: isCollapsed });
    });
    chipsSection.append(chipsToggle, bonusChips);
    const codesSection = document.createElement("div");
    codesSection.className = "codes-section";
    if (initialCodesCollapsed && codeOffers.length > 0) {
      codesSection.classList.add("collapsed");
    }
    const codesToggle = document.createElement("button");
    codesToggle.className = "codes-toggle";
    codesToggle.type = "button";
    const codesToggleArrow = document.createElement("span");
    codesToggleArrow.className = "codes-toggle-arrow";
    codesToggleArrow.textContent = "▼";
    const codesToggleText = document.createElement("span");
    codesToggleText.textContent = "Rabattkoder";
    const addCodeBtn = document.createElement("button");
    addCodeBtn.className = "add-code-btn";
    addCodeBtn.type = "button";
    addCodeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    const addCodeTooltip = document.createElement("div");
    addCodeTooltip.className = "copy-code-tooltip";
    addCodeTooltip.textContent = "Legg til rabattkode";
    shadowRoot.append(addCodeTooltip);
    addCodeBtn.addEventListener("mouseenter", () => {
      const rect = addCodeBtn.getBoundingClientRect();
      addCodeTooltip.style.left = `${rect.left + rect.width / 2}px`;
      addCodeTooltip.style.top = `${rect.top - 30}px`;
      addCodeTooltip.style.transform = "translateX(-50%)";
      shadowRoot.append(addCodeTooltip);
      addCodeTooltip.classList.add("visible");
    });
    addCodeBtn.addEventListener("mouseleave", () => {
      addCodeTooltip.classList.remove("visible");
    });
    codesToggle.append(codesToggleArrow, codesToggleText, addCodeBtn);
    codesToggle.addEventListener("click", (e) => {
      if (addCodeBtn.contains(e.target)) return;
      const isCollapsed = codesSection.classList.toggle("collapsed");
      chrome.storage.local.set({ [CODES_COLLAPSED_KEY]: isCollapsed });
      if (!isCollapsed) loadDbCodes();
    });
    const codesList = document.createElement("div");
    codesList.className = "codes-list";
    const addCodeForm = document.createElement("div");
    addCodeForm.className = "add-code-form";
    addCodeForm.style.display = "none";
    const addRewardInput = document.createElement("input");
    addRewardInput.className = "add-code-input add-reward-input";
    addRewardInput.type = "number";
    addRewardInput.placeholder = "%";
    addRewardInput.min = "0";
    addRewardInput.max = "100";
    const addCodeInput = document.createElement("input");
    addCodeInput.className = "add-code-input";
    addCodeInput.type = "text";
    addCodeInput.placeholder = "Kode";
    addCodeInput.maxLength = 30;
    const addCodeSubmit = document.createElement("button");
    addCodeSubmit.className = "add-code-submit";
    addCodeSubmit.type = "button";
    addCodeSubmit.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    addCodeSubmit.disabled = true;
    const addCodeCancel = document.createElement("button");
    addCodeCancel.className = "add-code-cancel";
    addCodeCancel.type = "button";
    addCodeCancel.textContent = "✕";
    const addCodeFormInner = document.createElement("div");
    addCodeFormInner.className = "add-code-form-inner";
    addCodeFormInner.append(addRewardInput, addCodeInput, addCodeSubmit, addCodeCancel);
    addCodeForm.append(addCodeFormInner);
    const updateSubmitState = () => {
      addCodeSubmit.disabled = addCodeInput.value.trim().length === 0 || addRewardInput.value.trim().length === 0;
    };
    addCodeInput.addEventListener("input", updateSubmitState);
    addRewardInput.addEventListener("input", () => {
      addRewardInput.value = addRewardInput.value.replace(/[^0-9]/g, "").replace(/^0+(\d)/, "$1");
      const v = Number(addRewardInput.value);
      if (addRewardInput.value !== "" && v > 100) addRewardInput.value = "100";
      updateSubmitState();
    });
    const closeAddForm = () => {
      addCodeForm.style.display = "none";
      addCodeInput.value = "";
      addRewardInput.value = "";
      addCodeSubmit.disabled = true;
    };
    const parseRewardNum = (r) => parseFloat(r.replace(",", ".")) || 0;
    const createCodeValueGroup = (code) => {
      const group = document.createElement("span");
      group.className = "code-copy-group";
      const codeSpan = document.createElement("span");
      codeSpan.className = "code-value";
      codeSpan.textContent = code;
      const copyBtn = document.createElement("span");
      copyBtn.className = "copy-code-btn";
      copyBtn.innerHTML = COPY_ICON_SVG;
      const copyTooltip = document.createElement("div");
      copyTooltip.className = "copy-code-tooltip";
      copyTooltip.textContent = `Kopier rabattkode: ${code}`;
      shadowRoot.append(copyTooltip);
      copyBtn.addEventListener("mouseenter", () => {
        const rect = copyBtn.getBoundingClientRect();
        copyTooltip.style.left = `${rect.left + rect.width / 2}px`;
        copyTooltip.style.top = `${rect.top - 30}px`;
        copyTooltip.style.transform = "translateX(-50%)";
        shadowRoot.append(copyTooltip);
        copyTooltip.classList.add("visible");
      });
      copyBtn.addEventListener("mouseleave", () => {
        copyTooltip.classList.remove("visible");
      });
      copyBtn.addEventListener("click", () => {
        void navigator.clipboard.writeText(code).then(() => {
          copyBtn.innerHTML = CHECK_ICON_SVG;
          copyTooltip.textContent = "Kopiert!";
          copyTooltip.classList.add("visible");
          setTimeout(() => {
            copyBtn.innerHTML = COPY_ICON_SVG;
            copyTooltip.textContent = `Kopier rabattkode: ${code}`;
            copyTooltip.classList.remove("visible");
          }, 1500);
        });
      });
      group.append(codeSpan, copyBtn);
      return { group, codeSpan, copyBtn };
    };
    const resortCodesList = () => {
      const rows = [...codesList.querySelectorAll(".code-item-row")];
      rows.sort((a, b) => {
        const pa = parseFloat(a.querySelector(".code-reward")?.dataset.pct ?? "0") || 0;
        const pb = parseFloat(b.querySelector(".code-reward")?.dataset.pct ?? "0") || 0;
        return pb - pa;
      });
      for (const row of rows) {
        row.classList.remove("code-item-row--best");
        codesList.append(row);
      }
      if (rows[0]) rows[0].classList.add("code-item-row--best");
      codesList.prepend(addCodeForm);
    };
    const submitCode = () => {
      const code = addCodeInput.value.trim().toUpperCase();
      const rawReward = addRewardInput.value.trim();
      const reward = rawReward.length > 0 ? `${rawReward} %` : "?";
      if (code.length === 0) return;
      const hasProfanity = (text) => text.toLowerCase().split(/[^a-z0-9æøå]+/).some((w) => w.length > 0 && PROFANITY_SET.has(w));
      if (hasProfanity(code) || hasProfanity(rawReward)) {
        addCodeInput.style.borderColor = "#e05555";
        setTimeout(() => {
          addCodeInput.style.borderColor = "";
        }, 1500);
        return;
      }
      console.info(`[cashback-varsler] User submitted code for ${CURRENT_HOST}: ${code} (${reward})`);
      closeAddForm();
      void apiSubmitCode(CURRENT_HOST, code, reward).then((result) => {
        if (!result.ok) {
          row1.remove();
          let msg = "Noe gikk galt, prøv igjen.";
          if (result.duplicate === true) msg = "Koden er allerede lagt til.";
          if (result.rate_limited === true) msg = "Du har nådd grensen på 5 handlinger per dag.";
          const warn = document.createElement("div");
          warn.textContent = msg;
          warn.style.cssText = "font-size:11px;color:#e05555;padding:4px 8px;";
          const firstRow = codesList.querySelector(".code-item-row");
          if (firstRow) {
            firstRow.insertAdjacentElement("beforebegin", warn);
          } else {
            codesList.append(warn);
          }
          setTimeout(() => warn.remove(), 2500);
          return;
        }
        if (result.id) {
          item.dataset.codeId = String(result.id);
          const deleteBtn = makeDeleteBtn(result.id, row1);
          item.insertBefore(deleteBtn, down1);
        }
      });
      const item = document.createElement("div");
      item.className = "code-item";
      item.dataset.codeId = "pending";
      const rewardEl = document.createElement("span");
      rewardEl.className = "code-reward";
      if (/%/.test(reward)) {
        rewardEl.dataset.pct = String(parseRewardNum(reward));
        rewardEl.dataset.origReward = reward;
      }
      rewardEl.textContent = reward;
      const { group: codeGroup } = createCodeValueGroup(code);
      const { upBtn: up1, downBtn: down1 } = attachVoteButtons(item);
      item.append(rewardEl, codeGroup, down1, up1);
      const row1 = document.createElement("div");
      row1.className = "code-item-row";
      row1.dataset.net = "0";
      row1.append(item);
      addCodeForm.insertAdjacentElement("afterend", row1);
      resortCodesList();
    };
    addRewardInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAddForm();
      if (e.key === "Enter") {
        e.preventDefault();
        addCodeInput.focus();
      }
    });
    addCodeInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAddForm();
      if (e.key === "Enter" && addCodeInput.value.trim().length > 0 && addRewardInput.value.trim().length > 0) submitCode();
    });
    addCodeCancel.addEventListener("click", closeAddForm);
    addCodeSubmit.addEventListener("click", submitCode);
    addCodeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      codesSection.classList.remove("collapsed");
      addCodeForm.style.display = "";
      addRewardInput.focus();
    });
    codesList.append(addCodeForm);
    const expiredSection = document.createElement("div");
    expiredSection.className = "expired-section collapsed";
    expiredSection.style.display = "none";
    const expiredToggle = document.createElement("button");
    expiredToggle.className = "expired-toggle";
    expiredToggle.type = "button";
    const expiredToggleArrow = document.createElement("span");
    expiredToggleArrow.className = "expired-toggle-arrow";
    expiredToggleArrow.textContent = "▼";
    const expiredToggleText = document.createElement("span");
    expiredToggleText.textContent = "Utgåtte koder";
    expiredToggle.append(expiredToggleArrow, expiredToggleText);
    expiredToggle.addEventListener("click", () => {
      expiredSection.classList.toggle("collapsed");
    });
    const expiredList = document.createElement("div");
    expiredList.className = "expired-list";
    expiredSection.append(expiredToggle, expiredList);
    const makeDeleteBtn = (codeId, row) => {
      const btn = document.createElement("button");
      btn.className = "delete-code-btn";
      btn.type = "button";
      btn.title = "Slett koden din";
      btn.innerHTML = `×`;
      btn.addEventListener("click", () => {
        void apiDeleteCode(codeId).then((ok) => {
          if (ok) {
            row.remove();
            resortCodesList();
          }
        });
      });
      return btn;
    };
    const THUMBS_UP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`;
    const THUMBS_DOWN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>`;
    const attachVoteButtons = (item, staticCode, initialVote = 0) => {
      let upvotes = 0;
      let downvotes = 0;
      let upvoted = initialVote === 1;
      let downvoted = initialVote === -1;
      const upBtn = document.createElement("button");
      upBtn.className = "vote-btn";
      upBtn.type = "button";
      upBtn.innerHTML = THUMBS_UP_SVG;
      const upCountEl = document.createElement("span");
      upCountEl.className = "vote-count";
      upBtn.append(upCountEl);
      const upTooltip = document.createElement("div");
      upTooltip.className = "copy-code-tooltip";
      upTooltip.textContent = "Koden fungerer!";
      shadowRoot.append(upTooltip);
      upBtn.addEventListener("mouseenter", () => {
        const rect = upBtn.getBoundingClientRect();
        upTooltip.style.left = `${rect.left + rect.width / 2}px`;
        upTooltip.style.top = `${rect.top - 30}px`;
        upTooltip.style.transform = "translateX(-50%)";
        upTooltip.classList.add("visible");
      });
      upBtn.addEventListener("mouseleave", () => {
        upTooltip.classList.remove("visible");
      });
      const downBtn = document.createElement("button");
      downBtn.className = "vote-btn";
      downBtn.type = "button";
      downBtn.innerHTML = THUMBS_DOWN_SVG;
      const downCountEl = document.createElement("span");
      downCountEl.className = "vote-count";
      downBtn.append(downCountEl);
      const downTooltip = document.createElement("div");
      downTooltip.className = "copy-code-tooltip";
      downTooltip.textContent = "Koden er utgått";
      shadowRoot.append(downTooltip);
      downBtn.addEventListener("mouseenter", () => {
        const rect = downBtn.getBoundingClientRect();
        downTooltip.style.left = `${rect.left + rect.width / 2}px`;
        downTooltip.style.top = `${rect.top - 30}px`;
        downTooltip.style.transform = "translateX(-50%)";
        downTooltip.classList.add("visible");
      });
      downBtn.addEventListener("mouseleave", () => {
        downTooltip.classList.remove("visible");
      });
      const syncExpired = () => {
        const net = upvotes - downvotes;
        upCountEl.textContent = net > 0 ? String(net) : "";
        downCountEl.textContent = net < 0 ? String(Math.abs(net)) : "";
        const container = item.closest(".code-item-row") ?? item;
        container.dataset.net = String(net);
        if (net < 0 && container.parentElement === codesList) {
          expiredList.append(container);
          item.classList.add("expired");
          expiredSection.style.display = "";
          resortCodesList();
        } else if (net >= 0 && container.parentElement === expiredList) {
          codesList.append(container);
          item.classList.remove("expired");
          if (expiredList.children.length === 0) expiredSection.style.display = "none";
          resortCodesList();
        } else {
          resortCodesList();
        }
      };
      upBtn.addEventListener("click", () => {
        userHasVoted = true;
        const codeId = Number(item.dataset.codeId);
        if (upvoted) {
          upvotes--;
          upvoted = false;
          upBtn.classList.remove("voted");
        } else {
          if (downvoted) {
            downvotes--;
            downvoted = false;
            downBtn.classList.remove("downvoted");
          }
          upvotes++;
          upvoted = true;
          upBtn.classList.add("voted");
        }
        syncExpired();
        void apiVote(codeId, 1, staticCode).then((res) => {
          if (res !== null && "rate_limited" in res) {
            if (upvoted) {
              upvotes--;
              upvoted = false;
              upBtn.classList.remove("voted");
            } else {
              upvotes++;
              upvoted = true;
              upBtn.classList.add("voted");
            }
            syncExpired();
            showRateLimitFlash(upBtn);
          } else if (res !== null) {
            if ("registered_id" in res && res.registered_id !== void 0) item.dataset.codeId = String(res.registered_id);
            if (res.deleted) {
              delete item.dataset.codeId;
            }
            upvotes = res.upvotes;
            downvotes = res.downvotes;
            upvoted = !res.toggled_off && upvoted;
            if (res.toggled_off) upBtn.classList.remove("voted");
            syncExpired();
          }
        });
      });
      downBtn.addEventListener("click", () => {
        userHasVoted = true;
        const codeId = Number(item.dataset.codeId);
        if (downvoted) {
          downvotes--;
          downvoted = false;
          downBtn.classList.remove("downvoted");
        } else {
          if (upvoted) {
            upvotes--;
            upvoted = false;
            upBtn.classList.remove("voted");
          }
          downvotes++;
          downvoted = true;
          downBtn.classList.add("downvoted");
        }
        syncExpired();
        void apiVote(codeId, -1, staticCode).then((res) => {
          if (res !== null && "rate_limited" in res) {
            if (downvoted) {
              downvotes--;
              downvoted = false;
              downBtn.classList.remove("downvoted");
            } else {
              downvotes++;
              downvoted = true;
              downBtn.classList.add("downvoted");
            }
            syncExpired();
            showRateLimitFlash(downBtn);
          } else if (res !== null) {
            if ("registered_id" in res && res.registered_id !== void 0) item.dataset.codeId = String(res.registered_id);
            if (res.deleted) {
              delete item.dataset.codeId;
            }
            upvotes = res.upvotes;
            downvotes = res.downvotes;
            downvoted = !res.toggled_off && downvoted;
            if (res.toggled_off) downBtn.classList.remove("downvoted");
            syncExpired();
          }
        });
      });
      return { upBtn, downBtn };
    };
    const buildCrawlerRow = (codeOffer, dbId, initUpvotes = 0, initDownvotes = 0, initialVote = 0) => {
      const code = codeOffer.discountCode ?? "";
      const item = document.createElement("div");
      item.className = "code-item";
      if (dbId !== void 0) item.dataset.codeId = String(dbId);
      const reward = document.createElement("span");
      reward.className = "code-reward";
      const isNumericReward = /^\d[\d,.\ \-–]*\s*(?:%|kr)/i.test(codeOffer.reward.trim());
      if (/%/.test(codeOffer.reward)) {
        reward.dataset.pct = String(parseRewardNum(codeOffer.reward));
        reward.dataset.origReward = codeOffer.reward;
      }
      reward.textContent = isNumericReward ? codeOffer.reward : "?";
      const { group: codeGroup } = createCodeValueGroup(code);
      const { upBtn, downBtn } = attachVoteButtons(
        item,
        { code, reward: codeOffer.reward, hostname: CURRENT_HOST },
        initialVote
      );
      const upCountEl = upBtn.querySelector(".vote-count");
      const downCountEl = downBtn.querySelector(".vote-count");
      if (upCountEl && initUpvotes > 0) upCountEl.textContent = String(initUpvotes);
      if (downCountEl && initDownvotes > 0) downCountEl.textContent = String(initDownvotes);
      if (initialVote === 1) upBtn.classList.add("voted");
      else if (initialVote === -1) downBtn.classList.add("downvoted");
      const sourceChip = createCodeSourceChip(codeOffer);
      if (sourceChip !== void 0) {
        item.append(reward, codeGroup, downBtn, upBtn, sourceChip);
      } else {
        item.append(reward, codeGroup, downBtn, upBtn);
      }
      const row = document.createElement("div");
      row.className = "code-item-row";
      row.append(item);
      if (codeOffer.terms) {
        const termsTooltip = document.createElement("div");
        termsTooltip.className = "offer-tooltip";
        setTooltipContent(termsTooltip, [codeOffer.terms]);
        shadowRoot.append(termsTooltip);
        row.addEventListener("mouseenter", () => {
          const panelEl = shadowRoot.querySelector(".panel");
          const panelRect = panelEl?.getBoundingClientRect();
          const rowRect = row.getBoundingClientRect();
          termsTooltip.style.left = "-9999px";
          termsTooltip.style.top = "-9999px";
          termsTooltip.classList.add("visible");
          const tooltipHeight = termsTooltip.offsetHeight;
          const rightEdge = panelRect ? panelRect.right + 6 : rowRect.right + 6;
          termsTooltip.style.left = `${rightEdge}px`;
          termsTooltip.style.top = `${rowRect.top + rowRect.height / 2 - tooltipHeight / 2}px`;
        });
        row.addEventListener("mouseleave", () => {
          termsTooltip.classList.remove("visible");
        });
      }
      return row;
    };
    const createCodeSourceChip = (codeOffer) => {
      const sourceProvider = getCodeSourceProvider(codeOffer);
      if (sourceProvider === void 0) return void 0;
      const sourceUrl = codeOffer.sourceUrl || codeOffer.activationUrl;
      const chip = document.createElement("a");
      chip.className = `provider-badge provider-${sourceProvider} code-source-badge`;
      chip.href = sourceUrl;
      chip.target = "_blank";
      chip.rel = "noreferrer";
      chip.title = `Åpne ${formatProviderName(sourceProvider)}-tilbudet`;
      chip.textContent = formatProviderName(sourceProvider);
      return chip;
    };
    codesSection.append(codesToggle, codesList, expiredSection);
    const regionPricesSection = document.createElement("div");
    regionPricesSection.className = "region-prices-section";
    if (regionPrices !== void 0 && regionPrices.prices.length > 0) {
      if (initialRegionPricesCollapsed) {
        regionPricesSection.classList.add("collapsed");
      }
      const displayedRegionPrices = regionPrices.prices;
      const regionPricesToggle = document.createElement("button");
      regionPricesToggle.className = "region-prices-toggle";
      regionPricesToggle.type = "button";
      const regionPricesToggleArrow = document.createElement("span");
      regionPricesToggleArrow.className = "region-prices-toggle-arrow";
      regionPricesToggleArrow.textContent = "▼";
      const regionPricesToggleText = document.createElement("span");
      regionPricesToggleText.textContent = "Region ⚠";
      regionPricesToggle.append(regionPricesToggleArrow, regionPricesToggleText);
      regionPricesToggle.addEventListener("click", () => {
        const isCollapsed = regionPricesSection.classList.toggle("collapsed");
        chrome.storage.local.set({ [REGION_PRICES_COLLAPSED_KEY]: isCollapsed });
      });
      const regionPriceCards = displayedRegionPrices.map((regionPrice) => {
        const card = buildRegionPriceCard(regionPrice, regionPrice.region === regionPrices.prices[0]?.region);
        const tooltip = document.createElement("div");
        tooltip.className = "offer-tooltip";
        setTooltipContent(tooltip, [buildRegionPricesTooltip(regionPrices)]);
        shadowRoot.append(tooltip);
        card.addEventListener("mouseenter", () => {
          positionTooltipRightOfPanel(tooltip, card, shadowRoot);
        });
        card.addEventListener("mouseleave", () => {
          tooltip.classList.remove("visible");
        });
        return card;
      });
      regionPricesSection.append(
        regionPricesToggle,
        ...regionPriceCards
      );
    }
    const priceMatchSection = document.createElement("div");
    priceMatchSection.className = "price-match-section";
    if (priceMatches.length > 0) {
      if (initialPriceMatchCollapsed) {
        priceMatchSection.classList.add("collapsed");
      }
      const priceMatchToggle = document.createElement("button");
      priceMatchToggle.className = "price-match-toggle";
      priceMatchToggle.type = "button";
      const priceMatchToggleArrow = document.createElement("span");
      priceMatchToggleArrow.className = "price-match-toggle-arrow";
      priceMatchToggleArrow.textContent = "▼";
      const priceMatchToggleText = document.createElement("span");
      priceMatchToggleText.textContent = "Prismatch";
      priceMatchToggle.append(priceMatchToggleArrow, priceMatchToggleText);
      priceMatchToggle.addEventListener("click", () => {
        const isCollapsed = priceMatchSection.classList.toggle("collapsed");
        chrome.storage.local.set({ [PRICE_MATCH_COLLAPSED_KEY]: isCollapsed });
      });
      priceMatchSection.append(
        priceMatchToggle,
        ...priceMatches.map((priceMatch2, index) => buildPriceMatchCard(priceMatch2, index === 0))
      );
    }
    body.append(header);
    if (mainOffers.length > 0) body.append(offerList);
    if (regionPrices !== void 0 && regionPrices.prices.length > 0) body.append(regionPricesSection);
    if (priceMatches.length > 0) body.append(priceMatchSection);
    if (offers.length > 0) body.append(chipsSection, codesSection);
    let userHasVoted = false;
    [...codeOffers].sort((a, b) => parseRewardNum(b.reward) - parseRewardNum(a.reward)).forEach((codeOffer, i) => {
      const row = buildCrawlerRow(codeOffer);
      if (i === 0) row.classList.add("code-item-row--best");
      codesList.append(row);
    });
    let dbLoaded = false;
    const loadDbCodes = () => {
      if (dbLoaded) return;
      dbLoaded = true;
      void Promise.all([fetchCodesForHost(CURRENT_HOST), fetchOwnedCodesForHost(CURRENT_HOST), fetchMyVotes(CURRENT_HOST)]).then(([dbCodes, serverOwnedIds, myVotes]) => {
        const ownedIds = new Set(serverOwnedIds);
        if (userHasVoted) {
          const shownCodes = new Set(
            [...codesList.querySelectorAll(".code-value"), ...expiredList.querySelectorAll(".code-value")].map((el) => el.textContent?.toUpperCase() ?? "")
          );
          for (const dbCode of dbCodes) {
            if (shownCodes.has(dbCode.code.toUpperCase())) continue;
            const item = document.createElement("div");
            item.className = "code-item";
            item.dataset.codeId = String(dbCode.id);
            const reward = document.createElement("span");
            reward.className = "code-reward";
            if (/%/.test(dbCode.reward)) {
              reward.dataset.pct = String(parseRewardNum(dbCode.reward));
              reward.dataset.origReward = dbCode.reward;
            }
            reward.textContent = dbCode.reward;
            const { group: codeGroup } = createCodeValueGroup(dbCode.code);
            const { upBtn, downBtn } = attachVoteButtons(item);
            const upCountEl = upBtn.querySelector(".vote-count");
            const downCountEl = downBtn.querySelector(".vote-count");
            const initNet1 = dbCode.upvotes - dbCode.downvotes;
            if (upCountEl) upCountEl.textContent = initNet1 > 0 ? String(initNet1) : "";
            if (downCountEl) downCountEl.textContent = initNet1 < 0 ? String(Math.abs(initNet1)) : "";
            item.append(reward, codeGroup, downBtn, upBtn);
            const row = document.createElement("div");
            row.className = "code-item-row";
            row.append(item);
            if (initNet1 < 0) {
              item.classList.add("expired");
              expiredList.append(row);
              expiredSection.style.display = "";
            } else {
              codesList.append(row);
            }
          }
          return;
        }
        const crawlerByCode = new Map(
          codeOffers.map((o) => [(o.discountCode ?? "").toUpperCase(), o])
        );
        const entries = [];
        for (const dbCode of dbCodes) {
          const net = dbCode.upvotes - dbCode.downvotes;
          const matchingCrawlerOffer = crawlerByCode.get(dbCode.code.toUpperCase());
          crawlerByCode.delete(dbCode.code.toUpperCase());
          if (matchingCrawlerOffer !== void 0) {
            const myVote = myVotes[dbCode.id] ?? 0;
            entries.push({
              net,
              reward: matchingCrawlerOffer.reward,
              render: () => buildCrawlerRow(
                matchingCrawlerOffer,
                dbCode.id,
                dbCode.upvotes,
                dbCode.downvotes,
                myVote
              )
            });
            continue;
          }
          entries.push({ net, reward: dbCode.reward, render: () => {
            const item = document.createElement("div");
            item.className = "code-item";
            item.dataset.codeId = String(dbCode.id);
            const reward = document.createElement("span");
            reward.className = "code-reward";
            if (/%/.test(dbCode.reward)) {
              reward.dataset.pct = String(parseRewardNum(dbCode.reward));
              reward.dataset.origReward = dbCode.reward;
            }
            reward.textContent = dbCode.reward;
            const { group: codeGroup } = createCodeValueGroup(dbCode.code);
            const myVote = myVotes[dbCode.id] ?? 0;
            const { upBtn, downBtn } = attachVoteButtons(item, void 0, myVote);
            const upCountEl = upBtn.querySelector(".vote-count");
            const downCountEl = downBtn.querySelector(".vote-count");
            const initNet2 = dbCode.upvotes - dbCode.downvotes;
            if (upCountEl) upCountEl.textContent = initNet2 > 0 ? String(initNet2) : "";
            if (downCountEl) downCountEl.textContent = initNet2 < 0 ? String(Math.abs(initNet2)) : "";
            if (myVote === 1) upBtn.classList.add("voted");
            else if (myVote === -1) downBtn.classList.add("downvoted");
            item.append(reward, codeGroup, downBtn, upBtn);
            const row = document.createElement("div");
            row.className = "code-item-row";
            row.dataset.net = String(dbCode.upvotes - dbCode.downvotes);
            if (ownedIds.has(dbCode.id)) {
              const deleteBtn = makeDeleteBtn(dbCode.id, row);
              item.insertBefore(deleteBtn, downBtn);
            }
            row.append(item);
            return row;
          } });
        }
        for (const [, codeOffer] of crawlerByCode) {
          entries.push({ net: 0, reward: codeOffer.reward, render: () => buildCrawlerRow(codeOffer) });
        }
        const rewardPct = (r) => /%/.test(r) ? parseFloat(r.replace(",", ".")) || 0 : 0;
        entries.sort((a, b) => rewardPct(b.reward) - rewardPct(a.reward));
        codesList.removeChild(addCodeForm);
        codesList.innerHTML = "";
        expiredList.innerHTML = "";
        expiredSection.style.display = "none";
        codesList.append(addCodeForm);
        for (const entry of entries) {
          const row = entry.render();
          const item = row.querySelector(".code-item");
          if (entry.net < 0) {
            item.classList.add("expired");
            expiredList.append(row);
            expiredSection.style.display = "";
          } else {
            codesList.append(row);
          }
        }
        const firstRow = codesList.querySelector(".code-item-row");
        if (firstRow) firstRow.classList.add("code-item-row--best");
        crawlerByCode.size;
        const total = dbCodes.length + crawlerByCode.size;
        if (total > 0 || codeOffers.length > 0) ;
      });
    };
    if (!codesSection.classList.contains("collapsed")) {
      loadDbCodes();
    }
    const pick = SUPPORT_LINKS[Math.floor(Math.random() * SUPPORT_LINKS.length)];
    if (pick !== void 0) {
      const support = document.createElement("div");
      support.className = "support";
      const supportLink = document.createElement("a");
      supportLink.href = pick.url;
      supportLink.target = "_blank";
      supportLink.rel = "noreferrer";
      supportLink.textContent = pick.text;
      const logoLink = document.createElement("a");
      logoLink.href = "https://cashbacknorge.no";
      logoLink.target = "_blank";
      logoLink.rel = "noreferrer";
      logoLink.title = "cashbacknorge.no";
      const logoImg = document.createElement("img");
      logoImg.src = CBN_LOGO_B64;
      logoImg.className = "support-logo";
      logoImg.alt = "CBN";
      logoLink.append(logoImg);
      if (pick.affiliate) support.prepend(makeAdChip());
      else supportLink.style.cssText = "flex:1;text-align:center;";
      support.append(supportLink, logoLink);
      const disclosure = document.createElement("p");
      disclosure.textContent = "Ad er affiliatelenker. ♥ støtter utvikleren direkte.";
      disclosure.style.cssText = "color:#b0bec5;font-size:10px;margin:0;padding:2px 14px 6px;";
      panel.append(topLine, body, support, disclosure);
    } else {
      panel.append(topLine, body);
    }
    notice.append(sideTab, panel);
    panel.addEventListener("transitionend", (e) => {
      if (e.propertyName === "width" && !notice.classList.contains("collapsed")) {
        void panel.offsetHeight;
      }
    });
    if (initialCollapsed) {
      notice.classList.add("collapsed", "no-transition");
      sideTabArrow.textContent = "›";
      sideTab.setAttribute("aria-label", "Expand cashback offers");
    }
    shadowRoot.append(style, notice);
    const mountTarget = document.body ?? document.documentElement;
    mountTarget.append(host);
    void detectConflicts(shadowRoot, title);
    attachPriceMatchTooltips(shadowRoot, priceMatches);
    const wrappers = shadowRoot.querySelectorAll(".offer-link-wrapper");
    for (let idx = 0; idx < mainOffers.length; idx++) {
      const currentOffer = mainOffers[idx];
      if (currentOffer === void 0) continue;
      const compact = formatCompactRewardLabel(currentOffer);
      const fullReward = formatRewardLabel(currentOffer.reward, currentOffer.provider);
      const showRewardInTooltip = compact !== void 0 && fullReward !== compact;
      const isCardOnlyOffer = CARD_ONLY_PROVIDERS.has(currentOffer.provider);
      const isAppOnlyOffer = APP_ONLY_PROVIDERS.has(currentOffer.provider);
      const hasTerms = currentOffer.terms.trim().length > 0;
      if (currentOffer.provider !== "cbn" && !showRewardInTooltip && !hasTerms && !isCardOnlyOffer && !isAppOnlyOffer) continue;
      const wrapper = wrappers[idx];
      if (wrapper === void 0) continue;
      const tooltip = document.createElement("div");
      tooltip.className = "offer-tooltip";
      const tooltipParts = [];
      if (currentOffer.terms) tooltipParts.push(currentOffer.terms);
      if (isCardOnlyOffer) tooltipParts.push("⚠ Betales med kort – kan ikke kombineres med ekstra cashback fra andre kort");
      if (isAppOnlyOffer) tooltipParts.push("Krever " + formatProviderName(currentOffer.provider) + "-appen for å aktivere cashback");
      setTooltipContent(tooltip, tooltipParts);
      shadowRoot.append(tooltip);
      tooltipElements.push({ element: tooltip, offer: currentOffer });
      wrapper.addEventListener("mouseenter", () => {
        const panelEl = shadowRoot.querySelector(".panel");
        const panelRect = panelEl?.getBoundingClientRect();
        const wrapperRect = wrapper.getBoundingClientRect();
        tooltip.style.left = "-9999px";
        tooltip.style.top = "-9999px";
        tooltip.classList.add("visible");
        const tooltipHeight = tooltip.offsetHeight;
        const tooltipWidth = tooltip.offsetWidth;
        const rightEdge = panelRect ? panelRect.right + 6 : wrapperRect.right + 6;
        const preferredLeft = rightEdge;
        const fallbackLeft = wrapperRect.left + wrapperRect.width / 2 - tooltipWidth / 2;
        const left = preferredLeft + tooltipWidth > window.innerWidth - 8 ? Math.max(8, Math.min(fallbackLeft, window.innerWidth - tooltipWidth - 8)) : preferredLeft;
        const top = Math.max(
          8,
          Math.min(wrapperRect.top + wrapperRect.height / 2 - tooltipHeight / 2, window.innerHeight - tooltipHeight - 8)
        );
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      });
      wrapper.addEventListener("mouseleave", () => {
        tooltip.classList.remove("visible");
      });
    }
    if (initialCollapsed) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        notice.classList.remove("no-transition");
      }));
    }
    let panelSwipeStartX = 0;
    let panelSwipeStartY = 0;
    panel.addEventListener("touchstart", (e) => {
      panelSwipeStartX = e.touches[0]?.clientX ?? 0;
      panelSwipeStartY = e.touches[0]?.clientY ?? 0;
    }, { passive: true });
    panel.addEventListener("touchend", (e) => {
      const dx = (e.changedTouches[0]?.clientX ?? 0) - panelSwipeStartX;
      const dy = (e.changedTouches[0]?.clientY ?? 0) - panelSwipeStartY;
      if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        setCollapsed(notice, sideTab, sideTabArrow, true);
      }
    }, { passive: true });
  }
  function clearNotice() {
    document.getElementById(HOST_ID)?.remove();
  }
  function attachPriceMatchTooltips(shadowRoot, priceMatches) {
    if (priceMatches.length === 0) return;
    const cards = shadowRoot.querySelectorAll(".price-match-card");
    for (let index = 0; index < priceMatches.length; index++) {
      const card = cards[index];
      const priceMatch = priceMatches[index];
      if (card === void 0 || priceMatch === void 0) continue;
      const tooltip = document.createElement("div");
      tooltip.className = "offer-tooltip";
      setTooltipContent(tooltip, [buildPriceMatchTooltip(priceMatch)]);
      shadowRoot.append(tooltip);
      card.addEventListener("mouseenter", () => {
        positionTooltipRightOfPanel(tooltip, card, shadowRoot);
      });
      card.addEventListener("mouseleave", () => {
        tooltip.classList.remove("visible");
      });
    }
  }
  function setTooltipContent(tooltip, parts) {
    const sections = parts.flatMap((part) => part.split(/\n{2,}/)).map(createTooltipSection).filter((section) => section !== void 0);
    tooltip.replaceChildren(...sections);
  }
  function createTooltipSection(part) {
    const lines = part.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) return void 0;
    const section = document.createElement("div");
    section.className = "offer-tooltip-section";
    if (lines.length === 1) {
      const isRateLine = /^\d[\d.,]* (%|kr)/.test(lines[0] ?? "");
      if (isRateLine) {
        const list2 = document.createElement("ul");
        list2.className = "offer-tooltip-list";
        const item = document.createElement("li");
        item.textContent = lines[0] ?? "";
        list2.append(item);
        section.append(list2);
      } else {
        const text = document.createElement("span");
        text.className = "offer-tooltip-text";
        text.textContent = lines[0] ?? "";
        section.append(text);
      }
      return section;
    }
    const firstLine = lines[0] ?? "";
    const listLines = /^(medlemsfordel|medlemstilbud)$/i.test(firstLine) || / tilbud$/i.test(firstLine) ? lines.slice(1) : lines;
    if (listLines.length !== lines.length) {
      const title = document.createElement("span");
      title.className = "offer-tooltip-title";
      title.textContent = firstLine;
      section.append(title);
    }
    const list = document.createElement("ul");
    list.className = "offer-tooltip-list";
    for (const line of listLines) {
      const item = document.createElement("li");
      item.textContent = line.replace(/^-\s+/, "");
      list.append(item);
    }
    section.append(list);
    return section;
  }
  function applyHostOverlayStyle(host) {
    host.style.setProperty("background", "transparent", "important");
    host.style.setProperty("border", "0", "important");
    host.style.setProperty("bottom", "16px", "important");
    host.style.setProperty("display", "block", "important");
    host.style.setProperty("height", "0", "important");
    host.style.setProperty("inset", "auto auto 16px 0", "important");
    host.style.setProperty("left", "0", "important");
    host.style.setProperty("margin", "0", "important");
    host.style.setProperty("overflow", "visible", "important");
    host.style.setProperty("padding", "0", "important");
    host.style.setProperty("position", "fixed", "important");
    host.style.setProperty("width", "0", "important");
    host.style.setProperty("z-index", "2147483647", "important");
  }
  function createSiteIcon() {
    const siteIcon = document.createElement("img");
    siteIcon.className = "site-icon";
    siteIcon.alt = "";
    siteIcon.src = findSiteIconUrl();
    siteIcon.addEventListener("error", () => {
      siteIcon.style.visibility = "hidden";
    });
    return siteIcon;
  }
  function setCollapsed(notice, sideTab, sideTabArrow, collapsed) {
    notice.classList.toggle("collapsed", collapsed);
    sideTabArrow.textContent = collapsed ? "›" : "‹";
    sideTab.setAttribute(
      "aria-label",
      collapsed ? "Expand cashback offers" : "Collapse cashback offers"
    );
    chrome.storage.local.set({ [COLLAPSED_STORAGE_KEY]: collapsed });
    if (!collapsed) {
      resetExpandedPanelLayout(notice);
    }
  }
  function resetExpandedPanelLayout(notice) {
    const panel = notice.querySelector(".panel");
    if (panel === null) return;
    requestAnimationFrame(() => {
      panel.style.height = "auto";
      panel.style.minHeight = "0";
      void panel.offsetHeight;
    });
  }
  function isCashbackFoundMessage(value) {
    return isRecord(value) && value.type === "cashback-found" && Array.isArray(value.offers) && value.offers.every(isCashbackOffer);
  }
  function isCashbackNoneMessage(value) {
    return isRecord(value) && value.type === "cashback-none";
  }
  function isOffersForUrlResponse(value) {
    if (!isRecord(value) || typeof value.ok !== "boolean") {
      return false;
    }
    if (value.ok) {
      return Array.isArray(value.offers) && value.offers.every(isCashbackOffer);
    }
    return typeof value.reason === "string";
  }
  function isPriceMatchForProductResponse(value) {
    if (!isRecord(value) || typeof value.ok !== "boolean") {
      return false;
    }
    if (value.ok) {
      return (value.offer === void 0 || isPriceMatchOffer(value.offer)) && (value.offers === void 0 || Array.isArray(value.offers) && value.offers.every(isPriceMatchOffer));
    }
    return typeof value.reason === "string";
  }
  function isPlayStationRegionPricesResponse(value) {
    if (!isRecord(value) || typeof value.ok !== "boolean") {
      return false;
    }
    if (value.ok) {
      return value.result === void 0 || isPlayStationRegionPriceResult(value.result);
    }
    return typeof value.reason === "string";
  }
  function isPlayStationRegionPriceResult(value) {
    return isRecord(value) && typeof value.productId === "string" && typeof value.fetchedAt === "string" && (value.productName === void 0 || typeof value.productName === "string") && (value.ratesUpdatedAt === void 0 || typeof value.ratesUpdatedAt === "string") && Array.isArray(value.prices) && value.prices.every(isPlayStationRegionPrice);
  }
  function isPlayStationRegionPrice(value) {
    return isRecord(value) && typeof value.region === "string" && typeof value.countryName === "string" && typeof value.flag === "string" && typeof value.locale === "string" && typeof value.currency === "string" && typeof value.price === "number" && typeof value.formattedPrice === "string" && typeof value.nokAmount === "number" && typeof value.formattedNok === "string" && typeof value.productUrl === "string" && (value.priceHistoryUrl === void 0 || typeof value.priceHistoryUrl === "string");
  }
  function isPriceMatchOffer(value) {
    return isRecord(value) && (value.source === void 0 || value.source === "prisjakt" || value.source === "godpris" || value.source === "klarna" || value.source === "prisradar" || value.source === "isthereanydeal" || value.source === "taxfree" || value.source === "vinmonopolet" || value.source === "sesum" || value.source === "enhver") && (value.sourceName === void 0 || typeof value.sourceName === "string") && (value.matchedCurrentMerchant === void 0 || typeof value.matchedCurrentMerchant === "boolean") && (value.matchedExactProduct === void 0 || typeof value.matchedExactProduct === "boolean") && typeof value.shopName === "string" && typeof value.price === "string" && typeof value.amount === "number" && (value.sortAmount === void 0 || typeof value.sortAmount === "number") && typeof value.currency === "string" && typeof value.productName === "string" && typeof value.productUrl === "string" && (value.offerUrl === void 0 || typeof value.offerUrl === "string") && (value.alternatives === void 0 || Array.isArray(value.alternatives) && value.alternatives.every(isPriceMatchAlternative));
  }
  function isPriceMatchAlternative(value) {
    return isRecord(value) && typeof value.shopName === "string" && typeof value.price === "string" && typeof value.amount === "number" && (value.sortAmount === void 0 || typeof value.sortAmount === "number") && typeof value.currency === "string" && (value.shippingPrice === void 0 || typeof value.shippingPrice === "string") && (value.totalPrice === void 0 || typeof value.totalPrice === "string");
  }
  function isCashbackIndex(value) {
    if (!isRecord(value) || typeof value.version !== "number" || typeof value.generatedAt !== "string" || !Array.isArray(value.offers) || !isRecord(value.domainIndex)) {
      return false;
    }
    return value.offers.every(isCashbackOffer) && Object.values(value.domainIndex).every((offers) => {
      return Array.isArray(offers) && offers.every(isCashbackOffer);
    });
  }
  function isCashbackOffer(value) {
    return isRecord(value) && typeof value.provider === "string" && typeof value.merchantName === "string" && Array.isArray(value.domains) && value.domains.every(isString) && typeof value.reward === "string" && typeof value.sourceUrl === "string" && typeof value.activationUrl === "string" && typeof value.terms === "string" && (value.discountCode === void 0 || typeof value.discountCode === "string") && typeof value.updatedAt === "string";
  }
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function isString(value) {
    return typeof value === "string";
  }
  function findOffersForHostname(cashbackIndex, hostname) {
    const normalizedHostname = normalizeHostname(hostname);
    const canonical = DOMAIN_ALIASES[normalizedHostname] ?? normalizedHostname;
    const ccParentDomains = CC_SUBDOMAINS.flatMap(
      (cc) => normalizedHostname.startsWith(`${cc}.`) ? [normalizedHostname.slice(cc.length + 1)] : []
    );
    const lookupDomains = [
      normalizedHostname,
      ...canonical !== normalizedHostname ? [canonical] : [],
      ...getAlternateTldDomains(normalizedHostname),
      ...CC_SUBDOMAINS.map((cc) => `${cc}.${normalizedHostname}`),
      ...ccParentDomains
    ];
    const indexMatches = lookupDomains.flatMap((domain) => {
      return cashbackIndex.domainIndex[domain] ?? [];
    });
    const hasExactMatches = (cashbackIndex.domainIndex[normalizedHostname] ?? []).length > 0;
    const suffixMatches = hasExactMatches ? [] : cashbackIndex.offers.filter((offer) => {
      return offer.domains.some((domain) => {
        const normalizedDomain = normalizeDomainInput(domain);
        return normalizedDomain !== normalizedHostname && normalizedHostname.endsWith(`.${normalizedDomain}`);
      });
    });
    const childDomainMatches = hasExactMatches ? [] : cashbackIndex.offers.filter((offer) => {
      return offer.domains.some((domain) => {
        const normalizedDomain = normalizeDomainInput(domain);
        return lookupDomains.some((lookupDomain) => {
          return normalizedDomain !== lookupDomain && normalizedDomain.endsWith(`.${lookupDomain}`);
        });
      });
    });
    return sortOffersByReward(
      uniqueOffers([...indexMatches, ...suffixMatches, ...childDomainMatches])
    );
  }
  function normalizeHostname(hostname) {
    const lowerCaseHostname = hostname.trim().toLowerCase();
    const withoutTrailingDot = lowerCaseHostname.endsWith(".") ? lowerCaseHostname.slice(0, -1) : lowerCaseHostname;
    return withoutTrailingDot.startsWith("www.") ? withoutTrailingDot.slice(4) : withoutTrailingDot;
  }
  function normalizeDomainInput(input) {
    const trimmedInput = input.trim();
    const urlLikeInput = trimmedInput.includes("://") ? trimmedInput : `https://${trimmedInput}`;
    const parsedUrl = parseUrl(urlLikeInput);
    if (parsedUrl !== void 0) {
      return normalizeHostname(parsedUrl.hostname);
    }
    const firstSlashIndex = trimmedInput.indexOf("/");
    const hostPart = firstSlashIndex === -1 ? trimmedInput : trimmedInput.slice(0, firstSlashIndex);
    return normalizeHostname(hostPart);
  }
  const DOMAIN_ALIASES = {
    "jbl.com": "no.jbl.com"
  };
  const COMMON_TLDS = [".com", ".no", ".se", ".dk", ".fi", ".eu"];
  const CC_SUBDOMAINS = ["no", "se", "dk", "fi", "de", "fr", "es", "it", "nl", "uk", "us", "eu"];
  function getAlternateTldDomains(domain) {
    const parts = domain.split(".");
    if (parts.length !== 2) return [];
    const tld = `.${parts[1]}`;
    if (!COMMON_TLDS.includes(tld)) return [];
    const baseName = parts[0];
    return COMMON_TLDS.filter((commonTld) => commonTld !== tld).map((commonTld) => `${baseName}${commonTld}`);
  }
  function parseUrl(input) {
    try {
      return new URL(input);
    } catch {
      return void 0;
    }
  }
  function uniqueOffers(offers) {
    const byKey = /* @__PURE__ */ new Map();
    for (const offer of offers) {
      const codeSuffix = offer.discountCode !== void 0 ? `:${offer.discountCode}` : "";
      const key = `${offer.provider}:${offer.merchantName.toLowerCase()}${codeSuffix}`;
      const existing = byKey.get(key);
      const newVal = parseRewardValue(offer.reward);
      const existingVal = existing !== void 0 ? parseRewardValue(existing.reward) : null;
      const isRange = offer.reward.includes("-");
      const isBetterReward = existingVal === null || rewardKindRank(newVal.kind) > rewardKindRank(existingVal.kind) || newVal.kind === existingVal.kind && newVal.amount > existingVal.amount;
      if (existing === void 0 || isBetterReward || newVal.amount === existingVal.amount && isRange && !existing.reward.includes("-")) {
        byKey.set(key, offer);
      }
    }
    return [...byKey.values()];
  }
  function sortOffersByReward(offers) {
    return [...offers].sort((firstOffer, secondOffer) => {
      const firstIsSupport = firstOffer.provider === "cbn";
      const secondIsSupport = secondOffer.provider === "cbn";
      if (firstIsSupport !== secondIsSupport) {
        return firstIsSupport ? 1 : -1;
      }
      const firstReward = parseRewardValue(firstOffer.reward);
      const secondReward = parseRewardValue(secondOffer.reward);
      const rewardKindSort = rewardKindRank(secondReward.kind) - rewardKindRank(firstReward.kind);
      if (rewardKindSort !== 0) return rewardKindSort;
      const rewardAmountSort = secondReward.amount - firstReward.amount;
      if (rewardAmountSort !== 0) return rewardAmountSort;
      const merchantSort = firstOffer.merchantName.localeCompare(secondOffer.merchantName);
      if (merchantSort !== 0) return merchantSort;
      return firstOffer.provider.localeCompare(secondOffer.provider);
    });
  }
  function parseRewardValue(reward) {
    const rangeMatch = reward.match(/\d+(?:[,.]\d+)?\s*-\s*(\d+(?:[,.]\d+)?)\s*%/);
    const percentageMatch = rangeMatch ? [null, rangeMatch[1]] : reward.match(/(\d+(?:[,.]\d+)?)\s*%/);
    if (percentageMatch !== null) {
      return {
        kind: "percentage",
        amount: parseLocalizedNumber(percentageMatch[1] ?? "0")
      };
    }
    const pointsRateMatch = reward.match(/(\d[\d\s]*)\s*poeng\s+per\s+100\s*kr/i);
    if (pointsRateMatch !== null) {
      return {
        kind: "percentage",
        amount: parseLocalizedNumber((pointsRateMatch[1] ?? "0").replace(/\s/g, "")) / EB_PER_TRUMF_KR$1
      };
    }
    const unitMatch = reward.match(/(\d+(?:[,.]\d+)?)\s*kr\s*\//i);
    if (unitMatch !== null) {
      return {
        kind: "unit",
        amount: parseLocalizedNumber(unitMatch[1] ?? "0")
      };
    }
    const krRangeMatch = reward.match(/\d[\d\s]*(?:[,.]\d+)?\s*-\s*(\d[\d\s]*(?:[,.]\d+)?)\s*kr/i);
    if (krRangeMatch !== null) {
      return {
        kind: "fixed",
        amount: parseLocalizedNumber((krRangeMatch[1] ?? "0").replace(/\s/g, ""))
      };
    }
    const fixedMatch = reward.match(/(\d[\d\s]*(?:[,.]\d+)?)\s*kr/i);
    if (fixedMatch !== null) {
      return {
        kind: "fixed",
        amount: parseLocalizedNumber((fixedMatch[1] ?? "0").replace(/\s/g, ""))
      };
    }
    const pointsMatch = reward.match(/(\d[\d\s]*)\s*poeng/i);
    if (pointsMatch !== null) {
      return {
        kind: "points",
        amount: parseLocalizedNumber((pointsMatch[1] ?? "0").replace(/\s/g, ""))
      };
    }
    return {
      kind: "unknown",
      amount: 0
    };
  }
  function parseLocalizedNumber(value) {
    const parsedValue = Number.parseFloat(value.replace(",", "."));
    return Number.isFinite(parsedValue) ? parsedValue : 0;
  }
  function rewardKindRank(kind) {
    if (kind === "percentage") return 4;
    if (kind === "fixed") return 3;
    if (kind === "unit") return 2;
    if (kind === "points") return 1;
    return 0;
  }
  function buildPriceMatchCard(priceMatch, isBest = false) {
    const priceMatchCard = document.createElement("a");
    priceMatchCard.className = "price-match-card";
    if (isBest) priceMatchCard.classList.add("price-match-card--best");
    priceMatchCard.href = priceMatch.productUrl;
    priceMatchCard.target = "_blank";
    priceMatchCard.rel = "noreferrer";
    const priceMatchTitle = document.createElement("span");
    priceMatchTitle.className = "price-match-title";
    const priceMatchProduct = document.createElement("span");
    priceMatchProduct.className = "price-match-product";
    priceMatchProduct.textContent = priceMatch.productName;
    const priceMatchShop = document.createElement("span");
    priceMatchShop.className = "price-match-shop";
    priceMatchShop.textContent = priceMatch.shopName;
    priceMatchTitle.append(priceMatchProduct, priceMatchShop);
    const priceMatchPrice = document.createElement("span");
    priceMatchPrice.className = "price-match-price";
    priceMatchPrice.textContent = priceMatch.price;
    const priceMatchBadge = document.createElement("span");
    priceMatchBadge.className = `provider-badge provider-${getPriceMatchProviderClass(priceMatch)}`;
    priceMatchBadge.textContent = getPriceMatchSourceName(priceMatch);
    priceMatchCard.append(priceMatchTitle, priceMatchPrice, priceMatchBadge);
    return priceMatchCard;
  }
  function buildRegionPriceCard(regionPrice, isBest = false) {
    const regionPriceCard = document.createElement("div");
    regionPriceCard.className = "region-price-card";
    if (isBest) regionPriceCard.classList.add("region-price-card--best");
    const regionPriceMain = document.createElement("a");
    regionPriceMain.className = "region-price-main";
    regionPriceMain.href = regionPrice.productUrl;
    regionPriceMain.target = "_blank";
    regionPriceMain.rel = "noreferrer";
    regionPriceMain.title = `Åpne ${regionPrice.countryName} i PlayStation Store`;
    const regionPriceTitle = document.createElement("span");
    regionPriceTitle.className = "region-price-title";
    const regionPriceCountry = document.createElement("span");
    regionPriceCountry.className = "region-price-country";
    regionPriceCountry.textContent = `${regionPrice.flag} ${regionPrice.countryName}`;
    const regionPriceNative = document.createElement("span");
    regionPriceNative.className = "region-price-native";
    regionPriceNative.textContent = regionPrice.formattedPrice;
    regionPriceTitle.append(regionPriceCountry, regionPriceNative);
    const regionPriceNok = document.createElement("span");
    regionPriceNok.className = "region-price-nok";
    regionPriceNok.textContent = regionPrice.formattedNok;
    regionPriceMain.append(regionPriceTitle, regionPriceNok);
    regionPriceCard.append(regionPriceMain);
    const secondaryLink = getRegionPriceSecondaryLink(regionPrice);
    if (secondaryLink !== void 0) {
      regionPriceCard.classList.add("region-price-card-with-action");
      const regionPriceAction = document.createElement("a");
      regionPriceAction.className = `provider-badge provider-${secondaryLink.provider} region-price-action`;
      regionPriceAction.href = secondaryLink.url;
      regionPriceAction.target = "_blank";
      regionPriceAction.rel = "noreferrer";
      regionPriceAction.title = secondaryLink.title;
      regionPriceAction.textContent = secondaryLink.label;
      regionPriceCard.append(regionPriceAction);
    }
    return regionPriceCard;
  }
  function getRegionPriceSecondaryLink(regionPrice) {
    if (regionPrice.region === "NO") {
      if (regionPrice.priceHistoryUrl === void 0) return void 0;
      return {
        label: "psprices",
        provider: "psprices",
        title: "Åpne norsk prishistorikk hos PSPrices",
        url: regionPrice.priceHistoryUrl
      };
    }
    return {
      label: "GC Deals",
      provider: "gcdeals",
      title: `Finn PSN-gavekort for ${regionPrice.countryName} hos GC Deals`,
      url: PSN_GIFT_CARD_REGION_URLS[regionPrice.region] ?? PSN_GIFT_CARD_DEALS_URL
    };
  }
  function buildRegionPricesTooltip(regionPrices) {
    const rateLine = regionPrices.ratesUpdatedAt !== void 0 ? `FX: ${regionPrices.ratesUpdatedAt}` : "FX: live NOK conversion";
    return [
      "Utenlandske priser krever PSN-konto i samme region og betaling med PSN-gavekort.",
      "Typisk flyt: legg regionkontoen til på PS5-en, kjøp og last ned spillet der, spill fra norsk konto etterpå.",
      "Alle tilgjengelige regioner vises i listen, sortert billigst først.",
      "Regionraden åpner spillet i regional PlayStation Store.",
      "GC Deals-chipen åpner PSN-gavekort i valgt region.",
      "PSPrices-chipen åpner norsk prishistorikk.",
      rateLine
    ].join("\n");
  }
  function getPriceMatchProviderClass(priceMatch) {
    if (priceMatch.source === "godpris") return "godpris";
    if (priceMatch.source === "klarna") return "klarna";
    if (priceMatch.source === "prisradar") return "prisradar";
    if (priceMatch.source === "sesum") return "sesum";
    if (priceMatch.source === "enhver") return "enhver";
    if (priceMatch.source === "isthereanydeal") return "isthereanydeal";
    if (priceMatch.source === "taxfree") return "taxfree";
    if (priceMatch.source === "vinmonopolet") return "vinmonopolet";
    return "prisjakt";
  }
  function getPriceMatchSourceName(priceMatch) {
    if (priceMatch.sourceName !== void 0) return priceMatch.sourceName;
    if (priceMatch.source === "godpris") return "Godpris";
    if (priceMatch.source === "klarna") return "Klarna";
    if (priceMatch.source === "prisradar") return "Prisradar";
    if (priceMatch.source === "sesum") return "SeSum";
    if (priceMatch.source === "enhver") return "Enhver";
    if (priceMatch.source === "isthereanydeal") return "IsThereAnyDeal";
    if (priceMatch.source === "taxfree") return "Tax Free";
    if (priceMatch.source === "vinmonopolet") return "Vinmonopolet";
    return "Prisjakt";
  }
  function buildPriceMatchTooltip(priceMatch) {
    const alternatives = priceMatch.alternatives?.length ? priceMatch.alternatives : [{ shopName: priceMatch.shopName, price: priceMatch.price }];
    return [
      `${getPriceMatchSourceName(priceMatch)}: ${priceMatch.productName}`,
      alternatives.map(formatPriceMatchTooltipOffer).join("\n")
    ].join("\n\n");
  }
  function formatPriceMatchTooltipOffer(offer) {
    const shippingSuffix = offer.totalPrice !== void 0 ? ` (${offer.shippingPrice ?? "frakt"}, totalt ${offer.totalPrice})` : offer.shippingPrice !== void 0 ? ` (${offer.shippingPrice})` : "";
    return `- ${offer.shopName} ${offer.price}${shippingSuffix}`;
  }
  function formatProviderName(provider) {
    return PROVIDER_NAMES[provider] ?? provider;
  }
  function findSiteIconUrl() {
    const iconSelectors = [
      'link[rel~="icon"][href]',
      'link[rel="shortcut icon"][href]',
      'link[rel="apple-touch-icon"][href]'
    ];
    for (const selector of iconSelectors) {
      const iconElement = document.querySelector(selector);
      if (!(iconElement instanceof HTMLLinkElement)) {
        continue;
      }
      const parsedUrl = parseUrlWithBase(iconElement.href, window.location.href);
      if (parsedUrl !== void 0) {
        return parsedUrl.toString();
      }
    }
    return new URL("/favicon.ico", window.location.origin).toString();
  }
  function parseUrlWithBase(href, baseUrl) {
    try {
      return new URL(href, baseUrl);
    } catch {
      return void 0;
    }
  }
  const WARNING_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  const COPY_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  const CHECK_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  async function detectAdblock() {
    const [urlBlocked, domBlocked] = await Promise.all([
      detectAdblockByUrl(),
      detectAdblockByDom()
    ]);
    return urlBlocked || domBlocked;
  }
  async function detectAdblockByUrl() {
    if (document.querySelector('meta[http-equiv="Content-Security-Policy"]') !== null) {
      return false;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      await fetch("https://widgets.outbrain.com/outbrain.js", { mode: "no-cors", signal: controller.signal });
      clearTimeout(timeoutId);
      return false;
    } catch {
      return true;
    }
  }
  async function detectAdblockByDom() {
    try {
      const container = document.createElement("div");
      container.style.cssText = "position:absolute;left:-9999px;top:-9999px;";
      for (const id of ["AdHeader", "AdContainer", "AD_Top", "homead", "ad-lead"]) {
        const el = document.createElement("div");
        el.id = id;
        el.style.cssText = "display:block;width:1px;height:1px;";
        container.appendChild(el);
      }
      (document.body ?? document.documentElement).appendChild(container);
      await new Promise((r) => setTimeout(r, 100));
      let blockedCount = 0;
      for (const id of ["AdHeader", "AdContainer", "AD_Top", "homead", "ad-lead"]) {
        const el = container.querySelector(`#${id}`);
        if (!el || el.offsetHeight === 0) blockedCount++;
      }
      container.remove();
      return blockedCount >= 1;
    } catch {
      return false;
    }
  }
  async function detectConflicts(shadowRoot, titleEl) {
    if (!await detectAdblock()) return;
    const warningIcon = document.createElement("span");
    warningIcon.className = "conflict-warning";
    warningIcon.innerHTML = WARNING_ICON_SVG;
    const conflictTooltip = document.createElement("div");
    conflictTooltip.className = "status-tooltip";
    conflictTooltip.textContent = "Adblock er aktivert – kan blokkere cashback-sporing";
    shadowRoot.append(conflictTooltip);
    warningIcon.addEventListener("mouseenter", () => {
      positionStatusTooltipAbovePanel(conflictTooltip, warningIcon, shadowRoot);
      shadowRoot.append(conflictTooltip);
      conflictTooltip.classList.add("visible");
    });
    warningIcon.addEventListener("mouseleave", () => {
      conflictTooltip.classList.remove("visible");
    });
    titleEl.appendChild(warningIcon);
  }
  function positionStatusTooltipAbovePanel(tooltip, anchor, shadowRoot) {
    const panel = shadowRoot.querySelector(".panel");
    const anchorRect = anchor.getBoundingClientRect();
    const panelRect = panel?.getBoundingClientRect();
    tooltip.style.left = "-9999px";
    tooltip.style.top = "-9999px";
    tooltip.style.transform = "none";
    tooltip.classList.add("visible");
    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;
    const preferredLeft = panelRect !== void 0 ? panelRect.left : anchorRect.left;
    const left = Math.max(8, Math.min(preferredLeft, window.innerWidth - tooltipWidth - 8));
    const preferredTop = panelRect !== void 0 ? panelRect.top - tooltipHeight - 8 : anchorRect.top - tooltipHeight - 8;
    const fallbackTop = panelRect !== void 0 ? panelRect.top + 8 : anchorRect.bottom + 8;
    const top = preferredTop >= 8 ? preferredTop : Math.min(fallbackTop, window.innerHeight - tooltipHeight - 8);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(8, top)}px`;
  }
  function positionTooltipRightOfPanel(tooltip, anchor, shadowRoot) {
    const panelEl = shadowRoot.querySelector(".panel");
    const panelRect = panelEl?.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    tooltip.style.left = "-9999px";
    tooltip.style.top = "-9999px";
    tooltip.style.transform = "none";
    tooltip.classList.add("visible");
    const tooltipHeight = tooltip.offsetHeight;
    const tooltipWidth = tooltip.offsetWidth;
    const rightEdge = panelRect ? panelRect.right + 6 : anchorRect.right + 6;
    const fallbackLeft = anchorRect.left + anchorRect.width / 2 - tooltipWidth / 2;
    const left = rightEdge + tooltipWidth > window.innerWidth - 8 ? Math.max(8, Math.min(fallbackLeft, window.innerWidth - tooltipWidth - 8)) : rightEdge;
    const top = Math.max(
      8,
      Math.min(anchorRect.top + anchorRect.height / 2 - tooltipHeight / 2, window.innerHeight - tooltipHeight - 8)
    );
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }
  function formatOfferTitlePrefix(offer) {
    if (offer.provider === "obos" || offer.provider === "bob" || offer.provider === "usbl") {
      return formatCompactRewardLabel(offer) ?? formatRewardLabel(offer.reward, offer.provider);
    }
    return "Cashback";
  }
  function addChipTooltip(chip, text, shadowRoot) {
    const tooltip = document.createElement("div");
    tooltip.className = "bonus-chip-tooltip";
    tooltip.textContent = text;
    shadowRoot.append(tooltip);
    chip.addEventListener("mouseenter", () => {
      const panelEl = shadowRoot.querySelector(".panel");
      const panelRect = panelEl?.getBoundingClientRect();
      const rect = chip.getBoundingClientRect();
      tooltip.style.left = "-9999px";
      tooltip.style.top = "-9999px";
      tooltip.classList.add("visible");
      const tooltipHeight = tooltip.offsetHeight;
      const rightEdge = panelRect ? panelRect.right + 6 : rect.right + 6;
      tooltip.style.left = `${rightEdge}px`;
      tooltip.style.top = `${rect.top + rect.height / 2 - tooltipHeight / 2}px`;
      tooltip.style.transform = "none";
    });
    chip.addEventListener("mouseleave", () => {
      tooltip.classList.remove("visible");
    });
  }
})();
