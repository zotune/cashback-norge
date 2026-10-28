// Prices from structured data: decimal dot/comma and space-separated thousands.
// Do not infer currency, cents, or a thousands separator from an ambiguous dot.
export function readPriceAmount(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : undefined;
  if (typeof value !== "string") return undefined;
  const compact = value.trim().replace(/[\s\u00a0\u202f]/g, "");
  if (!/^\d+(?:[.,]\d+)?$/.test(compact)) return undefined;
  const amount = Number(compact.replace(",", "."));
  return Number.isFinite(amount) ? amount : undefined;
}

export function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
