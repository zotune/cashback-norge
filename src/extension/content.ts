import { EB_PER_TRUMF_KR, FREE_CARDS, PREMIUM_CARDS, PROVIDER_NAMES, REVOLUT_SUBSCRIPTIONS, SUPPORT_LINKS } from "../shared/provider-data";
import {
  calculateCashback,
  calculateCashbackMaxKr,
  formatBreakdownWithAmounts,
  formatCompactRewardLabel,
  formatKr,
  formatRewardLabel,
  getMaxRewardPercent,
} from "../shared/reward-calculation";
import { findPrisjaktPriceMatch } from "../shared/prisjakt-price-match";
import noWords from "naughty-words/no.json";
import enWords from "naughty-words/en.json";

type UserscriptHttpRequestOptions = {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  data?: string;
  onload?: (response: { status: number; responseText: string }) => void;
  onerror?: () => void;
  ontimeout?: () => void;
};

declare const GM_xmlhttpRequest: undefined | ((options: UserscriptHttpRequestOptions) => unknown);
declare const GM: undefined | {
  xmlHttpRequest?: (options: UserscriptHttpRequestOptions) => unknown;
};

const PROFANITY_SET = new Set([...noWords, ...enWords].map((w) => w.toLowerCase()));

const SUPABASE_URL = "https://tektckikcspxzhwjfzyn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_FYwbz2OizGygwHzAJ4dbeQ_k4j6PX8s";

type DbCode = { id: number; code: string; reward: string; upvotes: number; downvotes: number };

async function fetchCodesForHost(hostname: string): Promise<DbCode[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/discount_codes?hostname=eq.${encodeURIComponent(hostname)}&select=id,code,reward`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
    );
    if (!res.ok) return [];
    const rows: Array<{ id: number; code: string; reward: string }> = await res.json();
    // Fetch vote sums
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return [];
    const vRes = await fetch(
      `${SUPABASE_URL}/rest/v1/code_votes?code_id=in.(${ids.join(",")})&select=code_id,vote`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
    );
    const votes: Array<{ code_id: number; vote: number }> = vRes.ok ? await vRes.json() : [];
    return rows.map((r) => ({
      ...r,
      upvotes: votes.filter((v) => v.code_id === r.id && v.vote === 1).length,
      downvotes: votes.filter((v) => v.code_id === r.id && v.vote === -1).length,
    }));
  } catch {
    return [];
  }
}

async function apiSubmitCode(hostname: string, code: string, reward: string): Promise<{ ok: boolean; duplicate?: boolean; rate_limited?: boolean; id?: number }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ hostname, code, reward }),
    });
    if (res.status === 409) return { ok: false, duplicate: true };
    if (res.status === 429) return { ok: false, rate_limited: true };
    if (!res.ok) return { ok: false };
    const data: { ok: boolean; id?: number } = await res.json();
    return { ok: true, ...(data.id !== undefined ? { id: data.id } : {}) };
  } catch {
    return { ok: false };
  }
}

async function apiVote(codeId: number, vote: 1 | -1, staticCode?: { code: string; reward: string; hostname: string }): Promise<{ upvotes: number; downvotes: number; toggled_off?: boolean; deleted?: boolean; registered_id?: number } | { rate_limited: true } | null> {  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ code_id: codeId > 0 ? codeId : undefined, vote, ...(staticCode ?? {}) }),
    });
    if (res.status === 429) return { rate_limited: true };
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function apiDeleteCode(codeId: number): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ id: codeId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchOwnedCodesForHost(hostname: string): Promise<Set<number>> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/owned-codes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ hostname }),
    });
    if (!res.ok) return new Set();
    const data: { ids?: number[] } = await res.json();
    return new Set(data.ids ?? []);
  } catch {
    return new Set();
  }
}



async function fetchMyVotes(hostname: string): Promise<Record<number, 1 | -1>> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/my-votes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ hostname }),
    });
    if (!res.ok) return {};
    const data: { votes?: Array<{ code_id: number; vote: number }> } = await res.json();
    const map: Record<number, 1 | -1> = {};
    for (const v of data.votes ?? []) map[v.code_id] = v.vote as 1 | -1;
    return map;
  } catch {
    return {};
  }
}

function showRateLimitFlash(near: HTMLElement): void {
  const existing = near.closest(".code-item-row")?.parentElement?.querySelector(".rate-limit-flash");
  if (existing) return;
  const flash = document.createElement("div");
  flash.className = "rate-limit-flash";
  flash.textContent = "Du har nådd grensen på 5 handlinger per dag.";
  flash.style.cssText = "font-size:11px;color:#e05555;padding:4px 8px;";
  near.closest(".code-item-row")?.insertAdjacentElement("afterend", flash);
  setTimeout(() => flash.remove(), 2500);
}
const CBN_LOGO_B64 = "data:image/png;base64,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";
type CashbackOffer = {
  provider: string;
  merchantName: string;
  domains: string[];
  reward: string;
  sourceUrl: string;
  activationUrl: string;
  terms: string;
  discountCode?: string;
  updatedAt: string;
};
type CashbackIndex = {
  version: number;
  generatedAt: string;
  offers: CashbackOffer[];
  domainIndex: Record<string, CashbackOffer[]>;
};
type CashbackFoundMessage = {
  type: "cashback-found";
  offers: CashbackOffer[];
};
type CashbackNoneMessage = {
  type: "cashback-none";
};
type GetOffersForUrlMessage = {
  type: "get-offers-for-url";
  url: string;
};
type GetPriceMatchForProductMessage = {
  type: "get-price-match-for-product";
  url: string;
  searchTerm: string;
  price?: number;
  currency?: string;
  productUrl?: string;
  codes?: string[];
  productPageClue?: boolean;
  organizationName?: string;
};
type OffersForUrlResponse =
  | {
      ok: true;
      offers: CashbackOffer[];
    }
  | {
      ok: false;
      reason: string;
    };
type PriceMatchOffer = {
  shopName: string;
  price: string;
  amount: number;
  currency: string;
  productName: string;
  productUrl: string;
  offerUrl?: string;
};
type PriceMatchForProductResponse =
  | {
      ok: true;
      offer?: PriceMatchOffer;
    }
  | {
      ok: false;
      reason: string;
    };
type ProductPageMeta = Omit<GetPriceMatchForProductMessage, "type">;
const HOST_ID = "cashback-varsler-notice";
const COLLAPSED_STORAGE_KEY = "cashback-varsler-collapsed";
const CHIPS_COLLAPSED_KEY = "cashback-varsler-chips-collapsed";
const CODES_COLLAPSED_KEY = "cashback-varsler-codes-collapsed";
const PRICE_MATCH_COLLAPSED_KEY = "cashback-varsler-price-match-collapsed";
const HIDDEN_HOSTS_KEY = "cashback-varsler-hidden-hosts";
const ACTIVATED_OFFERS_STORAGE_KEY = "cashback-varsler-activated-offers";
const OFFER_ACTIVATION_TTL_MS = 2 * 60 * 60 * 1000;
const CURRENT_HOST = window.location.hostname.replace(/^www\./, "").toLowerCase();
const NOTICE_BLOCKED_HOSTS = new Set([
  "prisjakt.no",
  "prisjakt.nu",
  "prisjakt.se",
  "prisjagt.dk",
  "pricespy.co.uk",
  "pricespy.co.nz",
  "hintaopas.fi",
  "ledenicheur.fr",
]);
installOfferActivationClickTracker();
chrome.runtime.onMessage.addListener((message) => {
  if (isNoticeBlockedHost(CURRENT_HOST)) {
    clearNotice();
    return;
  }

  if (isCashbackFoundMessage(message)) {
    renderNoticeWithStoredState(message.offers);
    return;
  }
  if (isCashbackNoneMessage(message)) {
    clearNotice();
    return;
  }
  if (isRecord(message) && message.type === "toggle-notice") {
    chrome.storage.local.get(HIDDEN_HOSTS_KEY, (result: Record<string, unknown>) => {
      const hidden = Array.isArray(result[HIDDEN_HOSTS_KEY]) ? (result[HIDDEN_HOSTS_KEY] as string[]) : [];
      const isHidden = hidden.includes(CURRENT_HOST);
      if (isHidden) {
        const next = hidden.filter((h) => h !== CURRENT_HOST);
        chrome.storage.local.set({ [HIDDEN_HOSTS_KEY]: next });
        requestCurrentOffers();
      } else {
        chrome.storage.local.set({ [HIDDEN_HOSTS_KEY]: [...hidden, CURRENT_HOST] });
        clearNotice();
      }
    });
  }
});
requestCurrentOffers();
function renderNoticeWithStoredState(offers: CashbackOffer[], priceMatch?: PriceMatchOffer): void {
  if (isNoticeBlockedHost(CURRENT_HOST)) {
    clearNotice();
    return;
  }

  const isUserscript = (chrome.runtime as { id?: string }).id === undefined;
  chrome.storage.local.get([COLLAPSED_STORAGE_KEY, CHIPS_COLLAPSED_KEY, CODES_COLLAPSED_KEY, PRICE_MATCH_COLLAPSED_KEY, HIDDEN_HOSTS_KEY], (result: Record<string, unknown>) => {
    const hidden = Array.isArray(result[HIDDEN_HOSTS_KEY]) ? (result[HIDDEN_HOSTS_KEY] as string[]) : [];
    if (!isUserscript && hidden.includes(CURRENT_HOST)) return;
    const collapsed = result[COLLAPSED_STORAGE_KEY] === true;
    const chipsCollapsed = result[CHIPS_COLLAPSED_KEY] === true;
    const codesCollapsed = result[CODES_COLLAPSED_KEY] === true;
    const priceMatchCollapsed = result[PRICE_MATCH_COLLAPSED_KEY] === true;
    void readActivatedOffers()
      .catch(() => ({}))
      .then((activatedOffers) => {
        renderNotice(offers, collapsed, chipsCollapsed, codesCollapsed, priceMatchCollapsed, activatedOffers, priceMatch);
      });
  });
}
function requestCurrentOffers(): void {
  if (isNoticeBlockedHost(CURRENT_HOST)) {
    clearNotice();
    return;
  }

  void renderCurrentContext();
}

function isNoticeBlockedHost(hostname: string): boolean {
  return NOTICE_BLOCKED_HOSTS.has(hostname);
}

async function renderCurrentContext(): Promise<void> {
  const [offers, priceMatch] = await Promise.all([
    getCurrentOffers(),
    getPriceMatchForCurrentPage(),
  ]);
  if (offers.length > 0 || priceMatch !== undefined) {
    renderNoticeWithStoredState(offers, priceMatch);
    return;
  }
  clearNotice();
}

async function getCurrentOffers(): Promise<CashbackOffer[]> {
  const message: GetOffersForUrlMessage = {
    type: "get-offers-for-url",
    url: window.location.href,
  };
  const response = await sendRuntimeMessage<OffersForUrlResponse>(message);
  if (response !== undefined && isOffersForUrlResponse(response) && response.ok) {
    if (response.offers.length > 0) return response.offers;
  }
  return readBundledOffersForCurrentUrl();
}
async function readBundledOffersForCurrentUrl(): Promise<CashbackOffer[]> {
  const parsedUrl = parseUrl(window.location.href);
  if (
    parsedUrl === undefined ||
    (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")
  ) {
    return [];
  }
  try {
    const response = await fetch(chrome.runtime.getURL("cashback-index.json"));
    const value: unknown = await response.json();
    if (!isCashbackIndex(value)) {
      return [];
    }
    return findOffersForHostname(value, parsedUrl.hostname);
  } catch {
    return [];
  }
}

async function getPriceMatchForCurrentPage(): Promise<PriceMatchOffer | undefined> {
  const productMeta = extractProductPageMeta();
  if (productMeta === undefined) return undefined;
  const message: GetPriceMatchForProductMessage = {
    type: "get-price-match-for-product",
    ...productMeta,
  };
  if (isUserscriptRuntime()) {
    return findPrisjaktPriceMatch(message, userscriptJsonRequest);
  }

  const response = await sendRuntimeMessage<PriceMatchForProductResponse>(message);
  if (response !== undefined && isPriceMatchForProductResponse(response) && response.ok) {
    return response.offer;
  }
  return undefined;
}

function isUserscriptRuntime(): boolean {
  return (chrome.runtime as { id?: string }).id === undefined;
}

async function userscriptJsonRequest(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<unknown | undefined> {
  const gmRequest = typeof GM_xmlhttpRequest === "function"
    ? GM_xmlhttpRequest
    : typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function"
      ? GM.xmlHttpRequest
      : undefined;

  if (gmRequest !== undefined) {
    return new Promise((resolveValue) => {
      gmRequest({
        method: init?.method ?? "GET",
        url,
        headers: init?.headers,
        data: init?.body,
        onload: (response) => {
          if (response.status < 200 || response.status >= 300) {
            resolveValue(undefined);
            return;
          }
          try {
            resolveValue(JSON.parse(response.responseText) as unknown);
          } catch {
            resolveValue(undefined);
          }
        },
        onerror: () => resolveValue(undefined),
        ontimeout: () => resolveValue(undefined),
      });
    });
  }

  try {
    const response = await fetch(url, init);
    if (!response.ok) return undefined;
    return response.json();
  } catch {
    return undefined;
  }
}

function sendRuntimeMessage<T>(message: unknown): Promise<T | undefined> {
  return new Promise((resolveValue) => {
    chrome.runtime.sendMessage(message, (response: unknown) => {
      if (chrome.runtime.lastError !== undefined) {
        resolveValue(undefined);
        return;
      }
      resolveValue(response as T);
    });
  });
}

function extractProductPageMeta(): ProductPageMeta | undefined {
  const parsedUrl = parseUrl(window.location.href);
  if (parsedUrl === undefined || (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")) {
    return undefined;
  }

  const productLdJson = findProductLdJson();
  const titleMeta = document.querySelector<HTMLMetaElement>('meta[name="title"]')?.content.trim();
  const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content.trim();
  const h1 = document.querySelector("h1")?.textContent?.trim();
  const productPageClue =
    productLdJson !== undefined ||
    document.querySelector('meta[property="og:type"][content="product"]') !== null ||
    /\b(product|produkt)\b/i.test(parsedUrl.pathname) ||
    [...parsedUrl.searchParams.keys()].some((key) => /\b(product|produkt|sku|mpn|gtin)\b/i.test(key));

  const productName = readStringValue(productLdJson?.name);
  const brandName = readBrandName(productLdJson?.brand);
  const searchTerm =
    productName !== undefined
      ? brandName !== undefined && !productName.toLowerCase().includes(brandName.toLowerCase())
        ? `${brandName} ${productName}`
        : productName
      : h1 ?? titleMeta ?? ogTitle ?? document.title;
  const normalizedSearchTerm = searchTerm.trim().replace(/\s+/g, " ");

  if (!productPageClue && normalizedSearchTerm.length < 8) {
    return undefined;
  }

  const offer = readFirstOffer(productLdJson?.offers);
  const price = readNumberValue(offer?.price);
  const currency = readStringValue(offer?.priceCurrency);
  const productUrl = readUrlValue(productLdJson?.url);
  const codes = collectProductCodes(productLdJson);
  const organizationName = findOrganizationName();

  return {
    url: window.location.href,
    searchTerm: normalizedSearchTerm,
    productPageClue,
    ...(price !== undefined ? { price } : {}),
    ...(currency !== undefined ? { currency } : {}),
    ...(productUrl !== undefined ? { productUrl } : {}),
    ...(codes.length > 0 ? { codes } : {}),
    ...(organizationName !== undefined ? { organizationName } : {}),
  };
}

function findProductLdJson(): Record<string, unknown> | undefined {
  for (const entry of readLdJsonEntries()) {
    const product = findTypedLdJson(entry, "Product");
    if (product !== undefined) return product;
  }
  return undefined;
}

function findOrganizationName(): string | undefined {
  for (const entry of readLdJsonEntries()) {
    const organization = findTypedLdJson(entry, "Organization") ?? findTypedLdJson(entry, "WebSite");
    const name = readStringValue(organization?.name);
    if (name !== undefined) return name;
    const offer = findTypedLdJson(entry, "Offer");
    const sellerName = readBrandName(offer?.seller);
    if (sellerName !== undefined) return sellerName;
  }
  return undefined;
}

function readLdJsonEntries(): unknown[] {
  const entries: unknown[] = [];
  for (const script of document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')) {
    try {
      entries.push(JSON.parse(script.textContent ?? ""));
    } catch {
      // Ignore malformed site metadata.
    }
  }
  return entries;
}

function findTypedLdJson(value: unknown, type: string): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTypedLdJson(item, type);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  const graph = value["@graph"];
  if (Array.isArray(graph)) {
    for (const item of graph) {
      const found = findTypedLdJson(item, type);
      if (found !== undefined) return found;
    }
  }
  const rawType = value["@type"];
  const types = Array.isArray(rawType) ? rawType : [rawType];
  return types.some((item) => item === type) ? value : undefined;
}

function readFirstOffer(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    return value.find(isRecord);
  }
  return isRecord(value) ? value : undefined;
}

function readBrandName(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  return isRecord(value) ? readStringValue(value.name) : undefined;
}

function readStringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readNumberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readUrlValue(value: unknown): string | undefined {
  const url = readStringValue(value);
  return url !== undefined && parseUrlWithBase(url, window.location.href) !== undefined
    ? parseUrlWithBase(url, window.location.href)?.toString()
    : undefined;
}

function collectProductCodes(product: Record<string, unknown> | undefined): string[] {
  if (product === undefined) return [];
  const codes = new Set<string>();
  for (const [key, value] of Object.entries(product)) {
    if (!/^(gtin|sku|mpn)/i.test(key)) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (typeof item === "string" || typeof item === "number") {
        const code = String(item).trim();
        if (code.length > 0) codes.add(code);
      }
    }
  }
  return [...codes];
}
function makeAdChip(): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.textContent = "Ad";
  chip.style.cssText = "display:inline-block;font-size:9px;font-weight:600;color:#78909c;border:1px solid #78909c;border-radius:3px;padding:0 3px;margin-right:6px;vertical-align:middle;line-height:14px;";
  return chip;
}

function getCodeSourceProvider(codeOffer: CashbackOffer): string | undefined {
  if (codeOffer.provider !== "rabattkode") {
    return codeOffer.provider;
  }

  const parsed = parseUrl(codeOffer.sourceUrl) ?? parseUrl(codeOffer.activationUrl);
  const hostname = parsed?.hostname.replace(/^www\./, "").toLowerCase() ?? "";

  if (hostname === "bob.no" || hostname.endsWith(".bob.no")) return "bob";
  if (hostname === "dnb.no" || hostname.endsWith(".dnb.no")) return "dnb";
  if (hostname === "tfbank.no" || hostname.endsWith(".tfbank.no")) return "tfbank";
  return undefined;
}

function createProviderBadgeWithActivation(
  offer: CashbackOffer,
  activeOfferKey: string | undefined,
  shadowRoot: ShadowRoot,
): HTMLSpanElement {
  const providerWrap = document.createElement("span");
  providerWrap.className = "provider-wrap";

  const providerBadge = document.createElement("span");
  providerBadge.className = `provider-badge provider-${offer.provider}`;
  providerBadge.textContent = formatProviderName(offer.provider);

  if (isOfferActivated(offer, activeOfferKey)) {
    const activationBadge = document.createElement("span");
    activationBadge.className = "activation-badge";
    activationBadge.setAttribute("aria-label", `${formatProviderName(offer.provider)} cashback er aktivert for ${offer.merchantName}`);
    activationBadge.innerHTML = CHECK_ICON_SVG;
    const activationTooltip = document.createElement("div");
    activationTooltip.className = "status-tooltip";
    activationTooltip.textContent = `${formatProviderName(offer.provider)} cashback er aktivert for ${offer.merchantName}`;
    shadowRoot.append(activationTooltip);
    activationBadge.addEventListener("mouseenter", () => {
      positionStatusTooltipAbovePanel(activationTooltip, activationBadge, shadowRoot);
      activationTooltip.classList.add("visible");
    });
    activationBadge.addEventListener("mouseleave", () => {
      activationTooltip.classList.remove("visible");
    });
    providerWrap.append(activationBadge);
  }
  providerWrap.append(providerBadge);

  return providerWrap;
}

function installOfferActivationClickTracker(): void {
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const link = target.closest<HTMLAnchorElement>("a[href]");

    const hasModifier = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    const trumfActivationUrl = link !== null && isTrumfLogOfferClickUrl(link.href) ? link.href : undefined;
    const sasActivationUrl = isSasActivationClick(target, link) ? getCurrentSasOfferActivationUrl() : undefined;
    const nettbonusActivationUrl = isNettbonusActivationClick(target, link) ? getCurrentNettbonusOfferActivationUrl() : undefined;
    const spareborsenActivationUrl = isSpareborsenActivationClick(target) ? getCurrentSpareborsenOfferActivationUrl() : undefined;
    const rabbleActivationUrl = isRabbleActivationClick(target) ? getCurrentRabbleOfferActivationUrl() : undefined;
    const provider = trumfActivationUrl !== undefined ? "trumf" : sasActivationUrl !== undefined ? "sas" : nettbonusActivationUrl !== undefined ? "nettbonus" : spareborsenActivationUrl !== undefined ? "spareborsen" : rabbleActivationUrl !== undefined ? "rabble" : undefined;
    const activationUrl = trumfActivationUrl ?? sasActivationUrl ?? nettbonusActivationUrl ?? spareborsenActivationUrl ?? rabbleActivationUrl;

    if (provider === undefined || activationUrl === undefined) {
      return;
    }

    const canWaitForStorageBeforeNavigation = link !== null && (
      trumfActivationUrl !== undefined ||
      nettbonusActivationUrl !== undefined ||
      (sasActivationUrl !== undefined && isSasOutboundActivationUrl(link.href))
    );

    if (link === null || !canWaitForStorageBeforeNavigation) {
      void markOfferActivated(provider, activationUrl);
      return;
    }

    const opensSameTab = link.target === "" || link.target === "_self";

    if (hasModifier || !opensSameTab) {
      void markOfferActivated(provider, activationUrl);
      return;
    }

    event.preventDefault();
    void markOfferActivated(provider, activationUrl).finally(() => {
      window.location.assign(link.href);
    });
  }, true);
}

function isOfferActivated(
  offer: Pick<CashbackOffer, "provider" | "activationUrl" | "sourceUrl">,
  activeOfferKey: string | undefined,
): boolean {
  const activationKey = getProviderActivationKey(offer.provider, offer.activationUrl || offer.sourceUrl);
  return activationKey !== undefined && activationKey === activeOfferKey;
}

function getLastActivatedOfferKey(
  offers: readonly Pick<CashbackOffer, "provider" | "activationUrl" | "sourceUrl">[],
  activatedOffers: Readonly<Record<string, number>>,
): string | undefined {
  let latestKey: string | undefined;
  let latestActivatedAt = -1;

  for (const offer of offers) {
    const activationKey = getProviderActivationKey(offer.provider, offer.activationUrl || offer.sourceUrl);
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

type ActivationContext = "normal" | "incognito";

async function readActivatedOffers(now = Date.now()): Promise<Record<string, number>> {
  const stored = await getLocalStorageValue(ACTIVATED_OFFERS_STORAGE_KEY);
  const { activations, changed } = pruneStoredActivatedOffers(stored, now);

  if (isRecord(stored) && changed) {
    await setLocalStorageValue(ACTIVATED_OFFERS_STORAGE_KEY, activations);
  }

  return filterActivatedOffersForContext(activations, getCurrentActivationContext());
}

async function markOfferActivated(provider: string, rawUrl: string, now = Date.now()): Promise<void> {
  const activationKey = getProviderActivationKey(provider, rawUrl);
  if (activationKey === undefined) {
    return;
  }

  const stored = await getLocalStorageValue(ACTIVATED_OFFERS_STORAGE_KEY);
  const { activations } = pruneStoredActivatedOffers(stored, now);
  activations[getActivationStorageKey(getCurrentActivationContext(), activationKey)] = now;

  await setLocalStorageValue(ACTIVATED_OFFERS_STORAGE_KEY, activations);
}

function isTrumfLogOfferClickUrl(rawUrl: string): boolean {
  const parsedUrl = parseUrl(rawUrl);
  if (parsedUrl === undefined) {
    return false;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  return hostname === "trumfnetthandel.no" && /^\/LogOfferClick\/\d+\/\d+\/?$/.test(parsedUrl.pathname);
}

function isSasActivationClick(target: Element, link: HTMLAnchorElement | null): boolean {
  if (getCurrentSasOfferActivationUrl() === undefined) {
    return false;
  }

  if (link !== null && isSasOutboundActivationUrl(link.href)) {
    return true;
  }

  const clickable = target.closest<HTMLElement>("button,a,[role='button']");
  const text = clickable?.textContent?.trim().replace(/\s+/g, " ").toLowerCase();
  return text === "handle nå" || text === "shop now";
}

function getCurrentSasOfferActivationUrl(): string | undefined {
  const parsedUrl = parseUrl(window.location.href);
  if (parsedUrl === undefined) {
    return undefined;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
  if (hostname !== "onlineshopping.flysas.com" || pathParts.length < 4 || pathParts[1]?.toLowerCase() !== "butikker") {
    return undefined;
  }

  const port = parsedUrl.port.length > 0 ? `:${parsedUrl.port}` : "";
  const pathname = parsedUrl.pathname.length > 1 && parsedUrl.pathname.endsWith("/")
    ? parsedUrl.pathname.slice(0, -1)
    : parsedUrl.pathname;
  return `${parsedUrl.protocol}//${parsedUrl.hostname}${port}${pathname}`;
}

function isSasOutboundActivationUrl(rawUrl: string): boolean {
  const parsedUrl = parseUrl(rawUrl);
  if (parsedUrl === undefined) {
    return false;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  return (
    hostname === "go.adt246.net" ||
    hostname.endsWith(".adt246.net") ||
    parsedUrl.searchParams.get("utm_source")?.toLowerCase() === "adtraction" ||
    parsedUrl.searchParams.get("utm_medium")?.toLowerCase() === "affiliate"
  );
}

function isNettbonusActivationClick(_target: Element, link: HTMLAnchorElement | null): boolean {
  if (getCurrentNettbonusOfferActivationUrl() === undefined) {
    return false;
  }

  if (link === null) {
    return false;
  }

  // The activation link on nettbonus detail pages has class "partnerDetailsAction"
  // and/or id "externalLink", pointing to tradedoubler/other tracking URLs
  if (link.href === NETTBONUS_REFERRAL_URL) {
    return false;
  }
  return link.classList.contains("partnerDetailsAction") || link.id === "externalLink";
}

const NETTBONUS_REFERRAL_URL = "https://nettbonus.no/r/28698";
const SPAREBORSEN_REFERRAL_URL = "https://spareborsen.no/ref/cmoxhkl4bhevrnv9d6uo77an5";

function rewriteNettbonusLoginTriggers(): boolean {
  const loginLinks = document.querySelectorAll<HTMLAnchorElement>(
    'a.partnerDetailsAction[id^="loginTriggerOnDetails"]'
  );
  let found = false;
  for (const loginLink of loginLinks) {
    if (loginLink.getAttribute("href") === "/" || loginLink.getAttribute("href") === "") {
      // Clone to remove nettbonus.no's click handlers that show a login modal
      const clone = loginLink.cloneNode(true) as HTMLAnchorElement;
      clone.href = NETTBONUS_REFERRAL_URL;
      clone.target = "_blank";
      clone.removeAttribute("id");
      const adLabel = document.createElement("span");
      adLabel.textContent = "Ad";
      adLabel.style.cssText = "display:inline-block;font-size:10px;font-weight:700;color:#000;background:#fff;border:1px solid #000;border-radius:3px;padding:1px 4px;margin-right:8px;vertical-align:middle;line-height:14px;";
      clone.prepend(adLabel);
      loginLink.replaceWith(clone);
      found = true;
    }
  }
  return found;
}

if (getCurrentNettbonusOfferActivationUrl() !== undefined && !rewriteNettbonusLoginTriggers()) {
  const obs = new MutationObserver(() => {
    if (rewriteNettbonusLoginTriggers()) {
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), 10000);
}

if (isOnSpareborsenPartnerPage()) {
  installSpareborsenHandleButtonRewrite();
}

function isOnSpareborsenPartnerPage(): boolean {
  const parsedUrl = parseUrl(window.location.href);
  if (parsedUrl === undefined) return false;
  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  return hostname === "spareborsen.no" && /^\/partnere\/[^/]+/.test(parsedUrl.pathname);
}

function installSpareborsenHandleButtonRewrite(): void {
  let latestRunId = 0;

  const scheduleRewrite = (): void => {
    latestRunId += 1;
    const runId = latestRunId;
    void rewriteSpareborsenHandleButtonWhenReady(runId, () => runId !== latestRunId);
  };

  scheduleRewrite();

  const observer = new MutationObserver(() => {
    scheduleRewrite();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 15000);
}

async function rewriteSpareborsenHandleButtonWhenReady(
  _runId: number,
  isStale: () => boolean,
): Promise<void> {
  const state = await waitForSpareborsenAuthState(isStale);
  if (isStale() || state !== "logged-out") {
    return;
  }

  rewriteSpareborsenHandleButton();
}

type SpareborsenAuthState = "logged-in" | "logged-out" | "unknown";

async function waitForSpareborsenAuthState(isStale: () => boolean): Promise<SpareborsenAuthState> {
  const startedAt = Date.now();
  let lastState: SpareborsenAuthState = "unknown";
  let stableSince = 0;

  while (!isStale() && Date.now() - startedAt < 8000) {
    const state = getSpareborsenAuthState();
    const ready = isSpareborsenPageReady();

    if (state !== "unknown" && ready) {
      if (state !== lastState) {
        lastState = state;
        stableSince = Date.now();
      }

      if (Date.now() - stableSince >= 400) {
        return state;
      }
    } else {
      lastState = "unknown";
      stableSince = 0;
    }

    await sleep(100);
  }

  return "unknown";
}

function getSpareborsenAuthState(): SpareborsenAuthState {
  const header = document.querySelector("header");
  if (header === null) {
    return "unknown";
  }

  if (
    header.querySelector('a[href="/dashboard"], a[href="/wallet"], a[href="/dashboard/settings"]') !== null ||
    [...header.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Logg ut")
  ) {
    return "logged-in";
  }

  if (
    header.querySelector('a[href="/auth/login"], a[href="/auth/register"]') !== null ||
    [...header.querySelectorAll("button")].some((button) => {
      const text = button.textContent?.trim();
      return text === "Logg inn" || text === "Kom i gang";
    })
  ) {
    return "logged-out";
  }

  return "unknown";
}

function isSpareborsenPageReady(): boolean {
  const lbDot = document.querySelector<HTMLElement>("#lb-dot");
  if (lbDot !== null && getComputedStyle(lbDot).display !== "none") {
    return true;
  }

  return findSpareborsenHandleButton() !== null;
}

function findSpareborsenHandleButton(): HTMLButtonElement | null {
  for (const button of document.querySelectorAll<HTMLButtonElement>("button")) {
    const text = button.textContent?.replace(/^Ad\s*/i, "").trim() ?? "";
    if (text.startsWith("Handle hos") && text.endsWith("→")) {
      return button;
    }
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rewriteSpareborsenHandleButton(): boolean {
  if (getSpareborsenAuthState() !== "logged-out") {
    return false;
  }

  const handleButton = findSpareborsenHandleButton();
  if (handleButton === null || handleButton.closest("a[data-cb-rewrite]") !== null) {
    return false;
  }

  // Clone to strip React click handlers, wrap in referral link
  const clone = handleButton.cloneNode(true) as HTMLButtonElement;
  const link = document.createElement("a");
  link.href = SPAREBORSEN_REFERRAL_URL;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.style.textDecoration = "none";
  link.setAttribute("data-cb-rewrite", "1");
  const adLabel = document.createElement("span");
  adLabel.textContent = "Ad";
  adLabel.style.cssText = "display:inline-block;font-size:10px;font-weight:700;color:#000;background:#fff;border:1px solid #000;border-radius:3px;padding:1px 4px;margin-right:8px;vertical-align:middle;line-height:14px;";
  if (!clone.textContent?.trim().startsWith("Ad")) {
    clone.prepend(adLabel);
  }
  link.append(clone);
  handleButton.replaceWith(link);
  return true;
}

function getCurrentNettbonusOfferActivationUrl(): string | undefined {
  const parsedUrl = parseUrl(window.location.href);
  if (parsedUrl === undefined) {
    return undefined;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  if (hostname !== "nettbonus.no") {
    return undefined;
  }

  // Detail page URLs are /details/{id}/{slug}
  if (!/^\/details\/\d+\//.test(parsedUrl.pathname)) {
    return undefined;
  }

  return window.location.href;
}

function isSpareborsenActivationClick(target: Element): boolean {
  if (getCurrentSpareborsenOfferActivationUrl() === undefined) {
    return false;
  }
  // The "Handle hos X →" button is a <button> without an <a> wrapper (when logged in)
  const clickable = target.closest<HTMLElement>("button");
  const text = clickable?.textContent?.trim() ?? "";
  return text.startsWith("Handle hos") && text.endsWith("→");
}

function getCurrentSpareborsenOfferActivationUrl(): string | undefined {
  const parsedUrl = parseUrl(window.location.href);
  if (parsedUrl === undefined) {
    return undefined;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  if (hostname !== "spareborsen.no") {
    return undefined;
  }

  // Partner detail pages: /partnere/{slug}
  if (!/^\/partnere\/[^/]+/.test(parsedUrl.pathname)) {
    return undefined;
  }

  return window.location.href;
}

function isRabbleActivationClick(target: Element): boolean {
  if (getCurrentRabbleOfferActivationUrl() === undefined) {
    return false;
  }
  // If the login button is visible in the nav, user is not logged in
  if (document.querySelector('a.ph__link--login-button[href="/login"]') !== null) {
    return false;
  }
  const clickable = target.closest<HTMLElement>("button,a,[role='button']");
  if (!clickable) return false;
  return clickable.classList.contains("online-cashback-offer-cta-button") ||
    clickable.closest(".online-cashback-offer-cta") !== null;
}

function getCurrentRabbleOfferActivationUrl(): string | undefined {
  const parsedUrl = parseUrl(window.location.href);
  if (parsedUrl === undefined) {
    return undefined;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  if (hostname !== "rabble.no") {
    return undefined;
  }

  // Detail page URLs are /online/{id}-{slug}
  if (!/^\/online\/\d+-/.test(parsedUrl.pathname)) {
    return undefined;
  }

  return window.location.href;
}

function getProviderActivationKey(provider: string, rawUrl: string): string | undefined {
  const normalizedUrl = normalizeActivationUrl(rawUrl);
  return normalizedUrl === undefined ? undefined : `${provider}:${normalizedUrl}`;
}

function getCurrentActivationContext(): ActivationContext {
  const chromeWithExtension = typeof chrome === "undefined"
    ? undefined
    : chrome as typeof chrome & { extension?: { inIncognitoContext?: boolean } };

  return chromeWithExtension?.extension?.inIncognitoContext === true ? "incognito" : "normal";
}

function pruneStoredActivatedOffers(
  value: unknown,
  now: number,
): { activations: Record<string, number>; changed: boolean } {
  if (!isRecord(value)) {
    return { activations: {}, changed: false };
  }

  const activations: Record<string, number> = {};
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
  activations: Readonly<Record<string, number>>,
  context: ActivationContext,
): Record<string, number> {
  const filtered: Record<string, number> = {};
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

function getLocalStorageValue(key: string): Promise<unknown> {
  return new Promise((resolveValue) => {
    chrome.storage.local.get([key], (items) => {
      const value: unknown = items[key];
      resolveValue(value);
    });
  });
}

function setLocalStorageValue(key: string, value: unknown): Promise<void> {
  return new Promise((resolveValue) => {
    chrome.storage.local.set({ [key]: value }, () => {
      resolveValue();
    });
  });
}

function renderNotice(
  offers: CashbackOffer[],
  initialCollapsed: boolean,
  initialChipsCollapsed: boolean,
  initialCodesCollapsed: boolean,
  initialPriceMatchCollapsed: boolean,
  activatedOffers: Readonly<Record<string, number>>,
  priceMatch?: PriceMatchOffer,
): void {
  clearNotice();
  const host = document.createElement("div");
  host.id = HOST_ID;
  applyHostOverlayStyle(host);
  const shadowRoot = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host {
      all: initial;
      background: transparent;
      border: 0;
      bottom: 16px;
      box-sizing: border-box;
      display: block;
      height: 0;
      inset: auto auto 16px 0;
      left: 0;
      margin: 0;
      overflow: visible;
      padding: 0;
      position: fixed;
      width: 0;
      z-index: 2147483647;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    *, *::before, *::after {
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .notice {
      display: flex;
      align-items: flex-end;
      bottom: 16px;
      left: 0;
      max-width: 100vw;
      position: fixed;
      width: max-content;
      z-index: 2147483647;
    }
    .side-tab {
      appearance: none;
      background: #ffffff;
      border: 1px solid #c9d7cf;
      border-left: none;
      border-radius: 0 8px 8px 0;
      box-shadow: 2px 4px 12px rgba(11, 25, 34, 0.12);
      color: #172026;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font: inherit;
      min-height: 40px;
      padding: 8px 5px;
      width: 26px;
      flex-shrink: 0;
      transition: min-height 0.25s ease, padding 0.25s ease;
    }
    .side-tab:hover {
      background: #f7faf8;
    }
    .side-tab-arrow {
      font-size: 16px;
      font-weight: 700;
      line-height: 1;
      display: block;
    }
    .side-tab-text {
      display: none;
      writing-mode: vertical-rl;
      text-orientation: mixed;
      transform: rotate(180deg);
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
      color: #172026;
      letter-spacing: 0.02em;
      margin-top: 6px;
      align-items: center;
      gap: 4px;
    }
    .side-tab-reward {
      color: #172026;
    }
    .side-tab-chip {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 4px;
      border-radius: 4px;
    }
    .notice.collapsed .side-tab {
      min-height: 80px;
      padding: 10px 5px;
    }
    .notice.collapsed .side-tab-arrow {
      display: none;
    }
    .notice.collapsed .side-tab-text {
      display: flex;
    }
    .panel {
      width: min(400px, calc(100vw - 70px));
      color: #172026;
      background: #ffffff;
      border: 1px solid #c9d7cf;
      border-radius: 8px;
      box-shadow: 0 14px 38px rgba(11, 25, 34, 0.2);
      overflow: hidden;
      margin-left: 4px;
      transform: translateZ(0);
      transition: width 0.25s ease, opacity 0.25s ease, margin-left 0.25s ease, border-width 0.25s ease;
    }
    .notice.collapsed .panel {
      width: 0;
      opacity: 0;
      margin-left: 0;
      border-width: 0;
      pointer-events: none;
    }
    .notice.no-transition .panel,
    .notice.no-transition .side-tab {
      transition: none;
    }
    .topline {
      height: 4px;
      background: linear-gradient(90deg, #1f8f5f, #f4b942);
    }
    .body {
      display: grid;
      gap: 10px;
      padding: 14px 14px 0 14px;
    }
    .header {
      align-items: center;
      display: grid;
      gap: 12px;
      grid-template-columns: 24px minmax(0, 1fr) auto;
      min-height: 32px;
    }
    .sum-input {
      background: #f7faf8;
      border: 1px solid #d8e3de;
      border-radius: 5px;
      color: #172026;
      font-family: inherit;
      font-size: 12px;
      height: 26px;
      outline: none;
      padding: 0 6px;
      text-align: right;
      width: 68px;
    }
    .sum-input:focus {
      border-color: #1f8f5f;
    }
    .sum-input::placeholder {
      color: #8a9a92;
      font-size: 11px;
    }
    .site-icon {
      background: #f7faf8;
      border: 1px solid #d8e3de;
      border-radius: 6px;
      height: 24px;
      object-fit: contain;
      padding: 3px;
      width: 24px;
    }
    .title {
      font-size: 14px;
      font-weight: 700;
      line-height: 1.25;
      margin: 0;
      overflow-wrap: anywhere;
    }
    .offer-list {
      display: grid;
      gap: 4px;
    }
    .offer-link.offer-link--best {
      color: #3a7d55;
    }
    .offer-link {
      align-items: center;
      background: #f7faf8;
      border: 1px solid #d8e3de;
      border-radius: 5px;
      color: #172026;
      display: grid;
      font-size: 14px;
      gap: 8px;
      grid-template-columns: minmax(0, 1fr) auto auto;
      padding: 5px 9px;
      text-decoration: none;
    }
    .offer-link .provider-badge {
      grid-column: 3;
    }
    .provider-wrap {
      align-items: center;
      display: inline-flex;
      gap: 5px;
      grid-column: 3;
      justify-content: flex-end;
      min-width: 0;
    }
    .activation-badge {
      align-items: center;
      background: #eaf7ef;
      border: 1px solid #a9d9bd;
      border-radius: 4px;
      color: #166b47;
      display: inline-flex;
      flex-shrink: 0;
      height: 18px;
      justify-content: center;
      line-height: 1;
      width: 18px;
    }
    .activation-badge svg {
      flex-shrink: 0;
      height: 12px;
      width: 12px;
    }
    .offer-label {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      font-size: 14px;
      font-weight: 700;
      gap: 6px;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }
    .provider-badge {
      align-items: center;
      border-radius: 5px;
      display: inline-flex;
      font-size: 11px;
      font-weight: 800;
      line-height: 1;
      min-height: 20px;
      padding: 0 6px;
      white-space: nowrap;
    }
    .provider-remember {
      background: #111111;
      color: #ff9900;
    }
    .provider-klarna {
      background: #ffa8cd;
      color: #0b051d;
    }
    .provider-trumf {
      background: #07006b;
      color: #ffffff;
    }
    .provider-sas {
      background: #00005c;
      color: #ffffff;
    }
    .provider-tfbank {
      background: #e30613;
      color: #ffffff;
    }
    .provider-dnb {
      background: #14555a;
      color: #ffffff;
    }
    .provider-curve {
      background: #000000;
      color: #ffffff;
    }
    .provider-crypto {
      background: #002d74;
      color: #ffffff;
    }
    .provider-rabattkode {
      background: #e74c3c;
      color: #ffffff;
    }
    .provider-norskfamilie {
      background: #ff6600;
      color: #ffffff;
    }
    .provider-revolut {
      background: #0666eb;
      color: #ffffff;
    }
    .provider-norwegian {
      background: #d81939;
      color: #ffffff;
    }
    .provider-logbuy {
      background: #d81939;
      color: #ffffff;
    }
    .provider-obos {
      background: #003087;
      color: #ffffff;
    }
    .provider-bob {
      background: #ffffff;
      border: 1px solid #d3e2dc;
      color: #5b2486;
    }
    .provider-usbl {
      background: #34413e;
      color: #ffffff;
    }
    .provider-naf {
      background: #FFD100;
      color: #000000;
    }
    .provider-tekna {
      background: #ffffff;
      border: 1px solid #d3e2dc;
      color: #00a3ad;
    }
    .provider-nito {
      background: #c8e6b8;
      color: #003b00;
    }
    .provider-prisjakt {
      background: #ff8a00;
      color: #ffffff;
    }
    .provider-sparebank1 {
      background: #005aa4;
      color: #ffffff;
    }
    .provider-studentkortet {
      background: #1B2838;
      color: #ffffff;
    }
    .provider-studenttorget {
      background: #009fe3;
      color: #ffffff;
    }
    .provider-nettbonus {
      background: #5b0f8c;
      color: #ffffff;
    }
    .provider-spenn {
      background: #E51454;
      color: #ffffff;
    }
    .provider-spareborsen {
      background: #C9A24A;
      color: #1A1A1A;
    }
    .provider-rabble {
      background: #2d2145;
      color: #f8a6a6;
    }
    .provider-dreams {
      background: #a389d8;
      color: #1a1a1a;
    }
    .provider-utdanningibergen {
      background: #ffffff;
      color: #000000;
      border: 1px solid #ccc;
    }
    .provider-unidays {
      background: #00b140;
      color: #ffffff;
    }
    .provider-cbn {
      background: #f7d7e6;
      color: #8f164f;
    }
    .provider-unio {
      background: #ffffff;
      border: 1px solid #c9b896;
      color: #6b5330;
    }
    .provider-sas-amex {
      background: #00005c;
      color: #ffffff;
    }
    .provider-lunar {
      background: #2bb24c;
      color: #ffffff;
    }
    .copy-code-btn {
      align-items: center;
      color: #1f8f5f;
      cursor: pointer;
      display: inline-flex;
      flex-shrink: 0;
      padding: 4px;
      border-radius: 4px;
      position: relative;
    }
    .copy-code-btn:hover {
      color: #166b47;
    }
    .vote-btn {
      align-items: center;
      color: #b0c8bc;
      cursor: pointer;
      display: inline-flex;
      gap: 3px;
      padding: 4px;
      border-radius: 4px;
      font-size: 11px;
      line-height: 1;
      background: none;
      border: none;
    }
    .vote-btn:hover {
      color: #1f8f5f;
    }
    .vote-btn.voted {
      color: #1f8f5f;
    }
    .vote-btn.downvoted {
      color: #e05555;
    }
    .vote-count {
      font-size: 11px;
      font-weight: 600;
    }
    .add-code-btn {
      align-items: center;
      background: none;
      border: none;
      color: #b0c8bc;
      cursor: pointer;
      display: inline-flex;
      margin-left: auto;
      padding: 2px 4px;
      border-radius: 4px;
      line-height: 1;
    }
    .add-code-btn:hover {
      color: #1f8f5f;
    }
    .add-code-form {
      align-items: center;
      display: flex;
      gap: 6px;
      padding: 2px 0;
    }
    .add-code-form-inner {
      align-items: center;
      background: #f7faf8;
      border: 1px solid #d0dbd5;
      border-radius: 6px;
      display: flex;
      flex: 1;
      gap: 4px;
      min-width: 0;
      padding: 3px 6px;
    }
    .add-code-input {
      background: transparent;
      border: none;
      color: #172026;
      flex: 1;
      font-size: 12px;
      min-width: 0;
      padding: 4px 2px;
      font-family: inherit;
      outline: none;
    }
    .add-reward-input {
      flex: 0 0 48px;
      border-right: 1px solid #d0dbd5;
      padding-right: 6px;
    }
    .add-code-submit {
      align-items: center;
      background: none;
      border: none;
      border-radius: 4px;
      color: #1f8f5f;
      cursor: pointer;
      display: inline-flex;
      padding: 4px;
      flex-shrink: 0;
    }
    .add-code-submit:disabled {
      color: #b0c8bc;
      cursor: default;
    }
    .add-code-cancel {
      align-items: center;
      background: none;
      border: none;
      color: #8a9ba3;
      cursor: pointer;
      display: inline-flex;
      flex-shrink: 0;
      font-size: 14px;
      height: 22px;
      justify-content: center;
      padding: 0;
      width: 22px;
    }
    .add-code-cancel:hover {
      color: #172026;
    }
    .add-code-thanks {
      color: #1f8f5f;
      font-size: 11px;
      margin: 0;
      padding: 4px 0;
    }
    .delete-code-btn {
      align-items: center;
      background: none;
      border: none;
      color: #b0bec5;
      cursor: pointer;
      display: inline-flex;
      padding: 2px 3px;
      border-radius: 4px;
      flex-shrink: 0;
      font-size: 13px;
      line-height: 1;
    }
    .delete-code-btn:hover {
      color: #e05555;
    }
    .expired-section {
      margin-top: 4px;
      padding-top: 4px;
    }
    .expired-toggle {
      align-items: center;
      background: none;
      border: none;
      color: #8a9ba3;
      cursor: pointer;
      display: flex;
      font-size: 11px;
      gap: 4px;
      padding: 2px 0;
      width: 100%;
    }
    .expired-toggle:hover {
      color: #172026;
    }
    .expired-toggle-arrow {
      display: inline-block;
      font-size: 9px;
      transition: transform 0.15s;
    }
    .expired-section.collapsed .expired-toggle-arrow {
      transform: rotate(-90deg);
    }
    .expired-list {
      display: grid;
      gap: 4px;
      margin-top: 4px;
    }
    .expired-section.collapsed .expired-list {
      display: none;
    }
    .code-item.expired {
      opacity: 0.55;
    }
    .copy-code-tooltip {
      background: #1a1a2e;
      border-radius: 6px;
      color: #e0e0e0;
      font-size: 11px;
      font-weight: 400;
      line-height: 1.3;
      padding: 5px 8px;
      pointer-events: none;
      position: fixed;
      white-space: nowrap;
      z-index: 2147483647;
      display: none;
    }
    .copy-code-tooltip.visible {
      display: block;
    }
    .bonus-chips {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .chip-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .chip-group-label {
      color: #8a9a92;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    .chip-group-items {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .bonus-chips-section {
      margin-top: -4px;
      padding: 6px 0 4px;
    }
    .bonus-chips-toggle {
      align-items: center;
      appearance: none;
      background: none;
      border: none;
      color: #8a9a92;
      cursor: pointer;
      display: flex;
      font: inherit;
      font-size: 11px;
      gap: 4px;
      line-height: 1;
      margin-bottom: 5px;
      padding: 0;
    }
    .bonus-chips-toggle:hover {
      color: #4f5f66;
    }
    .bonus-chips-toggle-arrow {
      display: inline-block;
      font-size: 10px;
      transition: transform 0.15s;
    }
    .bonus-chips-section.collapsed .bonus-chips {
      display: none;
    }
    .bonus-chips-section.collapsed .bonus-chips-toggle-arrow {
      transform: rotate(-90deg);
    }
    .codes-section {
      margin-top: -4px;
      padding: 6px 0 4px;
    }
    .codes-toggle {
      align-items: center;
      appearance: none;
      background: none;
      border: none;
      color: #8a9a92;
      cursor: pointer;
      display: flex;
      font: inherit;
      font-size: 11px;
      gap: 4px;
      line-height: 1;
      margin-bottom: 5px;
      padding: 0;
      width: 100%;
    }
    .codes-toggle:hover {
      color: #4f5f66;
    }
    .codes-toggle-arrow {
      display: inline-block;
      font-size: 10px;
      transition: transform 0.15s;
    }
    .codes-section.collapsed .codes-list {
      display: none;
    }
    .codes-section.collapsed .expired-section {
      display: none !important;
    }
    .codes-section.collapsed .codes-toggle-arrow {
      transform: rotate(-90deg);
    }
    .price-match-section {
      margin-top: -4px;
      padding: 6px 0 4px;
    }
    .price-match-toggle {
      align-items: center;
      appearance: none;
      background: none;
      border: none;
      color: #8a9a92;
      cursor: pointer;
      display: flex;
      font: inherit;
      font-size: 11px;
      gap: 4px;
      line-height: 1;
      margin-bottom: 5px;
      padding: 0;
      width: 100%;
    }
    .price-match-toggle:hover {
      color: #4f5f66;
    }
    .price-match-toggle-arrow {
      display: inline-block;
      font-size: 10px;
      transition: transform 0.15s;
    }
    .price-match-section.collapsed .price-match-card {
      display: none;
    }
    .price-match-section.collapsed .price-match-toggle-arrow {
      transform: rotate(-90deg);
    }
    .price-match-card {
      align-items: center;
      background: #fffaf2;
      border: 1px solid #ffd09a;
      border-radius: 5px;
      color: #172026;
      display: grid;
      font-size: 12px;
      gap: 8px;
      grid-template-columns: minmax(0, 1fr) auto auto;
      padding: 6px 9px;
      text-decoration: none;
    }
    .price-match-title {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .price-match-product {
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .price-match-shop {
      color: #5d6b71;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .price-match-price {
      color: #172026;
      font-weight: 800;
      white-space: nowrap;
    }
    .codes-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .code-item-row {
      align-items: center;
      display: flex;
      gap: 6px;
    }
    .code-item {
      align-items: center;
      background: #f7faf8;
      border: 1px solid #d8e3de;
      border-radius: 5px;
      display: flex;
      flex: 1;
      font-size: 12px;
      gap: 6px;
      min-width: 0;
      padding: 5px 9px;
    }
    .code-reward {
      font-weight: 700;
      white-space: nowrap;
    }
    .code-item-row--best .code-reward,
    .code-item-row--best .code-value {
      color: #3a7d55;
    }
    .code-value {
      color: #5d6b71;
      font-family: monospace;
      font-size: 11px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .code-copy-group {
      align-items: center;
      display: inline-flex;
      flex: 1 1 auto;
      gap: 4px;
      min-width: 0;
    }
    .code-source-badge {
      flex-shrink: 0;
      font-size: 11px;
      min-height: 22px;
      text-decoration: none;
    }
    .bonus-chip {
      align-items: center;
      background: #f0f4f2;
      border: 1px solid #d8e3de;
      border-radius: 20px;
      color: #172026;
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 600;
      gap: 4px;
      line-height: 1;
      padding: 5px 10px;
      text-decoration: none;
      white-space: nowrap;
    }
    .bonus-chip:hover {
      background: #e4ebe7;
    }
    .bonus-chip--best {
      color: #3a7d55;
    }
    .bonus-chip-label {
      font-weight: 800;
    }
    .bonus-chip .provider-badge {
      font-size: 9px;
      min-height: 16px;
      padding: 0 5px;
    }
    .bonus-chip-tooltip {
      background: #1a1a2e;
      border-radius: 8px;
      color: #e0e0e0;
      font-size: 11px;
      font-weight: 400;
      line-height: 1.5;
      max-width: 320px;
      padding: 8px 10px;
      pointer-events: none;
      position: fixed;
      white-space: pre-line;
      width: max-content;
      z-index: 2147483647;
      display: none;
    }
    .bonus-chip-tooltip.visible {
      display: block;
    }
    .offer-link-wrapper {
      position: relative;
    }
    .card-only-warn {
      color: #b0bec5;
      cursor: help;
      font-size: 11px;
      line-height: 1;
      user-select: none;
    }
    .app-chip {
      display: inline-block;
      font-size: 9px;
      font-weight: 600;
      color: #78909c;
      border: 1px solid #78909c;
      border-radius: 3px;
      padding: 0 3px;
      margin-right: 4px;
      vertical-align: middle;
      line-height: 14px;
      white-space: nowrap;
      cursor: help;
    }
    .offer-tooltip {
      background: #1a1a2e;
      border-radius: 8px;
      color: #e0e0e0;
      display: none;
      font-size: 11px;
      font-weight: 400;
      line-height: 1.5;
      max-width: 320px;
      padding: 8px 10px;
      pointer-events: none;
      position: fixed;
      white-space: normal;
      width: max-content;
      z-index: 2147483647;
    }
    .offer-tooltip-section + .offer-tooltip-section {
      margin-top: 8px;
    }
    .offer-tooltip-section + .offer-tooltip-section:has(.offer-tooltip-list) {
      margin-top: 14px;
    }
    .offer-tooltip-title {
      display: block;
      font-weight: 700;
      margin-bottom: 5px;
    }
    .offer-tooltip-text {
      display: block;
      white-space: pre-line;
    }
    .offer-tooltip-list {
      display: grid;
      gap: 4px;
      list-style: disc;
      margin: 0;
      padding-left: 16px;
    }
    .offer-tooltip-list li {
      padding-left: 2px;
    }
    .offer-tooltip.visible {
      display: block;
    }
    .support {
      padding: 6px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .support a {
      color: #8a9a92;
      font-size: 11px;
      line-height: 1.35;
      text-decoration: none;
    }
    .support a:hover {
      color: #4f5f66;
      text-decoration: underline;
    }
    .support-logo {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      flex-shrink: 0;
      opacity: 0.7;
    }
    .support-logo:hover {
      opacity: 1;
    }
    .conflict-warning {
      color: #d4830a;
      cursor: help;
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
      margin-left: 4px;
      vertical-align: middle;
    }
    .status-tooltip {
      background: #1a1a2e;
      border-radius: 8px;
      color: #e0e0e0;
      display: none;
      font-size: 11px;
      font-weight: 400;
      line-height: 1.5;
      max-width: 280px;
      padding: 8px 10px;
      pointer-events: none;
      position: fixed;
      white-space: pre-line;
      width: max-content;
      z-index: 2147483647;
    }
    .status-tooltip.visible {
      display: block;
    }
  `;
  const mainOffers = offers.filter((o) => o.provider !== "curve" && o.provider !== "rabattkode" && o.provider !== "dnb" && o.provider !== "tfbank");
  const activeOfferKey = getLastActivatedOfferKey(mainOffers, activatedOffers);
  const curveOffer = offers.find((o) => o.provider === "curve");
  const CARD_ONLY_PROVIDERS = new Set(["sparebank1", "remember", "tfbank"]);
  const APP_ONLY_PROVIDERS = new Set(["klarna", "spenn", "dreams"]);
  const CRYPTO_SUBSCRIPTIONS: Record<string, string> = {
    "spotify.com": "Spotify",
    "netflix.com": "Netflix",
    "truthsocial.com": "Truth+",
  };
  const currentHost = window.location.hostname.replace(/^www\./, "").toLowerCase();
  const cryptoSubEntry = Object.entries(CRYPTO_SUBSCRIPTIONS).find(([d]) => currentHost === d || currentHost.endsWith(`.${d}`));
  const cryptoSub = cryptoSubEntry?.[1];
  const codeOffers = offers.filter((o) => o.provider === "rabattkode" || (o.discountCode !== undefined && o.discountCode.length > 0));
  const offer = mainOffers[0];
  if (offer === undefined && codeOffers.length === 0 && priceMatch === undefined) {
    return;
  }
  const primaryOffer = offer ?? codeOffers[0];
  if (primaryOffer === undefined && priceMatch === undefined) {
    return;
  }
  const notice = document.createElement("section");
  notice.className = "notice";
  const sideTabProvider = offer?.provider ?? (primaryOffer !== undefined ? getCodeSourceProvider(primaryOffer) : undefined) ?? (priceMatch !== undefined ? "prisjakt" : "rabattkode");
  // Side tab (collapse/expand control on the left edge)
  const sideTab = document.createElement("button");
  sideTab.className = `side-tab side-tab-${sideTabProvider}`;
  sideTab.type = "button";
  sideTab.setAttribute("aria-label", "Collapse cashback offers");
  const sideTabArrow = document.createElement("span");
  sideTabArrow.className = "side-tab-arrow";
  sideTabArrow.textContent = "\u2039"; // ‹
  const sideTabText = document.createElement("span");
  sideTabText.className = "side-tab-text";
  if (offer !== undefined) {
    const rewardSpan = document.createElement("span");
    rewardSpan.className = "side-tab-reward";
    rewardSpan.textContent = formatCompactRewardLabel(offer) ?? formatRewardLabel(offer.reward, offer.provider);
    const chipSpan = document.createElement("span");
    chipSpan.className = `side-tab-chip provider-${offer.provider}`;
    chipSpan.textContent = formatProviderName(offer.provider);
    sideTabText.append(rewardSpan, chipSpan);
  } else if (primaryOffer !== undefined) {
    const rewardSpan = document.createElement("span");
    rewardSpan.className = "side-tab-reward";
    rewardSpan.textContent = formatCompactRewardLabel(primaryOffer) ?? primaryOffer.reward;
    sideTabText.append(rewardSpan);
    const codeProvider = getCodeSourceProvider(primaryOffer);
    if (codeProvider !== undefined) {
      const chipSpan = document.createElement("span");
      chipSpan.className = `side-tab-chip provider-${codeProvider}`;
      chipSpan.textContent = formatProviderName(codeProvider);
      sideTabText.append(chipSpan);
    }
  } else if (priceMatch !== undefined) {
    const rewardSpan = document.createElement("span");
    rewardSpan.className = "side-tab-reward";
    rewardSpan.textContent = priceMatch.price;
    const chipSpan = document.createElement("span");
    chipSpan.className = "side-tab-chip provider-prisjakt";
    chipSpan.textContent = "Prisjakt";
    sideTabText.append(rewardSpan, chipSpan);
  }
  sideTab.append(sideTabArrow, sideTabText);
  sideTab.addEventListener("click", () => {
    const isCollapsed = notice.classList.contains("collapsed");
    setCollapsed(notice, sideTab, sideTabArrow, !isCollapsed);
  });
  // Main panel
  const panel = document.createElement("div");
  panel.className = "panel";
  const topLine = document.createElement("div");
  topLine.className = "topline";
  const body = document.createElement("div");
  body.className = "body";
  const header = document.createElement("div");
  header.className = "header";
  const siteIcon = createSiteIcon();
  const title = document.createElement("p");
  title.className = "title";
  title.textContent = offer !== undefined
    ? `${formatOfferTitlePrefix(offer)} hos ${offer.merchantName}`
    : primaryOffer !== undefined
      ? `Rabattkode hos ${primaryOffer.merchantName}`
      : `Prismatch hos ${priceMatch?.shopName ?? "Prisjakt"}`;
  header.append(siteIcon, title);
  const sumInput = document.createElement("input");
  sumInput.className = "sum-input";
  sumInput.type = "text";
  sumInput.inputMode = "decimal";
  sumInput.placeholder = "Sum";
  sumInput.addEventListener("keydown", (e) => {
    if (e.key.length === 1 && !/[0-9.,]/.test(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault();
  });
  header.append(sumInput);
  const rewardLabels: { element: HTMLSpanElement; offer: CashbackOffer }[] = [];
  const tooltipElements: { element: HTMLDivElement; offer: CashbackOffer }[] = [];
  const offerList = document.createElement("div");
  offerList.className = "offer-list";
  for (const [offerIdx, currentOffer] of mainOffers.entries()) {
    const wrapper = document.createElement("div");
    wrapper.className = "offer-link-wrapper";
    const offerLink = document.createElement("a");
    const isBestOffer = offerIdx === 0;
    offerLink.className = isBestOffer ? "offer-link offer-link--best" : "offer-link";
    offerLink.href = currentOffer.provider === "trumf" || currentOffer.provider === "klarna" ? currentOffer.sourceUrl : currentOffer.activationUrl;
    offerLink.target = "_blank";
    offerLink.rel = "noreferrer";
    const offerLabel = document.createElement("span");
    offerLabel.className = "offer-label";
    const offerReward = document.createElement("span");
    offerReward.textContent = formatRewardLabel(currentOffer.reward, currentOffer.provider);
    rewardLabels.push({ element: offerReward, offer: currentOffer });
    const providerWrap = createProviderBadgeWithActivation(currentOffer, activeOfferKey, shadowRoot);
    if (currentOffer.provider === "nettbonus" || currentOffer.provider === "spareborsen") {
      const adChip = makeAdChip();
      providerWrap.prepend(adChip);
    }
    offerLabel.append(offerReward);
    if (currentOffer.discountCode !== undefined) {
      const code = currentOffer.discountCode;
      const copyBtn = document.createElement("span");
      copyBtn.className = "copy-code-btn";
      copyBtn.innerHTML = COPY_ICON_SVG;
      const copyTooltip = document.createElement("div");
      copyTooltip.className = "copy-code-tooltip";
      copyTooltip.textContent = `Kopier rabattkode: ${code}`;
      shadowRoot.append(copyTooltip);
      copyBtn.addEventListener("mouseenter", () => {
        const rect = copyBtn.getBoundingClientRect();
        copyTooltip.style.left = `${rect.left + rect.width / 2}px`;
        copyTooltip.style.top = `${rect.top - 30}px`;
        copyTooltip.style.transform = "translateX(-50%)";
        copyTooltip.classList.add("visible");
      });
      copyBtn.addEventListener("mouseleave", () => {
        copyTooltip.classList.remove("visible");
      });
      copyBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(code).then(() => {
          copyBtn.innerHTML = CHECK_ICON_SVG;
          copyTooltip.textContent = "Kopiert!";
          copyTooltip.classList.add("visible");
          setTimeout(() => {
            copyBtn.innerHTML = COPY_ICON_SVG;
            copyTooltip.textContent = `Kopier rabattkode: ${code}`;
            copyTooltip.classList.remove("visible");
          }, 1500);
        });
      });
      offerLink.append(offerLabel, copyBtn, providerWrap);
    } else if (CARD_ONLY_PROVIDERS.has(currentOffer.provider)) {
      const warnIcon = document.createElement("span");
      warnIcon.className = "card-only-warn";
      warnIcon.textContent = "⚠";
      offerLink.append(offerLabel, warnIcon, providerWrap);
    } else if (APP_ONLY_PROVIDERS.has(currentOffer.provider)) {
      const appChip = document.createElement("span");
      appChip.className = "app-chip";
      appChip.textContent = "App";
      offerLink.append(offerLabel, appChip, providerWrap);
    } else {
      offerLink.append(offerLabel, providerWrap);
    }
    wrapper.append(offerLink);
    offerList.append(wrapper);
  }
  sumInput.addEventListener("input", () => {
    const raw = sumInput.value.replace(/[^0-9.,]/g, "").replace(",", ".");
    const amount = raw.length > 0 ? Number.parseFloat(raw) : 0;
    for (const el of shadowRoot.querySelectorAll<HTMLElement>(".code-reward[data-pct]")) {
      const pct = parseFloat(el.dataset.pct ?? "0");
      if (!el.dataset.origReward) el.dataset.origReward = el.textContent ?? "";
      const orig = el.dataset.origReward;
      if (pct > 0 && amount > 0) {
        el.textContent = `${Math.round(amount * pct / 100)} kr`;
      } else {
        el.textContent = orig;
      }
    }
    for (const { element, offer } of rewardLabels) {
      if (amount > 0) {
        const result = calculateCashback(offer, amount);
        element.textContent = result !== "" ? result : formatRewardLabel(offer.reward, offer.provider);
      } else {
        element.textContent = formatRewardLabel(offer.reward, offer.provider);
      }
    }
    for (const { element, offer } of tooltipElements) {
      const fullReward = formatRewardLabel(offer.reward, offer.provider);
      const compact = formatCompactRewardLabel(offer);
      const showRewardInTooltip = compact !== undefined && fullReward !== compact && !fullReward.startsWith(compact);
      const breakdown = amount > 0 ? formatBreakdownWithAmounts(offer.terms, amount) : offer.terms;
      const parts: string[] = [];
      if (breakdown) parts.push(breakdown);
      setTooltipContent(element, parts);
    }
    for (const { element, pct, minPct, maxPct, ebPer100kr, approx, defaultText } of bonusChipLabels) {
      if (amount > 0 && minPct != null && maxPct != null) {
        element.textContent = `+${formatKr(amount * minPct / 100)}-${formatKr(amount * maxPct / 100)} kr`;
      } else if (amount > 0) {
        const kr = formatKr(amount * pct / 100);
        if (ebPer100kr != null) {
          const eb = Math.round(amount * ebPer100kr / 100);
          element.textContent = `+~${kr} kr (~${eb} EB)`;
        } else {
          element.textContent = `+${approx ? "~" : ""}${kr} kr`;
        }
      } else {
        element.textContent = defaultText;
      }
    }
    chipsToggleText.textContent = "Ekstra cashback";
  });
  const bonusChipLabels: { element: HTMLSpanElement; pct: number; minPct?: number; maxPct?: number; ebPer100kr?: number; approx: boolean; defaultText: string }[] = [];
  const bonusChips = document.createElement("div");
  bonusChips.className = "bonus-chips";
  // --- Free chips group (left) ---
  const freeGroup = document.createElement("div");
  freeGroup.className = "chip-group";
  const freeLabel = document.createElement("span");
  freeLabel.className = "chip-group-label";
  freeLabel.textContent = "Gratis";
  const freeItems = document.createElement("div");
  freeItems.className = "chip-group-items";
  freeGroup.append(freeLabel, freeItems);
  function createBonusChip(card: typeof FREE_CARDS[number], overrideUrl?: string): { chip: HTMLAnchorElement; label: HTMLSpanElement } {
    const chip = document.createElement("a");
    chip.className = "bonus-chip";
    chip.href = overrideUrl ?? card.url;
    chip.target = "_blank";
    chip.rel = "noreferrer";
    const label = document.createElement("span");
    label.className = "bonus-chip-label";
    const ebInfo = card.ebPer100kr ? ` (~${card.ebPer100kr} EB/100kr)` : "";
    const pctStr = (card.minPct != null && card.maxPct != null)
      ? `${(card.minPct * 100).toFixed(2).replace(".", ",").replace(/0$/, "")}-${(card.maxPct * 100).toFixed(2).replace(".", ",").replace(/0$/, "")}`
      : (card.pct * 100).toFixed(2).replace(".", ",").replace(/0$/, "");
    label.textContent = `+${card.approx ? "~" : ""}${pctStr} %${ebInfo}`;
    const badge = document.createElement("span");
    badge.className = `provider-badge provider-${card.badge}`;
    badge.textContent = card.label;
    chip.append(label, badge);
    return { chip, label };
  }
  const firstOfferIsCardOnly = mainOffers.length > 0 && CARD_ONLY_PROVIDERS.has(mainOffers[0]!.provider);
  for (const [cardIdx, card] of FREE_CARDS.entries()) {
    const { chip, label } = createBonusChip(card);
    if (cardIdx === 0 && !firstOfferIsCardOnly) chip.classList.add("bonus-chip--best");
    bonusChipLabels.push({ element: label, pct: card.pct * 100, ...(card.minPct != null ? { minPct: card.minPct * 100 } : {}), ...(card.maxPct != null ? { maxPct: card.maxPct * 100 } : {}), ...(card.ebPer100kr !== undefined ? { ebPer100kr: card.ebPer100kr } : {}), approx: card.approx, defaultText: label.textContent ?? "" });
    freeItems.append(chip);
    addChipTooltip(chip, card.tip, shadowRoot);
  }
  bonusChips.append(freeGroup);
  // --- Premium chips group (right) ---
  const premiumGroup = document.createElement("div");
  premiumGroup.className = "chip-group";
  const premiumLabel = document.createElement("span");
  premiumLabel.className = "chip-group-label";
  premiumLabel.textContent = "Premium";
  const premiumItems = document.createElement("div");
  premiumItems.className = "chip-group-items";
  premiumGroup.append(premiumLabel, premiumItems);
  const currentHostname = window.location.hostname.replace(/^www\./, "").toLowerCase();
  const revolutSub = REVOLUT_SUBSCRIPTIONS[currentHostname];
  if (revolutSub !== undefined) {
    const revolutChip = document.createElement("a");
    revolutChip.className = "bonus-chip";
    revolutChip.href = "https://revolut.com/referrals?r=FELPJK";
    revolutChip.target = "_blank";
    revolutChip.rel = "noreferrer";
    const revolutLabel = document.createElement("span");
    revolutLabel.className = "bonus-chip-label";
    revolutLabel.textContent = "Inkludert";
    const revolutBadge = document.createElement("span");
    revolutBadge.className = "provider-badge provider-revolut";
    revolutBadge.textContent = "Revolut";
    revolutChip.append(revolutLabel, revolutBadge);
    premiumItems.append(revolutChip);
    addChipTooltip(revolutChip, `${revolutSub}\nInkludert i Premium (95 kr/mnd), Metal (170 kr/mnd) eller Ultra (700 kr/mnd)`, shadowRoot);
  }
  for (const card of PREMIUM_CARDS) {
    if (card.label === "Curve") continue;
    if (card.label === "Crypto" && cryptoSub !== undefined) continue;
    const { chip, label } = createBonusChip(card);
    if (card.label === "Crypto") {
      const badge = chip.querySelector(".provider-badge")!;
      const wrapper = document.createElement("span");
      wrapper.style.cssText = "display:inline-flex;align-items:center;gap:4px;";
      badge.replaceWith(wrapper);
      wrapper.append(makeAdChip(), badge);
    }
    bonusChipLabels.push({ element: label, pct: card.pct * 100, ...(card.minPct != null ? { minPct: card.minPct * 100 } : {}), ...(card.maxPct != null ? { maxPct: card.maxPct * 100 } : {}), approx: card.approx, defaultText: label.textContent ?? "" });
    premiumItems.append(chip);
    addChipTooltip(chip, card.tip, shadowRoot);
  }
  bonusChips.append(premiumGroup);
  // --- Selected retailers group ---
  const selectedGroup = document.createElement("div");
  selectedGroup.className = "chip-group";
  const selectedLabel = document.createElement("span");
  selectedLabel.className = "chip-group-label";
  selectedLabel.textContent = "Premium for enkelte butikker";
  const selectedItems = document.createElement("div");
  selectedItems.className = "chip-group-items";
  selectedGroup.append(selectedLabel, selectedItems);
  let hasSelectedItems = false;
  if (curveOffer !== undefined) {
    const curveCard = PREMIUM_CARDS.find((c) => c.label === "Curve")!;
    const { chip, label } = createBonusChip(curveCard, curveOffer.activationUrl);
    const badge = chip.querySelector(".provider-badge")!;
    const wrapper = document.createElement("span");
    wrapper.style.cssText = "display:inline-flex;align-items:center;gap:4px;";
    badge.replaceWith(wrapper);
    wrapper.append(makeAdChip(), badge);
    bonusChipLabels.push({ element: label, pct: curveCard.pct * 100, approx: curveCard.approx, defaultText: label.textContent ?? "" });
    addChipTooltip(chip, curveCard.tip, shadowRoot);
    selectedItems.append(chip);
    hasSelectedItems = true;
  }
  if (cryptoSub !== undefined) {
    const cryptoChip = document.createElement("a");
    cryptoChip.className = "bonus-chip";
    cryptoChip.href = "https://crypto.com/app/ns3fma5hou";
    cryptoChip.target = "_blank";
    cryptoChip.rel = "noreferrer";
    const cryptoChipLabel = document.createElement("span");
    cryptoChipLabel.className = "bonus-chip-label";
    cryptoChipLabel.textContent = "3-6 mnd gratis";
    const cryptoBadge = document.createElement("span");
    cryptoBadge.className = "provider-badge provider-crypto";
    cryptoBadge.textContent = "Crypto";
    cryptoChip.append(cryptoChipLabel, cryptoBadge);
    const cryptoAdWrapper = document.createElement("span");
    cryptoAdWrapper.style.cssText = "display:inline-flex;align-items:center;gap:4px;";
    cryptoBadge.replaceWith(cryptoAdWrapper);
    cryptoAdWrapper.append(makeAdChip(), cryptoBadge);
    addChipTooltip(cryptoChip, `Crypto.com Visa-kort.\nJade/Obsidian: 6 mnd gratis ${cryptoSub}\nPlatin: 3 mnd gratis ${cryptoSub}`, shadowRoot);
    selectedItems.append(cryptoChip);
    hasSelectedItems = true;
  }
  if (hasSelectedItems) bonusChips.append(selectedGroup);
  // Collapsible chips section
  const chipsSection = document.createElement("div");
  chipsSection.className = "bonus-chips-section";
  if (initialChipsCollapsed) {
    chipsSection.classList.add("collapsed");
  }
  const chipsToggle = document.createElement("button");
  chipsToggle.className = "bonus-chips-toggle";
  chipsToggle.type = "button";
  const chipsToggleArrow = document.createElement("span");
  chipsToggleArrow.className = "bonus-chips-toggle-arrow";
  chipsToggleArrow.textContent = "\u25BC";
  const chipsToggleText = document.createElement("span");
  chipsToggleText.textContent = "Ekstra cashback";
  chipsToggle.append(chipsToggleArrow, chipsToggleText);
  chipsToggle.addEventListener("click", () => {
    const isCollapsed = chipsSection.classList.toggle("collapsed");
    chrome.storage.local.set({ [CHIPS_COLLAPSED_KEY]: isCollapsed });
  });
  chipsSection.append(chipsToggle, bonusChips);
  // --- Rabattkoder section ---
  const codesSection = document.createElement("div");
  codesSection.className = "codes-section";
  if (initialCodesCollapsed && codeOffers.length > 0) {
    codesSection.classList.add("collapsed");
  }

  // Header row: "▼ Rabattkoder (N)" + "+" button
  const codesToggle = document.createElement("button");
  codesToggle.className = "codes-toggle";
  codesToggle.type = "button";
  const codesToggleArrow = document.createElement("span");
  codesToggleArrow.className = "codes-toggle-arrow";
  codesToggleArrow.textContent = "\u25BC";
  const codesToggleText = document.createElement("span");
  codesToggleText.textContent = "Rabattkoder";
  const addCodeBtn = document.createElement("button");
  addCodeBtn.className = "add-code-btn";
  addCodeBtn.type = "button";
  addCodeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  const addCodeTooltip = document.createElement("div");
  addCodeTooltip.className = "copy-code-tooltip";
  addCodeTooltip.textContent = "Legg til rabattkode";
  shadowRoot.append(addCodeTooltip);
  addCodeBtn.addEventListener("mouseenter", () => {
    const rect = addCodeBtn.getBoundingClientRect();
    addCodeTooltip.style.left = `${rect.left + rect.width / 2}px`;
    addCodeTooltip.style.top = `${rect.top - 30}px`;
    addCodeTooltip.style.transform = "translateX(-50%)";
    shadowRoot.append(addCodeTooltip); // re-append to ensure paint order on top
    addCodeTooltip.classList.add("visible");
  });
  addCodeBtn.addEventListener("mouseleave", () => { addCodeTooltip.classList.remove("visible"); });
  codesToggle.append(codesToggleArrow, codesToggleText, addCodeBtn);
  codesToggle.addEventListener("click", (e) => {
    if (addCodeBtn.contains(e.target as Node)) return;
    const isCollapsed = codesSection.classList.toggle("collapsed");
    chrome.storage.local.set({ [CODES_COLLAPSED_KEY]: isCollapsed });
    if (!isCollapsed) loadDbCodes();
  });

  const codesList = document.createElement("div");
  codesList.className = "codes-list";

  // Inline add-code form (hidden by default, appears at top of list)
  const addCodeForm = document.createElement("div");
  addCodeForm.className = "add-code-form";
  addCodeForm.style.display = "none";
  const addRewardInput = document.createElement("input");
  addRewardInput.className = "add-code-input add-reward-input";
  addRewardInput.type = "number";
  addRewardInput.placeholder = "%";
  addRewardInput.min = "0";
  addRewardInput.max = "100";
  const addCodeInput = document.createElement("input");
  addCodeInput.className = "add-code-input";
  addCodeInput.type = "text";
  addCodeInput.placeholder = "Kode";
  addCodeInput.maxLength = 30;
  const addCodeSubmit = document.createElement("button");
  addCodeSubmit.className = "add-code-submit";
  addCodeSubmit.type = "button";
  addCodeSubmit.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  addCodeSubmit.disabled = true;
  const addCodeCancel = document.createElement("button");
  addCodeCancel.className = "add-code-cancel";
  addCodeCancel.type = "button";
  addCodeCancel.textContent = "\u2715";
  const addCodeFormInner = document.createElement("div");
  addCodeFormInner.className = "add-code-form-inner";
  addCodeFormInner.append(addRewardInput, addCodeInput, addCodeSubmit, addCodeCancel);
  addCodeForm.append(addCodeFormInner);
  const updateSubmitState = (): void => {
    addCodeSubmit.disabled = addCodeInput.value.trim().length === 0 || addRewardInput.value.trim().length === 0;
  };
  addCodeInput.addEventListener("input", updateSubmitState);
  addRewardInput.addEventListener("input", () => {
    // Strip anything that isn't a digit or decimal separator
    addRewardInput.value = addRewardInput.value.replace(/[^0-9]/g, "").replace(/^0+(\d)/, "$1");
    const v = Number(addRewardInput.value);
    if (addRewardInput.value !== "" && v > 100) addRewardInput.value = "100";
    updateSubmitState();
  });
  const closeAddForm = (): void => {
    addCodeForm.style.display = "none";
    addCodeInput.value = "";
    addRewardInput.value = "";
    addCodeSubmit.disabled = true;
  };
  const parseRewardNum = (r: string): number => parseFloat(r.replace(",", ".")) || 0;
  const createCodeValueGroup = (code: string): { group: HTMLSpanElement; codeSpan: HTMLSpanElement; copyBtn: HTMLSpanElement } => {
    const group = document.createElement("span");
    group.className = "code-copy-group";
    const codeSpan = document.createElement("span");
    codeSpan.className = "code-value";
    codeSpan.textContent = code;
    const copyBtn = document.createElement("span");
    copyBtn.className = "copy-code-btn";
    copyBtn.innerHTML = COPY_ICON_SVG;
    const copyTooltip = document.createElement("div");
    copyTooltip.className = "copy-code-tooltip";
    copyTooltip.textContent = `Kopier rabattkode: ${code}`;
    shadowRoot.append(copyTooltip);
    copyBtn.addEventListener("mouseenter", () => {
      const rect = copyBtn.getBoundingClientRect();
      copyTooltip.style.left = `${rect.left + rect.width / 2}px`;
      copyTooltip.style.top = `${rect.top - 30}px`;
      copyTooltip.style.transform = "translateX(-50%)";
      shadowRoot.append(copyTooltip);
      copyTooltip.classList.add("visible");
    });
    copyBtn.addEventListener("mouseleave", () => { copyTooltip.classList.remove("visible"); });
    copyBtn.addEventListener("click", () => {
      void navigator.clipboard.writeText(code).then(() => {
        copyBtn.innerHTML = CHECK_ICON_SVG;
        copyTooltip.textContent = "Kopiert!";
        copyTooltip.classList.add("visible");
        setTimeout(() => {
          copyBtn.innerHTML = COPY_ICON_SVG;
          copyTooltip.textContent = `Kopier rabattkode: ${code}`;
          copyTooltip.classList.remove("visible");
        }, 1500);
      });
    });
    group.append(codeSpan, copyBtn);
    return { group, codeSpan, copyBtn };
  };
  const resortCodesList = (): void => {
    const rows = [...codesList.querySelectorAll<HTMLElement>(".code-item-row")];
    rows.sort((a, b) => {
      const pa = parseFloat(a.querySelector<HTMLElement>(".code-reward")?.dataset.pct ?? "0") || 0;
      const pb = parseFloat(b.querySelector<HTMLElement>(".code-reward")?.dataset.pct ?? "0") || 0;
      return pb - pa;
    });
    for (const row of rows) {
      row.classList.remove("code-item-row--best");
      codesList.append(row);
    }
    if (rows[0]) rows[0].classList.add("code-item-row--best");
    codesList.prepend(addCodeForm);
  };
  const submitCode = (): void => {
    const code = addCodeInput.value.trim().toUpperCase();
    const rawReward = addRewardInput.value.trim();
    const reward = rawReward.length > 0 ? `${rawReward} %` : "?";
    if (code.length === 0) return;
    const hasProfanity = (text: string): boolean =>
      text.toLowerCase().split(/[^a-z0-9æøå]+/).some((w) => w.length > 0 && PROFANITY_SET.has(w));
    if (hasProfanity(code) || hasProfanity(rawReward)) {
      addCodeInput.style.borderColor = "#e05555";
      setTimeout(() => { addCodeInput.style.borderColor = ""; }, 1500);
      return;
    }
    console.info(`[cashback-varsler] User submitted code for ${CURRENT_HOST}: ${code} (${reward})`);
    closeAddForm();

    void apiSubmitCode(CURRENT_HOST, code, reward).then((result) => {
      if (!result.ok) {
        row1.remove();
        let msg = "Noe gikk galt, prøv igjen.";
        if (result.duplicate === true) msg = "Koden er allerede lagt til.";
        if (result.rate_limited === true) msg = "Du har nådd grensen på 5 handlinger per dag.";
        const warn = document.createElement("div");
        warn.textContent = msg;
        warn.style.cssText = "font-size:11px;color:#e05555;padding:4px 8px;";
        // Insert before the first visible code row, or at top of codesList
        const firstRow = codesList.querySelector<HTMLElement>(".code-item-row");
        if (firstRow) {
          firstRow.insertAdjacentElement("beforebegin", warn);
        } else {
          codesList.append(warn);
        }
        setTimeout(() => warn.remove(), 2500);
        return;
      }
      if (result.id) {
        item.dataset.codeId = String(result.id);
        // Show delete button inside chip, left of downvote
        const deleteBtn = makeDeleteBtn(result.id, row1);
        item.insertBefore(deleteBtn, down1);
      }
    });

    // Add immediately to the list (after addCodeForm, i.e. at the top)
    const item = document.createElement("div");
    item.className = "code-item";
    item.dataset.codeId = "pending";
    const rewardEl = document.createElement("span");
    rewardEl.className = "code-reward";
    if (/%/.test(reward)) {
      rewardEl.dataset.pct = String(parseRewardNum(reward));
      rewardEl.dataset.origReward = reward;
    }
    rewardEl.textContent = reward;
    const { group: codeGroup } = createCodeValueGroup(code);
    const { upBtn: up1, downBtn: down1 } = attachVoteButtons(item);
    item.append(rewardEl, codeGroup, down1, up1);
    const row1 = document.createElement("div");
    row1.className = "code-item-row";
    row1.dataset.net = "0";
    row1.append(item);
    addCodeForm.insertAdjacentElement("afterend", row1);
    resortCodesList();
    // count no longer shown
  };
  addRewardInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAddForm();
    if (e.key === "Enter") { e.preventDefault(); addCodeInput.focus(); }
  });
  addCodeInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAddForm();
    if (e.key === "Enter" && addCodeInput.value.trim().length > 0 && addRewardInput.value.trim().length > 0) submitCode();
  });
  addCodeCancel.addEventListener("click", closeAddForm);
  addCodeSubmit.addEventListener("click", submitCode);
  addCodeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    codesSection.classList.remove("collapsed");
    addCodeForm.style.display = "";
    addRewardInput.focus();
  });
  codesList.append(addCodeForm);

  const expiredSection = document.createElement("div");
  expiredSection.className = "expired-section collapsed";
  expiredSection.style.display = "none";
  const expiredToggle = document.createElement("button");
  expiredToggle.className = "expired-toggle";
  expiredToggle.type = "button";
  const expiredToggleArrow = document.createElement("span");
  expiredToggleArrow.className = "expired-toggle-arrow";
  expiredToggleArrow.textContent = "\u25BC";
  const expiredToggleText = document.createElement("span");
  expiredToggleText.textContent = "Utgåtte koder";
  expiredToggle.append(expiredToggleArrow, expiredToggleText);
  expiredToggle.addEventListener("click", () => { expiredSection.classList.toggle("collapsed"); });
  const expiredList = document.createElement("div");
  expiredList.className = "expired-list";
  expiredSection.append(expiredToggle, expiredList);

  const makeDeleteBtn = (codeId: number, row: HTMLElement): HTMLButtonElement => {
    const btn = document.createElement("button");
    btn.className = "delete-code-btn";
    btn.type = "button";
    btn.title = "Slett koden din";
    btn.innerHTML = `×`;
    btn.addEventListener("click", () => {
      void apiDeleteCode(codeId).then((ok) => {
        if (ok) {
          row.remove();
          resortCodesList();
        }
      });
    });
    return btn;
  };

  const THUMBS_UP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`;
  const THUMBS_DOWN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>`;

  const attachVoteButtons = (item: HTMLElement, staticCode?: { code: string; reward: string; hostname: string }, initialVote: 1 | -1 | 0 = 0): { upBtn: HTMLButtonElement; downBtn: HTMLButtonElement } => {
    let upvotes = 0;
    let downvotes = 0;
    let upvoted = initialVote === 1;
    let downvoted = initialVote === -1;
    const upBtn = document.createElement("button");
    upBtn.className = "vote-btn";
    upBtn.type = "button";
    upBtn.innerHTML = THUMBS_UP_SVG;
    const upCountEl = document.createElement("span");
    upCountEl.className = "vote-count";
    upBtn.append(upCountEl);
    const upTooltip = document.createElement("div");
    upTooltip.className = "copy-code-tooltip";
    upTooltip.textContent = "Koden fungerer!";
    shadowRoot.append(upTooltip);
    upBtn.addEventListener("mouseenter", () => {
      const rect = upBtn.getBoundingClientRect();
      upTooltip.style.left = `${rect.left + rect.width / 2}px`;
      upTooltip.style.top = `${rect.top - 30}px`;
      upTooltip.style.transform = "translateX(-50%)";
      upTooltip.classList.add("visible");
    });
    upBtn.addEventListener("mouseleave", () => { upTooltip.classList.remove("visible"); });
    const downBtn = document.createElement("button");
    downBtn.className = "vote-btn";
    downBtn.type = "button";
    downBtn.innerHTML = THUMBS_DOWN_SVG;
    const downCountEl = document.createElement("span");
    downCountEl.className = "vote-count";
    downBtn.append(downCountEl);
    const downTooltip = document.createElement("div");
    downTooltip.className = "copy-code-tooltip";
    downTooltip.textContent = "Koden er utgått";
    shadowRoot.append(downTooltip);
    downBtn.addEventListener("mouseenter", () => {
      const rect = downBtn.getBoundingClientRect();
      downTooltip.style.left = `${rect.left + rect.width / 2}px`;
      downTooltip.style.top = `${rect.top - 30}px`;
      downTooltip.style.transform = "translateX(-50%)";
      downTooltip.classList.add("visible");
    });
    downBtn.addEventListener("mouseleave", () => { downTooltip.classList.remove("visible"); });
    const syncExpired = (): void => {
      const net = upvotes - downvotes;
      upCountEl.textContent = net > 0 ? String(net) : "";
      downCountEl.textContent = net < 0 ? String(Math.abs(net)) : "";
      const container = item.closest(".code-item-row") ?? item;
      (container as HTMLElement).dataset.net = String(net);
      if (net < 0 && container.parentElement === codesList) {
        expiredList.append(container);
        item.classList.add("expired");
        expiredSection.style.display = "";
        resortCodesList();
      } else if (net >= 0 && container.parentElement === expiredList) {
        codesList.append(container);
        item.classList.remove("expired");
        if (expiredList.children.length === 0) expiredSection.style.display = "none";
        resortCodesList();
      } else {
        resortCodesList();
      }
    };
    upBtn.addEventListener("click", () => {
      userHasVoted = true;
      const codeId = Number(item.dataset.codeId);
      if (upvoted) {
        upvotes--; upvoted = false; upBtn.classList.remove("voted");
      } else {
        if (downvoted) { downvotes--; downvoted = false; downBtn.classList.remove("downvoted"); }
        upvotes++; upvoted = true; upBtn.classList.add("voted");
      }
      syncExpired();
      void apiVote(codeId, 1, staticCode).then((res) => {
        if (res !== null && "rate_limited" in res) {
          if (upvoted) { upvotes--; upvoted = false; upBtn.classList.remove("voted"); }
          else { upvotes++; upvoted = true; upBtn.classList.add("voted"); }
          syncExpired();
          showRateLimitFlash(upBtn);
        } else if (res !== null) {
          if ("registered_id" in res && res.registered_id !== undefined) item.dataset.codeId = String(res.registered_id);
          if (res.deleted) { delete item.dataset.codeId; }
          upvotes = res.upvotes; downvotes = res.downvotes;
          upvoted = !res.toggled_off && upvoted;
          if (res.toggled_off) upBtn.classList.remove("voted");
          syncExpired();
        }
      });
    });
    downBtn.addEventListener("click", () => {
      userHasVoted = true;
      const codeId = Number(item.dataset.codeId);
      if (downvoted) {
        downvotes--; downvoted = false; downBtn.classList.remove("downvoted");
      } else {
        if (upvoted) { upvotes--; upvoted = false; upBtn.classList.remove("voted"); }
        downvotes++; downvoted = true; downBtn.classList.add("downvoted");
      }
      syncExpired();
      void apiVote(codeId, -1, staticCode).then((res) => {
        if (res !== null && "rate_limited" in res) {
          if (downvoted) { downvotes--; downvoted = false; downBtn.classList.remove("downvoted"); }
          else { downvotes++; downvoted = true; downBtn.classList.add("downvoted"); }
          syncExpired();
          showRateLimitFlash(downBtn);
        } else if (res !== null) {
          if ("registered_id" in res && res.registered_id !== undefined) item.dataset.codeId = String(res.registered_id);
          if (res.deleted) { delete item.dataset.codeId; }
          upvotes = res.upvotes; downvotes = res.downvotes;
          downvoted = !res.toggled_off && downvoted;
          if (res.toggled_off) downBtn.classList.remove("downvoted");
          syncExpired();
        }
      });
    });
    return { upBtn, downBtn };
  };

  // Helper to build a row for a crawler offer
  const buildCrawlerRow = (
    codeOffer: typeof codeOffers[number],
    dbId?: number,
    initUpvotes = 0,
    initDownvotes = 0,
    initialVote: 1 | -1 | 0 = 0,
  ): HTMLDivElement => {
    const code = codeOffer.discountCode ?? "";
    const item = document.createElement("div");
    item.className = "code-item";
    if (dbId !== undefined) item.dataset.codeId = String(dbId);
    const reward = document.createElement("span");
    reward.className = "code-reward";
    const isNumericReward = /^\d[\d,.\ \-–]*\s*(?:%|kr)/i.test(codeOffer.reward.trim());
    if (/%/.test(codeOffer.reward)) {
      reward.dataset.pct = String(parseRewardNum(codeOffer.reward));
      reward.dataset.origReward = codeOffer.reward;
    }
    reward.textContent = isNumericReward ? codeOffer.reward : "?";
    const { group: codeGroup } = createCodeValueGroup(code);
    const { upBtn, downBtn } = attachVoteButtons(
      item,
      { code, reward: codeOffer.reward, hostname: CURRENT_HOST },
      initialVote,
    );
    const upCountEl = upBtn.querySelector<HTMLSpanElement>(".vote-count");
    const downCountEl = downBtn.querySelector<HTMLSpanElement>(".vote-count");
    if (upCountEl && initUpvotes > 0) upCountEl.textContent = String(initUpvotes);
    if (downCountEl && initDownvotes > 0) downCountEl.textContent = String(initDownvotes);
    if (initialVote === 1) upBtn.classList.add("voted");
    else if (initialVote === -1) downBtn.classList.add("downvoted");
    const sourceChip = createCodeSourceChip(codeOffer);
    if (sourceChip !== undefined) {
      item.append(reward, codeGroup, downBtn, upBtn, sourceChip);
    } else {
      item.append(reward, codeGroup, downBtn, upBtn);
    }
    const row = document.createElement("div");
    row.className = "code-item-row";
    row.append(item);

    // Terms tooltip for provider codes (e.g. DNB)
    if (codeOffer.terms) {
      const termsTooltip = document.createElement("div");
      termsTooltip.className = "offer-tooltip";
      setTooltipContent(termsTooltip, [codeOffer.terms]);
      shadowRoot.append(termsTooltip);
      row.addEventListener("mouseenter", () => {
        const panelEl = shadowRoot.querySelector(".panel");
        const panelRect = panelEl?.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        termsTooltip.style.left = "-9999px";
        termsTooltip.style.top = "-9999px";
        termsTooltip.classList.add("visible");
        const tooltipHeight = termsTooltip.offsetHeight;
        const rightEdge = panelRect ? panelRect.right + 6 : rowRect.right + 6;
        termsTooltip.style.left = `${rightEdge}px`;
        termsTooltip.style.top = `${rowRect.top + rowRect.height / 2 - tooltipHeight / 2}px`;
      });
      row.addEventListener("mouseleave", () => { termsTooltip.classList.remove("visible"); });
    }

    return row;
  };

  const createCodeSourceChip = (codeOffer: CashbackOffer): HTMLAnchorElement | undefined => {
    const sourceProvider = getCodeSourceProvider(codeOffer);
    if (sourceProvider === undefined) return undefined;

    const sourceUrl = codeOffer.sourceUrl || codeOffer.activationUrl;
    const chip = document.createElement("a");
    chip.className = `provider-badge provider-${sourceProvider} code-source-badge`;
    chip.href = sourceUrl;
    chip.target = "_blank";
    chip.rel = "noreferrer";
    chip.title = `Åpne ${formatProviderName(sourceProvider)}-tilbudet`;
    chip.textContent = formatProviderName(sourceProvider);
    return chip;
  };

  codesSection.append(codesToggle, codesList, expiredSection);
  const priceMatchSection = document.createElement("div");
  priceMatchSection.className = "price-match-section";
  if (priceMatch !== undefined) {
    if (initialPriceMatchCollapsed) {
      priceMatchSection.classList.add("collapsed");
    }

    const priceMatchToggle = document.createElement("button");
    priceMatchToggle.className = "price-match-toggle";
    priceMatchToggle.type = "button";
    const priceMatchToggleArrow = document.createElement("span");
    priceMatchToggleArrow.className = "price-match-toggle-arrow";
    priceMatchToggleArrow.textContent = "\u25BC";
    const priceMatchToggleText = document.createElement("span");
    priceMatchToggleText.textContent = "Prismatch";
    priceMatchToggle.append(priceMatchToggleArrow, priceMatchToggleText);
    priceMatchToggle.addEventListener("click", () => {
      const isCollapsed = priceMatchSection.classList.toggle("collapsed");
      chrome.storage.local.set({ [PRICE_MATCH_COLLAPSED_KEY]: isCollapsed });
    });

    const priceMatchCard = document.createElement("a");
    priceMatchCard.className = "price-match-card";
    priceMatchCard.href = priceMatch.productUrl;
    priceMatchCard.target = "_blank";
    priceMatchCard.rel = "noreferrer";
    const priceMatchTitle = document.createElement("span");
    priceMatchTitle.className = "price-match-title";
    const priceMatchProduct = document.createElement("span");
    priceMatchProduct.className = "price-match-product";
    priceMatchProduct.textContent = priceMatch.productName;
    const priceMatchShop = document.createElement("span");
    priceMatchShop.className = "price-match-shop";
    priceMatchShop.textContent = priceMatch.shopName;
    priceMatchTitle.append(priceMatchProduct, priceMatchShop);
    const priceMatchPrice = document.createElement("span");
    priceMatchPrice.className = "price-match-price";
    priceMatchPrice.textContent = priceMatch.price;
    const priceMatchBadge = document.createElement("span");
    priceMatchBadge.className = "provider-badge provider-prisjakt";
    priceMatchBadge.textContent = "Prisjakt";
    priceMatchCard.append(priceMatchTitle, priceMatchPrice, priceMatchBadge);
    priceMatchSection.append(priceMatchToggle, priceMatchCard);
  }

  body.append(header, offerList);
  if (priceMatch !== undefined) body.append(priceMatchSection);
  if (offers.length > 0) body.append(chipsSection, codesSection);

  let userHasVoted = false;

  // Render crawler codes immediately (sorted by reward) so list isn't empty while DB loads
  [...codeOffers]
    .sort((a, b) => parseRewardNum(b.reward) - parseRewardNum(a.reward))
    .forEach((codeOffer, i) => {
      const row = buildCrawlerRow(codeOffer);
      if (i === 0) row.classList.add("code-item-row--best");
      codesList.append(row);
    });

  let dbLoaded = false;
  const loadDbCodes = (): void => {
    if (dbLoaded) return;
    dbLoaded = true;
    // Load community-submitted codes from Supabase, then merge + sort all
    void Promise.all([fetchCodesForHost(CURRENT_HOST), fetchOwnedCodesForHost(CURRENT_HOST), fetchMyVotes(CURRENT_HOST)]).then(([dbCodes, serverOwnedIds, myVotes]) => {
    const ownedIds = new Set(serverOwnedIds);
    // Don't wipe DOM if user has already voted — avoids race condition
    if (userHasVoted) {
      // Just append any DB codes not already shown
      const shownCodes = new Set(
        [...codesList.querySelectorAll<HTMLElement>(".code-value"), ...expiredList.querySelectorAll<HTMLElement>(".code-value")]
          .map((el) => el.textContent?.toUpperCase() ?? "")
      );
      for (const dbCode of dbCodes) {
        if (shownCodes.has(dbCode.code.toUpperCase())) continue;
        const item = document.createElement("div");
        item.className = "code-item";
        item.dataset.codeId = String(dbCode.id);
        const reward = document.createElement("span");
        reward.className = "code-reward";
        if (/%/.test(dbCode.reward)) {
          reward.dataset.pct = String(parseRewardNum(dbCode.reward));
          reward.dataset.origReward = dbCode.reward;
        }
        reward.textContent = dbCode.reward;
        const { group: codeGroup } = createCodeValueGroup(dbCode.code);
        const { upBtn, downBtn } = attachVoteButtons(item);
        const upCountEl = upBtn.querySelector<HTMLSpanElement>(".vote-count");
        const downCountEl = downBtn.querySelector<HTMLSpanElement>(".vote-count");
        const initNet1 = dbCode.upvotes - dbCode.downvotes;
        if (upCountEl) upCountEl.textContent = initNet1 > 0 ? String(initNet1) : "";
        if (downCountEl) downCountEl.textContent = initNet1 < 0 ? String(Math.abs(initNet1)) : "";
        item.append(reward, codeGroup, downBtn, upBtn);
        const row = document.createElement("div");
        row.className = "code-item-row";
        row.append(item);
        if (initNet1 < 0) {
          item.classList.add("expired");
          expiredList.append(row);
          expiredSection.style.display = "";
        } else {
          codesList.append(row);
        }
      }
      return;
    }
    // Map crawler codes by normalised code string for dedup/merge
    const crawlerByCode = new Map(
      codeOffers.map((o) => [( o.discountCode ?? "").toUpperCase(), o])
    );

    // Build unified entry list
    const parseReward = (r: string): number => parseFloat(r.replace(",", ".")) || 0;
    type Entry = { net: number; reward: string; render: () => HTMLDivElement };
    const entries: Entry[] = [];

    // DB codes (user-submitted + previously voted static)
    for (const dbCode of dbCodes) {
      const net = dbCode.upvotes - dbCode.downvotes;
      const matchingCrawlerOffer = crawlerByCode.get(dbCode.code.toUpperCase());
      // Remove crawler placeholder immediately so the remaining-crawler loop doesn't duplicate it
      crawlerByCode.delete(dbCode.code.toUpperCase());

      if (matchingCrawlerOffer !== undefined) {
        const myVote = myVotes[dbCode.id] ?? 0;
        entries.push({
          net,
          reward: matchingCrawlerOffer.reward,
          render: () => buildCrawlerRow(
            matchingCrawlerOffer,
            dbCode.id,
            dbCode.upvotes,
            dbCode.downvotes,
            myVote,
          ),
        });
        continue;
      }

      entries.push({ net, reward: dbCode.reward, render: () => {
        const item = document.createElement("div");
        item.className = "code-item";
        item.dataset.codeId = String(dbCode.id);
        const reward = document.createElement("span");
        reward.className = "code-reward";
        if (/%/.test(dbCode.reward)) {
          reward.dataset.pct = String(parseRewardNum(dbCode.reward));
          reward.dataset.origReward = dbCode.reward;
        }
        reward.textContent = dbCode.reward;
        const { group: codeGroup } = createCodeValueGroup(dbCode.code);
        const myVote = myVotes[dbCode.id] ?? 0;
        const { upBtn, downBtn } = attachVoteButtons(item, undefined, myVote);
        const upCountEl = upBtn.querySelector<HTMLSpanElement>(".vote-count");
        const downCountEl = downBtn.querySelector<HTMLSpanElement>(".vote-count");
        const initNet2 = dbCode.upvotes - dbCode.downvotes;
        if (upCountEl) upCountEl.textContent = initNet2 > 0 ? String(initNet2) : "";
        if (downCountEl) downCountEl.textContent = initNet2 < 0 ? String(Math.abs(initNet2)) : "";
        if (myVote === 1) upBtn.classList.add("voted");
        else if (myVote === -1) downBtn.classList.add("downvoted");
        item.append(reward, codeGroup, downBtn, upBtn);
        const row = document.createElement("div");
        row.className = "code-item-row";
        row.dataset.net = String(dbCode.upvotes - dbCode.downvotes);
        if (ownedIds.has(dbCode.id)) {
          const deleteBtn = makeDeleteBtn(dbCode.id, row);
          item.insertBefore(deleteBtn, downBtn);
        }
        row.append(item);
        return row;
      }});
    }

    // Remaining crawler codes not in DB (net = 0)
    for (const [, codeOffer] of crawlerByCode) {
      entries.push({ net: 0, reward: codeOffer.reward, render: () => buildCrawlerRow(codeOffer) });
    }

    // Sort by numeric reward descending (% only — kr amounts are not comparable)
    const rewardPct = (r: string): number => /%/.test(r) ? (parseFloat(r.replace(",", ".")) || 0) : 0;
    entries.sort((a, b) => rewardPct(b.reward) - rewardPct(a.reward));

    // Clear placeholder crawler rows and re-render sorted
    codesList.removeChild(addCodeForm);
    codesList.innerHTML = "";
    expiredList.innerHTML = "";
    expiredSection.style.display = "none";
    codesList.append(addCodeForm);

    let totalCount = 0;
    for (const entry of entries) {
      const row = entry.render();
      const item = row.querySelector<HTMLElement>(".code-item")!;
      if (entry.net < 0) {
        item.classList.add("expired");
        expiredList.append(row);
        expiredSection.style.display = "";
      } else {
        codesList.append(row);
      }
      totalCount++;
    }

    // Mark best code green
    const firstRow = codesList.querySelector<HTMLElement>(".code-item-row");
    if (firstRow) firstRow.classList.add("code-item-row--best");

    const crawlerOnlyCount = crawlerByCode.size; // already deleted matched ones above — but we need total
    const total = dbCodes.length + crawlerByCode.size; // remaining crawler + db
    if (total > 0 || codeOffers.length > 0) {
    // count no longer shown
    }
  });
  };

  // If section is already expanded on load, fetch immediately
  if (!codesSection.classList.contains("collapsed")) {
    loadDbCodes();
  }

  const pick = SUPPORT_LINKS[Math.floor(Math.random() * SUPPORT_LINKS.length)];
  if (pick !== undefined) {
    const support = document.createElement("div");
    support.className = "support";
    const supportLink = document.createElement("a");
    supportLink.href = pick.url;
    supportLink.target = "_blank";
    supportLink.rel = "noreferrer";
    supportLink.textContent = pick.text;
    const logoLink = document.createElement("a");
    logoLink.href = "https://cashbacknorge.no";
    logoLink.target = "_blank";
    logoLink.rel = "noreferrer";
    logoLink.title = "cashbacknorge.no";
    const logoImg = document.createElement("img");
    logoImg.src = CBN_LOGO_B64;
    logoImg.className = "support-logo";
    logoImg.alt = "CBN";
    logoLink.append(logoImg);
    if (pick.affiliate) support.prepend(makeAdChip());
    else supportLink.style.cssText = "flex:1;text-align:center;";
    support.append(supportLink, logoLink);
    const disclosure = document.createElement("p");
    disclosure.textContent = "Lenker merket Ad er affiliatelenker. ♥ støtter utvikleren direkte.";
    disclosure.style.cssText = "color:#b0bec5;font-size:10px;margin:0;padding:2px 14px 6px;";
    panel.append(topLine, body, support, disclosure);
  } else {
    panel.append(topLine, body);
  }
  notice.append(sideTab, panel);
  // Force reflow after expand transition to fix Safari whitespace bug
  panel.addEventListener("transitionend", (e) => {
    if (e.propertyName === "width" && !notice.classList.contains("collapsed")) {
      void panel.offsetHeight; // trigger reflow
    }
  });
  // Apply initial collapsed state before inserting into DOM (no transition flash)
  if (initialCollapsed) {
    notice.classList.add("collapsed", "no-transition");
    sideTabArrow.textContent = "\u203A";
    sideTab.setAttribute("aria-label", "Expand cashback offers");
  }
  shadowRoot.append(style, notice);
  const mountTarget = document.body ?? document.documentElement;
  mountTarget.append(host);
  void detectConflicts(shadowRoot, title);
  // Attach tooltips to shadow root (outside panel) so they escape overflow:hidden
  const wrappers = shadowRoot.querySelectorAll(".offer-link-wrapper");
  for (let idx = 0; idx < mainOffers.length; idx++) {
    const currentOffer = mainOffers[idx];
    if (currentOffer === undefined) continue;
    const compact = formatCompactRewardLabel(currentOffer);
    const fullReward = formatRewardLabel(currentOffer.reward, currentOffer.provider);
    const showRewardInTooltip = compact !== undefined && fullReward !== compact;
    const isCardOnlyOffer = CARD_ONLY_PROVIDERS.has(currentOffer.provider);
    const isAppOnlyOffer = APP_ONLY_PROVIDERS.has(currentOffer.provider);
    const hasTerms = currentOffer.terms.trim().length > 0;
    if (currentOffer.provider !== "cbn" && !showRewardInTooltip && !hasTerms && !isCardOnlyOffer && !isAppOnlyOffer) continue;
    const wrapper = wrappers[idx];
    if (wrapper === undefined) continue;
    const tooltip = document.createElement("div");
    tooltip.className = "offer-tooltip";
    const tooltipParts: string[] = [];
    if (currentOffer.terms) tooltipParts.push(currentOffer.terms);
    if (isCardOnlyOffer) tooltipParts.push("⚠ Betales med kort – kan ikke kombineres med ekstra cashback fra andre kort");
    if (isAppOnlyOffer) tooltipParts.push("Krever " + formatProviderName(currentOffer.provider) + "-appen for å aktivere cashback");
    setTooltipContent(tooltip, tooltipParts);
    shadowRoot.append(tooltip);
    tooltipElements.push({ element: tooltip, offer: currentOffer });
    wrapper.addEventListener("mouseenter", () => {
      const panelEl = shadowRoot.querySelector(".panel");
      const panelRect = panelEl?.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      // Show off-screen to measure, then position to right of panel
      tooltip.style.left = "-9999px";
      tooltip.style.top = "-9999px";
      tooltip.classList.add("visible");
      const tooltipHeight = tooltip.offsetHeight;
      const tooltipWidth = tooltip.offsetWidth;
      const rightEdge = panelRect ? panelRect.right + 6 : wrapperRect.right + 6;
      const preferredLeft = rightEdge;
      const fallbackLeft = wrapperRect.left + wrapperRect.width / 2 - tooltipWidth / 2;
      const left = preferredLeft + tooltipWidth > window.innerWidth - 8
        ? Math.max(8, Math.min(fallbackLeft, window.innerWidth - tooltipWidth - 8))
        : preferredLeft;
      const top = Math.max(
        8,
        Math.min(wrapperRect.top + wrapperRect.height / 2 - tooltipHeight / 2, window.innerHeight - tooltipHeight - 8),
      );
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    });
    wrapper.addEventListener("mouseleave", () => {
      tooltip.classList.remove("visible");
    });
  }
  // Re-enable transitions after layout settles (double rAF ensures reflow is done)
  if (initialCollapsed) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      notice.classList.remove("no-transition");
    }));
  }

  // Swipe-left on panel to collapse
  let panelSwipeStartX = 0;
  let panelSwipeStartY = 0;
  panel.addEventListener("touchstart", (e) => {
    panelSwipeStartX = e.touches[0]?.clientX ?? 0;
    panelSwipeStartY = e.touches[0]?.clientY ?? 0;
  }, { passive: true });
  panel.addEventListener("touchend", (e) => {
    const dx = (e.changedTouches[0]?.clientX ?? 0) - panelSwipeStartX;
    const dy = (e.changedTouches[0]?.clientY ?? 0) - panelSwipeStartY;
    if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      setCollapsed(notice, sideTab, sideTabArrow, true);
    }
  }, { passive: true });
}
function clearNotice(): void {
  document.getElementById(HOST_ID)?.remove();
}

function setTooltipContent(tooltip: HTMLElement, parts: string[]): void {
  const sections = parts
    .flatMap((part) => part.split(/\n{2,}/))
    .map(createTooltipSection)
    .filter((section): section is HTMLDivElement => section !== undefined);
  tooltip.replaceChildren(...sections);
}

function createTooltipSection(part: string): HTMLDivElement | undefined {
  const lines = part
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return undefined;

  const section = document.createElement("div");
  section.className = "offer-tooltip-section";

  if (lines.length === 1) {
    const isRateLine = /^\d[\d.,]* (%|kr)/.test(lines[0] ?? "");
    if (isRateLine) {
      const list = document.createElement("ul");
      list.className = "offer-tooltip-list";
      const item = document.createElement("li");
      item.textContent = lines[0] ?? "";
      list.append(item);
      section.append(list);
    } else {
      const text = document.createElement("span");
      text.className = "offer-tooltip-text";
      text.textContent = lines[0] ?? "";
      section.append(text);
    }
    return section;
  }

  const firstLine = lines[0] ?? "";
  const listLines = /^(medlemsfordel|medlemstilbud)$/i.test(firstLine) ? lines.slice(1) : lines;

  if (listLines.length !== lines.length) {
    const title = document.createElement("span");
    title.className = "offer-tooltip-title";
    title.textContent = firstLine;
    section.append(title);
  }

  const list = document.createElement("ul");
  list.className = "offer-tooltip-list";
  for (const line of listLines) {
    const item = document.createElement("li");
    item.textContent = line.replace(/^-\s+/, "");
    list.append(item);
  }
  section.append(list);
  return section;
}

function applyHostOverlayStyle(host: HTMLElement): void {
  host.style.setProperty("background", "transparent", "important");
  host.style.setProperty("border", "0", "important");
  host.style.setProperty("bottom", "16px", "important");
  host.style.setProperty("display", "block", "important");
  host.style.setProperty("height", "0", "important");
  host.style.setProperty("inset", "auto auto 16px 0", "important");
  host.style.setProperty("left", "0", "important");
  host.style.setProperty("margin", "0", "important");
  host.style.setProperty("overflow", "visible", "important");
  host.style.setProperty("padding", "0", "important");
  host.style.setProperty("position", "fixed", "important");
  host.style.setProperty("width", "0", "important");
  host.style.setProperty("z-index", "2147483647", "important");
}
function createSiteIcon(): HTMLImageElement {
  const siteIcon = document.createElement("img");
  siteIcon.className = "site-icon";
  siteIcon.alt = "";
  siteIcon.src = findSiteIconUrl();
  siteIcon.addEventListener("error", () => {
    siteIcon.style.visibility = "hidden";
  });
  return siteIcon;
}
function setCollapsed(
  notice: HTMLElement,
  sideTab: HTMLButtonElement,
  sideTabArrow: HTMLElement,
  collapsed: boolean,
): void {
  notice.classList.toggle("collapsed", collapsed);
  sideTabArrow.textContent = collapsed ? "\u203A" : "\u2039"; // › or ‹
  sideTab.setAttribute(
    "aria-label",
    collapsed ? "Expand cashback offers" : "Collapse cashback offers",
  );
  chrome.storage.local.set({ [COLLAPSED_STORAGE_KEY]: collapsed });
}
function isCashbackFoundMessage(value: unknown): value is CashbackFoundMessage {
  return (
    isRecord(value) &&
    value.type === "cashback-found" &&
    Array.isArray(value.offers) &&
    value.offers.every(isCashbackOffer)
  );
}
function isCashbackNoneMessage(value: unknown): value is CashbackNoneMessage {
  return isRecord(value) && value.type === "cashback-none";
}
function isOffersForUrlResponse(value: unknown): value is OffersForUrlResponse {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return false;
  }
  if (value.ok) {
    return Array.isArray(value.offers) && value.offers.every(isCashbackOffer);
  }
  return typeof value.reason === "string";
}
function isPriceMatchForProductResponse(value: unknown): value is PriceMatchForProductResponse {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return false;
  }
  if (value.ok) {
    return value.offer === undefined || isPriceMatchOffer(value.offer);
  }
  return typeof value.reason === "string";
}
function isPriceMatchOffer(value: unknown): value is PriceMatchOffer {
  return (
    isRecord(value) &&
    typeof value.shopName === "string" &&
    typeof value.price === "string" &&
    typeof value.amount === "number" &&
    typeof value.currency === "string" &&
    typeof value.productName === "string" &&
    typeof value.productUrl === "string" &&
    (value.offerUrl === undefined || typeof value.offerUrl === "string")
  );
}
function isCashbackIndex(value: unknown): value is CashbackIndex {
  if (
    !isRecord(value) ||
    typeof value.version !== "number" ||
    typeof value.generatedAt !== "string" ||
    !Array.isArray(value.offers) ||
    !isRecord(value.domainIndex)
  ) {
    return false;
  }
  return (
    value.offers.every(isCashbackOffer) &&
    Object.values(value.domainIndex).every((offers) => {
      return Array.isArray(offers) && offers.every(isCashbackOffer);
    })
  );
}
function isCashbackOffer(value: unknown): value is CashbackOffer {
  return (
    isRecord(value) &&
    typeof value.provider === "string" &&
    typeof value.merchantName === "string" &&
    Array.isArray(value.domains) &&
    value.domains.every(isString) &&
    typeof value.reward === "string" &&
    typeof value.sourceUrl === "string" &&
    typeof value.activationUrl === "string" &&
    typeof value.terms === "string" &&
    (value.discountCode === undefined || typeof value.discountCode === "string") &&
    typeof value.updatedAt === "string"
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isString(value: unknown): value is string {
  return typeof value === "string";
}
function findOffersForHostname(
  cashbackIndex: CashbackIndex,
  hostname: string,
): CashbackOffer[] {
  const normalizedHostname = normalizeHostname(hostname);
  const canonical = DOMAIN_ALIASES[normalizedHostname] ?? normalizedHostname;
  // Also check parent domain when on a CC subdomain: visiting no.jbl.com should find jbl.com
  const ccParentDomains = CC_SUBDOMAINS.flatMap((cc) =>
    normalizedHostname.startsWith(`${cc}.`) ? [normalizedHostname.slice(cc.length + 1)] : []
  );
  const lookupDomains = [
    normalizedHostname,
    ...(canonical !== normalizedHostname ? [canonical] : []),
    ...getAlternateTldDomains(normalizedHostname),
    ...CC_SUBDOMAINS.map((cc) => `${cc}.${normalizedHostname}`),
    ...ccParentDomains,
  ];
  const indexMatches = lookupDomains.flatMap((domain) => {
    return cashbackIndex.domainIndex[domain] ?? [];
  });
  // Only use suffix/child matches if there are no exact matches for the current hostname.
  // This prevents e.g. apple.com offers on music.apple.com (suffixMatches)
  // and music.apple.com offers on apple.com (childDomainMatches).
  const hasExactMatches = (cashbackIndex.domainIndex[normalizedHostname] ?? []).length > 0;
  const suffixMatches = hasExactMatches ? [] : cashbackIndex.offers.filter((offer) => {
    return offer.domains.some((domain) => {
      const normalizedDomain = normalizeDomainInput(domain);
      return (
        normalizedDomain !== normalizedHostname &&
        normalizedHostname.endsWith(`.${normalizedDomain}`)
      );
    });
  });
  const childDomainMatches = hasExactMatches ? [] : cashbackIndex.offers.filter((offer) => {
    return offer.domains.some((domain) => {
      const normalizedDomain = normalizeDomainInput(domain);
      return lookupDomains.some((lookupDomain) => {
        return (
          normalizedDomain !== lookupDomain &&
          normalizedDomain.endsWith(`.${lookupDomain}`)
        );
      });
    });
  });
  return sortOffersByReward(
    uniqueOffers([...indexMatches, ...suffixMatches, ...childDomainMatches]),
  );
}
function normalizeHostname(hostname: string): string {
  const lowerCaseHostname = hostname.trim().toLowerCase();
  const withoutTrailingDot = lowerCaseHostname.endsWith(".")
    ? lowerCaseHostname.slice(0, -1)
    : lowerCaseHostname;
  return withoutTrailingDot.startsWith("www.")
    ? withoutTrailingDot.slice(4)
    : withoutTrailingDot;
}
function normalizeDomainInput(input: string): string {
  const trimmedInput = input.trim();
  const urlLikeInput = trimmedInput.includes("://")
    ? trimmedInput
    : `https://${trimmedInput}`;
  const parsedUrl = parseUrl(urlLikeInput);
  if (parsedUrl !== undefined) {
    return normalizeHostname(parsedUrl.hostname);
  }
  const firstSlashIndex = trimmedInput.indexOf("/");
  const hostPart =
    firstSlashIndex === -1 ? trimmedInput : trimmedInput.slice(0, firstSlashIndex);
  return normalizeHostname(hostPart);
}
const DOMAIN_ALIASES: Record<string, string> = {
  "jbl.com": "no.jbl.com",
};
const COMMON_TLDS = [".com", ".no", ".se", ".dk", ".fi", ".eu"];
const CC_SUBDOMAINS = ["no", "se", "dk", "fi", "de", "fr", "es", "it", "nl", "uk", "us", "eu"];
function getAlternateTldDomains(domain: string): string[] {
  const parts = domain.split(".");
  if (parts.length !== 2) return [];
  const tld = `.${parts[1]}`;
  if (!COMMON_TLDS.includes(tld)) return [];
  const baseName = parts[0];
  return COMMON_TLDS
    .filter((commonTld) => commonTld !== tld)
    .map((commonTld) => `${baseName}${commonTld}`);
}
function parseUrl(input: string): URL | undefined {
  try {
    return new URL(input);
  } catch {
    return undefined;
  }
}
function uniqueOffers(offers: CashbackOffer[]): CashbackOffer[] {
  const byKey = new Map<string, CashbackOffer>();
  for (const offer of offers) {
    const codeSuffix = offer.discountCode !== undefined ? `:${offer.discountCode}` : "";
    const key = `${offer.provider}:${offer.merchantName.toLowerCase()}${codeSuffix}`;
    const existing = byKey.get(key);
    const newVal = parseRewardValue(offer.reward);
    const existingVal = existing !== undefined ? parseRewardValue(existing.reward) : null;
    const isRange = offer.reward.includes("-");
    const isBetterReward = existingVal === null ||
      rewardKindRank(newVal.kind) > rewardKindRank(existingVal.kind) ||
      (newVal.kind === existingVal.kind && newVal.amount > existingVal.amount);
    if (existing === undefined || isBetterReward || (newVal.amount === existingVal!.amount && isRange && !existing.reward.includes("-"))) {
      byKey.set(key, offer);
    }
  }
  return [...byKey.values()];
}
function sortOffersByReward(offers: CashbackOffer[]): CashbackOffer[] {
  return [...offers].sort((firstOffer, secondOffer) => {
    const firstIsSupport = firstOffer.provider === "cbn";
    const secondIsSupport = secondOffer.provider === "cbn";

    if (firstIsSupport !== secondIsSupport) {
      return firstIsSupport ? 1 : -1;
    }

    const firstReward = parseRewardValue(firstOffer.reward);
    const secondReward = parseRewardValue(secondOffer.reward);
    const rewardKindSort =
      rewardKindRank(secondReward.kind) - rewardKindRank(firstReward.kind);
    if (rewardKindSort !== 0) return rewardKindSort;
    const rewardAmountSort = secondReward.amount - firstReward.amount;
    if (rewardAmountSort !== 0) return rewardAmountSort;
    const merchantSort = firstOffer.merchantName.localeCompare(secondOffer.merchantName);
    if (merchantSort !== 0) return merchantSort;
    return firstOffer.provider.localeCompare(secondOffer.provider);
  });
}
type RewardValue = {
  kind: "percentage" | "fixed" | "unit" | "points" | "unknown";
  amount: number;
};
function parseRewardValue(reward: string): RewardValue {
  const rangeMatch = reward.match(/\d+(?:[,.]\d+)?\s*-\s*(\d+(?:[,.]\d+)?)\s*%/);
  const percentageMatch = rangeMatch
    ? [null, rangeMatch[1]]
    : reward.match(/(\d+(?:[,.]\d+)?)\s*%/);
  if (percentageMatch !== null) {
    return {
      kind: "percentage",
      amount: parseLocalizedNumber(percentageMatch[1] ?? "0"),
    };
  }
  const pointsRateMatch = reward.match(/(\d[\d\s]*)\s*poeng\s+per\s+100\s*kr/i);
  if (pointsRateMatch !== null) {
    return {
      kind: "percentage",
      amount: parseLocalizedNumber((pointsRateMatch[1] ?? "0").replace(/\s/g, "")) / EB_PER_TRUMF_KR,
    };
  }
  const unitMatch = reward.match(/(\d+(?:[,.]\d+)?)\s*kr\s*\//i);
  if (unitMatch !== null) {
    return {
      kind: "unit",
      amount: parseLocalizedNumber(unitMatch[1] ?? "0"),
    };
  }
  const krRangeMatch = reward.match(/\d[\d\s]*(?:[,.]\d+)?\s*-\s*(\d[\d\s]*(?:[,.]\d+)?)\s*kr/i);
  if (krRangeMatch !== null) {
    return {
      kind: "fixed",
      amount: parseLocalizedNumber((krRangeMatch[1] ?? "0").replace(/\s/g, "")),
    };
  }
  const fixedMatch = reward.match(/(\d[\d\s]*(?:[,.]\d+)?)\s*kr/i);
  if (fixedMatch !== null) {
    return {
      kind: "fixed",
      amount: parseLocalizedNumber((fixedMatch[1] ?? "0").replace(/\s/g, "")),
    };
  }
  const pointsMatch = reward.match(/(\d[\d\s]*)\s*poeng/i);
  if (pointsMatch !== null) {
    return {
      kind: "points",
      amount: parseLocalizedNumber((pointsMatch[1] ?? "0").replace(/\s/g, "")),
    };
  }
  return {
    kind: "unknown",
    amount: 0,
  };
}
function parseLocalizedNumber(value: string): number {
  const parsedValue = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}
function rewardKindRank(kind: RewardValue["kind"]): number {
  if (kind === "percentage") return 4;
  if (kind === "fixed") return 3;
  if (kind === "unit") return 2;
  if (kind === "points") return 1;
  return 0;
}
function formatProviderName(provider: CashbackOffer["provider"]): string {
  return PROVIDER_NAMES[provider] ?? provider;
}
function findSiteIconUrl(): string {
  const iconSelectors = [
    'link[rel~="icon"][href]',
    'link[rel="shortcut icon"][href]',
    'link[rel="apple-touch-icon"][href]',
  ];
  for (const selector of iconSelectors) {
    const iconElement = document.querySelector(selector);
    if (!(iconElement instanceof HTMLLinkElement)) {
      continue;
    }
    const parsedUrl = parseUrlWithBase(iconElement.href, window.location.href);
    if (parsedUrl !== undefined) {
      return parsedUrl.toString();
    }
  }
  return new URL("/favicon.ico", window.location.origin).toString();
}
function parseUrlWithBase(href: string, baseUrl: string): URL | undefined {
  try {
    return new URL(href, baseUrl);
  } catch {
    return undefined;
  }
}
const WARNING_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
const COPY_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CHECK_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
function hasRateBreakdown(terms: string): boolean {
  return terms.includes("\n") && /\d+.*%/.test(terms);
}
async function detectAdblock(): Promise<boolean> {
  const [urlBlocked, domBlocked] = await Promise.all([
    detectAdblockByUrl(),
    detectAdblockByDom(),
  ]);
  return urlBlocked || domBlocked;
}

async function detectAdblockByUrl(): Promise<boolean> {
  if (document.querySelector('meta[http-equiv="Content-Security-Policy"]') !== null) {
    return false;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    await fetch("https://widgets.outbrain.com/outbrain.js", { mode: "no-cors", signal: controller.signal });
    clearTimeout(timeoutId);
    return false;
  } catch {
    return true;
  }
}

async function detectAdblockByDom(): Promise<boolean> {
  try {
    const container = document.createElement("div");
    container.style.cssText = "position:absolute;left:-9999px;top:-9999px;";
    for (const id of ["AdHeader", "AdContainer", "AD_Top", "homead", "ad-lead"]) {
      const el = document.createElement("div");
      el.id = id;
      el.style.cssText = "display:block;width:1px;height:1px;";
      container.appendChild(el);
    }
    (document.body ?? document.documentElement).appendChild(container);
    await new Promise<void>((r) => setTimeout(r, 100));
    let blockedCount = 0;
    for (const id of ["AdHeader", "AdContainer", "AD_Top", "homead", "ad-lead"]) {
      const el = container.querySelector(`#${id}`) as HTMLElement | null;
      if (!el || el.offsetHeight === 0) blockedCount++;
    }
    container.remove();
    return blockedCount >= 1;
  } catch {
    return false;
  }
}
async function detectConflicts(shadowRoot: ShadowRoot, titleEl: HTMLElement): Promise<void> {
  if (!await detectAdblock()) return;
  const warningIcon = document.createElement("span");
  warningIcon.className = "conflict-warning";
  warningIcon.innerHTML = WARNING_ICON_SVG;
  const conflictTooltip = document.createElement("div");
  conflictTooltip.className = "status-tooltip";
  conflictTooltip.textContent = "Adblock er aktivert – kan blokkere cashback-sporing";
  shadowRoot.append(conflictTooltip);
  warningIcon.addEventListener("mouseenter", () => {
    positionStatusTooltipAbovePanel(conflictTooltip, warningIcon, shadowRoot);
    shadowRoot.append(conflictTooltip);
    conflictTooltip.classList.add("visible");
  });
  warningIcon.addEventListener("mouseleave", () => {
    conflictTooltip.classList.remove("visible");
  });
  titleEl.appendChild(warningIcon);
}

function positionStatusTooltipAbovePanel(
  tooltip: HTMLElement,
  anchor: HTMLElement,
  shadowRoot: ShadowRoot,
): void {
  const panel = shadowRoot.querySelector<HTMLElement>(".panel");
  const anchorRect = anchor.getBoundingClientRect();
  const panelRect = panel?.getBoundingClientRect();

  tooltip.style.left = "-9999px";
  tooltip.style.top = "-9999px";
  tooltip.style.transform = "none";
  tooltip.classList.add("visible");

  const tooltipWidth = tooltip.offsetWidth;
  const tooltipHeight = tooltip.offsetHeight;
  const preferredLeft = panelRect !== undefined ? panelRect.left : anchorRect.left;
  const left = Math.max(8, Math.min(preferredLeft, window.innerWidth - tooltipWidth - 8));
  const preferredTop = panelRect !== undefined ? panelRect.top - tooltipHeight - 8 : anchorRect.top - tooltipHeight - 8;
  const fallbackTop = panelRect !== undefined ? panelRect.top + 8 : anchorRect.bottom + 8;
  const top = preferredTop >= 8
    ? preferredTop
    : Math.min(fallbackTop, window.innerHeight - tooltipHeight - 8);

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${Math.max(8, top)}px`;
}
function formatOfferTitlePrefix(offer: CashbackOffer): string {
  if (offer.provider === "obos" || offer.provider === "bob" || offer.provider === "usbl") {
    return formatCompactRewardLabel(offer) ?? formatRewardLabel(offer.reward, offer.provider);
  }
  return "Cashback";
}
function formatSideTabText(
  cashbackOffer: CashbackOffer | undefined,
  primaryOffer: CashbackOffer,
): string {
  if (cashbackOffer !== undefined) {
    const reward = formatCompactRewardLabel(cashbackOffer) ?? formatRewardLabel(cashbackOffer.reward, cashbackOffer.provider);
    return `${reward} ${formatProviderName(cashbackOffer.provider)}`;
  }
  return formatCompactRewardLabel(primaryOffer) ?? "Rabattkode";
}
function addChipTooltip(chip: HTMLElement, text: string, shadowRoot: ShadowRoot): void {
  const tooltip = document.createElement("div");
  tooltip.className = "bonus-chip-tooltip";
  tooltip.textContent = text;
  shadowRoot.append(tooltip);
  chip.addEventListener("mouseenter", () => {
    const panelEl = shadowRoot.querySelector(".panel");
    const panelRect = panelEl?.getBoundingClientRect();
    const rect = chip.getBoundingClientRect();
    tooltip.style.left = "-9999px";
    tooltip.style.top = "-9999px";
    tooltip.classList.add("visible");
    const tooltipHeight = tooltip.offsetHeight;
    const rightEdge = panelRect ? panelRect.right + 6 : rect.right + 6;
    tooltip.style.left = `${rightEdge}px`;
    tooltip.style.top = `${rect.top + rect.height / 2 - tooltipHeight / 2}px`;
    tooltip.style.transform = "none";
  });
  chip.addEventListener("mouseleave", () => {
    tooltip.classList.remove("visible");
  });
}
