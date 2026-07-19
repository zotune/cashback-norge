import { resolve } from "node:path";
import {
  buildCashbackIndex,
  isCashbackIndex,
  parseUrl,
} from "../shared/cashback.js";
import { buildProviderMeta } from "../shared/provider-data.js";
import { readDomainRedirects } from "../backend/domain-redirects.js";
import { readJsonFile, writeJsonFile } from "../backend/json-file.js";
import { createConsoleLogger } from "../backend/logger.js";
import { fetchRabatta } from "../backend/providers/rabatta.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const allShops = args.includes("--all");
  const writeSitePreview = args.includes("--write-site");
  const shopSlugs = args.filter((value) => !value.startsWith("--"));
  const selectedShops = allShops
    ? undefined
    : shopSlugs.length > 0
      ? shopSlugs
      : ["lyko", "temu"];
  const logger = createConsoleLogger();
  const generatedAt = new Date().toISOString();
  const offers = await fetchRabatta({
    generatedAt,
    logger,
    ...(selectedShops === undefined ? {} : { shopSlugs: selectedShops }),
  });

  if (writeSitePreview) {
    const currentIndex = await readJsonFile(resolve("data/cashback-index.json"));
    if (!isCashbackIndex(currentIndex)) {
      throw new Error("data/cashback-index.json is not a valid cashback index");
    }

    const nonRabattaOffers = currentIndex.offers.filter((offer) => {
      const source = parseUrl(offer.sourceUrl);
      return source?.hostname !== "rabatta.app";
    });
    const domainRedirects = await readDomainRedirects(
      resolve("data/domain-redirects.json"),
    );
    const previewIndex = buildCashbackIndex(
      [...nonRabattaOffers, ...offers],
      generatedAt,
      domainRedirects,
      { ...currentIndex.providers, ...buildProviderMeta() },
    );
    const previewPath = resolve("site/cashback-index.json");
    await writeJsonFile(previewPath, previewIndex);
    console.info(
      `Rabatta preview: wrote ${offers.length} codes to ${previewPath}`,
    );
    return;
  }

  console.info(JSON.stringify(offers, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Rabatta test failed: ${message}`);
  process.exitCode = 1;
});
