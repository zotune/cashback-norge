export const ACTIVATED_OFFERS_STORAGE_KEY = "cashback-varsler-activated-offers";

// Treat activation as a fresh clickthrough signal, not a permanent guarantee.
export const OFFER_ACTIVATION_TTL_MS = 2 * 60 * 60 * 1000;

type ActivatedOffers = Record<string, number>;

type OfferActivationInput = {
  provider: string;
  activationUrl: string;
  sourceUrl: string;
};

export function getOfferActivationKey(offer: OfferActivationInput): string | undefined {
  return getProviderActivationKey(offer.provider, offer.activationUrl || offer.sourceUrl);
}

export function getProviderActivationKey(provider: string, rawUrl: string): string | undefined {
  const normalizedUrl = normalizeActivationUrl(rawUrl);
  return normalizedUrl === undefined ? undefined : `${provider}:${normalizedUrl}`;
}

export function isOfferActivated(
  offer: OfferActivationInput,
  activeOfferKey: string | undefined,
): boolean {
  const activationKey = getOfferActivationKey(offer);
  return activationKey !== undefined && activationKey === activeOfferKey;
}

export function getLastActivatedOfferKey(
  offers: readonly OfferActivationInput[],
  activatedOffers: Readonly<ActivatedOffers>,
): string | undefined {
  let latestKey: string | undefined;
  let latestActivatedAt = -1;

  for (const offer of offers) {
    const activationKey = getOfferActivationKey(offer);
    if (activationKey === undefined) {
      continue;
    }

    const activatedAt = activatedOffers[activationKey];
    if (typeof activatedAt === "number" && activatedAt > latestActivatedAt) {
      latestKey = activationKey;
      latestActivatedAt = activatedAt;
    }
  }

  return latestKey;
}

export async function readActivatedOffers(now = Date.now()): Promise<ActivatedOffers> {
  const stored = await getStorageValue(ACTIVATED_OFFERS_STORAGE_KEY);
  const activations = pruneActivatedOffers(stored, now);

  if (isRecord(stored) && Object.keys(stored).length !== Object.keys(activations).length) {
    await setStorageValue(ACTIVATED_OFFERS_STORAGE_KEY, activations);
  }

  return activations;
}

export async function markOfferActivated(provider: string, rawUrl: string, now = Date.now()): Promise<void> {
  const activationKey = getProviderActivationKey(provider, rawUrl);
  if (activationKey === undefined) {
    return;
  }

  const stored = await getStorageValue(ACTIVATED_OFFERS_STORAGE_KEY);
  const activations = pruneActivatedOffers(stored, now);
  activations[activationKey] = now;

  await setStorageValue(ACTIVATED_OFFERS_STORAGE_KEY, activations);
}

export function isTrumfLogOfferClickUrl(rawUrl: string): boolean {
  const parsedUrl = parseUrl(rawUrl);
  if (parsedUrl === undefined) {
    return false;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  return hostname === "trumfnetthandel.no" && /^\/LogOfferClick\/\d+\/\d+\/?$/.test(parsedUrl.pathname);
}

function pruneActivatedOffers(value: unknown, now: number): ActivatedOffers {
  if (!isRecord(value)) {
    return {};
  }

  const activations: ActivatedOffers = {};
  for (const [key, activatedAt] of Object.entries(value)) {
    if (
      typeof activatedAt === "number" &&
      Number.isFinite(activatedAt) &&
      now - activatedAt >= 0 &&
      now - activatedAt < OFFER_ACTIVATION_TTL_MS
    ) {
      activations[key] = activatedAt;
    }
  }
  return activations;
}

function normalizeActivationUrl(rawUrl: string): string | undefined {
  const parsedUrl = parseUrl(rawUrl);
  if (parsedUrl === undefined || (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")) {
    return undefined;
  }

  const protocol = parsedUrl.protocol.toLowerCase();
  const hostname = parsedUrl.hostname.toLowerCase();
  const port = parsedUrl.port.length > 0 ? `:${parsedUrl.port}` : "";
  const pathname = parsedUrl.pathname.length > 1 && parsedUrl.pathname.endsWith("/")
    ? parsedUrl.pathname.slice(0, -1)
    : parsedUrl.pathname;

  return `${protocol}//${hostname}${port}${pathname}${parsedUrl.search}`;
}

function parseUrl(rawUrl: string): URL | undefined {
  try {
    return new URL(rawUrl);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStorageValue(key: string): Promise<unknown> {
  return new Promise((resolveValue) => {
    chrome.storage.local.get([key], (items) => {
      const value: unknown = items[key];
      resolveValue(value);
    });
  });
}

function setStorageValue(key: string, value: unknown): Promise<void> {
  return new Promise((resolveValue) => {
    let resolved = false;
    const finish = (): void => {
      if (!resolved) {
        resolved = true;
        resolveValue();
      }
    };

    chrome.storage.local.set({ [key]: value }, finish);
  });
}
