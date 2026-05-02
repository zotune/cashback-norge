import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildCashbackIndex, uniqueOffers } from "../shared/cashback.js";
import { buildDomainLookup } from "./domain-lookup.js";
import { writeJsonFile } from "./json-file.js";
import { createConsoleLogger } from "./logger.js";
import { readManualOffers } from "./manual-offers.js";
import { readProviderOverrides } from "./provider-overrides.js";
import { crawlKlarna } from "./providers/klarna.js";
import { crawlRemember } from "./providers/remember.js";
import { fetchSas } from "./providers/sas.js";
import { fetchTfBank } from "./providers/tfbank.js";
import { crawlTrumf } from "./providers/trumf.js";
import { crawlCuponation } from "./providers/cuponation.js";
import { fetchDnb } from "./providers/dnb.js";
import { fetchCurve } from "./providers/curve.js";
import { crawlFinnkupongkoder } from "./providers/finnkupongkoder.js";
import { crawlKickback } from "./providers/kickback.js";
import { crawlRabattkode } from "./providers/rabattkode.js";
import { crawlNorskfamilie } from "./providers/norskfamilie.js";
import { crawlTrustdeals } from "./providers/trustdeals.js";
import { crawlLogbuy } from "./providers/logbuy.js";
import { crawlObos } from "./providers/obos.js";
import { crawlNaf } from "./providers/naf.js";

type CliConfig = {
  outputPath: string;
  manualOffersPath: string;
  providerOverridesPath: string;
  klarnaStartUrl: string;
  klarnaMaxPages: number;
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
  skipNaf: boolean;
  dnbPageDataUrl: string;
  cuponationStartUrl: string;
  finnkupongkoderStartUrl: string;
  kickbackStartUrl: string;
  trustdealsStartUrl: string;
  logbuyStartUrl: string;
  obosStartUrl: string;
  nafStartUrl: string;
};

async function main(): Promise<void> {
  const logger = createConsoleLogger();
  const config = readCliConfig(process.argv.slice(2));
  const generatedAt = new Date().toISOString();
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
    norskfamilieOffers,
    obosOffers,
  ] = await Promise.all([
    config.skipKlarna ? Promise.resolve([]) : crawlKlarna({
        generatedAt, logger, maxPages: config.klarnaMaxPages,
        overrides: providerOverrides, startUrl: config.klarnaStartUrl,
      }),
    config.skipRemember ? Promise.resolve([]) : crawlRemember({
        generatedAt, logger, maxRequestsPerCrawl: config.maxRequestsPerCrawl,
        overrides: providerOverrides, startUrl: config.rememberStartUrl,
      }),
    config.skipTfBank ? Promise.resolve([]) : fetchTfBank({
        generatedAt, logger, apiUrl: config.tfBankApiUrl,
        overrides: providerOverrides,
      }),
    config.skipDnb ? Promise.resolve([]) : fetchDnb({
        generatedAt, logger, pageDataUrl: config.dnbPageDataUrl,
      }),
    config.skipNorskfamilie ? Promise.resolve([]) : crawlNorskfamilie(),
    config.skipObos ? Promise.resolve([]) : crawlObos({
        generatedAt, logger, maxRequestsPerCrawl: config.maxRequestsPerCrawl,
        overrides: providerOverrides, startUrl: config.obosStartUrl,
      }),
  ]);
  logger.info(`Norskfamilie: ${norskfamilieOffers.length} offers`);

  // Phase 2: Build domain lookup from providers with known-good URLs
  const domainLookup = buildDomainLookup([
    ...klarnaOffers,
    ...rememberOffers,
    ...tfBankOffers,
    ...dnbOffers,
    ...norskfamilieOffers,
    ...obosOffers,
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
    nafOffers,
  ] = await Promise.all([
    config.skipTrumf ? Promise.resolve([]) : crawlTrumf({
        generatedAt, logger, maxRequestsPerCrawl: config.maxRequestsPerCrawl,
        overrides: providerOverrides, startUrl: config.trumfStartUrl, domainLookup,
      }),
    config.skipSas ? Promise.resolve([]) : fetchSas({
        generatedAt, logger, overrides: providerOverrides,
        apiUrl: config.sasApiUrl, domainLookup,
      }),
    Promise.resolve(config.skipCurve ? [] : fetchCurve({ generatedAt, logger })),
    config.skipRabattkode ? Promise.resolve([]) : crawlRabattkode(),
    config.skipCuponation ? Promise.resolve([]) : crawlCuponation({
        generatedAt, logger, startUrl: config.cuponationStartUrl,
      }),
    config.skipTrustdeals ? Promise.resolve([]) : crawlTrustdeals({
        generatedAt, logger, startUrl: config.trustdealsStartUrl,
      }),
    config.skipKickback ? Promise.resolve([]) : crawlKickback({
        domainLookup, generatedAt, logger,
        maxRequestsPerCrawl: config.maxRequestsPerCrawl, startUrl: config.kickbackStartUrl,
      }),
    config.skipFinnkupongkoder ? Promise.resolve([]) : crawlFinnkupongkoder({
        generatedAt, logger,
        maxRequestsPerCrawl: config.maxRequestsPerCrawl, startUrl: config.finnkupongkoderStartUrl,
      }),
    config.skipLogbuy ? Promise.resolve([]) : crawlLogbuy({
        domainLookup, generatedAt, logger,
        maxRequestsPerCrawl: config.maxRequestsPerCrawl,
        overrides: providerOverrides, startUrl: config.logbuyStartUrl,
      }),
    config.skipNaf ? Promise.resolve([]) : crawlNaf({
        domainLookup, generatedAt, logger,
        overrides: providerOverrides, startUrl: config.nafStartUrl,
      }),
  ]);
  logger.info(`Rabattkode: ${rabattkodeOffers.length} discount codes`);
  const offers = uniqueOffers([...manualOffers, ...klarnaOffers, ...rememberOffers, ...trumfOffers, ...sasOffers, ...tfBankOffers, ...dnbOffers, ...curveOffers, ...rabattkodeOffers, ...cuponationOffers, ...trustdealsOffers, ...kickbackOffers, ...finnkupongkoderOffers, ...norskfamilieOffers, ...logbuyOffers, ...obosOffers, ...nafOffers]);
  const cashbackIndex = buildCashbackIndex(offers, generatedAt);

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
    skipNaf: args.includes("--skip-naf"),
    dnbPageDataUrl:
      readArgumentValue(args, "--dnb-page-data-url") ??
      "https://www.dnb.no/web/page-data/kundeprogram/fordeler/faste-rabatter/page-data.json",
    cuponationStartUrl:
      readArgumentValue(args, "--cuponation-start-url") ??
      "https://www.cuponation.no/topp-20",
    finnkupongkoderStartUrl:
      readArgumentValue(args, "--finnkupongkoder-start-url") ??
      "https://www.finnkupongkoder.no/top",
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
    nafStartUrl:
      readArgumentValue(args, "--naf-start-url") ??
      "https://www.naf.no/medlemskap/medlemsfordeler",
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

main().catch((error: unknown) => {
  const logger = createConsoleLogger();
  const message = error instanceof Error ? error.message : "Unknown error";
  logger.error(message);
  process.exitCode = 1;
});
