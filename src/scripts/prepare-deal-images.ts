// Manual site deploys reuse the published catalogue and its clipboard image assets.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cachePrisjaktCopyImages, isPrisjaktDealsCatalog } from "../backend/prisjakt-deals.js";

const file = resolve(process.argv[2] ?? "_site/prisjakt-deals.json");
const directory = resolve(process.argv[3] ?? "_site/deal-images");
const catalog: unknown = JSON.parse(await readFile(file, "utf8"));
if (!isPrisjaktDealsCatalog(catalog)) throw new Error(`Invalid Prisjakt catalogue: ${file}`);
const result = await cachePrisjaktCopyImages(catalog, { generatedAt: catalog.generatedAt, copyImageDirectory: directory, logger: { info: console.log, warn: console.warn, error: console.error } });
await writeFile(file, JSON.stringify(result));
