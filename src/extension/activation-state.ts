export const ACTIVATED_OFFERS_STORAGE_KEY = "cashback-varsler-activated-offers";

// Treat activation as a fresh clickthrough signal, not a permanent guarantee.
export const OFFER_ACTIVATION_TTL_MS = 2 * 60 * 60 * 1000;

type ActivatedOffers = Record<string, number>;
export type ActivationContext = "normal" | "incognito";

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
  return readActivatedOffersForContext(getCurrentActivationContext(), now);
}

export async function readActivatedOffersForContext(
  context: ActivationContext,
  now = Date.now(),
): Promise<ActivatedOffers> {
  const stored = await getStorageValue(ACTIVATED_OFFERS_STORAGE_KEY);
  const { activations, changed } = pruneStoredActivatedOffers(stored, now);

  if (isRecord(stored) && changed) {
    await setStorageValue(ACTIVATED_OFFERS_STORAGE_KEY, activations);
  }

  return filterActivatedOffersForContext(activations, context);
}

export async function markOfferActivated(provider: string, rawUrl: string, now = Date.now()): Promise<void> {
  return markOfferActivatedForContext(getCurrentActivationContext(), provider, rawUrl, now);
}

export async function markOfferActivatedForContext(
  context: ActivationContext,
  provider: string,
  rawUrl: string,
  now = Date.now(),
): Promise<void> {
  const activationKey = getProviderActivationKey(provider, rawUrl);
  if (activationKey === undefined) {
    return;
  }

  const stored = await getStorageValue(ACTIVATED_OFFERS_STORAGE_KEY);
  const { activations } = pruneStoredActivatedOffers(stored, now);
  activations[getActivationStorageKey(context, activationKey)] = now;

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

export function getCurrentActivationContext(): ActivationContext {
  const chromeWithExtension = typeof chrome === "undefined"
    ? undefined
    : chrome as typeof chrome & { extension?: { inIncognitoContext?: boolean } };

  return chromeWithExtension?.extension?.inIncognitoContext === true ? "incognito" : "normal";
}

function pruneStoredActivatedOffers(value: unknown, now: number): { activations: ActivatedOffers; changed: boolean } {
  if (!isRecord(value)) {
    return { activations: {}, changed: false };
  }

  const activations: ActivatedOffers = {};
  let changed = false;
  for (const [key, activatedAt] of Object.entries(value)) {
    if (
      typeof activatedAt === "number" &&
      Number.isFinite(activatedAt) &&
      now - activatedAt >= 0 &&
      now - activatedAt < OFFER_ACTIVATION_TTL_MS
    ) {
      const parsedKey = parseActivationStorageKey(key);
      if (parsedKey === undefined) {
        changed = true;
        continue;
      }

      const storageKey = getActivationStorageKey(parsedKey.context, parsedKey.activationKey);
      activations[storageKey] = Math.max(activations[storageKey] ?? -1, activatedAt);
      if (storageKey !== key) {
        changed = true;
      }
    } else {
      changed = true;
    }
  }

  return { activations, changed };
}

function filterActivatedOffersForContext(
  activations: Readonly<ActivatedOffers>,
  context: ActivationContext,
): ActivatedOffers {
  const filtered: ActivatedOffers = {};
  const prefix = `${context}:`;

  for (const [storageKey, activatedAt] of Object.entries(activations)) {
    if (storageKey.startsWith(prefix)) {
      filtered[storageKey.slice(prefix.length)] = activatedAt;
    }
  }

  return filtered;
}

function getActivationStorageKey(context: ActivationContext, activationKey: string): string {
  return `${context}:${activationKey}`;
}

function parseActivationStorageKey(
  storageKey: string,
): { context: ActivationContext; activationKey: string } | undefined {
  if (storageKey.startsWith("normal:")) {
    return { context: "normal", activationKey: storageKey.slice("normal:".length) };
  }

  if (storageKey.startsWith("incognito:")) {
    return { context: "incognito", activationKey: storageKey.slice("incognito:".length) };
  }

  if (storageKey.includes(":")) {
    return { context: "normal", activationKey: storageKey };
  }

  return undefined;
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
