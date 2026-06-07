import type {
  GetPriceMatchForProductMessage,
  PriceMatchOffer,
} from "./extension-messages.js";
import {
  isLikelyGroceryPriceMatchContext,
  isSamePackageQuantity,
  readPackageQuantityFromText,
  type ProductPackageQuantity,
} from "./grocery-price-match-utils.js";
import { isLikelySameProductTitle } from "./product-title-match.js";
import type { JsonRequest } from "./prisjakt-price-match.js";

type TextRequest = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    credentials?: RequestCredentials;
  },
) => Promise<string | undefined>;

type EnhverGrocery = {
  groceryId: number;
  name: string;
  ean?: string;
  amount?: number;
  unit?: string;
  desc?: string;
  disabled?: boolean;
};

type EnhverPrice = {
  shopName: string;
  amount: number;
  currency: string;
  price: string;
};

const ENHVER_GROCERIES_URL = "https://api.enhver.no/groceries";
const ENHVER_PRODUCT_URL = "https://enhver.no/brands/kiwi/";
const ENHVER_BRAND_NAMES = new Map<number, string>([
  [1, "Kiwi"],
  [2, "Coop Mega"],
  [3, "Meny"],
  [4, "Coop Obs"],
  [6, "Rema 1000"],
  [7, "Coop Prix"],
  [8, "Spar"],
  [9, "Coop Extra"],
  [10, "Bunnpris"],
  [12, "Holdbart"],
  [13, "Europris"],
]);

export async function findEnhverPriceMatch(
  message: GetPriceMatchForProductMessage,
  requestJson: JsonRequest = fetchJson,
  requestText: TextRequest = fetchText,
): Promise<PriceMatchOffer | undefined> {
  if (!isLikelyGroceryPriceMatchContext(message.url, message.productUrl)) return undefined;
  if (!hasGroceryIdentitySignal(message)) return undefined;

  const groceriesValue = await requestJson(ENHVER_GROCERIES_URL, {
    headers: { "Accept": "application/json" },
  });
  const groceries = readEnhverGroceries(groceriesValue);
  const grocery = findMatchingEnhverGrocery(message, groceries);
  if (grocery === undefined) return undefined;

  const productUrl = `${ENHVER_PRODUCT_URL}${encodeURIComponent(String(grocery.groceryId))}`;
  const html = await requestText(productUrl, {
    headers: { "Accept": "text/html,application/xhtml+xml" },
  });
  if (html === undefined) return undefined;

  const productName = readEnhverProductTitle(html, grocery) ?? grocery.name;
  const prices = readEnhverPrices(html, grocery.groceryId);
  if (prices.length === 0) return undefined;

  const sortedPrices = [...prices].sort((first, second) => first.amount - second.amount);
  const best = sortedPrices[0];
  if (best === undefined) return undefined;

  return {
    source: "enhver",
    sourceName: "Enhver",
    matchedExactProduct: true,
    shopName: best.shopName,
    amount: best.amount,
    currency: best.currency,
    price: best.price,
    productName,
    productUrl,
    alternatives: sortedPrices.slice(0, 10).map((price) => ({
      shopName: price.shopName,
      amount: price.amount,
      currency: price.currency,
      price: price.price,
    })),
  };
}

function readEnhverGroceries(value: unknown): EnhverGrocery[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!isPlainRecord(item)) return undefined;
      const groceryId = readNumberLike(item.groceryId);
      const name = readStringLike(item.name);
      if (groceryId === undefined || name === undefined) return undefined;
      const ean = readStringLike(item.ean);
      const amount = readNumberLike(item.amount);
      const unit = readStringLike(item.unit);
      const desc = readStringLike(item.desc);
      const disabled = typeof item.disabled === "boolean" ? item.disabled : undefined;
      return {
        groceryId,
        name,
        ...(ean !== undefined ? { ean } : {}),
        ...(amount !== undefined ? { amount } : {}),
        ...(unit !== undefined ? { unit } : {}),
        ...(desc !== undefined ? { desc } : {}),
        ...(disabled !== undefined ? { disabled } : {}),
      };
    })
    .filter((item): item is EnhverGrocery => item !== undefined && item.disabled !== true);
}

function findMatchingEnhverGrocery(
  message: GetPriceMatchForProductMessage,
  groceries: EnhverGrocery[],
): EnhverGrocery | undefined {
  const messageGtins = getLikelyGtins(message.codes);
  if (messageGtins.length > 0) {
    const exact = groceries.find((grocery) => {
      const groceryGtin = readLikelyGtin(grocery.ean);
      return groceryGtin !== undefined && messageGtins.includes(groceryGtin);
    });
    if (exact !== undefined) return exact;
  }

  const messageQuantity = getMessagePackageQuantity(message);
  if (messageQuantity === undefined) return undefined;

  return groceries.find((grocery) => {
    const groceryQuantity = readEnhverPackageQuantity(grocery);
    if (!isSamePackageQuantity(messageQuantity, groceryQuantity)) return false;
    return isLikelySameGroceryTitle(message, grocery);
  });
}

function readEnhverPackageQuantity(grocery: EnhverGrocery): ProductPackageQuantity | undefined {
  const directQuantity = grocery.amount !== undefined && grocery.unit !== undefined
    ? readPackageQuantityFromText(`${grocery.amount} ${grocery.unit}`)
    : undefined;
  return directQuantity ?? readPackageQuantityFromText(grocery.desc);
}

function isLikelySameGroceryTitle(
  message: GetPriceMatchForProductMessage,
  grocery: EnhverGrocery,
): boolean {
  const title = [grocery.name, grocery.desc].filter((value): value is string => value !== undefined).join(" ");
  if (!hasRequestedBrandSignal(message, title)) return false;

  return uniqueStrings([message.searchTerm, ...(message.productTitleCandidates ?? [])])
    .some((candidate) => isLikelySameProductTitle(candidate, title, 0.45));
}

function hasRequestedBrandSignal(message: GetPriceMatchForProductMessage, title: string): boolean {
  if (message.productBrand === undefined) return true;
  const brand = normalizeBrandText(message.productBrand);
  if (brand.length < 3) return true;
  return normalizeBrandText(title).includes(brand);
}

function readEnhverProductTitle(html: string, grocery: EnhverGrocery): string | undefined {
  const escapedName = escapeRegExp(String(grocery.groceryId));
  const pattern = new RegExp(`title:"((?:\\\\.|[^"\\\\])*)",groceryId:${escapedName},(?:(?!\\{title:)[\\s\\S])*?prices:\\[`);
  const rawTitle = html.match(pattern)?.[1];
  return rawTitle !== undefined ? unescapeJsString(rawTitle).trim() || undefined : undefined;
}

function readEnhverPrices(html: string, groceryId: number): EnhverPrice[] {
  const escapedId = escapeRegExp(String(groceryId));
  const pattern = new RegExp(`title:"(?:\\\\.|[^"\\\\])*",groceryId:${escapedId},(?:(?!\\{title:)[\\s\\S])*?prices:\\[([^\\]]+)\\]`);
  const rawPrices = html.match(pattern)?.[1];
  if (rawPrices === undefined) return [];

  const prices: EnhverPrice[] = [];
  for (const match of rawPrices.matchAll(/\{brandId:(\d+),price:(\d+(?:\.\d+)?)\}/g)) {
    const brandId = Number.parseInt(match[1] ?? "", 10);
    const amount = Number.parseFloat(match[2] ?? "");
    const shopName = ENHVER_BRAND_NAMES.get(brandId);
    if (shopName === undefined || !Number.isFinite(amount) || amount <= 0) continue;
    prices.push({
      shopName,
      amount,
      currency: "NOK",
      price: formatNokPrice(amount),
    });
  }

  return prices;
}

function hasGroceryIdentitySignal(message: GetPriceMatchForProductMessage): boolean {
  return getLikelyGtins(message.codes).length > 0 || getMessagePackageQuantity(message) !== undefined;
}

function getMessagePackageQuantity(message: GetPriceMatchForProductMessage): ProductPackageQuantity | undefined {
  return message.packageAmount !== undefined && message.packageUnit !== undefined
    ? { amount: message.packageAmount, unit: message.packageUnit }
    : undefined;
}

async function fetchJson(url: string, init?: Parameters<JsonRequest>[1]): Promise<unknown | undefined> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Accept": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) return undefined;
  return response.json();
}

async function fetchText(url: string, init?: Parameters<TextRequest>[1]): Promise<string | undefined> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Accept": "text/html,application/xhtml+xml",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) return undefined;
  return response.text();
}

function formatNokPrice(amount: number): string {
  return `${new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)} kr`;
}

function unescapeJsString(value: string): string {
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`) as string;
  } catch {
    return value
      .replace(/\\u0026/g, "&")
      .replace(/\\u003c/gi, "<")
      .replace(/\\u003e/gi, ">")
      .replace(/\\"/g, "\"")
      .replace(/\\\\/g, "\\");
  }
}

function readLikelyGtin(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\D/g, "");
  return normalized !== undefined && isLikelyGtin(normalized) ? normalized : undefined;
}

function getLikelyGtins(codes: string[] | undefined): string[] {
  return uniqueStrings((codes ?? [])
    .map((code) => code.replace(/\D/g, ""))
    .filter(isLikelyGtin));
}

function isLikelyGtin(value: string): boolean {
  return /^\d{8,14}$/.test(value);
}

function readStringLike(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function readNumberLike(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeBrandText(value: string): string {
  return value
    .replace(/[\u00C6\u00E6]/g, "ae")
    .replace(/[\u00D8\u00F8]/g, "o")
    .replace(/[\u00C5\u00E5]/g, "a")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toLowerCase();
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => value !== undefined && value.length > 0))];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
