import { isRecord } from "./cashback.js";
import type { JsonRequest } from "./prisjakt-price-match.js";

export const TEK_MOBILE_API = "https://www.tek.no/mobilabonnement/api";
export const MOBILE_DATA_TIERS = [0, 5, 10, 20, 30, 50, 100] as const;
// IDs from the public comparison page's networks list. Its JSON pagination
// confirms filter[network], verified with Ice selected on 2026-11-05.
export const TEK_MOBILE_NETWORKS = [{ id: 1, name: "Telenor" }, { id: 2, name: "Telia" }, { id: 3, name: "Ice" }] as const;
export function tekPlansUrl(gb: number, page = 1, broadband = false, networkId?: number): string {
  const url = new URL(`${TEK_MOBILE_API}/${broadband ? "mobile-broadband-plans" : "plans"}`);
  url.searchParams.set("usage[data]", String(gb * 1000));
  if (!broadband) {
    url.searchParams.set("usage[messages]", "5000");
    url.searchParams.set("usage[call_minutes]", "5000");
    url.searchParams.set("filter[excluded_features][0]", "11"); // Young customers only.
    url.searchParams.set("filter[excluded_features][1]", "13"); // Prepaid cards.
  }
  if (networkId !== undefined) url.searchParams.set("filter[network]", String(networkId));
  url.searchParams.set("page", String(page));
  return url.href;
}

export function readTekPage(value: unknown): { rows: Record<string, unknown>[]; pages: number } {
  if (!isRecord(value) || !Array.isArray(value.data) || !value.data.every(isRecord) || !isRecord(value.meta) ||
    !Number.isSafeInteger(value.meta.last_page) || (value.meta.last_page as number) < 1 ||
    value.data.length > 100) throw new Error("Tek mobilabonnement: endret eller ugyldig plansvar");
  return { rows: value.data, pages: value.meta.last_page as number };
}

// The public API used by Tek's own page: anonymous GET, no page tokens/headers.
// NOK is stored in øre, data in MB (1000 MB/GB), speeds in Kbit/s. Its invoice
// includes usage costs; monthlyFee alone is not necessarily the payable price.
export async function requestTekJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, { credentials: "omit", signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    throw new Error(`Tek ${new URL(url).pathname}: ${error instanceof Error ? error.message : "nettverksfeil"}`);
  }
}

export async function getTekCataloguePlans(requestJson: JsonRequest): Promise<Record<string, unknown>[]> {
  // The 1 GB query includes the full ordinary mobile-plan list, paginated by Tek.
  // Stop explicitly if it outgrows our finite bound; never silently publish half.
  const first = readTekPage(await requestJson(tekPlansUrl(1), { credentials: "omit" }));
  if (first.pages > 8) throw new Error("Tek operatører: listen overstiger 8 sider");
  const rows = [...first.rows];
  for (let page = 2; page <= first.pages; page++) {
    rows.push(...readTekPage(await requestJson(tekPlansUrl(1, page), { credentials: "omit" })).rows);
  }
  return rows;
}
