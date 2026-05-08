/**
 * Local script to check all domains in cashback-index.json for HTTP redirects
 * and update data/domain-redirects.json with the results.
 *
 * Usage: npx tsx src/scripts/check-redirects.ts
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const INDEX_PATH = resolve("data/cashback-index.json");
const REDIRECTS_PATH = resolve("data/domain-redirects.json");
const BATCH_SIZE = 30;
const TIMEOUT_MS = 8000;

async function main(): Promise<void> {
  const index = JSON.parse(await readFile(INDEX_PATH, "utf-8"));
  const domains: string[] = [
    ...new Set(
      (index.offers as { domains: string[] }[]).flatMap((o) => o.domains),
    ),
  ].sort();

  console.log(`Checking ${domains.length} domains for redirects...`);

  const existing: Record<string, string> = JSON.parse(
    await readFile(REDIRECTS_PATH, "utf-8"),
  );

  const redirects: Record<string, string> = {};
  let checked = 0;

  for (let i = 0; i < domains.length; i += BATCH_SIZE) {
    const batch = domains.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(checkRedirect));
    for (const r of results) {
      if (r) redirects[r.from] = r.to;
    }
    checked += batch.length;
    process.stdout.write(`\r  ${checked}/${domains.length}`);
  }
  console.log();

  // Merge: keep existing entries, add new ones, remove stale ones
  const added: string[] = [];
  const removed: string[] = [];

  for (const [src, dst] of Object.entries(redirects)) {
    if (existing[src] !== dst) {
      added.push(`  + ${src} → ${dst}`);
    }
  }
  for (const src of Object.keys(existing)) {
    if (!(src in redirects)) {
      removed.push(`  - ${src} → ${existing[src]} (no longer redirects)`);
    }
  }

  if (added.length === 0 && removed.length === 0) {
    console.log("No changes detected.");
    return;
  }

  if (added.length > 0) {
    console.log(`\nNew/changed redirects (${added.length}):`);
    for (const line of added) console.log(line);
  }
  if (removed.length > 0) {
    console.log(`\nRemoved redirects (${removed.length}):`);
    for (const line of removed) console.log(line);
  }

  // Sort keys for stable output
  const sorted = Object.fromEntries(
    Object.entries(redirects).sort(([a], [b]) => a.localeCompare(b)),
  );

  await writeFile(REDIRECTS_PATH, JSON.stringify(sorted, null, 2) + "\n");
  console.log(
    `\nWrote ${Object.keys(sorted).length} redirects to ${REDIRECTS_PATH}`,
  );
}

async function checkRedirect(
  domain: string,
): Promise<{ from: string; to: string } | undefined> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(`https://${domain}`, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });

    clearTimeout(timeout);

    const finalUrl = response.url;
    if (!finalUrl) return undefined;

    const finalHost = new URL(finalUrl).hostname.replace(/^www\./, "");
    const srcHost = domain.replace(/^www\./, "");

    if (finalHost !== srcHost) {
      return { from: domain, to: finalHost };
    }
  } catch {
    // Network errors, timeouts — skip
  }
  return undefined;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
