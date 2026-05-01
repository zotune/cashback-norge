import { resolve } from "node:path";
import { buildCashbackIndex, uniqueOffers } from "../shared/cashback.js";
import { writeJsonFile } from "./json-file.js";
import { createConsoleLogger } from "./logger.js";
import { readManualOffers } from "./manual-offers.js";
import { readProviderOverrides } from "./provider-overrides.js";
import { crawlKlarna } from "./providers/klarna.js";
import { crawlRemember } from "./providers/remember.js";
import { fetchSas } from "./providers/sas.js";
import { crawlTrumf } from "./providers/trumf.js";

type CliConfig = {
  outputPath: string;
  manualOffersPath: string;
  providerOverridesPath: string;
  klarnaStartUrl: string;
  klarnaMaxPages: number;
  rememberStartUrl: string;
  trumfStartUrl: string;
  sasApiUrl: string;
  maxRequestsPerCrawl: number;
  skipKlarna: boolean;
  skipRemember: boolean;
  skipTrumf: boolean;
  skipSas: boolean;
};

async function main(): Promise<void> {
  const logger = createConsoleLogger();
  const config = readCliConfig(process.argv.slice(2));
  const generatedAt = new Date().toISOString();
  const manualOffers = await readManualOffers(config.manualOffersPath);
  const providerOverrides = await readProviderOverrides(
    config.providerOverridesPath,
  );
  const klarnaOffers = config.skipKlarna
    ? []
    : await crawlKlarna({
        generatedAt,
        logger,
        maxPages: config.klarnaMaxPages,
        overrides: providerOverrides,
        startUrl: config.klarnaStartUrl,
      });
  const rememberOffers = config.skipRemember
    ? []
    : await crawlRemember({
        generatedAt,
        logger,
        maxRequestsPerCrawl: config.maxRequestsPerCrawl,
        overrides: providerOverrides,
        startUrl: config.rememberStartUrl,
      });
  const trumfOffers = config.skipTrumf
    ? []
    : await crawlTrumf({
        generatedAt,
        logger,
        maxRequestsPerCrawl: config.maxRequestsPerCrawl,
        overrides: providerOverrides,
        startUrl: config.trumfStartUrl,
      });
  const sasOffers = config.skipSas
    ? []
    : await fetchSas({
        generatedAt,
        logger,
        overrides: providerOverrides,
        apiUrl: config.sasApiUrl,
      });
  const offers = uniqueOffers([...manualOffers, ...klarnaOffers, ...rememberOffers, ...trumfOffers, ...sasOffers]);
  const cashbackIndex = buildCashbackIndex(offers, generatedAt);

  await writeJsonFile(config.outputPath, cashbackIndex);
  logger.info(
    `Wrote ${cashbackIndex.offers.length} offers to ${config.outputPath}`,
  );
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
    maxRequestsPerCrawl: readPositiveIntegerArgument(
      args,
      "--max-requests",
      250,
    ),
    skipKlarna: args.includes("--skip-klarna"),
    skipRemember: args.includes("--skip-remember"),
    skipTrumf: args.includes("--skip-trumf"),
    skipSas: args.includes("--skip-sas"),
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
