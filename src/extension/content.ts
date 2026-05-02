import { EB_PER_TRUMF_KR, FREE_CARDS, PREMIUM_CARDS, PROVIDER_NAMES, REVOLUT_SUBSCRIPTIONS, SUPPORT_LINKS } from "../shared/provider-data";
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
chrome.runtime.onMessage.addListener((message) => {
  if (isCashbackFoundMessage(message)) {
    renderNoticeWithStoredState(message.offers);
    return;
  }
  if (isCashbackNoneMessage(message)) {
    clearNotice();
  }
});
requestCurrentOffers();
function renderNoticeWithStoredState(offers: CashbackOffer[]): void {
  chrome.storage.local.get([COLLAPSED_STORAGE_KEY, CHIPS_COLLAPSED_KEY, CODES_COLLAPSED_KEY], (result: Record<string, unknown>) => {
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
function renderNotice(offers: CashbackOffer[], initialCollapsed: boolean, initialChipsCollapsed: boolean, initialCodesCollapsed: boolean): void {
  clearNotice();
  const host = document.createElement("div");
  host.id = HOST_ID;
  const shadowRoot = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host {
      all: initial;
      bottom: 16px;
      left: 0;
      position: fixed;
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
    .notice.collapsed .side-tab.side-tab-remember .side-tab-text {
      background: #111111;
      color: #ff9900;
      padding: 4px 2px;
      border-radius: 4px;
    }
    .notice.collapsed .side-tab.side-tab-klarna .side-tab-text {
      background: #ffa8cd;
      color: #0b051d;
      padding: 4px 2px;
      border-radius: 4px;
    }
    .notice.collapsed .side-tab.side-tab-trumf .side-tab-text {
      background: #07006b;
      color: #ffffff;
      padding: 4px 2px;
      border-radius: 4px;
    }
    .notice.collapsed .side-tab.side-tab-sas .side-tab-text {
      background: #00005c;
      color: #ffffff;
      padding: 4px 2px;
      border-radius: 4px;
    }
    .notice.collapsed .side-tab.side-tab-curve .side-tab-text {
      background: #000000;
      color: #ffffff;
      padding: 4px 2px;
      border-radius: 4px;
    }
    .notice.collapsed .side-tab.side-tab-tfbank .side-tab-text {
      background: #e30613;
      color: #ffffff;
      padding: 4px 2px;
      border-radius: 4px;
    }
    .notice.collapsed .side-tab.side-tab-obos .side-tab-text {
      background: #003087;
      color: #ffffff;
      padding: 4px 2px;
      border-radius: 4px;
    }
    .notice.collapsed .side-tab.side-tab-naf .side-tab-text {
      background: #FFD100;
      color: #000000;
      padding: 4px 2px;
      border-radius: 4px;
    }
    .notice.collapsed .side-tab.side-tab-logbuy .side-tab-text {
      background: #d81939;
      color: #ffffff;
      padding: 4px 2px;
      border-radius: 4px;
    }
    .notice.collapsed .side-tab.side-tab-norskfamilie .side-tab-text {
      background: #ff6600;
      color: #ffffff;
      padding: 4px 2px;
      border-radius: 4px;
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
      color: #1f8f5f;
      letter-spacing: 0.02em;
      margin-top: 6px;
    }
    .notice.collapsed .side-tab {
      min-height: 80px;
      padding: 10px 5px;
    }
    .notice.collapsed .side-tab-arrow {
      display: none;
    }
    .notice.collapsed .side-tab-text {
      display: block;
    }
    .panel {
      width: min(400px, calc(100vw - 42px));
      color: #172026;
      background: #ffffff;
      border: 1px solid #c9d7cf;
      border-radius: 8px;
      box-shadow: 0 14px 38px rgba(11, 25, 34, 0.2);
      overflow: hidden;
      margin-left: 4px;
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
    .offer-link {
      align-items: center;
      background: #f7faf8;
      border: 1px solid #d8e3de;
      border-radius: 6px;
      color: #172026;
      display: grid;
      gap: 8px;
      grid-template-columns: minmax(0, 1fr) auto;
      min-height: 32px;
      padding: 5px 9px;
      text-decoration: none;
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
      flex-wrap: wrap;
      gap: 5px;
    }
    .bonus-chips-section {
      border-top: 1px solid #edf2ef;
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
      border-top: 1px solid #edf2ef;
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
    .codes-section.collapsed .codes-toggle-arrow {
      transform: rotate(-90deg);
    }
    .codes-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .code-item {
      align-items: center;
      background: #f7faf8;
      border: 1px solid #d8e3de;
      border-radius: 6px;
      display: flex;
      font-size: 12px;
      gap: 6px;
      padding: 5px 8px;
    }
    .code-reward {
      font-weight: 700;
      white-space: nowrap;
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
      display: inline-flex;
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
      white-space: pre-line;
      width: max-content;
      z-index: 2147483647;
    }
    .offer-tooltip.visible {
      display: block;
    }
    .support {
      border-top: 1px solid #edf2ef;
      padding: 6px 14px;
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
  const mainOffers = offers.filter((o) => o.provider !== "curve" && o.provider !== "rabattkode" && o.provider !== "dnb");
  const curveOffer = offers.find((o) => o.provider === "curve");
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
  sideTabText.textContent = formatSideTabText(offer, primaryOffer);
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
    ? `Cashback hos ${offer.merchantName}`
    : `Rabattkode hos ${primaryOffer.merchantName}`;
  header.append(siteIcon, title);
  const sumInput = document.createElement("input");
  sumInput.className = "sum-input";
  sumInput.type = "text";
  sumInput.inputMode = "decimal";
  sumInput.placeholder = "Kjøpesum";
  header.append(sumInput);
  const rewardLabels: { element: HTMLSpanElement; offer: CashbackOffer }[] = [];
  const tooltipElements: { element: HTMLDivElement; offer: CashbackOffer }[] = [];
  const offerList = document.createElement("div");
  offerList.className = "offer-list";
  for (const currentOffer of mainOffers) {
    const wrapper = document.createElement("div");
    wrapper.className = "offer-link-wrapper";
    const offerLink = document.createElement("a");
    offerLink.className = "offer-link";
    offerLink.href = currentOffer.provider === "trumf" || currentOffer.provider === "klarna" ? currentOffer.sourceUrl : currentOffer.activationUrl;
    offerLink.target = "_blank";
    offerLink.rel = "noreferrer";
    const offerLabel = document.createElement("span");
    offerLabel.className = "offer-label";
    const offerReward = document.createElement("span");
    offerReward.textContent = formatCompactRewardLabel(currentOffer) ?? formatRewardLabel(currentOffer.reward, currentOffer.provider);
    rewardLabels.push({ element: offerReward, offer: currentOffer });
    const providerBadge = document.createElement("span");
    providerBadge.className = `provider-badge provider-${currentOffer.provider}`;
    providerBadge.textContent = formatProviderName(currentOffer.provider);
    offerLabel.append(offerReward, providerBadge);
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
      offerLink.append(offerLabel, copyBtn);
    } else {
      offerLink.append(offerLabel);
    }
    wrapper.append(offerLink);
    offerList.append(wrapper);
  }
  sumInput.addEventListener("input", () => {
    const raw = sumInput.value.replace(/[^0-9.,]/g, "").replace(",", ".");
    const amount = raw.length > 0 ? Number.parseFloat(raw) : 0;
    for (const { element, offer } of rewardLabels) {
      if (amount > 0) {
        const result = calculateCashback(offer, amount);
        element.textContent = result !== "" ? result : (formatCompactRewardLabel(offer) ?? formatRewardLabel(offer.reward, offer.provider));
      } else {
        element.textContent = formatCompactRewardLabel(offer) ?? formatRewardLabel(offer.reward, offer.provider);
      }
    }
    for (const { element, offer } of tooltipElements) {
      const fullReward = formatRewardLabel(offer.reward, offer.provider);
      const compact = formatCompactRewardLabel(offer);
      const showRewardInTooltip = compact !== undefined && fullReward !== compact;
      const breakdown = amount > 0 ? formatBreakdownWithAmounts(offer.terms, amount) : offer.terms;
      const parts: string[] = [];
      if (showRewardInTooltip) parts.push(fullReward);
      if (breakdown) parts.push(breakdown);
      element.textContent = parts.join("\n\n");
    }
    for (const { element, pct, approx, defaultText } of bonusChipLabels) {
      if (amount > 0) {
        const kr = amount * pct / 100;
        element.textContent = `+${approx ? "~" : ""}${formatKr(kr)} kr`;
      } else {
        element.textContent = defaultText;
      }
    }
    if (amount > 0) {
      const bestBonusEb = Math.round(amount * 10 / 100);
      const bestBonusKr = bestBonusEb / EB_PER_TRUMF_KR;
      const mainMaxKr = mainOffers.reduce((max, o) => Math.max(max, calculateCashbackMaxKr(o, amount)), 0);
      const totalKr = mainMaxKr + bestBonusKr;
      chipsToggleText.textContent = `Ekstra cashback (totalt ~${formatKr(totalKr)} kr)`;
    } else {
      const mainMaxPct = mainOffers.reduce((max, o) => Math.max(max, getMaxRewardPercent(o)), 0);
      const totalPct = mainMaxPct + 0.74;
      chipsToggleText.textContent = `Ekstra cashback (totalt ~${formatNo(totalPct)}%)`;
    }
  });
  const bonusChipLabels: { element: HTMLSpanElement; pct: number; approx: boolean; defaultText: string }[] = [];
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
    const pctStr = (card.pct * 100).toFixed(2).replace(".", ",").replace(/0$/, "");
    label.textContent = `+${card.approx ? "~" : ""}${pctStr}%${ebInfo}`;
    const badge = document.createElement("span");
    badge.className = `provider-badge provider-${card.badge}`;
    badge.textContent = card.label;
    chip.append(label, badge);
    return { chip, label };
  }
  for (const card of FREE_CARDS) {
    const { chip, label } = createBonusChip(card);
    bonusChipLabels.push({ element: label, pct: card.pct * 100, approx: card.approx, defaultText: label.textContent ?? "" });
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
    // For Curve, use the actual offer URL if available
    const overrideUrl = card.label === "Curve" && curveOffer !== undefined ? curveOffer.activationUrl : undefined;
    const shouldShow = card.label !== "Curve" || curveOffer !== undefined;
    if (!shouldShow) continue;
    const { chip, label } = createBonusChip(card, overrideUrl);
    bonusChipLabels.push({ element: label, pct: card.pct * 100, approx: card.approx, defaultText: label.textContent ?? "" });
    premiumItems.append(chip);
    addChipTooltip(chip, card.tip, shadowRoot);
  }
  bonusChips.append(premiumGroup);
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
  const defaultMainMaxPct = mainOffers.reduce((max, o) => Math.max(max, getMaxRewardPercent(o)), 0);
  const defaultTotalPct = defaultMainMaxPct + 0.74;
  chipsToggleText.textContent = `Ekstra cashback (totalt ~${formatNo(defaultTotalPct)}%)`;
  chipsToggle.append(chipsToggleArrow, chipsToggleText);
  chipsToggle.addEventListener("click", () => {
    const isCollapsed = chipsSection.classList.toggle("collapsed");
    chrome.storage.local.set({ [CHIPS_COLLAPSED_KEY]: isCollapsed });
  });
  chipsSection.append(chipsToggle, bonusChips);
  // --- Rabattkoder section ---
  const codesSection = document.createElement("div");
  codesSection.className = "codes-section";
  if (initialCodesCollapsed) {
    codesSection.classList.add("collapsed");
  }
  if (codeOffers.length > 0) {
    const codesToggle = document.createElement("button");
    codesToggle.className = "codes-toggle";
    codesToggle.type = "button";
    const codesToggleArrow = document.createElement("span");
    codesToggleArrow.className = "codes-toggle-arrow";
    codesToggleArrow.textContent = "\u25BC";
    const codesToggleText = document.createElement("span");
    codesToggleText.textContent = `Rabattkoder (${codeOffers.length})`;
    codesToggle.append(codesToggleArrow, codesToggleText);
    codesToggle.addEventListener("click", () => {
      const isCollapsed = codesSection.classList.toggle("collapsed");
      chrome.storage.local.set({ [CODES_COLLAPSED_KEY]: isCollapsed });
    });
    const codesList = document.createElement("div");
    codesList.className = "codes-list";
    for (const codeOffer of codeOffers) {
      const code = codeOffer.discountCode ?? "";
      const item = document.createElement("div");
      item.className = "code-item";
      const reward = document.createElement("span");
      reward.className = "code-reward";
      reward.textContent = codeOffer.reward;
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
        copyTooltip.classList.add("visible");
      });
      copyBtn.addEventListener("mouseleave", () => {
        copyTooltip.classList.remove("visible");
      });
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
      item.append(reward, codeSpan, copyBtn);
      codesList.append(item);
    }
    codesSection.append(codesToggle, codesList);
  }
  body.append(header, offerList, chipsSection);
  if (codeOffers.length > 0) {
    body.append(codesSection);
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
    support.append(supportLink);
    panel.append(topLine, body, support);
  } else {
    panel.append(topLine, body);
  }
  notice.append(sideTab, panel);
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
    if (!showRewardInTooltip && !hasRateBreakdown(currentOffer.terms)) continue;
    const wrapper = wrappers[idx];
    if (wrapper === undefined) continue;
    const tooltip = document.createElement("div");
    tooltip.className = "offer-tooltip";
    const tooltipParts: string[] = [];
    if (showRewardInTooltip) tooltipParts.push(fullReward);
    if (currentOffer.terms) tooltipParts.push(currentOffer.terms);
    tooltip.textContent = tooltipParts.join("\n\n");
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
      const rightEdge = panelRect ? panelRect.right + 6 : wrapperRect.right + 6;
      tooltip.style.left = `${rightEdge}px`;
      tooltip.style.top = `${wrapperRect.top + wrapperRect.height / 2 - tooltipHeight / 2}px`;
    });
    wrapper.addEventListener("mouseleave", () => {
      tooltip.classList.remove("visible");
    });
  }
  // Re-enable transitions after first frame
  if (initialCollapsed) {
    requestAnimationFrame(() => {
      notice.classList.remove("no-transition");
    });
  }
}
function clearNotice(): void {
  document.getElementById(HOST_ID)?.remove();
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
  const lookupDomains = [
    normalizedHostname,
    ...getAlternateTldDomains(normalizedHostname),
    ...CC_SUBDOMAINS.map((cc) => `${cc}.${normalizedHostname}`),
  ];
  const indexMatches = lookupDomains.flatMap((domain) => {
    return cashbackIndex.domainIndex[domain] ?? [];
  });
  const suffixMatches = cashbackIndex.offers.filter((offer) => {
    return offer.domains.some((domain) => {
      const normalizedDomain = normalizeDomainInput(domain);
      return (
        normalizedDomain !== normalizedHostname &&
        normalizedHostname.endsWith(`.${normalizedDomain}`)
      );
    });
  });
  return sortOffersByReward(uniqueOffers([...indexMatches, ...suffixMatches]));
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
    if (existing === undefined || offer.domains.length >= existing.domains.length) {
      byKey.set(key, offer);
    }
  }
  return [...byKey.values()];
}
function sortOffersByReward(offers: CashbackOffer[]): CashbackOffer[] {
  return [...offers].sort((firstOffer, secondOffer) => {
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
  kind: "percentage" | "fixed" | "points" | "unknown";
  amount: number;
};
function parseRewardValue(reward: string): RewardValue {
  const percentageMatch = reward.match(/(\d+(?:[,.]\d+)?)\s*%/);
  if (percentageMatch !== null) {
    return {
      kind: "percentage",
      amount: parseLocalizedNumber(percentageMatch[1] ?? "0"),
    };
  }
  const fixedMatch = reward.match(/(\d+(?:[,.]\d+)?)\s*kr/i);
  if (fixedMatch !== null) {
    return {
      kind: "fixed",
      amount: parseLocalizedNumber(fixedMatch[1] ?? "0"),
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
  if (kind === "points") return 2;
  return 1;
}
function formatProviderName(provider: CashbackOffer["provider"]): string {
  return PROVIDER_NAMES[provider] ?? provider;
}
function calculateCashback(offer: CashbackOffer, amount: number): string {
  const reward = offer.reward.trim();
  // Percentage range: "2-3,5 %"
  const rangeMatch = reward.match(/^([\d,]+)-([\d,]+)\s*%$/);
  if (rangeMatch !== null) {
    const minPct = Number.parseFloat(rangeMatch[1].replace(",", "."));
    const maxPct = Number.parseFloat(rangeMatch[2].replace(",", "."));
    const minKr = amount * minPct / 100;
    const maxKr = amount * maxPct / 100;
    const label = minKr === maxKr ? `${formatKr(minKr)} kr` : `${formatKr(minKr)}-${formatKr(maxKr)} kr`;
    return addEbSuffix(label, minPct, maxPct, amount, offer.provider);
  }
  // Single percentage: "6,2 %"
  const pctMatch = reward.match(/^([\d,]+)\s*%$/);
  if (pctMatch !== null) {
    const pct = Number.parseFloat(pctMatch[1].replace(",", "."));
    const kr = amount * pct / 100;
    return addEbSuffix(`${formatKr(kr)} kr`, pct, pct, amount, offer.provider);
  }
  // SAS rate: "15 poeng per 100 kr"
  const sasRateMatch = reward.match(/^([\d\s]+)\s*poeng\s+per\s+100\s*kr$/i);
  if (sasRateMatch !== null) {
    const points = Number.parseInt(sasRateMatch[1].replace(/\s/g, ""), 10);
    const eb = Math.round(amount * points / 100);
    const kr = amount * points / 100 / EB_PER_TRUMF_KR;
    return `~${formatKr(kr)} kr (~${eb} EB)`;
  }
  // SAS fixed: "500 poeng"
  const sasFixedMatch = reward.match(/^([\d\s]+)\s*poeng$/i);
  if (sasFixedMatch !== null) {
    const points = Number.parseInt(sasFixedMatch[1].replace(/\s/g, ""), 10);
    const kr = points / EB_PER_TRUMF_KR;
    return `~${formatKr(kr)} kr (~${points} EB)`;
  }
  // Klarna "5.5%"
  const klarnaMatch = reward.match(/^([\d.]+)%$/);
  if (klarnaMatch !== null) {
    const pct = Number.parseFloat(klarnaMatch[1]);
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
  return label;
}
function getMaxRewardPercent(offer: CashbackOffer): number {
  const reward = offer.reward.trim();
  const rangeMatch = reward.match(/^([\d,]+)-([\d,]+)\s*%$/);
  if (rangeMatch !== null) {
    return Number.parseFloat(rangeMatch[2].replace(",", "."));
  }
  const pctMatch = reward.match(/^([\d,]+)\s*%$/);
  if (pctMatch !== null) {
    return Number.parseFloat(pctMatch[1].replace(",", "."));
  }
  const sasRateMatch = reward.match(/^([\d\s]+)\s*poeng\s+per\s+100\s*kr$/i);
  if (sasRateMatch !== null) {
    const points = Number.parseInt(sasRateMatch[1].replace(/\s/g, ""), 10);
    return points / EB_PER_TRUMF_KR;
  }
  return 0;
}
function calculateCashbackMaxKr(offer: CashbackOffer, amount: number): number {
  const reward = offer.reward.trim();
  const rangeMatch = reward.match(/^([\d,]+)-([\d,]+)\s*%$/);
  if (rangeMatch !== null) {
    const maxPct = Number.parseFloat(rangeMatch[2].replace(",", "."));
    return amount * maxPct / 100;
  }
  const pctMatch = reward.match(/^([\d,]+)\s*%$/);
  if (pctMatch !== null) {
    return amount * Number.parseFloat(pctMatch[1].replace(",", ".")) / 100;
  }
  const klarnaMatch = reward.match(/^([\d.]+)%$/);
  if (klarnaMatch !== null) {
    return amount * Number.parseFloat(klarnaMatch[1]) / 100;
  }
  const sasRateMatch = reward.match(/^([\d\s]+)\s*poeng\s+per\s+100\s*kr$/i);
  if (sasRateMatch !== null) {
    const points = Number.parseInt(sasRateMatch[1].replace(/\s/g, ""), 10);
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
        const pct = Number.parseFloat(match[1].replace(",", "."));
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
    return "Cashback";
  }
  // For SAS, convert to percentage-first display
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
  const percentMatch = label.match(/(?:opptil\s*)?(\d+(?:[,.]\d+)?\s*%(?:\s*[-–]\s*\d+(?:[,.]\d+)?\s*%)?)/i);
  if (percentMatch !== null) {
    return percentMatch[1]!.replace(/\s+/g, " ");
  }
  const krMatch = label.match(/\d+(?:[,.]\d+)?\s*kr/i);
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
    const points = Number.parseInt(fixedMatch[1].replace(/\s/g, ""), 10);
    const kr = Math.round(points / EB_PER_TRUMF_KR);
    return `~${kr} kr (~${points.toLocaleString("nb-NO")} EB)`;
  }
  const rateMatch = reward.match(/^([\d\s]+)\s*poeng\s+per\s+100\s*kr$/i);
  if (rateMatch !== null) {
    const points = Number.parseInt(rateMatch[1].replace(/\s/g, ""), 10);
    const pct = points / EB_PER_TRUMF_KR;
    return `~${formatNo(pct)} % (~${points} EB/100kr)`;
  }
  return "";
}
function convertTrumfToEb(reward: string): string {
  // "1,1-1,5 %" → ~15-20 EB/100kr
  const rangeMatch = reward.match(/^([\d,]+)-([\d,]+)\s*%$/);
  if (rangeMatch !== null) {
    const minPct = Number.parseFloat(rangeMatch[1].replace(",", "."));
    const maxPct = Number.parseFloat(rangeMatch[2].replace(",", "."));
    const minEb = Math.round(minPct * EB_PER_TRUMF_KR);
    const maxEb = Math.round(maxPct * EB_PER_TRUMF_KR);
    return `~${minEb}-${maxEb} EB/100kr`;
  }
  // "3,1 %" → ~42 EB/100kr
  const pctMatch = reward.match(/^([\d,]+)\s*%$/);
  if (pctMatch !== null) {
    const pct = Number.parseFloat(pctMatch[1].replace(",", "."));
    const ebPer100 = Math.round(pct * EB_PER_TRUMF_KR);
    return `~${ebPer100} EB/100kr`;
  }
  // "295 kr" → ~3 983 EB
  const krMatch = reward.match(/^([\d\s]+)\s*kr$/);
  if (krMatch !== null) {
    const kr = Number.parseInt(krMatch[1].replace(/\s/g, ""), 10);
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
