// ==UserScript==
// @name         cashbacknorge.no
// @namespace    https://cashbacknorge.no/
// @version      1781526456
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
// @connect      api.gg.deals
// @connect      gg.deals
// @connect      www.allkeyshop.com
// @connect      itunes.apple.com
// @connect      appstoreprice.org
// @connect      namx6ho175-dsn.algolia.net
// @connect      isthereanydeal.com
// @connect      www.klarna.com
// @connect      www.playstation.com
// @connect      store.playstation.com
// @connect      www.vinmonopolet.no
// @connect      vinmonopolet.no
// @connect      open.er-api.com
// @connect      api.travelpayouts.com
// @connect      gql.prisradar.no
// @connect      prisradar.no
// @connect      www.sesum.no
// @connect      sesum.no
// @connect      enhver.no
// @connect      api.enhver.no
// @connect      kassal.app
// @connect      www.finn.no
// @connect      www.momondo.no
// @connect      www.travellink.no
// @connect      www.skyscanner.no
// @connect      www.skyscanner.net
// @connect      us.trip.com
// @connect      www.trip.com
// @connect      worka.panflights.com
// @connect      workb.panflights.com
// @connect      panflights.com
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
    unio: "Unio",
    coop: "Coop"
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
        return `${formatKr(amount * pct / 100)} kr støtte`;
      }
      const fixedKrMatch = offer.reward.match(/(\d+(?:[,.]\d+)?)\s*kr/i);
      if (fixedKrMatch !== null) {
        const fixedKr = Number.parseFloat(fixedKrMatch[1]?.replace(",", ".") ?? "0");
        return `${formatKr(fixedKr)} kr støtte`;
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
  function isRecord$5(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  const PRODUCT_TITLE_BASE_MATCH_SEPARATORS = [
    /\s+\|\s+/,
    /\s+[-\u2013\u2014]\s+/,
    /\s+\u2022\s+/
  ];
  const CANONICAL_MATCH_TOKENS$1 = /* @__PURE__ */ new Map([
    ["black", "svart"],
    ["blue", "bla"],
    ["brown", "brun"],
    ["carbon", "svart"],
    ["controller", "kontroller"],
    ["controllers", "kontroller"],
    ["gamepad", "kontroller"],
    ["gamepads", "kontroller"],
    ["gold", "gull"],
    ["gray", "gra"],
    ["green", "gronn"],
    ["grey", "gra"],
    ["joypad", "kontroller"],
    ["orange", "oransje"],
    ["pink", "rosa"],
    ["purple", "lilla"],
    ["red", "rod"],
    ["silver", "solv"],
    ["wireless", "tradlos"],
    ["sort", "svart"],
    ["white", "hvit"],
    ["yellow", "gul"]
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
      const weight = isModelNumberLikeToken(token) ? 3 : token.length >= 6 ? 2 : token.length >= 4 ? 1.5 : 1;
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
    if (isModelNumberLikeToken(token)) return true;
    return token.length >= 6 && /[a-z]/.test(token) && !/\d/.test(token) && !GENERIC_PRODUCT_SIGNAL_TOKENS.has(token);
  }
  function isModelNumberLikeToken(token) {
    return token.length >= 4 && /[a-z]/.test(token) && /\d/.test(token) && !isMeasurementUnitLikeToken(token);
  }
  function isMeasurementUnitLikeToken(token) {
    return /^\d+(?:[.,]\d+)?(?:ml|cl|dl|l|g|gr|kg|mg|gb|tb|mb|mm|cm|m|km|w|kw|wh|kwh|mah|hz|khz|ghz|v|a|ah|stk|pk|pcs|fps|tommer|tum|in)$/.test(token);
  }
  function buildProductTitleBaseCandidates(searchTerm) {
    const normalizedSearchTerm = searchTerm.trim().replace(/\s+/g, " ");
    const separatorPrefixCandidates = PRODUCT_TITLE_BASE_MATCH_SEPARATORS.map((separator) => normalizedSearchTerm.split(separator)[0]);
    const buyTitleMatch = normalizedSearchTerm.match(/^(?:kj\u00f8p|kjop|buy)\s+(.+?)\s+(?:hos|at)\s+.+$/i);
    return uniqueStrings$e([
      normalizedSearchTerm,
      ...separatorPrefixCandidates,
      buyTitleMatch?.[1]
    ]).filter((candidate) => candidate.length >= 4);
  }
  function tokenizeMatchText$1(value) {
    const normalizedValue = transliterateNorwegianCharacters$5(value).normalize("NFD").replace(/\p{Diacritic}/gu, "");
    return uniqueStrings$e(normalizedValue.split(/[^A-Za-z0-9]+/).map(normalizeMatchToken$1).filter((token) => token !== void 0 && token.length >= 2).map(canonicalizeMatchToken$1));
  }
  function normalizeMatchToken$1(value) {
    const normalized = transliterateNorwegianCharacters$5(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
    return normalized.length > 0 ? normalized : void 0;
  }
  function canonicalizeMatchToken$1(token) {
    return CANONICAL_MATCH_TOKENS$1.get(token) ?? token;
  }
  function hasUnrequestedConditionVariant$1(queryTokens, titleTokens) {
    return CONDITION_VARIANT_TOKENS$1.some((token) => titleTokens.has(token) && !queryTokens.includes(token));
  }
  function transliterateNorwegianCharacters$5(value) {
    return value.replace(/[\u00C6\u00E6]/g, "ae").replace(/[\u00D8\u00F8]/g, "o").replace(/[\u00C5\u00E5]/g, "a");
  }
  function uniqueStrings$e(values) {
    return [...new Set(values.map((value) => value?.trim()).filter((value) => value !== void 0 && value.length > 0))];
  }
  const AUGMENTED_STEAM_PRICES_URL = "https://api.augmentedsteam.com/prices/v2";
  const ISTHEREANYDEAL_ORIGIN = "https://isthereanydeal.com";
  const ISTHEREANYDEAL_GEO_URL = `${ISTHEREANYDEAL_ORIGIN}/api/geo/`;
  const ISTHEREANYDEAL_GAME_INFO_URL = `${ISTHEREANYDEAL_ORIGIN}/api/game/info/`;
  const ISTHEREANYDEAL_SEARCH_GAMES_URL = `${ISTHEREANYDEAL_ORIGIN}/search/api/games/`;
  const MAX_ITAD_ALTERNATIVES = 8;
  const MAX_STEAM_PURCHASE_TARGETS = 8;
  const EPIC_GAME_STORE_SHOP_ID = 16;
  const MICROSOFT_STORE_SHOP_ID = 48;
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
  async function findIsthereanydealPriceMatch(message, requestJson = fetchJson$8, requestText = fetchText$7) {
    const target = await resolveItadProductTarget(message, requestJson, requestText);
    if (target === void 0) return void 0;
    const pageContext = target.pageContext;
    const gameInfo = await fetchItadGameInfoWithNok(pageContext, requestJson);
    const deals = readItadDeals(gameInfo, pageContext.shops).filter((deal) => deal.currency === "NOK").filter((deal) => isItadDealInScope(deal, target.dealScope)).sort((first, second) => first.amount - second.amount);
    const bestDeal = deals[0];
    if (bestDeal === void 0) return void 0;
    const matchedCurrentMerchant = deals.some((deal) => deal.shopId === target.currentShopId);
    if (target.dealScope === "microsoft" && !matchedCurrentMerchant) return void 0;
    const productName = pageContext.title ?? target.productName ?? readGameProductName$1(message) ?? "PC-spill";
    const productUrl = pageContext.slug !== void 0 ? `${ISTHEREANYDEAL_ORIGIN}/game/${pageContext.slug}/info/` : pageContext.infoUrl;
    return {
      source: "isthereanydeal",
      sourceName: "IsThereAnyDeal",
      matchedCurrentMerchant,
      shopName: bestDeal.shopName,
      amount: bestDeal.amount,
      sortAmount: bestDeal.amount,
      currency: bestDeal.currency,
      price: bestDeal.price,
      productName,
      productUrl,
      alternatives: deals.slice(0, MAX_ITAD_ALTERNATIVES).map(toPriceMatchAlternative$2)
    };
  }
  function isItadGameStoreProductUrl(rawUrl) {
    return isSteamAppProductUrl(rawUrl) || isEpicGamesStoreProductUrl(rawUrl) || isMicrosoftStoreProductUrl(rawUrl);
  }
  function isMicrosoftStoreProductUrl(rawUrl) {
    return readMicrosoftStoreProductTarget(rawUrl) !== void 0;
  }
  function isEpicGamesStoreProductUrl(rawUrl) {
    return parseEpicGamesProductSlug(rawUrl) !== void 0;
  }
  function isSteamAppProductUrl(rawUrl) {
    return parseSteamAppId(rawUrl) !== void 0;
  }
  async function resolveItadProductTarget(message, requestJson, requestText) {
    return await resolveSteamItadProductTarget(message, requestJson, requestText) ?? await resolveEpicItadProductTarget(message, requestJson, requestText) ?? await resolveMicrosoftStoreItadProductTarget(message, requestJson, requestText);
  }
  async function resolveSteamItadProductTarget(message, requestJson, requestText) {
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
    const productName = readSteamProductName$1(message);
    return {
      pageContext,
      currentShopId: STEAM_SHOP_ID,
      ...productName !== void 0 ? { productName } : {}
    };
  }
  async function resolveEpicItadProductTarget(message, requestJson, requestText) {
    const epicSlug = parseEpicGamesProductSlug(message.url) ?? parseEpicGamesProductSlug(message.productUrl);
    if (epicSlug === void 0) return void 0;
    return resolveSearchableItadProductTarget({
      message,
      requestJson,
      requestText,
      currentShopId: EPIC_GAME_STORE_SHOP_ID,
      slug: epicSlug
    });
  }
  async function resolveMicrosoftStoreItadProductTarget(message, requestJson, requestText) {
    const productTarget = readMicrosoftStoreProductTarget(message.url) ?? readMicrosoftStoreProductTarget(message.productUrl);
    if (productTarget === void 0) return void 0;
    return resolveSearchableItadProductTarget({
      message,
      requestJson,
      requestText,
      currentShopId: MICROSOFT_STORE_SHOP_ID,
      dealScope: "microsoft",
      ...productTarget.slug !== void 0 ? { slug: productTarget.slug } : {}
    });
  }
  async function resolveSearchableItadProductTarget(input) {
    const { message, requestJson, requestText, currentShopId, slug, dealScope } = input;
    const titleCandidates = readGameTitleCandidates$2(message, slug);
    if (slug !== void 0) {
      const directContext = await fetchItadPageContext(itadGameInfoUrl(slug), requestText);
      if (directContext !== void 0 && isItadGameContextLikelyMatch(directContext, titleCandidates, slug)) {
        return {
          pageContext: directContext,
          currentShopId,
          ...dealScope !== void 0 ? { dealScope } : {},
          ...titleCandidates[0] !== void 0 ? { productName: titleCandidates[0] } : {}
        };
      }
    }
    for (const query of titleCandidates) {
      const games = await fetchItadSearchGames(query, requestJson);
      const game = chooseBestItadSearchGame(games, query, slug);
      if (game === void 0) continue;
      const pageContext = await fetchItadPageContext(itadGameInfoUrl(game.slug), requestText);
      if (pageContext !== void 0 && isItadGameContextLikelyMatch(pageContext, titleCandidates, slug)) {
        return {
          pageContext,
          currentShopId,
          ...dealScope !== void 0 ? { dealScope } : {},
          productName: game.title
        };
      }
    }
    return void 0;
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
  function parseEpicGamesProductSlug(rawUrl) {
    if (rawUrl === void 0) return void 0;
    try {
      const url = new URL(rawUrl);
      const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
      if (hostname !== "store.epicgames.com") return void 0;
      const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
      const productIndex = segments.findIndex((segment) => segment.toLowerCase() === "p");
      const rawSlug = productIndex >= 0 ? segments[productIndex + 1] : void 0;
      if (rawSlug === void 0) return void 0;
      return normalizeSlug(decodeURIComponent(rawSlug));
    } catch {
      return void 0;
    }
  }
  function readMicrosoftStoreProductTarget(rawUrl) {
    if (rawUrl === void 0) return void 0;
    try {
      const url = new URL(rawUrl);
      const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
      const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
      if (hostname === "xbox.com" || hostname === "www.xbox.com") {
        const storeIndex = segments.findIndex((segment, index) => {
          return segment.toLowerCase() === "store" && segments[index - 1]?.toLowerCase() === "games";
        });
        const rawSlug = storeIndex >= 0 ? segments[storeIndex + 1] : void 0;
        const productId = storeIndex >= 0 ? segments[storeIndex + 2] : void 0;
        if (!isMicrosoftStoreProductId(productId)) return void 0;
        const slug = rawSlug !== void 0 ? normalizeSlug(decodeURIComponent(rawSlug)) : void 0;
        return slug !== void 0 && slug.length > 0 ? { slug } : {};
      }
      if (hostname === "apps.microsoft.com") {
        const detailIndex = segments.findIndex((segment) => segment.toLowerCase() === "detail");
        if (detailIndex < 0) return void 0;
        const firstDetailSegment = segments[detailIndex + 1];
        const secondDetailSegment = segments[detailIndex + 2];
        if (isMicrosoftStoreProductId(firstDetailSegment)) return {};
        if (!isMicrosoftStoreProductId(secondDetailSegment)) return void 0;
        const slug = firstDetailSegment !== void 0 ? normalizeSlug(decodeURIComponent(firstDetailSegment)) : void 0;
        return slug !== void 0 && slug.length > 0 ? { slug } : {};
      }
      return void 0;
    } catch {
      return void 0;
    }
  }
  function isMicrosoftStoreProductId(value) {
    return value !== void 0 && /^[a-z0-9]{8,}$/i.test(value);
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
    if (!isRecord$4(value) || !isRecord$4(value.prices)) return void 0;
    for (const target of targets) {
      const targetPrices = value.prices[`${target.type}/${target.id}`];
      if (!isRecord$4(targetPrices)) continue;
      const urls = isRecord$4(targetPrices.urls) ? targetPrices.urls : void 0;
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
  async function fetchItadSearchGames(query, requestJson) {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) return [];
    const searchParams = new URLSearchParams({ q: trimmedQuery });
    return readItadSearchGames(await requestJson(`${ISTHEREANYDEAL_SEARCH_GAMES_URL}?${searchParams.toString()}`, {
      headers: { "Accept": "application/json" }
    }));
  }
  function readItadSearchGames(value) {
    const results = Array.isArray(value) ? value : isRecord$4(value) && Array.isArray(value.games) ? value.games : [];
    return results.map((game) => {
      if (!isRecord$4(game)) return void 0;
      const slug = typeof game.slug === "string" && game.slug.length > 0 ? game.slug : void 0;
      const title = typeof game.title === "string" && game.title.length > 0 ? game.title : void 0;
      const type = readNumber$1(game.type);
      if (slug === void 0 || title === void 0) return void 0;
      return {
        slug,
        title,
        ...type !== void 0 ? { type } : {}
      };
    }).filter((game) => game !== void 0);
  }
  function chooseBestItadSearchGame(games, query, expectedSlug) {
    const expectedSlugKey = expectedSlug !== void 0 ? normalizeSlug(expectedSlug) : void 0;
    return games.map((game, index) => {
      const slugKey = normalizeSlug(game.slug);
      const exactSlugScore = expectedSlugKey !== void 0 && slugKey === expectedSlugKey ? 1.25 : 0;
      const titleScore = scoreProductTitleAgainstSearchTerm(query, game.title);
      const slugScore = scoreProductTitleAgainstSearchTerm(query, humanizeSlug$1(game.slug));
      const typeBonus = game.type === 1 ? 0.04 : game.type === 2 ? 0.02 : 0;
      return {
        game,
        exactSlugScore,
        score: Math.max(exactSlugScore, titleScore, slugScore) + typeBonus - index * 1e-3
      };
    }).filter(({ exactSlugScore, score }) => exactSlugScore > 0 || score >= 0.55).sort((first, second) => second.score - first.score)[0]?.game;
  }
  function isItadGameContextLikelyMatch(pageContext, titleCandidates, expectedSlug) {
    if (expectedSlug !== void 0 && pageContext.slug !== void 0 && normalizeSlug(pageContext.slug) === normalizeSlug(expectedSlug)) {
      return true;
    }
    if (pageContext.title === void 0) return false;
    return titleCandidates.some((candidate) => {
      return isLikelySameProductTitle(candidate, pageContext.title ?? "", 0.58) || scoreProductTitleAgainstSearchTerm(candidate, pageContext.title ?? "") >= 0.72;
    });
  }
  function readGameTitleCandidates$2(message, slug) {
    return uniqueStrings$d([
      ...(message.productTitleCandidates ?? []).flatMap(readGameTitleCandidateVariants$2),
      ...readGameTitleCandidateVariants$2(message.searchTerm),
      readSteamProductName$1(message),
      slug !== void 0 ? humanizeSlug$1(slug) : void 0
    ]).filter((candidate) => candidate.length >= 2 && candidate.length <= 120);
  }
  function readGameTitleCandidateVariants$2(value) {
    if (value === void 0) return [];
    const normalized = value.trim().replace(/\s+/g, " ");
    if (normalized.length === 0) return [];
    const withoutKnownSuffix = normalized.replace(/\s+\|\s+.*$/i, "").replace(/\s+[-\u2013\u2014]\s+(?:Epic Games Store|Steam Store|Steam|Microsoft Store|Xbox(?: Store)?|PlayStation Store).*$/i, "").replace(/\s+(?:hos|at)\s+(?:Epic Games Store|Steam Store|Steam)$/i, "");
    const withoutBuyPrefix = withoutKnownSuffix.replace(/^(?:kj\u00f8p|kjop|buy)\s+/i, "").trim();
    return uniqueStrings$d([withoutBuyPrefix, withoutKnownSuffix, normalized]).filter((candidate) => candidate.length > 0);
  }
  function itadGameInfoUrl(slug) {
    return `${ISTHEREANYDEAL_ORIGIN}/game/${encodeURIComponent(normalizeSlug(slug))}/info/`;
  }
  function humanizeSlug$1(slug) {
    return slug.replace(/--+/g, " ").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function normalizeSlug(value) {
    return value.replace(/[\u00C6\u00E6]/g, "ae").replace(/[\u00D8\u00F8]/g, "o").replace(/[\u00C5\u00E5]/g, "a").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  }
  async function fetchItadPageContext(infoUrl, requestText) {
    const html = await requestText(infoUrl, {
      headers: { "Accept": "text/html" },
      credentials: "include"
    });
    if (html === void 0) return void 0;
    const globalState = parseScriptJson(html, /var g = (\{[\s\S]*?\});\s*var page = /);
    const pageState = parseScriptJson(html, /var page = (\[[\s\S]*?\]);\s*var /);
    if (!isRecord$4(globalState) || !Array.isArray(pageState)) return void 0;
    const user = isRecord$4(globalState.user) ? globalState.user : void 0;
    const token = typeof user?.token === "string" && user.token.length > 0 ? user.token : void 0;
    const visitorId = typeof user?.id === "string" && user.id.length > 0 ? user.id : void 0;
    const shops = readItadShops(globalState.shops);
    const pageProps = isRecord$4(pageState[1]) ? pageState[1] : void 0;
    const game = isRecord$4(pageProps?.game) ? pageProps.game : void 0;
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
    if (!isRecord$4(value)) return shops;
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
    if (!isRecord$4(value) || !Array.isArray(value.deals)) return [];
    return value.deals.map((deal) => readItadDeal(deal, shops)).filter((deal) => deal !== void 0);
  }
  function isItadDealInScope(deal, scope) {
    if (scope === void 0) return true;
    if (scope === "microsoft") return isMicrosoftStoreDeal(deal);
    return true;
  }
  function isMicrosoftStoreDeal(deal) {
    if (deal.shopId === MICROSOFT_STORE_SHOP_ID) return true;
    const platform = deal.platform?.toLowerCase() ?? "";
    return platform.includes("microsoft") || platform.includes("xbox") || platform.includes("windows");
  }
  function hasNokDeal(value) {
    if (!isRecord$4(value) || !Array.isArray(value.deals)) return false;
    return value.deals.some((deal) => {
      if (!isRecord$4(deal)) return false;
      const price = readItadPrice(deal.priceNew);
      return price?.currency === "NOK";
    });
  }
  function readItadDeal(value, shops) {
    if (!isRecord$4(value)) return void 0;
    const shopId = readNumber$1(value.shop);
    const price = readItadPrice(value.priceNew);
    if (shopId === void 0 || price === void 0 || price.amount <= 0) return void 0;
    const shopName = shops.get(shopId);
    if (shopName === void 0) return void 0;
    const url = typeof value.url === "string" && value.url.length > 0 ? value.url : void 0;
    const platform = readItadDealPlatform(value.drm);
    const voucher = typeof value.voucher === "string" && value.voucher.trim().length > 0 ? value.voucher.trim() : void 0;
    return {
      shopId,
      shopName,
      amount: price.amount,
      currency: price.currency,
      price: formatCurrency$4(price.amount, price.currency),
      ...platform !== void 0 ? { platform } : {},
      ...url !== void 0 ? { url } : {},
      ...voucher !== void 0 ? { voucher } : {}
    };
  }
  function readItadDealPlatform(value) {
    const platformNames = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
    const names = uniqueStrings$d(platformNames.filter((item) => typeof item === "string").map((item) => item.trim()).filter((item) => item.length > 0));
    return names.length > 0 ? names.join(", ") : void 0;
  }
  function readItadPrice(value) {
    if (!Array.isArray(value) || value.length < 2) return void 0;
    const amountMinor = readNumber$1(value[0]);
    const currency = typeof value[1] === "string" ? value[1].toUpperCase() : void 0;
    if (amountMinor === void 0 || currency === void 0) return void 0;
    const scale = currencyScale$2(currency);
    return {
      amount: amountMinor / Math.pow(10, scale),
      currency
    };
  }
  function toPriceMatchAlternative$2(deal) {
    return {
      shopName: deal.shopName,
      amount: deal.amount,
      sortAmount: deal.amount,
      currency: deal.currency,
      price: deal.price,
      ...deal.platform !== void 0 ? { platform: deal.platform } : {},
      ...deal.voucher !== void 0 ? { shippingPrice: `kode ${deal.voucher}` } : {}
    };
  }
  function readGameProductName$1(message) {
    return readGameTitleCandidates$2(message)[0];
  }
  function readSteamProductName$1(message) {
    const slugName = readSteamProductNameFromUrl$1(message.url) ?? readSteamProductNameFromUrl$1(message.productUrl);
    if (slugName !== void 0) return slugName;
    const cleaned = message.searchTerm.replace(/^spar\s+\d+\s*%\s+på\s+/i, "").replace(/\s+i\s+steam$/i, "").trim();
    return cleaned.length > 0 ? cleaned : void 0;
  }
  function readSteamProductNameFromUrl$1(rawUrl) {
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
  function formatCurrency$4(amount, currency) {
    try {
      return new Intl.NumberFormat("nb-NO", {
        style: "currency",
        currency,
        maximumFractionDigits: currencyScale$2(currency)
      }).format(amount);
    } catch {
      return `${amount.toFixed(currencyScale$2(currency))} ${currency}`;
    }
  }
  function currencyScale$2(currency) {
    if ((/* @__PURE__ */ new Set(["JPY", "KRW", "CLP", "VND", "IDR"])).has(currency.toUpperCase())) return 0;
    if ((/* @__PURE__ */ new Set(["BHD", "KWD", "OMR"])).has(currency.toUpperCase())) return 3;
    return 2;
  }
  async function fetchJson$8(url, init) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) return void 0;
      const text = await response.text();
      return text.length > 0 ? JSON.parse(text) : void 0;
    } catch {
      return void 0;
    }
  }
  async function fetchText$7(url, init) {
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
  function isRecord$4(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function uniqueStrings$d(values) {
    return [...new Set(values.map((value) => value?.trim()).filter((value) => value !== void 0 && value.length > 0))];
  }
  const ALLKEYSHOP_ORIGIN = "https://www.allkeyshop.com";
  const ALLKEYSHOP_BLOG_ORIGIN = `${ALLKEYSHOP_ORIGIN}/blog`;
  const EXCHANGE_RATES_URL$1 = "https://open.er-api.com/v6/latest/NOK";
  const MAX_ALLKEYSHOP_ALTERNATIVES = 8;
  const STATIC_NOK_BASE_RATES = {
    rates: {
      AUD: 0.15,
      CAD: 0.148,
      DKK: 0.686,
      EUR: 0.092,
      GBP: 0.079,
      NOK: 1,
      PLN: 0.39,
      SEK: 1,
      USD: 0.106
    }
  };
  const ALLKEYSHOP_HTML_REQUESTS = [
    {
      headers: { "Accept": "text/html,application/xhtml+xml" },
      credentials: "include"
    },
    {
      headers: { "Accept": "text/html,application/xhtml+xml" }
    }
  ];
  async function findAllKeyShopPriceMatch(message, requestJson = fetchJson$7, requestText = fetchText$6) {
    if (!isAllKeyShopSupportedGameUrl(message.url) && !isAllKeyShopSupportedGameUrl(message.productUrl)) {
      return void 0;
    }
    const page = await fetchAllKeyShopPageData(message, requestText);
    if (page === void 0) return void 0;
    const rates = await fetchNokBaseRates$1(requestJson) ?? STATIC_NOK_BASE_RATES;
    const platformScope = readPlatformScope(message);
    const titleCandidates = readGameTitleCandidates$1(message);
    const offers = page.data.prices.filter((price) => price.dispo === void 0 || price.dispo > 0).filter((price) => price.account !== true).filter((price) => isActivationPlatformAllowed(price.activationPlatform, platformScope)).filter((price) => isAllKeyShopEditionAllowed(page.data.editions.get(price.edition ?? ""), titleCandidates)).map((price) => toAllKeyShopOffer(price, page.data.currency, page.data.editions, page.data.regions, rates)).filter((offer) => offer !== void 0).sort((first, second) => first.amount - second.amount);
    const best = offers[0];
    if (best === void 0) return void 0;
    const productName = page.data.title ?? titleCandidates[0] ?? "PC-spill";
    return {
      source: "allkeyshop",
      sourceName: "ALLKEYSHOP",
      matchedExactProduct: true,
      shopName: best.shopName,
      amount: best.amount,
      sortAmount: best.amount,
      currency: best.currency,
      price: formatApproxCurrency(best.amount, best.currency),
      productName,
      productUrl: page.url,
      alternatives: offers.slice(0, MAX_ALLKEYSHOP_ALTERNATIVES).map(toPriceMatchAlternative$1)
    };
  }
  function isAllKeyShopSupportedGameUrl(rawUrl) {
    return isSteamAppProductUrl(rawUrl) || isEpicGamesStoreProductUrl(rawUrl) || isMicrosoftStoreProductUrl(rawUrl) || isAllKeyShopProductUrl(rawUrl);
  }
  function isAllKeyShopProductUrl(rawUrl) {
    if (rawUrl === void 0) return false;
    try {
      const url = new URL(rawUrl);
      const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
      return hostname === "allkeyshop.com" && /\/blog\/buy-[^/]+-cd-key-compare-prices\/?$/i.test(url.pathname);
    } catch {
      return false;
    }
  }
  async function fetchAllKeyShopPageData(message, requestText) {
    const titleCandidates = readGameTitleCandidates$1(message);
    for (const url of buildAllKeyShopPageUrlCandidates(message, titleCandidates)) {
      for (const init of ALLKEYSHOP_HTML_REQUESTS) {
        const html = await requestText(url, init);
        if (html === void 0) continue;
        const data = readAllKeyShopData(html);
        if (data === void 0 || !isLikelyAllKeyShopProductMatch(data.title, titleCandidates, url)) continue;
        return { data, url };
      }
    }
    return void 0;
  }
  function buildAllKeyShopPageUrlCandidates(message, titleCandidates) {
    const directUrls = [message.url, message.productUrl].filter((url) => url !== void 0 && isAllKeyShopProductUrl(url));
    const epicSlug = parseEpicGamesProductSlug(message.url) ?? parseEpicGamesProductSlug(message.productUrl);
    const slugUrls = uniqueStrings$c([
      epicSlug,
      ...titleCandidates.map(toAllKeyShopSlug)
    ]).map((slug) => `${ALLKEYSHOP_BLOG_ORIGIN}/buy-${encodeURIComponent(slug)}-cd-key-compare-prices/`);
    return uniqueStrings$c([...directUrls, ...slugUrls]);
  }
  function readAllKeyShopData(html) {
    const gamePageTrans = readAssignedJsonObject(html, "gamePageTrans");
    if (!isRecord$5(gamePageTrans) || !Array.isArray(gamePageTrans.prices)) return void 0;
    const prices = gamePageTrans.prices.map(readAllKeyShopRawPrice).filter((price) => price !== void 0);
    if (prices.length === 0) return void 0;
    return {
      currency: readAllKeyShopCurrency(html),
      editions: readAllKeyShopEditions(gamePageTrans.editions),
      prices,
      regions: readAllKeyShopRegions(gamePageTrans.regions),
      ...readAllKeyShopTitle(html)
    };
  }
  function readAllKeyShopRawPrice(value) {
    if (!isRecord$5(value)) return void 0;
    const merchantName = readString$1(value.merchantName);
    const amount = readAmount$1(value.price);
    if (merchantName === void 0 || amount === void 0 || amount <= 0) return void 0;
    const activationPlatform = readString$1(value.activationPlatform);
    const edition = readString$1(value.edition);
    const region = readString$1(value.region);
    const voucherCode = readString$1(value.voucher_code);
    return {
      merchantName,
      price: amount,
      ...readOptionalAmount$1("priceCard", value.priceCard),
      ...readOptionalAmount$1("pricePaypal", value.pricePaypal),
      ...typeof value.account === "boolean" ? { account: value.account } : {},
      ...typeof value.dispo === "number" ? { dispo: value.dispo } : {},
      ...typeof value.isOfficial === "boolean" ? { isOfficial: value.isOfficial } : {},
      ...activationPlatform !== void 0 ? { activationPlatform } : {},
      ...edition !== void 0 ? { edition } : {},
      ...region !== void 0 ? { region } : {},
      ...voucherCode !== void 0 ? { voucherCode } : {}
    };
  }
  function readOptionalAmount$1(key, value) {
    const amount = readAmount$1(value);
    return amount !== void 0 && amount > 0 ? { [key]: amount } : {};
  }
  function readAllKeyShopCurrency(html) {
    const siteCurrency = html.match(/window\.__site\s*=\s*\{[\s\S]{0,1200}?"currency"\s*:\s*"([a-z]{3})"/i)?.[1];
    if (siteCurrency !== void 0) return siteCurrency.toUpperCase();
    const schemaCurrency = html.match(/"priceCurrency"\s*:\s*"([a-z]{3})"/i)?.[1];
    return schemaCurrency !== void 0 ? schemaCurrency.toUpperCase() : "EUR";
  }
  function readAllKeyShopEditions(value) {
    const editions = /* @__PURE__ */ new Map();
    if (!isRecord$5(value)) return editions;
    for (const [id, edition] of Object.entries(value)) {
      if (!isRecord$5(edition)) continue;
      const name = readString$1(edition.name);
      if (name !== void 0) editions.set(id, name);
    }
    return editions;
  }
  function readAllKeyShopRegions(value) {
    const regions = /* @__PURE__ */ new Map();
    if (!isRecord$5(value)) return regions;
    for (const [id, region] of Object.entries(value)) {
      if (!isRecord$5(region)) continue;
      const name = readString$1(region.region_name) ?? readString$1(region.filter_name);
      if (name !== void 0) regions.set(id, name);
    }
    return regions;
  }
  function readAllKeyShopTitle(html) {
    const h1 = stripTags$1(decodeHtml$3(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? ""));
    const title = h1.replace(/^Buy\s+/i, "").replace(/\s+CD Key\s+Compare Prices.*$/i, "").replace(/\s+Compare Prices.*$/i, "").trim();
    return title.length > 0 ? { title } : {};
  }
  function toAllKeyShopOffer(price, currency, editions, regions, rates) {
    const amount = pickAllKeyShopPayableAmount(price);
    const nokAmount = convertToNok$1(amount, currency, rates);
    if (nokAmount === void 0) return void 0;
    const platform = formatActivationPlatform(price.activationPlatform);
    const region = price.region !== void 0 ? regions.get(price.region) : void 0;
    const edition = price.edition !== void 0 ? editions.get(price.edition) : void 0;
    return {
      amount: nokAmount,
      currency: "NOK",
      originalAmount: amount,
      originalCurrency: currency,
      shopName: price.merchantName,
      ...platform !== void 0 ? { platform } : {},
      ...region !== void 0 ? { region } : {},
      ...edition !== void 0 ? { edition } : {},
      ...price.voucherCode !== void 0 ? { voucherCode: price.voucherCode } : {}
    };
  }
  function pickAllKeyShopPayableAmount(price) {
    const payableAmounts = [
      price.priceCard,
      price.pricePaypal
    ].filter((amount) => amount !== void 0 && Number.isFinite(amount) && amount > 0).sort((first, second) => first - second);
    return payableAmounts[0] ?? price.price;
  }
  function toPriceMatchAlternative$1(offer) {
    return {
      shopName: offer.shopName,
      amount: offer.amount,
      sortAmount: offer.amount,
      currency: offer.currency,
      price: formatApproxCurrency(offer.amount, offer.currency),
      ...(() => {
        const details = formatAllKeyShopTooltipDetails(offer);
        return details !== void 0 ? { platform: details } : {};
      })()
    };
  }
  function formatAllKeyShopTooltipDetails(offer) {
    const details = [
      offer.platform,
      offer.region,
      offer.edition,
      offer.voucherCode !== void 0 ? `kode ${offer.voucherCode}` : void 0
    ].filter((detail) => detail !== void 0 && detail.length > 0);
    return details.length > 0 ? details.join(", ") : void 0;
  }
  async function fetchNokBaseRates$1(requestJson) {
    const value = await requestJson(EXCHANGE_RATES_URL$1, {
      headers: { "Accept": "application/json" }
    });
    if (!isRecord$5(value) || value.result !== "success" || !isRecord$5(value.rates)) return void 0;
    const rates = {};
    for (const [currency, rate] of Object.entries(value.rates)) {
      if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
        rates[currency.toUpperCase()] = rate;
      }
    }
    return Object.keys(rates).length > 0 ? { rates } : void 0;
  }
  function convertToNok$1(amount, currency, rates) {
    const normalizedCurrency = currency.toUpperCase();
    if (normalizedCurrency === "NOK") return amount;
    const rate = rates.rates[normalizedCurrency];
    if (typeof rate !== "number" || rate <= 0) return void 0;
    return amount / rate;
  }
  function readPlatformScope(message) {
    if (isSteamAppProductUrl(message.url) || isSteamAppProductUrl(message.productUrl)) {
      return ["steam", "microsoft-windows", "windows", "xbox-play-anywhere"];
    }
    if (isEpicGamesStoreProductUrl(message.url) || isEpicGamesStoreProductUrl(message.productUrl)) return ["epic", "epic-store", "epic-games", "epic-games-store"];
    if (isMicrosoftStoreProductUrl(message.url) || isMicrosoftStoreProductUrl(message.productUrl)) {
      return ["microsoft-windows", "windows", "xbox", "xbox-play-anywhere"];
    }
    return [];
  }
  function isActivationPlatformAllowed(value, allowedPlatforms) {
    if (allowedPlatforms.length === 0) return true;
    if (value === void 0) return false;
    const normalized = normalizePlatform(value);
    return allowedPlatforms.some((platform) => normalized === normalizePlatform(platform));
  }
  function formatActivationPlatform(value) {
    if (value === void 0) return void 0;
    const normalized = normalizePlatform(value);
    if (normalized === "steam") return "Steam";
    if (normalized === "epic" || normalized === "epic-store" || normalized === "epic-games" || normalized === "epic-games-store") return "Epic Games";
    if (normalized === "microsoft-windows" || normalized === "windows") return "Microsoft Store";
    if (normalized === "xbox-play-anywhere") return "Xbox Play Anywhere";
    if (normalized === "xbox") return "Xbox";
    return value.split(/[-_\s]+/g).filter((part) => part.length > 0).map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
  }
  function normalizePlatform(value) {
    return value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  }
  function isAllKeyShopEditionAllowed(editionName, titleCandidates) {
    const targetEdition = readEditionKeyword(titleCandidates.join(" "));
    if (targetEdition === void 0) {
      return editionName === void 0 || isStandardEdition(editionName);
    }
    if (editionName === void 0) return true;
    return normalizeEdition(editionName).includes(targetEdition);
  }
  function readEditionKeyword(value) {
    const normalized = normalizeEdition(value);
    for (const keyword of ["premium", "deluxe", "ultimate", "complete", "collector", "constellation", "special", "gold"]) {
      if (normalized.includes(keyword)) return keyword;
    }
    return void 0;
  }
  function isStandardEdition(value) {
    const normalized = normalizeEdition(value);
    return normalized === "standard" || normalized === "base" || normalized === "normal";
  }
  function normalizeEdition(value) {
    return value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, " ").trim();
  }
  function isLikelyAllKeyShopProductMatch(title, titleCandidates, url) {
    if (title === void 0) return true;
    const slug = url.match(/\/buy-([^/]+)-cd-key-compare-prices\/?$/i)?.[1];
    if (slug !== void 0 && titleCandidates.some((candidate) => toAllKeyShopSlug(candidate) === slug)) return true;
    return titleCandidates.some((candidate) => scoreProductTitleAgainstSearchTerm(candidate, title) >= 0.72);
  }
  function readGameTitleCandidates$1(message) {
    return uniqueStrings$c([
      ...(message.productTitleCandidates ?? []).flatMap(readGameTitleCandidateVariants$1),
      ...readGameTitleCandidateVariants$1(message.searchTerm),
      readSteamProductName(message),
      ...readGameTitleCandidateVariants$1(parseEpicGamesProductSlug(message.url)),
      ...readGameTitleCandidateVariants$1(parseEpicGamesProductSlug(message.productUrl))
    ]).filter((candidate) => candidate.length >= 2 && candidate.length <= 120);
  }
  function readGameTitleCandidateVariants$1(value) {
    if (value === void 0) return [];
    const normalized = humanizeSlug(value).trim().replace(/\s+/g, " ");
    if (normalized.length === 0) return [];
    const withoutKnownSuffix = normalized.replace(/\s+\|\s+.*$/i, "").replace(/\s+[-\u2013\u2014]\s+(?:Epic Games Store|Steam Store|Steam|Microsoft Store|Xbox(?: Store)?|PlayStation Store).*$/i, "").replace(/\s+(?:on|i|p\u00e5)\s+(?:Epic Games Store|Steam Store|Steam|Microsoft Store|Xbox(?: Store)?|PlayStation Store)$/i, "").replace(/\s+(?:hos|at)\s+(?:Epic Games Store|Steam Store|Steam)$/i, "");
    const withoutBuyPrefix = withoutKnownSuffix.replace(/^(?:kj\u00f8p|kjop|buy)\s+/i, "").trim();
    return uniqueStrings$c([withoutBuyPrefix, withoutKnownSuffix, normalized]).filter((candidate) => candidate.length > 0);
  }
  function humanizeSlug(value) {
    return value.replace(/[-_]+/g, " ");
  }
  function readSteamProductName(message) {
    return readSteamProductNameFromUrl(message.url) ?? readSteamProductNameFromUrl(message.productUrl);
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
  function toAllKeyShopSlug(value) {
    return value.replace(/[\u00C6\u00E6]/g, "ae").replace(/[\u00D8\u00F8]/g, "o").replace(/[\u00C5\u00E5]/g, "a").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  }
  function readAssignedJsonObject(html, variableName) {
    const marker = new RegExp(`\\bvar\\s+${escapeRegExp$4(variableName)}\\s*=\\s*`, "i");
    const match = marker.exec(html);
    if (match === null) return void 0;
    const start = match.index + match[0].length;
    const jsonStart = html.indexOf("{", start);
    if (jsonStart < 0) return void 0;
    const jsonEnd = findBalancedObjectEnd(html, jsonStart);
    if (jsonEnd === void 0) return void 0;
    try {
      return JSON.parse(html.slice(jsonStart, jsonEnd + 1));
    } catch {
      return void 0;
    }
  }
  function findBalancedObjectEnd(value, startIndex) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = startIndex; index < value.length; index++) {
      const char = value[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) return index;
      }
    }
    return void 0;
  }
  function readString$1(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
  }
  function readAmount$1(value) {
    const amount = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value.replace(",", ".")) : Number.NaN;
    return Number.isFinite(amount) && amount >= 0 ? amount : void 0;
  }
  function uniqueStrings$c(values) {
    return [...new Set(values.map((value) => value?.trim()).filter((value) => value !== void 0 && value.length > 0))];
  }
  function stripTags$1(value) {
    return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  }
  function decodeHtml$3(value) {
    return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
  }
  function escapeRegExp$4(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function formatCurrency$3(amount, currency) {
    try {
      return new Intl.NumberFormat("nb-NO", {
        style: "currency",
        currency,
        maximumFractionDigits: currencyScale$1(currency)
      }).format(amount);
    } catch {
      return `${amount.toFixed(currencyScale$1(currency))} ${currency}`;
    }
  }
  function formatApproxCurrency(amount, currency) {
    return `~${formatCurrency$3(amount, currency)}`;
  }
  function currencyScale$1(currency) {
    if ((/* @__PURE__ */ new Set(["JPY", "KRW", "CLP", "VND", "IDR"])).has(currency.toUpperCase())) return 0;
    if ((/* @__PURE__ */ new Set(["BHD", "KWD", "OMR"])).has(currency.toUpperCase())) return 3;
    return 2;
  }
  async function fetchJson$7(url, init) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) return void 0;
      return response.json();
    } catch {
      return void 0;
    }
  }
  async function fetchText$6(url, init) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) return void 0;
      return response.text();
    } catch {
      return void 0;
    }
  }
  const GG_DEALS_ORIGIN = "https://gg.deals";
  const GG_DEALS_STEAM_APP_PRICE_URL = "https://api.gg.deals/v1/prices/by-steam-app-id/";
  const DEFAULT_GG_DEALS_API_KEY = "sqz5OjdsyxNW2e0i3aF5BA0p5rpd0fHU";
  const DEFAULT_GG_DEALS_REGION = "no";
  const MAX_GG_DEALS_ALTERNATIVES = 4;
  async function findGgDealsPriceMatch(message, requestJson = fetchJson$6, requestText = fetchText$5, options = {}) {
    if (!isGgDealsSupportedGameUrl(message.url) && !isGgDealsSupportedGameUrl(message.productUrl)) {
      return void 0;
    }
    const steamAppId = parseSteamAppId(message.url) ?? parseSteamAppId(message.productUrl);
    const apiKey = normalizeApiKey(options.apiKey);
    const region = normalizeRegion(options.region);
    if (steamAppId !== void 0 && apiKey !== void 0) {
      const apiOffer = await fetchGgDealsSteamAppPriceMatch({
        apiKey,
        appId: steamAppId,
        message,
        region,
        requestJson
      });
      if (apiOffer !== void 0) return apiOffer;
    }
    return fetchGgDealsPagePriceMatch({
      message,
      requestText,
      ...steamAppId !== void 0 ? { steamAppId } : {}
    });
  }
  function isGgDealsSupportedGameUrl(rawUrl) {
    return isSteamAppProductUrl(rawUrl) || isEpicGamesStoreProductUrl(rawUrl);
  }
  async function fetchGgDealsSteamAppPriceMatch(input) {
    const params = new URLSearchParams({
      ids: String(input.appId),
      key: input.apiKey,
      region: input.region
    });
    const value = await input.requestJson(`${GG_DEALS_STEAM_APP_PRICE_URL}?${params.toString()}`, {
      headers: { "Accept": "application/json" }
    });
    const data = readGgDealsApiPriceData(value, String(input.appId));
    if (data === void 0) return void 0;
    return buildGgDealsOffer(input.message, data, `${GG_DEALS_ORIGIN}/steam/app/${input.appId}/`);
  }
  async function fetchGgDealsPagePriceMatch(input) {
    for (const url of buildGgDealsPageUrlCandidates(input.message, input.steamAppId)) {
      const html = await input.requestText(url, {
        headers: { "Accept": "text/html" },
        credentials: "include"
      });
      if (html === void 0 || isCloudflareChallenge(html)) continue;
      const data = readGgDealsPagePriceData(html);
      if (data === void 0 || !isLikelyGgDealsProductMatch(input.message, data.title, url)) continue;
      return buildGgDealsOffer(input.message, data, url);
    }
    return void 0;
  }
  function buildGgDealsPageUrlCandidates(message, steamAppId) {
    const urls = [];
    if (steamAppId !== void 0) {
      urls.push(`${GG_DEALS_ORIGIN}/steam/app/${steamAppId}/`);
    }
    const epicSlug = parseEpicGamesProductSlug(message.url) ?? parseEpicGamesProductSlug(message.productUrl);
    const slugs = uniqueStrings$b([
      epicSlug,
      ...readGameTitleCandidates(message).map(toGgDealsSlug)
    ]);
    for (const slug of slugs) {
      if (slug.length > 0) urls.push(`${GG_DEALS_ORIGIN}/game/${encodeURIComponent(slug)}/`);
    }
    return uniqueStrings$b(urls);
  }
  function buildGgDealsOffer(message, data, fallbackUrl) {
    const alternatives = readGgDealsPriceBuckets(data).sort((first, second) => first.amount - second.amount).map(toPriceMatchAlternative);
    const best = alternatives[0];
    if (best === void 0) return void 0;
    const productName = data.title ?? readGameProductName(message) ?? "PC-spill";
    return {
      source: "ggdeals",
      sourceName: "GG Deals",
      matchedExactProduct: true,
      shopName: formatPrimaryGgDealsShopName(best.shopName),
      amount: best.amount,
      sortAmount: best.sortAmount ?? best.amount,
      currency: best.currency,
      price: best.price,
      productName,
      productUrl: data.url ?? fallbackUrl,
      alternatives: alternatives.slice(0, MAX_GG_DEALS_ALTERNATIVES)
    };
  }
  function formatPrimaryGgDealsShopName(shopName) {
    if (shopName === "Beste keyshop") return "GG Deals Keyshops";
    if (shopName === "Beste offisielle butikk") return "GG Deals Official Stores";
    return shopName;
  }
  function readGgDealsApiPriceData(value, id) {
    if (!isRecord$5(value) || value.success !== true || !isRecord$5(value.data)) return void 0;
    const rawData = value.data[id];
    if (!isRecord$5(rawData)) return void 0;
    return readGgDealsPriceData(rawData);
  }
  function readGgDealsPriceData(value) {
    const prices = isRecord$5(value.prices) ? value.prices : void 0;
    if (prices === void 0) return void 0;
    const currency = typeof prices.currency === "string" && prices.currency.length > 0 ? prices.currency.toUpperCase() : "NOK";
    return {
      ...typeof value.title === "string" && value.title.length > 0 ? { title: value.title } : {},
      ...typeof value.url === "string" && value.url.length > 0 ? { url: value.url } : {},
      prices: {
        currency,
        ...readOptionalAmount("currentRetail", prices),
        ...readOptionalAmount("currentKeyshops", prices),
        ...readOptionalAmount("historicalRetail", prices),
        ...readOptionalAmount("historicalKeyshops", prices)
      }
    };
  }
  function readOptionalAmount(key, value) {
    const amount = readAmount(value[key]);
    return amount !== void 0 ? { [key]: amount } : {};
  }
  function readGgDealsPagePriceData(html) {
    const title = decodeHtml$2(stripTags(
      html.match(/class=["'][^"']*(?:game-info-title|game-header-title)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1] ?? ""
    )) || void 0;
    const url = decodeHtml$2(
      html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1] ?? ""
    ) || void 0;
    const currentRetail = readPagePrice(html, "Official Stores");
    const currentKeyshops = readPagePrice(html, "Keyshops");
    const historicalRetail = readPagePrice(html, "Official Stores Low");
    const historicalKeyshops = readPagePrice(html, "Keyshops Low");
    if (currentRetail === void 0 && currentKeyshops === void 0 && historicalRetail === void 0 && historicalKeyshops === void 0) {
      return void 0;
    }
    return {
      ...title !== void 0 ? { title } : {},
      ...url !== void 0 ? { url } : {},
      prices: {
        currency: readPageCurrency(html) ?? "NOK",
        ...currentRetail !== void 0 ? { currentRetail } : {},
        ...currentKeyshops !== void 0 ? { currentKeyshops } : {},
        ...historicalRetail !== void 0 ? { historicalRetail } : {},
        ...historicalKeyshops !== void 0 ? { historicalKeyshops } : {}
      }
    };
  }
  function readPagePrice(html, label) {
    const labelPattern = escapeRegExp$3(label);
    const labelMatch = html.match(new RegExp(`${labelPattern}[\\s\\S]{0,1200}?class=["'][^"']*price-inner numeric[^"']*["'][^>]*>([\\s\\S]*?)<`, "i"));
    const rawPrice = labelMatch?.[1];
    if (rawPrice === void 0) return void 0;
    return readLocalizedAmount(decodeHtml$2(stripTags(rawPrice)));
  }
  function readPageCurrency(html) {
    if (/\bNOK\b|kr\b/i.test(html)) return "NOK";
    if (/\bUSD\b|\$/i.test(html)) return "USD";
    if (/\bEUR\b|€/i.test(html)) return "EUR";
    if (/\bGBP\b|£/i.test(html)) return "GBP";
    return void 0;
  }
  function readGgDealsPriceBuckets(data) {
    return [
      data.prices.currentRetail !== void 0 ? {
        amount: data.prices.currentRetail,
        currency: data.prices.currency,
        ...data.prices.historicalRetail !== void 0 ? { historicalAmount: data.prices.historicalRetail } : {},
        shopName: "Beste offisielle butikk"
      } : void 0,
      data.prices.currentKeyshops !== void 0 ? {
        amount: data.prices.currentKeyshops,
        currency: data.prices.currency,
        ...data.prices.historicalKeyshops !== void 0 ? { historicalAmount: data.prices.historicalKeyshops } : {},
        shopName: "Beste keyshop"
      } : void 0
    ].filter((bucket) => bucket !== void 0);
  }
  function toPriceMatchAlternative(bucket) {
    return {
      shopName: bucket.shopName,
      amount: bucket.amount,
      sortAmount: bucket.amount,
      currency: bucket.currency,
      price: formatCurrency$2(bucket.amount, bucket.currency),
      ...bucket.historicalAmount !== void 0 && bucket.historicalAmount < bucket.amount ? { shippingPrice: `historisk lav ${formatCurrency$2(bucket.historicalAmount, bucket.currency)}` } : {}
    };
  }
  function isLikelyGgDealsProductMatch(message, title, url) {
    if (title === void 0) return true;
    const slug = url.match(/\/game\/([^/?#]+)\/?/i)?.[1];
    const candidates = readGameTitleCandidates(message);
    if (slug !== void 0 && candidates.some((candidate) => toGgDealsSlug(candidate) === slug)) return true;
    return candidates.some((candidate) => scoreProductTitleAgainstSearchTerm(candidate, title) >= 0.72);
  }
  function readGameTitleCandidates(message) {
    return uniqueStrings$b([
      ...(message.productTitleCandidates ?? []).flatMap(readGameTitleCandidateVariants),
      ...readGameTitleCandidateVariants(message.searchTerm)
    ]).filter((candidate) => candidate.length >= 2 && candidate.length <= 120);
  }
  function readGameTitleCandidateVariants(value) {
    if (value === void 0) return [];
    const normalized = value.trim().replace(/\s+/g, " ");
    if (normalized.length === 0) return [];
    const withoutKnownSuffix = normalized.replace(/\s+\|\s+.*$/i, "").replace(/\s+[-\u2013\u2014]\s+(?:Epic Games Store|Steam Store|Steam|Microsoft Store|Xbox(?: Store)?|PlayStation Store).*$/i, "").replace(/\s+(?:hos|at)\s+(?:Epic Games Store|Steam Store|Steam)$/i, "");
    const withoutBuyPrefix = withoutKnownSuffix.replace(/^(?:kj\u00f8p|kjop|buy)\s+/i, "").trim();
    return uniqueStrings$b([withoutBuyPrefix, withoutKnownSuffix, normalized]).filter((candidate) => candidate.length > 0);
  }
  function readGameProductName(message) {
    return readGameTitleCandidates(message)[0];
  }
  function normalizeApiKey(value) {
    const trimmed = value?.trim();
    return trimmed !== void 0 && trimmed.length > 0 ? trimmed : DEFAULT_GG_DEALS_API_KEY;
  }
  function normalizeRegion(value) {
    const trimmed = value?.trim().toLowerCase();
    return trimmed !== void 0 && /^[a-z]{2}$/.test(trimmed) ? trimmed : DEFAULT_GG_DEALS_REGION;
  }
  function readAmount(value) {
    const amount = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value.replace(",", ".")) : Number.NaN;
    return Number.isFinite(amount) && amount >= 0 ? amount : void 0;
  }
  function readLocalizedAmount(value) {
    const normalized = value.replace(/\s/g, "").replace(/[^0-9,.-]/g, "").replace(",", ".");
    return readAmount(normalized);
  }
  function isCloudflareChallenge(html) {
    return /cf-mitigated["']?\s*:\s*challenge/i.test(html) || /<title>\s*Just a moment\.\.\.\s*<\/title>/i.test(html) || /Enable JavaScript and cookies to continue/i.test(html);
  }
  function toGgDealsSlug(value) {
    return value.replace(/[\u00C6\u00E6]/g, "ae").replace(/[\u00D8\u00F8]/g, "o").replace(/[\u00C5\u00E5]/g, "a").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  }
  function uniqueStrings$b(values) {
    return [...new Set(values.map((value) => value?.trim()).filter((value) => value !== void 0 && value.length > 0))];
  }
  function stripTags(value) {
    return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  }
  function decodeHtml$2(value) {
    return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
  }
  function escapeRegExp$3(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function formatCurrency$2(amount, currency) {
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
  async function fetchJson$6(url, init) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) return void 0;
      return response.json();
    } catch {
      return void 0;
    }
  }
  async function fetchText$5(url, init) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) return void 0;
      return response.text();
    } catch {
      return void 0;
    }
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
    "kassal.app",
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
    if (!isPlainRecord$7(value)) return void 0;
    const rawAmount = readNumberLike$7(value.value) ?? readNumberLike$7(value.amount) ?? readNumberLike$7(value.weight) ?? readNumberLike$7(value.volume);
    const rawUnit = readStringLike$6(value.unitText) ?? readStringLike$6(value.unitCode) ?? readStringLike$6(value.unit) ?? readStringLike$6(value.measurementTechnique);
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
      return uniqueStrings$a(labels);
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
      return uniqueStrings$a(labels);
    }
    const pieces = formatPackageAmount(quantity.amount);
    return uniqueStrings$a([`${pieces}stk`, `${pieces} stk`, `${pieces}pk`, `${pieces} pk`]);
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
  function readStringLike$6(value) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : void 0;
    }
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return void 0;
  }
  function readNumberLike$7(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return void 0;
    const parsed = parseLocalizedNumber$2(value);
    return Number.isFinite(parsed) ? parsed : void 0;
  }
  function transliterateNorwegianCharacters$4(value) {
    return value.replace(/[\u00C6\u00E6]/g, "ae").replace(/[\u00D8\u00F8]/g, "o").replace(/[\u00C5\u00E5]/g, "a");
  }
  function uniqueStrings$a(values) {
    return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
  }
  function isPlainRecord$7(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  const MIN_PRODUCT_MATCH_SCORE = 0.45;
  const STORAGE_SIZE_PATTERN = /\b(\d+(?:[.,]\d+)?)\s*(tb|gb)\b/gi;
  const BRAND_MATCH_GROUPS = [
    ["apple"],
    ["google", "pixel"],
    ["microsoft", "xbox"],
    ["nintendo"],
    ["samsung"],
    ["sony", "playstation"]
  ];
  const NAMED_HTML_ENTITIES = /* @__PURE__ */ new Map([
    ["amp", "&"],
    ["quot", '"'],
    ["apos", "'"],
    ["nbsp", " "],
    ["shy", ""],
    ["aring", "å"],
    ["Aring", "Å"],
    ["aelig", "æ"],
    ["AElig", "Æ"],
    ["oslash", "ø"],
    ["Oslash", "Ø"],
    ["auml", "ä"],
    ["Auml", "Ä"],
    ["ouml", "ö"],
    ["Ouml", "Ö"],
    ["uuml", "ü"],
    ["Uuml", "Ü"],
    ["eacute", "é"],
    ["Eacute", "É"],
    ["egrave", "è"],
    ["deg", "°"],
    ["trade", "™"],
    ["reg", "®"],
    ["copy", "©"]
  ]);
  function buildProductMatchAnchor(message) {
    const packageQuantity = message.packageAmount !== void 0 && message.packageUnit !== void 0 ? { amount: message.packageAmount, unit: message.packageUnit } : void 0;
    return {
      searchTerm: message.searchTerm,
      ...packageQuantity !== void 0 ? { packageQuantity } : {}
    };
  }
  function scoreProductCandidateMatch(anchor, candidate, minimumScore = MIN_PRODUCT_MATCH_SCORE) {
    const candidateTitles = uniqueStrings$9([
      candidate.brand !== void 0 && !candidate.title.toLowerCase().includes(candidate.brand.toLowerCase()) ? `${candidate.brand} ${candidate.title}` : void 0,
      candidate.title
    ]);
    let bestScore = 0;
    for (const title of candidateTitles) {
      if (hasProductVariantConflict(anchor, title)) continue;
      if (!isLikelySameProductTitle(anchor.searchTerm, title, minimumScore)) continue;
      const score = scoreProductTitleAgainstSearchTerm(anchor.searchTerm, title);
      bestScore = Math.max(bestScore, hasBrandConflict(anchor.searchTerm, candidate.brand) ? score * 0.3 : score);
    }
    return bestScore;
  }
  function pickBestProductCandidate(anchor, candidates, readCandidate, minimumScore = MIN_PRODUCT_MATCH_SCORE) {
    let best;
    for (const candidate of candidates) {
      const info = readCandidate(candidate);
      if (info === void 0) continue;
      const score = scoreProductCandidateMatch(anchor, info, minimumScore);
      if (score >= minimumScore && (best === void 0 || score > best.score)) {
        best = { candidate, score };
      }
    }
    return best?.candidate;
  }
  function hasProductVariantConflict(anchor, candidateTitle) {
    return hasPackageQuantityConflict(anchor, candidateTitle) || hasStorageSizeConflict(anchor.searchTerm, candidateTitle) || hasModelNumberConflict(anchor.searchTerm, candidateTitle) || hasNumericModelConflict(anchor.searchTerm, candidateTitle) || hasModelTierConflict(anchor.searchTerm, candidateTitle) || hasColorVariantConflict(anchor.searchTerm, candidateTitle);
  }
  const NUMERIC_MODEL_UNIT_WORDS = /* @__PURE__ */ new Set([
    "a",
    "ah",
    "ar",
    "cl",
    "cm",
    "dl",
    "fps",
    "g",
    "gb",
    "ghz",
    "gr",
    "h",
    "hz",
    "in",
    "kg",
    "khz",
    "km",
    "kw",
    "kwh",
    "l",
    "m",
    "mah",
    "mb",
    "mg",
    "ml",
    "mm",
    "pack",
    "pakke",
    "pakning",
    "pakninger",
    "pcs",
    "pk",
    "prosent",
    "stk",
    "t",
    "tb",
    "timer",
    "tommer",
    "tum",
    "v",
    "w",
    "wh",
    "x",
    "år"
  ]);
  const NUMERIC_MODEL_SPEC_TOKENS = /* @__PURE__ */ new Set(["2k", "4k", "8k", "3g", "4g", "5g"]);
  function hasNumericModelConflict(anchorText, candidateTitle) {
    const anchorTokens = readNumericModelTokens(anchorText);
    const candidateTokens = readNumericModelTokens(candidateTitle);
    if (hasUnitSuffixModelConflict(anchorTokens, candidateTokens) || hasUnitSuffixModelConflict(candidateTokens, anchorTokens)) {
      return true;
    }
    if (anchorTokens.numbers.size === 0 || candidateTokens.numbers.size === 0) return false;
    return ![...anchorTokens.numbers].some((number) => candidateTokens.numbers.has(number));
  }
  function hasUnitSuffixModelConflict(first, second) {
    return [...first.unitSuffixed.entries()].some(([token, base]) => {
      return !first.numbers.has(base) && second.numbers.has(base) && !second.unitSuffixed.has(token);
    });
  }
  function readNumericModelTokens(text) {
    const normalized = text.toLowerCase().replace(/\d+[.,]\d+/g, " ").replace(/\b\d+\s*x\s*\d+/g, " ").replace(/\d+\s*%/g, " ");
    const tokens = normalized.split(/[^a-z0-9æøå]+/).filter((token) => token.length > 0);
    const numbers = /* @__PURE__ */ new Set();
    const unitSuffixed = /* @__PURE__ */ new Map();
    for (const [index, token] of tokens.entries()) {
      if (/^\d{1,3}$/.test(token)) {
        const nextToken = tokens[index + 1];
        if (nextToken === void 0 || !NUMERIC_MODEL_UNIT_WORDS.has(nextToken)) {
          numbers.add(token);
        }
        continue;
      }
      if (NUMERIC_MODEL_SPEC_TOKENS.has(token)) continue;
      if (/^\d{1,3}[a-z]{1,2}$/.test(token) && !isUnitLikeToken(token)) {
        numbers.add(token);
        continue;
      }
      const unitSuffixMatch = /^(\d{1,3})[a-z]$/.exec(token);
      if (unitSuffixMatch?.[1] !== void 0 && isUnitLikeToken(token)) {
        unitSuffixed.set(token, unitSuffixMatch[1]);
      }
    }
    return { numbers, unitSuffixed };
  }
  const COLOR_VARIANT_TOKEN_GROUPS = /* @__PURE__ */ new Map([
    ["beige", "beige"],
    ["bla", "bla"],
    ["black", "svart"],
    ["blue", "bla"],
    ["brown", "brun"],
    ["brun", "brun"],
    ["carbon", "svart"],
    ["gold", "gull"],
    ["gra", "gra"],
    ["graphite", "gra"],
    ["gray", "gra"],
    ["green", "gronn"],
    ["grey", "gra"],
    ["gronn", "gronn"],
    ["gul", "gul"],
    ["gull", "gull"],
    ["hvit", "hvit"],
    ["lilla", "lilla"],
    ["navy", "bla"],
    ["orange", "oransje"],
    ["oransje", "oransje"],
    ["pink", "rosa"],
    ["purple", "lilla"],
    ["red", "rod"],
    ["rod", "rod"],
    ["rosa", "rosa"],
    ["sandstone", "sandstone"],
    ["silver", "solv"],
    ["solv", "solv"],
    ["sort", "svart"],
    ["svart", "svart"],
    ["violet", "lilla"],
    ["white", "hvit"],
    ["yellow", "gul"]
  ]);
  function hasColorVariantConflict(anchorText, candidateTitle) {
    const anchorColors = readColorVariantTokens(anchorText);
    if (anchorColors.size === 0) return false;
    const candidateColors = readColorVariantTokens(candidateTitle);
    if (candidateColors.size === 0) return false;
    return ![...anchorColors].some((color) => candidateColors.has(color));
  }
  function readColorVariantTokens(text) {
    const colors = /* @__PURE__ */ new Set();
    for (const token of tokenizeBrandText(text)) {
      const color = COLOR_VARIANT_TOKEN_GROUPS.get(token);
      if (color !== void 0) colors.add(color);
    }
    return colors;
  }
  const MODEL_TIER_TOKENS = /* @__PURE__ */ new Set(["ultra", "pro", "plus", "max", "mini", "lite", "air", "xl", "fe", "fold", "flip"]);
  function hasModelTierConflict(anchorText, candidateTitle) {
    const anchorTiers = readModelTierTokens(anchorText);
    const candidateTiers = readModelTierTokens(candidateTitle);
    return anchorTiers.size !== candidateTiers.size || ![...anchorTiers].every((tier) => candidateTiers.has(tier));
  }
  function readModelTierTokens(text) {
    return new Set(tokenizeBrandText(text).filter((token) => MODEL_TIER_TOKENS.has(token)));
  }
  function hasModelNumberConflict(anchorText, candidateTitle) {
    const anchorModels = readModelNumberTokens(anchorText);
    if (anchorModels.length === 0) return false;
    const candidateModels = readModelNumberTokens(candidateTitle);
    if (candidateModels.length === 0) return anchorModels.some(isStrongModelNumberToken);
    const anchorPrefixedModels = anchorModels.filter(isLetterPrefixedModelToken);
    const candidatePrefixedModels = candidateModels.filter(isLetterPrefixedModelToken);
    if (anchorPrefixedModels.length > 0 && candidatePrefixedModels.length > 0 && !hasCompatibleModelNumberPair(anchorPrefixedModels, candidatePrefixedModels)) {
      return true;
    }
    return !hasCompatibleModelNumberPair(anchorModels, candidateModels);
  }
  function hasMatchingModelNumberToken(anchorText, candidateTitle) {
    const anchorModels = readModelNumberTokens(anchorText);
    const candidateModels = readModelNumberTokens(candidateTitle);
    return anchorModels.length > 0 && candidateModels.length > 0 && hasCompatibleModelNumberPair(anchorModels, candidateModels);
  }
  function hasCompatibleModelNumberPair(anchorModels, candidateModels) {
    return anchorModels.some((anchorModel) => candidateModels.some((candidateModel) => {
      return anchorModel === candidateModel || anchorModel.length >= 3 && candidateModel.includes(anchorModel) || candidateModel.length >= 3 && anchorModel.includes(candidateModel);
    }));
  }
  function isStrongModelNumberToken(token) {
    return token.length >= 4 && !GENERIC_SPEC_TOKENS.has(token);
  }
  function isLetterPrefixedModelToken(token) {
    return /^[a-z]/.test(token) && isStrongModelNumberToken(token);
  }
  const GENERIC_SPEC_TOKENS = /* @__PURE__ */ new Set(["wifi5", "wifi6", "wifi7", "usb2", "usb3", "usb4", "hdmi2", "bt50"]);
  function readModelNumberTokens(text) {
    const bareTokens = text.split(/[^A-Za-z0-9]+/).map((token) => token.toLowerCase()).filter((token) => token.length >= 2 && /[a-z]/.test(token) && /\d/.test(token) && !isUnitLikeToken(token));
    const joinedTokens = [...text.matchAll(/\b([A-Za-z]{1,4})[-\s](\d[A-Za-z0-9]{2,})\b/g)].filter((match) => !isUnitLikeToken((match[2] ?? "").toLowerCase())).map((match) => `${match[1]}${match[2]}`.toLowerCase()).filter((token) => !isUnitLikeToken(token));
    return uniqueStrings$9([...bareTokens, ...joinedTokens]);
  }
  function isUnitLikeToken(token) {
    return /^\d+(?:[.,]\d+)?(?:ml|cl|dl|l|g|gr|kg|mg|gb|tb|mb|mm|cm|m|km|w|kw|wh|kwh|mah|hz|khz|ghz|v|a|ah|stk|pk|pcs|fps|tommer|tum|in)$/.test(token);
  }
  function hasPackageQuantityConflict(anchor, candidateTitle) {
    const expectedQuantity = anchor.packageQuantity ?? readPackageQuantityFromText(anchor.searchTerm);
    if (expectedQuantity === void 0) return false;
    const candidateQuantity = readPackageQuantityFromText(candidateTitle);
    return candidateQuantity !== void 0 && !isSamePackageQuantity(expectedQuantity, candidateQuantity);
  }
  function hasStorageSizeConflict(anchorText, candidateTitle) {
    const anchorSizes = readStorageSizesGb(anchorText);
    if (anchorSizes.length === 0) return false;
    const candidateSizes = readStorageSizesGb(candidateTitle);
    if (candidateSizes.length === 0) return false;
    return !anchorSizes.some((size) => candidateSizes.includes(size));
  }
  function readStorageSizesGb(text) {
    const sizes = /* @__PURE__ */ new Set();
    for (const match of text.matchAll(STORAGE_SIZE_PATTERN)) {
      const amount = Number.parseFloat((match[1] ?? "").replace(",", "."));
      if (!Number.isFinite(amount) || amount <= 0) continue;
      sizes.add((match[2] ?? "").toLowerCase() === "tb" ? amount * 1024 : amount);
    }
    return [...sizes];
  }
  function hasBrandConflict(anchorText, candidateBrand) {
    if (candidateBrand === void 0) return false;
    const anchorTokens = new Set(tokenizeBrandText(anchorText));
    const brandTokens = new Set(tokenizeBrandText(candidateBrand));
    if (anchorTokens.size === 0 || brandTokens.size === 0) return false;
    const anchorBrandGroups = BRAND_MATCH_GROUPS.filter((group) => group.some((token) => anchorTokens.has(token)));
    if (anchorBrandGroups.length === 0) return false;
    return !anchorBrandGroups.some((group) => group.some((token) => brandTokens.has(token)));
  }
  function isLikelyGtin$5(value) {
    return /^(?:\d{8}|\d{12,14})$/.test(value.trim());
  }
  function isLikelyMpn(value) {
    const normalized = value.trim();
    if (normalized.length < 5 || normalized.length > 40 || isLikelyGtin$5(normalized)) return false;
    return /^[A-Za-z0-9][A-Za-z0-9._/ -]*$/.test(normalized) && /[A-Za-z]/.test(normalized) && /\d/.test(normalized);
  }
  function decodeHtmlEntities(value) {
    if (!value.includes("&")) return value;
    return value.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
      if (entity.startsWith("#")) {
        const isHex = entity[1] === "x" || entity[1] === "X";
        const code = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
        return Number.isFinite(code) && code > 0 && code <= 1114111 ? String.fromCodePoint(code) : match;
      }
      return NAMED_HTML_ENTITIES.get(entity) ?? NAMED_HTML_ENTITIES.get(entity.toLowerCase()) ?? match;
    });
  }
  function tokenizeBrandText(value) {
    return uniqueStrings$9(value.split(/[^A-Za-z0-9ÆØÅæøå]+/).map(normalizeBrandToken).filter((token) => token !== void 0 && token.length >= 2));
  }
  function normalizeBrandToken(value) {
    const normalized = value.replace(/[Ææ]/g, "ae").replace(/[Øø]/g, "o").replace(/[Åå]/g, "a").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
    return normalized.length > 0 ? normalized : void 0;
  }
  function uniqueStrings$9(values) {
    return [...new Set(values.map((value) => value?.trim()).filter((value) => value !== void 0 && value.length > 0))];
  }
  const GODPRIS_PRODUCT_URL = "https://godpris.no/produkt/";
  const BAD_AVAILABILITY_STATUSES$3 = /* @__PURE__ */ new Set([
    "discontinued",
    "not_available",
    "not_in_stock",
    "out_of_stock"
  ]);
  async function findGodprisPriceMatch(message, requestJson = fetchJson$5, requestText = fetchText$4, options = {}) {
    if (!message.productPageClue && message.searchTerm.trim().length < 8) {
      return void 0;
    }
    const codes = message.codes ?? [];
    const searchQueries = uniqueStrings$8([
      ...codes.filter(isLikelyGtin$5),
      ...codes.filter(isLikelyMpn),
      message.searchTerm,
      ...options.anchorSearchTerms ?? []
    ]);
    const anchor = buildProductMatchAnchor(message);
    const visitedProductIds = /* @__PURE__ */ new Set();
    for (const query of searchQueries) {
      const productIds = await fetchGodprisProductIds(query, requestJson, anchor);
      for (const productId of productIds) {
        if (visitedProductIds.has(productId)) continue;
        visitedProductIds.add(productId);
        const html = await requestText(`${GODPRIS_PRODUCT_URL}${encodeURIComponent(productId)}`, {
          headers: { "Accept": "text/html,application/xhtml+xml" }
        });
        const offer = html !== void 0 ? readGodprisProductPage(html, productId, anchor) : void 0;
        if (offer !== void 0) return offer;
      }
    }
    return void 0;
  }
  async function fetchGodprisProductIds(query, requestJson, anchor) {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 4) return [];
    const params = new URLSearchParams({ q: normalizedQuery });
    const value = await requestJson(`https://godpris.no/api/product/search?${params.toString()}`, {
      headers: { "Accept": "application/json" }
    });
    if (!isPlainRecord$6(value) || !Array.isArray(value.results)) return [];
    const isCodeQuery = isLikelyGtin$5(normalizedQuery) || isLikelyMpn(normalizedQuery);
    const matchAnchor = isCodeQuery ? anchor : { ...anchor, searchTerm: normalizedQuery };
    const matches = [];
    for (const result of value.results) {
      if (!isPlainRecord$6(result)) continue;
      const id = readStringLike$5(result.id);
      if (id === void 0) continue;
      const title = readStringLike$5(result.title);
      const groupTitle = readStringLike$5(result.group_title);
      const brand = readStringLike$5(result.brand);
      const score = Math.max(
        title !== void 0 ? scoreProductCandidateMatch(matchAnchor, { title, brand }) : 0,
        groupTitle !== void 0 ? scoreProductCandidateMatch(matchAnchor, { title: groupTitle, brand }) : 0
      );
      if (score >= MIN_PRODUCT_MATCH_SCORE) {
        matches.push({ id, score });
      }
    }
    return matches.sort((first, second) => second.score - first.score).slice(0, 3).map((match) => match.id);
  }
  function readGodprisProductPage(html, fallbackProductId, anchor) {
    const page = readGodprisDataPage(html);
    const props = isPlainRecord$6(page?.props) ? page.props : void 0;
    const product = isPlainRecord$6(props?.product) ? props.product : void 0;
    const prices = Array.isArray(props?.prices) ? props.prices : [];
    if (product === void 0 || prices.length === 0) return void 0;
    const productId = readStringLike$5(product.id) ?? fallbackProductId;
    const rawProductName = readStringLike$5(product.title) ?? readStringLike$5(product.name);
    const productBrand = readStringLike$5(product.brand);
    const productName = withLeadingBrand$1(rawProductName, productBrand) ?? "Godpris-produkt";
    if (hasProductVariantConflict(anchor, productName)) return void 0;
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
    if (!isPlainRecord$6(value)) return void 0;
    const shop = isPlainRecord$6(value.shop) ? value.shop : void 0;
    const amount = readNumberLike$6(value.price);
    const shopName = readStringLike$5(shop?.title) ?? readStringLike$5(value.shop_title);
    const availability = readStringLike$5(value.availability)?.toLowerCase();
    if (amount === void 0 || amount <= 0 || shopName === void 0) return void 0;
    if (availability !== void 0 && BAD_AVAILABILITY_STATUSES$3.has(availability)) return void 0;
    const offerUrl = readStringLike$5(value.click_url) ?? readStringLike$5(value.url);
    return {
      shopName,
      amount,
      currency: "NOK",
      price: formatNokPrice$6(amount),
      ...offerUrl !== void 0 ? { offerUrl } : {}
    };
  }
  async function fetchJson$5(url, init) {
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
  function formatNokPrice$6(amount) {
    const formatted = new Intl.NumberFormat("nb-NO", {
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2
    }).format(amount);
    return `${formatted} kr`;
  }
  function decodeHtmlAttribute$1(value) {
    return value.replace(/&quot;/g, '"').replace(/&#039;|&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  }
  function readStringLike$5(value) {
    if (typeof value !== "string" && typeof value !== "number") return void 0;
    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : void 0;
  }
  function readNumberLike$6(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return void 0;
    const parsed = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : void 0;
  }
  function uniqueStrings$8(values) {
    return [...new Set(values.map((value) => value?.trim()).filter((value) => value !== void 0 && value.length > 0))];
  }
  function isPlainRecord$6(value) {
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
  async function findEnhverPriceMatch(message, requestJson = fetchJson$4, requestText = fetchText$3) {
    if (!isLikelyGroceryPriceMatchContext(message.url, message.productUrl)) return void 0;
    if (!hasGroceryIdentitySignal$2(message)) return void 0;
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
      sourceName: "enhver",
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
      if (!isPlainRecord$5(item)) return void 0;
      const groceryId = readNumberLike$5(item.groceryId);
      const name = readStringLike$4(item.name);
      if (groceryId === void 0 || name === void 0) return void 0;
      const ean = readStringLike$4(item.ean);
      const amount = readNumberLike$5(item.amount);
      const unit = readStringLike$4(item.unit);
      const desc = readStringLike$4(item.desc);
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
    const messageGtins = getLikelyGtins$2(message.codes);
    if (messageGtins.length > 0) {
      const exact = groceries.find((grocery) => {
        const groceryGtin = readLikelyGtin$1(grocery.ean);
        return groceryGtin !== void 0 && messageGtins.includes(groceryGtin);
      });
      if (exact !== void 0) return exact;
    }
    const messageQuantity = getMessagePackageQuantity$2(message);
    if (messageQuantity === void 0) return void 0;
    return groceries.find((grocery) => {
      const groceryQuantity = readEnhverPackageQuantity(grocery);
      if (!isSamePackageQuantity(messageQuantity, groceryQuantity)) return false;
      return isLikelySameGroceryTitle$2(message, grocery);
    });
  }
  function readEnhverPackageQuantity(grocery) {
    const directQuantity = grocery.amount !== void 0 && grocery.unit !== void 0 ? readPackageQuantityFromText(`${grocery.amount} ${grocery.unit}`) : void 0;
    return directQuantity ?? readPackageQuantityFromText(grocery.desc);
  }
  function isLikelySameGroceryTitle$2(message, grocery) {
    const title = [grocery.name, grocery.desc].filter((value) => value !== void 0).join(" ");
    if (!hasRequestedBrandSignal$2(message, title)) return false;
    return uniqueStrings$7([message.searchTerm, ...message.productTitleCandidates ?? []]).some((candidate) => isLikelySameProductTitle(candidate, title, 0.45));
  }
  function hasRequestedBrandSignal$2(message, title) {
    if (message.productBrand === void 0) return true;
    const brand = normalizeBrandText$2(message.productBrand);
    if (brand.length < 3) return true;
    return normalizeBrandText$2(title).includes(brand);
  }
  function readEnhverProductTitle(html, grocery) {
    const escapedName = escapeRegExp$2(String(grocery.groceryId));
    const pattern = new RegExp(`title:"((?:\\\\.|[^"\\\\])*)",groceryId:${escapedName},(?:(?!\\{title:)[\\s\\S])*?prices:\\[`);
    const rawTitle = html.match(pattern)?.[1];
    return rawTitle !== void 0 ? unescapeJsString(rawTitle).trim() || void 0 : void 0;
  }
  function readEnhverPrices(html, groceryId) {
    const escapedId = escapeRegExp$2(String(groceryId));
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
        price: formatNokPrice$5(amount)
      });
    }
    return prices;
  }
  function hasGroceryIdentitySignal$2(message) {
    return getLikelyGtins$2(message.codes).length > 0 || getMessagePackageQuantity$2(message) !== void 0;
  }
  function getMessagePackageQuantity$2(message) {
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
  async function fetchText$3(url, init) {
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
  function formatNokPrice$5(amount) {
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
  function readLikelyGtin$1(value) {
    const normalized = value?.replace(/\D/g, "");
    return normalized !== void 0 && isLikelyGtin$4(normalized) ? normalized : void 0;
  }
  function getLikelyGtins$2(codes) {
    return uniqueStrings$7((codes ?? []).map((code) => code.replace(/\D/g, "")).filter(isLikelyGtin$4));
  }
  function isLikelyGtin$4(value) {
    return /^\d{8,14}$/.test(value);
  }
  function readStringLike$4(value) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : void 0;
    }
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return void 0;
  }
  function readNumberLike$5(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return void 0;
    const parsed = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : void 0;
  }
  function escapeRegExp$2(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function normalizeBrandText$2(value) {
    return value.replace(/[\u00C6\u00E6]/g, "ae").replace(/[\u00D8\u00F8]/g, "o").replace(/[\u00C5\u00E5]/g, "a").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^A-Za-z0-9]+/g, "").toLowerCase();
  }
  function uniqueStrings$7(values) {
    return [...new Set(values.map((value) => value?.trim()).filter((value) => value !== void 0 && value.length > 0))];
  }
  function isPlainRecord$5(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  const KASSAL_ORIGIN = "https://kassal.app";
  const KASSAL_SITEMAP_INDEX_URL = `${KASSAL_ORIGIN}/sitemap-index.xml`;
  const MAX_KASSAL_SITEMAPS = 40;
  const MAX_KASSAL_PRODUCT_CANDIDATES = 10;
  const kassalProductUrlCache = /* @__PURE__ */ new Map();
  async function findKassalPriceMatch(message, requestText = fetchText$2) {
    if (!message.productPageClue && message.searchTerm.trim().length < 8) return void 0;
    if (!isLikelyGroceryPriceMatchContext(message.url, message.productUrl)) return void 0;
    if (!hasGroceryIdentitySignal$1(message)) return void 0;
    const directProductUrl = readKassalProductUrl(message.url) ?? readKassalProductUrl(message.productUrl);
    const candidates = directProductUrl !== void 0 ? [directProductUrl] : await findKassalProductUrlCandidates(message, requestText);
    if (candidates.length === 0) return void 0;
    for (const productUrl of candidates) {
      const html = await requestText(productUrl, {
        headers: { "Accept": "text/html,application/xhtml+xml" }
      });
      if (html === void 0) continue;
      const offer = readKassalProductPage(html, productUrl, message);
      if (offer !== void 0) return offer;
    }
    return void 0;
  }
  function readKassalProductPage(html, productUrl, message) {
    if (isKassalNotFoundPage(html)) return void 0;
    const product = readKassalProductJsonLd(html);
    if (product === void 0) return void 0;
    const productName = readStringLike$3(product.name);
    const visiblePrices = readKassalVisiblePrices(html);
    const prices = visiblePrices.length > 0 ? visiblePrices : readKassalJsonLdPrices(product);
    if (productName === void 0 || prices.length === 0) return void 0;
    const pageGtin = readLikelyGtin(readStringLike$3(product.gtin) ?? readStringLike$3(product.gtin13));
    const pageQuantity = readKassalPackageQuantity(product, productName);
    const matchedByCode = pageGtin !== void 0 && getLikelyGtins$1(message.codes).includes(pageGtin);
    const matchedByQuantity = pageQuantity !== void 0 && isSamePackageQuantity(getMessagePackageQuantity$1(message), pageQuantity) && hasRequestedBrandSignal$1(message, productName, product) && isLikelySameGroceryTitle$1(message, productName);
    if (!matchedByCode && !matchedByQuantity) return void 0;
    const sortedPrices = [...prices].sort((first, second) => first.amount - second.amount);
    const best = sortedPrices[0];
    if (best === void 0) return void 0;
    return {
      source: "kassal",
      sourceName: "Kassalapp",
      matchedExactProduct: true,
      shopName: best.shopName,
      amount: best.amount,
      currency: best.currency,
      price: best.price,
      productName,
      productUrl,
      ...best.offerUrl !== void 0 ? { offerUrl: best.offerUrl } : {},
      alternatives: sortedPrices.slice(0, 10).map((price) => ({
        shopName: price.shopName,
        amount: price.amount,
        currency: price.currency,
        price: price.price
      }))
    };
  }
  async function findKassalProductUrlCandidates(message, requestText) {
    const cacheKey = buildKassalCacheKey(message);
    if (cacheKey === void 0) return [];
    let cached = kassalProductUrlCache.get(cacheKey);
    if (cached === void 0) {
      cached = findKassalProductUrlCandidatesUncached(message, requestText);
      kassalProductUrlCache.set(cacheKey, cached);
    }
    return cached;
  }
  async function findKassalProductUrlCandidatesUncached(message, requestText) {
    const sitemapUrls = await fetchKassalProductSitemapUrls(requestText);
    if (sitemapUrls.length === 0) return [];
    const gtins = getLikelyGtins$1(message.codes);
    if (gtins.length > 0) {
      const gtinMatches = await findKassalProductUrlMatchesInSitemaps(
        sitemapUrls,
        requestText,
        (xml) => readKassalProductUrlsMatchingGtins(xml, gtins)
      );
      if (gtinMatches.length > 0) return gtinMatches;
    }
    const slugCandidates = buildKassalSlugCandidates(message);
    if (slugCandidates.length === 0) return [];
    return findKassalProductUrlMatchesInSitemaps(
      sitemapUrls,
      requestText,
      (xml) => readKassalProductUrlsMatchingSlugs(xml, slugCandidates)
    );
  }
  async function fetchKassalProductSitemapUrls(requestText) {
    const xml = await requestText(KASSAL_SITEMAP_INDEX_URL, {
      headers: { "Accept": "application/xml,text/xml" }
    });
    if (xml === void 0) return [];
    const urls = [...xml.matchAll(/<loc>\s*([^<]+sitemap-products-\d+\.xml)\s*<\/loc>/gi)].map((match) => decodeHtml$1(match[1] ?? "").trim()).filter((url) => url.length > 0);
    return uniqueStrings$6(urls);
  }
  async function findKassalProductUrlMatchesInSitemaps(sitemapUrls, requestText, readMatches) {
    const matches = [];
    for (const sitemapUrl of sitemapUrls.slice(0, MAX_KASSAL_SITEMAPS)) {
      const xml = await requestText(sitemapUrl, {
        headers: { "Accept": "application/xml,text/xml" }
      });
      if (xml === void 0) continue;
      for (const productUrl of readMatches(xml)) {
        matches.push(productUrl);
      }
      if (matches.length > 0) return uniqueStrings$6(matches).slice(0, MAX_KASSAL_PRODUCT_CANDIDATES);
    }
    return uniqueStrings$6(matches);
  }
  function readKassalProductUrlsMatchingGtins(xml, gtins) {
    return readKassalProductUrlsFromSitemap(xml).filter((url) => {
      const lowerUrl = url.toLowerCase();
      return gtins.some((gtin) => lowerUrl.includes(gtin));
    });
  }
  function readKassalProductUrlsMatchingSlugs(xml, slugCandidates) {
    return readKassalProductUrlsFromSitemap(xml).filter((url) => {
      const lowerUrl = url.toLowerCase();
      return slugCandidates.some((slug) => lowerUrl.includes(slug));
    });
  }
  function readKassalProductUrlsFromSitemap(xml) {
    const urls = [...xml.matchAll(/<loc>\s*(https:\/\/kassal\.app\/vare\/[^<]+)\s*<\/loc>/gi)].map((match) => decodeHtml$1(match[1] ?? ""));
    return urls;
  }
  function buildKassalSlugCandidates(message) {
    const quantityLabels = buildPackageQuantityLabels(getMessagePackageQuantity$1(message));
    const brand = message.productBrand;
    const titles = uniqueStrings$6([
      message.searchTerm,
      ...message.productTitleCandidates ?? []
    ]).map(cleanGroceryTitleCandidate$1);
    const slugs = [];
    for (const title of titles) {
      if (title.length < 3) continue;
      const titleWithoutBrand = brand !== void 0 ? removeTokenPhrase$1(title, brand) : title;
      const titleWithoutQuantity = removePackageLabels$1(titleWithoutBrand, quantityLabels);
      if (!hasMeaningfulProductTerm(titleWithoutQuantity)) continue;
      slugs.push(slugifyKassalTitle(title));
      for (const quantityLabel of quantityLabels) {
        slugs.push(slugifyKassalTitle(`${titleWithoutQuantity} ${quantityLabel}`));
        if (brand !== void 0) {
          slugs.push(slugifyKassalTitle(`${titleWithoutQuantity} ${quantityLabel} ${brand}`));
          slugs.push(slugifyKassalTitle(`${brand} ${titleWithoutQuantity} ${quantityLabel}`));
        }
      }
    }
    return uniqueStrings$6(slugs).filter((slug) => slug.length >= 4).slice(0, 12);
  }
  function buildKassalCacheKey(message) {
    const gtins = getLikelyGtins$1(message.codes);
    if (gtins.length > 0) return `gtin:${gtins.join(",")}`;
    const slugs = buildKassalSlugCandidates(message);
    return slugs.length > 0 ? `slug:${slugs.join(",")}` : void 0;
  }
  function readKassalProductJsonLd(html) {
    for (const rawJson of readJsonLdScriptContents(html)) {
      let value;
      try {
        value = JSON.parse(rawJson);
      } catch {
        continue;
      }
      const product = findTypedJsonLd(value, "Product");
      if (product !== void 0) return product;
    }
    return void 0;
  }
  function readJsonLdScriptContents(html) {
    return [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((match) => decodeHtml$1(match[1] ?? "").trim()).filter((value) => value.length > 0);
  }
  function findTypedJsonLd(value, type) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findTypedJsonLd(item, type);
        if (found !== void 0) return found;
      }
      return void 0;
    }
    if (!isPlainRecord$4(value)) return void 0;
    const graph = value["@graph"];
    if (Array.isArray(graph)) {
      for (const item of graph) {
        const found = findTypedJsonLd(item, type);
        if (found !== void 0) return found;
      }
    }
    const rawType = value["@type"];
    const types = Array.isArray(rawType) ? rawType : [rawType];
    return types.some((item) => item === type) ? value : void 0;
  }
  function readKassalVisiblePrices(html) {
    return [...html.matchAll(/<a\b(?=[^>]*wire:key=["']price-product-[^"']+["'])[\s\S]*?<\/a>/gi)].map((match) => readKassalVisiblePriceRow(match[0])).filter((price) => price !== void 0);
  }
  function readKassalVisiblePriceRow(rowHtml) {
    const offerUrl = readHtmlAttribute(rowHtml, "href");
    const shopName = readHtmlAttribute(rowHtml.match(/<img\b[\s\S]*?>/i)?.[0] ?? "", "alt");
    const titleHtml = rowHtml.match(/<p\b[^>]*class=["'][^"']*text-sm[^"']*font-medium[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1];
    const productName = titleHtml !== void 0 ? decodeHtml$1(stripHtml$1(titleHtml)).trim() : void 0;
    const amount = readNumberLike$4(rowHtml.match(/<span\b[^>]*class=["'][^"']*text-(?:green|rose)-600[^"']*["'][^>]*>\s*kr\s*([\d\s.,]+)/i)?.[1]);
    if (shopName === void 0 || amount === void 0 || amount <= 0) return void 0;
    return {
      shopName,
      amount,
      currency: "NOK",
      price: formatNokPrice$4(amount),
      ...offerUrl !== void 0 ? { offerUrl: decodeHtml$1(offerUrl) } : {},
      ...productName !== void 0 ? { productName } : {}
    };
  }
  function readKassalJsonLdPrices(product) {
    const offers = Array.isArray(product.offers) ? product.offers : [product.offers];
    return offers.map((offer) => {
      if (!isPlainRecord$4(offer)) return void 0;
      const seller = isPlainRecord$4(offer.seller) ? offer.seller : void 0;
      const shopName = readStringLike$3(seller?.name);
      const amount = readNumberLike$4(offer.price);
      const currency = readStringLike$3(offer.priceCurrency) ?? "NOK";
      if (shopName === void 0 || amount === void 0 || amount <= 0 || currency !== "NOK") return void 0;
      const offerUrl = readStringLike$3(offer.url);
      return {
        shopName,
        amount,
        currency,
        price: formatNokPrice$4(amount),
        ...offerUrl !== void 0 ? { offerUrl } : {}
      };
    }).filter((price) => price !== void 0);
  }
  function readKassalPackageQuantity(product, productName) {
    return readPackageQuantityFromValue(product.weight) ?? readPackageQuantityFromValue(product.size) ?? readPackageQuantityFromText(productName);
  }
  function readKassalProductUrl(rawUrl) {
    if (rawUrl === void 0) return void 0;
    try {
      const url = new URL(rawUrl);
      const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
      return hostname === "kassal.app" && /^\/vare\/[^/]+\/?$/i.test(url.pathname) ? url.toString() : void 0;
    } catch {
      return void 0;
    }
  }
  function isKassalNotFoundPage(html) {
    return /<title>\s*404/i.test(html) || /<h1[^>]*>\s*404/i.test(html);
  }
  function hasGroceryIdentitySignal$1(message) {
    return getLikelyGtins$1(message.codes).length > 0 || getMessagePackageQuantity$1(message) !== void 0;
  }
  function isLikelySameGroceryTitle$1(message, title) {
    return uniqueStrings$6([message.searchTerm, ...message.productTitleCandidates ?? []]).some((candidate) => isLikelySameProductTitle(cleanGroceryTitleCandidate$1(candidate), title, 0.4));
  }
  function hasRequestedBrandSignal$1(message, productName, product) {
    if (message.productBrand === void 0) return true;
    const brand = normalizeBrandText$1(message.productBrand);
    if (brand.length < 3) return true;
    const productBrand = isPlainRecord$4(product.brand) ? readStringLike$3(product.brand.name) : readStringLike$3(product.brand);
    return normalizeBrandText$1(`${productBrand ?? ""} ${productName}`).includes(brand);
  }
  function getMessagePackageQuantity$1(message) {
    return message.packageAmount !== void 0 && message.packageUnit !== void 0 ? { amount: message.packageAmount, unit: message.packageUnit } : void 0;
  }
  function cleanGroceryTitleCandidate$1(value) {
    return value.replace(/^(?:kj\u00f8p|kjop|bestill|buy)\s+/i, "").replace(/\s+(?:hos|at)\s+[^|-]+(?:[-|].*)?$/i, "").replace(/\s+[-|]\s+(?:Oda|MENY|SPAR|KIWI|REMA\s*1000|Coop(?:\s+Extra)?)\s*$/i, "").replace(/\s+[-|]\s+\d[\d\s]*(?:,\d{1,2})?\s*kr.*$/i, "").replace(/,\s*fra\s+\d[\d\s]*(?:,\d{1,2})?\s*kr.*$/i, "").replace(/\bfra\s+\d[\d\s]*(?:,\d{1,2})?\s*kr\b.*$/i, "").replace(/[.]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function removePackageLabels$1(value, quantityLabels) {
    let cleaned = value;
    for (const label of quantityLabels) {
      const escaped = escapeRegExp$1(label).replace(/\\ /g, "\\s*");
      cleaned = cleaned.replace(new RegExp(`\\b${escaped}\\b`, "gi"), " ");
    }
    return cleaned.replace(/\s+/g, " ").trim();
  }
  function removeTokenPhrase$1(value, phrase) {
    const escaped = escapeRegExp$1(phrase).replace(/\\ /g, "\\s+");
    return value.replace(new RegExp(`\\b${escaped}\\b`, "gi"), " ").replace(/\s+/g, " ").trim();
  }
  function hasMeaningfulProductTerm(value) {
    return transliterateNorwegianCharacters$3(value).split(/[^A-Za-z0-9]+/).some((token) => /[A-Za-z]/.test(token) && token.length >= 3);
  }
  function slugifyKassalTitle(value) {
    return transliterateNorwegianCharacters$3(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
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
  function readLikelyGtin(value) {
    const normalized = value?.replace(/\D/g, "");
    return normalized !== void 0 && isLikelyGtin$3(normalized) ? normalized : void 0;
  }
  function getLikelyGtins$1(codes) {
    return uniqueStrings$6((codes ?? []).map((code) => code.replace(/\D/g, "")).filter(isLikelyGtin$3));
  }
  function isLikelyGtin$3(value) {
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
  function decodeHtml$1(value) {
    return value.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  }
  function readHtmlAttribute(html, attributeName) {
    const match = html.match(new RegExp(`\\b${escapeRegExp$1(attributeName)}=["']([^"']*)["']`, "i"));
    const value = match?.[1];
    return value !== void 0 && value.trim().length > 0 ? value.trim() : void 0;
  }
  function stripHtml$1(value) {
    return value.replace(/<[^>]*>/g, " ");
  }
  function transliterateNorwegianCharacters$3(value) {
    return value.replace(/[\u00C6\u00E6]/g, "ae").replace(/[\u00D8\u00F8]/g, "o").replace(/[\u00C5\u00E5]/g, "a");
  }
  function normalizeBrandText$1(value) {
    return transliterateNorwegianCharacters$3(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^A-Za-z0-9]+/g, "").toLowerCase();
  }
  function escapeRegExp$1(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  const CODE_QUERY_MIN_MATCH_SCORE = 0.3;
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
      ...(message.codes ?? []).filter(isLikelyGtin$5),
      message.searchTerm
    ]);
    const anchor = buildProductMatchAnchor(message);
    for (const query of searchQueries) {
      const product = await fetchKlarnaProduct(query, requestJson, anchor, isLikelyGtin$5(query));
      if (product === void 0) continue;
      const offer = await fetchKlarnaOfferForProduct(product, requestJson);
      if (offer !== void 0) return offer;
    }
    return void 0;
  }
  async function fetchKlarnaProduct(query, requestJson, anchor, isCodeQuery) {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 4 || normalizedQuery.length > 100) return void 0;
    const params = new URLSearchParams({ q: normalizedQuery });
    const value = await requestJson(`${KLARNA_SEARCH_URL}?${params.toString()}`, {
      headers: { "Accept": "application/json" }
    });
    if (!isPlainRecord$3(value) || !Array.isArray(value.products)) return void 0;
    const candidates = [];
    for (const product of value.products) {
      if (!isPlainRecord$3(product)) continue;
      const id = readStringLike$2(product.id);
      const name = readStringLike$2(product.name);
      const path = readStringLike$2(product.url);
      const lowestPrice = isPlainRecord$3(product.lowestPrice) ? product.lowestPrice : void 0;
      const currency = readStringLike$2(lowestPrice?.currency);
      const outOfStock = product.outOfStock === true;
      if (id !== void 0 && name !== void 0 && path !== void 0 && currency === "NOK" && !outOfStock) {
        candidates.push({
          id,
          name,
          productUrl: `${KLARNA_PRODUCT_URL}${path}`
        });
      }
    }
    if (isCodeQuery) {
      return pickBestProductCandidate(anchor, candidates, (candidate) => ({ title: candidate.name }), CODE_QUERY_MIN_MATCH_SCORE);
    }
    return pickBestProductCandidate(anchor, candidates, (candidate) => ({ title: candidate.name }));
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
    const titleSearchOffer = await fetchPrisjaktSearchByTitle(message, requestJson);
    if (titleSearchOffer !== void 0 && isNorwegianPriceMatchOffer(titleSearchOffer)) {
      return titleSearchOffer;
    }
    return void 0;
  }
  async function fetchPrisjaktSearchByTitle(message, requestJson) {
    const products = await fetchPrisjaktSearchProducts(message.searchTerm, requestJson);
    const anchor = buildProductMatchAnchor(message);
    const product = pickBestProductCandidate(anchor, products, (candidate) => ({ title: candidate.name }));
    return product !== void 0 ? fetchBestNativePrisjaktOffer(product, requestJson) : void 0;
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
    const product = readPrisjaktSearchProducts(value)[0];
    return product !== void 0 ? fetchBestNativePrisjaktOffer(product, requestJson) : void 0;
  }
  async function fetchPrisjaktSearchProducts(searchTerm, requestJson) {
    const normalizedSearchTerm = searchTerm.trim();
    if (normalizedSearchTerm.length < 8) return [];
    const params = new URLSearchParams({
      term: normalizedSearchTerm,
      market: "NO",
      includePromotionDetails: "true"
    });
    const value = await requestJson(`https://browser-extension-backend.cloud.pji.nu/v1/search?${params.toString()}`, {
      headers: { "Content-Type": "application/json" }
    });
    return readPrisjaktSearchProducts(value);
  }
  async function fetchPrisjaktSearchByCodes(codes, requestJson) {
    for (const code of uniqueStrings$4((codes ?? []).filter(isLikelyGtin$2))) {
      const offer = await fetchPrisjaktSearch(code, requestJson);
      if (offer !== void 0) return offer;
    }
    return void 0;
  }
  function readPrisjaktSearchProducts(value) {
    if (!isPlainRecord$2(value)) return [];
    const details = Array.isArray(value.details) ? value.details : [];
    const products = [];
    for (const detail of details) {
      if (!isPlainRecord$2(detail) || !isPlainRecord$2(detail.product)) continue;
      const id = readNumberLike$2(detail.product.id);
      const name = typeof detail.product.name === "string" ? detail.product.name : void 0;
      if (id !== void 0 && name !== void 0) {
        products.push({
          id,
          name,
          productUrl: `https://www.prisjakt.no/product.php?p=${encodeURIComponent(String(id))}`
        });
      }
    }
    return products;
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
      uniqueStrings$3([message.searchTerm, ...options.anchorSearchTerms ?? []]),
      message
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
  async function fetchLoosePrisradarOfferForQueries(queries, requestJson, requestText, anchorTerms, message) {
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
    const merchantKeys = message !== void 0 ? getCurrentMerchantKeys$1(message) : [];
    const matchedOffers = [];
    let firstOffer;
    for (const product of rankedProducts) {
      const offer = await fetchPrisradarOfferForUrl(product.productUrl, requestText);
      if (offer === void 0) continue;
      if (message === void 0 || merchantKeys.length === 0) return offer;
      firstOffer ??= offer;
      const displayOffer = preferCurrentMerchantWhenTiedForBest(offer, merchantKeys);
      const merchantPriceDistance = getMerchantPriceDistance(displayOffer, merchantKeys, message.price);
      if (merchantPriceDistance !== void 0) {
        matchedOffers.push({ offer: { ...displayOffer, matchedCurrentMerchant: true }, product, merchantPriceDistance });
      }
    }
    matchedOffers.sort(comparePrisradarMatchedOffers);
    return matchedOffers[0]?.offer ?? firstOffer;
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
    return anchorTerms.every((anchorTerm) => !hasConflictingHardVariant(extractHardVariantGroups(anchorTerm), titleVariant) && !hasModelNumberConflict(anchorTerm, title) && !hasNumericModelConflict(anchorTerm, title));
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
  const COLOR_VARIANT_TOKENS = /* @__PURE__ */ new Set(["hvit", "svart", "rod", "bla", "gronn", "gul", "rosa", "lilla", "solv", "gull", "gra", "brun", "oransje", "beige", "sandstone"]);
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
    if (!isRecord$3(value)) return void 0;
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
    if (!isRecord$3(value)) return void 0;
    const directCode = normalizeVinmonopoletProductCode(readString(value.code));
    if (directCode !== void 0) return directCode;
    const product = isRecord$3(value.product) ? value.product : void 0;
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
    if (!isRecord$3(value)) return void 0;
    if (isRecord$3(value.product)) return value.product;
    if (isRecord$3(value.data)) return value.data;
    return value;
  }
  function readVinmonopoletSearchOffers(value) {
    if (!isRecord$3(value) || !Array.isArray(value.products)) return [];
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
    if (isRecord$3(value)) {
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
    if (!isRecord$3(value)) return void 0;
    return readString(value.formattedValue) ?? readString(value.readableValue);
  }
  function readValueFromRecord(value) {
    if (!isRecord$3(value)) return void 0;
    return readNumber(value.value);
  }
  function readTaxfreeHits(value) {
    if (!isRecord$3(value) || !Array.isArray(value.results)) return [];
    return value.results.filter(isRecord$3).flatMap((result) => Array.isArray(result.hits) ? result.hits : []);
  }
  function readTaxfreeProductUrl(value) {
    const localizedUrls = isRecord$3(value.localizedUrls) ? value.localizedUrls : void 0;
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
    if (!isRecord$3(value)) return void 0;
    return readNumber(value.NOK);
  }
  function readLocalizedString(value) {
    if (!isRecord$3(value)) return void 0;
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
  function isRecord$3(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  const MIN_ALLOWED_PRODUCT_TITLE_MATCH_SCORE = 0.45;
  async function findPriceMatches(message, requestJson, requestText, options = {}) {
    if (isVinmonopoletProductUrl(message.url)) {
      const taxfreeOffer2 = await ignorePriceMatchFailure(findTaxfreePriceMatch(message, requestJson));
      return taxfreeOffer2 !== void 0 ? [taxfreeOffer2] : [];
    }
    if (isTaxfreeProductUrl(message.url)) {
      const vinmonopoletOffer = await ignorePriceMatchFailure(findVinmonopoletPriceMatch(message, requestJson));
      return vinmonopoletOffer !== void 0 ? [vinmonopoletOffer] : [];
    }
    if (isItadGameStoreProductUrl(message.url) || isItadGameStoreProductUrl(message.productUrl)) {
      const [isthereanydealOffer2, ggDealsOffer, allKeyShopOffer] = await Promise.all([
        ignorePriceMatchFailure(findIsthereanydealPriceMatch(message, requestJson, requestText)),
        ignorePriceMatchFailure(findGgDealsPriceMatch(message, requestJson, requestText, options.ggDeals)),
        ignorePriceMatchFailure(findAllKeyShopPriceMatch(message, requestJson, requestText))
      ]);
      return sortPriceMatchOffers([isthereanydealOffer2, ggDealsOffer, allKeyShopOffer].filter((offer) => offer !== void 0));
    }
    const [prisjaktOffer, godprisOffer, klarnaOffer, prisradarOffer, isthereanydealOffer, taxfreeOffer, sesumOffer, enhverOffer, kassalOffer] = await Promise.all([
      ignorePriceMatchFailure(findPrisjaktPriceMatch(message, requestJson)),
      ignorePriceMatchFailure(findGodprisPriceMatch(message, requestJson, requestText)),
      ignorePriceMatchFailure(findKlarnaPriceMatch(message, requestJson)),
      ignorePriceMatchFailure(findPrisradarPriceMatch(message, requestJson, requestText)),
      ignorePriceMatchFailure(findIsthereanydealPriceMatch(message, requestJson, requestText)),
      ignorePriceMatchFailure(findTaxfreePriceMatch(message, requestJson)),
      ignorePriceMatchFailure(findSesumPriceMatch(message, requestText)),
      ignorePriceMatchFailure(findEnhverPriceMatch(message, requestJson, requestText)),
      ignorePriceMatchFailure(findKassalPriceMatch(message, requestText))
    ]);
    const anchorOffers = [prisjaktOffer, klarnaOffer].filter((offer) => offer !== void 0);
    const anchorOffersMatchCurrentPage = isPriceMatchAllowedForCurrentPage(anchorOffers, message);
    const canUsePrisradarOffer = anchorOffersMatchCurrentPage || isKnownPriceMatchSourceProductUrl(message.url) || isKnownPriceMatchSourceProductUrl(message.productUrl);
    const variantAnchor = buildProductMatchAnchor(message);
    const validGodprisOffer = withoutProductVariantConflict(godprisOffer, variantAnchor);
    const validPrisradarOffer = withoutProductVariantConflict(prisradarOffer, variantAnchor);
    const [relaxedPrisradarOffer, relaxedGodprisOffer] = await Promise.all([
      validPrisradarOffer === void 0 && anchorOffersMatchCurrentPage ? ignorePriceMatchFailure(findPrisradarPriceMatch(message, requestJson, requestText, {
        allowLooseTextSearch: true,
        anchorSearchTerms: anchorOffers.map((offer) => offer.productName)
      })) : void 0,
      validGodprisOffer === void 0 && anchorOffersMatchCurrentPage ? ignorePriceMatchFailure(findGodprisPriceMatch(message, requestJson, requestText, {
        anchorSearchTerms: anchorOffers.map((offer) => offer.productName)
      })) : void 0
    ]);
    const offers = [
      ...anchorOffers,
      validGodprisOffer ?? relaxedGodprisOffer,
      canUsePrisradarOffer ? validPrisradarOffer ?? relaxedPrisradarOffer : void 0,
      isthereanydealOffer,
      taxfreeOffer,
      sesumOffer,
      enhverOffer,
      kassalOffer
    ].filter((offer) => offer !== void 0);
    const productAnchorTerms = uniqueStrings$1([
      message.searchTerm,
      ...anchorOffers.map((offer) => offer.productName)
    ]);
    const allowedOffers = offers.filter((offer) => isSupplementalPriceMatchOfferAligned(offer, productAnchorTerms)).filter((offer) => hasContextualVolumeMatching(offer) || !hasProductVariantConflict(variantAnchor, offer.productName)).filter((offer) => isPriceMatchOfferPricePlausible(offer, message)).filter((offer) => isPriceMatchOfferAllowedForCurrentPage(offer, message));
    if (!isPriceMatchAllowedForCurrentPage(allowedOffers, message)) {
      return [];
    }
    return sortPriceMatchOffers(allowedOffers);
  }
  function hasContextualVolumeMatching(offer) {
    return offer.source === "taxfree" || offer.source === "vinmonopolet";
  }
  function withoutProductVariantConflict(offer, variantAnchor) {
    if (offer === void 0 || hasContextualVolumeMatching(offer)) return offer;
    return hasProductVariantConflict(variantAnchor, offer.productName) ? void 0 : offer;
  }
  const SUSPICIOUSLY_CHEAP_PRICE_RATIO = 0.6;
  const SUSPICIOUSLY_CHEAP_MIN_TITLE_SCORE = 0.6;
  const PRICE_PLAUSIBILITY_SOURCES = /* @__PURE__ */ new Set(["godpris", "klarna", "prisradar"]);
  function isPriceMatchOfferPricePlausible(offer, message) {
    if (offer.source === void 0 || !PRICE_PLAUSIBILITY_SOURCES.has(offer.source)) return true;
    if (message.price === void 0 || message.price <= 0) return true;
    if (offer.amount >= message.price * SUSPICIOUSLY_CHEAP_PRICE_RATIO) return true;
    return hasMatchingModelNumberToken(message.searchTerm, offer.productName) || scoreProductTitleAgainstSearchTerm(message.searchTerm, offer.productName) >= SUSPICIOUSLY_CHEAP_MIN_TITLE_SCORE;
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
    if (offer.source === "kassal") return 6;
    if (offer.source === "isthereanydeal") return 7;
    if (offer.source === "ggdeals") return 8;
    if (offer.source === "allkeyshop") return 9;
    if (offer.source === "taxfree") return 10;
    if (offer.source === "vinmonopolet") return 10;
    return 4;
  }
  function sortPriceMatchOffers(offers) {
    return offers.sort((first, second) => {
      const amountDifference = first.amount - second.amount;
      if (amountDifference !== 0) return amountDifference;
      return sourceRank(first) - sourceRank(second);
    });
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
      if (hostname === "google.com" || hostname.endsWith(".google.com") || hostname.startsWith("google.")) {
        return pathname === "/search" && (url.searchParams.get("udm") === "28" || url.searchParams.get("tbm") === "shop");
      }
      if (hostname.endsWith("godpris.no")) return /^\/produkt\/[^/]+\/?$/.test(pathname);
      if (hostname.endsWith("tax-free.no")) return /^\/(?:no\/)?product\d+(?:\/|$)/.test(pathname);
      if (hostname.endsWith("vinmonopolet.no")) return /\/p\/\d+(?:\/|$)/.test(pathname);
      if (hostname.endsWith("klarna.com")) return /\/shopping\/pl\/(?:cl\d+\/)?\d+\//.test(pathname);
      if (hostname.endsWith("kelkoo.no")) return /^\/gtin\/\d+\/?$/.test(pathname);
      if (hostname.endsWith("prisradar.no")) return /^\/produkter\/[^/]+\/?$/.test(pathname);
      if (hostname.endsWith("sesum.no")) return /^\/produkt\/[^/]+\/?$/.test(pathname);
      if (hostname.endsWith("enhver.no")) return /^\/brands\/[^/]+\/\d+\/?$/.test(pathname);
      if (hostname.endsWith("kassal.app")) return /^\/vare\/[^/]+\/?$/.test(pathname);
      if (hostname.endsWith("allkeyshop.com")) return /^\/blog\/buy-[^/]+-cd-key-compare-prices\/?$/.test(pathname);
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
  async function findPlayStationRegionPrices(productUrl, textRequest = defaultTextRequest$1, jsonRequest = defaultJsonRequest$1) {
    const product = await resolvePlayStationProduct(productUrl, textRequest);
    if (product === void 0) {
      return void 0;
    }
    const ratesResponse = await jsonRequest("https://open.er-api.com/v6/latest/NOK");
    const rates = readNokBaseRates$2(ratesResponse);
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
        formattedPrice: formatCurrency$1(offer.price, offer.currency, region.locale),
        nokAmount,
        formattedNok: formatCurrency$1(nokAmount, "NOK", "nb-NO"),
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
      const parsed = parseJson$1(decodeHtmlAttribute(rawValue));
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
      const parsed = parseJson$1(decodeHtmlAttribute(rawValue));
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
    if (!isRecord$2(value)) {
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
    if (!isRecord$2(value)) {
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
      const parsed = parseJson$1(body);
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
    if (!isRecord$2(value) || typeof value.sku !== "string" || value.sku.length === 0) {
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
      const parsed = parseJson$1(body);
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
    if (!isRecord$2(value)) {
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
    if (!isRecord$2(offer)) {
      return void 0;
    }
    const rawPrice = typeof offer.price === "number" ? offer.price : typeof offer.price === "string" ? Number.parseFloat(offer.price.replace(",", ".")) : Number.NaN;
    const currency = typeof offer.priceCurrency === "string" ? offer.priceCurrency.toUpperCase() : void 0;
    if (!Number.isFinite(rawPrice) || currency === void 0) {
      return void 0;
    }
    return { price: rawPrice, currency };
  }
  function readNokBaseRates$2(value) {
    if (!isRecord$2(value) || value.result !== "success" || !isRecord$2(value.rates)) {
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
  async function defaultTextRequest$1(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) return void 0;
      return await response.text();
    } catch {
      return void 0;
    }
  }
  async function defaultJsonRequest$1(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) return void 0;
      return await response.json();
    } catch {
      return void 0;
    }
  }
  function parseJson$1(value) {
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
  function formatCurrency$1(amount, currency, locale) {
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
  function isRecord$2(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  const APPSTOREPRICE_SOURCE_NAME = "AppStorePrice";
  const APPSTOREPRICE_SOUND_CLOUD_URL = "https://appstoreprice.org/en/apps/336353151";
  const APPSTOREPRICE_SPOTIFY_URL = "https://appstoreprice.org/en/apps/spotify";
  const MAX_APPSTOREPRICE_TOOLTIP_PLANS = 10;
  const APPLE_SEARCH_RESULT_LIMIT = 10;
  const APPLE_SEARCH_MATCH_THRESHOLD = 70;
  const APPSTOREPRICE_DOMAIN_SEARCH_ALIASES = {
    "chatgpt.com": ["chatgpt", "openai chatgpt"],
    "claude.ai": ["claude", "anthropic claude"],
    "firecore.com": ["firecore", "infuse"],
    "github.com": ["github"],
    "netflix.com": ["netflix"],
    "soundcloud.com": ["soundcloud"],
    "twitter.com": ["x", "twitter"],
    "x.com": ["x", "twitter"],
    "youtube.com": ["youtube", "youtube premium"]
  };
  const APPSTOREPRICE_ALWAYS_TRY_DOMAINS = /* @__PURE__ */ new Set([
    "chatgpt.com",
    "claude.ai",
    "firecore.com",
    "github.com",
    "netflix.com",
    "soundcloud.com",
    "twitter.com",
    "x.com",
    "youtube.com"
  ]);
  const APPSTOREPRICE_DOMAIN_RESOLVER_EXCLUDED_DOMAINS = /* @__PURE__ */ new Set([
    "apple.com",
    "appstoreprice.org",
    "google.com",
    "microsoft.com",
    "playstation.com",
    "store.playstation.com"
  ]);
  const APPSTOREPRICE_COUNTRIES = {
    AE: { countryName: "De forente arabiske emirater", flag: "🇦🇪", locale: "ar-AE" },
    AR: { countryName: "Argentina", flag: "🇦🇷", locale: "es-AR" },
    AU: { countryName: "Australia", flag: "🇦🇺", locale: "en-AU" },
    BE: { countryName: "Belgia", flag: "🇧🇪", locale: "nl-BE" },
    BR: { countryName: "Brasil", flag: "🇧🇷", locale: "pt-BR" },
    CA: { countryName: "Canada", flag: "🇨🇦", locale: "en-CA" },
    CH: { countryName: "Sveits", flag: "🇨🇭", locale: "de-CH" },
    CL: { countryName: "Chile", flag: "🇨🇱", locale: "es-CL" },
    CN: { countryName: "Kina", flag: "🇨🇳", locale: "zh-CN" },
    CO: { countryName: "Colombia", flag: "🇨🇴", locale: "es-CO" },
    CZ: { countryName: "Tsjekkia", flag: "🇨🇿", locale: "cs-CZ" },
    DE: { countryName: "Tyskland", flag: "🇩🇪", locale: "de-DE" },
    DK: { countryName: "Danmark", flag: "🇩🇰", locale: "da-DK" },
    EG: { countryName: "Egypt", flag: "🇪🇬", locale: "ar-EG" },
    ES: { countryName: "Spania", flag: "🇪🇸", locale: "es-ES" },
    FI: { countryName: "Finland", flag: "🇫🇮", locale: "fi-FI" },
    FR: { countryName: "Frankrike", flag: "🇫🇷", locale: "fr-FR" },
    GB: { countryName: "UK", flag: "🇬🇧", locale: "en-GB" },
    GR: { countryName: "Hellas", flag: "🇬🇷", locale: "el-GR" },
    HK: { countryName: "Hongkong", flag: "🇭🇰", locale: "zh-HK" },
    HU: { countryName: "Ungarn", flag: "🇭🇺", locale: "hu-HU" },
    ID: { countryName: "Indonesia", flag: "🇮🇩", locale: "id-ID" },
    IL: { countryName: "Israel", flag: "🇮🇱", locale: "he-IL" },
    IN: { countryName: "India", flag: "🇮🇳", locale: "en-IN" },
    IT: { countryName: "Italia", flag: "🇮🇹", locale: "it-IT" },
    JP: { countryName: "Japan", flag: "🇯🇵", locale: "ja-JP" },
    KR: { countryName: "Sør-Korea", flag: "🇰🇷", locale: "ko-KR" },
    MX: { countryName: "Mexico", flag: "🇲🇽", locale: "es-MX" },
    MY: { countryName: "Malaysia", flag: "🇲🇾", locale: "ms-MY" },
    NG: { countryName: "Nigeria", flag: "🇳🇬", locale: "en-NG" },
    NL: { countryName: "Nederland", flag: "🇳🇱", locale: "nl-NL" },
    NO: { countryName: "Norge", flag: "🇳🇴", locale: "nb-NO" },
    NZ: { countryName: "New Zealand", flag: "🇳🇿", locale: "en-NZ" },
    PE: { countryName: "Peru", flag: "🇵🇪", locale: "es-PE" },
    PH: { countryName: "Filippinene", flag: "🇵🇭", locale: "en-PH" },
    PK: { countryName: "Pakistan", flag: "🇵🇰", locale: "en-PK" },
    PL: { countryName: "Polen", flag: "🇵🇱", locale: "pl-PL" },
    PT: { countryName: "Portugal", flag: "🇵🇹", locale: "pt-PT" },
    RO: { countryName: "Romania", flag: "🇷🇴", locale: "ro-RO" },
    RU: { countryName: "Russland", flag: "🇷🇺", locale: "ru-RU" },
    SA: { countryName: "Saudi-Arabia", flag: "🇸🇦", locale: "ar-SA" },
    SE: { countryName: "Sverige", flag: "🇸🇪", locale: "sv-SE" },
    SG: { countryName: "Singapore", flag: "🇸🇬", locale: "en-SG" },
    TH: { countryName: "Thailand", flag: "🇹🇭", locale: "th-TH" },
    TR: { countryName: "Tyrkia", flag: "🇹🇷", locale: "tr-TR" },
    TW: { countryName: "Taiwan", flag: "🇹🇼", locale: "zh-TW" },
    UA: { countryName: "Ukraina", flag: "🇺🇦", locale: "uk-UA" },
    US: { countryName: "USA", flag: "🇺🇸", locale: "en-US" },
    VN: { countryName: "Vietnam", flag: "🇻🇳", locale: "vi-VN" },
    ZA: { countryName: "Sør-Afrika", flag: "🇿🇦", locale: "en-ZA" }
  };
  function isAppStorePriceRegionPriceUrl(url) {
    return getAppStorePriceConfig(url) !== void 0;
  }
  function isPotentialAppStorePriceRegionPriceUrl(url) {
    return isAppStorePriceRegionPriceUrl(url) || getAppStorePriceDomainCandidate(url) !== void 0;
  }
  async function findAppStorePriceRegionPricesForUrl(url, textRequest = defaultTextRequest, jsonRequest = defaultJsonRequest) {
    const config = await resolveAppStorePriceConfig(url, jsonRequest);
    if (config === void 0) {
      return void 0;
    }
    const html = await textRequest(config.sourceUrl);
    if (html === void 0) {
      return void 0;
    }
    const subscriptions = filterAppStorePriceSubscriptions(
      extractAppStorePriceSubscriptions(html).filter((entry) => hasPositiveAppStorePrice(entry) && hasSupportedAppStorePriceDuration(entry)),
      config
    );
    const subscription = selectDefaultAppStorePriceSubscription(subscriptions, config);
    if (subscription === void 0 || subscription.prices.length === 0) {
      return void 0;
    }
    const ratesResponse = await jsonRequest("https://open.er-api.com/v6/latest/NOK");
    const rates = readNokBaseRates$1(ratesResponse);
    const ratesUpdatedAt = rates?.updatedAt;
    if (rates === void 0) {
      return void 0;
    }
    const comparableSubscriptions = [
      subscription,
      ...subscriptions.filter((entry) => entry.subscriptionId !== subscription.subscriptionId)
    ];
    const availablePlanNames = uniquePlanNames(comparableSubscriptions.map(formatSubscriptionPlanLabel)).slice(0, MAX_APPSTOREPRICE_TOOLTIP_PLANS);
    const selectedPlanName = formatSubscriptionPlanLabel(subscription);
    const selectedRows = buildMergedAppStorePricePlanRows(comparableSubscriptions, selectedPlanName);
    const planAlternativesByRegion = buildAppStorePricePlanAlternativesByRegion(
      comparableSubscriptions,
      rates,
      selectedRows.map((row) => row.region.toUpperCase())
    );
    const periodSuffix = formatDurationSuffix(subscription.duration);
    const prices = selectedRows.map((row) => {
      const countryCode = row.region.toUpperCase();
      const currency = row.currency.toUpperCase();
      const currencyRate = rates.rates[currency];
      if (!Number.isFinite(row.price) || typeof currencyRate !== "number" || currencyRate <= 0) {
        return void 0;
      }
      const country = APPSTOREPRICE_COUNTRIES[countryCode] ?? {
        countryName: countryCode,
        flag: countryCodeToFlag(countryCode),
        locale: "en-US"
      };
      const nokAmount = row.price / currencyRate;
      const planAlternatives = planAlternativesByRegion.get(countryCode);
      return {
        region: countryCode,
        countryName: country.countryName,
        flag: country.flag,
        locale: country.locale,
        currency,
        price: row.price,
        formattedPrice: `${currency} ${formatNativeAmount(row.price)}${periodSuffix}`,
        nokAmount,
        formattedNok: `${formatApproximateCurrency(nokAmount, "NOK", "nb-NO")}${periodSuffix}`,
        productUrl: config.sourceUrl,
        sourceProvider: "appstoreprice",
        sourceName: APPSTOREPRICE_SOURCE_NAME,
        sourceDetail: "App Store",
        planName: selectedPlanName,
        ...planAlternatives !== void 0 && planAlternatives.length > 0 ? { planAlternatives } : {}
      };
    }).filter((price) => price !== void 0).sort((a, b) => a.nokAmount - b.nokAmount);
    if (prices.length === 0) {
      return void 0;
    }
    return {
      productId: config.productId,
      productName: config.productName,
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      ...ratesUpdatedAt !== void 0 ? { ratesUpdatedAt } : {},
      sourceProvider: "appstoreprice",
      sourceName: APPSTOREPRICE_SOURCE_NAME,
      sourceDetail: "App Store",
      planName: selectedPlanName,
      availablePlanNames,
      prices
    };
  }
  function buildAppStorePricePlanAlternativesByRegion(subscriptions, rates, countryCodes) {
    const alternativesByRegion = /* @__PURE__ */ new Map();
    for (const countryCode of uniquePlanNames(countryCodes)) {
      alternativesByRegion.set(countryCode, /* @__PURE__ */ new Map());
    }
    for (const subscription of subscriptions) {
      const planName = formatSubscriptionPlanLabel(subscription);
      for (const [countryCode, regionAlternatives] of alternativesByRegion) {
        const alternative = buildAppStorePricePlanAlternative(subscription, countryCode, rates);
        const existingAlternative = regionAlternatives.get(planName);
        if (existingAlternative !== void 0) {
          if (existingAlternative.nokAmount !== void 0 || alternative.nokAmount === void 0) {
            continue;
          }
        }
        regionAlternatives.set(planName, alternative);
      }
    }
    const result = /* @__PURE__ */ new Map();
    for (const [countryCode, alternatives] of alternativesByRegion) {
      result.set(
        countryCode,
        Array.from(alternatives.values()).sort(compareAppStorePricePlanAlternatives).slice(0, MAX_APPSTOREPRICE_TOOLTIP_PLANS).map(({ nokAmount: _nokAmount, ...alternative }) => alternative)
      );
    }
    return result;
  }
  function buildMergedAppStorePricePlanRows(subscriptions, selectedPlanName) {
    const rowsByCountry = /* @__PURE__ */ new Map();
    for (const subscription of subscriptions) {
      if (formatSubscriptionPlanLabel(subscription) !== selectedPlanName) {
        continue;
      }
      for (const row of subscription.prices) {
        const countryCode = row.region.toUpperCase();
        if (!rowsByCountry.has(countryCode)) {
          rowsByCountry.set(countryCode, row);
        }
      }
    }
    return Array.from(rowsByCountry.values());
  }
  function selectDefaultAppStorePriceSubscription(subscriptions, config) {
    const configuredSubscription = subscriptions.find((entry) => entry.subscriptionId === config.subscriptionId || entry.name === config.planName);
    if (configuredSubscription !== void 0 && isYearlyAppStorePriceSubscription(configuredSubscription)) {
      return configuredSubscription;
    }
    return subscriptions.find(isYearlyAppStorePriceSubscription) ?? configuredSubscription ?? subscriptions[0];
  }
  function filterAppStorePriceSubscriptions(subscriptions, config) {
    if (isYouTubeAppStorePriceConfig(config)) {
      return subscriptions.filter((subscription) => inferYouTubeAppStorePriceSubscriptionName(subscription) !== void 0);
    }
    return subscriptions;
  }
  function isYouTubeAppStorePriceConfig(config) {
    return config.productName.toLowerCase().includes("youtube") || /\/(?:544007664|1017492454)(?:[/?#]|$)/.test(config.sourceUrl);
  }
  function isYearlyAppStorePriceSubscription(subscription) {
    return subscription.prices.length > 0 && (subscription.duration === "annual" || subscription.duration === "yearly");
  }
  function hasPositiveAppStorePrice(subscription) {
    return subscription.prices.some((price) => price.price > 0);
  }
  function hasSupportedAppStorePriceDuration(subscription) {
    return subscription.duration === "monthly" || subscription.duration === "annual" || subscription.duration === "yearly" || subscription.duration === null && isLifetimeAppStorePriceSubscription(subscription);
  }
  function isLifetimeAppStorePriceSubscription(subscription) {
    const names = [
      subscription.name,
      ...Object.values(subscription.localizedNames ?? {})
    ];
    return names.some((name) => /\b(?:lifetime|life\s*time|forever|permanent|livstid)\b/i.test(name));
  }
  function compareAppStorePricePlanAlternatives(first, second) {
    if (first.nokAmount !== void 0 && second.nokAmount !== void 0) {
      return first.nokAmount - second.nokAmount;
    }
    if (first.nokAmount !== void 0) {
      return -1;
    }
    if (second.nokAmount !== void 0) {
      return 1;
    }
    return first.planName.localeCompare(second.planName, "nb");
  }
  function buildAppStorePricePlanAlternative(subscription, countryCode, rates) {
    const planName = formatSubscriptionPlanLabel(subscription);
    const periodSuffix = formatDurationSuffix(subscription.duration);
    const row = subscription.prices.find((price) => price.region.toUpperCase() === countryCode);
    if (row === void 0) {
      return {
        planName,
        unavailableReason: "Ikke funnet i denne regionen"
      };
    }
    const currency = row.currency.toUpperCase();
    const currencyRate = rates.rates[currency];
    if (!Number.isFinite(row.price) || typeof currencyRate !== "number" || currencyRate <= 0) {
      return {
        planName,
        unavailableReason: "Mangler valutakurs"
      };
    }
    const nokAmount = row.price / currencyRate;
    return {
      planName,
      formattedPrice: `${currency} ${formatNativeAmount(row.price)}${periodSuffix}`,
      formattedNok: `${formatApproximateCurrency(nokAmount, "NOK", "nb-NO")}${periodSuffix}`,
      nokAmount
    };
  }
  function uniquePlanNames(planNames) {
    const uniqueNames = [];
    const seen = /* @__PURE__ */ new Set();
    for (const planName of planNames) {
      const normalized = planName.trim();
      const key = normalized.toLowerCase();
      if (normalized.length === 0 || seen.has(key)) {
        continue;
      }
      seen.add(key);
      uniqueNames.push(normalized);
    }
    return uniqueNames;
  }
  async function resolveAppStorePriceConfig(url, jsonRequest) {
    const config = getAppStorePriceConfig(url);
    if (config !== void 0) {
      return config;
    }
    const candidate = getAppStorePriceDomainCandidate(url);
    if (candidate === void 0) {
      return void 0;
    }
    for (const searchTerm of candidate.searchTerms) {
      const searchResults = await searchAppleSoftware(searchTerm, jsonRequest);
      const match = findBestAppleSoftwareMatch(candidate.normalizedDomain, searchTerm, searchResults);
      if (match !== void 0) {
        return getAppleSearchAppStorePriceConfig(match);
      }
    }
    return void 0;
  }
  async function searchAppleSoftware(term, jsonRequest) {
    const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=software&country=us&limit=${APPLE_SEARCH_RESULT_LIMIT}`;
    const value = await jsonRequest(searchUrl);
    if (!isRecord$1(value) || !Array.isArray(value.results)) {
      return [];
    }
    return value.results.filter(isAppleSoftwareSearchResult);
  }
  function findBestAppleSoftwareMatch(inputDomain, searchTerm, results) {
    let bestMatch;
    let secondBestScore = 0;
    results.forEach((result, index) => {
      const score = scoreAppleSoftwareMatch(inputDomain, searchTerm, result, index);
      if (bestMatch === void 0 || score > bestMatch.score) {
        secondBestScore = bestMatch?.score ?? 0;
        bestMatch = { result, score };
        return;
      }
      if (score > secondBestScore) {
        secondBestScore = score;
      }
    });
    if (bestMatch === void 0 || bestMatch.score < APPLE_SEARCH_MATCH_THRESHOLD) {
      return void 0;
    }
    const isStrongDomainMatch = appStoreResultDomains(bestMatch.result).some((domain) => domainsMatch(inputDomain, domain));
    if (!isStrongDomainMatch && bestMatch.score - secondBestScore < 20) {
      return void 0;
    }
    return bestMatch.result;
  }
  function scoreAppleSoftwareMatch(inputDomain, searchTerm, result, resultIndex) {
    const domainBrand = normalizeSearchToken(inputDomain.split(".")[0] ?? inputDomain);
    const searchBrand = normalizeSearchToken(searchTerm);
    const appName = normalizeSearchToken(result.trackName);
    const developerName = normalizeSearchToken(`${result.artistName ?? ""} ${result.sellerName ?? ""}`);
    const bundleId = normalizeSearchToken(result.bundleId ?? "");
    const metadataDomains = appStoreResultDomains(result);
    let score = Math.max(0, 10 - resultIndex);
    if (metadataDomains.some((domain) => domainsMatch(inputDomain, domain))) {
      score += 70;
    }
    if (appName === domainBrand || appName === searchBrand) {
      score += 55;
      if (resultIndex === 0) {
        score += 10;
      }
    } else if (appName.includes(domainBrand) || appName.includes(searchBrand)) {
      score += 25;
    }
    if (developerName.includes(domainBrand) || developerName.includes(searchBrand)) {
      score += 15;
    }
    if (bundleId.includes(domainBrand) || bundleId.includes(searchBrand)) {
      score += 20;
    }
    return score;
  }
  function getAppleSearchAppStorePriceConfig(result) {
    const appStoreId = String(result.trackId);
    return getKnownAppStorePriceConfigForAppId(appStoreId) ?? {
      cacheKey: `apple-app-${appStoreId}`,
      productId: `appstoreprice:apple-app-${appStoreId}`,
      productName: result.trackName,
      sourceUrl: `https://appstoreprice.org/en/apps/${encodeURIComponent(appStoreId)}`
    };
  }
  function getAppStorePriceConfig(url) {
    try {
      const parsedUrl = new URL(url);
      const appStorePriceConfig = getConfigForAppStorePriceUrl(parsedUrl);
      if (appStorePriceConfig !== void 0) {
        return appStorePriceConfig;
      }
      const appleAppId = parseAppleAppId(parsedUrl);
      if (appleAppId !== void 0) {
        return getKnownAppStorePriceConfigForAppId(appleAppId) ?? getGenericAppStorePriceConfig(appleAppId, parsedUrl);
      }
      const knownDomainConfig = getKnownDomainAppStorePriceConfig(parsedUrl);
      if (knownDomainConfig !== void 0) {
        return knownDomainConfig;
      }
      if (isSoundCloudArtistPricingUrl(parsedUrl)) {
        return getKnownAppStorePriceConfigForAppId("336353151");
      }
    } catch {
      return void 0;
    }
    return void 0;
  }
  function getAppStorePriceDomainCandidate(url) {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
        return void 0;
      }
      const normalizedDomain = normalizeRegistrableDomain(parsedUrl.hostname);
      if (normalizedDomain === void 0 || APPSTOREPRICE_DOMAIN_RESOLVER_EXCLUDED_DOMAINS.has(normalizedDomain)) {
        return void 0;
      }
      if (!APPSTOREPRICE_ALWAYS_TRY_DOMAINS.has(normalizedDomain) && !isLikelySubscriptionUrl(parsedUrl)) {
        return void 0;
      }
      return {
        normalizedDomain,
        searchTerms: APPSTOREPRICE_DOMAIN_SEARCH_ALIASES[normalizedDomain] ?? [formatSearchTermFromDomain(normalizedDomain)]
      };
    } catch {
      return void 0;
    }
  }
  function isLikelySubscriptionUrl(url) {
    const path = `${url.pathname} ${url.search}`.toLowerCase();
    return /(?:premium|pricing|price|plans?|subscription|subscribe|checkout|upgrade|membership|pro|plus|artist|creator)/i.test(path);
  }
  function formatSearchTermFromDomain(domain) {
    return domain.split(".")[0]?.replace(/[-_]+/g, " ").trim() || domain;
  }
  function normalizeRegistrableDomain(hostname) {
    const labels = hostname.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
    while (labels.length > 2 && ["www", "m", "app", "checkout", "store", "account", "accounts", "billing"].includes(labels[0] ?? "")) {
      labels.shift();
    }
    if (labels.length < 2) {
      return void 0;
    }
    const lastTwo = labels.slice(-2).join(".");
    const lastThree = labels.slice(-3).join(".");
    const multiPartTlds = /* @__PURE__ */ new Set(["co.uk", "com.au", "com.br", "com.mx", "com.tr", "co.jp", "co.kr", "co.nz", "co.za", "com.sg"]);
    return multiPartTlds.has(lastTwo) && labels.length >= 3 ? lastThree : lastTwo;
  }
  function appStoreResultDomains(result) {
    return [result.sellerUrl, result.trackViewUrl].map((url) => {
      if (url === void 0) {
        return void 0;
      }
      try {
        return normalizeRegistrableDomain(new URL(url).hostname);
      } catch {
        return void 0;
      }
    }).filter((domain) => domain !== void 0);
  }
  function domainsMatch(inputDomain, resultDomain) {
    return inputDomain === resultDomain;
  }
  function normalizeSearchToken(value) {
    return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\b(?:app|apps|mobile|inc|llc|ltd|limited|pbc|opco|as|ab|gmbh|the)\b/g, " ").replace(/\s+/g, " ").trim();
  }
  function getConfigForAppStorePriceUrl(url) {
    const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    if (hostname !== "appstoreprice.org") {
      return void 0;
    }
    const appSlug = url.pathname.match(/\/apps\/([^/?#]+)/i)?.[1];
    if (appSlug === void 0 || appSlug.length === 0) {
      return void 0;
    }
    return getKnownAppStorePriceConfigForAppId(appSlug) ?? {
      cacheKey: appSlug,
      productId: `appstoreprice:${appSlug}`,
      productName: formatNameFromSlug(appSlug),
      sourceUrl: `https://appstoreprice.org/en/apps/${encodeURIComponent(appSlug)}`
    };
  }
  function getKnownDomainAppStorePriceConfig(url) {
    const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    if (hostname === "music.apple.com") {
      return getKnownAppStorePriceConfigForAppId("1108187390");
    }
    if (hostname === "music.youtube.com") {
      return getKnownAppStorePriceConfigForAppId("1017492454");
    }
    if (hostname === "spotify.com" || hostname.endsWith(".spotify.com")) {
      return getKnownAppStorePriceConfigForAppId("324684580");
    }
    if (hostname === "discord.com") {
      return getKnownAppStorePriceConfigForAppId("985746746");
    }
    if ((hostname === "firecore.com" || hostname.endsWith(".firecore.com")) && /^\/infuse(?:\/|$)/i.test(url.pathname)) {
      return getKnownAppStorePriceConfigForAppId("1136220934");
    }
    return void 0;
  }
  function getKnownAppStorePriceConfigForAppId(appId) {
    if (appId === "336353151") {
      return {
        cacheKey: "soundcloud-artist-pro-yearly",
        productId: "appstoreprice:soundcloud-artist-pro-yearly",
        productName: "SoundCloud Artist Pro",
        subscriptionId: "next_pro_yearly",
        planName: "Artist Pro Yearly",
        sourceUrl: APPSTOREPRICE_SOUND_CLOUD_URL
      };
    }
    if (appId === "324684580") {
      return {
        cacheKey: "spotify-premium-individual-monthly",
        productId: "appstoreprice:spotify-premium-individual-monthly",
        productName: "Spotify Premium",
        subscriptionId: "spotify_individual",
        planName: "Premium Individual",
        sourceUrl: APPSTOREPRICE_SPOTIFY_URL
      };
    }
    if (appId === "544007664") {
      return {
        cacheKey: "youtube-premium",
        productId: "appstoreprice:youtube-premium",
        productName: "YouTube Premium",
        sourceUrl: "https://appstoreprice.org/en/apps/544007664"
      };
    }
    if (appId === "1017492454") {
      return {
        cacheKey: "youtube-music",
        productId: "appstoreprice:youtube-music",
        productName: "YouTube Music",
        sourceUrl: "https://appstoreprice.org/en/apps/1017492454"
      };
    }
    if (appId === "1108187390") {
      return {
        cacheKey: "apple-music",
        productId: "appstoreprice:apple-music",
        productName: "Apple Music",
        sourceUrl: "https://appstoreprice.org/en/apps/applemusic"
      };
    }
    if (appId === "1477376905") {
      return {
        cacheKey: "github",
        productId: "appstoreprice:github",
        productName: "GitHub",
        sourceUrl: "https://appstoreprice.org/en/apps/1477376905"
      };
    }
    if (appId === "985746746") {
      return {
        cacheKey: "discord-nitro-monthly",
        productId: "appstoreprice:discord-nitro-monthly",
        productName: "Discord Nitro",
        subscriptionId: "premium_tier_2_monthly",
        planName: "Nitro Monthly",
        sourceUrl: "https://appstoreprice.org/en/apps/985746746"
      };
    }
    if (appId === "1136220934") {
      return {
        cacheKey: "infuse-pro-monthly",
        productId: "appstoreprice:infuse-pro-monthly",
        productName: "Infuse Pro",
        subscriptionId: "com.firecore.infuse.pro.30",
        planName: "Infuse Pro - Monthly",
        sourceUrl: "https://appstoreprice.org/en/apps/1136220934"
      };
    }
    return void 0;
  }
  function getGenericAppStorePriceConfig(appId, url) {
    return {
      cacheKey: `apple-app-${appId}`,
      productId: `appstoreprice:apple-app-${appId}`,
      productName: readAppNameFromAppleUrl(url) ?? "App Store-app",
      sourceUrl: `https://appstoreprice.org/en/apps/${encodeURIComponent(appId)}`
    };
  }
  function parseAppleAppId(url) {
    const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    if (hostname !== "apps.apple.com") {
      return void 0;
    }
    return url.pathname.match(/\/id(\d+)(?:[/?#]|$)/i)?.[1];
  }
  function readAppNameFromAppleUrl(url) {
    const parts = url.pathname.split("/").filter(Boolean);
    const appSegmentIndex = parts.findIndex((part) => part.toLowerCase() === "app");
    const slug = appSegmentIndex >= 0 ? parts[appSegmentIndex + 1] : void 0;
    return slug !== void 0 ? formatNameFromSlug(slug) : void 0;
  }
  function formatNameFromSlug(slug) {
    const cleaned = decodeURIComponent(slug).replace(/^id\d+$/i, "App Store-app").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
    if (cleaned.length === 0) {
      return "App Store-app";
    }
    return cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  function isSoundCloudArtistPricingUrl(url) {
    const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    if (hostname === "checkout.soundcloud.com") {
      return /^\/artist\/?$/i.test(url.pathname);
    }
    if (hostname !== "soundcloud.com") {
      return false;
    }
    return /(?:^|\/)(?:artist|artists|for-artists|pro|creator|creators|subscriptions|you\/subscriptions)(?:\/|$)/i.test(url.pathname);
  }
  function extractAppStorePriceSubscriptions(html) {
    const normalized = normalizeNextFlightHtml(html);
    let searchIndex = 0;
    while (searchIndex < normalized.length) {
      const markerIndex = normalized.indexOf('"subscriptions":[', searchIndex);
      if (markerIndex < 0) {
        return [];
      }
      const arrayStart = normalized.indexOf("[", markerIndex);
      if (arrayStart < 0) {
        return [];
      }
      const rawArray = readBalancedJsonArray(normalized, arrayStart);
      if (rawArray === void 0) {
        return [];
      }
      const parsed = parseJson(rawArray.replace(/"\$undefined"/g, "null"));
      if (Array.isArray(parsed)) {
        const subscriptions = parsed.filter(isAppStorePriceSubscription);
        if (subscriptions.length > 0) {
          return subscriptions;
        }
      }
      searchIndex = markerIndex + '"subscriptions":['.length;
    }
    return [];
  }
  function normalizeNextFlightHtml(html) {
    return html.replace(/\\"/g, '"').replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
  }
  function readBalancedJsonArray(value, startIndex) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = startIndex; index < value.length; index += 1) {
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
      if (inString) {
        continue;
      }
      if (character === "[") {
        depth += 1;
        continue;
      }
      if (character === "]") {
        depth -= 1;
        if (depth === 0) {
          return value.slice(startIndex, index + 1);
        }
      }
    }
    return void 0;
  }
  function isAppStorePriceSubscription(value) {
    return isRecord$1(value) && typeof value.subscriptionId === "string" && typeof value.name === "string" && (typeof value.duration === "string" || value.duration === null) && (value.localizedNames === void 0 || isStringRecord(value.localizedNames)) && Array.isArray(value.prices) && value.prices.every(isAppStorePriceSubscriptionPrice);
  }
  function isAppStorePriceSubscriptionPrice(value) {
    return isRecord$1(value) && typeof value.region === "string" && typeof value.regionName === "string" && typeof value.currency === "string" && typeof value.price === "number" && Number.isFinite(value.price);
  }
  function isAppleSoftwareSearchResult(value) {
    return isRecord$1(value) && typeof value.trackId === "number" && Number.isFinite(value.trackId) && typeof value.trackName === "string" && (value.artistName === void 0 || typeof value.artistName === "string") && (value.sellerName === void 0 || typeof value.sellerName === "string") && (value.bundleId === void 0 || typeof value.bundleId === "string") && (value.sellerUrl === void 0 || typeof value.sellerUrl === "string") && (value.trackViewUrl === void 0 || typeof value.trackViewUrl === "string");
  }
  function readNokBaseRates$1(value) {
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
  function formatDurationSuffix(duration) {
    if (duration === "annual" || duration === "yearly") return "/år";
    if (duration === "monthly") return "/mnd";
    return "";
  }
  function formatSubscriptionPlanLabel(subscription) {
    const name = formatAppStorePriceSubscriptionName(subscription);
    const durationLabel = formatDurationLabel(subscription.duration);
    if (durationLabel === void 0 || name.length === 0 || planNameAlreadyContainsDuration(name, subscription.duration)) {
      return name;
    }
    return `${name} (${durationLabel})`;
  }
  function formatAppStorePriceSubscriptionName(subscription) {
    return inferKnownAppStorePriceSubscriptionName(subscription) ?? pickPreferredAppStorePriceSubscriptionName(subscription) ?? subscription.name.trim();
  }
  function inferKnownAppStorePriceSubscriptionName(subscription) {
    const subscriptionId = subscription.subscriptionId.toUpperCase();
    const name = subscription.name.toLowerCase();
    if (!subscriptionId.includes("NF99") && !name.includes("netflix")) {
      return inferYouTubeAppStorePriceSubscriptionName(subscription);
    }
    if (subscriptionId.includes("_4001_") || /\bb[aá]sico\b/i.test(subscription.name)) {
      return "Netflix Basic";
    }
    if (subscriptionId.includes("_3088_") || /\b(?:standard|2s|2 screens?)\b/i.test(subscription.name)) {
      return "Netflix Standard";
    }
    if (subscriptionId.includes("_3108_") || /\b(?:premium|4s|4 screens?)\b/i.test(subscription.name)) {
      return "Netflix Premium";
    }
    if (subscriptionId === "ITUNES_INAPP_TIER8") {
      return "Netflix Standard";
    }
    return void 0;
  }
  function inferYouTubeAppStorePriceSubscriptionName(subscription) {
    const subscriptionId = subscription.subscriptionId.toLowerCase();
    const name = subscription.name.toLowerCase();
    if (!subscriptionId.includes("youtube") && !name.includes("youtube") && !name.includes("premium lite")) {
      return void 0;
    }
    if (name.includes("premium lite")) {
      return "YouTube Premium Lite";
    }
    if (name.includes("music") && name.includes("family")) {
      return "YouTube Music Family";
    }
    if (name.includes("music")) {
      return "YouTube Music";
    }
    if (name.includes("family")) {
      return "YouTube Premium Family";
    }
    if (name.includes("premium") || name.includes("red")) {
      return "YouTube Premium";
    }
    return void 0;
  }
  function pickPreferredAppStorePriceSubscriptionName(subscription) {
    const localizedNames = subscription.localizedNames ?? {};
    const preferredRegions = ["US", "GB", "CA", "AU", "IE", "NZ", "NO"];
    for (const region of preferredRegions) {
      const localizedName = localizedNames[region]?.trim();
      if (localizedName !== void 0 && localizedName.length > 0 && isLikelyEnglishPlanName(localizedName)) {
        return localizedName;
      }
    }
    const directName = subscription.name.trim();
    if (directName.length > 0 && isLikelyEnglishPlanName(directName)) {
      return directName;
    }
    return Object.values(localizedNames).map((name) => name.trim()).find((name) => name.length > 0 && isLikelyEnglishPlanName(name));
  }
  function isLikelyEnglishPlanName(planName) {
    if (!/^[\x20-\x7e]+$/.test(planName)) {
      return false;
    }
    return !/\b(?:basico|básico|pantalla|pantallas|transmision|transmisión|ilimitada|gerät|geräte|gleichzeitig|lebenslang)\b/i.test(planName);
  }
  function formatDurationLabel(duration) {
    if (duration === "annual" || duration === "yearly") return "1 år";
    if (duration === "monthly") return "1 mnd";
    return void 0;
  }
  function planNameAlreadyContainsDuration(planName, duration) {
    const normalized = planName.toLowerCase();
    if (duration === "annual" || duration === "yearly") {
      return /\b(?:annual|annually|year|yearly|år)\b/.test(normalized);
    }
    if (duration === "monthly") {
      return /\b(?:month|monthly|mnd|måned)\b/.test(normalized);
    }
    return false;
  }
  function formatCurrency(amount, currency, locale) {
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol"
      }).format(amount);
    } catch {
      return `${currency} ${formatFallbackAmount(amount)}`;
    }
  }
  function formatApproximateCurrency(amount, currency, locale) {
    return `~${formatCurrency(amount, currency, locale)}`;
  }
  function formatFallbackAmount(amount) {
    return new Intl.NumberFormat("nb-NO", {
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2
    }).format(amount);
  }
  function formatNativeAmount(amount) {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2
    }).format(amount);
  }
  function countryCodeToFlag(countryCode) {
    if (!/^[A-Z]{2}$/.test(countryCode)) {
      return "";
    }
    return [...countryCode].map((letter) => String.fromCodePoint(127462 + letter.charCodeAt(0) - 65)).join("");
  }
  async function defaultTextRequest(url) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "text/html,application/xhtml+xml"
        }
      });
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
  function isRecord$1(value) {
    return typeof value === "object" && value !== null;
  }
  function isStringRecord(value) {
    return isRecord$1(value) && Object.values(value).every((entry) => typeof entry === "string");
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
  const FLIGHT_STATIC_PRICE_SORT_AMOUNT = Number.MAX_SAFE_INTEGER;
  const FLIGHT_TOOLTIP_MAX_ROWS = 6;
  const FLIGHT_OFFER_CANDIDATE_LIMIT = 10;
  const TOOLTIP_MAX_LINES = 35;
  const TRAVELPAYOUTS_AIRPORTS_URL = "https://api.travelpayouts.com/data/en/airports.json";
  const EXCHANGE_RATES_URL = "https://open.er-api.com/v6/latest/NOK";
  const FINN_FLIGHT_API_FALLBACK_URL = "https://www.finn.no/travel-api/flight";
  const FINN_FLIGHT_POLL_ATTEMPTS = 7;
  const FINN_FLIGHT_REFRESH_POLL_ATTEMPTS = 2;
  const FINN_FLIGHT_POLL_INTERVAL_MS = 1100;
  const FLIGHT_PRICE_MATURATION_DELAYS_MS = [1e3, 2e3, 4e3, 8e3, 16e3, 16e3, 16e3];
  const PANFLIGHTS_AUTO_SEARCH_PARAM = "cbvAutoSearch";
  const MOMONDO_FLIGHT_DYNAMIC_POLL_ENDPOINT = "https://www.momondo.no/i/api/search/dynamic/flights/poll";
  const MOMONDO_FLIGHT_V2_POLL_ENDPOINT = "https://www.momondo.no/i/api/search/v2/flights/poll";
  const MOMONDO_FLIGHT_POLL_ATTEMPTS = 7;
  const MOMONDO_FLIGHT_POLL_INTERVAL_MS = 1100;
  const MOMONDO_FLIGHT_PAGE_SIZE = 50;
  const MOMONDO_DEFAULT_FLIGHT_SORT_MODE = "bestflight_a";
  const SKYSCANNER_FENRYR_BASE_URL = "https://www.skyscanner.net/g/fenryr/v1";
  const SKYSCANNER_WEB_UNIFIED_SEARCH_ENDPOINT = "https://www.skyscanner.no/g/radar/api/v2/web-unified-search/";
  const SKYSCANNER_CLIENT_VERSION = "7.194.1";
  const SKYSCANNER_CHANNEL_ID = "goandroid";
  const SKYSCANNER_WEB_CHANNEL_ID = "website";
  const SKYSCANNER_WEB_SEARCH_POLL_ATTEMPTS = 8;
  const SKYSCANNER_WEB_SEARCH_POLL_INTERVAL_MS = 1200;
  const SKYSCANNER_FLIGHT_OFFER_CACHE_TTL_MS = 5 * 60 * 1e3;
  const SKYSCANNER_EMPTY_FLIGHT_OFFER_CACHE_TTL_MS = 45 * 1e3;
  const SKYSCANNER_FLIGHT_PLACE_CACHE_TTL_MS = 24 * 60 * 60 * 1e3;
  const SKYSCANNER_EMPTY_FLIGHT_PLACE_CACHE_TTL_MS = 90 * 1e3;
  const SKYSCANNER_HTTP_HEADERS = {
    Accept: "application/json",
    "X-Skyscanner-Authenticated": "false",
    "X-Skyscanner-ChannelId": SKYSCANNER_CHANNEL_ID,
    "X-Skyscanner-Client": "skyscanner_android_app",
    "X-Skyscanner-Client-Network-Type": "WIFI",
    "X-Skyscanner-Client-Type": "net.skyscanner.android.main",
    "X-Skyscanner-Client-Version": SKYSCANNER_CLIENT_VERSION,
    "X-Skyscanner-Currency": "NOK",
    "X-Skyscanner-Device": "Android-phone",
    "X-Skyscanner-Device-Class": "phone",
    "X-Skyscanner-Device-Model": "Pixel 8",
    "X-Skyscanner-Device-OS-Type": "Android",
    "X-Skyscanner-Device-OS-Version": "15",
    "X-Skyscanner-Locale": "nb-NO",
    "X-Skyscanner-Market": "NO"
  };
  const SKYSCANNER_CALENDAR_HEADERS = {
    xSkyscannerChannelId: SKYSCANNER_CHANNEL_ID,
    xSkyscannerClient: "skyscanner_android_app",
    xSkyscannerClientType: "net.skyscanner.android.main",
    xSkyscannerClientVersion: SKYSCANNER_CLIENT_VERSION,
    xSkyscannerCurrency: "NOK",
    xSkyscannerDeviceClass: "phone",
    xSkyscannerDeviceModel: "Pixel 8",
    xSkyscannerDeviceOsType: "Android",
    xSkyscannerDeviceOsVersion: "15",
    xSkyscannerDeviceType: "DEVICE_TYPE_MOBILE",
    xSkyscannerEnableGeneralSearch: false,
    xSkyscannerLocale: "nb-NO",
    xSkyscannerMarket: "NO"
  };
  const SKYSCANNER_WEB_SEARCH_HEADERS = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Skyscanner-Ads-Sponsored-View-Type": "ADS_SPONSORED_VIEW_DAY_VIEW",
    "X-Skyscanner-ChannelId": SKYSCANNER_WEB_CHANNEL_ID,
    "X-Skyscanner-Consent-Adverts": "false",
    "X-Skyscanner-Currency": "NOK",
    "X-Skyscanner-Locale": "nb-NO",
    "X-Skyscanner-Market": "NO",
    "X-Skyscanner-Skip-Accommodation-Carhire": "true"
  };
  const TRIP_COM_BASE_URL = "https://us.trip.com";
  const TRIP_COM_LOW_PRICE_ENDPOINT = `${TRIP_COM_BASE_URL}/restapi/soa2/14427/GetLowPriceInCalender`;
  const TRIP_COM_FLIGHT_LIST_SEARCH_ENDPOINT = `${TRIP_COM_BASE_URL}/restapi/soa2/27015/FlightListSearchSSE`;
  const TRIP_COM_DEFAULT_CURRENCY = "USD";
  const TRIP_COM_FLIGHT_REQUEST_TIMEOUT_MS = 3e4;
  const TRIP_COM_COMMON_HEADERS = {
    Accept: "text/event-stream, application/json",
    "Content-Type": "application/json;charset=UTF-8"
  };
  const STATIC_FLIGHT_METROPOLITAN_AIRPORTS = {
    LON: ["LCY", "LGW", "LHR", "LTN", "STN", "SEN"],
    NYC: ["EWR", "JFK", "LGA"],
    OSA: ["ITM", "KIX", "UKB"],
    SEL: ["GMP", "ICN"],
    TYO: ["HND", "NRT"]
  };
  let flightAirportDataPromise;
  let nokBaseRatesPromise;
  const skyscannerFlightOfferCache = /* @__PURE__ */ new Map();
  const skyscannerFlightPlaceCache = /* @__PURE__ */ new Map();
  const PSN_GC_DEALS_GIFT_CARD_URL = "https://gcdeals.net/no/explore?sort=relevance&category%5B0%5D=1&type%5B0%5D=1";
  const PSN_GC_DEALS_GIFT_CARD_REGION_URLS = {
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
  const PSN_GG_DEALS_GIFT_CARD_URL = "https://gg.deals/gift-cards-group/playstation-network-card-nok-norway/";
  const PSN_GG_DEALS_GIFT_CARD_REGION_URLS = {
    AU: "https://gg.deals/gift-cards-group/playstation-network-card-aud-australia/",
    BR: "https://gg.deals/gift-cards-group/playstation-network-card-brl-brazil/",
    CA: "https://gg.deals/gift-cards-group/playstation-network-card-cad-canada/",
    CH: "https://gg.deals/gift-cards-group/playstation-network-card-chf-switzerland/",
    DE: "https://gg.deals/gift-cards-group/playstation-network-card-eur-germany/",
    DK: "https://gg.deals/gift-cards-group/playstation-network-card-dkk-denmark/",
    ES: "https://gg.deals/gift-cards-group/playstation-network-card-eur-spain/",
    FI: "https://gg.deals/gift-cards-group/playstation-network-card-eur-finland/",
    FR: "https://gg.deals/gift-cards-group/playstation-network-card-eur-france/",
    GB: "https://gg.deals/gift-cards-group/playstation-network-card-gbp-united-kingdom/",
    HK: "https://gg.deals/gift-cards-group/playstation-network-card-hkd-hong-kong/",
    IN: "https://gg.deals/gift-cards-group/playstation-network-card-inr-india/",
    IT: "https://gg.deals/gift-cards-group/playstation-network-card-eur-italy/",
    JP: "https://gg.deals/gift-cards-group/playstation-network-card-jpy-japan/",
    KR: "https://gg.deals/gift-cards-group/playstation-network-card-krw-korea/",
    MX: "https://gg.deals/gift-cards-group/playstation-network-card-mxn-mexico/",
    NO: "https://gg.deals/gift-cards-group/playstation-network-card-nok-norway/",
    NZ: "https://gg.deals/gift-cards-group/playstation-network-card-nzd-new-zealand/",
    PL: "https://gg.deals/gift-cards-group/playstation-network-card-pln-poland/",
    SE: "https://gg.deals/gift-cards-group/playstation-network-card-sek-sweden/",
    SG: "https://gg.deals/gift-cards-group/playstation-network-card-sgd-singapore/",
    US: "https://gg.deals/gift-cards-group/playstation-network-card-usd-united-states/",
    TR: "https://gg.deals/gift-cards-group/playstation-network-card-try-turkey/",
    UA: "https://gg.deals/gift-cards-group/playstation-network-card-uah-ukraine/",
    ZA: "https://gg.deals/gift-cards-group/playstation-network-card-zar-south-africa/"
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
    "enhver.no",
    "kassal.app"
  ]);
  function startContentScript() {
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
    installPanFlightsAutoSearch();
  }
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
        const flightMeta = extractFlightSearchMeta(currentUrl);
        const productMeta = flightMeta === void 0 ? extractProductPageMeta() : void 0;
        const metaKey = flightMeta !== void 0 ? [
          buildFlightSearchMetaKey(flightMeta),
          isSkyscannerFlightSearchPage(currentUrl) ? readCurrentSkyscannerVisiblePriceKey() : "",
          isPanFlightsSearchPage(currentUrl) ? readCurrentPanFlightsVisiblePriceKey(flightMeta) : "",
          isMomondoFlightSearchPage(currentUrl) ? readCurrentMomondoVisiblePriceKey() : ""
        ].join("|") : productMeta === void 0 ? "" : [productMeta.searchTerm, productMeta.price, productMeta.currency, productMeta.packageAmount, productMeta.packageUnit, productMeta.volumeMl, productMeta.alcoholPercent, productMeta.codes?.join(",")].join("|");
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
  function installPanFlightsAutoSearch() {
    const parsedUrl = parseUrl(window.location.href);
    if (parsedUrl === void 0 || !isPanFlightsSearchPage(parsedUrl) || parsedUrl.searchParams.get(PANFLIGHTS_AUTO_SEARCH_PARAM) !== "1" || parsedUrl.searchParams.get("v2") === null) {
      return;
    }
    let attempts = 0;
    let timerId;
    const tryStartSearch = () => {
      attempts += 1;
      const searchButton = document.querySelector("#dosearch");
      if (searchButton !== null && isVisibleElement(searchButton)) {
        removePanFlightsAutoSearchParam();
        searchButton.click();
        return true;
      }
      return attempts >= 80;
    };
    if (tryStartSearch()) return;
    timerId = window.setInterval(() => {
      if (tryStartSearch() && timerId !== void 0) {
        window.clearInterval(timerId);
      }
    }, 250);
  }
  function isPanFlightsSearchPage(parsedUrl) {
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    return (hostname === "panflights.no" || hostname === "panflights.com") && /(?:^|\/)(?:nb\/)?(?:roundtrip|oneway)\/?$/i.test(parsedUrl.pathname);
  }
  function removePanFlightsAutoSearchParam() {
    const parsedUrl = parseUrl(window.location.href);
    if (parsedUrl === void 0) return;
    parsedUrl.searchParams.delete(PANFLIGHTS_AUTO_SEARCH_PARAM);
    window.history.replaceState(window.history.state, "", parsedUrl.toString());
  }
  function isVisibleElement(element) {
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && element.getClientRects().length > 0;
  }
  function hasBlockedHostname(blockedHosts, hostname) {
    return [...blockedHosts].some((blockedHost) => hostname === blockedHost || hostname.endsWith(`.${blockedHost}`));
  }
  let renderGeneration = 0;
  async function renderCurrentContext() {
    const generation = ++renderGeneration;
    const [offers, priceMatches, regionPrices] = await Promise.all([
      getCurrentOffers().catch(() => []),
      getPriceMatchesForCurrentPage().catch(() => []),
      getRegionPricesForCurrentPage().catch(() => void 0)
    ]);
    if (generation !== renderGeneration) return;
    if (offers.length > 0 || priceMatches.length > 0 || (regionPrices?.prices.length ?? 0) > 0) {
      renderNoticeWithStoredState(offers, priceMatches, regionPrices);
      scheduleFlightPriceMatchMaturation(generation, offers, priceMatches, regionPrices);
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
    const flightOffers = await findFlightPriceMatchOffers();
    if (flightOffers.length > 0) return flightOffers;
    const productMeta = extractProductPageMeta();
    if (productMeta === void 0) return [];
    const message = {
      type: "get-price-match-for-product",
      ...productMeta
    };
    if (isUserscriptRuntime()) {
      return withGoogleShoppingOffer(await findPriceMatches(message, userscriptJsonRequest, userscriptTextRequest), productMeta.searchTerm);
    }
    const response = await sendRuntimeMessage(message);
    if (response !== void 0 && isPriceMatchForProductResponse(response) && response.ok) {
      return withGoogleShoppingOffer(response.offers ?? (response.offer !== void 0 ? [response.offer] : []), productMeta.searchTerm);
    }
    return [];
  }
  function withGoogleShoppingOffer(offers, searchTerm) {
    if (offers.length === 0) return offers;
    const hostname = parseUrl(window.location.href)?.hostname.replace(/^www\./, "").toLowerCase();
    if (hostname === void 0 || hostname === "google.com" || hostname.startsWith("google.") || hostname.endsWith(".google.com")) {
      return offers;
    }
    const params = new URLSearchParams({ udm: "28", q: searchTerm, hl: "no", gl: "no" });
    return [
      ...offers,
      {
        source: "googleshopping",
        sourceName: "Google",
        matchedExactProduct: true,
        details: `Søk: ${searchTerm}`,
        shopName: "Sammenlign selv",
        price: "?",
        amount: FLIGHT_STATIC_PRICE_SORT_AMOUNT,
        sortAmount: FLIGHT_STATIC_PRICE_SORT_AMOUNT,
        currency: "NOK",
        productName: searchTerm,
        productUrl: `https://www.google.com/search?${params.toString()}`
      }
    ];
  }
  async function findFlightPriceMatchOffers() {
    const session = await buildFlightPriceMatchSession();
    if (session === void 0) return [];
    const liveOffers = await runFlightLiveOfferFinders(session.liveOfferFinders);
    return mergeFlightPriceMatchOffers(session.staticOffers, liveOffers);
  }
  async function buildFlightPriceMatchSession() {
    const parsedUrl = parseUrl(window.location.href);
    if (parsedUrl === void 0) return void 0;
    const flightMeta = extractFlightSearchMeta(parsedUrl);
    if (flightMeta === void 0 || !isFlightSearchPassengerMatchSupported(flightMeta)) return void 0;
    const airportLookup = await buildFlightAirportLookup(flightMeta);
    const routeTitle = `${flightMeta.origin} → ${flightMeta.destination}`;
    const fullSearchDetails = [
      formatFlightDateRange(flightMeta),
      formatFlightPassengerText(flightMeta),
      ...formatFlightSearchFilterDetails(flightMeta),
      formatFlightAirportScopeText(flightMeta, airportLookup)
    ].join(", ");
    const cardSearchDetails = formatFlightCardSearchDetails(flightMeta);
    const staticOffers = [
      buildFlightPriceMatchOffer({
        source: "finnreise",
        sourceName: "FINN",
        productUrl: buildDefaultFinnFlightSearchUrl(flightMeta),
        routeTitle,
        cardSearchDetails,
        fullSearchDetails
      }),
      ...[],
      // Ren deeplink — vi henter aldri priser fra Google. tfs-parameteren bærer
      // kabin/voksne/maks stopp, så søket er ferdig utfylt når brukeren klikker.
      ...isGoogleFlightsSearchPage(parsedUrl) ? [] : [buildFlightPriceMatchOffer({
        source: "googleflights",
        sourceName: "Google",
        priceLabel: "?",
        productUrl: buildGoogleFlightsSearchUrl(flightMeta),
        routeTitle,
        cardSearchDetails,
        fullSearchDetails
      })]
    ];
    const liveOfferFinders = [
      { source: "finnreise", sourceName: "FINN", findOffer: (options) => findFinnFlightPriceMatchOffer(flightMeta, routeTitle, fullSearchDetails, airportLookup, options) },
      ...[],
      { source: "momondo", sourceName: "momondo", findOffer: () => findMomondoFlightPriceMatchOffer(flightMeta, routeTitle, fullSearchDetails, airportLookup) },
      { source: "skyscanner", sourceName: "Skyscanner", findOffer: () => findSkyscannerFlightPriceMatchOffer(flightMeta, routeTitle, fullSearchDetails, airportLookup) },
      ...[],
      ...[{ source: "tripcom", sourceName: "Trip", findOffer: () => findTripComFlightPriceMatchOffer(flightMeta, routeTitle, fullSearchDetails, airportLookup) }]
    ];
    return { staticOffers, liveOfferFinders };
  }
  async function runFlightLiveOfferFinders(finders, options) {
    return (await Promise.all(finders.map(({ sourceName, findOffer }) => safelyFindFlightPriceMatchOffer(sourceName, () => findOffer(options))))).filter((offer) => offer !== void 0);
  }
  function mergeFlightPriceMatchOffers(staticOffers, liveOffers) {
    if (liveOffers.length === 0) return staticOffers;
    const liveSources = new Set(liveOffers.map((offer) => offer.source));
    return [
      ...liveOffers,
      ...staticOffers.filter((offer) => !liveSources.has(offer.source))
    ].sort(comparePriceMatchesBySortAmount);
  }
  function scheduleFlightPriceMatchMaturation(generation, offers, priceMatches, regionPrices) {
    if (!priceMatches.some((offer) => offer.searchIncomplete === true)) return;
    void matureFlightPriceMatches(generation, offers, priceMatches, regionPrices).catch(() => void 0);
  }
  async function matureFlightPriceMatches(generation, offers, priceMatches, regionPrices) {
    let currentMatches = priceMatches;
    for (const delayMs of FLIGHT_PRICE_MATURATION_DELAYS_MS) {
      await sleep(delayMs);
      if (generation !== renderGeneration) return;
      const incompleteSources = new Set(
        currentMatches.filter((offer) => offer.searchIncomplete === true).map((offer) => offer.source)
      );
      if (incompleteSources.size === 0) return;
      const session = await buildFlightPriceMatchSession();
      if (session === void 0) return;
      const refreshedOffers = await runFlightLiveOfferFinders(
        session.liveOfferFinders.filter((finder) => incompleteSources.has(finder.source)),
        { refresh: true }
      );
      if (generation !== renderGeneration) return;
      if (refreshedOffers.length === 0) continue;
      const mergedRefreshedOffers = refreshedOffers.map((offer) => {
        if (offer.searchIncomplete !== true) return offer;
        const previous = currentMatches.find((match) => match.source === offer.source);
        return previous !== void 0 && (previous.sortAmount ?? previous.amount) < (offer.sortAmount ?? offer.amount) ? previous : offer;
      });
      const refreshedSources = new Set(mergedRefreshedOffers.map((offer) => offer.source));
      const nextMatches = [
        ...mergedRefreshedOffers,
        ...currentMatches.filter((offer) => !refreshedSources.has(offer.source))
      ].sort(comparePriceMatchesBySortAmount);
      const changed = JSON.stringify(nextMatches) !== JSON.stringify(currentMatches);
      currentMatches = nextMatches;
      if (changed) renderNoticeWithStoredState(offers, currentMatches, regionPrices);
    }
    if (generation !== renderGeneration) return;
    if (currentMatches.some((offer) => offer.searchIncomplete === true)) {
      currentMatches = currentMatches.map(({ searchIncomplete: _searchIncomplete, ...offer }) => offer);
      renderNoticeWithStoredState(offers, currentMatches, regionPrices);
    }
  }
  async function safelyFindFlightPriceMatchOffer(sourceName, findOffer) {
    try {
      return await findOffer();
    } catch (error) {
      console.warn(`[Cashback Norge] Kunne ikke hente flypris fra ${sourceName}.`, error);
      return void 0;
    }
  }
  function extractFlightSearchMeta(parsedUrl) {
    const meta = extractSasFlightSearchMeta(parsedUrl) ?? extractFinnFlightSearchMeta(parsedUrl) ?? extractPanFlightsFlightSearchMeta(parsedUrl) ?? extractMomondoFlightSearchMeta(parsedUrl) ?? extractSkyscannerFlightSearchMeta(parsedUrl) ?? extractTravellinkFlightSearchMeta(parsedUrl) ?? extractTripComFlightSearchMeta(parsedUrl) ?? extractGoogleFlightsSearchMeta(parsedUrl) ?? extractStoredFlightSearchMeta(parsedUrl) ?? extractVisibleFlightSearchMeta(parsedUrl);
    return meta !== void 0 ? withVisibleFlightSearchFilters(meta) : void 0;
  }
  function withVisibleFlightSearchFilters(meta) {
    const filters = readVisibleFlightSearchFilterState();
    return {
      ...meta,
      ...meta.maxStops === void 0 && filters.maxStops !== void 0 ? { maxStops: filters.maxStops } : {},
      ...meta.includeCabinBag === void 0 && filters.includeCabinBag === true ? { includeCabinBag: true } : {},
      ...meta.includeCheckedBag === void 0 && filters.includeCheckedBag === true ? { includeCheckedBag: true } : {}
    };
  }
  function readVisibleFlightSearchFilterState() {
    const state = {};
    const stopChoiceCounts = [];
    let hasUncappedStopChoice = false;
    const inputs = Array.from(document.querySelectorAll('input[type="checkbox"], input[type="radio"]')).slice(0, 500);
    for (const input of inputs) {
      const label = readFlightFilterInputLabel(input);
      if (label === void 0 || label.length === 0 || label.length > 60) continue;
      if (input.type === "radio") {
        if (!input.checked) continue;
        const maxStopsMatch = label.match(/^maks\.?\s*(\d)\s*stopp\b/i) ?? label.match(/^(?:max|opp?\s*til|up\s*to)\.?\s*(\d)\s*stops?\b/i);
        const maxStops = readNonNegativeIntegerValue(maxStopsMatch?.[1]);
        if (maxStops !== void 0) {
          state.maxStops = maxStops;
        } else if (/^(?:kun\s+)?direkte(?:fly)?$|^nonstop(?:\s+only)?$|^direct(?:\s+only)?$/i.test(label)) {
          state.maxStops = 0;
        }
        continue;
      }
      if (/h[åa]ndbagasje|kabinbagasje|cabin\s*bag|carry-?on/i.test(label) && !/ikke|uten|no\s/i.test(label)) {
        if (input.checked) state.includeCabinBag = true;
        continue;
      }
      if (/innsjekket|checked\s*bag/i.test(label) && !/ikke|uten|no\s/i.test(label)) {
        if (input.checked) state.includeCheckedBag = true;
        continue;
      }
      if (/^(?:kun\s+)?direkte$|^nonstop$/i.test(label)) {
        if (input.checked) stopChoiceCounts.push(0);
        continue;
      }
      const stopChoiceMatch = label.match(/^(\d)(\+)?\s*stopp?s?\b/i);
      if (stopChoiceMatch?.[1] !== void 0) {
        if (input.checked) {
          if (stopChoiceMatch[2] === "+") hasUncappedStopChoice = true;
          else stopChoiceCounts.push(Number.parseInt(stopChoiceMatch[1], 10));
        }
      }
    }
    if (state.maxStops === void 0 && !hasUncappedStopChoice && stopChoiceCounts.length > 0) {
      state.maxStops = Math.max(...stopChoiceCounts);
    }
    return state;
  }
  function readFlightFilterInputLabel(input) {
    const label = input.labels?.[0]?.innerText ?? input.getAttribute("aria-label") ?? input.closest("label")?.innerText;
    return label?.replace(/\s+/g, " ").trim();
  }
  function readFlightCabinClassValue(value) {
    if (typeof value !== "string") return void 0;
    const normalized = value.trim().toLowerCase().replace(/[^a-zæøå]/g, "");
    if (normalized.length === 0) return void 0;
    if (/^(?:economy|okonomi|økonomi|ekonomi)$/.test(normalized)) return "economy";
    if (normalized.includes("premium")) return "premium";
    if (normalized.includes("business")) return "business";
    if (/^first(?:class)?$|f[oø]rsteklasse/.test(normalized)) return "first";
    return void 0;
  }
  function extractSasFlightSearchMeta(parsedUrl) {
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    if (hostname !== "sas.no" || !/^\/book-new\/revenue\/flights\/?$/i.test(parsedUrl.pathname)) {
      return void 0;
    }
    const origin = readIataCodeParam(parsedUrl, "origin");
    const destination = readIataCodeParam(parsedUrl, "destination");
    const outboundDate = readIsoDateParam(parsedUrl, "outboundDate");
    const inboundDate = readIsoDateParam(parsedUrl, "inboundDate");
    if (origin === void 0 || destination === void 0 || outboundDate === void 0) {
      return void 0;
    }
    const adults = readNonNegativeIntegerParam(parsedUrl, "adults", 1);
    const youths = readNonNegativeIntegerParam(parsedUrl, "youths", 0);
    const children = readNonNegativeIntegerParam(parsedUrl, "children", 0);
    const infants = readNonNegativeIntegerParam(parsedUrl, "infants", 0);
    if (adults + youths + children + infants <= 0) return void 0;
    return {
      origin,
      destination,
      outboundDate,
      ...inboundDate !== void 0 ? { inboundDate } : {},
      adults,
      youths,
      children,
      infants
    };
  }
  function extractFinnFlightSearchMeta(parsedUrl) {
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    if (hostname !== "finn.no" || !/^\/reise\/flybilletter\/resultat\/?$/i.test(parsedUrl.pathname)) {
      return void 0;
    }
    const origin = readIataCodeFromValues([
      parsedUrl.searchParams.get("departureAirportLeg1"),
      parsedUrl.searchParams.get("requestedOrigin")
    ]);
    const destination = readIataCodeFromValues([
      parsedUrl.searchParams.get("arrivalAirportLeg1"),
      parsedUrl.searchParams.get("requestedDestination")
    ]);
    const outboundDate = readIsoDateFromValues([
      parsedUrl.searchParams.get("requestedDepartureDate"),
      parsedUrl.searchParams.get("departureDate")
    ]);
    const inboundDate = readIsoDateFromValues([
      parsedUrl.searchParams.get("requestedReturnDate"),
      parsedUrl.searchParams.get("returnDate")
    ]);
    if (origin === void 0 || destination === void 0 || outboundDate === void 0) return void 0;
    const cabinClass = readFlightCabinClassValue(parsedUrl.searchParams.get("cabinType"));
    return normalizeFlightSearchMeta({
      origin,
      destination,
      outboundDate,
      ...inboundDate !== void 0 ? { inboundDate } : {},
      adults: readPositiveIntegerValue(parsedUrl.searchParams.get("adults")) ?? 1,
      youths: 0,
      children: readNonNegativeIntegerValue(parsedUrl.searchParams.get("children")) ?? 0,
      infants: readNonNegativeIntegerValue(parsedUrl.searchParams.get("infants")) ?? 0,
      ...cabinClass !== void 0 ? { cabinClass } : {}
    });
  }
  function extractPanFlightsFlightSearchMeta(parsedUrl) {
    if (!isPanFlightsSearchPage(parsedUrl)) return void 0;
    const v2 = parsedUrl.searchParams.get("v2");
    if (v2 === null) return void 0;
    const parts = v2.split("_");
    const origin = readPanFlightsPlaceIataCode(parts[0]);
    const destination = readPanFlightsPlaceIataCode(parts[1]);
    const outboundDate = readCompactIsoDateValue(parts[2]);
    const inboundDate = readCompactIsoDateValue(parts[3]);
    if (origin === void 0 || destination === void 0 || outboundDate === void 0) return void 0;
    return normalizeFlightSearchMeta({
      origin,
      destination,
      outboundDate,
      ...inboundDate !== void 0 ? { inboundDate } : {},
      adults: readPositiveIntegerValue(parsedUrl.searchParams.get("adults")) ?? readPositiveIntegerValue(parsedUrl.searchParams.get("ad")) ?? 1,
      youths: 0,
      children: readNonNegativeIntegerValue(parsedUrl.searchParams.get("children")) ?? 0,
      infants: readNonNegativeIntegerValue(parsedUrl.searchParams.get("infants")) ?? 0
    });
  }
  function readPanFlightsPlaceIataCode(value) {
    const directCode = readIataCodeValue(value);
    if (directCode !== void 0) return directCode;
    if (value === void 0 || !/^\d{4}$/.test(value)) return void 0;
    const sid2CodesMatch = document.documentElement.innerHTML.match(
      new RegExp(`[,{]\\s*["']?${value}["']?\\s*:\\s*["']([A-Z]{3}(?:,[A-Z]{3})*)["']`)
    );
    return readIataCodeValue(sid2CodesMatch?.[1]?.split(",")[0]);
  }
  const MOMONDO_FLIGHT_SEARCH_PATH_PATTERN = /^\/flight-search\/[^/]+\/\d{4}-\d{2}-\d{2}(?:\/\d{4}-\d{2}-\d{2})?(?:\/(?:economy|premium|business|first))?\/?$/i;
  function extractMomondoFlightSearchMeta(parsedUrl) {
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    if (hostname !== "momondo.no" || !MOMONDO_FLIGHT_SEARCH_PATH_PATTERN.test(parsedUrl.pathname)) {
      return void 0;
    }
    const parts = parsedUrl.pathname.split("/").filter(Boolean);
    const routePart = parts[1];
    const routeParts = routePart?.split("-");
    const origin = readIataCodeValue(routeParts?.[0]);
    const destination = readIataCodeValue(routeParts?.[1]);
    const outboundDate = readIsoDateValue(parts[2]);
    const inboundDate = readIsoDateValue(parts[3]);
    const cabinClass = readFlightCabinClassValue(parts[parts.length - 1]);
    if (origin === void 0 || destination === void 0 || outboundDate === void 0) return void 0;
    return normalizeFlightSearchMeta({
      origin,
      destination,
      outboundDate,
      ...inboundDate !== void 0 ? { inboundDate } : {},
      adults: readPositiveIntegerValue(parsedUrl.searchParams.get("adults")) ?? 1,
      youths: 0,
      children: readNonNegativeIntegerValue(parsedUrl.searchParams.get("children")) ?? 0,
      infants: readNonNegativeIntegerValue(parsedUrl.searchParams.get("infants")) ?? 0,
      ...cabinClass !== void 0 ? { cabinClass } : {}
    });
  }
  function extractSkyscannerFlightSearchMeta(parsedUrl) {
    if (!isSkyscannerFlightSearchPage(parsedUrl)) return void 0;
    const parts = parsedUrl.pathname.split("/").filter(Boolean);
    const flightsIndex = parts.findIndex((part) => part.toLowerCase() === "flights");
    const origin = readIataCodeValue(parts[flightsIndex + 1]);
    const destination = readIataCodeValue(parts[flightsIndex + 2]);
    const outboundDate = readSkyscannerPathDate(parts[flightsIndex + 3]);
    const inboundDate = readSkyscannerPathDate(parts[flightsIndex + 4]);
    if (origin === void 0 || destination === void 0 || outboundDate === void 0) return void 0;
    const cabinClass = readFlightCabinClassValue(parsedUrl.searchParams.get("cabinclass"));
    const prefersDirect = parsedUrl.searchParams.get("preferdirects") === "true";
    return normalizeFlightSearchMeta({
      origin,
      destination,
      outboundDate,
      ...inboundDate !== void 0 ? { inboundDate } : {},
      adults: readPositiveIntegerValue(parsedUrl.searchParams.get("adults")) ?? readPositiveIntegerValue(parsedUrl.searchParams.get("adultsv2")) ?? 1,
      youths: 0,
      children: readNonNegativeIntegerValue(parsedUrl.searchParams.get("children")) ?? readNonNegativeIntegerValue(parsedUrl.searchParams.get("childrenv2")) ?? 0,
      infants: 0,
      ...cabinClass !== void 0 ? { cabinClass } : {},
      ...prefersDirect ? { maxStops: 0 } : {}
    });
  }
  function extractTravellinkFlightSearchMeta(parsedUrl) {
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    if (hostname !== "travellink.no" || !/^\/travel\/?$/i.test(parsedUrl.pathname)) {
      return void 0;
    }
    const params = readTravellinkHashParams(parsedUrl.hash);
    const origin = readIataCodeValue(params.get("from"));
    const destination = readIataCodeValue(params.get("to"));
    const outboundDate = readIsoDateValue(params.get("dep"));
    const inboundDate = readIsoDateValue(params.get("ret"));
    if (origin === void 0 || destination === void 0 || outboundDate === void 0) return void 0;
    return normalizeFlightSearchMeta({
      origin,
      destination,
      outboundDate,
      ...inboundDate !== void 0 ? { inboundDate } : {},
      adults: readPositiveIntegerValue(params.get("adults")) ?? readPositiveIntegerValue(params.get("numAdults")) ?? readPositiveIntegerValue(params.get("adt")) ?? 1,
      youths: 0,
      children: readNonNegativeIntegerValue(params.get("children")) ?? 0,
      infants: readNonNegativeIntegerValue(params.get("infants")) ?? 0
    });
  }
  function readTravellinkHashParams(hash) {
    const params = new URLSearchParams();
    const payload = hash.replace(/^#/, "").replace(/^results\/?/, "");
    for (const part of payload.split(";")) {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex <= 0) continue;
      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      if (key.length > 0) params.set(key, decodeURIComponent(value));
    }
    return params;
  }
  function extractTripComFlightSearchMeta(parsedUrl) {
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    if (!hostname.endsWith("trip.com") || !/^\/flights\/showfarefirst\/?$/i.test(parsedUrl.pathname)) {
      return void 0;
    }
    const origin = readIataCodeParam(parsedUrl, "dcity");
    const destination = readIataCodeParam(parsedUrl, "acity");
    const outboundDate = readIsoDateParam(parsedUrl, "ddate");
    const inboundDate = /^rt$/i.test(parsedUrl.searchParams.get("triptype") ?? "") ? readIsoDateParam(parsedUrl, "rdate") : void 0;
    if (origin === void 0 || destination === void 0 || outboundDate === void 0) return void 0;
    const cabinClass = readTripComCabinClassParam(parsedUrl.searchParams.get("class"));
    const nonstopOnly = /^on$/i.test(parsedUrl.searchParams.get("nonstoponly") ?? "");
    return normalizeFlightSearchMeta({
      origin,
      destination,
      outboundDate,
      ...inboundDate !== void 0 ? { inboundDate } : {},
      adults: readPositiveIntegerValue(parsedUrl.searchParams.get("quantity")) ?? 1,
      youths: 0,
      children: 0,
      infants: 0,
      ...cabinClass !== void 0 ? { cabinClass } : {},
      ...nonstopOnly ? { maxStops: 0 } : {}
    });
  }
  function readTripComCabinClassParam(value) {
    switch (value?.trim().toLowerCase()) {
      case "y":
        return "economy";
      case "s":
        return "premium";
      case "c":
        return "business";
      case "f":
        return "first";
      default:
        return readFlightCabinClassValue(value);
    }
  }
  function isSkyscannerFlightSearchPage(parsedUrl) {
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    return (hostname === "skyscanner.no" || hostname === "skyscanner.net") && /^\/transport\/flights\/[a-z]{3}\/[a-z]{3}\/\d{6}(?:\/\d{6})?\/?$/i.test(parsedUrl.pathname);
  }
  function readSkyscannerPathDate(value) {
    if (value === void 0 || !/^\d{6}$/.test(value)) return void 0;
    const year = Number.parseInt(value.slice(0, 2), 10);
    const fullYear = year < 70 ? 2e3 + year : 1900 + year;
    return readIsoDateValue(`${fullYear}-${value.slice(2, 4)}-${value.slice(4, 6)}`);
  }
  function extractStoredFlightSearchMeta(parsedUrl) {
    if (!isOpaqueFlightSearchPage(parsedUrl)) return void 0;
    for (const storage of [window.sessionStorage, window.localStorage]) {
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (key === null) continue;
        const value = storage.getItem(key);
        const meta = extractFlightSearchMetaFromUnknown(value);
        if (meta !== void 0) return meta;
      }
    }
    return void 0;
  }
  function extractFlightSearchMetaFromUnknown(value, depth = 0) {
    if (depth > 5) return void 0;
    if (typeof value === "string") {
      const parsedJson = parseJsonValue(value);
      if (parsedJson !== void 0) {
        const jsonMeta = extractFlightSearchMetaFromUnknown(parsedJson, depth + 1);
        if (jsonMeta !== void 0) return jsonMeta;
      }
      if (value.includes("=")) {
        const params = new URLSearchParams(value.startsWith("?") ? value.slice(1) : value);
        const paramsMeta = readFlightSearchMetaFromParams(params);
        if (paramsMeta !== void 0) return paramsMeta;
      }
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const meta = extractFlightSearchMetaFromUnknown(item, depth + 1);
        if (meta !== void 0) return meta;
      }
      return void 0;
    }
    if (!isRecord(value)) return void 0;
    const recordMeta = readFlightSearchMetaFromRecord(value);
    if (recordMeta !== void 0) return recordMeta;
    for (const item of Object.values(value)) {
      const meta = extractFlightSearchMetaFromUnknown(item, depth + 1);
      if (meta !== void 0) return meta;
    }
    return void 0;
  }
  function readFlightSearchMetaFromParams(params) {
    const origin = readIataCodeFromValues([
      params.get("origin"),
      params.get("from"),
      params.get("originAirport"),
      params.get("departureAirport")
    ]);
    const destination = readIataCodeFromValues([
      params.get("destination"),
      params.get("to"),
      params.get("destinationAirport"),
      params.get("arrivalAirport")
    ]);
    const outboundDate = readIsoDateFromValues([
      params.get("outboundDate"),
      params.get("departureDate"),
      params.get("fromDate")
    ]);
    const inboundDate = readIsoDateFromValues([
      params.get("inboundDate"),
      params.get("returnDate"),
      params.get("toDate")
    ]);
    if (origin === void 0 || destination === void 0 || outboundDate === void 0) return void 0;
    return normalizeFlightSearchMeta({
      origin,
      destination,
      outboundDate,
      ...inboundDate !== void 0 ? { inboundDate } : {},
      adults: readPositiveIntegerValue(params.get("adults")) ?? 1,
      youths: 0,
      children: readNonNegativeIntegerValue(params.get("children")) ?? 0,
      infants: readNonNegativeIntegerValue(params.get("infants")) ?? 0
    });
  }
  function readFlightSearchMetaFromRecord(record) {
    const origin = readIataCodeFromRecord(record, [
      "origin",
      "originCode",
      "originAirport",
      "originAirportCode",
      "from",
      "fromAirport",
      "fromAirportCode",
      "departureAirport",
      "departureAirportCode",
      "departureStation",
      "departureStationCode"
    ]);
    const destination = readIataCodeFromRecord(record, [
      "destination",
      "destinationCode",
      "destinationAirport",
      "destinationAirportCode",
      "to",
      "toAirport",
      "toAirportCode",
      "arrivalAirport",
      "arrivalAirportCode",
      "arrivalStation",
      "arrivalStationCode"
    ]);
    const outboundDate = readIsoDateFromRecord(record, [
      "outboundDate",
      "departureDate",
      "departureDateTime",
      "dateDeparture",
      "fromDate"
    ]);
    const inboundDate = readIsoDateFromRecord(record, [
      "inboundDate",
      "returnDate",
      "returnDateTime",
      "dateReturn",
      "toDate"
    ]);
    if (origin === void 0 || destination === void 0 || outboundDate === void 0) return void 0;
    return normalizeFlightSearchMeta({
      origin,
      destination,
      outboundDate,
      ...inboundDate !== void 0 ? { inboundDate } : {},
      adults: readPositiveIntegerFromRecord(record, ["adults", "adultCount", "numberOfAdults", "adt"]) ?? 1,
      youths: 0,
      children: readNonNegativeIntegerFromRecord(record, ["children", "childCount", "numberOfChildren", "chd"]) ?? 0,
      infants: readNonNegativeIntegerFromRecord(record, ["infants", "infantCount", "numberOfInfants", "inf"]) ?? 0
    });
  }
  function extractVisibleFlightSearchMeta(parsedUrl) {
    if (!isOpaqueFlightSearchPage(parsedUrl)) return void 0;
    const haystack = collectVisibleFlightSearchText();
    const iataCodes = [...new Set(haystack.match(/\b[A-Z]{3}\b/g) ?? [])].filter((code) => !["URL", "HTML", "CSS", "API", "FAQ"].includes(code));
    const dates = [
      ...collectIsoDates(haystack),
      ...collectLocalizedFlightDates(haystack)
    ];
    const origin = iataCodes[0];
    const destination = iataCodes[1];
    const outboundDate = dates[0];
    if (origin === void 0 || destination === void 0 || outboundDate === void 0) return void 0;
    return normalizeFlightSearchMeta({
      origin,
      destination,
      outboundDate,
      ...dates[1] !== void 0 ? { inboundDate: dates[1] } : {},
      adults: readVisibleAdultCount(haystack) ?? 1,
      youths: 0,
      children: 0,
      infants: 0
    });
  }
  function collectVisibleFlightSearchText() {
    const parts = [document.body?.innerText ?? ""];
    for (const element of Array.from(document.querySelectorAll("input, [aria-label], [data-testid], [data-test-id]")).slice(0, 200)) {
      if (element instanceof HTMLInputElement && element.value.trim().length > 0) {
        parts.push(element.value);
      }
      for (const attribute of ["aria-label", "data-testid", "data-test-id"]) {
        const value = element.getAttribute(attribute);
        if (value !== null) parts.push(value);
      }
    }
    return parts.join("\n");
  }
  function collectIsoDates(value) {
    return [...new Set(value.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? [])].filter((date) => readIsoDateValue(date) !== void 0);
  }
  function collectLocalizedFlightDates(value) {
    const months = {
      jan: "01",
      januar: "01",
      feb: "02",
      februar: "02",
      mar: "03",
      mars: "03",
      apr: "04",
      april: "04",
      mai: "05",
      may: "05",
      jun: "06",
      juni: "06",
      june: "06",
      jul: "07",
      juli: "07",
      july: "07",
      aug: "08",
      august: "08",
      sep: "09",
      sept: "09",
      september: "09",
      okt: "10",
      oct: "10",
      oktober: "10",
      october: "10",
      nov: "11",
      november: "11",
      des: "12",
      dec: "12",
      desember: "12",
      december: "12"
    };
    const dates = [];
    const rangeMatcher = /\b(\d{1,2})\.?\s*[-–]\s*(?:[a-z]{2,4}\.?\s*)?(\d{1,2})\.?\s*(jan(?:uar)?|feb(?:ruar)?|mar(?:s)?|apr(?:il)?|mai|may|jun(?:i|e)?|jul(?:i|y)?|aug(?:ust)?|sep(?:t|tember)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|des(?:ember)?|dec(?:ember)?)\.?\s*(20\d{2})?\b/gi;
    for (const match of value.matchAll(rangeMatcher)) {
      const startDay = match[1]?.padStart(2, "0");
      const endDay = match[2]?.padStart(2, "0");
      const month = months[match[3]?.toLowerCase() ?? ""];
      const year = match[4] ?? inferFlightSearchYear(month, startDay);
      for (const day of [startDay, endDay]) {
        if (day === void 0 || month === void 0 || year === void 0) continue;
        const date = readIsoDateValue(`${year}-${month}-${day}`);
        if (date !== void 0 && !dates.includes(date)) dates.push(date);
      }
    }
    const matcher = /\b(\d{1,2})\.?\s*(jan(?:uar)?|feb(?:ruar)?|mar(?:s)?|apr(?:il)?|mai|may|jun(?:i|e)?|jul(?:i|y)?|aug(?:ust)?|sep(?:t|tember)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|des(?:ember)?|dec(?:ember)?)\.?\s*(20\d{2})?\b/gi;
    for (const match of value.matchAll(matcher)) {
      const day = match[1]?.padStart(2, "0");
      const month = months[match[2]?.toLowerCase() ?? ""];
      const year = match[3] ?? inferFlightSearchYear(month, day);
      if (day === void 0 || month === void 0 || year === void 0) continue;
      const date = readIsoDateValue(`${year}-${month}-${day}`);
      if (date !== void 0 && !dates.includes(date)) dates.push(date);
    }
    return dates;
  }
  function inferFlightSearchYear(month, day) {
    if (month === void 0 || day === void 0) return void 0;
    const now = /* @__PURE__ */ new Date();
    const currentYear = now.getFullYear();
    const candidate = `${currentYear}-${month}-${day}`;
    const candidateDate = /* @__PURE__ */ new Date(`${candidate}T23:59:59Z`);
    return candidateDate.getTime() >= Date.now() ? String(currentYear) : String(currentYear + 1);
  }
  function readVisibleAdultCount(value) {
    const match = value.match(/\b(\d+)\s*(?:voksen|voksne|adult|adults)\b/i);
    return readPositiveIntegerValue(match?.[1]);
  }
  function normalizeFlightSearchMeta(meta) {
    const origin = readIataCodeValue(meta.origin);
    const destination = readIataCodeValue(meta.destination);
    const outboundDate = readIsoDateValue(meta.outboundDate);
    const inboundDate = meta.inboundDate !== void 0 ? readIsoDateValue(meta.inboundDate) : void 0;
    if (origin === void 0 || destination === void 0 || outboundDate === void 0 || origin === destination) {
      return void 0;
    }
    const normalizedMeta = {
      origin,
      destination,
      outboundDate,
      ...inboundDate !== void 0 ? { inboundDate } : {},
      adults: Math.max(1, Math.trunc(meta.adults)),
      youths: Math.max(0, Math.trunc(meta.youths)),
      children: Math.max(0, Math.trunc(meta.children)),
      infants: Math.max(0, Math.trunc(meta.infants)),
      ...meta.cabinClass !== void 0 ? { cabinClass: meta.cabinClass } : {},
      ...meta.maxStops !== void 0 ? { maxStops: Math.max(0, Math.min(3, Math.trunc(meta.maxStops))) } : {},
      ...meta.includeCabinBag === true ? { includeCabinBag: true } : {},
      ...meta.includeCheckedBag === true ? { includeCheckedBag: true } : {}
    };
    return isFlightSearchPassengerMatchSupported(normalizedMeta) ? normalizedMeta : void 0;
  }
  function isOpaqueFlightSearchPage(parsedUrl) {
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    return hostname === "shop.lufthansa.com" && /^\/booking\/availability\/\d+\/?$/i.test(parsedUrl.pathname) || hostname === "booking.norwegian.com" && /^\/booking\/flight\/\d+\/?$/i.test(parsedUrl.pathname) || // Byvalg i Google Flights gir tfs uten IATA-koder — synlig tekst tar over.
    isGoogleFlightsSearchPage(parsedUrl);
  }
  function isFlightSearchPassengerMatchSupported(flightMeta) {
    return flightMeta.adults > 0 && flightMeta.youths === 0 && flightMeta.children === 0 && flightMeta.infants === 0;
  }
  async function buildFlightAirportLookup(flightMeta) {
    const lookup = /* @__PURE__ */ new Map();
    const requestedCodes = uniqueStrings([flightMeta.origin, flightMeta.destination].map((code) => code.toUpperCase()));
    for (const requestedCode of requestedCodes) {
      const airports = STATIC_FLIGHT_METROPOLITAN_AIRPORTS[requestedCode];
      if (airports !== void 0) lookup.set(requestedCode, airports);
    }
    const airportData = await fetchFlightAirportData();
    if (airportData === void 0) return lookup;
    const flightableAirports = airportData.filter((airport) => airport.iataType === "airport" && airport.flightable);
    for (const requestedCode of requestedCodes) {
      const hasExactAirport = flightableAirports.some((airport) => airport.code === requestedCode);
      if (hasExactAirport) continue;
      const cityAirports = uniqueStrings(
        flightableAirports.filter((airport) => airport.cityCode === requestedCode).map((airport) => airport.code)
      );
      if (cityAirports.length > 0) lookup.set(requestedCode, cityAirports);
    }
    return lookup;
  }
  async function fetchFlightAirportData() {
    if (flightAirportDataPromise === void 0) {
      flightAirportDataPromise = userscriptJsonRequest(TRAVELPAYOUTS_AIRPORTS_URL, {
        headers: { Accept: "application/json" },
        credentials: "omit",
        timeoutMs: 4e3
      }).then(readFlightAirportData, () => void 0);
    }
    return flightAirportDataPromise;
  }
  function readFlightAirportData(value) {
    if (!Array.isArray(value)) return void 0;
    const airports = [];
    for (const item of value) {
      if (!isRecord(item)) continue;
      const code = readIataCodeValue(item.code);
      const cityCode = readIataCodeValue(item.city_code);
      const iataType = readStringValue(item.iata_type);
      if (code === void 0 || cityCode === void 0 || iataType === void 0) continue;
      airports.push({
        code,
        cityCode,
        iataType,
        flightable: item.flightable === true
      });
    }
    return airports.length > 0 ? airports : void 0;
  }
  function hasMetropolitanFlightSearchCode(flightMeta, airportLookup) {
    return airportLookup.has(flightMeta.origin) || airportLookup.has(flightMeta.destination);
  }
  function formatFlightAirportScopeText(flightMeta, airportLookup) {
    return hasMetropolitanFlightSearchCode(flightMeta, airportLookup) ? "samme byområde/flyplasser" : "samme flyplasser";
  }
  function formatFlightPriceMatchAirportScopeText(priceMatch) {
    return priceMatch.details?.includes("samme byområde/flyplasser") === true ? "samme byområde/flyplasser" : "samme flyplasser";
  }
  function collectEquivalentFlightAirportCodes(code, airportLookup) {
    const normalizedCode = code.toUpperCase();
    return /* @__PURE__ */ new Set([normalizedCode, ...airportLookup.get(normalizedCode) ?? []]);
  }
  function listFlightRequestAirportCodes(code, airportLookup) {
    const normalizedCode = code.toUpperCase();
    return airportLookup.get(normalizedCode) ?? [normalizedCode];
  }
  function buildFlightPriceMatchOffer(input) {
    return {
      source: input.source,
      sourceName: input.sourceName,
      details: input.fullSearchDetails,
      matchedExactProduct: true,
      shopName: input.cardSearchDetails,
      price: input.priceLabel ?? "Sjekk pris",
      amount: FLIGHT_STATIC_PRICE_SORT_AMOUNT,
      sortAmount: FLIGHT_STATIC_PRICE_SORT_AMOUNT,
      currency: "NOK",
      productName: input.routeTitle,
      productUrl: input.productUrl
    };
  }
  async function findFinnFlightPriceMatchOffer(flightMeta, routeTitle, searchDetails, airportLookup, options) {
    const resultUrl = readCurrentFinnFlightSearchUrl(flightMeta) ?? buildDefaultFinnFlightSearchUrl(flightMeta);
    const searchData = await fetchFinnFlightSearchData(resultUrl);
    if (searchData === void 0) return void 0;
    const resultData = await pollFinnFlightResults(searchData, flightMeta, options?.refresh === true);
    if (resultData === void 0) return void 0;
    const candidates = extractFinnFlightOfferCandidates(resultData, searchData, flightMeta, airportLookup);
    const best = candidates[0];
    if (best === void 0) return void 0;
    const progress = readNumberValue(resultData.progress);
    return {
      source: "finnreise",
      sourceName: "FINN",
      details: searchDetails,
      matchedExactProduct: true,
      shopName: best.shopName,
      price: best.price,
      amount: best.amount,
      sortAmount: best.sortAmount ?? best.amount,
      currency: best.currency,
      productName: routeTitle,
      productUrl: searchData.resultUrl,
      offerUrl: best.productUrl,
      ...best.durationText !== void 0 ? { durationText: best.durationText } : {},
      ...progress !== void 0 && progress < 100 ? { searchIncomplete: true } : {},
      alternatives: candidates.map(({ productUrl: _productUrl, ...candidate }) => candidate)
    };
  }
  async function fetchFinnFlightSearchData(resultUrl) {
    const currentSearchData = readCurrentFinnFlightSearchData(resultUrl);
    if (currentSearchData !== void 0) return currentSearchData;
    const html = await userscriptTextRequest(resultUrl, {
      headers: { Accept: "text/html" },
      credentials: "omit"
    });
    if (html === void 0) return void 0;
    const nextData = parseFinnNextData(html);
    return buildFinnFlightSearchDataFromNextData(nextData, resultUrl);
  }
  function readCurrentFinnFlightSearchData(resultUrl) {
    const parsedResultUrl = parseUrl(resultUrl);
    const parsedCurrentUrl = parseUrl(window.location.href);
    if (parsedResultUrl === void 0 || parsedCurrentUrl === void 0 || parsedResultUrl.toString() !== parsedCurrentUrl.toString()) {
      return void 0;
    }
    const nextDataText = document.getElementById("__NEXT_DATA__")?.textContent;
    if (nextDataText === void 0 || nextDataText === null || nextDataText.trim().length === 0) return void 0;
    try {
      const parsed = JSON.parse(nextDataText);
      return buildFinnFlightSearchDataFromNextData(isRecord(parsed) ? parsed : void 0, resultUrl);
    } catch {
      return void 0;
    }
  }
  function buildFinnFlightSearchDataFromNextData(nextData, resultUrl) {
    const pageProps = isRecord(nextData?.props) && isRecord(nextData.props.pageProps) ? nextData.props.pageProps : void 0;
    const searchData = isRecord(pageProps?.searchData) ? pageProps.searchData : void 0;
    const config = isRecord(pageProps?.config) ? pageProps.config : void 0;
    if (searchData === void 0) return void 0;
    const searchId = readStringValue(searchData?.searchId);
    if (searchId === void 0) return void 0;
    const resultParams = buildFinnFlightResultParamsFromSearchData(searchData);
    const airportGroups = buildFinnFlightAirportGroupsFromSearchData(searchData);
    return {
      searchId,
      flightApiUrl: readStringValue(config?.flightApiUrl) ?? FINN_FLIGHT_API_FALLBACK_URL,
      resultUrl,
      ...resultParams !== void 0 ? { resultParams } : {},
      ...Object.keys(airportGroups).length > 0 ? { airportGroups } : {}
    };
  }
  function readCurrentFinnFlightSearchUrl(flightMeta) {
    const parsedUrl = parseUrl(window.location.href);
    if (parsedUrl === void 0) return void 0;
    const currentMeta = extractFinnFlightSearchMeta(parsedUrl);
    return currentMeta !== void 0 && isSameFlightSearchMeta(currentMeta, flightMeta) ? parsedUrl.toString() : void 0;
  }
  function buildFinnFlightResultParamsFromSearchData(searchData) {
    const params = new URLSearchParams();
    for (const key of ["departureAirportLeg1", "arrivalAirportLeg1", "departureAirportLeg2", "arrivalAirportLeg2"]) {
      const value = readStringValue(searchData[key]);
      if (value !== void 0 && value.length > 0) params.set(key, value);
    }
    return [...params].length > 0 ? params : void 0;
  }
  function buildFinnFlightAirportGroupsFromSearchData(searchData) {
    const groups = {};
    const origin = readIataCodeValue(searchData.origin);
    const destination = readIataCodeValue(searchData.destination);
    addFinnFlightAirportGroup(groups, origin, readStringValue(searchData.departureAirportLeg1));
    addFinnFlightAirportGroup(groups, destination, readStringValue(searchData.arrivalAirportLeg1));
    addFinnFlightAirportGroup(groups, destination, readStringValue(searchData.departureAirportLeg2));
    addFinnFlightAirportGroup(groups, origin, readStringValue(searchData.arrivalAirportLeg2));
    return groups;
  }
  function addFinnFlightAirportGroup(groups, code, value) {
    if (code === void 0 || value === void 0) return;
    const airports = uniqueStrings(value.split(",").map((part) => readIataCodeValue(part)).filter((airport) => airport !== void 0));
    if (airports.length > 0) groups[code] = airports;
  }
  function parseFinnNextData(html) {
    const match = html.match(/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (match?.[1] === void 0) return void 0;
    try {
      const parsed = JSON.parse(match[1]);
      return isRecord(parsed) ? parsed : void 0;
    } catch {
      return void 0;
    }
  }
  async function pollFinnFlightResults(searchData, flightMeta, quickRefresh = false) {
    let latestResult;
    let progress = 0;
    const maxAttempts = quickRefresh ? FINN_FLIGHT_REFRESH_POLL_ATTEMPTS : FINN_FLIGHT_POLL_ATTEMPTS;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (!quickRefresh || attempt > 0) await sleep(FINN_FLIGHT_POLL_INTERVAL_MS);
      const resultUrl = buildFinnFlightResultApiUrl(searchData, flightMeta, progress);
      const value = await userscriptJsonRequest(resultUrl, {
        headers: { Accept: "application/json" },
        credentials: "omit"
      });
      if (!isRecord(value) || !Array.isArray(value.trips)) continue;
      latestResult = value;
      progress = readNumberValue(value.progress) ?? progress;
      if (progress >= 100) break;
    }
    return latestResult;
  }
  function buildFinnFlightResultApiUrl(searchData, flightMeta, progress) {
    const params = searchData.resultParams !== void 0 ? new URLSearchParams(searchData.resultParams) : buildFinnFlightExactAirportParams(flightMeta);
    params.set("cacheBuster", String(Date.now()));
    params.set("progress", String(progress));
    return `${searchData.flightApiUrl.replace(/\/$/, "")}/result/${encodeURIComponent(searchData.searchId)}?${params.toString()}`;
  }
  function extractFinnFlightOfferCandidates(resultData, searchData, flightMeta, airportLookup) {
    const candidates = [];
    for (const trip of readRecordArray(resultData.trips)) {
      if (!isFinnFlightTripMatchingSearch(trip, flightMeta, searchData, airportLookup)) continue;
      const legs = readRecordArray(trip.legs);
      if (exceedsFlightMaxStops(flightMeta, legs.map(readFinnFlightLegStopCount))) continue;
      const tripSummary = formatFinnFlightTripSummary(trip);
      const durationText = formatFlightLegDurationsWithStopsText(
        legs.map((leg) => ({
          durationMinutes: readNumberValue(leg.duration),
          stopCount: readFinnFlightLegStopCount(leg)
        }))
      );
      const offer = readRecordArray(trip.offers)[0];
      if (offer === void 0) continue;
      if (!isFinnFlightOfferMatchingBaggage(offer, flightMeta)) continue;
      const amount = readNumberValue(offer.priceAmount);
      const shopName = readStringValue(offer.brand);
      const offerId = readStringValue(offer.offerId);
      if (amount === void 0 || shopName === void 0 || offerId === void 0) continue;
      const platform = [
        tripSummary,
        formatFinnFlightLuggageSummary(offer)
      ].filter((part) => part !== void 0 && part.length > 0).join(", ");
      candidates.push({
        shopName,
        price: formatNokFlightPrice(amount),
        amount,
        sortAmount: amount,
        currency: "NOK",
        productUrl: buildFinnFlightOfferUrl(searchData.searchId, offerId),
        ...durationText !== void 0 ? { durationText } : {},
        ...platform.length > 0 ? { platform } : {}
      });
    }
    return rankFinnFlightOfferCandidates(dedupeFinnFlightOfferCandidates(candidates)).slice(0, FLIGHT_OFFER_CANDIDATE_LIMIT);
  }
  function isFinnFlightOfferMatchingBaggage(offer, flightMeta) {
    if (flightMeta.includeCabinBag === true && readStringValue(offer.handLuggage) !== "included") return false;
    if (flightMeta.includeCheckedBag === true && readStringValue(offer.checkedLuggage) !== "included") return false;
    return true;
  }
  function dedupeFinnFlightOfferCandidates(candidates) {
    const seen = /* @__PURE__ */ new Set();
    const uniqueCandidates = [];
    for (const candidate of candidates) {
      const key = [
        candidate.shopName,
        candidate.amount,
        candidate.platform ?? ""
      ].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueCandidates.push(candidate);
    }
    return uniqueCandidates;
  }
  function rankFinnFlightOfferCandidates(candidates) {
    return candidates;
  }
  function isFinnFlightTripMatchingSearch(trip, flightMeta, searchData, airportLookup) {
    const legs = readRecordArray(trip.legs);
    const outboundLeg = legs[0];
    if (outboundLeg === void 0 || !isFinnFlightLegMatch(outboundLeg, flightMeta.origin, flightMeta.destination, searchData, airportLookup, flightMeta.outboundDate)) {
      return false;
    }
    if (flightMeta.inboundDate === void 0) return true;
    const inboundLeg = legs[1];
    return inboundLeg !== void 0 && isFinnFlightLegMatch(inboundLeg, flightMeta.destination, flightMeta.origin, searchData, airportLookup, flightMeta.inboundDate);
  }
  function isFinnFlightLegMatch(leg, origin, destination, searchData, airportLookup, date) {
    const legOrigin = readFinnFlightLegAirport(leg, "legOrigin", "origin");
    const legDestination = readFinnFlightLegAirport(leg, "legDestination", "destination");
    return legOrigin !== void 0 && legDestination !== void 0 && isFinnAirportMatchingSearch(legOrigin, origin, searchData, airportLookup) && isFinnAirportMatchingSearch(legDestination, destination, searchData, airportLookup) && readFinnFlightLegDate(leg) === date;
  }
  function isFinnAirportMatchingSearch(airport, requestedAirport, searchData, airportLookup) {
    if (airport === requestedAirport) return true;
    return collectFinnAllowedAirportCodes(searchData, requestedAirport, airportLookup).has(airport);
  }
  function collectFinnAllowedAirportCodes(searchData, requestedAirport, airportLookup) {
    const requestedAirports = collectEquivalentFlightAirportCodes(requestedAirport, airportLookup);
    for (const airport of searchData.airportGroups?.[requestedAirport] ?? []) {
      requestedAirports.add(airport);
    }
    const allowedAirports = new Set(requestedAirports);
    if (searchData.resultParams === void 0) return allowedAirports;
    for (const value of searchData.resultParams.values()) {
      const airports = value.split(",").map((part) => readIataCodeValue(part)).filter((airport) => airport !== void 0);
      if (airports.some((airport) => requestedAirports.has(airport))) {
        for (const airport of airports) allowedAirports.add(airport);
      }
    }
    return allowedAirports;
  }
  function readFinnFlightLegAirport(leg, legKey, segmentKey) {
    const legAirport = readStringValue(leg[legKey]);
    if (legAirport !== void 0) return legAirport.toUpperCase();
    const firstSegment = readRecordArray(leg.segments)[0];
    return readStringValue(firstSegment?.[segmentKey])?.toUpperCase();
  }
  function readFinnFlightLegDate(leg) {
    const legDepartureTime = readStringValue(leg.legDepartureTime);
    const firstSegment = readRecordArray(leg.segments)[0];
    const segmentDepartureTime = readStringValue(firstSegment?.departureTime);
    return (legDepartureTime ?? segmentDepartureTime)?.slice(0, 10);
  }
  function buildFinnFlightOfferUrl(searchId, offerId) {
    const params = new URLSearchParams({ searchId, offerId });
    return `https://www.finn.no/reise/flybilletter/ut/?${params.toString()}`;
  }
  function buildDefaultFinnFlightSearchUrl(flightMeta) {
    return buildFinnFlightSearchUrl(
      flightMeta,
      shouldUseFinnMetropolitanSearchForCurrentPage() ? "metropolitan" : "exact"
    );
  }
  function shouldUseFinnMetropolitanSearchForCurrentPage() {
    const parsedUrl = parseUrl(window.location.href);
    if (parsedUrl === void 0) return false;
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    return isPanFlightsSearchPage(parsedUrl) || isSkyscannerFlightSearchPage(parsedUrl) || isGoogleFlightsSearchPage(parsedUrl) || hostname === "momondo.no" || hostname === "travellink.no" || hostname.endsWith("trip.com");
  }
  function buildFinnFlightSearchUrl(flightMeta, scope = "exact") {
    const params = new URLSearchParams({
      adults: String(flightMeta.adults),
      // finn aksepterer economy|premium|business|first (verifisert mot søkeskjemaet).
      cabinType: flightMeta.cabinClass ?? "economy",
      requestedDepartureDate: flightMeta.outboundDate,
      requestedDestination: `${flightMeta.destination}.${scope === "metropolitan" ? "METROPOLITAN_AREA" : "AIRPORT"}`,
      requestedOrigin: `${flightMeta.origin}.${scope === "metropolitan" ? "METROPOLITAN_AREA" : "AIRPORT"}`,
      tripType: flightMeta.inboundDate !== void 0 ? "roundtrip" : "oneway"
    });
    if (scope === "exact") {
      const exactAirportParams = buildFinnFlightExactAirportParams(flightMeta);
      for (const [key, value] of exactAirportParams.entries()) {
        params.set(key, value);
      }
    }
    if (flightMeta.inboundDate !== void 0) {
      params.set("requestedReturnDate", flightMeta.inboundDate);
    }
    return `https://www.finn.no/reise/flybilletter/resultat/?${params.toString()}`;
  }
  function buildFinnFlightExactAirportParams(flightMeta) {
    const params = new URLSearchParams({
      departureAirportLeg1: flightMeta.origin,
      arrivalAirportLeg1: flightMeta.destination
    });
    if (flightMeta.inboundDate !== void 0) {
      params.set("departureAirportLeg2", flightMeta.destination);
      params.set("arrivalAirportLeg2", flightMeta.origin);
    }
    return params;
  }
  function extractCurrentPanFlightsPageOfferCandidates(flightMeta, resultUrl) {
    if (!isCurrentPanFlightsSearchPageForMeta(flightMeta)) return [];
    const packageElements = [
      ...document.querySelectorAll(".packagewrap")
    ].filter(isPanFlightsVisiblePackageElement);
    return packageElements.flatMap((element, sourceRank2) => {
      const offerElement = element.querySelector(".offer") ?? element;
      if (offerElement === null) return [];
      const amount = readPanFlightsVisibleOfferAmount(offerElement);
      if (amount === void 0) return [];
      const providerText = cleanPanFlightsVisibleText(
        offerElement.querySelector(".service, .provider, .providername")?.innerText
      );
      const linkElement = offerElement.querySelector(".exitbutton, a[href]");
      const productUrl = readPanFlightsVisibleOfferUrl(linkElement, resultUrl);
      const platform = formatPanFlightsVisibleTripSummary(element);
      return [{
        shopName: providerText ?? "PanFlights",
        price: formatNokFlightPrice(amount),
        amount,
        sortAmount: amount,
        currency: "NOK",
        productUrl,
        sourceRank: sourceRank2,
        sourceSortOrder: "quality",
        sourceVersion: 0,
        ...platform !== void 0 ? { platform } : {}
      }];
    });
  }
  function isPanFlightsVisiblePackageElement(element) {
    if (!element.isConnected) return false;
    if (element.closest("template, #package_templ, #offer_templ, #offerlink_templ, #domtemplates") !== null) return false;
    const text = cleanPanFlightsVisibleText(element.innerText);
    if (text === void 0) return false;
    if (readPanFlightsVisibleOfferAmount(element) === void 0) return false;
    return element.getClientRects().length > 0 || isVisibleElement(element);
  }
  function readPanFlightsVisibleOfferAmount(element) {
    const priceElementText = [
      ...element.querySelectorAll(".offer .price, .price")
    ].map((priceElement) => priceElement.innerText).find((text) => readNokAmountFromText(text) !== void 0);
    const priceElementAmount = readNokAmountFromText(priceElementText);
    if (priceElementAmount !== void 0) return priceElementAmount;
    return readNokAmountFromPriceLikeText(element.innerText);
  }
  function isCurrentPanFlightsSearchPageForMeta(flightMeta) {
    const parsedUrl = parseUrl(window.location.href);
    if (parsedUrl === void 0 || !isPanFlightsSearchPage(parsedUrl)) return false;
    const currentMeta = extractPanFlightsFlightSearchMeta(parsedUrl);
    return currentMeta !== void 0 && buildFlightSearchMetaKey(currentMeta) === buildFlightSearchMetaKey(flightMeta);
  }
  function readCurrentPanFlightsVisiblePriceKey(flightMeta) {
    return extractCurrentPanFlightsPageOfferCandidates(flightMeta, window.location.href).slice(0, 5).map((candidate) => `${Math.round(candidate.amount)}:${candidate.shopName}:${candidate.platform ?? ""}`).join(";");
  }
  function readPanFlightsVisibleOfferUrl(element, fallbackUrl) {
    if (element === null) return fallbackUrl;
    const href = element instanceof HTMLAnchorElement ? element.href : element.getAttribute("data-href") ?? element.getAttribute("href");
    return href === null ? fallbackUrl : parseUrlWithBase(href, fallbackUrl)?.toString() ?? fallbackUrl;
  }
  function formatPanFlightsVisibleTripSummary(packageElement) {
    const companies = uniqueStrings(
      [...packageElement.querySelectorAll(".flight .company")].map((element) => cleanPanFlightsVisibleText(element.innerText)).filter((value) => value !== void 0)
    );
    const durations = uniqueStrings(
      [...packageElement.querySelectorAll(".flight .duration")].map((element) => cleanPanFlightsVisibleText(element.innerText)).filter((value) => value !== void 0)
    );
    const parts = [
      companies.length > 0 ? companies.join("/") : void 0,
      durations.length > 0 ? durations.join(" / ") : void 0
    ].filter((part) => part !== void 0);
    return parts.length > 0 ? parts.join(", ") : "synlig treffliste";
  }
  function cleanPanFlightsVisibleText(value) {
    const cleaned = value?.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    return cleaned === void 0 || cleaned.length === 0 ? void 0 : cleaned;
  }
  function readNokAmountFromText(value) {
    const cleaned = cleanPanFlightsVisibleText(value);
    if (cleaned === void 0) return void 0;
    const match = cleaned.match(/\b(\d[\d\s.]*)\s*(?:kr|nok|,-)?\b/i);
    if (match === null || match[1] === void 0) return void 0;
    const amount = Number.parseInt(match[1].replace(/[^\d]/g, ""), 10);
    return Number.isFinite(amount) && amount > 0 ? amount : void 0;
  }
  function readNokAmountFromPriceLikeText(value) {
    const cleaned = cleanPanFlightsVisibleText(value);
    if (cleaned === void 0) return void 0;
    const match = cleaned.match(/\b(\d[\d\s.]*)\s*(?:kr|nok|,-)\b/i);
    if (match === null || match[1] === void 0) return void 0;
    const amount = Number.parseInt(match[1].replace(/[^\d]/g, ""), 10);
    return Number.isFinite(amount) && amount > 0 ? amount : void 0;
  }
  function formatPanFlightsEpochDate(epochSeconds) {
    if (epochSeconds === void 0) return void 0;
    const date = new Date(epochSeconds * 1e3);
    return Number.isNaN(date.getTime()) ? void 0 : date.toISOString().slice(0, 10);
  }
  function buildGoogleFlightsSearchUrl(flightMeta) {
    const params = new URLSearchParams({
      tfs: buildGoogleFlightsTfsParam(flightMeta),
      hl: "nb",
      curr: "NOK"
    });
    return `https://www.google.com/travel/flights?${params.toString()}`;
  }
  function buildGoogleFlightsTfsParam(flightMeta) {
    const bytes = [
      ...encodeProtoBytesField(3, encodeGoogleFlightsLeg(flightMeta.outboundDate, flightMeta.origin, flightMeta.destination, flightMeta.maxStops)),
      ...flightMeta.inboundDate !== void 0 ? encodeProtoBytesField(3, encodeGoogleFlightsLeg(flightMeta.inboundDate, flightMeta.destination, flightMeta.origin, flightMeta.maxStops)) : []
    ];
    for (let index = 0; index < flightMeta.adults; index++) {
      bytes.push(...encodeProtoVarintField(8, 1));
    }
    bytes.push(...encodeProtoVarintField(9, readGoogleFlightsSeatValue(flightMeta)));
    bytes.push(...encodeProtoVarintField(19, flightMeta.inboundDate !== void 0 ? 1 : 2));
    return encodeBase64Url(bytes);
  }
  function encodeGoogleFlightsLeg(date, origin, destination, maxStops) {
    return [
      ...encodeProtoStringField(2, date),
      ...maxStops !== void 0 ? encodeProtoVarintField(5, maxStops) : [],
      ...encodeProtoBytesField(13, encodeProtoStringField(2, origin.toUpperCase())),
      ...encodeProtoBytesField(14, encodeProtoStringField(2, destination.toUpperCase()))
    ];
  }
  function readGoogleFlightsSeatValue(flightMeta) {
    switch (flightMeta.cabinClass) {
      case "premium":
        return 2;
      case "business":
        return 3;
      case "first":
        return 4;
      default:
        return 1;
    }
  }
  function isGoogleFlightsSearchPage(parsedUrl) {
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    return (hostname === "google.com" || hostname.startsWith("google.") || hostname.endsWith(".google.com")) && /^\/travel\/flights/i.test(parsedUrl.pathname);
  }
  function extractGoogleFlightsSearchMeta(parsedUrl) {
    if (!isGoogleFlightsSearchPage(parsedUrl)) return void 0;
    const tfs = parsedUrl.searchParams.get("tfs");
    if (tfs === null || tfs.length === 0) return void 0;
    return decodeGoogleFlightsTfsParam(tfs);
  }
  function decodeGoogleFlightsTfsParam(tfs) {
    const bytes = decodeBase64Url(tfs);
    if (bytes === void 0) return void 0;
    const fields = readProtoFields(bytes);
    const legs = fields.filter((field) => field.fieldNumber === 3 && field.value instanceof Uint8Array).map((field) => {
      const legFields = readProtoFields(field.value);
      return {
        date: readIsoDateValue(readProtoStringField(legFields, 2)),
        maxStops: readProtoVarintField(legFields, 5),
        origin: readGoogleFlightsAirportCode(legFields, 13),
        destination: readGoogleFlightsAirportCode(legFields, 14)
      };
    });
    const outbound = legs[0];
    if (outbound?.date === void 0 || outbound.origin === void 0 || outbound.destination === void 0) {
      return void 0;
    }
    const passengerValues = fields.filter((field) => field.fieldNumber === 8 && typeof field.value === "number").map((field) => field.value);
    const adults = passengerValues.filter((value) => value === 1).length;
    const seat = readProtoVarintField(fields, 9);
    const cabinClass = seat === 2 ? "premium" : seat === 3 ? "business" : seat === 4 ? "first" : void 0;
    return normalizeFlightSearchMeta({
      origin: outbound.origin,
      destination: outbound.destination,
      outboundDate: outbound.date,
      ...legs[1]?.date !== void 0 ? { inboundDate: legs[1].date } : {},
      adults: Math.max(1, adults),
      youths: 0,
      // Ikke-voksne passasjerer støttes ikke i sammenligningen — la meta forkastes.
      children: passengerValues.some((value) => value !== 1) ? 1 : 0,
      infants: 0,
      ...cabinClass !== void 0 ? { cabinClass } : {},
      ...outbound.maxStops !== void 0 && outbound.maxStops > 0 ? { maxStops: outbound.maxStops } : {}
    });
  }
  function readGoogleFlightsAirportCode(fields, fieldNumber) {
    const message = fields.find((field) => field.fieldNumber === fieldNumber && field.value instanceof Uint8Array);
    if (message === void 0) return void 0;
    return readIataCodeValue(readProtoStringField(readProtoFields(message.value), 2));
  }
  function readProtoFields(bytes) {
    const fields = [];
    let offset = 0;
    const readVarint = () => {
      let result = 0;
      let shift = 0;
      while (offset < bytes.length && shift <= 49) {
        const byte = bytes[offset++] ?? 0;
        result += (byte & 127) * 2 ** shift;
        if ((byte & 128) === 0) return result;
        shift += 7;
      }
      return void 0;
    };
    while (offset < bytes.length) {
      const tag = readVarint();
      if (tag === void 0) break;
      const wireType = tag & 7;
      const fieldNumber = Math.floor(tag / 8);
      if (wireType === 0) {
        const value = readVarint();
        if (value === void 0) break;
        fields.push({ fieldNumber, value });
      } else if (wireType === 2) {
        const length = readVarint();
        if (length === void 0 || offset + length > bytes.length) break;
        fields.push({ fieldNumber, value: bytes.slice(offset, offset + length) });
        offset += length;
      } else if (wireType === 5) {
        offset += 4;
      } else if (wireType === 1) {
        offset += 8;
      } else {
        break;
      }
    }
    return fields;
  }
  function readProtoStringField(fields, fieldNumber) {
    const field = fields.find((candidate) => candidate.fieldNumber === fieldNumber && candidate.value instanceof Uint8Array);
    if (field === void 0) return void 0;
    try {
      return new TextDecoder().decode(field.value);
    } catch {
      return void 0;
    }
  }
  function readProtoVarintField(fields, fieldNumber) {
    const field = fields.find((candidate) => candidate.fieldNumber === fieldNumber && typeof candidate.value === "number");
    return field !== void 0 ? field.value : void 0;
  }
  function encodeProtoVarint(value) {
    const bytes = [];
    let remaining = Math.max(0, Math.trunc(value));
    do {
      const byte = remaining % 128;
      remaining = Math.floor(remaining / 128);
      bytes.push(remaining > 0 ? byte | 128 : byte);
    } while (remaining > 0);
    return bytes;
  }
  function encodeProtoVarintField(fieldNumber, value) {
    return [...encodeProtoVarint(fieldNumber * 8), ...encodeProtoVarint(value)];
  }
  function encodeProtoStringField(fieldNumber, value) {
    const encoded = [...new TextEncoder().encode(value)];
    return [...encodeProtoVarint(fieldNumber * 8 + 2), ...encodeProtoVarint(encoded.length), ...encoded];
  }
  function encodeProtoBytesField(fieldNumber, bytes) {
    return [...encodeProtoVarint(fieldNumber * 8 + 2), ...encodeProtoVarint(bytes.length), ...bytes];
  }
  function encodeBase64Url(bytes) {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodeBase64Url(value) {
    try {
      const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
      const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
      return Uint8Array.from(binary, (char) => char.charCodeAt(0));
    } catch {
      return void 0;
    }
  }
  function buildSkyscannerFlightSearchUrl(flightMeta) {
    const pathParts = [
      flightMeta.origin.toLowerCase(),
      flightMeta.destination.toLowerCase(),
      compactIsoDate(flightMeta.outboundDate).slice(2),
      flightMeta.inboundDate !== void 0 ? compactIsoDate(flightMeta.inboundDate).slice(2) : void 0
    ].filter((part) => part !== void 0);
    const params = new URLSearchParams({
      adults: String(flightMeta.adults),
      adultsv2: String(flightMeta.adults),
      cabinclass: buildSkyscannerCabinClass(flightMeta).toLowerCase().replace(/_/g, ""),
      childrenv2: "",
      inboundaltsenabled: "false",
      outboundaltsenabled: "false",
      preferdirects: flightMeta.maxStops === 0 ? "true" : "false",
      rtn: flightMeta.inboundDate !== void 0 ? "1" : "0"
    });
    return `https://www.skyscanner.no/transport/flights/${pathParts.join("/")}/?${params.toString()}`;
  }
  function buildTripComFlightSearchUrl(flightMeta) {
    const params = new URLSearchParams({
      dcity: flightMeta.origin.toLowerCase(),
      acity: flightMeta.destination.toLowerCase(),
      ddate: flightMeta.outboundDate,
      triptype: flightMeta.inboundDate !== void 0 ? "rt" : "ow",
      class: buildTripComCabinClassParam(flightMeta),
      lowpricesource: "searchform",
      quantity: String(flightMeta.adults),
      searchboxarg: "t",
      nonstoponly: flightMeta.maxStops === 0 ? "on" : "off",
      locale: "en-US",
      curr: TRIP_COM_DEFAULT_CURRENCY
    });
    if (flightMeta.inboundDate !== void 0) params.set("rdate", flightMeta.inboundDate);
    return `${TRIP_COM_BASE_URL}/flights/showfarefirst?${params.toString()}`;
  }
  function buildTripComCabinClassParam(flightMeta) {
    switch (flightMeta.cabinClass) {
      case "premium":
        return "s";
      case "business":
        return "c";
      case "first":
        return "f";
      default:
        return "y";
    }
  }
  async function findTripComFlightPriceMatchOffer(flightMeta, routeTitle, searchDetails, airportLookup) {
    if (flightMeta.cabinClass !== void 0 && flightMeta.cabinClass !== "economy") return void 0;
    const resultUrl = buildTripComFlightSearchUrl(flightMeta);
    const session = readTripComSessionFromCurrentPage();
    const ratesPromise = fetchNokBaseRates();
    const useLowestPriceFallbacks = !hasFlightSearchResultFilters(flightMeta);
    const [rates, listResult, calendarCandidate] = await Promise.all([
      ratesPromise,
      pollTripComFlightListSearch(flightMeta, session, "Score", 3),
      flightMeta.inboundDate !== void 0 && useLowestPriceFallbacks ? ratesPromise.then((rates2) => safelyFindTripComCalendarOfferCandidate(flightMeta, resultUrl, airportLookup, rates2)) : Promise.resolve(void 0)
    ]);
    const resultData = listResult.resultData;
    let candidates = isRecord(resultData) ? extractTripComListOfferCandidates(resultData, resultUrl, rates, flightMeta) : [];
    if (candidates.length === 0 && isRecord(resultData) && useLowestPriceFallbacks) {
      const basicInfo = isRecord(resultData.basicInfo) ? resultData.basicInfo : {};
      const currency = readStringValue(basicInfo.currency) ?? TRIP_COM_DEFAULT_CURRENCY;
      const lowestPriceCandidate = extractTripComBasicLowestPriceCandidate(basicInfo, resultUrl, rates, currency, "anbefalt");
      if (lowestPriceCandidate !== void 0) candidates = [lowestPriceCandidate];
    }
    if (candidates.length === 0 && calendarCandidate !== void 0) {
      candidates = [calendarCandidate];
    }
    const best = candidates[0];
    if (best === void 0) return void 0;
    return {
      source: "tripcom",
      sourceName: "Trip",
      details: searchDetails,
      matchedExactProduct: true,
      shopName: best.shopName,
      price: best.price,
      amount: best.amount,
      sortAmount: best.sortAmount ?? best.amount,
      currency: best.currency,
      productName: routeTitle,
      productUrl: resultUrl,
      offerUrl: best.productUrl,
      ...best.durationText !== void 0 ? { durationText: best.durationText } : {},
      ...listResult.stable ? {} : { searchIncomplete: true },
      alternatives: candidates.map(({ productUrl: _productUrl, ...alternative }) => alternative)
    };
  }
  const TRIP_COM_LIST_POLL_ATTEMPTS = 3;
  const TRIP_COM_LIST_POLL_INTERVAL_MS = 2500;
  async function pollTripComFlightListSearch(flightMeta, session, sortOrder, grade) {
    let best;
    let previousKey;
    for (let attempt = 0; attempt < TRIP_COM_LIST_POLL_ATTEMPTS; attempt++) {
      if (attempt > 0) await sleep(TRIP_COM_LIST_POLL_INTERVAL_MS);
      const value = await fetchTripComFlightListSearch(flightMeta, session, sortOrder, grade);
      if (!isRecord(value)) continue;
      if (best === void 0 || readTripComListItineraryCount(value) > readTripComListItineraryCount(best)) {
        best = value;
      }
      const key = readTripComListResultKey(value);
      if (previousKey !== void 0 && key === previousKey) {
        return { resultData: best, stable: true };
      }
      previousKey = key;
    }
    return { resultData: best, stable: best === void 0 };
  }
  function readTripComListItineraryCount(resultData) {
    return Array.isArray(resultData.itineraryList) ? resultData.itineraryList.length : 0;
  }
  function readTripComListResultKey(resultData) {
    const basicInfo = isRecord(resultData.basicInfo) ? resultData.basicInfo : void 0;
    const lowestPrice = isRecord(basicInfo?.lowestPrice) ? basicInfo.lowestPrice : void 0;
    return `${readTripComListItineraryCount(resultData)}|${readPositiveNumberValue(lowestPrice?.totalPrice) ?? ""}`;
  }
  function createTripComVid() {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const suffix = Array.from({ length: 12 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    return `${Date.now()}.${suffix}`;
  }
  function readTripComSessionFromCurrentPage() {
    const hostname = parseUrl(window.location.href)?.hostname.replace(/^www\./, "").toLowerCase();
    if (hostname === void 0 || !(hostname === "trip.com" || hostname.endsWith(".trip.com"))) return {};
    const cookies = document.cookie.split(/;\s*/);
    const readCookie = (name) => {
      const prefix = `${name}=`;
      const value = cookies.find((cookie) => cookie.startsWith(prefix))?.slice(prefix.length);
      return value !== void 0 && value.length > 0 ? decodeURIComponent(value) : void 0;
    };
    const cid = readCookie("GUID");
    const vid = readCookie("UBT_VID");
    return {
      ...cid !== void 0 ? { cid } : {},
      ...vid !== void 0 ? { vid } : {}
    };
  }
  async function fetchTripComFlightListSearch(flightMeta, session, sortOrder, grade) {
    const text = await userscriptTextRequest(TRIP_COM_FLIGHT_LIST_SEARCH_ENDPOINT, {
      method: "POST",
      headers: TRIP_COM_COMMON_HEADERS,
      body: JSON.stringify(buildTripComFlightListSearchPayload(flightMeta, sortOrder, grade, session)),
      credentials: "omit",
      timeoutMs: TRIP_COM_FLIGHT_REQUEST_TIMEOUT_MS
    });
    return text !== void 0 ? parseTripComSseResponse(text) : void 0;
  }
  async function findTripComCalendarOfferCandidate(flightMeta, resultUrl, airportLookup, rates) {
    const resultData = await userscriptJsonRequest(TRIP_COM_LOW_PRICE_ENDPOINT, {
      method: "POST",
      headers: TRIP_COM_COMMON_HEADERS,
      body: JSON.stringify(buildTripComLowPricePayload(flightMeta)),
      credentials: "omit",
      timeoutMs: TRIP_COM_FLIGHT_REQUEST_TIMEOUT_MS
    });
    if (!isRecord(resultData)) return void 0;
    return extractTripComCalendarCandidate(resultData, flightMeta, resultUrl, airportLookup, rates);
  }
  async function safelyFindTripComCalendarOfferCandidate(flightMeta, resultUrl, airportLookup, rates) {
    try {
      return await findTripComCalendarOfferCandidate(flightMeta, resultUrl, airportLookup, rates);
    } catch {
      return void 0;
    }
  }
  function buildTripComFlightListSearchPayload(flightMeta, sortOrder, grade, session) {
    return {
      mode: 0,
      searchCriteria: {
        grade,
        realGrade: 1,
        tripType: flightMeta.inboundDate !== void 0 ? 2 : 1,
        journeyNo: 1,
        passengerInfoType: {
          adultCount: flightMeta.adults,
          childCount: 0,
          infantCount: 0
        },
        journeyInfoTypes: buildTripComJourneyInfoTypes(flightMeta),
        policyId: null
      },
      sortInfoType: {
        orderBy: sortOrder,
        direction: true,
        topList: []
      },
      filterType: {
        filterFlagTypes: [],
        queryItemSettings: [],
        studentsSelectedStatus: true
      },
      tagList: [],
      flagList: ["NEED_RESET_SORT", "FullDataCache"],
      abtList: [
        { abCode: "250811_IBU_wjrankol", abVersion: "A" },
        { abCode: "251023_IBU_pricetool", abVersion: "E" },
        { abCode: "260302_IBU_farecardjc", abVersion: "B" }
      ],
      head: buildTripComFlightListSearchHead(session)
    };
  }
  function buildTripComJourneyInfoTypes(flightMeta) {
    const journeys = [
      {
        journeyNo: 1,
        departCode: flightMeta.origin,
        arriveCode: flightMeta.destination,
        departDate: flightMeta.outboundDate,
        departAirport: "",
        arriveAirport: ""
      }
    ];
    if (flightMeta.inboundDate !== void 0) {
      journeys.push({
        journeyNo: 2,
        departCode: flightMeta.destination,
        arriveCode: flightMeta.origin,
        departDate: flightMeta.inboundDate,
        departAirport: "",
        arriveAirport: ""
      });
    }
    return journeys;
  }
  function buildTripComFlightListSearchHead(session) {
    const timestamp = Date.now();
    const batchId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(timestamp);
    return {
      cid: session.cid ?? "",
      ctok: "",
      cver: "3",
      lang: "01",
      sid: "8888",
      syscode: "40",
      auth: "",
      xsid: "",
      extension: [
        { name: "source", value: "ONLINE" },
        { name: "sotpGroup", value: "Trip" },
        { name: "sotpLocale", value: "en-US" },
        { name: "sotpCurrency", value: TRIP_COM_DEFAULT_CURRENCY },
        { name: "allianceID", value: "0" },
        { name: "sid", value: "0" },
        { name: "ouid", value: "" },
        { name: "uuid" },
        { name: "useDistributionType", value: "1" },
        { name: "flt_app_session_transactionId", value: `1-mf-${timestamp}-WEB` },
        { name: "vid", value: session.vid ?? createTripComVid() },
        { name: "pvid", value: "1" },
        { name: "Flt_SessionId", value: "1" },
        { name: "channel", value: "EnglishSite" },
        { name: "x-ua", value: "v=3_os=ONLINE_osv=10.15.7" },
        { name: "PageId", value: "10320667452" },
        { name: "clientTime", value: new Date(timestamp).toISOString() },
        { name: "LowPriceSource", value: "searchForm" },
        { name: "Flt_BatchId", value: batchId },
        { name: "BlockTokenTimeout", value: "0" },
        { name: "full_link_time_scene", value: "pure_list_page" },
        { name: "xproduct", value: "baggage" },
        { name: "hotelEntrance", value: "Flight" },
        { name: "units", value: "METRIC" },
        { name: "sotpUnit", value: "METRIC" }
      ],
      Locale: "en-US",
      Language: "en",
      Currency: TRIP_COM_DEFAULT_CURRENCY,
      ClientID: "",
      appid: "700020"
    };
  }
  function parseTripComSseResponse(text) {
    const records = text.split(/\n\n+/).flatMap((block) => {
      const data = block.split(/\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n").trim();
      if (data.length === 0 || data === "[DONE]") return [];
      const parsed = parseJsonValue(data);
      return isRecord(parsed) ? [parsed] : [];
    });
    return records.find((record) => Array.isArray(record.itineraryList)) ?? records[records.length - 1];
  }
  function extractTripComListOfferCandidates(resultData, resultUrl, rates, flightMeta) {
    const basicInfo = isRecord(resultData.basicInfo) ? resultData.basicInfo : {};
    const currency = readStringValue(basicInfo.currency) ?? TRIP_COM_DEFAULT_CURRENCY;
    const airlineNames = buildTripComAirlineNameMap(resultData.airlineList);
    const candidates = readRecordArray(resultData.itineraryList).map((itinerary) => {
      const amount = readRecordArray(itinerary.policies).map(readTripComPolicyAmount).find((policyAmount) => policyAmount !== void 0);
      if (amount === void 0) return void 0;
      const journeys = readRecordArray(itinerary.journeyList);
      if (exceedsFlightMaxStops(flightMeta, journeys.map(readTripComJourneyStopCount))) return void 0;
      const candidate = toTripComOfferCandidate({
        amount,
        currency,
        productUrl: resultUrl,
        rates,
        platformParts: [formatTripComItinerarySummary(itinerary, airlineNames)]
      });
      if (candidate === void 0) return void 0;
      const durationText = formatFlightLegDurationsWithStopsText(journeys.map((journey) => ({
        durationMinutes: readNumberValue(journey.duration),
        stopCount: readTripComJourneyStopCount(journey)
      })));
      return durationText !== void 0 ? { ...candidate, durationText } : candidate;
    }).filter((candidate) => candidate !== void 0);
    return dedupeTripComOfferCandidates(candidates).slice(0, FLIGHT_OFFER_CANDIDATE_LIMIT);
  }
  function readTripComJourneyStopCount(journey) {
    return Math.max(0, readRecordArray(journey.transSectionList).length - 1);
  }
  function readTripComPolicyAmount(policy) {
    const price = isRecord(policy.price) ? policy.price : void 0;
    return readTripComPriceAmount(price);
  }
  function extractTripComBasicLowestPriceCandidate(basicInfo, resultUrl, rates, currency, sortLabel) {
    const lowestPrice = isRecord(basicInfo.lowestPrice) ? basicInfo.lowestPrice : void 0;
    const amount = readTripComPriceAmount(lowestPrice);
    if (amount === void 0) return void 0;
    return toTripComOfferCandidate({
      amount,
      currency,
      productUrl: resultUrl,
      rates,
      platformParts: [`Trip.com ${sortLabel}`, "tab-pris"]
    });
  }
  function readTripComPriceAmount(price) {
    if (price === void 0) return void 0;
    const adultPrice = isRecord(price?.adult) ? price.adult : void 0;
    return readPositiveNumberValue(price?.totalPrice) ?? readPositiveNumberValue(price?.averagePrice) ?? readPositiveNumberValue(adultPrice?.totalPrice);
  }
  function toTripComOfferCandidate(input) {
    const displayCurrency = input.currency.toUpperCase();
    const convertedNokAmount = convertToNok(input.amount, displayCurrency, input.rates);
    const isConvertedCurrency = convertedNokAmount !== void 0 && displayCurrency !== "NOK";
    const displayAmount = convertedNokAmount ?? input.amount;
    const priceCurrency = convertedNokAmount !== void 0 ? "NOK" : displayCurrency;
    return {
      shopName: "Trip",
      price: isConvertedCurrency ? formatApproxNokFlightPrice(displayAmount) : formatFlightPrice(displayAmount, priceCurrency),
      amount: displayAmount,
      sortAmount: convertedNokAmount ?? FLIGHT_STATIC_PRICE_SORT_AMOUNT,
      currency: priceCurrency,
      productUrl: input.productUrl,
      platform: [
        ...input.platformParts,
        isConvertedCurrency ? `Trip.com viser ${formatFlightPrice(input.amount, displayCurrency)}` : void 0
      ].filter((part) => part !== void 0 && part.length > 0).join(", ")
    };
  }
  function buildTripComAirlineNameMap(value) {
    const map = {};
    for (const airline of readRecordArray(value)) {
      const code = readStringValue(airline.code)?.toUpperCase() ?? readStringValue(airline.airlineCode)?.toUpperCase();
      const name = readStringValue(airline.name) ?? readStringValue(airline.airlineName) ?? readStringValue(airline.shortName);
      if (code !== void 0 && name !== void 0) map[code] = name;
    }
    return map;
  }
  function formatTripComItinerarySummary(itinerary, airlineNames) {
    const journeys = readRecordArray(itinerary.journeyList);
    const parts = [
      formatTripComCarrierSummary(journeys, airlineNames),
      formatTripComStopsSummary(journeys),
      formatTripComTimeSummary(journeys)
    ].filter((part) => part !== void 0 && part.length > 0);
    return parts.length > 0 ? parts.join(", ") : void 0;
  }
  function formatTripComCarrierSummary(journeys, airlineNames) {
    return formatFlightCarriersByLeg(journeys.map((journey) => {
      return readRecordArray(journey.transSectionList).map((section) => {
        const flightInfo = isRecord(section.flightInfo) ? section.flightInfo : void 0;
        const code = readStringValue(flightInfo?.airlineCode)?.toUpperCase();
        return code !== void 0 ? airlineNames[code] ?? code : void 0;
      }).filter((carrier) => carrier !== void 0);
    }));
  }
  function formatTripComTimeSummary(journeys) {
    const ranges = journeys.map((journey) => {
      const sections = readRecordArray(journey.transSectionList);
      const departure = readStringValue(sections[0]?.departDateTime)?.match(/\b(\d{2}:\d{2})/)?.[1];
      const arrival = readStringValue(sections[sections.length - 1]?.arriveDateTime)?.match(/\b(\d{2}:\d{2})/)?.[1];
      return departure !== void 0 && arrival !== void 0 ? `${departure}-${arrival}` : void 0;
    }).filter((range) => range !== void 0);
    return ranges.length > 0 ? ranges.join(" / ") : void 0;
  }
  function formatTripComStopsSummary(journeys) {
    if (journeys.length === 0) return void 0;
    const stopTexts = journeys.map((journey) => Math.max(0, readRecordArray(journey.transSectionList).length - 1)).map((stopCount) => stopCount === 0 ? "direkte" : `${stopCount} stopp`);
    return uniqueStrings(stopTexts).join(" / ");
  }
  function dedupeTripComOfferCandidates(candidates) {
    const seen = /* @__PURE__ */ new Set();
    const uniqueCandidates = [];
    for (const candidate of candidates) {
      const key = [
        Math.round(candidate.sortAmount ?? candidate.amount),
        candidate.platform?.replace(/^Trip\.com (?:billigst|anbefalt),\s*/i, "") ?? ""
      ].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueCandidates.push(candidate);
    }
    return uniqueCandidates;
  }
  function buildTripComLowPricePayload(flightMeta) {
    return {
      dCity: flightMeta.origin,
      aCity: flightMeta.destination,
      dDate: flightMeta.outboundDate,
      flightWayType: flightMeta.inboundDate !== void 0 ? "RT" : "OW",
      departureAirport: "",
      arrivalAirport: "",
      cabinClass: "Economy",
      transferType: "ANY",
      searchInfo: {
        travelerNum: {
          adult: flightMeta.adults,
          child: 0,
          infant: 0
        }
      },
      abtList: [],
      offSet: 30,
      ...flightMeta.inboundDate !== void 0 ? { aDate: flightMeta.inboundDate, startInterval: 0, endInterval: 30, searchMode: "Compare" } : {},
      Head: {
        Group: "Trip",
        Source: "ONLINE",
        Version: "3",
        Currency: TRIP_COM_DEFAULT_CURRENCY,
        Locale: "en-US",
        Language: "en",
        ClientID: "",
        PageId: "10320667452"
      }
    };
  }
  function extractTripComCalendarCandidate(resultData, flightMeta, resultUrl, airportLookup, rates) {
    const currency = readStringValue(resultData.currency) ?? TRIP_COM_DEFAULT_CURRENCY;
    const calendarItem = readRecordArray(resultData.lowPriceInCalenderDtoInfoList).find((item) => isTripComCalendarItemMatchingSearch(item, flightMeta));
    const calendarAmount = readPositiveNumberValue(calendarItem?.currencyPrice);
    const amount = calendarAmount;
    if (amount === void 0) return void 0;
    const candidate = toTripComOfferCandidate({
      amount,
      currency,
      productUrl: resultUrl,
      rates,
      platformParts: [
        "indikativ kalenderpris",
        flightMeta.inboundDate !== void 0 ? "tur/retur" : "én vei",
        formatFlightAirportScopeText(flightMeta, airportLookup)
      ]
    });
    return candidate !== void 0 ? { ...candidate, shopName: "Trip kalender" } : void 0;
  }
  function isTripComCalendarItemMatchingSearch(item, flightMeta) {
    if (formatPanFlightsEpochDate(readNumberValue(item.dDate)) !== flightMeta.outboundDate) return false;
    if (flightMeta.inboundDate === void 0) return true;
    return formatPanFlightsEpochDate(readNumberValue(item.aDate)) === flightMeta.inboundDate;
  }
  async function fetchNokBaseRates() {
    if (nokBaseRatesPromise === void 0) {
      nokBaseRatesPromise = userscriptJsonRequest(EXCHANGE_RATES_URL, {
        headers: { Accept: "application/json" },
        credentials: "omit"
      }).then(readNokBaseRates, () => void 0);
    }
    return nokBaseRatesPromise;
  }
  function readNokBaseRates(value) {
    if (!isRecord(value) || value.result !== "success" || !isRecord(value.rates)) return void 0;
    const rates = {};
    for (const [currency, rate] of Object.entries(value.rates)) {
      if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
        rates[currency.toUpperCase()] = rate;
      }
    }
    if (Object.keys(rates).length === 0) return void 0;
    const updatedAt = readStringValue(value.time_last_update_utc);
    return updatedAt !== void 0 ? { rates, updatedAt } : { rates };
  }
  function convertToNok(amount, currency, rates) {
    const normalizedCurrency = currency.toUpperCase();
    if (normalizedCurrency === "NOK") return Math.round(amount);
    const rate = rates?.rates[normalizedCurrency];
    if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) return amount / rate;
    return void 0;
  }
  async function findSkyscannerFlightPriceMatchOffer(flightMeta, routeTitle, searchDetails, airportLookup) {
    const resultUrl = buildSkyscannerFlightSearchUrl(flightMeta);
    const { candidates, searchComplete } = await fetchCachedSkyscannerFlightOfferCandidates(flightMeta, resultUrl, airportLookup);
    const candidate = candidates[0];
    if (candidate === void 0) return void 0;
    return {
      source: "skyscanner",
      sourceName: "Skyscanner",
      details: searchDetails,
      matchedExactProduct: true,
      shopName: candidate.shopName,
      price: candidate.price,
      amount: candidate.amount,
      sortAmount: candidate.sortAmount ?? candidate.amount,
      currency: candidate.currency,
      productName: routeTitle,
      productUrl: resultUrl,
      offerUrl: resultUrl,
      ...candidate.durationText !== void 0 ? { durationText: candidate.durationText } : {},
      ...searchComplete ? {} : { searchIncomplete: true },
      alternatives: candidates.map(({ productUrl: _productUrl, ...alternative }) => alternative)
    };
  }
  function fetchCachedSkyscannerFlightOfferCandidates(flightMeta, resultUrl, airportLookup) {
    const cacheKey = buildSkyscannerFlightOfferCacheKey(flightMeta, airportLookup);
    const cachedEntry = skyscannerFlightOfferCache.get(cacheKey);
    const now = Date.now();
    if (cachedEntry !== void 0 && cachedEntry.expiresAt > now) return cachedEntry.promise;
    const entry = {
      expiresAt: now + SKYSCANNER_FLIGHT_OFFER_CACHE_TTL_MS,
      promise: fetchUncachedSkyscannerFlightOfferCandidates(flightMeta, resultUrl, airportLookup)
    };
    entry.promise.then(
      (result) => {
        entry.expiresAt = result.searchComplete ? Date.now() + (result.candidates.length > 0 ? SKYSCANNER_FLIGHT_OFFER_CACHE_TTL_MS : SKYSCANNER_EMPTY_FLIGHT_OFFER_CACHE_TTL_MS) : Date.now();
      },
      () => {
        if (skyscannerFlightOfferCache.get(cacheKey) === entry) skyscannerFlightOfferCache.delete(cacheKey);
      }
    );
    skyscannerFlightOfferCache.set(cacheKey, entry);
    return entry.promise;
  }
  async function fetchUncachedSkyscannerFlightOfferCandidates(flightMeta, resultUrl, airportLookup) {
    const apiResult = await fetchSkyscannerFlightSearchCandidates(flightMeta, resultUrl, airportLookup);
    if (apiResult.candidates.length > 0 || hasFlightSearchResultFilters(flightMeta)) return apiResult;
    const calendarCandidate = await fetchSkyscannerFlightCalendarCandidate(flightMeta, resultUrl);
    return {
      candidates: calendarCandidate !== void 0 ? [calendarCandidate] : [],
      searchComplete: apiResult.searchComplete
    };
  }
  function buildSkyscannerFlightOfferCacheKey(flightMeta, airportLookup) {
    return [
      buildFlightSearchMetaKey(flightMeta),
      [...collectEquivalentFlightAirportCodes(flightMeta.origin, airportLookup)].sort().join(","),
      [...collectEquivalentFlightAirportCodes(flightMeta.destination, airportLookup)].sort().join(",")
    ].join("|");
  }
  async function fetchSkyscannerFlightSearchCandidates(flightMeta, resultUrl, airportLookup) {
    const [originPlace, destinationPlace] = await Promise.all([
      fetchSkyscannerFlightPlace(flightMeta.origin, "inputorigin"),
      fetchSkyscannerFlightPlace(flightMeta.destination, "inputdestination")
    ]);
    if (originPlace === void 0 || destinationPlace === void 0) return { candidates: [], searchComplete: true };
    const headers = buildSkyscannerWebSearchHeaders(resultUrl);
    let latestResult = await requestSkyscannerFlightSearch(
      buildSkyscannerFlightSearchPayload(flightMeta, originPlace, destinationPlace),
      headers
    );
    if (latestResult === void 0) return { candidates: [], searchComplete: true };
    for (let attempt = 0; attempt < SKYSCANNER_WEB_SEARCH_POLL_ATTEMPTS; attempt++) {
      const context = isRecord(latestResult.context) ? latestResult.context : void 0;
      const status = readStringValue(context?.status)?.toLowerCase();
      const sessionId = readStringValue(context?.sessionId);
      if (status === "complete" || sessionId === void 0) break;
      await sleep(SKYSCANNER_WEB_SEARCH_POLL_INTERVAL_MS);
      const pollResult = await pollSkyscannerFlightSearch(sessionId, headers);
      if (pollResult !== void 0) latestResult = pollResult;
    }
    const finalContext = isRecord(latestResult.context) ? latestResult.context : void 0;
    const finalStatus = readStringValue(finalContext?.status)?.toLowerCase();
    return {
      candidates: extractSkyscannerFlightSearchCandidates(latestResult, flightMeta, airportLookup, resultUrl),
      searchComplete: finalStatus === void 0 || finalStatus === "complete"
    };
  }
  function requestSkyscannerFlightSearch(payload, headers) {
    return userscriptJsonRequest(SKYSCANNER_WEB_UNIFIED_SEARCH_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      // Send Skyscanner-cookies (PerimeterX _pxvid) slik at bot-vakten slipper oss gjennom.
      credentials: "include",
      timeoutMs: 3e4
    }).then((value) => isRecord(value) ? value : void 0);
  }
  function pollSkyscannerFlightSearch(sessionId, headers) {
    return userscriptJsonRequest(`${SKYSCANNER_WEB_UNIFIED_SEARCH_ENDPOINT}${encodeURIComponent(sessionId)}`, {
      headers,
      credentials: "include",
      timeoutMs: 3e4
    }).then((value) => isRecord(value) ? value : void 0);
  }
  function buildSkyscannerWebSearchHeaders(resultUrl) {
    const viewId = createRandomRequestId();
    return {
      ...SKYSCANNER_WEB_SEARCH_HEADERS,
      Referer: resultUrl,
      "X-Skyscanner-Traveller-Context": createRandomRequestId(),
      "X-Skyscanner-TrustedFunnelId": viewId,
      "X-Skyscanner-ViewId": viewId
    };
  }
  function createRandomRequestId() {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
  function buildSkyscannerFlightSearchPayload(flightMeta, originPlace, destinationPlace) {
    const legs = [
      buildSkyscannerFlightSearchLeg(originPlace, destinationPlace, flightMeta.outboundDate, destinationPlace.placeOfStayEntityId)
    ];
    if (flightMeta.inboundDate !== void 0) {
      legs.push(buildSkyscannerFlightSearchLeg(destinationPlace, originPlace, flightMeta.inboundDate));
    }
    return {
      cabinClass: buildSkyscannerCabinClass(flightMeta),
      childAges: [],
      adults: flightMeta.adults,
      legs
    };
  }
  function buildSkyscannerCabinClass(flightMeta) {
    switch (flightMeta.cabinClass) {
      case "premium":
        return "PREMIUM_ECONOMY";
      case "business":
        return "BUSINESS";
      case "first":
        return "FIRST";
      default:
        return "ECONOMY";
    }
  }
  function buildSkyscannerFlightSearchLeg(originPlace, destinationPlace, date, placeOfStayEntityId) {
    const dateParts = splitIsoDateParts(date);
    return {
      legOrigin: { "@type": "entity", entityId: originPlace.entityId },
      legDestination: { "@type": "entity", entityId: destinationPlace.entityId },
      dates: {
        "@type": "date",
        year: dateParts.year,
        month: dateParts.month,
        day: dateParts.day
      },
      ...placeOfStayEntityId !== void 0 ? { placeOfStay: placeOfStayEntityId } : {}
    };
  }
  function extractSkyscannerFlightSearchCandidates(resultData, flightMeta, airportLookup, fallbackUrl) {
    const itineraries = isRecord(resultData.itineraries) ? resultData.itineraries : void 0;
    if (itineraries === void 0) return [];
    const candidates = [];
    for (const result of readRecordValues(itineraries.results)) {
      if (!isSkyscannerFlightMatchingSearch(result, flightMeta, airportLookup)) continue;
      if (result.isSelfTransfer === true && result.isProtectedSelfTransfer !== true) continue;
      const legSummaries = readSkyscannerFlightLegSummaries(result);
      if (exceedsFlightMaxStops(flightMeta, legSummaries.map((leg) => leg.stopCount))) continue;
      const score = readNumberValue(result.score);
      const tripSummary = formatSkyscannerFlightTripSummary(result);
      const tags = readSkyscannerResultTags(result);
      const tagSummary = tags.includes("cheapest") ? "billigst" : void 0;
      const durationText = formatFlightLegDurationsWithStopsText(legSummaries);
      const platform = [tripSummary, tagSummary].filter((part) => part !== void 0 && part.length > 0).join(", ");
      let bestPricingOption;
      let bestAmount;
      for (const pricingOption of readSkyscannerPricingOptions(result)) {
        const amount = readSkyscannerPricingOptionAmount(pricingOption, result);
        if (amount === void 0) continue;
        if (bestAmount === void 0 || amount < bestAmount) {
          bestAmount = amount;
          bestPricingOption = pricingOption;
        }
      }
      if (bestPricingOption === void 0 || bestAmount === void 0) continue;
      candidates.push({
        shopName: readSkyscannerAgentName(bestPricingOption, itineraries) ?? "Skyscanner",
        price: formatNokFlightPrice(bestAmount),
        amount: bestAmount,
        sortAmount: bestAmount,
        currency: "NOK",
        productUrl: readSkyscannerPricingOptionUrl(bestPricingOption, fallbackUrl),
        ...score !== void 0 ? { score } : {},
        ...durationText !== void 0 ? { durationText } : {},
        ...platform.length > 0 ? { platform } : {}
      });
    }
    return dedupeSkyscannerOfferCandidates(candidates).sort(compareSkyscannerOfferCandidates).slice(0, FLIGHT_OFFER_CANDIDATE_LIMIT);
  }
  function readSkyscannerResultTags(result) {
    return Array.isArray(result.tags) ? result.tags.filter(isString).map((tag) => tag.toLowerCase()) : [];
  }
  function readSkyscannerPricingOptions(result) {
    return readRecordArray(result.pricingOptions).filter((pricingOption) => {
      const price = isRecord(pricingOption.price) ? pricingOption.price : void 0;
      const status = readStringValue(price?.updateStatus)?.toLowerCase();
      return status === void 0 || status === "current";
    });
  }
  function readSkyscannerPricingOptionAmount(pricingOption, result) {
    const optionPrice = isRecord(pricingOption.price) ? pricingOption.price : void 0;
    const resultPrice = isRecord(result.price) ? result.price : void 0;
    return readPositiveNumberValue(optionPrice?.amount) ?? readPositiveNumberValue(resultPrice?.raw);
  }
  function readSkyscannerPricingOptionUrl(pricingOption, fallbackUrl) {
    for (const item of readRecordArray(pricingOption.items)) {
      const url = readStringValue(item.url);
      if (url === void 0) continue;
      const parsedUrl = parseUrlWithBase(url, "https://www.skyscanner.no");
      if (parsedUrl !== void 0) return parsedUrl.toString();
    }
    return fallbackUrl;
  }
  function readSkyscannerAgentName(pricingOption, itineraries) {
    const agentId = readSkyscannerPricingOptionAgentId(pricingOption);
    if (agentId === void 0) return void 0;
    const agent = readRecordArray(itineraries.agents).find((candidateAgent) => readStringValue(candidateAgent.id) === agentId);
    return readStringValue(agent?.name) ?? agentId;
  }
  function readSkyscannerPricingOptionAgentId(pricingOption) {
    const itemAgentId = readRecordArray(pricingOption.items).map((item) => readStringValue(item.agentId)).find((agentId) => agentId !== void 0);
    if (itemAgentId !== void 0) return itemAgentId;
    return Array.isArray(pricingOption.agentIds) ? pricingOption.agentIds.map(readStringValue).find((agentId) => agentId !== void 0) : void 0;
  }
  function compareSkyscannerOfferCandidates(left, right) {
    const scoreDifference = (right.score ?? 0) - (left.score ?? 0);
    if (Math.abs(scoreDifference) > 1e-6) return scoreDifference;
    return left.amount - right.amount;
  }
  function isSkyscannerFlightMatchingSearch(result, flightMeta, airportLookup) {
    const legs = readSkyscannerFlightLegSummaries(result);
    const outboundLeg = legs[0];
    if (outboundLeg === void 0 || !isSkyscannerFlightLegMatch(outboundLeg, flightMeta.origin, flightMeta.destination, airportLookup, flightMeta.outboundDate)) {
      return false;
    }
    if (flightMeta.inboundDate === void 0) return true;
    const inboundLeg = legs[1];
    return inboundLeg !== void 0 && isSkyscannerFlightLegMatch(inboundLeg, flightMeta.destination, flightMeta.origin, airportLookup, flightMeta.inboundDate);
  }
  function isSkyscannerFlightLegMatch(leg, origin, destination, airportLookup, date) {
    return collectEquivalentFlightAirportCodes(origin, airportLookup).has(leg.origin) && collectEquivalentFlightAirportCodes(destination, airportLookup).has(leg.destination) && leg.departureDate === date;
  }
  function readSkyscannerFlightLegSummaries(result) {
    return readRecordArray(result.legs).map((leg) => {
      const origin = readSkyscannerLegPlaceCode(isRecord(leg.origin) ? leg.origin : void 0);
      const destination = readSkyscannerLegPlaceCode(isRecord(leg.destination) ? leg.destination : void 0);
      if (origin === void 0 || destination === void 0) return void 0;
      const carriers = isRecord(leg.carriers) ? leg.carriers : void 0;
      const departureTime = readStringValue(leg.departure);
      const arrivalTime = readStringValue(leg.arrival);
      const durationMinutes = readPositiveNumberValue(leg.durationInMinutes);
      return {
        origin,
        destination,
        ...departureTime !== void 0 ? { departureDate: departureTime.slice(0, 10), departureTime } : {},
        ...arrivalTime !== void 0 ? { arrivalTime } : {},
        ...durationMinutes !== void 0 ? { durationMinutes } : {},
        stopCount: readNonNegativeIntegerValue(leg.stopCount) ?? 0,
        carrierNames: readRecordArray(carriers?.marketing).map((carrier) => readStringValue(carrier.name)).filter((carrierName) => carrierName !== void 0)
      };
    }).filter((leg) => leg !== void 0);
  }
  function readSkyscannerLegPlaceCode(place) {
    return readIataCodeValue(place?.displayCode) ?? readIataCodeValue(place?.id);
  }
  function formatSkyscannerFlightTripSummary(result) {
    const legs = readSkyscannerFlightLegSummaries(result);
    const parts = [
      formatFlightCarriersByLeg(legs.map((leg) => leg.carrierNames)),
      formatSkyscannerFlightStops(legs),
      formatSkyscannerFlightTimeSummary(legs)
    ].filter((part) => part !== void 0 && part.length > 0);
    return parts.length > 0 ? parts.join(", ") : void 0;
  }
  function formatSkyscannerFlightStops(legs) {
    if (legs.length === 0) return void 0;
    if (legs.every((leg) => leg.stopCount === 0)) return "direkte";
    return legs.map((leg) => leg.stopCount === 0 ? "direkte" : `${leg.stopCount} stopp`).join(" / ");
  }
  function formatSkyscannerFlightTimeSummary(legs) {
    const ranges = legs.map((leg) => {
      const departureClock = formatMomondoFlightClock(leg.departureTime);
      const arrivalClock = formatMomondoFlightClock(leg.arrivalTime);
      return departureClock !== void 0 && arrivalClock !== void 0 ? `${departureClock}-${arrivalClock}` : void 0;
    }).filter((range) => range !== void 0);
    return ranges.length > 0 ? ranges.join(" / ") : void 0;
  }
  function readCurrentSkyscannerVisiblePriceKey() {
    return extractSkyscannerVisibleOfferCandidates(window.location.href).slice(0, 5).map((candidate) => `${Math.round(candidate.amount)}:${candidate.platform ?? ""}`).join(";");
  }
  function extractSkyscannerVisibleOfferCandidates(productUrl) {
    const text = (document.body?.innerText ?? "").replace(/\u00a0/g, " ");
    const candidates = [
      ...extractSkyscannerVisibleOfferCandidatesFromPattern(text, /(\d+)\s+tilbud\s+fra\s+(\d[\d\s]*)\s*kr\b/gi, productUrl)
    ];
    if (candidates.length === 0) {
      candidates.push(...extractSkyscannerFallbackVisibleOfferCandidates(text, productUrl));
    }
    return dedupeSkyscannerOfferCandidates(candidates).sort((left, right) => left.amount - right.amount);
  }
  function extractSkyscannerVisibleOfferCandidatesFromPattern(text, pattern, productUrl) {
    const candidates = [];
    for (const match of text.matchAll(pattern)) {
      const offerCount = readPositiveIntegerValue(match[1]);
      const amount = readPositiveNumberValue(match[2]);
      if (amount === void 0) continue;
      candidates.push({
        shopName: "Skyscanner",
        price: formatNokFlightPrice(amount),
        amount,
        sortAmount: amount,
        currency: "NOK",
        productUrl,
        platform: [
          "synlig treffliste",
          offerCount !== void 0 ? `${offerCount} tilbud` : void 0
        ].filter((part) => part !== void 0).join(", ")
      });
    }
    return candidates;
  }
  function extractSkyscannerFallbackVisibleOfferCandidates(text, productUrl) {
    const candidates = [];
    const pattern = /\b(\d[\d\s]{0,8})\s*kr\b/gi;
    for (const match of text.matchAll(pattern)) {
      const amount = readPositiveNumberValue(match[1]);
      if (amount === void 0) continue;
      const index = match.index ?? 0;
      const context = text.slice(Math.max(0, index - 160), Math.min(text.length, index + 160));
      if (!/\b(?:tilbud|se mer|vis tilbud|detaljer)\b/i.test(context)) continue;
      candidates.push({
        shopName: "Skyscanner",
        price: formatNokFlightPrice(amount),
        amount,
        sortAmount: amount,
        currency: "NOK",
        productUrl,
        platform: "synlig treffliste"
      });
    }
    return candidates;
  }
  function dedupeSkyscannerOfferCandidates(candidates) {
    const seen = /* @__PURE__ */ new Set();
    const uniqueCandidates = [];
    for (const candidate of candidates) {
      const key = `${candidate.shopName}|${Math.round(candidate.amount)}|${candidate.platform ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueCandidates.push(candidate);
    }
    return uniqueCandidates;
  }
  async function fetchSkyscannerFlightCalendarCandidate(flightMeta, resultUrl) {
    const [originPlace, destinationPlace] = await Promise.all([
      fetchSkyscannerFlightPlace(flightMeta.origin, "inputorigin"),
      fetchSkyscannerFlightPlace(flightMeta.destination, "inputdestination")
    ]);
    if (originPlace === void 0 || destinationPlace === void 0) return void 0;
    return await fetchSkyscannerCalendarCandidate(flightMeta, resultUrl, originPlace.entityId, destinationPlace.entityId, true) ?? fetchSkyscannerCalendarCandidate(flightMeta, resultUrl, originPlace.entityId, destinationPlace.entityId, false);
  }
  async function fetchSkyscannerFlightPlace(iataCode, endpoint) {
    const [airportPlaces, cityPlaces] = await Promise.all([
      fetchSkyscannerFlightPlaces(iataCode, endpoint, "AIRPORT"),
      fetchSkyscannerFlightPlaces(iataCode, endpoint, "CITY")
    ]);
    return selectSkyscannerFlightPlace(iataCode, airportPlaces, cityPlaces);
  }
  async function fetchSkyscannerFlightPlaces(iataCode, endpoint, placeType) {
    const cacheKey = `${endpoint}|${placeType}|${iataCode.toUpperCase()}`;
    const cachedEntry = skyscannerFlightPlaceCache.get(cacheKey);
    const now = Date.now();
    if (cachedEntry !== void 0 && cachedEntry.expiresAt > now) return cachedEntry.promise;
    const entry = {
      expiresAt: now + SKYSCANNER_FLIGHT_PLACE_CACHE_TTL_MS,
      promise: fetchUncachedSkyscannerFlightPlaces(iataCode, endpoint, placeType)
    };
    entry.promise.then(
      (places) => {
        entry.expiresAt = Date.now() + (places.length > 0 ? SKYSCANNER_FLIGHT_PLACE_CACHE_TTL_MS : SKYSCANNER_EMPTY_FLIGHT_PLACE_CACHE_TTL_MS);
      },
      () => {
        if (skyscannerFlightPlaceCache.get(cacheKey) === entry) skyscannerFlightPlaceCache.delete(cacheKey);
      }
    );
    skyscannerFlightPlaceCache.set(cacheKey, entry);
    return entry.promise;
  }
  async function fetchUncachedSkyscannerFlightPlaces(iataCode, endpoint, placeType) {
    const params = new URLSearchParams({ query: iataCode, placeTypes: placeType });
    const value = await userscriptJsonRequest(`${SKYSCANNER_FENRYR_BASE_URL}/${endpoint}?${params.toString()}`, {
      headers: SKYSCANNER_HTTP_HEADERS,
      credentials: "include"
    });
    return isRecord(value) ? readSkyscannerFlightPlaces(value) : [];
  }
  function selectSkyscannerFlightPlace(iataCode, airportPlaces, cityPlaces) {
    const normalizedCode = iataCode.toUpperCase();
    return airportPlaces.find((place) => place.skyId === normalizedCode && place.flightPlaceType === "AIRPORT") ?? cityPlaces.find((place) => place.skyId === normalizedCode || place.skyId === `${normalizedCode}A` || place.skyId.startsWith(normalizedCode)) ?? airportPlaces[0] ?? cityPlaces[0];
  }
  function readSkyscannerFlightPlaces(value) {
    const places = [];
    for (const suggestion of readRecordArray(value.inputSuggest)) {
      const navigation = isRecord(suggestion.navigation) ? suggestion.navigation : void 0;
      const flightParams = isRecord(navigation?.relevantFlightParams) ? navigation.relevantFlightParams : void 0;
      const entityId = readStringValue(flightParams?.entityId) ?? readStringValue(navigation?.entityId);
      const skyId = readStringValue(flightParams?.skyId)?.toUpperCase();
      const flightPlaceType = readStringValue(flightParams?.flightPlaceType)?.toUpperCase();
      if (entityId === void 0 || skyId === void 0 || flightPlaceType !== "AIRPORT" && flightPlaceType !== "CITY") continue;
      const hotelParams = isRecord(navigation?.relevantHotelParams) ? navigation.relevantHotelParams : void 0;
      const placeOfStayEntityId = readStringValue(hotelParams?.entityId);
      places.push({
        entityId,
        skyId,
        flightPlaceType,
        ...placeOfStayEntityId !== void 0 ? { placeOfStayEntityId } : {}
      });
    }
    return places;
  }
  async function fetchSkyscannerCalendarCandidate(flightMeta, resultUrl, originEntityId, destinationEntityId, isDirect) {
    const pickDate = flightMeta.inboundDate ?? flightMeta.outboundDate;
    const value = await userscriptJsonRequest(`${SKYSCANNER_FENRYR_BASE_URL}/pricecalendar/explore`, {
      method: "POST",
      headers: {
        ...SKYSCANNER_HTTP_HEADERS,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        headers: SKYSCANNER_CALENDAR_HEADERS,
        originId: originEntityId,
        destinationId: destinationEntityId,
        calendarStartDate: buildSkyscannerCalendarStartDate(flightMeta),
        isDirect,
        tripType: flightMeta.inboundDate !== void 0 ? "TRIP_TYPE_RETURN" : "TRIP_TYPE_ONEWAY",
        isFixedDeparture: flightMeta.inboundDate !== void 0
      }),
      credentials: "include"
    });
    if (!isRecord(value)) return void 0;
    const day = readRecordArray(value.days).find((candidateDay) => readStringValue(candidateDay.day) === pickDate);
    const flightPrice = isRecord(day?.flightPrice) ? day.flightPrice : void 0;
    const money = readSkyscannerMoney(flightPrice);
    if (money === void 0) return void 0;
    return {
      shopName: "Skyscanner kalender",
      price: formatFlightPrice(money.amount, money.currency),
      amount: money.amount,
      sortAmount: money.amount,
      currency: money.currency,
      productUrl: resultUrl,
      platform: [
        "indikativ kalenderpris",
        isDirect ? "direkte reiser" : "alle reiser",
        flightMeta.inboundDate !== void 0 ? "tur/retur" : "én vei"
      ].join(", ")
    };
  }
  function buildSkyscannerCalendarStartDate(flightMeta) {
    return flightMeta.inboundDate !== void 0 ? flightMeta.outboundDate : `${flightMeta.outboundDate.slice(0, 8)}01`;
  }
  function readSkyscannerMoney(value) {
    if (value === void 0) return void 0;
    const rawAmount = readPositiveNumberValue(value.amount);
    if (rawAmount === void 0) return void 0;
    const currency = readStringValue(value.currencyCode) ?? "NOK";
    const unit = readStringValue(value.unit);
    const amount = unit === "UNIT_CENTI" ? rawAmount / 100 : unit === "UNIT_MILLI" ? rawAmount / 1e3 : unit === "UNIT_MICRO" ? rawAmount / 1e6 : rawAmount;
    return amount > 0 ? { amount, currency } : void 0;
  }
  function buildMomondoFlightSearchUrl(flightMeta) {
    const pathParts = [
      `${flightMeta.origin}-${flightMeta.destination}`,
      flightMeta.outboundDate,
      flightMeta.inboundDate,
      flightMeta.cabinClass !== void 0 && flightMeta.cabinClass !== "economy" ? flightMeta.cabinClass : void 0
    ].filter((part) => part !== void 0);
    const params = new URLSearchParams({ sort: MOMONDO_DEFAULT_FLIGHT_SORT_MODE });
    if (flightMeta.adults !== 1) {
      params.set("adults", String(flightMeta.adults));
    }
    return `https://www.momondo.no/flight-search/${pathParts.map(encodeURIComponent).join("/")}?${params.toString()}`;
  }
  function readCurrentMomondoFlightSearchUrl(flightMeta) {
    const parsedUrl = parseUrl(window.location.href);
    if (parsedUrl === void 0) return void 0;
    const currentMeta = extractMomondoFlightSearchMeta(parsedUrl);
    return currentMeta !== void 0 && isSameFlightSearchMeta(currentMeta, flightMeta) ? parsedUrl.toString() : void 0;
  }
  function isSameFlightSearchMeta(left, right) {
    return left.origin === right.origin && left.destination === right.destination && left.outboundDate === right.outboundDate && left.inboundDate === right.inboundDate && left.adults === right.adults && left.youths === right.youths && left.children === right.children && left.infants === right.infants && (left.cabinClass ?? "economy") === (right.cabinClass ?? "economy");
  }
  function readMomondoFlightSortMode(url) {
    const sortMode = parseUrl(url)?.searchParams.get("sort");
    return sortMode === "price_a" || sortMode === "bestflight_a" ? sortMode : void 0;
  }
  function readCurrentMomondoVisibleBestPrice(flightMeta) {
    const parsedUrl = parseUrl(window.location.href);
    if (parsedUrl === void 0 || readCurrentMomondoFlightSearchUrl(flightMeta) === void 0) return void 0;
    if (readMomondoFlightSortMode(parsedUrl.toString()) !== "bestflight_a") return void 0;
    const text = document.body?.innerText;
    if (text === void 0 || text.length === 0) return void 0;
    const sections = text.match(/\bBest\b[\s\S]{0,900}?(?=\bBest\b|\bBilligst\b|\bCheapest\b|\bRaskest\b|\bFastest\b|$)/gi) ?? [];
    for (const section of sections) {
      const normalized = section.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
      if (!/\b(?:Velg|Select)\b/i.test(normalized)) continue;
      if (/\b(?:Annonse|Ad)\b/i.test(normalized)) continue;
      const prices = readMomondoVisibleNokAmounts(normalized);
      const amount = prices[prices.length - 1];
      if (amount !== void 0) return amount;
    }
    return void 0;
  }
  function readCurrentMomondoVisibleBestPriceForCurrentPage() {
    const parsedUrl = parseUrl(window.location.href);
    if (parsedUrl === void 0) return void 0;
    if (!isMomondoFlightSearchPage(parsedUrl) || readMomondoFlightSortMode(parsedUrl.toString()) !== "bestflight_a") return void 0;
    const text = document.body?.innerText;
    if (text === void 0 || text.length === 0) return void 0;
    const sections = text.match(/\bBest\b[\s\S]{0,900}?(?=\bBest\b|\bBilligst\b|\bCheapest\b|\bRaskest\b|\bFastest\b|$)/gi) ?? [];
    for (const section of sections) {
      const normalized = section.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
      if (!/\b(?:Velg|Select)\b/i.test(normalized)) continue;
      if (/\b(?:Annonse|Ad)\b/i.test(normalized)) continue;
      const prices = readMomondoVisibleNokAmounts(normalized);
      const amount = prices[prices.length - 1];
      if (amount !== void 0) return amount;
    }
    return void 0;
  }
  function readCurrentMomondoVisiblePriceKey() {
    return String(readCurrentMomondoVisibleBestPriceForCurrentPage() ?? "");
  }
  function isMomondoFlightSearchPage(parsedUrl) {
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    return hostname === "momondo.no" && MOMONDO_FLIGHT_SEARCH_PATH_PATTERN.test(parsedUrl.pathname);
  }
  function readMomondoVisibleNokAmounts(value) {
    return [...value.matchAll(/\b(?:\d{1,3}(?:[\s.\u00a0]\d{3})+|\d{3,})\s*(?:kr|nok|,-)\b/gi)].map((match) => readNokAmountFromPriceLikeText(match[0])).filter((amount) => amount !== void 0);
  }
  async function findMomondoFlightPriceMatchOffer(flightMeta, routeTitle, searchDetails, airportLookup) {
    const resultUrl = readCurrentMomondoFlightSearchUrl(flightMeta) ?? buildMomondoFlightSearchUrl(flightMeta);
    const searchData = await fetchMomondoFlightSearchData(resultUrl);
    if (searchData === void 0) return void 0;
    const resultData = await pollMomondoFlightResults(searchData, flightMeta, airportLookup);
    if (resultData === void 0) return void 0;
    const candidates = extractMomondoFlightOfferCandidates(resultData, flightMeta, airportLookup, searchData.resultUrl);
    const best = candidates[0];
    if (best === void 0) return void 0;
    const visibleBestPrice = readCurrentMomondoVisibleBestPrice(flightMeta);
    const displayedBest = visibleBestPrice === void 0 ? best : {
      ...best,
      price: formatNokFlightPrice(visibleBestPrice),
      amount: visibleBestPrice,
      sortAmount: visibleBestPrice
    };
    const displayedCandidates = visibleBestPrice === void 0 ? candidates : [displayedBest, ...candidates.slice(1)];
    const searchIncomplete = readStringValue(resultData.status) !== "complete" && resultData.isTopResultsRankingStable !== true;
    return {
      source: "momondo",
      sourceName: "momondo",
      details: searchDetails,
      matchedExactProduct: true,
      shopName: displayedBest.shopName,
      price: displayedBest.price,
      amount: displayedBest.amount,
      sortAmount: displayedBest.sortAmount ?? displayedBest.amount,
      currency: displayedBest.currency,
      productName: routeTitle,
      productUrl: searchData.resultUrl,
      offerUrl: displayedBest.productUrl,
      ...displayedBest.durationText !== void 0 ? { durationText: displayedBest.durationText } : {},
      ...searchIncomplete ? { searchIncomplete: true } : {},
      alternatives: displayedCandidates.map(({ productUrl: _productUrl, ...candidate }) => candidate)
    };
  }
  async function fetchMomondoFlightSearchData(resultUrl) {
    const html = await userscriptTextRequest(resultUrl, {
      headers: { Accept: "text/html" },
      credentials: "include"
    });
    if (html === void 0) return void 0;
    const formToken = parseMomondoFormToken(html);
    if (formToken === void 0) return void 0;
    return {
      formToken,
      resultUrl,
      sortMode: readMomondoFlightSortMode(resultUrl) ?? MOMONDO_DEFAULT_FLIGHT_SORT_MODE
    };
  }
  function parseMomondoFormToken(html) {
    return html.match(/window\.R9\.formToken\s*=\s*'([^']+)'/)?.[1] ?? html.match(/window\.R9\.formToken\s*=\s*"([^"]+)"/)?.[1];
  }
  async function pollMomondoFlightResults(searchData, flightMeta, airportLookup) {
    let latestResult;
    let latestCandidateResult;
    let latestFilteredCandidateResult;
    let searchId;
    let filterState;
    for (let attempt = 0; attempt < MOMONDO_FLIGHT_POLL_ATTEMPTS; attempt++) {
      if (attempt > 0) await sleep(MOMONDO_FLIGHT_POLL_INTERVAL_MS);
      const requestFilterState = filterState;
      const value = await requestMomondoFlightPoll(searchData, flightMeta, airportLookup, searchId, requestFilterState);
      if (!isRecord(value) || !Array.isArray(value.results)) continue;
      latestResult = value;
      searchId = readStringValue(value.searchId) ?? searchId;
      const candidates = extractMomondoFlightOfferCandidates(value, flightMeta, airportLookup, searchData.resultUrl);
      const nextFilterState = filterState ?? buildMomondoExactAirportFilterState(value, flightMeta, airportLookup);
      if (candidates.length > 0) {
        latestCandidateResult = value;
        if (requestFilterState !== void 0 || nextFilterState === void 0) {
          latestFilteredCandidateResult = value;
        }
      }
      if (requestFilterState === void 0 && nextFilterState !== void 0) {
        filterState = nextFilterState;
        continue;
      }
      const status = readStringValue(value.status);
      if (candidates.length > 0 && (value.isTopResultsRankingStable === true || attempt >= 2 || status === "complete" && attempt > 0)) {
        return value;
      }
    }
    return latestFilteredCandidateResult ?? latestCandidateResult ?? latestResult;
  }
  async function requestMomondoFlightPoll(searchData, flightMeta, airportLookup, searchId, filterState) {
    const dynamicResult = await userscriptJsonRequest(MOMONDO_FLIGHT_DYNAMIC_POLL_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-CSRF": searchData.formToken,
        "x-kayak-session-error-check": "iris"
      },
      body: JSON.stringify(buildMomondoFlightDynamicPollPayload(flightMeta, searchId, filterState, searchData.sortMode)),
      credentials: "include"
    });
    if (isRecord(dynamicResult) && Array.isArray(dynamicResult.results)) return dynamicResult;
    return userscriptJsonRequest(MOMONDO_FLIGHT_V2_POLL_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-CSRF": searchData.formToken,
        "x-kayak-session-error-check": "iris"
      },
      body: JSON.stringify(buildMomondoFlightPollPayload(flightMeta, airportLookup, searchId, filterState, searchData.sortMode)),
      credentials: "include"
    });
  }
  function buildMomondoFlightDynamicPollPayload(flightMeta, searchId, filterState, sortMode) {
    return {
      filterParams: filterState !== void 0 ? { fs: filterState } : {},
      userSearchParams: {
        legs: buildMomondoFlightDynamicRequestLegs(flightMeta),
        ...searchId !== void 0 ? { searchId } : {},
        passengers: Array.from({ length: flightMeta.adults }, () => "ADT"),
        passengerDetails: Array.from({ length: flightMeta.adults }, () => ({ ptc: "ADT" })),
        sortMode
      },
      searchMetaData: {
        // Som i v2-payloaden: uten denne svarer API-et med per-person-priser,
        // som ikke kan sammenlignes med FINNs totaler ved flere reisende.
        priceMode: "total",
        pageNumber: 1,
        searchTypes: [],
        ...searchId !== void 0 ? { skipResultsInSecondPhase: false } : {}
      }
    };
  }
  function buildMomondoFlightPollPayload(flightMeta, airportLookup, searchId, filterState, sortMode) {
    return {
      ...filterState !== void 0 ? { filterParams: { fs: filterState } } : {},
      userSearchParams: {
        ...searchId !== void 0 ? { searchId } : {},
        legs: buildMomondoFlightRequestLegs(flightMeta, airportLookup),
        passengers: Array.from({ length: flightMeta.adults }, () => "ADT"),
        pageType: "frontDoor",
        sortMode
      },
      searchMetaData: {
        priceMode: "total",
        searchTypes: [],
        pageNumber: 1,
        pageSize: MOMONDO_FLIGHT_PAGE_SIZE
      }
    };
  }
  function buildMomondoExactAirportFilterState(resultData, flightMeta, airportLookup) {
    const allowedAirports = collectMomondoAllowedAirportFilterCodes(resultData, [flightMeta.origin, flightMeta.destination], airportLookup);
    const excludedAirports = [...collectMomondoAirportFilterCodes(resultData)].filter((airport) => !allowedAirports.has(airport)).sort();
    return excludedAirports.length > 0 ? `airports=-${excludedAirports.join(",")}` : void 0;
  }
  function collectMomondoAllowedAirportFilterCodes(resultData, requestedCodes, airportLookup) {
    const requestedAirports = new Set(requestedCodes.flatMap((code) => [...collectEquivalentFlightAirportCodes(code, airportLookup)]));
    const allowedAirports = new Set(requestedAirports);
    for (const group of collectMomondoAirportFilterGroups(resultData)) {
      const groupAirports = readRecordArray(isRecord(group.filterData) ? group.filterData.items : void 0).map((item) => readIataCodeValue(item.id)).filter((airport) => airport !== void 0);
      if (groupAirports.some((airport) => requestedAirports.has(airport))) {
        for (const airport of groupAirports) allowedAirports.add(airport);
      }
    }
    return allowedAirports;
  }
  function collectMomondoAirportFilterGroups(resultData) {
    const filterData = isRecord(resultData.filterData) ? resultData.filterData : void 0;
    const airportsFilter = isRecord(filterData?.airports) ? filterData.airports : void 0;
    const groups = [];
    collectMomondoAirportFilterGroupsFromNode(airportsFilter, groups);
    return groups;
  }
  function collectMomondoAirportFilterGroupsFromNode(value, groups) {
    if (!isRecord(value)) return;
    const items = readRecordArray(isRecord(value.filterData) ? value.filterData.items : void 0);
    if (items.some((item) => readIataCodeValue(item.id) !== void 0)) groups.push(value);
    const nestedFilterData = isRecord(value.filterData) ? value.filterData : void 0;
    collectMomondoAirportFilterGroupsFromNode(nestedFilterData, groups);
    for (const child of readRecordArray(value.items)) {
      collectMomondoAirportFilterGroupsFromNode(child, groups);
    }
    for (const child of readRecordArray(value.filterGroups)) {
      collectMomondoAirportFilterGroupsFromNode(child, groups);
    }
  }
  function collectMomondoAirportFilterCodes(resultData) {
    const codes = /* @__PURE__ */ new Set();
    const filterData = isRecord(resultData.filterData) ? resultData.filterData : void 0;
    const airportsFilter = isRecord(filterData?.airports) ? filterData.airports : void 0;
    collectMomondoAirportFilterCodesFromNode(airportsFilter, codes);
    return codes;
  }
  function collectMomondoAirportFilterCodesFromNode(value, codes) {
    if (!isRecord(value)) return;
    const code = readIataCodeValue(value.id);
    if (code !== void 0) codes.add(code);
    const nestedFilterData = isRecord(value.filterData) ? value.filterData : void 0;
    collectMomondoAirportFilterCodesFromNode(nestedFilterData, codes);
    for (const child of readRecordArray(value.items)) {
      collectMomondoAirportFilterCodesFromNode(child, codes);
    }
    for (const child of readRecordArray(value.filterGroups)) {
      collectMomondoAirportFilterCodesFromNode(child, codes);
    }
  }
  function buildMomondoFlightRequestLegs(flightMeta, airportLookup) {
    const legs = [
      buildMomondoFlightRequestLeg(flightMeta.origin, flightMeta.destination, flightMeta.outboundDate, airportLookup, flightMeta.cabinClass)
    ];
    if (flightMeta.inboundDate !== void 0) {
      legs.push(buildMomondoFlightRequestLeg(flightMeta.destination, flightMeta.origin, flightMeta.inboundDate, airportLookup, flightMeta.cabinClass));
    }
    return legs;
  }
  function buildMomondoFlightDynamicRequestLegs(flightMeta) {
    const legs = [
      buildMomondoFlightDynamicRequestLeg(flightMeta.origin, flightMeta.destination, flightMeta.outboundDate, flightMeta.cabinClass)
    ];
    if (flightMeta.inboundDate !== void 0) {
      legs.push(buildMomondoFlightDynamicRequestLeg(flightMeta.destination, flightMeta.origin, flightMeta.inboundDate, flightMeta.cabinClass));
    }
    return legs;
  }
  function buildMomondoFlightRequestLeg(origin, destination, date, airportLookup, cabinClass) {
    return {
      origin: buildMomondoFlightRequestPlace(origin, airportLookup),
      destination: buildMomondoFlightRequestPlace(destination, airportLookup),
      date,
      flex: "exact",
      cabinClass: cabinClass ?? "economy"
    };
  }
  function buildMomondoFlightDynamicRequestLeg(origin, destination, date, cabinClass) {
    return {
      origin: buildMomondoFlightDynamicRequestPlace(origin),
      destination: buildMomondoFlightDynamicRequestPlace(destination),
      date,
      flex: "exact",
      // Dynamic-API-et bruker economy implisitt; feltet sendes kun når noe annet er valgt.
      ...cabinClass !== void 0 && cabinClass !== "economy" ? { cabinClass } : {}
    };
  }
  function buildMomondoFlightRequestPlace(code, airportLookup) {
    return { locationType: "airports", airports: listFlightRequestAirportCodes(code, airportLookup) };
  }
  function buildMomondoFlightDynamicRequestPlace(code) {
    return { locationType: "airports", airports: [code.toUpperCase()] };
  }
  function extractMomondoFlightOfferCandidates(resultData, flightMeta, airportLookup, fallbackUrl) {
    const strictCandidates = collectMomondoFlightOfferCandidates(resultData, flightMeta, airportLookup, fallbackUrl, true);
    if (strictCandidates.length > 0) {
      return dedupeMomondoFlightOfferCandidates(strictCandidates).slice(0, FLIGHT_OFFER_CANDIDATE_LIMIT);
    }
    return dedupeMomondoFlightOfferCandidates(
      collectMomondoFlightOfferCandidates(resultData, flightMeta, airportLookup, fallbackUrl, false)
    ).slice(0, FLIGHT_OFFER_CANDIDATE_LIMIT);
  }
  function collectMomondoFlightOfferCandidates(resultData, flightMeta, airportLookup, fallbackUrl, requireMatchingSearch) {
    const candidates = [];
    for (const result of readRecordArray(resultData.results)) {
      if (requireMatchingSearch && !isMomondoFlightMatchingSearch(result, resultData, flightMeta, airportLookup)) continue;
      if (isMomondoFlightPoorItinerary(result)) continue;
      const legSummaries = readMomondoFlightLegSummaries(result, resultData);
      if (exceedsFlightMaxStops(flightMeta, legSummaries.map((leg) => leg.stopCount))) continue;
      const tripSummary = formatMomondoFlightTripSummary(result, resultData);
      const durationText = formatFlightLegDurationsWithStopsText(legSummaries);
      const productUrl = readMomondoResultUrl(result.shareableUrl, fallbackUrl);
      const bookingOptions = readRecordArray(result.bookingOptions).filter(isMomondoBookingOptionAvailable).filter((bookingOption) => isMomondoBookingOptionMatchingBaggage(bookingOption, flightMeta));
      const useDisplayPrices = bookingOptions.some((bookingOption) => {
        return readMomondoBookingOptionDisplayAmount(bookingOption) !== void 0;
      });
      for (const bookingOption of bookingOptions) {
        const amount = useDisplayPrices ? readMomondoBookingOptionDisplayAmount(bookingOption) : readMomondoBookingOptionAmount(bookingOption);
        if (amount === void 0) continue;
        const currency = (useDisplayPrices ? readMomondoBookingOptionDisplayCurrency(bookingOption) : readMomondoBookingOptionCurrency(bookingOption)) ?? "NOK";
        const luggageSummary = formatMomondoFlightLuggageSummary(bookingOption);
        const platform = [tripSummary, luggageSummary].filter((part) => part !== void 0 && part.length > 0).join(", ");
        candidates.push({
          shopName: readMomondoProviderName(bookingOption, resultData) ?? "momondo",
          price: formatFlightPrice(amount, currency),
          amount,
          sortAmount: amount,
          currency,
          productUrl,
          ...durationText !== void 0 ? { durationText } : {},
          ...platform.length > 0 ? { platform } : {}
        });
        break;
      }
    }
    return candidates;
  }
  function isMomondoFlightPoorItinerary(result) {
    if (readStringValue(result.type)?.toLowerCase() === "fsr") return true;
    if (result.hasHackerFares === true) return true;
    if (result.hasSelfTransfer === true || hasMomondoSelfTransferWarning(result.warnings)) return true;
    return readRecordArray(result.legs).some(hasMomondoSelfTransferLeg) || readRecordArray(result.legFarings).some(hasMomondoSelfTransferLegFaring) || readRecordArray(result.bookingOptions).some(hasMomondoSelfTransferBookingOption);
  }
  function hasMomondoSelfTransferWarning(value) {
    const warnings = Array.isArray(value) ? value : [];
    return warnings.some((warning) => {
      return typeof warning === "string" && /self[_\s-]*transfer/i.test(warning);
    });
  }
  function hasMomondoSelfTransferLeg(leg) {
    if (leg.hasSelfTransfer === true) return true;
    return readRecordArray(leg.segments).some((segmentRef) => {
      return segmentRef.hasSelfTransfer === true || segmentRef.isSelfTransfer === true || hasMomondoSelfTransferWarning(segmentRef.warnings);
    });
  }
  function hasMomondoSelfTransferLegFaring(legFaring) {
    if (legFaring.isSelfTransfer === true || legFaring.hasSelfTransfer === true) return true;
    return readRecordArray(legFaring.segmentFarings).some((segmentFaring) => {
      return segmentFaring.isSelfTransfer === true || segmentFaring.hasSelfTransfer === true;
    });
  }
  function hasMomondoSelfTransferBookingOption(bookingOption) {
    if (bookingOption.isSelfTransfer === true || bookingOption.hasSelfTransfer === true) return true;
    const flags = isRecord(bookingOption.flags) ? bookingOption.flags : void 0;
    return flags?.hasVirtualInterline === true || flags?.isVirtualInterline === true || flags?.isSelfTransfer === true || flags?.hasSelfTransfer === true || flags?.isSelfTransferProtection === true;
  }
  function dedupeMomondoFlightOfferCandidates(candidates) {
    const seen = /* @__PURE__ */ new Set();
    const uniqueCandidates = [];
    for (const candidate of candidates) {
      const key = [
        candidate.shopName,
        Math.round(candidate.amount),
        candidate.platform ?? ""
      ].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueCandidates.push(candidate);
    }
    return uniqueCandidates;
  }
  function isMomondoBookingOptionAvailable(bookingOption) {
    if (bookingOption.hidden === true || bookingOption.isHidden === true || bookingOption.disabled === true || bookingOption.isDisabled === true || bookingOption.unavailable === true || bookingOption.isUnavailable === true || bookingOption.available === false || bookingOption.isAvailable === false || bookingOption.visible === false || bookingOption.isVisible === false) {
      return false;
    }
    return [
      bookingOption.status,
      bookingOption.state,
      bookingOption.bookingState,
      bookingOption.availabilityStatus,
      bookingOption.displayStatus
    ].every((value) => {
      const normalized = readStringValue(value)?.toLowerCase();
      return normalized === void 0 || !/unavailable|hidden|expired|sold[_\s-]?out|stale|invalid|failed|removed/.test(normalized);
    });
  }
  function readMomondoBookingOptionDisplayAmount(bookingOption) {
    const displayPrice = isRecord(bookingOption.displayPrice) ? bookingOption.displayPrice : void 0;
    return readPositiveNumberValue(displayPrice?.price);
  }
  function readMomondoBookingOptionDisplayCurrency(bookingOption) {
    const displayPrice = isRecord(bookingOption.displayPrice) ? bookingOption.displayPrice : void 0;
    return readStringValue(displayPrice?.currency);
  }
  function readMomondoBookingOptionAmount(bookingOption) {
    const fees = isRecord(bookingOption.fees) ? bookingOption.fees : void 0;
    const totalPrice = isRecord(fees?.totalPrice) ? fees.totalPrice : void 0;
    return readMomondoBookingOptionDisplayAmount(bookingOption) ?? readPositiveNumberValue(totalPrice?.price) ?? readPositiveNumberValue(bookingOption.price);
  }
  function readMomondoBookingOptionCurrency(bookingOption) {
    const fees = isRecord(bookingOption.fees) ? bookingOption.fees : void 0;
    const totalPrice = isRecord(fees?.totalPrice) ? fees.totalPrice : void 0;
    return readMomondoBookingOptionDisplayCurrency(bookingOption) ?? readStringValue(totalPrice?.currency) ?? readStringValue(bookingOption.currency);
  }
  function readMomondoProviderName(bookingOption, resultData) {
    const providerCode = readStringValue(bookingOption.providerCode);
    const providers = isRecord(resultData.providers) ? resultData.providers : void 0;
    const provider = providerCode !== void 0 && isRecord(providers?.[providerCode]) ? providers[providerCode] : void 0;
    return readStringValue(provider?.displayName) ?? readStringValue(bookingOption.providerName) ?? providerCode;
  }
  function readMomondoResultUrl(value, fallbackUrl) {
    const url = readStringValue(value);
    if (url === void 0) return fallbackUrl;
    return parseUrlWithBase(url, "https://www.momondo.no/")?.toString() ?? fallbackUrl;
  }
  function isMomondoFlightMatchingSearch(result, resultData, flightMeta, airportLookup) {
    const legs = readMomondoFlightLegSummaries(result, resultData);
    const outboundLeg = legs[0];
    if (outboundLeg === void 0 || !isMomondoFlightLegMatch(outboundLeg, flightMeta.origin, flightMeta.destination, resultData, airportLookup, flightMeta.outboundDate)) {
      return false;
    }
    if (flightMeta.inboundDate === void 0) return true;
    const inboundLeg = legs[1];
    return inboundLeg !== void 0 && isMomondoFlightLegMatch(inboundLeg, flightMeta.destination, flightMeta.origin, resultData, airportLookup, flightMeta.inboundDate);
  }
  function isMomondoFlightLegMatch(leg, origin, destination, resultData, airportLookup, date) {
    return isMomondoAirportMatchingSearch(leg.origin, origin, resultData, airportLookup) && isMomondoAirportMatchingSearch(leg.destination, destination, resultData, airportLookup) && leg.departureDate === date;
  }
  function isMomondoAirportMatchingSearch(airport, requestedAirport, resultData, airportLookup) {
    if (airport === requestedAirport) return true;
    return collectMomondoAllowedAirportFilterCodes(resultData, [requestedAirport], airportLookup).has(airport);
  }
  function readMomondoFlightLegSummaries(result, resultData) {
    const segmentsById = isRecord(resultData.segments) ? resultData.segments : {};
    return readRecordArray(result.legs).map((leg) => {
      const segments = readRecordArray(leg.segments).map((segmentRef) => readStringValue(segmentRef.id)).map((segmentId) => segmentId !== void 0 && isRecord(segmentsById[segmentId]) ? segmentsById[segmentId] : void 0).filter((segment) => segment !== void 0);
      const firstSegment = segments[0];
      const lastSegment = segments[segments.length - 1];
      const origin = readStringValue(firstSegment?.origin)?.toUpperCase();
      const destination = readStringValue(lastSegment?.destination)?.toUpperCase();
      if (origin === void 0 || destination === void 0) return void 0;
      const durationMinutes = segments.reduce((total, segment) => total + (readNumberValue(segment.duration) ?? 0), 0);
      const departureDate = readStringValue(firstSegment?.departure)?.slice(0, 10);
      const departureTime = readStringValue(firstSegment?.departure);
      const arrivalTime = readStringValue(lastSegment?.arrival);
      return {
        origin,
        destination,
        ...departureDate !== void 0 ? { departureDate } : {},
        ...departureTime !== void 0 ? { departureTime } : {},
        ...arrivalTime !== void 0 ? { arrivalTime } : {},
        ...durationMinutes > 0 ? { durationMinutes } : {},
        stopCount: Math.max(0, segments.length - 1),
        carrierCodes: segments.map((segment) => readStringValue(segment.airline)?.toUpperCase()).filter((carrier) => carrier !== void 0)
      };
    }).filter((summary) => summary !== void 0);
  }
  function formatMomondoFlightTripSummary(result, resultData) {
    const legs = readMomondoFlightLegSummaries(result, resultData);
    const parts = [
      formatFlightCarriersByLeg(legs.map((leg) => collectMomondoFlightLegCarrierNames(leg, resultData))),
      formatMomondoFlightStops(legs),
      formatMomondoFlightTimeSummary(legs)
    ].filter((part) => part !== void 0 && part.length > 0);
    return parts.length > 0 ? parts.join(", ") : void 0;
  }
  function collectMomondoFlightLegCarrierNames(leg, resultData) {
    const airlines = isRecord(resultData.airlines) ? resultData.airlines : {};
    return leg.carrierCodes.map((carrierCode) => {
      const airline = isRecord(airlines[carrierCode]) ? airlines[carrierCode] : void 0;
      return readStringValue(airline?.name) ?? carrierCode;
    });
  }
  function formatMomondoFlightStops(legs) {
    if (legs.length === 0) return void 0;
    if (legs.every((leg) => leg.stopCount === 0)) return "direkte";
    return legs.map((leg) => leg.stopCount === 0 ? "direkte" : `${leg.stopCount} stopp`).join(" / ");
  }
  function formatMomondoFlightTimeSummary(legs) {
    const ranges = legs.map((leg) => {
      const departureClock = formatMomondoFlightClock(leg.departureTime);
      const arrivalClock = formatMomondoFlightClock(leg.arrivalTime);
      return departureClock !== void 0 && arrivalClock !== void 0 ? `${departureClock}-${arrivalClock}` : void 0;
    }).filter((range) => range !== void 0);
    return ranges.length > 0 ? ranges.join(" / ") : void 0;
  }
  function formatMomondoFlightClock(value) {
    return value?.match(/T(\d{2}):(\d{2})/)?.slice(1, 3).join(":");
  }
  function isMomondoBookingOptionMatchingBaggage(bookingOption, flightMeta) {
    if (flightMeta.includeCabinBag !== true && flightMeta.includeCheckedBag !== true) return true;
    const fees = isRecord(bookingOption.fees) ? bookingOption.fees : void 0;
    const isExcluded = (value) => {
      return value !== void 0 && /ikke\s+inkl|not\s+included/i.test(value.replace(/<[^>]*>/g, " "));
    };
    if (flightMeta.includeCabinBag === true && isExcluded(readStringValue(fees?.carryOnDisplay))) return false;
    if (flightMeta.includeCheckedBag === true && isExcluded(readStringValue(fees?.checkedBagDisplay))) return false;
    return true;
  }
  function formatMomondoFlightLuggageSummary(bookingOption) {
    const fees = isRecord(bookingOption.fees) ? bookingOption.fees : void 0;
    const carryOn = formatMomondoLuggageValue(readStringValue(fees?.carryOnDisplay));
    const checked = formatMomondoLuggageValue(readStringValue(fees?.checkedBagDisplay));
    const parts = [
      carryOn !== void 0 ? `håndbagasje ${carryOn}` : void 0,
      checked !== void 0 ? `innsjekket ${checked}` : void 0
    ].filter((part) => part !== void 0);
    return parts.length > 0 ? parts.join(", ") : void 0;
  }
  function formatMomondoLuggageValue(value) {
    if (value === void 0) return void 0;
    const cleaned = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (/^inkludert$/i.test(cleaned)) return "inkl.";
    if (/^ukjent$/i.test(cleaned)) return "ukjent";
    if (/ikke\s+inkludert|ikke\s+inkl/i.test(cleaned)) return "ikke inkl.";
    return cleaned;
  }
  function formatFlightPrice(amount, currency) {
    const formattedAmount = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(amount);
    return currency.toUpperCase() === "NOK" ? `${formattedAmount} kr` : `${formattedAmount} ${currency.toUpperCase()}`;
  }
  function readIataCodeParam(parsedUrl, key) {
    return readIataCodeValue(parsedUrl.searchParams.get(key));
  }
  function readIsoDateParam(parsedUrl, key) {
    return readIsoDateValue(parsedUrl.searchParams.get(key));
  }
  function readIataCodeValue(value) {
    if (typeof value !== "string") return void 0;
    const trimmed = value.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(trimmed)) return trimmed;
    return trimmed.match(/\b[A-Z]{3}\b/)?.[0];
  }
  function readIsoDateValue(value) {
    if (typeof value !== "string") return void 0;
    const dateMatch = value.trim().match(/\b(\d{4}-\d{2}-\d{2})\b/);
    const parsedValue = dateMatch?.[1];
    if (parsedValue === void 0) return void 0;
    const parsedDate = /* @__PURE__ */ new Date(`${parsedValue}T00:00:00Z`);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== parsedValue) {
      return void 0;
    }
    return parsedValue;
  }
  function readDottedIsoDateValue(value) {
    if (typeof value !== "string") return void 0;
    const dateMatch = value.trim().match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/);
    if (dateMatch === null) return void 0;
    const [, day, month, year] = dateMatch;
    return readIsoDateValue(`${year}-${month}-${day}`);
  }
  function readCompactIsoDateValue(value) {
    if (typeof value !== "string" || !/^\d{8}$/.test(value)) return void 0;
    return readIsoDateValue(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`);
  }
  function readIataCodeFromValues(values) {
    for (const value of values) {
      const code = readIataCodeFromValue(value);
      if (code !== void 0) return code;
    }
    return void 0;
  }
  function readIataCodeFromValue(value) {
    const directValue = readIataCodeValue(value);
    if (directValue !== void 0) return directValue;
    if (Array.isArray(value)) {
      for (const item of value) {
        const code = readIataCodeFromValue(item);
        if (code !== void 0) return code;
      }
    }
    if (isRecord(value)) {
      return readIataCodeFromRecord(value, ["iata", "iataCode", "code", "airportCode", "stationCode"]);
    }
    return void 0;
  }
  function readIataCodeFromRecord(record, keys) {
    return readIataCodeFromValues(keys.map((key) => readRecordValueCaseInsensitive(record, key)));
  }
  function readIsoDateFromValues(values) {
    for (const value of values) {
      const date = readIsoDateFromValue(value);
      if (date !== void 0) return date;
    }
    return void 0;
  }
  function readIsoDateFromValue(value) {
    const directValue = readIsoDateValue(value);
    if (directValue !== void 0) return directValue;
    const dottedValue = readDottedIsoDateValue(value);
    if (dottedValue !== void 0) return dottedValue;
    if (Array.isArray(value)) {
      for (const item of value) {
        const date = readIsoDateFromValue(item);
        if (date !== void 0) return date;
      }
    }
    if (isRecord(value)) {
      return readIsoDateFromRecord(value, ["date", "dateTime", "localDate", "value"]);
    }
    return void 0;
  }
  function readIsoDateFromRecord(record, keys) {
    return readIsoDateFromValues(keys.map((key) => readRecordValueCaseInsensitive(record, key)));
  }
  function readPositiveIntegerFromRecord(record, keys) {
    for (const key of keys) {
      const value = readPositiveIntegerValue(readRecordValueCaseInsensitive(record, key));
      if (value !== void 0) return value;
    }
    return void 0;
  }
  function readNonNegativeIntegerFromRecord(record, keys) {
    for (const key of keys) {
      const value = readNonNegativeIntegerValue(readRecordValueCaseInsensitive(record, key));
      if (value !== void 0) return value;
    }
    return void 0;
  }
  function readPositiveIntegerValue(value) {
    const parsedValue = readNonNegativeIntegerValue(value);
    return parsedValue !== void 0 && parsedValue > 0 ? parsedValue : void 0;
  }
  function readNonNegativeIntegerValue(value) {
    const parsedValue = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
    return Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : void 0;
  }
  function readRecordValueCaseInsensitive(record, key) {
    if (key in record) return record[key];
    const lowerKey = key.toLowerCase();
    return Object.entries(record).find(([entryKey]) => entryKey.toLowerCase() === lowerKey)?.[1];
  }
  function parseJsonValue(value) {
    try {
      return JSON.parse(value);
    } catch {
      return void 0;
    }
  }
  function readNonNegativeIntegerParam(parsedUrl, key, fallback) {
    const value = parsedUrl.searchParams.get(key);
    if (value === null) return fallback;
    const parsedValue = Number.parseInt(value, 10);
    return Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : fallback;
  }
  function splitIsoDateParts(value) {
    return {
      year: value.slice(0, 4),
      month: value.slice(5, 7),
      day: value.slice(8, 10)
    };
  }
  function readPositiveNumberValue(value) {
    const numberValue = readNumberValue(value);
    return numberValue !== void 0 && numberValue > 0 ? numberValue : void 0;
  }
  function compactIsoDate(value) {
    return value.replace(/-/g, "");
  }
  function comparePriceMatchesBySortAmount(left, right) {
    return (left.sortAmount ?? left.amount) - (right.sortAmount ?? right.amount);
  }
  function readRecordArray(value) {
    return Array.isArray(value) ? value.filter(isRecord) : [];
  }
  function readRecordValues(value) {
    if (Array.isArray(value)) return value.filter(isRecord);
    return isRecord(value) ? Object.values(value).filter(isRecord) : [];
  }
  function formatNokFlightPrice(amount) {
    return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(amount)} kr`;
  }
  function formatApproxNokFlightPrice(amount) {
    return `~${formatNokFlightPrice(amount)}`;
  }
  function formatCompactFlightDuration(minutes) {
    if (minutes === void 0 || !Number.isFinite(minutes) || minutes <= 0) return void 0;
    const totalMinutes = Math.round(minutes);
    const hours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;
    if (hours <= 0) return `${remainingMinutes}m`;
    return remainingMinutes === 0 ? `${hours}t` : `${hours}t ${remainingMinutes}m`;
  }
  function formatFlightLegDurationsText(durationsMinutes) {
    if (durationsMinutes.length === 0) return void 0;
    const parts = durationsMinutes.map(formatCompactFlightDuration);
    if (parts.some((part) => part === void 0)) return void 0;
    return parts.join("/");
  }
  function formatFlightLegDurationsWithStopsText(legs) {
    const durationsText = formatFlightLegDurationsText(legs.map((leg) => leg.durationMinutes));
    if (durationsText === void 0) return void 0;
    const stopCounts = legs.map((leg) => leg.stopCount);
    if (stopCounts.some((stopCount) => stopCount === void 0)) return durationsText;
    const stopsText = stopCounts.every((stopCount) => stopCount === 0) ? "direkte" : `${stopCounts.join("/")} stopp`;
    return `${durationsText} · ${stopsText}`;
  }
  function exceedsFlightMaxStops(flightMeta, stopCounts) {
    if (flightMeta.maxStops === void 0) return false;
    const maxStops = flightMeta.maxStops;
    return stopCounts.some((stopCount) => stopCount !== void 0 && stopCount > maxStops);
  }
  function hasFlightSearchResultFilters(flightMeta) {
    return flightMeta.maxStops !== void 0 || flightMeta.includeCabinBag === true || flightMeta.includeCheckedBag === true || flightMeta.cabinClass !== void 0 && flightMeta.cabinClass !== "economy";
  }
  function formatFlightCarriersByLeg(carriersPerLeg) {
    const legTexts = carriersPerLeg.map((carriers) => uniqueStrings(carriers).join("+")).filter((text) => text.length > 0);
    if (legTexts.length === 0) return void 0;
    const uniqueLegTexts = uniqueStrings(legTexts);
    return uniqueLegTexts.length === 1 ? uniqueLegTexts[0] : legTexts.join(" / ");
  }
  function formatFinnFlightTripSummary(trip) {
    const legs = readRecordArray(trip.legs);
    return [
      formatFlightCarriersByLeg(legs.map(collectFinnFlightLegCarrierNames)),
      formatFinnFlightStops(legs),
      formatFinnFlightTimeSummary(legs)
    ].filter((part) => part !== void 0 && part.length > 0).join(", ");
  }
  function collectFinnFlightLegCarrierNames(leg) {
    return readRecordArray(leg.segments).map((segment) => readStringValue(segment.marketingCarrierName) ?? readStringValue(segment.marketingCarrier)).filter((carrier) => carrier !== void 0);
  }
  function readFinnFlightLegStopCount(leg) {
    const declaredStops = readNumberValue(leg.numberOfStops);
    if (declaredStops !== void 0) return Math.max(0, Math.trunc(declaredStops));
    return Math.max(0, readRecordArray(leg.segments).length - 1);
  }
  function formatFinnFlightStops(legs) {
    if (legs.length === 0) return void 0;
    const stops = legs.map((leg) => {
      return readFinnFlightLegStopCount(leg);
    });
    if (stops.every((stopCount) => stopCount === 0)) return "direkte";
    return stops.map((stopCount) => stopCount === 0 ? "direkte" : `${stopCount} stopp`).join(" / ");
  }
  function formatFinnFlightTimeSummary(legs) {
    const ranges = legs.map(formatFinnFlightLegTimeRange).filter((range) => range !== void 0);
    return ranges.length > 0 ? ranges.join(" / ") : void 0;
  }
  function formatFinnFlightLegTimeRange(leg) {
    const firstSegment = readRecordArray(leg.segments)[0];
    const departureTime = readStringValue(leg.legDepartureTime) ?? readStringValue(firstSegment?.departureTime);
    const arrivalTime = readStringValue(leg.legArrivalTime) ?? readStringValue(firstSegment?.arrivalTime);
    const departureClock = formatFinnFlightClock(departureTime);
    const arrivalClock = formatFinnFlightClock(arrivalTime);
    return departureClock !== void 0 && arrivalClock !== void 0 ? `${departureClock}-${arrivalClock}` : void 0;
  }
  function formatFinnFlightClock(value) {
    return value?.match(/T(\d{2}):(\d{2})/)?.slice(1, 3).join(":");
  }
  function formatFinnFlightLuggageSummary(offer) {
    const handLuggage = formatFinnFlightLuggageValue(readStringValue(offer.handLuggage));
    const checkedLuggage = formatFinnFlightLuggageValue(readStringValue(offer.checkedLuggage));
    const parts = [
      handLuggage !== void 0 ? `håndbagasje ${handLuggage}` : void 0,
      checkedLuggage !== void 0 ? `innsjekket ${checkedLuggage}` : void 0
    ].filter((part) => part !== void 0);
    return parts.length > 0 ? parts.join(", ") : void 0;
  }
  function formatFinnFlightLuggageValue(value) {
    if (value === void 0) return void 0;
    if (value === "included") return "inkl.";
    if (value === "not_included") return "ikke inkl.";
    if (value === "unknown") return "ukjent";
    return value.replace(/_/g, " ");
  }
  function formatFlightDateRange(flightMeta) {
    if (flightMeta.inboundDate === void 0) {
      return formatFlightDate(flightMeta.outboundDate);
    }
    return `${formatFlightDate(flightMeta.outboundDate)} - ${formatFlightDate(flightMeta.inboundDate)}`;
  }
  function formatFlightDate(value) {
    const date = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("nb-NO", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC"
    }).format(date);
  }
  function formatFlightPassengerText(flightMeta) {
    return flightMeta.adults === 1 ? "1 voksen" : `${flightMeta.adults} voksne`;
  }
  function formatFlightCabinClassText(flightMeta) {
    switch (flightMeta.cabinClass) {
      case "premium":
        return "Premium Economy";
      case "business":
        return "Business";
      case "first":
        return "First Class";
      default:
        return void 0;
    }
  }
  function formatFlightStopsFilterText(flightMeta) {
    if (flightMeta.maxStops === void 0) return void 0;
    return flightMeta.maxStops === 0 ? "kun direkte" : `maks ${flightMeta.maxStops} stopp`;
  }
  function formatFlightBaggageFilterText(flightMeta) {
    const parts = [
      flightMeta.includeCabinBag === true ? "håndbagasje" : void 0,
      flightMeta.includeCheckedBag === true ? "innsjekket bagasje" : void 0
    ].filter((part) => part !== void 0);
    return parts.length > 0 ? `m/${parts.join(" + ")}` : void 0;
  }
  function formatFlightSearchFilterDetails(flightMeta) {
    return [
      formatFlightCabinClassText(flightMeta),
      formatFlightStopsFilterText(flightMeta),
      formatFlightBaggageFilterText(flightMeta)
    ].filter((part) => part !== void 0);
  }
  function formatFlightCardSearchDetails(flightMeta) {
    const tripType = flightMeta.inboundDate === void 0 ? "En vei" : "Tur/retur";
    return [tripType, formatFlightPassengerText(flightMeta), ...formatFlightSearchFilterDetails(flightMeta)].join(", ");
  }
  function buildFlightSearchMetaKey(flightMeta) {
    return [
      flightMeta.origin,
      flightMeta.destination,
      flightMeta.outboundDate,
      flightMeta.inboundDate ?? "",
      flightMeta.adults,
      flightMeta.youths,
      flightMeta.children,
      flightMeta.infants,
      flightMeta.cabinClass ?? "",
      flightMeta.maxStops ?? "",
      flightMeta.includeCabinBag === true ? "hb" : "",
      flightMeta.includeCheckedBag === true ? "cb" : ""
    ].join("|");
  }
  async function getRegionPricesForCurrentPage() {
    const currentUrl = window.location.href;
    const regionPriceLookupUrl = getRegionPriceLookupUrlForCurrentPage(currentUrl);
    if (regionPriceLookupUrl === void 0) {
      return void 0;
    }
    const message = {
      type: "get-playstation-region-prices",
      url: regionPriceLookupUrl
    };
    if (isUserscriptRuntime()) {
      if (isPlayStationProductUrl(regionPriceLookupUrl)) {
        return findPlayStationRegionPrices(
          regionPriceLookupUrl,
          (url) => userscriptTextRequest(url),
          (url) => userscriptJsonRequest(url)
        );
      }
      return findAppStorePriceRegionPricesForUrl(
        regionPriceLookupUrl,
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
  function getRegionPriceLookupUrlForCurrentPage(currentUrl) {
    if (isPlayStationProductUrl(currentUrl) || isAppStorePriceRegionPriceUrl(currentUrl)) {
      return currentUrl;
    }
    const appleAppStoreUrl = extractAppleAppStoreUrlFromCurrentDocument();
    if (appleAppStoreUrl !== void 0) {
      return appleAppStoreUrl;
    }
    return isPotentialAppStorePriceRegionPriceUrl(currentUrl) ? currentUrl : void 0;
  }
  function extractAppleAppStoreUrlFromCurrentDocument() {
    const smartBannerAppId = document.querySelector('meta[name="apple-itunes-app"]')?.content.match(/(?:^|,\s*)app-id=(\d+)/i)?.[1];
    if (smartBannerAppId !== void 0) {
      const smartBannerUrl = `https://apps.apple.com/app/id${smartBannerAppId}`;
      if (isAppStorePriceRegionPriceUrl(smartBannerUrl)) {
        return smartBannerUrl;
      }
    }
    const metaContentCandidates = [
      ...Array.from(document.querySelectorAll("meta[property='og:url'], meta[name='twitter:app:url:iphone'], meta[name='twitter:app:url:ipad']")).map((element) => element.content),
      ...Array.from(document.querySelectorAll("link[rel='canonical'], link[rel='alternate']")).map((element) => element.href)
    ];
    const metaUrl = metaContentCandidates.find(isAppStorePriceRegionPriceUrl);
    if (metaUrl !== void 0) {
      return metaUrl;
    }
    return Array.from(document.querySelectorAll("a[href]")).map((element) => element.href).find(isAppStorePriceRegionPriceUrl);
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
          timeout: init?.timeoutMs ?? 15e3,
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
    if (!isUserscriptRuntime()) {
      const response = await sendRuntimeMessage({
        type: "http-request",
        url,
        responseType: "json",
        ...init
      });
      return isHttpRequestJsonResponse(response) ? response.value : void 0;
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
          timeout: init?.timeoutMs ?? 15e3,
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
    if (!isUserscriptRuntime()) {
      const response = await sendRuntimeMessage({
        type: "http-request",
        url,
        responseType: "text",
        ...init
      });
      return isHttpRequestTextResponse(response) ? response.text : void 0;
    }
    try {
      const response = await fetch(url, init);
      if (!response.ok) return void 0;
      return response.text();
    } catch {
      return void 0;
    }
  }
  function isHttpRequestJsonResponse(value) {
    return isRecord(value) && value.ok === true && value.responseType === "json";
  }
  function isHttpRequestTextResponse(value) {
    return isRecord(value) && value.ok === true && value.responseType === "text" && typeof value.text === "string";
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
  function extractGoogleShoppingSearchMeta(parsedUrl) {
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    const isGoogleHost = hostname === "google.com" || hostname.startsWith("google.") || hostname.endsWith(".google.com");
    if (!isGoogleHost || !/^\/search\/?$/i.test(parsedUrl.pathname)) return void 0;
    if (parsedUrl.searchParams.get("udm") !== "28" && parsedUrl.searchParams.get("tbm") !== "shop") return void 0;
    const query = parsedUrl.searchParams.get("q")?.trim().replace(/\s+/g, " ");
    if (query === void 0 || query.length < 8 || query.split(" ").length < 2) return void 0;
    return {
      url: window.location.href,
      searchTerm: query,
      productPageClue: true,
      organizationName: "Google Shopping"
    };
  }
  function extractProductPageMeta() {
    const parsedUrl = parseUrl(window.location.href);
    if (parsedUrl === void 0 || parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return void 0;
    }
    const googleShoppingMeta = extractGoogleShoppingSearchMeta(parsedUrl);
    if (googleShoppingMeta !== void 0) return googleShoppingMeta;
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
    const codes = uniqueStrings([
      ...collectProductCodes(productLdJson),
      ...collectProductCodesFromSpecificationRows(),
      ...collectProductCodesFromUrl(parsedUrl)
    ]);
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
    if (hasStrongProductishPath(parsedUrl)) return false;
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
    if (hostname.endsWith("kassal.app")) {
      return /^\/vare\/[^/]+\/?$/.test(pathname);
    }
    if (isItadGameStoreProductUrl(parsedUrl.toString())) {
      return true;
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
    return extractFlightSearchMeta(parsedUrl) !== void 0 || isVinmonopoletProductPage(parsedUrl) || isTaxfreeProductPage(parsedUrl) || isEpicGamesStoreProductUrl(parsedUrl.toString()) || isSteamAppProductUrl(parsedUrl.toString()) || isMicrosoftStoreProductUrl(parsedUrl.toString());
  }
  function isDynamicPriceMatchHost(parsedUrl) {
    const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    return hostname === "sas.no" || hostname === "finn.no" || hostname === "momondo.no" || hostname === "panflights.no" || hostname === "panflights.com" || hostname === "travellink.no" || hostname === "trip.com" || hostname.endsWith(".trip.com") || hostname === "shop.lufthansa.com" || hostname === "booking.norwegian.com" || hostname === "skyscanner.no" || hostname === "skyscanner.net" || hostname === "vinmonopolet.no" || hostname === "tax-free.no" || hostname === "store.epicgames.com" || hostname === "store.steampowered.com" || hostname === "xbox.com" || hostname === "apps.microsoft.com";
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
    if (isItadGameStoreProductUrl(parsedUrl.toString())) {
      return true;
    }
    const strongProductishPath = hasStrongProductishPath(parsedUrl);
    if (strongProductishPath && (hasVisiblePriceSignal() || hasCommerceActionSignal())) {
      return true;
    }
    const productishPath = /\b(product|produkt|produkter|p|i|item|shop|varer|sku)\b/i.test(parsedUrl.pathname) || [...parsedUrl.searchParams.keys()].some((key) => /\b(product|produkt|sku|mpn|gtin|ean)\b/i.test(key));
    if (!productishPath) return false;
    return hasVisiblePriceSignal() && hasCommerceActionSignal();
  }
  function hasStrongProductishPath(parsedUrl) {
    return /(?:^|\/)(?:product|produkt|produkter)\/[^/]+/i.test(parsedUrl.pathname) || /^\/(?:i|p)\/\d+\/[-\w%]+\/?$/i.test(parsedUrl.pathname);
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
        entries.push(decodeLdJsonStrings(JSON.parse(script.textContent ?? "")));
      } catch {
      }
    }
    return entries;
  }
  function decodeLdJsonStrings(value) {
    if (typeof value === "string") return decodeHtmlEntities(value);
    if (Array.isArray(value)) return value.map(decodeLdJsonStrings);
    if (isRecord(value)) {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeLdJsonStrings(item)]));
    }
    return value;
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
    return uniqueStrings(`${parsedUrl.pathname} ${parsedUrl.search}`.match(/\b\d{12,14}\b/g) ?? []);
  }
  function collectProductCodesFromSpecificationRows() {
    const codes = /* @__PURE__ */ new Set();
    for (const labelElement of document.querySelectorAll("th, dt")) {
      const label = labelElement.textContent?.trim() ?? "";
      if (!/^(?:ean|gtin(?:8|12|13|14)?|strekkode|barcode)\b/i.test(label)) continue;
      const valueElement = labelElement.tagName === "DT" ? labelElement.nextElementSibling : labelElement.closest("tr")?.querySelector("td");
      const value = valueElement?.textContent?.match(/\b(?:\d{8}|\d{12,14})\b/)?.[0];
      if (value !== void 0) codes.add(value);
      if (codes.size >= 3) break;
    }
    return [...codes];
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
      providerWrap.append(createActivationBadge(offer, shadowRoot));
    }
    providerWrap.append(providerBadge);
    return providerWrap;
  }
  function createActivationBadge(offer, shadowRoot) {
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
    return activationBadge;
  }
  function showOfferActivated(offer, providerWrap, shadowRoot) {
    if (providerWrap.querySelector(".activation-badge") !== null) {
      return;
    }
    providerWrap.prepend(createActivationBadge(offer, shadowRoot));
  }
  function shouldMarkOfferClick(offer) {
    return offer.provider === "cbn";
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
      if (isSpareborsenPartnerCtaText(button.textContent)) {
        return button;
      }
    }
    return null;
  }
  function isSpareborsenPartnerCtaText(value) {
    const text = value?.replace(/^Ad\s*/i, "").trim().replace(/\s+/g, " ") ?? "";
    return (text.startsWith("Handle hos") || text.startsWith("Aktiver og gå til")) && text.endsWith("→");
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
    return isSpareborsenPartnerCtaText(clickable?.textContent);
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
    const port = parsedUrl.port.length > 0 ? `:${parsedUrl.port}` : "";
    const pathname = parsedUrl.pathname.length > 1 && parsedUrl.pathname.endsWith("/") ? parsedUrl.pathname.slice(0, -1) : parsedUrl.pathname;
    return `${parsedUrl.protocol}//${parsedUrl.hostname}${port}${pathname}`;
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
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
      color: #111827;
    }
    .provider-enhver {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      color: #162333;
    }
    .provider-kassal {
      background: #c8103a;
      color: #ffffff;
    }
    .provider-finnreise {
      background: #06befb;
      color: #ffffff;
    }
    .provider-panflights {
      background: #ffffff;
      border: 1px solid #d7e5ff;
      color: #1375f7;
    }
    .provider-momondo {
      background: #2e0b59;
      color: #ff7a18;
    }
    .provider-skyscanner {
      background: #05203c;
      color: #ffffff;
    }
    .provider-travellink {
      background: #006471;
      color: #ffffff;
    }
    .provider-google {
      background: #ffffff;
      border: 1px solid #dadce0;
      color: #1a73e8;
    }
    .provider-tripcom {
      background: #2563eb;
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
    .provider-ggdeals {
      background: #111018;
      color: #ffffff;
    }
    .provider-allkeyshop {
      background: #070b12;
      color: #ffffff;
    }
    .provider-appstoreprice {
      background: #007aff;
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
      background: #ffe4e6;
      color: #be123c;
    }
    .provider-unio {
      background: #ffffff;
      border: 1px solid #c9b896;
      color: #6b5330;
    }
    .provider-coop {
      background: #003366;
      color: #ffffff;
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
    .price-match-card.price-match-card--with-duration {
      grid-template-columns: minmax(0, 1fr) auto auto auto;
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
    .region-price-actions {
      align-items: center;
      display: inline-flex;
      flex-wrap: wrap;
      gap: 5px;
      justify-content: flex-end;
      justify-self: end;
      min-width: 0;
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
    .price-match-duration {
      color: #5d6b71;
      font-size: 10px;
      font-weight: 600;
      justify-self: end;
      white-space: nowrap;
    }
    .price-match-card--updating {
      animation: price-match-updating-sweep 1.8s linear infinite;
      background-image: linear-gradient(90deg, rgba(58, 125, 85, 0) 0%, rgba(58, 125, 85, 0.14) 50%, rgba(58, 125, 85, 0) 100%);
      background-repeat: no-repeat;
      background-size: 45% 100%;
    }
    @keyframes price-match-updating-sweep {
      0% {
        background-position: -100% 0;
      }
      100% {
        background-position: 200% 0;
      }
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
      max-height: min(70vh, 560px);
      max-width: 320px;
      overflow: hidden;
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
    .offer-tooltip-more {
      color: #9aa7b0;
      font-style: italic;
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
    header.append(sumInput);
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
      if (shouldMarkOfferClick(currentOffer)) {
        offerLink.addEventListener("click", () => {
          showOfferActivated(currentOffer, providerWrap, shadowRoot);
          void markOfferActivated(currentOffer.provider, currentOffer.activationUrl);
        });
      }
      if (currentOffer.provider === "nettbonus" || currentOffer.provider === "spareborsen") {
        const adChip = makeAdChip();
        providerWrap.prepend(adChip);
      }
      offerLabel.append(offerReward);
      if (CARD_ONLY_PROVIDERS.has(currentOffer.provider)) {
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
      if (card.label === "Crypto" && cryptoSub !== void 0) continue;
      const { chip, label } = createBonusChip(card, card.label === "Curve" ? curveOffer?.activationUrl : void 0);
      if (card.label === "Crypto" || card.label === "Curve") {
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
        setTooltipContent(tooltip, buildRegionPriceTooltipParts(regionPrice, regionPrices));
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
    body.append(chipsSection);
    if (offers.length > 0) body.append(codesSection);
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
      let hideTimer;
      const clearHideTimer = () => {
        if (hideTimer === void 0) return;
        window.clearTimeout(hideTimer);
        hideTimer = void 0;
      };
      const showTooltip = () => {
        clearHideTimer();
        positionTooltipRightOfPanel(tooltip, card, shadowRoot);
      };
      const scheduleHideTooltip = () => {
        clearHideTimer();
        hideTimer = window.setTimeout(() => {
          if (!card.matches(":hover") && !tooltip.matches(":hover")) {
            tooltip.classList.remove("visible");
          }
        }, 120);
      };
      card.addEventListener("mouseenter", showTooltip);
      card.addEventListener("mouseleave", scheduleHideTooltip);
      tooltip.addEventListener("mouseenter", showTooltip);
      tooltip.addEventListener("mouseleave", scheduleHideTooltip);
    }
  }
  function setTooltipContent(tooltip, parts) {
    const sectionParts = parts.flatMap((part) => part.split(/\n{2,}/));
    const sections = [];
    let lineCount = 0;
    let truncated = false;
    for (const part of sectionParts) {
      const partLines = part.split("\n").map((line) => line.trim()).filter(Boolean).length;
      if (partLines === 0) continue;
      if (lineCount + partLines > TOOLTIP_MAX_LINES && sections.length > 0) {
        truncated = true;
        break;
      }
      const section = createTooltipSection(part);
      if (section === void 0) continue;
      sections.push(section);
      lineCount += partLines;
    }
    if (truncated) {
      const moreSection = document.createElement("div");
      moreSection.className = "offer-tooltip-section offer-tooltip-more";
      moreSection.textContent = "… se resten hos kilden";
      sections.push(moreSection);
    }
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
    const hasExplicitList = lines.slice(1).some((line) => /^[-•]\s+/.test(line));
    const listLines = /^(medlemsfordel|medlemstilbud)$/i.test(firstLine) || / tilbud$/i.test(firstLine) || hasExplicitList ? lines.slice(1) : lines;
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
    return isRecord(value) && typeof value.productId === "string" && typeof value.fetchedAt === "string" && (value.productName === void 0 || typeof value.productName === "string") && (value.ratesUpdatedAt === void 0 || typeof value.ratesUpdatedAt === "string") && (value.sourceProvider === void 0 || value.sourceProvider === "playstation" || value.sourceProvider === "appstoreprice") && (value.sourceName === void 0 || typeof value.sourceName === "string") && (value.sourceDetail === void 0 || typeof value.sourceDetail === "string") && (value.planName === void 0 || typeof value.planName === "string") && (value.availablePlanNames === void 0 || Array.isArray(value.availablePlanNames) && value.availablePlanNames.every((entry) => typeof entry === "string")) && Array.isArray(value.prices) && value.prices.every(isPlayStationRegionPrice);
  }
  function isPlayStationRegionPrice(value) {
    return isRecord(value) && typeof value.region === "string" && typeof value.countryName === "string" && typeof value.flag === "string" && typeof value.locale === "string" && typeof value.currency === "string" && typeof value.price === "number" && typeof value.formattedPrice === "string" && typeof value.nokAmount === "number" && typeof value.formattedNok === "string" && typeof value.productUrl === "string" && (value.priceHistoryUrl === void 0 || typeof value.priceHistoryUrl === "string") && (value.sourceProvider === void 0 || value.sourceProvider === "playstation" || value.sourceProvider === "appstoreprice") && (value.sourceName === void 0 || typeof value.sourceName === "string") && (value.sourceDetail === void 0 || typeof value.sourceDetail === "string") && (value.planName === void 0 || typeof value.planName === "string") && (value.planAlternatives === void 0 || Array.isArray(value.planAlternatives) && value.planAlternatives.every(isRegionPricePlanAlternative));
  }
  function isRegionPricePlanAlternative(value) {
    return isRecord(value) && typeof value.planName === "string" && (value.formattedPrice === void 0 || typeof value.formattedPrice === "string") && (value.formattedNok === void 0 || typeof value.formattedNok === "string") && (value.unavailableReason === void 0 || typeof value.unavailableReason === "string");
  }
  function isPriceMatchOffer(value) {
    return isRecord(value) && (value.source === void 0 || value.source === "prisjakt" || value.source === "godpris" || value.source === "klarna" || value.source === "prisradar" || value.source === "isthereanydeal" || value.source === "ggdeals" || value.source === "allkeyshop" || value.source === "taxfree" || value.source === "vinmonopolet" || value.source === "sesum" || value.source === "enhver" || value.source === "kassal" || value.source === "finnreise" || value.source === "panflights" || value.source === "momondo" || value.source === "skyscanner" || value.source === "travellink" || value.source === "tripcom") && (value.sourceName === void 0 || typeof value.sourceName === "string") && (value.details === void 0 || typeof value.details === "string") && (value.matchedCurrentMerchant === void 0 || typeof value.matchedCurrentMerchant === "boolean") && (value.matchedExactProduct === void 0 || typeof value.matchedExactProduct === "boolean") && typeof value.shopName === "string" && typeof value.price === "string" && typeof value.amount === "number" && (value.sortAmount === void 0 || typeof value.sortAmount === "number") && typeof value.currency === "string" && typeof value.productName === "string" && typeof value.productUrl === "string" && (value.offerUrl === void 0 || typeof value.offerUrl === "string") && (value.durationText === void 0 || typeof value.durationText === "string") && (value.alternatives === void 0 || Array.isArray(value.alternatives) && value.alternatives.every(isPriceMatchAlternative));
  }
  function isPriceMatchAlternative(value) {
    return isRecord(value) && typeof value.shopName === "string" && typeof value.price === "string" && typeof value.amount === "number" && (value.sortAmount === void 0 || typeof value.sortAmount === "number") && typeof value.currency === "string" && (value.platform === void 0 || typeof value.platform === "string") && (value.durationText === void 0 || typeof value.durationText === "string") && (value.shippingPrice === void 0 || typeof value.shippingPrice === "string") && (value.totalPrice === void 0 || typeof value.totalPrice === "string");
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
    const currentMomondoVisibleBestPrice = priceMatch.source === "momondo" ? readCurrentMomondoVisibleBestPriceForCurrentPage() : void 0;
    priceMatchPrice.textContent = currentMomondoVisibleBestPrice === void 0 ? priceMatch.price : formatNokFlightPrice(currentMomondoVisibleBestPrice);
    if (priceMatch.searchIncomplete === true) {
      priceMatchCard.classList.add("price-match-card--updating");
      priceMatchCard.title = "Søket pågår fortsatt – prisen kan bli oppdatert";
    }
    const priceMatchBadge = document.createElement("span");
    priceMatchBadge.className = `provider-badge provider-${getPriceMatchProviderClass(priceMatch)}`;
    priceMatchBadge.textContent = getPriceMatchSourceName(priceMatch);
    const hasDuration = priceMatch.durationText !== void 0 && priceMatch.durationText.length > 0;
    if (hasDuration) {
      const priceMatchDuration = document.createElement("span");
      priceMatchDuration.className = "price-match-duration";
      priceMatchDuration.textContent = priceMatch.durationText ?? "";
      priceMatchCard.classList.add("price-match-card--with-duration");
      priceMatchCard.append(priceMatchTitle, priceMatchDuration, priceMatchPrice, priceMatchBadge);
    } else {
      priceMatchCard.append(priceMatchTitle, priceMatchPrice, priceMatchBadge);
    }
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
    if (regionPrice.sourceProvider !== "appstoreprice") {
      regionPriceMain.title = `Åpne ${regionPrice.countryName} i PlayStation Store`;
    }
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
    const secondaryLinks = getRegionPriceSecondaryLinks(regionPrice);
    if (secondaryLinks.length > 0) {
      regionPriceCard.classList.add("region-price-card-with-action");
      const regionPriceActions = document.createElement("span");
      regionPriceActions.className = "region-price-actions";
      for (const secondaryLink of secondaryLinks) {
        const regionPriceAction = document.createElement("a");
        regionPriceAction.className = `provider-badge provider-${secondaryLink.provider} region-price-action`;
        regionPriceAction.href = secondaryLink.url;
        regionPriceAction.target = "_blank";
        regionPriceAction.rel = "noreferrer";
        if (secondaryLink.title !== void 0) {
          regionPriceAction.title = secondaryLink.title;
        }
        regionPriceAction.textContent = secondaryLink.label;
        regionPriceActions.append(regionPriceAction);
      }
      regionPriceCard.append(regionPriceActions);
    }
    return regionPriceCard;
  }
  function getRegionPriceSecondaryLinks(regionPrice) {
    if (regionPrice.sourceProvider === "appstoreprice") {
      return [{
        label: regionPrice.sourceName ?? "AppStorePrice",
        provider: "appstoreprice",
        url: regionPrice.productUrl
      }];
    }
    if (regionPrice.region === "NO") {
      if (regionPrice.priceHistoryUrl === void 0) return [];
      return [{
        label: "psprices",
        provider: "psprices",
        title: "Åpne norsk prishistorikk hos PSPrices",
        url: regionPrice.priceHistoryUrl
      }];
    }
    return [
      {
        label: "GC Deals",
        provider: "gcdeals",
        title: `Finn PSN-gavekort for ${regionPrice.countryName} hos GC Deals`,
        url: PSN_GC_DEALS_GIFT_CARD_REGION_URLS[regionPrice.region] ?? PSN_GC_DEALS_GIFT_CARD_URL
      },
      {
        label: "GG Deals",
        provider: "ggdeals",
        title: `Finn PSN-gavekort for ${regionPrice.countryName} hos GG Deals`,
        url: PSN_GG_DEALS_GIFT_CARD_REGION_URLS[regionPrice.region] ?? PSN_GG_DEALS_GIFT_CARD_URL
      }
    ];
  }
  function buildRegionPriceTooltipParts(regionPrice, regionPrices) {
    if (regionPrice.sourceProvider === "appstoreprice") {
      return buildAppStorePriceRegionPriceTooltipParts(regionPrice, regionPrices);
    }
    return [buildRegionPricesTooltip(regionPrices)];
  }
  function buildAppStorePriceRegionPriceTooltipParts(regionPrice, regionPrices) {
    const sourceName = regionPrice.sourceName ?? regionPrices.sourceName ?? "AppStorePrice";
    const planName = regionPrice.planName ?? regionPrices.planName ?? "valgt plan";
    const planAlternatives = regionPrice.planAlternatives?.slice(0, 10) ?? [];
    const planLines = planAlternatives.length > 0 ? planAlternatives.map((alternative) => `- ${formatRegionPricePlanAlternative(alternative, regionPrice.countryName)}`) : [`- ${planName}: ${regionPrice.formattedNok} (${regionPrice.formattedPrice})`];
    const rateLine = regionPrices.ratesUpdatedAt !== void 0 ? `FX: ${regionPrices.ratesUpdatedAt}` : "FX: live NOK conversion";
    return [
      `${regionPrice.flag} ${regionPrice.countryName}: ${planName} = ${regionPrice.formattedNok} (${regionPrice.formattedPrice})`,
      [
        `App Store-planer i ${regionPrice.countryName}`,
        ...planLines
      ].join("\n"),
      [
        `Kilde: ${sourceName}`,
        "App Store/IAP-priser kan avvike fra direkte web-checkout hos tjenesten.",
        "Regionbytte krever vanligvis Apple ID, gavekort eller betalingsmetode i samme region.",
        rateLine
      ].join("\n")
    ];
  }
  function formatRegionPricePlanAlternative(alternative, countryName) {
    if (alternative.formattedPrice !== void 0 && alternative.formattedNok !== void 0) {
      return `${alternative.planName}: ${alternative.formattedNok} (${alternative.formattedPrice})`;
    }
    return `${alternative.planName}: ${alternative.unavailableReason ?? `Ikke funnet for ${countryName}`}`;
  }
  function buildRegionPricesTooltip(regionPrices) {
    const rateLine = regionPrices.ratesUpdatedAt !== void 0 ? `FX: ${regionPrices.ratesUpdatedAt}` : "FX: live NOK conversion";
    if (regionPrices.sourceProvider === "appstoreprice") {
      const planName = regionPrices.planName ?? regionPrices.productName ?? "abonnement";
      const sourceName = regionPrices.sourceName ?? "AppStorePrice";
      const availablePlanNames = regionPrices.availablePlanNames?.slice(0, 10) ?? [];
      return [
        `Viser: ${planName}.`,
        `Kilde: App Store/IAP-regionpriser fra ${sourceName}.`,
        ...availablePlanNames.length > 1 ? [`Planer funnet: ${availablePlanNames.join(", ")}.`] : [],
        "Hold over en landrad for priser på flere planer i samme region.",
        "Kan avvike fra direkte web-checkout hos tjenesten.",
        "Regionbytte krever vanligvis Apple ID, gavekort eller betalingsmetode i samme region.",
        "Alle tilgjengelige regioner vises i listen, sortert billigst først.",
        "Regionraden og chipen åpner AppStorePrice-siden.",
        rateLine
      ].join("\n");
    }
    return [
      "Utenlandske priser krever PSN-konto i samme region og betaling med PSN-gavekort.",
      "Typisk flyt: legg regionkontoen til på PS5-en, kjøp og last ned spillet der, spill fra norsk konto etterpå.",
      "Alle tilgjengelige regioner vises i listen, sortert billigst først.",
      "Regionraden åpner spillet i regional PlayStation Store.",
      "GC Deals- og GG Deals-chipene åpner PSN-gavekort i valgt region.",
      rateLine
    ].join("\n");
  }
  function getPriceMatchProviderClass(priceMatch) {
    if (priceMatch.source === "godpris") return "godpris";
    if (priceMatch.source === "klarna") return "klarna";
    if (priceMatch.source === "prisradar") return "prisradar";
    if (priceMatch.source === "sesum") return "sesum";
    if (priceMatch.source === "enhver") return "enhver";
    if (priceMatch.source === "kassal") return "kassal";
    if (priceMatch.source === "finnreise") return "finnreise";
    if (priceMatch.source === "panflights") return "panflights";
    if (priceMatch.source === "momondo") return "momondo";
    if (priceMatch.source === "skyscanner") return "skyscanner";
    if (priceMatch.source === "travellink") return "travellink";
    if (priceMatch.source === "tripcom") return "tripcom";
    if (priceMatch.source === "isthereanydeal") return "isthereanydeal";
    if (priceMatch.source === "ggdeals") return "ggdeals";
    if (priceMatch.source === "allkeyshop") return "allkeyshop";
    if (priceMatch.source === "taxfree") return "taxfree";
    if (priceMatch.source === "vinmonopolet") return "vinmonopolet";
    if (priceMatch.source === "googleflights" || priceMatch.source === "googleshopping") return "google";
    return "prisjakt";
  }
  function getPriceMatchSourceName(priceMatch) {
    if (priceMatch.sourceName !== void 0) return priceMatch.sourceName;
    if (priceMatch.source === "godpris") return "Godpris";
    if (priceMatch.source === "klarna") return "Klarna";
    if (priceMatch.source === "prisradar") return "Prisradar";
    if (priceMatch.source === "sesum") return "SeSum";
    if (priceMatch.source === "enhver") return "enhver";
    if (priceMatch.source === "kassal") return "Kassalapp";
    if (priceMatch.source === "finnreise") return "FINN";
    if (priceMatch.source === "panflights") return "PanFlights";
    if (priceMatch.source === "momondo") return "momondo";
    if (priceMatch.source === "skyscanner") return "Skyscanner";
    if (priceMatch.source === "travellink") return "Travellink";
    if (priceMatch.source === "tripcom") return "Trip";
    if (priceMatch.source === "isthereanydeal") return "IsThereAnyDeal";
    if (priceMatch.source === "ggdeals") return "GG Deals";
    if (priceMatch.source === "allkeyshop") return "ALLKEYSHOP";
    if (priceMatch.source === "taxfree") return "Tax Free";
    if (priceMatch.source === "vinmonopolet") return "Vinmonopolet";
    if (priceMatch.source === "googleflights") return "Google Flights";
    if (priceMatch.source === "googleshopping") return "Google Shopping";
    return "Prisjakt";
  }
  function buildPriceMatchTooltip(priceMatch) {
    if (isFlightSearchPriceMatch(priceMatch)) {
      const alternatives2 = priceMatch.alternatives ?? [];
      const details = priceMatch.details ?? priceMatch.shopName;
      const airportScopeText = formatFlightPriceMatchAirportScopeText(priceMatch);
      const hasLivePriceList = alternatives2.length > 0 && (priceMatch.sortAmount ?? priceMatch.amount) < FLIGHT_STATIC_PRICE_SORT_AMOUNT;
      if (hasLivePriceList) {
        const isCalendarPrice = priceMatch.source === "skyscanner" && priceMatch.shopName === "Skyscanner kalender" || priceMatch.source === "tripcom" && priceMatch.shopName === "Trip kalender";
        return [
          `${getPriceMatchSourceName(priceMatch)}: ${priceMatch.productName}`,
          [
            priceMatch.shopName,
            details !== priceMatch.shopName ? details : void 0,
            `${isCalendarPrice ? "Kalenderpris" : "Beste treff"}: ${priceMatch.price}`,
            isCalendarPrice ? `${getPriceMatchSourceName(priceMatch)} gir kalenderpris for eksakt dato; åpne søket for faktisk treffliste.` : `Dato og ${airportScopeText} er filtrert til samme søk.`
          ].filter((line) => line !== void 0).join("\n"),
          [
            isCalendarPrice ? "Prisgrunnlag" : "Treffliste",
            ...alternatives2.slice(0, FLIGHT_TOOLTIP_MAX_ROWS).map(formatPriceMatchTooltipOffer)
          ].join("\n"),
          "Bagasje, fareklasse og valgt avgang må sjekkes hos kilden."
        ].join("\n\n");
      }
      return [
        `${getPriceMatchSourceName(priceMatch)}: ${priceMatch.productName}`,
        details,
        `Åpner prissøk med ${airportScopeText}, datoer og antall voksne.`,
        "Bagasje, fareklasse og valgt avgang må sjekkes hos kilden."
      ].join("\n");
    }
    const alternatives = priceMatch.alternatives?.length ? priceMatch.alternatives : [{ shopName: priceMatch.shopName, price: priceMatch.price }];
    return [
      `${getPriceMatchSourceName(priceMatch)}: ${priceMatch.productName}`,
      alternatives.map(formatPriceMatchTooltipOffer).join("\n")
    ].join("\n\n");
  }
  function isFlightSearchPriceMatch(priceMatch) {
    return priceMatch.source === "finnreise" || priceMatch.source === "panflights" || priceMatch.source === "momondo" || priceMatch.source === "skyscanner" || priceMatch.source === "travellink" || priceMatch.source === "tripcom";
  }
  function formatPriceMatchTooltipOffer(offer) {
    const details = [
      offer.durationText,
      offer.platform,
      offer.totalPrice !== void 0 ? `${offer.shippingPrice ?? "frakt"}, totalt ${offer.totalPrice}` : offer.shippingPrice
    ].filter((detail) => detail !== void 0 && detail.length > 0);
    const detailsSuffix = details.length > 0 ? ` (${details.join(", ")})` : "";
    return `- ${offer.shopName} ${offer.price}${detailsSuffix}`;
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
  startContentScript();
})();
