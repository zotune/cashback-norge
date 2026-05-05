import { EB_PER_TRUMF_KR, FREE_CARDS, PREMIUM_CARDS, PROVIDER_NAMES, REVOLUT_SUBSCRIPTIONS, SUPPORT_LINKS } from "../shared/provider-data";
import noWords from "naughty-words/no.json";
import enWords from "naughty-words/en.json";

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
type OffersForUrlResponse =
  | {
      ok: true;
      offers: CashbackOffer[];
    }
  | {
      ok: false;
      reason: string;
    };
const HOST_ID = "cashback-varsler-notice";
const COLLAPSED_STORAGE_KEY = "cashback-varsler-collapsed";
const CHIPS_COLLAPSED_KEY = "cashback-varsler-chips-collapsed";
const CODES_COLLAPSED_KEY = "cashback-varsler-codes-collapsed";
const HIDDEN_HOSTS_KEY = "cashback-varsler-hidden-hosts";
const CURRENT_HOST = window.location.hostname.replace(/^www\./, "").toLowerCase();
chrome.runtime.onMessage.addListener((message) => {
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
function renderNoticeWithStoredState(offers: CashbackOffer[]): void {
  const isUserscript = (chrome.runtime as { id?: string }).id === undefined;
  chrome.storage.local.get([COLLAPSED_STORAGE_KEY, CHIPS_COLLAPSED_KEY, CODES_COLLAPSED_KEY, HIDDEN_HOSTS_KEY], (result: Record<string, unknown>) => {
    const hidden = Array.isArray(result[HIDDEN_HOSTS_KEY]) ? (result[HIDDEN_HOSTS_KEY] as string[]) : [];
    if (!isUserscript && hidden.includes(CURRENT_HOST)) return;
    const collapsed = result[COLLAPSED_STORAGE_KEY] === true;
    const chipsCollapsed = result[CHIPS_COLLAPSED_KEY] === true;
    const codesCollapsed = result[CODES_COLLAPSED_KEY] === true;
    renderNotice(offers, collapsed, chipsCollapsed, codesCollapsed);
  });
}
function requestCurrentOffers(): void {
  const message: GetOffersForUrlMessage = {
    type: "get-offers-for-url",
    url: window.location.href,
  };
  chrome.runtime.sendMessage(message, (response: unknown) => {
    if (chrome.runtime.lastError !== undefined) {
      void renderBundledOffersForCurrentUrl();
      return;
    }
    if (!isOffersForUrlResponse(response) || !response.ok) {
      void renderBundledOffersForCurrentUrl();
      return;
    }
    if (response.offers.length > 0) {
      renderNoticeWithStoredState(response.offers);
      return;
    }
    void renderBundledOffersForCurrentUrl();
  });
}
async function renderBundledOffersForCurrentUrl(): Promise<void> {
  const parsedUrl = parseUrl(window.location.href);
  if (
    parsedUrl === undefined ||
    (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")
  ) {
    clearNotice();
    return;
  }
  try {
    const response = await fetch(chrome.runtime.getURL("cashback-index.json"));
    const value: unknown = await response.json();
    if (!isCashbackIndex(value)) {
      clearNotice();
      return;
    }
    const offers = findOffersForHostname(value, parsedUrl.hostname);
    if (offers.length > 0) {
      renderNoticeWithStoredState(offers);
      return;
    }
  } catch {
    // Fall through to clearing the notice.
  }
  clearNotice();
}
function makeAdChip(): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.textContent = "Ad";
  chip.style.cssText = "display:inline-block;font-size:9px;font-weight:600;color:#78909c;border:1px solid #78909c;border-radius:3px;padding:0 3px;margin-right:6px;vertical-align:middle;line-height:14px;";
  return chip;
}

function renderNotice(offers: CashbackOffer[], initialCollapsed: boolean, initialChipsCollapsed: boolean, initialCodesCollapsed: boolean): void {
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
      border-radius: 6px;
      color: #172026;
      display: grid;
      gap: 8px;
      grid-template-columns: minmax(0, 1fr) auto auto;
      min-height: 32px;
      padding: 5px 9px;
      text-decoration: none;
    }
    .offer-link .provider-badge {
      grid-column: 3;
    }
    .offer-label {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      font-size: 13px;
      font-weight: 700;
      gap: 6px;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }
    .provider-badge {
      align-items: center;
      border-radius: 5px;
      display: inline-flex;
      font-size: 12px;
      font-weight: 800;
      line-height: 1;
      min-height: 22px;
      padding: 0 7px;
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
    .provider-naf {
      background: #FFD100;
      color: #000000;
    }
    .provider-sparebank1 {
      background: #005aa4;
      color: #ffffff;
    }
    .provider-cbn {
      background: #f7d7e6;
      color: #8f164f;
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
      border-radius: 6px;
      display: flex;
      flex: 1;
      font-size: 12px;
      gap: 6px;
      min-width: 0;
      padding: 5px 8px;
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
      flex: 1;
      font-family: monospace;
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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
    .conflict-tooltip {
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
    .conflict-tooltip.visible {
      display: block;
    }
  `;
  const mainOffers = offers.filter((o) => o.provider !== "curve" && o.provider !== "rabattkode" && o.provider !== "dnb" && o.provider !== "tfbank");
  const curveOffer = offers.find((o) => o.provider === "curve");
  const CARD_ONLY_PROVIDERS = new Set(["sparebank1", "remember", "tfbank"]);
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
  if (offer === undefined && codeOffers.length === 0) {
    return;
  }
  const primaryOffer = offer ?? codeOffers[0];
  if (primaryOffer === undefined) {
    return;
  }
  const notice = document.createElement("section");
  notice.className = "notice";
  // Side tab (collapse/expand control on the left edge)
  const sideTab = document.createElement("button");
  sideTab.className = `side-tab side-tab-${offer?.provider ?? "rabattkode"}`;
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
  } else {
    sideTabText.textContent = formatCompactRewardLabel(primaryOffer) ?? "Rabattkode";
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
    : `Rabattkode hos ${primaryOffer.merchantName}`;
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
    const providerBadge = document.createElement("span");
    providerBadge.className = `provider-badge provider-${currentOffer.provider}`;
    providerBadge.textContent = formatProviderName(currentOffer.provider);
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
      offerLink.append(offerLabel, copyBtn, providerBadge);
    } else if (CARD_ONLY_PROVIDERS.has(currentOffer.provider)) {
      const warnIcon = document.createElement("span");
      warnIcon.className = "card-only-warn";
      warnIcon.textContent = "⚠";
      offerLink.append(offerLabel, warnIcon, providerBadge);
    } else {
      offerLink.append(offerLabel, providerBadge);
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
  addCodeFormInner.append(addRewardInput, addCodeInput, addCodeSubmit);
  addCodeForm.append(addCodeFormInner, addCodeCancel);
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
    rewardEl.textContent = reward;
    const codeSpan = document.createElement("span");
    codeSpan.className = "code-value";
    codeSpan.textContent = code;
    const copyBtn = document.createElement("span");
    copyBtn.className = "copy-code-btn";
    copyBtn.innerHTML = COPY_ICON_SVG;
    const copyTooltip1 = document.createElement("div");
    copyTooltip1.className = "copy-code-tooltip";
    copyTooltip1.textContent = `Kopier rabattkode: ${code}`;
    shadowRoot.append(copyTooltip1);
    copyBtn.addEventListener("mouseenter", () => {
      const rect = copyBtn.getBoundingClientRect();
      copyTooltip1.style.left = `${rect.left + rect.width / 2}px`;
      copyTooltip1.style.top = `${rect.top - 30}px`;
      copyTooltip1.style.transform = "translateX(-50%)";
      copyTooltip1.classList.add("visible");
    });
    copyBtn.addEventListener("mouseleave", () => { copyTooltip1.classList.remove("visible"); });
    copyBtn.addEventListener("click", () => {
      void navigator.clipboard.writeText(code).then(() => {
        copyBtn.innerHTML = CHECK_ICON_SVG;
        copyTooltip1.textContent = "Kopiert!";
        copyTooltip1.classList.add("visible");
        setTimeout(() => {
          copyBtn.innerHTML = COPY_ICON_SVG;
          copyTooltip1.textContent = `Kopier rabattkode: ${code}`;
          copyTooltip1.classList.remove("visible");
        }, 1500);
      });
    });
    const { upBtn: up1, downBtn: down1 } = attachVoteButtons(item);
    item.append(rewardEl, codeSpan, down1, up1);
    const row1 = document.createElement("div");
    row1.className = "code-item-row";
    row1.dataset.net = "0";
    row1.append(item, copyBtn);
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
  const buildCrawlerRow = (codeOffer: typeof codeOffers[number], dbId?: number, initUpvotes = 0, initDownvotes = 0): HTMLDivElement => {
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
      shadowRoot.append(copyTooltip); // re-append to paint on top
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
    const { upBtn, downBtn } = attachVoteButtons(item, { code, reward: codeOffer.reward, hostname: CURRENT_HOST });
    const upCountEl = upBtn.querySelector<HTMLSpanElement>(".vote-count");
    const downCountEl = downBtn.querySelector<HTMLSpanElement>(".vote-count");
    if (upCountEl && initUpvotes > 0) upCountEl.textContent = String(initUpvotes);
    if (downCountEl && initDownvotes > 0) downCountEl.textContent = String(initDownvotes);
    item.append(reward, codeSpan, downBtn, upBtn);
    const row = document.createElement("div");
    row.className = "code-item-row";
    row.append(item, copyBtn);

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

  codesSection.append(codesToggle, codesList, expiredSection);
  body.append(header, offerList, chipsSection, codesSection);

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
        const codeSpan = document.createElement("span");
        codeSpan.className = "code-value";
        codeSpan.textContent = dbCode.code;
        const copyBtn = document.createElement("span");
        copyBtn.className = "copy-code-btn";
        copyBtn.innerHTML = COPY_ICON_SVG;
        const copyTooltipHv = document.createElement("div");
        copyTooltipHv.className = "copy-code-tooltip";
        copyTooltipHv.textContent = `Kopier rabattkode: ${dbCode.code}`;
        shadowRoot.append(copyTooltipHv);
        copyBtn.addEventListener("mouseenter", () => {
          const rect = copyBtn.getBoundingClientRect();
          copyTooltipHv.style.left = `${rect.left + rect.width / 2}px`;
          copyTooltipHv.style.top = `${rect.top - 30}px`;
          copyTooltipHv.style.transform = "translateX(-50%)";
          copyTooltipHv.classList.add("visible");
        });
        copyBtn.addEventListener("mouseleave", () => { copyTooltipHv.classList.remove("visible"); });
        copyBtn.addEventListener("click", () => {
          void navigator.clipboard.writeText(dbCode.code).then(() => {
            copyBtn.innerHTML = CHECK_ICON_SVG;
            copyTooltipHv.textContent = "Kopiert!";
            copyTooltipHv.classList.add("visible");
            setTimeout(() => {
              copyBtn.innerHTML = COPY_ICON_SVG;
              copyTooltipHv.textContent = `Kopier rabattkode: ${dbCode.code}`;
              copyTooltipHv.classList.remove("visible");
            }, 1500);
          });
        });
        const { upBtn, downBtn } = attachVoteButtons(item);
        const upCountEl = upBtn.querySelector<HTMLSpanElement>(".vote-count");
        const downCountEl = downBtn.querySelector<HTMLSpanElement>(".vote-count");
        const initNet1 = dbCode.upvotes - dbCode.downvotes;
        if (upCountEl) upCountEl.textContent = initNet1 > 0 ? String(initNet1) : "";
        if (downCountEl) downCountEl.textContent = initNet1 < 0 ? String(Math.abs(initNet1)) : "";
        item.append(reward, codeSpan, downBtn, upBtn);
        const row = document.createElement("div");
        row.className = "code-item-row";
        row.append(item, copyBtn);
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
      // Remove crawler placeholder immediately so the remaining-crawler loop doesn't duplicate it
      crawlerByCode.delete(dbCode.code.toUpperCase());
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
        const codeSpan = document.createElement("span");
        codeSpan.className = "code-value";
        codeSpan.textContent = dbCode.code;
        const copyBtn = document.createElement("span");
        copyBtn.className = "copy-code-btn";
        copyBtn.innerHTML = COPY_ICON_SVG;
        const copyTooltipDb = document.createElement("div");
        copyTooltipDb.className = "copy-code-tooltip";
        copyTooltipDb.textContent = `Kopier rabattkode: ${dbCode.code}`;
        shadowRoot.append(copyTooltipDb);
        copyBtn.addEventListener("mouseenter", () => {
          const rect = copyBtn.getBoundingClientRect();
          copyTooltipDb.style.left = `${rect.left + rect.width / 2}px`;
          copyTooltipDb.style.top = `${rect.top - 30}px`;
          copyTooltipDb.style.transform = "translateX(-50%)";
          copyTooltipDb.classList.add("visible");
        });
        copyBtn.addEventListener("mouseleave", () => { copyTooltipDb.classList.remove("visible"); });
        copyBtn.addEventListener("click", () => {
          void navigator.clipboard.writeText(dbCode.code).then(() => {
            copyBtn.innerHTML = CHECK_ICON_SVG;
            copyTooltipDb.textContent = "Kopiert!";
            copyTooltipDb.classList.add("visible");
            setTimeout(() => {
              copyBtn.innerHTML = COPY_ICON_SVG;
              copyTooltipDb.textContent = `Kopier rabattkode: ${dbCode.code}`;
              copyTooltipDb.classList.remove("visible");
            }, 1500);
          });
        });
        const myVote = myVotes[dbCode.id] ?? 0;
        const { upBtn, downBtn } = attachVoteButtons(item, undefined, myVote);
        const upCountEl = upBtn.querySelector<HTMLSpanElement>(".vote-count");
        const downCountEl = downBtn.querySelector<HTMLSpanElement>(".vote-count");
        const initNet2 = dbCode.upvotes - dbCode.downvotes;
        if (upCountEl) upCountEl.textContent = initNet2 > 0 ? String(initNet2) : "";
        if (downCountEl) downCountEl.textContent = initNet2 < 0 ? String(Math.abs(initNet2)) : "";
        if (myVote === 1) upBtn.classList.add("voted");
        else if (myVote === -1) downBtn.classList.add("downvoted");
        item.append(reward, codeSpan, downBtn, upBtn);
        const row = document.createElement("div");
        row.className = "code-item-row";
        row.dataset.net = String(dbCode.upvotes - dbCode.downvotes);
        if (ownedIds.has(dbCode.id)) {
          const deleteBtn = makeDeleteBtn(dbCode.id, row);
          item.insertBefore(deleteBtn, downBtn);
        }
        row.append(item, copyBtn);
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
    const hasTerms = currentOffer.terms.trim().length > 0;
    if (currentOffer.provider !== "cbn" && !showRewardInTooltip && !hasTerms && !isCardOnlyOffer) continue;
    const wrapper = wrappers[idx];
    if (wrapper === undefined) continue;
    const tooltip = document.createElement("div");
    tooltip.className = "offer-tooltip";
    const tooltipParts: string[] = [];
    if (currentOffer.terms) tooltipParts.push(currentOffer.terms);
    if (isCardOnlyOffer) tooltipParts.push("⚠ Betales med kort – kan ikke kombineres med ekstra cashback fra andre kort");
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
    const text = document.createElement("span");
    text.className = "offer-tooltip-text";
    text.textContent = lines[0] ?? "";
    section.append(text);
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
    item.textContent = line;
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
function calculateCashback(offer: CashbackOffer, amount: number): string {
  if (offer.provider === "cbn") {
    const pctMatch = offer.reward.match(/(\d+(?:[,.]\d+)?)\s*%/);
    if (pctMatch !== null) {
      const pct = Number.parseFloat(pctMatch[1]?.replace(",", ".") ?? "0");
      return `${formatKr(amount * pct / 100)} kr til gode formål`;
    }

    const fixedKrMatch = offer.reward.match(/(\d+(?:[,.]\d+)?)\s*kr/i);
    if (fixedKrMatch !== null) {
      const fixedKr = Number.parseFloat(fixedKrMatch[1]?.replace(",", ".") ?? "0");
      return `${formatKr(fixedKr)} kr til gode formål`;
    }

    return "";
  }

  const reward = offer.reward.trim();
  // Percentage range: "2-3,5 %"
  const rangeMatch = reward.match(/^([\d,]+)-([\d,]+)\s*%$/);
  if (rangeMatch !== null) {
    const minPct = Number.parseFloat(rangeMatch[1]!.replace(",", "."));
    const maxPct = Number.parseFloat(rangeMatch[2]!.replace(",", "."));
    const minKr = amount * minPct / 100;
    const maxKr = amount * maxPct / 100;
    const label = minKr === maxKr ? `${formatKr(minKr)} kr` : `${formatKr(minKr)}-${formatKr(maxKr)} kr`;
    return addEbSuffix(label, minPct, maxPct, amount, offer.provider);
  }
  // Single percentage: "6,2 %"
  const pctMatch = reward.match(/^([\d,]+)\s*%$/);
  if (pctMatch !== null) {
    const pct = Number.parseFloat(pctMatch[1]!.replace(",", "."));
    const kr = amount * pct / 100;
    return addEbSuffix(`${formatKr(kr)} kr`, pct, pct, amount, offer.provider);
  }
  // SAS rate: "15 poeng per 100 kr"
  const sasRateMatch = reward.match(/^([\d\s]+)\s*poeng\s+per\s+100\s*kr$/i);
  if (sasRateMatch !== null) {
    const points = Number.parseInt(sasRateMatch[1]!.replace(/\s/g, ""), 10);
    const eb = Math.round(amount * points / 100);
    const kr = amount * points / 100 / EB_PER_TRUMF_KR;
    return `~${formatKr(kr)} kr (~${eb} EB)`;
  }
  // SAS fixed: "500 poeng"
  const sasFixedMatch = reward.match(/^([\d\s]+)\s*poeng$/i);
  if (sasFixedMatch !== null) {
    const points = Number.parseInt(sasFixedMatch[1]!.replace(/\s/g, ""), 10);
    const kr = points / EB_PER_TRUMF_KR;
    return `~${formatKr(kr)} kr (~${points} EB)`;
  }
  // Klarna "5.5%"
  const klarnaMatch = reward.match(/^([\d.]+)%$/);
  if (klarnaMatch !== null) {
    const pct = Number.parseFloat(klarnaMatch[1]!);
    const kr = amount * pct / 100;
    return `${formatKr(kr)} kr`;
  }
  return "";
}
function addEbSuffix(label: string, minPct: number, maxPct: number, amount: number, provider: string): string {
  if (provider === "trumf") {
    const minEb = Math.round(amount * minPct / 100 * EB_PER_TRUMF_KR);
    const maxEb = Math.round(amount * maxPct / 100 * EB_PER_TRUMF_KR);
    const ebStr = minEb === maxEb ? `~${minEb} EB` : `~${minEb}-${maxEb} EB`;
    return `${label} (${ebStr})`;
  }
  if (provider === "sas") {
    const minEb = Math.round(amount * minPct / 100 * EB_PER_TRUMF_KR);
    const maxEb = Math.round(amount * maxPct / 100 * EB_PER_TRUMF_KR);
    const ebStr = minEb === maxEb ? `~${minEb} EB` : `~${minEb}-${maxEb} EB`;
    return `~${label} (${ebStr})`;
  }
  return label;
}
function getMaxRewardPercent(offer: CashbackOffer): number {
  if (offer.provider === "cbn") {
    return 0;
  }

  const reward = offer.reward.trim();
  const rangeMatch = reward.match(/^([\d,]+)-([\d,]+)\s*%$/);
  if (rangeMatch !== null) {
    return Number.parseFloat(rangeMatch[2]!.replace(",", "."));
  }
  const pctMatch = reward.match(/^([\d,]+)\s*%$/);
  if (pctMatch !== null) {
    return Number.parseFloat(pctMatch[1]!.replace(",", "."));
  }
  const sasRateMatch = reward.match(/^([\d\s]+)\s*poeng\s+per\s+100\s*kr$/i);
  if (sasRateMatch !== null) {
    const points = Number.parseInt(sasRateMatch[1]!.replace(/\s/g, ""), 10);
    return points / EB_PER_TRUMF_KR;
  }
  return 0;
}
function calculateCashbackMaxKr(offer: CashbackOffer, amount: number): number {
  if (offer.provider === "cbn") {
    return 0;
  }

  const reward = offer.reward.trim();
  const rangeMatch = reward.match(/^([\d,]+)-([\d,]+)\s*%$/);
  if (rangeMatch !== null) {
    const maxPct = Number.parseFloat(rangeMatch[2]!.replace(",", "."));
    return amount * maxPct / 100;
  }
  const pctMatch = reward.match(/^([\d,]+)\s*%$/);
  if (pctMatch !== null) {
    return amount * Number.parseFloat(pctMatch[1]!.replace(",", ".")) / 100;
  }
  const klarnaMatch = reward.match(/^([\d.]+)%$/);
  if (klarnaMatch !== null) {
    return amount * Number.parseFloat(klarnaMatch[1]!) / 100;
  }
  const sasRateMatch = reward.match(/^([\d\s]+)\s*poeng\s+per\s+100\s*kr$/i);
  if (sasRateMatch !== null) {
    const points = Number.parseInt(sasRateMatch[1]!.replace(/\s/g, ""), 10);
    return amount * points / 100 / EB_PER_TRUMF_KR;
  }
  return 0;
}
function formatBreakdownWithAmounts(terms: string, amount: number): string {
  return terms
    .split("\n")
    .map((line) => {
      const match = line.match(/^([\d,]+)\s*%/);
      if (match !== null) {
        const pct = Number.parseFloat(match[1]!.replace(",", "."));
        const kr = amount * pct / 100;
        return `${line} (${formatKr(kr)} kr)`;
      }
      return line;
    })
    .join("\n");
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
function formatKr(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toFixed(2).replace(".", ",");
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
  conflictTooltip.className = "conflict-tooltip";
  conflictTooltip.textContent = "Adblock er aktivert – kan blokkere cashback-sporing";
  shadowRoot.append(conflictTooltip);
  warningIcon.addEventListener("mouseenter", () => {
    conflictTooltip.style.left = "-9999px";
    conflictTooltip.style.top = "-9999px";
    conflictTooltip.classList.add("visible");
    const tooltipHeight = conflictTooltip.offsetHeight;
    const rect = warningIcon.getBoundingClientRect();
    conflictTooltip.style.left = `${rect.left + rect.width / 2}px`;
    conflictTooltip.style.top = `${rect.top - tooltipHeight - 6}px`;
    conflictTooltip.style.transform = "translateX(-50%)";
  });
  warningIcon.addEventListener("mouseleave", () => {
    conflictTooltip.classList.remove("visible");
  });
  titleEl.appendChild(warningIcon);
}
function formatRewardLabel(reward: string, provider: string): string {
  const trimmedReward = reward.trim();
  if (trimmedReward.length === 0) {
    if (provider === "obos") return "Medlemsfordel";
    return "?";
  }
  // For SAS, convert to percentage-first display with ~ prefix
  if (provider === "sas") {
    const converted = convertSasToPercent(trimmedReward);
    return converted !== "" ? converted : trimmedReward;
  }
  // For Trumf, show original reward + EB conversion
  if (provider === "trumf") {
    const converted = convertTrumfToEb(trimmedReward);
    return converted !== "" ? `${trimmedReward} (${converted})` : trimmedReward;
  }
  return trimmedReward;
}
function formatOfferTitlePrefix(offer: CashbackOffer): string {
  if (offer.provider === "obos") {
    return "Medlemsfordel";
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
function formatCompactRewardLabel(offer: CashbackOffer): string | undefined {
  const label = formatRewardLabel(offer.reward, offer.provider);
  if (/\d+(?:[,.]\d+)?\s*kr\s*\/\s*/i.test(label) && label.includes("+")) {
    return label.replace(/\s+/g, " ");
  }
  const percentMatch = label.match(/(~)?(\d+(?:[,.]\d+)?\s*[-–]\s*\d+(?:[,.]\d+)?\s*%|\d+(?:[,.]\d+)?\s*%)/i);
  if (percentMatch !== null) {
    const prefix = percentMatch[1] ?? "";
    return (prefix + percentMatch[2]!).replace(/\s+/g, " ");
  }
  const krRangeMatch = label.match(/\d[\d\s]*(?:[,.]\d+)?\s*[-–]\s*\d[\d\s]*(?:[,.]\d+)?\s*kr(?:\/time|\s+per\s+time)?/i);
  if (krRangeMatch !== null) {
    return krRangeMatch[0].replace(/\s+/g, " ");
  }
  const krMatch = label.match(/\d[\d\s]*(?:[,.]\d+)?\s*kr(?:\/time|\s+per\s+time)?/i);
  if (krMatch !== null) {
    return krMatch[0].replace(/\s+/g, " ");
  }
  if (/gratis\s+frakt/i.test(label)) {
    return "Gratis frakt";
  }
  if (/gratis/i.test(label)) {
    return "Gratis";
  }
  return label.length <= 14 ? label : undefined;
}
function convertSasToPercent(reward: string): string {
  const fixedMatch = reward.match(/^([\d\s]+)\s*poeng$/i);
  if (fixedMatch !== null) {
    const points = Number.parseInt(fixedMatch[1]!.replace(/\s/g, ""), 10);
    const kr = Math.round(points / EB_PER_TRUMF_KR);
    return `~${kr} kr (~${points.toLocaleString("nb-NO")} EB)`;
  }
  const rateMatch = reward.match(/^([\d\s]+)\s*poeng\s+per\s+100\s*kr$/i);
  if (rateMatch !== null) {
    const points = Number.parseInt(rateMatch[1]!.replace(/\s/g, ""), 10);
    const pct = points / EB_PER_TRUMF_KR;
    return `~${formatNo(pct)} % (~${points} EB/100kr)`;
  }
  return "";
}
function convertTrumfToEb(reward: string): string {
  // "1,1-1,5 %" → ~15-20 EB/100kr
  const rangeMatch = reward.match(/^([\d,]+)-([\d,]+)\s*%$/);
  if (rangeMatch !== null) {
    const minPct = Number.parseFloat(rangeMatch[1]!.replace(",", "."));
    const maxPct = Number.parseFloat(rangeMatch[2]!.replace(",", "."));
    const minEb = Math.round(minPct * EB_PER_TRUMF_KR);
    const maxEb = Math.round(maxPct * EB_PER_TRUMF_KR);
    return `~${minEb}-${maxEb} EB/100kr`;
  }
  // "3,1 %" → ~42 EB/100kr
  const pctMatch = reward.match(/^([\d,]+)\s*%$/);
  if (pctMatch !== null) {
    const pct = Number.parseFloat(pctMatch[1]!.replace(",", "."));
    const ebPer100 = Math.round(pct * EB_PER_TRUMF_KR);
    return `~${ebPer100} EB/100kr`;
  }
  // "295 kr" → ~3 983 EB
  const krMatch = reward.match(/^([\d\s]+)\s*kr$/);
  if (krMatch !== null) {
    const kr = Number.parseInt(krMatch[1]!.replace(/\s/g, ""), 10);
    const eb = Math.round(kr * EB_PER_TRUMF_KR);
    return `~${eb.toLocaleString("nb-NO")} EB`;
  }
  return "";
}
function formatNo(n: number): string {
  return n % 1 === 0 ? n.toString() : n.toFixed(1).replace(".", ",");
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
