import { readJsonFile } from "./json-file.js";

/**
 * Reads the domain redirect map from data/domain-redirects.json.
 * This file maps source domains to their redirect targets, so offers
 * can be merged across both variants (e.g. makeupmekka.no → makeupmekka.com).
 *
 * Run `npx tsx src/scripts/check-redirects.ts` locally to refresh the file.
 */
export async function readDomainRedirects(
  filePath: string,
): Promise<Record<string, string>> {
  const value = await readJsonFile(filePath);

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid domain redirects JSON: ${filePath}`);
  }

  return value as Record<string, string>;
}
