import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildCashbackIndex,
  type CashbackOffer,
  type CashbackProvider,
  isCashbackIndex,
  uniqueOffers,
} from "../shared/cashback.js";
import {
  fetchNokBaseRates,
  STATIC_NOK_BASE_RATES,
} from "../shared/exchange-rates.js";
import {
  addFixedRewardSortValues,
} from "../shared/reward-calculation.js";
import { buildDomainLookup } from "./domain-lookup.js";
import { readDomainRedirects } from "./domain-redirects.js";
import { readJsonFile, writeJsonFile } from "./json-file.js";
import { createConsoleLogger, type Logger } from "./logger.js";
import { readManualOffers } from "./manual-offers.js";
import { readProviderOverrides } from "./provider-overrides.js";
import { crawlKlarna } from "./providers/klarna.js";
import { crawlRemember } from "./providers/remember.js";
import { fetchSas } from "./providers/sas.js";
import { fetchTfBank } from "./providers/tfbank.js";
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
import { fetchPartnerAds } from "./providers/partnerads.js";
import { fetchTradeTracker } from "./providers/tradetracker.js";
import { fetchAwin } from "./providers/awin.js";
import { fetchAddrevenue } from "./providers/addrevenue.js";

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
  maxRequestsPerCrawl: number;
  skipKlarna: boolean;
  skipRemember: boolean;
  skipTrumf: boolean;
  skipSas: boolean;
  skipTfBank: boolean;
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
  skipPartnerAds: boolean;
  skipTradeTracker: boolean;
  skipAwin: boolean;
  skipAddrevenue: boolean;
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
  const providerOverrides = await readProviderOverrides(
    config.providerOverridesPath,
  );
  // Phase 1: Crawl providers that have real merchant URLs (parallel)
  const [
    klarnaOffers,
    rememberOffers,
    tfBankOffers,
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
      run: () => fetchTfBank({
        generatedAt, logger, apiUrl: config.tfBankApiUrl,
        overrides: providerOverrides,
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
  ]);
  logger.info(`Norskfamilie: ${norskfamilieOffers.length} offers`);

  // Phase 2: Build domain lookup from providers with known-good URLs
  const domainLookup = buildDomainLookup([
    ...klarnaOffers,
    ...rememberOffers,
    ...tfBankOffers,
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
  ]);

  // Phase 4: Spenn needs the widest domain lookup (from Phase 1 + Phase 3)
  const fullDomainLookup = buildDomainLookup([
    ...klarnaOffers, ...rememberOffers, ...tfBankOffers, ...dnbOffers,
    ...dnbSupertilbudOffers, ...norskfamilieOffers, ...obosOffers, ...bobOffers,
    ...sparebank1Offers, ...spareborsenOffers, ...coopOffers, ...manualOffers,
    ...partnerAdsOffers,
    ...tradeTrackerOffers,
    ...awinOffers,
    ...addrevenueOffers,
    ...trumfOffers, ...sasOffers, ...kickbackOffers, ...logbuyOffers,
    ...usblOffers, ...bateOffers, ...tobbOffers, ...nafOffers, ...studentkortetOffers, ...nettbonusOffers,
    ...teknaOffers, ...nitoOffers,
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
  const exchangeRates = await fetchNokBaseRates();
  logger.info(exchangeRates === undefined
    ? "Exchange rates: using static fallback for fixed reward sorting"
    : "Exchange rates: fetched live NOK base rates for fixed reward sorting");
  const offers = uniqueOffers(addFixedRewardSortValues(
    [...manualOffers, ...klarnaOffers, ...rememberOffers, ...trumfOffers, ...sasOffers, ...tfBankOffers, ...dnbOffers, ...dnbSupertilbudOffers, ...curveOffers, ...rabattkodeOffers, ...cuponationOffers, ...trustdealsOffers, ...kickbackOffers, ...finnkupongkoderOffers, ...norskfamilieOffers, ...logbuyOffers, ...obosOffers, ...bobOffers, ...usblOffers, ...bateOffers, ...tobbOffers, ...nafOffers, ...teknaOffers, ...nitoOffers, ...sparebank1Offers, ...studentkortetOffers, ...nettbonusOffers, ...spennOffers, ...spareborsenOffers, ...rabbleOffers, ...dreamsOffers, ...utdanningibergenOffers, ...unidaysOffers, ...unioOffers, ...coopOffers, ...partnerAdsOffers, ...tradeTrackerOffers, ...awinOffers, ...addrevenueOffers, ...studentTorgetOffers],
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

  const cashbackIndex = buildCashbackIndex(offers, generatedAt, domainRedirects);

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
    skipPartnerAds: args.includes("--skip-partnerads"),
    skipTradeTracker: args.includes("--skip-tradetracker"),
    skipAwin: args.includes("--skip-awin"),
    skipAddrevenue: args.includes("--skip-addrevenue"),
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
  };
}

function readArgumentValue(args: string[], name: string): string | undefined {
  const nameIndex = args.indexOf(name);

  if (nameIndex === -1) {
    return undefined;
  }

  return args[nameIndex + 1];
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
