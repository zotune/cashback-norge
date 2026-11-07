// Manual site deploys reuse the published catalogue and its clipboard image assets.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cachePrisjaktCopyImages, isPrisjaktDealsCatalog } from "../backend/prisjakt-deals.js";
import { cacheGroceryImages, isGroceryOffersCatalog } from "../backend/grocery-offers.js";
import { pruneOfferImages } from "../backend/offer-images.js";
import { createDealMerchantLookup } from "../shared/deal-merchants.js";
import { isCashbackIndex } from "../shared/cashback.js";
import { isProductDealsCatalog } from "../shared/product-deals.js";
import { cacheProductDealImages } from "../backend/product-deals.js";

const file = resolve(process.argv[2] ?? "_site/prisjakt-deals.json");
const directory = resolve(process.argv[3] ?? "_site/offer-images");
const catalog: unknown = await readFile(file, "utf8").then(JSON.parse).catch(() => undefined);
const index: unknown = await readFile(resolve(file, "../cashback-index.json"), "utf8").then(JSON.parse).catch(() => undefined);
const result = isPrisjaktDealsCatalog(catalog) ? await cachePrisjaktCopyImages(catalog, { generatedAt: catalog.generatedAt, copyImageDirectory: directory, logger: { info: console.log, warn: console.warn, error: console.error }, ...(isCashbackIndex(index) ? { merchantDomain: createDealMerchantLookup(index) } : {}) }) : undefined;
if (result) await writeFile(file, JSON.stringify(result));
const groceryFile = resolve(file, "../grocery-offers.json");
const grocery: unknown = await readFile(groceryFile, "utf8").then(JSON.parse).catch(() => undefined);
const paths = result?.deals.flatMap(deal => [deal.imageUrl, deal.storeIconUrl]) ?? [];
const combinedFile = resolve(file, "../product-deals.json");
const combined: unknown = await readFile(combinedFile, "utf8").then(JSON.parse).catch(() => undefined);
if (isProductDealsCatalog(combined)) {
  const rows = await cacheProductDealImages(combined.deals.flatMap(deal => deal.sources), {
    logger: console, imageDirectory: directory,
    ...(isCashbackIndex(index) ? { merchantDomain: createDealMerchantLookup(index) } : {}),
  });
  const byId = new Map(rows.map(row => [`${row.source}:${row.id}`, row]));
  const deals = combined.deals.map(deal => ({ ...deal, ...byId.get(`${deal.source}:${deal.id}`), rank: deal.rank,
    sources: deal.sources.map(source => byId.get(`${source.source}:${source.id}`) ?? source),
  }));
  await writeFile(combinedFile, JSON.stringify({ ...combined, deals }));
  paths.push(...rows.flatMap(row => [row.imageUrl, row.storeIconUrl]));
}
if (!result && !isProductDealsCatalog(combined)) throw new Error("No usable product catalogue to prepare");
if (isGroceryOffersCatalog(grocery)) {
  const cached = await cacheGroceryImages(grocery, { directory, logger: console });
  await writeFile(groceryFile, JSON.stringify(cached));
  paths.push(...cached.offers.map(offer => offer.imageUrl));
}
await pruneOfferImages(paths, directory);
