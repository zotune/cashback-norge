export type NokBaseRates = {
  rates: Record<string, number>;
};

export type ExchangeRatesRequest = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    credentials?: RequestCredentials;
  },
) => Promise<unknown | undefined>;

export const EXCHANGE_RATES_URL = "https://open.er-api.com/v6/latest/NOK";

export const STATIC_NOK_BASE_RATES: NokBaseRates = {
  rates: {
    AUD: 0.15,
    CAD: 0.148,
    DKK: 0.686,
    EUR: 0.092,
    GBP: 0.079,
    NOK: 1,
    PLN: 0.39,
    SEK: 1,
    USD: 0.106,
  },
};

export async function fetchNokBaseRates(
  requestJson: ExchangeRatesRequest = fetchJson,
): Promise<NokBaseRates | undefined> {
  const value = await requestJson(EXCHANGE_RATES_URL, {
    headers: { "Accept": "application/json" },
  });
  if (!isRecord(value) || value.result !== "success" || !isRecord(value.rates)) return undefined;

  const rates: Record<string, number> = {};
  for (const [currency, rate] of Object.entries(value.rates)) {
    if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
      rates[currency.toUpperCase()] = rate;
    }
  }

  return Object.keys(rates).length > 0 ? { rates } : undefined;
}

export function convertToNok(
  amount: number,
  currency: string,
  rates: NokBaseRates,
): number | undefined {
  const normalizedCurrency = normalizeCurrencyForExchange(currency);
  if (normalizedCurrency === "NOK") return amount;

  const rate = rates.rates[normalizedCurrency];
  if (typeof rate !== "number" || rate <= 0) return undefined;
  return amount / rate;
}

export function normalizeCurrencyForExchange(currency: string): string {
  const normalized = currency.trim().toUpperCase();
  if (normalized === "KR") return "NOK";
  return normalized;
}

async function fetchJson(url: string, init?: Parameters<ExchangeRatesRequest>[1]): Promise<unknown | undefined> {
  const response = await fetch(url, init);
  if (!response.ok) return undefined;
  return response.json();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
