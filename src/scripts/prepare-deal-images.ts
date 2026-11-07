// Manual site deploys reuse the published catalogue and its clipboard image assets.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cachePrisjaktCopyImages, isPrisjaktDealsCatalog } from "../backend/prisjakt-deals.js";
import { cacheGroceryImages, isGroceryOffersCatalog } from "../backend/grocery-offers.js";
import { pruneOfferImages } from "../backend/offer-images.js";
import { createDealMerchantLookup } from "../shared/deal-merchants.js";
import { isCashbackIndex } from "../shared/cashback.js";

const file = resolve(process.argv[2] ?? "_site/prisjakt-deals.json");
const directory = resolve(process.argv[3] ?? "_site/offer-images");
const catalog: unknown = JSON.parse(await readFile(file, "utf8"));
if (!isPrisjaktDealsCatalog(catalog)) throw new Error(`Invalid Prisjakt catalogue: ${file}`);
const index: unknown = await readFile(resolve(file, "../cashback-index.json"), "utf8").then(JSON.parse).catch(() => undefined);
const result = await cachePrisjaktCopyImages(catalog, { generatedAt: catalog.generatedAt, copyImageDirectory: directory, logger: { info: console.log, warn: console.warn, error: console.error }, ...(isCashbackIndex(index) ? { merchantDomain: createDealMerchantLookup(index) } : {}) });
await writeFile(file, JSON.stringify(result));
const groceryFile = resolve(file, "../grocery-offers.json");
const grocery: unknown = await readFile(groceryFile, "utf8").then(JSON.parse).catch(() => undefined);
const paths = result.deals.flatMap(deal => [deal.imageUrl, deal.storeIconUrl]);
if (isGroceryOffersCatalog(grocery)) {
  const cached = await cacheGroceryImages(grocery, { directory, logger: console });
  await writeFile(groceryFile, JSON.stringify(cached));
  paths.push(...cached.offers.map(offer => offer.imageUrl));
}
await pruneOfferImages(paths, directory);
