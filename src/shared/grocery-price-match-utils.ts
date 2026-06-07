export type ProductPackageUnit = "g" | "ml" | "pcs";

export type ProductPackageQuantity = {
  amount: number;
  unit: ProductPackageUnit;
};

type UnitNormalization = {
  unit: ProductPackageUnit;
  multiplier: number;
};

const PACKAGE_QUANTITY_PATTERN = /\b(\d+(?:[,.]\d+)?)\s*(kg|kgm|kilo|kilogram|g|gr|grm|gram|grams|l|ltr|liter|litre|dl|dlt|cl|clt|ml|mlt|stk|stykk|stykke|pcs|pc|pk|pakke|pack)(?=$|[^A-Za-z0-9])/gi;
const GROCERY_CONTEXT_HOSTS = [
  "oda.com",
  "kolonial.no",
  "meny.no",
  "spar.no",
  "kiwi.no",
  "joker.no",
  "rema.no",
  "rema1000.no",
  "coop.no",
  "bunnpris.no",
  "holdbart.no",
  "europris.no",
  "matkroken.no",
  "naerbutikken.no",
  "sesum.no",
  "enhver.no",
];

export function isProductPackageUnit(value: unknown): value is ProductPackageUnit {
  return value === "g" || value === "ml" || value === "pcs";
}

export function readPackageQuantityFromText(text: string | undefined): ProductPackageQuantity | undefined {
  if (text === undefined) return undefined;

  const quantities: ProductPackageQuantity[] = [];
  for (const match of text.matchAll(PACKAGE_QUANTITY_PATTERN)) {
    const amount = parseLocalizedNumber(match[1] ?? "");
    const unit = normalizePackageUnit(match[2] ?? "");
    if (unit === undefined || !Number.isFinite(amount) || amount <= 0) continue;

    const normalizedAmount = normalizePackageAmount(amount * unit.multiplier);
    if (!isReasonablePackageQuantity(normalizedAmount, unit.unit)) continue;
    quantities.push({ amount: normalizedAmount, unit: unit.unit });
  }

  return quantities.find((quantity) => quantity.unit !== "pcs") ?? quantities[0];
}

export function readPackageQuantityFromValue(value: unknown): ProductPackageQuantity | undefined {
  if (typeof value === "string" || typeof value === "number") {
    return readPackageQuantityFromText(String(value));
  }

  if (!isPlainRecord(value)) return undefined;
  const rawAmount =
    readNumberLike(value.value) ??
    readNumberLike(value.amount) ??
    readNumberLike(value.weight) ??
    readNumberLike(value.volume);
  const rawUnit =
    readStringLike(value.unitText) ??
    readStringLike(value.unitCode) ??
    readStringLike(value.unit) ??
    readStringLike(value.measurementTechnique);
  if (rawAmount === undefined || rawUnit === undefined) {
    return readPackageQuantityFromText(Object.values(value).map((item) => String(item)).join(" "));
  }

  const unit = normalizePackageUnit(rawUnit);
  if (unit === undefined) return undefined;

  const amount = normalizePackageAmount(rawAmount * unit.multiplier);
  return isReasonablePackageQuantity(amount, unit.unit) ? { amount, unit: unit.unit } : undefined;
}

export function isSamePackageQuantity(
  first: ProductPackageQuantity | undefined,
  second: ProductPackageQuantity | undefined,
): boolean {
  if (first === undefined || second === undefined || first.unit !== second.unit) return false;
  return Math.abs(first.amount - second.amount) <= Math.max(0.5, first.amount * 0.01);
}

export function buildPackageQuantityLabels(quantity: ProductPackageQuantity | undefined): string[] {
  if (quantity === undefined) return [];

  if (quantity.unit === "g") {
    const grams = formatPackageAmount(quantity.amount);
    const labels = [`${grams}g`, `${grams} g`];
    if (quantity.amount >= 1000 && quantity.amount % 1000 === 0) {
      const kilos = formatPackageAmount(quantity.amount / 1000);
      labels.push(`${kilos}kg`, `${kilos} kg`);
    }
    return uniqueStrings(labels);
  }

  if (quantity.unit === "ml") {
    const milliliters = formatPackageAmount(quantity.amount);
    const labels = [`${milliliters}ml`, `${milliliters} ml`];
    if (quantity.amount >= 100 && quantity.amount % 10 === 0) {
      const liters = formatPackageAmount(quantity.amount / 1000);
      labels.push(`${liters}l`, `${liters} l`);
    }
    if (quantity.amount % 10 === 0) {
      const centiliters = formatPackageAmount(quantity.amount / 10);
      labels.push(`${centiliters}cl`, `${centiliters} cl`);
    }
    return uniqueStrings(labels);
  }

  const pieces = formatPackageAmount(quantity.amount);
  return uniqueStrings([`${pieces}stk`, `${pieces} stk`, `${pieces}pk`, `${pieces} pk`]);
}

export function isLikelyGroceryPriceMatchContext(...rawUrls: Array<string | undefined>): boolean {
  return rawUrls.some((rawUrl) => {
    if (rawUrl === undefined) return false;
    try {
      const hostname = new URL(rawUrl).hostname.replace(/^www\./, "").toLowerCase();
      return GROCERY_CONTEXT_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
    } catch {
      return false;
    }
  });
}

function normalizePackageUnit(rawUnit: string): UnitNormalization | undefined {
  const unit = transliterateNorwegianCharacters(rawUnit)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z]/g, "")
    .toLowerCase();

  if (unit === "kg" || unit === "kgm" || unit === "kilo" || unit === "kilogram") return { unit: "g", multiplier: 1000 };
  if (unit === "g" || unit === "gr" || unit === "grm" || unit === "gram" || unit === "grams") return { unit: "g", multiplier: 1 };
  if (unit === "l" || unit === "ltr" || unit === "liter" || unit === "litre") return { unit: "ml", multiplier: 1000 };
  if (unit === "dl" || unit === "dlt") return { unit: "ml", multiplier: 100 };
  if (unit === "cl" || unit === "clt") return { unit: "ml", multiplier: 10 };
  if (unit === "ml" || unit === "mlt") return { unit: "ml", multiplier: 1 };
  if (unit === "stk" || unit === "stykk" || unit === "stykke" || unit === "pcs" || unit === "pc") {
    return { unit: "pcs", multiplier: 1 };
  }
  if (unit === "pk" || unit === "pakke" || unit === "pack") return { unit: "pcs", multiplier: 1 };
  return undefined;
}

function isReasonablePackageQuantity(amount: number, unit: ProductPackageUnit): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (unit === "pcs") return amount <= 200;
  return amount <= 100000;
}

function normalizePackageAmount(amount: number): number {
  return Number.isInteger(amount) ? amount : Number(amount.toFixed(2));
}

function formatPackageAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : String(Number(amount.toFixed(2))).replace(".", ",");
}

function parseLocalizedNumber(value: string): number {
  const compact = value.replace(/\s/g, "").replace(",", ".");
  const parsed = Number.parseFloat(compact);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
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
  const parsed = parseLocalizedNumber(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function transliterateNorwegianCharacters(value: string): string {
  return value
    .replace(/[\u00C6\u00E6]/g, "ae")
    .replace(/[\u00D8\u00F8]/g, "o")
    .replace(/[\u00C5\u00E5]/g, "a");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
