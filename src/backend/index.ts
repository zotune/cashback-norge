import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildCashbackIndex,
  type CashbackOffer,
  type CashbackProvider,
  isCashbackIndex,
  normalizeDomainInput,
  uniqueOffers,
} from "../shared/cashback.js";
import {
  fetchNokBaseRates,
  STATIC_NOK_BASE_RATES,
} from "../shared/exchange-rates.js";
import {
  addFixedRewardSortValues,
} from "../shared/reward-calculation.js";
import { buildProviderMeta } from "../shared/provider-data.js";
import { buildDomainLookup } from "./domain-lookup.js";
import { readDomainRedirects } from "./domain-redirects.js";
import { readJsonFile, writeJsonFile } from "./json-file.js";
import { createConsoleLogger, type Logger } from "./logger.js";
import { readManualOffers } from "./manual-offers.js";
import { readProviderOverrides } from "./provider-overrides.js";
import { crawlKlarna } from "./providers/klarna.js";
import { crawlRemember } from "./providers/remember.js";
import { fetchSas } from "./providers/sas.js";
import { fetchDealpass } from "./providers/dealpass.js";
import { fetchNorwegianReward } from "./providers/norwegian.js";
import { crawlTrumf } from "./providers/trumf.js";
import { crawlCuponation } from "./providers/cuponation.js";
import { fetchDnb, fetchDnbSupertilbud } from "./providers/dnb.js";
import { fetchCurve } from "./providers/curve.js";
import { crawlFinnkupongkoder } from "./providers/finnkupongkoder.js";
import { crawlKickback } from "./providers/kickback.js";
import { crawlRabattkode } from "./providers/rabattkode.js";
import { crawlNorskfamilie } from "./providers/norskfamilie.js";
import { crawlTrustdeals } from "./providers/trustdeals.js";
import { crawlLogbuy } from "./providers/logbuy.js";
import { crawlObos } from "./providers/obos.js";
import { crawlBob } from "./providers/bob.js";
import { crawlUsbl } from "./providers/usbl.js";
import { crawlBate } from "./providers/bate.js";
import { crawlTobb } from "./providers/tobb.js";
import { crawlNaf } from "./providers/naf.js";
import { crawlTekna } from "./providers/tekna.js";
import { crawlNito } from "./providers/nito.js";
import { crawlSparebank1 } from "./providers/sparebank1.js";
import { crawlStudentkortet } from "./providers/studentkortet.js";
import { crawlNettbonus } from "./providers/nettbonus.js";
import { fetchSpenn } from "./providers/spenn.js";
import { fetchSpareborsen } from "./providers/spareborsen.js";
import { crawlRabble } from "./providers/rabble.js";
import { fetchDreams } from "./providers/dreams.js";
import { fetchUtdanningiBergen } from "./providers/utdanningibergen.js";
import { fetchUnidays } from "./providers/unidays.js";
import { crawlStudentTorget } from "./providers/studenttorget.js";
import { fetchUnio } from "./providers/unio.js";
import { crawlCoop } from "./providers/coop.js";
import { crawlElkjop } from "./providers/elkjop.js";
import { fetchAkademikerne } from "./providers/akademikerne.js";
import { fetchHuseierne } from "./providers/huseierne.js";
import { fetchHuseierforbundet } from "./providers/huseierforbundet.js";
import { fetchAmcar } from "./providers/amcar.js";
import { fetchHorselsforbundet } from "./providers/horselsforbundet.js";
import { fetchKnbf } from "./providers/knbf.js";
import { crawlNjff } from "./providers/njff.js";
import { fetchPensjonistforbundet } from "./providers/pensjonistforbundet.js";
import { fetchKna } from "./providers/kna.js";
import { fetchSyklistforeningen } from "./providers/syklistforeningen.js";
import { fetchRevmatikerforbundet } from "./providers/revmatikerforbundet.js";
import { fetchRedningsselskapet } from "./providers/redningsselskapet.js";
import { fetchLhl } from "./providers/lhl.js";
import { fetchSkiforeningen } from "./providers/skiforeningen.js";
import { fetchAgrol } from "./providers/agrol.js";
import { fetchKondis } from "./providers/kondis.js";
import { fetchVestbo } from "./providers/vestbo.js";
import { fetchBbl } from "./providers/bbl.js";
import { fetchElbil } from "./providers/elbilforeningen.js";
import { fetchYs } from "./providers/ys.js";
import { fetchLofavor } from "./providers/lofavor.js";
import { fetchPartnerAds } from "./providers/partnerads.js";
import { fetchTradeTracker } from "./providers/tradetracker.js";
import { fetchAwin } from "./providers/awin.js";
import { fetchAddrevenue } from "./providers/addrevenue.js";
import { fetchOrion } from "./providers/orion.js";
import { fetchDaisycon } from "./providers/daisycon.js";
import { fetchTradedoubler } from "./providers/tradedoubler.js";
import { fetchCoupert } from "./providers/coupert.js";
import { fetchRabatta } from "./providers/rabatta.js";

const STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS = 14;

type CliConfig = {
  outputPath: string;
  manualOffersPath: string;
  providerOverridesPath: string;
  klarnaStartUrl: string;
  klarnaMaxPages: number;
  klarnaProxyUrls: string[];
  rememberStartUrl: string;
  trumfStartUrl: string;
  sasApiUrl: string;
  tfBankApiUrl: string;
  santanderApiUrl: string;
  vestboApiUrl: string;
  bblPageUrl: string;
  elbilApiUrl: string;
  ysApiUrl: string;
  lofavorStartUrl: string;
  norwegianApiUrl: string;
  norwegianGridListId: number;
  maxRequestsPerCrawl: number;
  skipKlarna: boolean;
  skipRemember: boolean;
  skipTrumf: boolean;
  skipSas: boolean;
  skipTfBank: boolean;
  skipSantander: boolean;
  skipVestbo: boolean;
  skipBbl: boolean;
  skipElbil: boolean;
  skipYs: boolean;
  skipLofavor: boolean;
  skipNorwegian: boolean;
  skipCuponation: boolean;
  skipDnb: boolean;
  skipCurve: boolean;
  skipFinnkupongkoder: boolean;
  skipKickback: boolean;
  skipRabattkode: boolean;
  skipNorskfamilie: boolean;
  skipTrustdeals: boolean;
  skipLogbuy: boolean;
  skipObos: boolean;
  skipBob: boolean;
  skipUsbl: boolean;
  skipBate: boolean;
  skipTobb: boolean;
  skipNaf: boolean;
  skipTekna: boolean;
  skipNito: boolean;
  skipSparebank1: boolean;
  skipStudentkortet: boolean;
  skipNettbonus: boolean;
  skipSpenn: boolean;
  skipSpareborsen: boolean;
  skipRabble: boolean;
  skipDreams: boolean;
  skipUtdanningibergen: boolean;
  skipUnidays: boolean;
  skipDnbSupertilbud: boolean;
  skipStudentTorget: boolean;
  skipUnio: boolean;
  skipCoop: boolean;
  skipElkjop: boolean;
  skipAkademikerne: boolean;
  skipHuseierne: boolean;
  skipHuseierforbundet: boolean;
  skipAmcar: boolean;
  skipHorselsforbundet: boolean;
  skipKnbf: boolean;
  skipNjff: boolean;
  skipPensjonistforbundet: boolean;
  skipKna: boolean;
  skipSyklistforeningen: boolean;
  skipRevmatikerforbundet: boolean;
  skipRedningsselskapet: boolean;
  skipLhl: boolean;
  skipSkiforeningen: boolean;
  skipAgrol: boolean;
  skipKondis: boolean;
  skipPartnerAds: boolean;
  skipTradeTracker: boolean;
  skipAwin: boolean;
  skipAddrevenue: boolean;
  skipOrion: boolean;
  skipDaisycon: boolean;
  skipTradedoubler: boolean;
  skipCoupert: boolean;
  skipRabatta: boolean;
  rabattaShopSlugs: string[];
  dnbPageDataUrl: string;
  dnbSupertilbudPageDataUrl: string;
  cuponationStartUrl: string;
  finnkupongkoderStartUrl: string;
  finnkupongkoderProxyUrls: string[];
  kickbackStartUrl: string;
  trustdealsStartUrl: string;
  logbuyStartUrl: string;
  obosStartUrl: string;
  bobStartUrl: string;
  usblStartUrl: string;
  bateStartUrl: string;
  tobbStartUrl: string;
  nafStartUrl: string;
  teknaStartUrl: string;
  nitoStartUrl: string;
  sparebank1StartUrl: string;
  studentkortetStartUrl: string;
  nettbonusStartUrl: string;
  elkjopStartUrl: string;
  elkjopProxyUrls: string[];
  njffStartUrl: string;
};

async function main(): Promise<void> {
  const logger = createConsoleLogger();
  const config = readCliConfig(process.argv.slice(2));
  const generatedAt = new Date().toISOString();
  const previousOffersByProvider = await readPreviousOffersByProvider(
    config.outputPath,
    logger,
  );
  const collectOffers = (
    options: Omit<
      CollectProviderOffersOptions,
      "logger" | "previousOffersByProvider"
    >,
  ) => {
    return collectProviderOffers({
      ...options,
      logger,
      previousOffersByProvider,
    });
  };
  const manualOffers = await readManualOffers(config.manualOffersPath);
  // norwegian.com blocks datacenter IPs. ScraperAPI credits are limited, so
  // the proxy fallback is only armed when there are no previous offers to
  // reuse, or they are old enough to approach the 14-day fallback limit.
  const previousNorwegianOffers = previousOffersByProvider.get("norwegian") ?? [];
  const newestNorwegianUpdate = readNewestUpdatedAt(previousNorwegianOffers);
  const norwegianDataIsFresh = newestNorwegianUpdate !== undefined &&
    Date.now() - newestNorwegianUpdate.getTime() < 7 * 24 * 60 * 60 * 1000;
  const norwegianProxyUrls = norwegianDataIsFresh ? [] : buildScraperApiProxyUrls();
  const providerOverrides = await readProviderOverrides(
    config.providerOverridesPath,
  );
  // Phase 1: Crawl providers that have real merchant URLs (parallel)
  const [
    klarnaOffers,
    rememberOffers,
    tfBankOffers,
    santanderOffers,
    vestboOffers,
    bblOffers,
    elbilOffers,
    ysOffers,
    lofavorOffers,
    norwegianOffers,
    dnbOffers,
    dnbSupertilbudOffers,
    norskfamilieOffers,
    obosOffers,
    bobOffers,
    sparebank1Offers,
    spareborsenOffers,
    dreamsOffers,
    utdanningibergenOffers,
    unidaysOffers,
    unioOffers,
    coopOffers,
    partnerAdsOffers,
    tradeTrackerOffers,
    awinOffers,
    addrevenueOffers,
    orionOffers,
    daisyconOffers,
    tradedoublerOffers,
  ] = await Promise.all([
    config.skipKlarna ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "Klarna",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "klarna",
      reusePreviousOnFailure: true,
      run: () => crawlKlarna({
        generatedAt, logger, maxPages: config.klarnaMaxPages,
        overrides: providerOverrides, startUrl: config.klarnaStartUrl,
        proxyUrls: config.klarnaProxyUrls,
      }),
    }),
    config.skipRemember ? Promise.resolve([]) : collectOffers({
      label: "re:member",
      provider: "remember",
      run: () => crawlRemember({
        generatedAt, logger, maxRequestsPerCrawl: config.maxRequestsPerCrawl,
        overrides: providerOverrides, startUrl: config.rememberStartUrl,
      }),
    }),
    config.skipTfBank ? Promise.resolve([]) : collectOffers({
      label: "TF Bank",
      provider: "tfbank",
      run: () => fetchDealpass({
        generatedAt, logger, apiUrl: config.tfBankApiUrl,
        provider: "tfbank", label: "TF Bank",
        siteBaseUrl: "https://tfbank.dealpass.no",
        overrides: providerOverrides,
      }),
    }),
    config.skipSantander ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "Santander",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "santander",
      reusePreviousOnFailure: true,
      run: () => fetchDealpass({
        generatedAt, logger, apiUrl: config.santanderApiUrl,
        provider: "santander", label: "Santander",
        siteBaseUrl: "https://santander.dealpass.no",
        overrides: providerOverrides,
      }),
    }),
    config.skipVestbo ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "Vestbo",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "vestbo",
      reusePreviousOnFailure: true,
      run: () => fetchVestbo({
        generatedAt, logger, apiUrl: config.vestboApiUrl,
        overrides: providerOverrides,
      }),
    }),
    config.skipBbl ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "BBL Fordel",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "bbl",
      reusePreviousOnFailure: true,
      run: () => fetchBbl({
        generatedAt, logger, pageUrl: config.bblPageUrl,
        overrides: providerOverrides,
      }),
    }),
    config.skipElbil ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "Elbilforeningen",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "elbilforeningen",
      reusePreviousOnFailure: true,
      run: () => fetchElbil({
        generatedAt, logger, apiUrl: config.elbilApiUrl,
        overrides: providerOverrides,
      }),
    }),
    config.skipYs ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "YS",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "ys",
      reusePreviousOnFailure: true,
      run: () => fetchYs({
        generatedAt, logger, apiUrl: config.ysApiUrl,
        overrides: providerOverrides,
      }),
    }),
    config.skipLofavor ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "LO Favør",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "lofavor",
      reusePreviousOnFailure: true,
      run: () => fetchLofavor({
        generatedAt, logger, startUrl: config.lofavorStartUrl,
        overrides: providerOverrides,
      }),
    }),
    config.skipNorwegian ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "Norwegian Reward",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "norwegian",
      reusePreviousOnFailure: true,
      run: () => fetchNorwegianReward({
        generatedAt, logger, apiUrl: config.norwegianApiUrl,
        gridListId: config.norwegianGridListId,
        overrides: providerOverrides,
        proxyUrls: norwegianProxyUrls,
      }),
    }),
    config.skipDnb ? Promise.resolve([]) : collectOffers({
      label: "DNB",
      provider: "dnb",
      run: () => fetchDnb({
        generatedAt, logger, pageDataUrl: config.dnbPageDataUrl,
      }),
    }),
    config.skipDnbSupertilbud ? Promise.resolve([]) : collectOffers({
      label: "DNB Supertilbud",
      run: () => fetchDnbSupertilbud({
        generatedAt, logger, pageDataUrl: config.dnbSupertilbudPageDataUrl,
      }),
    }),
    config.skipNorskfamilie ? Promise.resolve([]) : collectOffers({
      label: "Norskfamilie",
      provider: "norskfamilie",
      run: () => crawlNorskfamilie(),
    }),
    config.skipObos ? Promise.resolve([]) : collectOffers({
      label: "OBOS",
      provider: "obos",
      run: () => crawlObos({
        generatedAt, logger, maxRequestsPerCrawl: config.maxRequestsPerCrawl,
        overrides: providerOverrides, startUrl: config.obosStartUrl,
      }),
    }),
    config.skipBob ? Promise.resolve([]) : collectOffers({
      label: "BOB",
      provider: "bob",
      run: () => crawlBob({
        generatedAt, logger, overrides: providerOverrides, startUrl: config.bobStartUrl,
      }),
    }),
    config.skipSparebank1 ? Promise.resolve([]) : collectOffers({
      label: "SpareBank 1",
      provider: "sparebank1",
      run: () => crawlSparebank1({
        generatedAt, logger, maxRequestsPerCrawl: config.maxRequestsPerCrawl,
        startUrl: config.sparebank1StartUrl,
      }),
    }),
    config.skipSpareborsen ? Promise.resolve([]) : collectOffers({
      label: "Sparebørsen",
      provider: "spareborsen",
      run: () => fetchSpareborsen({
        generatedAt, logger,
      }),
    }),
    config.skipDreams ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "Dreams",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "dreams",
      reusePreviousOnFailure: true,
      run: () => fetchDreams({
        generatedAt, logger,
      }),
    }),
    config.skipUtdanningibergen ? Promise.resolve([]) : collectOffers({
      label: "Utdanning i Bergen",
      provider: "utdanningibergen",
      run: () => fetchUtdanningiBergen({
        generatedAt, logger,
      }),
    }),
    config.skipUnidays ? Promise.resolve([]) : collectOffers({
      label: "UNiDAYS",
      provider: "unidays",
      run: () => fetchUnidays({
        generatedAt, logger,
      }),
    }),
    config.skipUnio ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "Unio",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "unio",
      reusePreviousOnFailure: true,
      run: () => fetchUnio({
        generatedAt, logger,
      }),
    }),
    config.skipCoop ? Promise.resolve([]) : collectOffers({
      label: "Coop",
      provider: "coop",
      run: () => crawlCoop({
        generatedAt, logger, overrides: providerOverrides,
      }),
    }),
    config.skipPartnerAds ? Promise.resolve([]) : collectOffers({
      label: "Partner-Ads",
      provider: "cbn",
      run: () => fetchPartnerAds({
        generatedAt, logger,
      }),
    }),
    config.skipTradeTracker ? Promise.resolve([]) : collectOffers({
      label: "TradeTracker",
      provider: "cbn",
      run: () => fetchTradeTracker({
        generatedAt, logger,
      }),
    }),
    config.skipAwin ? Promise.resolve([]) : collectOffers({
      label: "Awin",
      provider: "cbn",
      run: () => fetchAwin({
        generatedAt, logger,
      }),
    }),
    config.skipAddrevenue ? Promise.resolve([]) : collectOffers({
      label: "Addrevenue",
      provider: "cbn",
      run: () => fetchAddrevenue({
        generatedAt, logger,
      }),
    }),
    config.skipOrion ? Promise.resolve([]) : collectOffers({
      label: "Orion",
      provider: "cbn",
      run: () => fetchOrion({
        generatedAt, logger,
      }),
    }),
    config.skipDaisycon ? Promise.resolve([]) : collectOffers({
      label: "Daisycon",
      provider: "cbn",
      run: () => fetchDaisycon({
        generatedAt, logger,
      }),
    }),
    config.skipTradedoubler ? Promise.resolve([]) : collectOffers({
      label: "Tradedoubler",
      provider: "cbn",
      run: () => fetchTradedoubler({
        generatedAt, logger,
      }),
    }),
  ]);
  logger.info(`Norskfamilie: ${norskfamilieOffers.length} offers`);

  // Phase 2: Build domain lookup from providers with known-good URLs
  const domainLookup = buildDomainLookup([
    ...klarnaOffers,
    ...rememberOffers,
    ...tfBankOffers,
    ...santanderOffers,
    ...vestboOffers,
    ...bblOffers,
    ...elbilOffers,
    ...ysOffers,
    ...lofavorOffers,
    ...norwegianOffers,
    ...dnbOffers,
    ...dnbSupertilbudOffers,
    ...norskfamilieOffers,
    ...obosOffers,
    ...bobOffers,
    ...sparebank1Offers,
    ...spareborsenOffers,
    ...coopOffers,
    ...partnerAdsOffers,
    ...tradeTrackerOffers,
    ...awinOffers,
    ...addrevenueOffers,
    ...orionOffers,
    ...daisyconOffers,
    ...tradedoublerOffers,
    ...utdanningibergenOffers,
    ...unioOffers,
    ...manualOffers,
  ]);
  logger.info(`Domain lookup: ${domainLookup.size} merchant names with known domains`);

  // Phase 3: Crawl providers that need cross-referencing for domains (parallel)
  const [
    trumfOffers,
    sasOffers,
    curveOffers,
    rabattkodeOffers,
    cuponationOffers,
    trustdealsOffers,
    kickbackOffers,
    finnkupongkoderOffers,
    logbuyOffers,
    usblOffers,
    bateOffers,
    tobbOffers,
    nafOffers,
    teknaOffers,
    nitoOffers,
    studentkortetOffers,
    nettbonusOffers,
    rabbleOffers,
    studentTorgetOffers,
    elkjopOffers,
    akademikerneOffers,
    huseierneOffers,
    huseierforbundetOffers,
    amcarOffers,
    horselsforbundetOffers,
    knbfOffers,
    njffOffers,
    pensjonistforbundetOffers,
    knaOffers,
    syklistforeningenOffers,
    revmatikerforbundetOffers,
    redningsselskapetOffers,
    lhlOffers,
    skiforeningenOffers,
    agrolOffers,
    kondisOffers,
  ] = await Promise.all([
    config.skipTrumf ? Promise.resolve([]) : collectOffers({
      label: "Trumf",
      provider: "trumf",
      run: () => crawlTrumf({
        generatedAt, logger, maxRequestsPerCrawl: config.maxRequestsPerCrawl,
        overrides: providerOverrides, startUrl: config.trumfStartUrl, domainLookup,
      }),
    }),
    config.skipSas ? Promise.resolve([]) : collectOffers({
      label: "SAS",
      provider: "sas",
      run: () => fetchSas({
        generatedAt, logger, overrides: providerOverrides,
        apiUrl: config.sasApiUrl, domainLookup,
      }),
    }),
    config.skipCurve ? Promise.resolve([]) : collectOffers({
      label: "Curve",
      provider: "curve",
      run: () => fetchCurve({ generatedAt, logger }),
    }),
    config.skipRabattkode ? Promise.resolve([]) : collectOffers({
      label: "Rabattkode",
      run: () => crawlRabattkode(),
    }),
    config.skipCuponation ? Promise.resolve([]) : collectOffers({
      label: "CupoNation",
      run: () => crawlCuponation({
        generatedAt, logger, startUrl: config.cuponationStartUrl,
      }),
    }),
    config.skipTrustdeals ? Promise.resolve([]) : collectOffers({
      label: "TrustDeals",
      run: () => crawlTrustdeals({
        generatedAt, logger, startUrl: config.trustdealsStartUrl,
      }),
    }),
    config.skipKickback ? Promise.resolve([]) : collectOffers({
      label: "Kickback",
      run: () => crawlKickback({
        domainLookup, generatedAt, logger,
        maxRequestsPerCrawl: config.maxRequestsPerCrawl, startUrl: config.kickbackStartUrl,
      }),
    }),
    config.skipFinnkupongkoder ? Promise.resolve([]) : collectOffers({
      label: "FinnKupongkoder",
      run: () => crawlFinnkupongkoder({
        generatedAt, logger,
        maxRequestsPerCrawl: config.maxRequestsPerCrawl, startUrl: config.finnkupongkoderStartUrl,
        proxyUrls: config.finnkupongkoderProxyUrls,
      }),
    }),
    config.skipLogbuy ? Promise.resolve([]) : collectOffers({
      label: "LogBuy",
      provider: "logbuy",
      run: () => crawlLogbuy({
        domainLookup, generatedAt, logger,
        maxRequestsPerCrawl: config.maxRequestsPerCrawl,
        overrides: providerOverrides, startUrl: config.logbuyStartUrl,
      }),
    }),
    config.skipUsbl ? Promise.resolve([]) : collectOffers({
      label: "USBL",
      provider: "usbl",
      run: () => crawlUsbl({
        domainLookup, generatedAt, logger,
        overrides: providerOverrides, startUrl: config.usblStartUrl,
      }),
    }),
    config.skipBate ? Promise.resolve([]) : collectOffers({
      label: "Bate",
      provider: "bate",
      run: () => crawlBate({
        domainLookup, generatedAt, logger,
        maxRequestsPerCrawl: config.maxRequestsPerCrawl,
        overrides: providerOverrides, startUrl: config.bateStartUrl,
      }),
    }),
    config.skipTobb ? Promise.resolve([]) : collectOffers({
      label: "TOBB",
      provider: "tobb",
      run: () => crawlTobb({
        domainLookup, generatedAt, logger,
        maxRequestsPerCrawl: config.maxRequestsPerCrawl,
        overrides: providerOverrides, startUrl: config.tobbStartUrl,
      }),
    }),
    config.skipNaf ? Promise.resolve([]) : collectOffers({
      label: "NAF",
      provider: "naf",
      run: () => crawlNaf({
        domainLookup, generatedAt, logger,
        overrides: providerOverrides, startUrl: config.nafStartUrl,
      }),
    }),
    config.skipTekna ? Promise.resolve([]) : collectOffers({
      label: "Tekna",
      provider: "tekna",
      run: () => crawlTekna({
        domainLookup, generatedAt, logger,
        maxRequestsPerCrawl: config.maxRequestsPerCrawl,
        overrides: providerOverrides, startUrl: config.teknaStartUrl,
      }),
    }),
    config.skipNito ? Promise.resolve([]) : collectOffers({
      label: "NITO",
      provider: "nito",
      run: () => crawlNito({
        domainLookup, generatedAt, logger,
        maxRequestsPerCrawl: config.maxRequestsPerCrawl,
        overrides: providerOverrides, startUrl: config.nitoStartUrl,
      }),
    }),
    config.skipStudentkortet ? Promise.resolve([]) : collectOffers({
      label: "Studentkortet",
      provider: "studentkortet",
      run: () => crawlStudentkortet({
        domainLookup, generatedAt, logger,
        overrides: providerOverrides, startUrl: config.studentkortetStartUrl,
      }),
    }),
    config.skipNettbonus ? Promise.resolve([]) : collectOffers({
      label: "Nettbonus",
      provider: "nettbonus",
      run: () => crawlNettbonus({
        domainLookup, generatedAt, logger,
        overrides: providerOverrides, startUrl: config.nettbonusStartUrl,
      }),
    }),
    config.skipRabble ? Promise.resolve([]) : collectOffers({
      label: "Rabble",
      provider: "rabble",
      run: () => crawlRabble({
        domainLookup, generatedAt, logger,
        overrides: providerOverrides,
      }),
    }),
    config.skipStudentTorget ? Promise.resolve([]) : collectOffers({
      label: "StudentTorget",
      provider: "studenttorget",
      run: () => crawlStudentTorget({
        domainLookup, generatedAt, logger,
        overrides: providerOverrides,
      }),
    }),
    config.skipElkjop ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "Elkjøp",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "elkjop",
      reusePreviousOnFailure: true,
      run: () => crawlElkjop({
        domainLookup, generatedAt, logger,
        overrides: providerOverrides, proxyUrls: config.elkjopProxyUrls,
        startUrl: config.elkjopStartUrl,
      }),
    }),
    config.skipAkademikerne ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "Akademikerne Pluss",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "akademikerne",
      reusePreviousOnFailure: true,
      run: () => fetchAkademikerne({
        domainLookup, generatedAt, logger,
        overrides: providerOverrides,
      }),
    }),
    config.skipHuseierne ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "Huseierne",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "huseierne",
      reusePreviousOnFailure: true,
      run: () => fetchHuseierne({
        domainLookup, generatedAt, logger,
        overrides: providerOverrides,
      }),
    }),
    config.skipHuseierforbundet ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "Norges Huseierforbund",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "huseierforbundet",
      reusePreviousOnFailure: true,
      run: () => fetchHuseierforbundet({
        domainLookup, generatedAt, logger,
        overrides: providerOverrides,
      }),
    }),
    config.skipAmcar ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "AMCAR",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "amcar",
      reusePreviousOnFailure: true,
      run: () => fetchAmcar({
        domainLookup, generatedAt, logger,
        overrides: providerOverrides,
      }),
    }),
    config.skipHorselsforbundet ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "Hørselsforbundet",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "horselsforbundet",
      reusePreviousOnFailure: true,
      run: () => fetchHorselsforbundet({
        domainLookup, generatedAt, logger,
        overrides: providerOverrides,
      }),
    }),
    config.skipKnbf ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "KNBF",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "knbf",
      reusePreviousOnFailure: true,
      run: () => fetchKnbf({
        domainLookup, generatedAt, logger,
        overrides: providerOverrides,
      }),
    }),
    config.skipNjff ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "NJFF",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "njff",
      reusePreviousOnFailure: true,
      run: () => crawlNjff({
        domainLookup, generatedAt, logger,
        maxRequestsPerCrawl: config.maxRequestsPerCrawl,
        overrides: providerOverrides, startUrl: config.njffStartUrl,
      }),
    }),
    config.skipPensjonistforbundet ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "Pensjonistforbundet",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "pensjonistforbundet",
      reusePreviousOnFailure: true,
      run: () => fetchPensjonistforbundet({
        domainLookup, generatedAt, logger,
        overrides: providerOverrides,
      }),
    }),
    config.skipKna ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "KNA",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "kna",
      reusePreviousOnFailure: true,
      run: () => fetchKna({
        domainLookup, generatedAt, logger,
        overrides: providerOverrides,
      }),
    }),
    config.skipSyklistforeningen ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "Syklistforeningen",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "syklistforeningen",
      reusePreviousOnFailure: true,
      run: () => fetchSyklistforeningen({
        domainLookup, generatedAt, logger,
        overrides: providerOverrides,
      }),
    }),
    config.skipRevmatikerforbundet ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "Norsk Revmatikerforbund",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "revmatikerforbundet",
      reusePreviousOnFailure: true,
      run: () => fetchRevmatikerforbundet({
        domainLookup, generatedAt, logger,
        overrides: providerOverrides,
      }),
    }),
    config.skipRedningsselskapet ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "Redningsselskapet",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "redningsselskapet",
      reusePreviousOnFailure: true,
      run: () => fetchRedningsselskapet({
        domainLookup, generatedAt, logger,
        overrides: providerOverrides,
      }),
    }),
    config.skipLhl ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "LHL",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "lhl",
      reusePreviousOnFailure: true,
      run: () => fetchLhl({
        domainLookup, generatedAt, logger,
        overrides: providerOverrides,
      }),
    }),
    config.skipSkiforeningen ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "Skiforeningen",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "skiforeningen",
      reusePreviousOnFailure: true,
      run: () => fetchSkiforeningen({
        domainLookup, generatedAt, logger,
        overrides: providerOverrides,
      }),
    }),
    config.skipAgrol ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "Agrol",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "agrol",
      reusePreviousOnFailure: true,
      run: () => fetchAgrol({
        domainLookup, generatedAt, logger,
        overrides: providerOverrides,
      }),
    }),
    config.skipKondis ? Promise.resolve([]) : collectOffers({
      fallbackWhenEmpty: true,
      label: "Kondis",
      maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
      provider: "kondis",
      reusePreviousOnFailure: true,
      run: () => fetchKondis({
        domainLookup, generatedAt, logger,
        overrides: providerOverrides,
      }),
    }),
  ]);

  // Phase 4: Spenn needs the widest domain lookup (from Phase 1 + Phase 3)
  const fullDomainLookup = buildDomainLookup([
    ...klarnaOffers, ...rememberOffers, ...tfBankOffers, ...santanderOffers, ...vestboOffers, ...bblOffers, ...elbilOffers, ...ysOffers, ...lofavorOffers, ...norwegianOffers, ...dnbOffers,
    ...dnbSupertilbudOffers, ...norskfamilieOffers, ...obosOffers, ...bobOffers,
    ...sparebank1Offers, ...spareborsenOffers, ...coopOffers, ...manualOffers,
    ...partnerAdsOffers,
    ...tradeTrackerOffers,
    ...awinOffers,
    ...addrevenueOffers,
    ...orionOffers,
    ...daisyconOffers,
    ...tradedoublerOffers,
    ...trumfOffers, ...sasOffers, ...kickbackOffers, ...logbuyOffers,
    ...usblOffers, ...bateOffers, ...tobbOffers, ...nafOffers, ...studentkortetOffers, ...nettbonusOffers,
    ...teknaOffers, ...nitoOffers, ...studentTorgetOffers, ...elkjopOffers, ...akademikerneOffers, ...huseierneOffers, ...huseierforbundetOffers, ...amcarOffers, ...horselsforbundetOffers, ...knbfOffers, ...njffOffers, ...pensjonistforbundetOffers, ...knaOffers, ...syklistforeningenOffers, ...revmatikerforbundetOffers, ...redningsselskapetOffers, ...lhlOffers, ...skiforeningenOffers, ...agrolOffers, ...kondisOffers,
    ...dreamsOffers, ...utdanningibergenOffers, ...unidaysOffers, ...unioOffers, ...rabattkodeOffers, ...cuponationOffers, ...trustdealsOffers,
    ...finnkupongkoderOffers,
  ]);
  logger.info(`Full domain lookup: ${fullDomainLookup.size} merchant names with known domains`);

  const spennOffers = config.skipSpenn ? [] : await collectOffers({
    label: "Spenn",
    provider: "spenn",
    run: () => fetchSpenn({
      domainLookup: fullDomainLookup, generatedAt, logger,
    }),
  });
  logger.info(`Rabattkode: ${rabattkodeOffers.length} discount codes`);

  // Phase 5: Rabatta's public Norwegian catalogue provides exact
  // locale-specific shop ids, so no Swedish, Danish or Finnish variants are
  // accepted by fuzzy search. --rabatta-shops can restrict local test crawls.
  const rabattaOffers = config.skipRabatta ? [] : await collectOffers({
    label: "Rabatta",
    run: () => fetchRabatta({
      generatedAt,
      logger,
      ...(config.rabattaShopSlugs.length === 0
        ? {}
        : { shopSlugs: config.rabattaShopSlugs }),
    }),
  });

  // Phase 6: Coupert is an enrichment source only. It may add cashback to a
  // domain already selected by the Norwegian sources above, but it must never
  // expand the catalogue with unrelated stores from Coupert's global index.
  const offersBeforeCoupert: CashbackOffer[] = [
    ...manualOffers, ...klarnaOffers, ...rememberOffers, ...trumfOffers, ...sasOffers, ...tfBankOffers, ...santanderOffers, ...vestboOffers, ...bblOffers, ...elbilOffers, ...ysOffers, ...lofavorOffers, ...norwegianOffers, ...dnbOffers, ...dnbSupertilbudOffers, ...curveOffers, ...rabattkodeOffers, ...rabattaOffers, ...cuponationOffers, ...trustdealsOffers, ...kickbackOffers, ...finnkupongkoderOffers, ...norskfamilieOffers, ...logbuyOffers, ...obosOffers, ...bobOffers, ...usblOffers, ...bateOffers, ...tobbOffers, ...nafOffers, ...teknaOffers, ...nitoOffers, ...sparebank1Offers, ...studentkortetOffers, ...nettbonusOffers, ...spennOffers, ...spareborsenOffers, ...rabbleOffers, ...dreamsOffers, ...utdanningibergenOffers, ...unidaysOffers, ...unioOffers, ...coopOffers, ...partnerAdsOffers, ...tradeTrackerOffers, ...awinOffers, ...addrevenueOffers, ...orionOffers, ...daisyconOffers, ...tradedoublerOffers, ...studentTorgetOffers, ...elkjopOffers, ...akademikerneOffers, ...huseierneOffers, ...huseierforbundetOffers, ...amcarOffers, ...horselsforbundetOffers, ...knbfOffers, ...njffOffers, ...pensjonistforbundetOffers, ...knaOffers, ...syklistforeningenOffers, ...revmatikerforbundetOffers, ...redningsselskapetOffers, ...lhlOffers, ...skiforeningenOffers, ...agrolOffers, ...kondisOffers,
  ];
  const knownCoupertDomains = new Set(
    offersBeforeCoupert
      .flatMap((offer) => offer.domains)
      .map(normalizeDomainInput)
      .filter((domain) => domain.length > 0),
  );
  const collectedCoupertOffers = config.skipCoupert ? [] : await collectOffers({
    fallbackWhenEmpty: true,
    label: "Coupert",
    maxPreviousOfferAgeDays: STALE_PROVIDER_FALLBACK_MAX_AGE_DAYS,
    provider: "coupert",
    reusePreviousOnFailure: true,
    run: () => fetchCoupert({
      generatedAt,
      knownDomains: knownCoupertDomains,
      logger,
    }),
  });
  const coupertOffers = collectedCoupertOffers.filter((offer) => {
    return (
      offer.discountCode === undefined &&
      offer.domains.length > 0 &&
      offer.domains.every((domain) => {
        return knownCoupertDomains.has(normalizeDomainInput(domain));
      })
    );
  });
  if (coupertOffers.length !== collectedCoupertOffers.length) {
    logger.warn(
      `Coupert: removed ${collectedCoupertOffers.length - coupertOffers.length} stale or out-of-scope offers`,
    );
  }

  const exchangeRates = await fetchNokBaseRates();
  logger.info(exchangeRates === undefined
    ? "Exchange rates: using static fallback for fixed reward sorting"
    : "Exchange rates: fetched live NOK base rates for fixed reward sorting");
  const offers = uniqueOffers(addFixedRewardSortValues(
    [...offersBeforeCoupert, ...coupertOffers],
    exchangeRates ?? STATIC_NOK_BASE_RATES,
  ));

  const offersWithoutReward = offers.filter((o) => !o.reward);
  if (offersWithoutReward.length > 0) {
    logger.warn(`${offersWithoutReward.length} offers have no reward:`);
    for (const o of offersWithoutReward) {
      logger.warn(`  [${o.provider}] ${o.merchantName} (${o.sourceUrl})`);
    }
  }

  // Read domain redirect mappings (maintained via src/scripts/check-redirects.ts)
  const domainRedirects = await readDomainRedirects(
    resolve("data/domain-redirects.json"),
  );
  logger.info(`Domain redirects: ${Object.keys(domainRedirects).length} mappings loaded`);

  const cashbackIndex = buildCashbackIndex(offers, generatedAt, domainRedirects, buildProviderMeta());

  await writeJsonFile(config.outputPath, cashbackIndex);
  logger.info(
    `Wrote ${cashbackIndex.offers.length} offers to ${config.outputPath}`,
  );

  const siteIndexPath = resolve("site/cashback-index.json");
  await copyFile(config.outputPath, siteIndexPath);
  logger.info(`Copied index to ${siteIndexPath}`);
}

function readCliConfig(args: string[]): CliConfig {
  return {
    outputPath: resolve(readArgumentValue(args, "--output") ?? "data/cashback-index.json"),
    manualOffersPath: resolve(
      readArgumentValue(args, "--manual-offers") ?? "data/manual-offers.json",
    ),
    providerOverridesPath: resolve(
      readArgumentValue(args, "--provider-overrides") ??
        "data/provider-overrides.json",
    ),
    klarnaStartUrl:
      readArgumentValue(args, "--klarna-start-url") ??
      "https://www.klarna.com/no/store/?type=CASHBACK",
    klarnaMaxPages: readPositiveIntegerArgument(
      args,
      "--klarna-max-pages",
      5,
    ),
    klarnaProxyUrls: buildScraperApiProxyUrls(),
    rememberStartUrl:
      readArgumentValue(args, "--remember-start-url") ??
      "https://www.remember.no/reward/rabatt",
    trumfStartUrl:
      readArgumentValue(args, "--trumf-start-url") ??
      "https://trumfnetthandel.no/kategori",
    sasApiUrl:
      readArgumentValue(args, "--sas-api-url") ??
      "https://onlineshopping.loyaltykey.com/api/v1/shops?filter%5Bchannel%5D=SAS&filter%5Blanguage%5D=nb&filter%5Bcountry%5D=NO&filter%5Bamount%5D=5000",
    tfBankApiUrl:
      readArgumentValue(args, "--tfbank-api-url") ??
      "https://tfbank.dealpass.no/ajax/deals",
    santanderApiUrl:
      readArgumentValue(args, "--santander-api-url") ??
      "https://santander.dealpass.no/ajax/deals",
    vestboApiUrl:
      readArgumentValue(args, "--vestbo-api-url") ??
      "https://vestbo.no/wp-json/wp/v2/pages/9544",
    bblPageUrl:
      readArgumentValue(args, "--bbl-page-url") ??
      "https://fordelerformedlemmer.no/kbbl",
    elbilApiUrl:
      readArgumentValue(args, "--elbil-api-url") ??
      "https://elbil.no/wp-json/wp/v2/membership-benefit",
    ysApiUrl:
      readArgumentValue(args, "--ys-api-url") ??
      "https://ys.no/wp-json/wp/v2/pages?slug=medlemsfordeler&_fields=id,title,content",
    lofavorStartUrl:
      readArgumentValue(args, "--lofavor-start-url") ??
      "https://www.lofavor.no/home",
    norwegianApiUrl:
      readArgumentValue(args, "--norwegian-api-url") ??
      "https://www.norwegian.com/api/gridlist",
    norwegianGridListId: readPositiveIntegerArgument(
      args,
      "--norwegian-gridlist-id",
      310184,
    ),
    maxRequestsPerCrawl: readPositiveIntegerArgument(
      args,
      "--max-requests",
      250,
    ),
    skipKlarna: args.includes("--skip-klarna"),
    skipRemember: args.includes("--skip-remember"),
    skipTrumf: args.includes("--skip-trumf"),
    skipSas: args.includes("--skip-sas"),
    skipTfBank: args.includes("--skip-tfbank"),
    skipSantander: args.includes("--skip-santander"),
    skipVestbo: args.includes("--skip-vestbo"),
    skipBbl: args.includes("--skip-bbl"),
    skipElbil: args.includes("--skip-elbil"),
    skipYs: args.includes("--skip-ys"),
    skipLofavor: args.includes("--skip-lofavor"),
    skipNorwegian: args.includes("--skip-norwegian"),
    skipCuponation: args.includes("--skip-cuponation"),
    skipDnb: args.includes("--skip-dnb"),
    skipCurve: args.includes("--skip-curve"),
    skipFinnkupongkoder: args.includes("--skip-finnkupongkoder"),
    skipKickback: args.includes("--skip-kickback"),
    skipRabattkode: args.includes("--skip-rabattkode"),
    skipNorskfamilie: args.includes("--skip-norskfamilie"),
    skipTrustdeals: args.includes("--skip-trustdeals"),
    skipLogbuy: args.includes("--skip-logbuy"),
    skipObos: args.includes("--skip-obos"),
    skipBob: args.includes("--skip-bob"),
    skipUsbl: args.includes("--skip-usbl"),
    skipBate: args.includes("--skip-bate"),
    skipTobb: args.includes("--skip-tobb"),
    skipNaf: args.includes("--skip-naf"),
    skipTekna: args.includes("--skip-tekna"),
    skipNito: args.includes("--skip-nito"),
    skipSparebank1: args.includes("--skip-sparebank1"),
    skipStudentkortet: args.includes("--skip-studentkortet"),
    skipNettbonus: args.includes("--skip-nettbonus"),
    skipSpenn: args.includes("--skip-spenn"),
    skipSpareborsen: args.includes("--skip-spareborsen"),
    skipRabble: args.includes("--skip-rabble"),
    skipDreams: args.includes("--skip-dreams"),
    skipUtdanningibergen: args.includes("--skip-utdanningibergen"),
    skipUnidays: args.includes("--skip-unidays"),
    skipDnbSupertilbud: args.includes("--skip-dnb-supertilbud"),
    skipStudentTorget: args.includes("--skip-studenttorget"),
    skipUnio: args.includes("--skip-unio"),
    skipCoop: args.includes("--skip-coop"),
    skipElkjop: args.includes("--skip-elkjop"),
    skipAkademikerne: args.includes("--skip-akademikerne"),
    skipHuseierne: args.includes("--skip-huseierne"),
    skipHuseierforbundet: args.includes("--skip-huseierforbundet"),
    skipAmcar: args.includes("--skip-amcar"),
    skipHorselsforbundet: args.includes("--skip-horselsforbundet"),
    skipKnbf: args.includes("--skip-knbf"),
    skipNjff: args.includes("--skip-njff"),
    skipPensjonistforbundet: args.includes("--skip-pensjonistforbundet"),
    skipKna: args.includes("--skip-kna"),
    skipSyklistforeningen: args.includes("--skip-syklistforeningen"),
    skipRevmatikerforbundet: args.includes("--skip-revmatikerforbundet"),
    skipRedningsselskapet: args.includes("--skip-redningsselskapet"),
    skipLhl: args.includes("--skip-lhl"),
    skipSkiforeningen: args.includes("--skip-skiforeningen"),
    skipAgrol: args.includes("--skip-agrol"),
    skipKondis: args.includes("--skip-kondis"),
    skipPartnerAds: args.includes("--skip-partnerads"),
    skipTradeTracker: args.includes("--skip-tradetracker"),
    skipAwin: args.includes("--skip-awin"),
    skipAddrevenue: args.includes("--skip-addrevenue"),
    skipOrion: args.includes("--skip-orion"),
    skipDaisycon: args.includes("--skip-daisycon"),
    skipTradedoubler: args.includes("--skip-tradedoubler"),
    skipCoupert: args.includes("--skip-coupert"),
    skipRabatta: args.includes("--skip-rabatta"),
    rabattaShopSlugs: readCommaSeparatedArgument(args, "--rabatta-shops"),
    dnbPageDataUrl:
      readArgumentValue(args, "--dnb-page-data-url") ??
      "https://www.dnb.no/web/page-data/kundeprogram/fordeler/faste-rabatter/page-data.json",
    dnbSupertilbudPageDataUrl:
      readArgumentValue(args, "--dnb-supertilbud-page-data-url") ??
      "https://www.dnb.no/web/page-data/kundeprogram/fordeler/supertilbud/manedens-tilbud/page-data.json",
    cuponationStartUrl:
      readArgumentValue(args, "--cuponation-start-url") ??
      "https://www.cuponation.no/topp-20",
    finnkupongkoderStartUrl:
      readArgumentValue(args, "--finnkupongkoder-start-url") ??
      "https://www.finnkupongkoder.no/top",
    finnkupongkoderProxyUrls: buildScraperApiProxyUrls(),
    kickbackStartUrl:
      readArgumentValue(args, "--kickback-start-url") ??
      "https://kickback.no/",
    trustdealsStartUrl:
      readArgumentValue(args, "--trustdeals-start-url") ??
      "https://www.trustdeals.no/",
    logbuyStartUrl:
      readArgumentValue(args, "--logbuy-start-url") ??
      "https://logbuy.no/rabatter",
    obosStartUrl:
      readArgumentValue(args, "--obos-start-url") ??
      "https://www.obos.no/medlem/medlemsfordeler",
    bobStartUrl:
      readArgumentValue(args, "--bob-start-url") ??
      "https://bob.no/medlem-og-beboer/medlemsfordeler/",
    usblStartUrl:
      readArgumentValue(args, "--usbl-start-url") ??
      "https://www.usbl.no/medlemskap/medlemsfordeler",
    bateStartUrl:
      readArgumentValue(args, "--bate-start-url") ??
      "https://bate.no/fordeler",
    tobbStartUrl:
      readArgumentValue(args, "--tobb-start-url") ??
      "https://tobb.no/fordeler/",
    nafStartUrl:
      readArgumentValue(args, "--naf-start-url") ??
      "https://www.naf.no/medlemskap/medlemsfordeler",
    teknaStartUrl:
      readArgumentValue(args, "--tekna-start-url") ??
      "https://www.tekna.no/medlemsfordeler/",
    nitoStartUrl:
      readArgumentValue(args, "--nito-start-url") ??
      "https://www.nito.no/medlemskap-og-fordeler/medlemsfordeler/",
    sparebank1StartUrl:
      readArgumentValue(args, "--sparebank1-start-url") ??
      "https://www.sparebank1.no/nb/bank/privat/kundeservice/kort/strommetjenester-rabatt.html",
    studentkortetStartUrl:
      readArgumentValue(args, "--studentkortet-start-url") ??
      "https://studentkortet.no/rabatter",
    nettbonusStartUrl:
      readArgumentValue(args, "--nettbonus-start-url") ??
      "https://nettbonus.no/private/category/all",
    elkjopStartUrl:
      readArgumentValue(args, "--elkjop-start-url") ??
      "https://www.elkjop.no/kundeklubb/partner-tilbud",
    elkjopProxyUrls: buildScraperApiProxyUrls(),
    njffStartUrl:
      readArgumentValue(args, "--njff-start-url") ??
      "https://www.njff.no/medlem/medlemsfordeler",
  };
}

function readArgumentValue(args: string[], name: string): string | undefined {
  const nameIndex = args.indexOf(name);

  if (nameIndex === -1) {
    return undefined;
  }

  return args[nameIndex + 1];
}

function readCommaSeparatedArgument(args: string[], name: string): string[] {
  const rawValue = readArgumentValue(args, name);
  if (rawValue === undefined) return [];

  return [...new Set(
    rawValue
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0),
  )];
}

function readPositiveIntegerArgument(
  args: string[],
  name: string,
  fallbackValue: number,
): number {
  const rawValue = readArgumentValue(args, name);

  if (rawValue === undefined) {
    return fallbackValue;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsedValue;
}

function buildScraperApiProxyUrls(): string[] {
  return [
    process.env.SCRAPERAPI_KEY,
    process.env.SCRAPERAPI_KEY2,
    process.env.SCRAPERAPI_KEY3,
  ].flatMap((key) => {
    const trimmedKey = key?.trim();
    if (!trimmedKey) {
      return [];
    }

    return [`http://scraperapi:${encodeURIComponent(trimmedKey)}@proxy-server.scraperapi.com:8001`];
  });
}

main().catch((error: unknown) => {
  const logger = createConsoleLogger();
  const message = error instanceof Error ? error.message : "Unknown error";
  logger.error(message);
  process.exitCode = 1;
});

type CollectProviderOffersOptions = {
  fallbackWhenEmpty?: boolean;
  label: string;
  logger: Logger;
  maxPreviousOfferAgeDays?: number;
  previousOffersByProvider: ReadonlyMap<CashbackProvider, CashbackOffer[]>;
  provider?: CashbackProvider;
  reusePreviousOnFailure?: boolean;
  run: () => CashbackOffer[] | Promise<CashbackOffer[]>;
};

async function collectProviderOffers(
  options: CollectProviderOffersOptions,
): Promise<CashbackOffer[]> {
  let offers: CashbackOffer[];

  try {
    offers = await options.run();
  } catch (error) {
    const message = formatError(error);
    const previousOffers = getReusablePreviousOffers(
      options,
      `failed (${message})`,
    );
    if (previousOffers !== undefined) {
      return previousOffers;
    }

    throw new Error(`${options.label}: failed (${message})`);
  }

  if (
    offers.length === 0 &&
    options.fallbackWhenEmpty === true &&
    options.provider !== undefined
  ) {
    const previousOffers = getReusablePreviousOffers(
      options,
      "produced no offers",
    );
    if (previousOffers !== undefined) {
      return previousOffers;
    }
  }

  return offers;
}

function getReusablePreviousOffers(
  options: CollectProviderOffersOptions,
  reason: string,
): CashbackOffer[] | undefined {
  if (
    options.reusePreviousOnFailure !== true ||
    options.provider === undefined
  ) {
    return undefined;
  }

  const previousOffers =
    options.previousOffersByProvider.get(options.provider) ?? [];
  if (previousOffers.length === 0) {
    throw new Error(
      `${options.label}: ${reason}; no previous offers available for fallback`,
    );
  }

  const newestUpdatedAt = readNewestUpdatedAt(previousOffers);
  if (newestUpdatedAt === undefined) {
    throw new Error(
      `${options.label}: ${reason}; previous offers have no valid updatedAt for fallback`,
    );
  }

  const ageMs = Date.now() - newestUpdatedAt.getTime();
  const maxAgeDays = options.maxPreviousOfferAgeDays;
  if (
    maxAgeDays !== undefined &&
    ageMs > maxAgeDays * 24 * 60 * 60 * 1000
  ) {
    throw new Error(
      `${options.label}: ${reason}; previous offers are ${formatAge(ageMs)} old, above the ${maxAgeDays} day fallback limit`,
    );
  }

  options.logger.warn(
    `${options.label}: ${reason}; keeping ${previousOffers.length} offers from previous index (${formatAge(ageMs)} old)`,
  );
  return previousOffers;
}

async function readPreviousOffersByProvider(
  filePath: string,
  logger: Logger,
): Promise<Map<CashbackProvider, CashbackOffer[]>> {
  try {
    const value = await readJsonFile(filePath);
    if (!isCashbackIndex(value)) {
      logger.warn(`Previous cashback index is invalid; provider fallback disabled for ${filePath}`);
      return new Map();
    }

    const offersByProvider = new Map<CashbackProvider, CashbackOffer[]>();
    for (const offer of value.offers) {
      const existingOffers = offersByProvider.get(offer.provider) ?? [];
      offersByProvider.set(offer.provider, [...existingOffers, offer]);
    }

    logger.info(
      `Loaded previous cashback index fallback data for ${offersByProvider.size} providers`,
    );
    return offersByProvider;
  } catch (error) {
    logger.warn(
      `Previous cashback index unavailable; provider fallback disabled for ${filePath}: ${formatError(error)}`,
    );
    return new Map();
  }
}

function readNewestUpdatedAt(offers: CashbackOffer[]): Date | undefined {
  let newestTime = Number.NEGATIVE_INFINITY;

  for (const offer of offers) {
    const time = Date.parse(offer.updatedAt);
    if (Number.isFinite(time) && time > newestTime) {
      newestTime = time;
    }
  }

  return newestTime === Number.NEGATIVE_INFINITY
    ? undefined
    : new Date(newestTime);
}

function formatAge(ageMs: number): string {
  if (ageMs < 0) {
    return "0 days";
  }

  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  if (ageDays < 1) {
    const ageHours = Math.max(1, Math.round(ageMs / (60 * 60 * 1000)));
    return `${ageHours} hour${ageHours === 1 ? "" : "s"}`;
  }

  const roundedDays = Math.round(ageDays * 10) / 10;
  return `${roundedDays} day${roundedDays === 1 ? "" : "s"}`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
