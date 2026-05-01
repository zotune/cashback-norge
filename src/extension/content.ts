type CashbackOffer = {
  provider: "trumf" | "klarna" | "remember" | "sas";
  merchantName: string;
  domains: string[];
  reward: string;
  sourceUrl: string;
  activationUrl: string;
  terms: string;
  updatedAt: string;
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
  chrome.storage.local.get(COLLAPSED_STORAGE_KEY, (result: Record<string, unknown>) => {
    const collapsed = result[COLLAPSED_STORAGE_KEY] === true;
    renderNotice(offers, collapsed);
  });
}

function requestCurrentOffers(): void {
  const message: GetOffersForUrlMessage = {
    type: "get-offers-for-url",
    url: window.location.href,
  };

  chrome.runtime.sendMessage(message, (response: unknown) => {
    if (!isOffersForUrlResponse(response) || !response.ok) {
      return;
    }

    if (response.offers.length > 0) {
      renderNoticeWithStoredState(response.offers);
      return;
    }

    clearNotice();
  });
}

function renderNotice(offers: CashbackOffer[], initialCollapsed: boolean): void {
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
    }

    *, *::before, *::after {
      font-family: inherit;
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
      width: min(340px, calc(100vw - 42px));
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
      padding: 14px;
    }

    .header {
      align-items: center;
      display: grid;
      gap: 12px;
      grid-template-columns: 24px minmax(0, 1fr);
      min-height: 32px;
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
      gap: 6px;
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
      min-height: 38px;
      padding: 7px 9px;
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

    .offer-open {
      color: #1f8f5f;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
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
      padding: 8px 14px;
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
  `;

  const offer = offers[0];

  if (offer === undefined) {
    return;
  }

  const notice = document.createElement("section");
  notice.className = "notice";

  // Side tab (collapse/expand control on the left edge)
  const sideTab = document.createElement("button");
  sideTab.className = `side-tab side-tab-${offer.provider}`;
  sideTab.type = "button";
  sideTab.setAttribute("aria-label", "Collapse cashback offers");

  const sideTabArrow = document.createElement("span");
  sideTabArrow.className = "side-tab-arrow";
  sideTabArrow.textContent = "\u2039"; // ‹

  const sideTabText = document.createElement("span");
  sideTabText.className = "side-tab-text";
  sideTabText.textContent = formatRewardLabel(offer.reward, offer.provider);

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
  title.textContent = `Cashback hos ${offer.merchantName}`;

  header.append(siteIcon, title);

  const offerList = document.createElement("div");
  offerList.className = "offer-list";

  for (const currentOffer of offers) {
    const wrapper = document.createElement("div");
    wrapper.className = "offer-link-wrapper";

    const offerLink = document.createElement("a");
    offerLink.className = "offer-link";
    offerLink.href = currentOffer.provider === "trumf" ? currentOffer.sourceUrl : currentOffer.activationUrl;
    offerLink.target = "_blank";
    offerLink.rel = "noreferrer";

    const offerLabel = document.createElement("span");
    offerLabel.className = "offer-label";

    const offerReward = document.createElement("span");
    offerReward.textContent = formatRewardLabel(currentOffer.reward, currentOffer.provider);

    const providerBadge = document.createElement("span");
    providerBadge.className = `provider-badge provider-${currentOffer.provider}`;
    providerBadge.textContent = formatProviderName(currentOffer.provider);

    const offerOpen = document.createElement("span");
    offerOpen.className = "offer-open";
    offerOpen.textContent = "Open";

    offerLabel.append(offerReward, providerBadge);
    offerLink.append(offerLabel, offerOpen);

    wrapper.append(offerLink);
    offerList.append(wrapper);
  }

  body.append(header, offerList);

  const supportLinks = [
    { text: "200 kr gratis i fond \u2192", url: "https://kron.no/app/invitert/nvu4d" },
    { text: "Kj\u00f8p en kaffe til utvikler \u2192", url: "https://buymeacoffee.com/adore" },
    { text: "1% cashback i 30 dager med Curve \u2192", url: "https://www.curve.com/join#D5GXXJJD" },
    { text: "Opptil 2 500 kr med Revolut \u2192", url: "https://revolut.com/referrals?r=FELPJK" },
    { text: "Horde: 500p bonus, oversikt og nedbetaling kredittkort \u2192", url: "https://app.horde.no/66CS/verve?code=kloube" },
  ];
  const pick = supportLinks[Math.floor(Math.random() * supportLinks.length)];

  if (pick !== undefined) {
    const support = document.createElement("div");
    support.className = "support";

    const supportLink = document.createElement("a");
    supportLink.href = pick.url;
    supportLink.target = "_blank";
    supportLink.rel = "noreferrer";
    supportLink.textContent = `St\u00f8tt oppdateringer: ${pick.text}`;
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
  document.documentElement.append(host);

  // Attach tooltips to shadow root (outside panel) so they escape overflow:hidden
  const wrappers = shadowRoot.querySelectorAll(".offer-link-wrapper");
  for (let idx = 0; idx < offers.length; idx++) {
    const currentOffer = offers[idx];
    if (currentOffer === undefined || !hasRateBreakdown(currentOffer.terms)) continue;
    const wrapper = wrappers[idx];
    if (wrapper === undefined) continue;

    const tooltip = document.createElement("div");
    tooltip.className = "offer-tooltip";
    tooltip.textContent = currentOffer.terms;
    shadowRoot.append(tooltip);

    wrapper.addEventListener("mouseenter", () => {
      const rect = wrapper.getBoundingClientRect();
      // Show off-screen to measure, then position
      tooltip.style.left = "-9999px";
      tooltip.style.top = "-9999px";
      tooltip.classList.add("visible");
      const tooltipHeight = tooltip.offsetHeight;
      tooltip.style.left = `${rect.left}px`;
      tooltip.style.top = `${rect.top - tooltipHeight - 6}px`;
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
    siteIcon.remove();
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

function isCashbackOffer(value: unknown): value is CashbackOffer {
  return (
    isRecord(value) &&
    isCashbackProvider(value.provider) &&
    typeof value.merchantName === "string" &&
    Array.isArray(value.domains) &&
    value.domains.every(isString) &&
    typeof value.reward === "string" &&
    typeof value.sourceUrl === "string" &&
    typeof value.activationUrl === "string" &&
    typeof value.terms === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isCashbackProvider(
  value: unknown,
): value is "trumf" | "klarna" | "remember" | "sas" | "tfbank" {
  return value === "trumf" || value === "klarna" || value === "remember" || value === "sas" || value === "tfbank";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function formatProviderName(provider: CashbackOffer["provider"]): string {
  if (provider === "remember") {
    return "re:member";
  }

  if (provider === "trumf") {
    return "Trumf";
  }

  if (provider === "sas") {
    return "SAS EuroBonus";
  }

  if (provider === "tfbank") {
    return "TF Bank";
  }

  return "Klarna";
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

const EB_PER_TRUMF_KR = 13.5;

function hasRateBreakdown(terms: string): boolean {
  return terms.includes("\n") && /\d+.*%/.test(terms);
}

function formatRewardLabel(reward: string, provider: string): string {
  const trimmedReward = reward.trim();
  const maxPrefix = "Opptil ";

  if (trimmedReward.toLowerCase().startsWith(maxPrefix.toLowerCase())) {
    const inner = trimmedReward.slice(maxPrefix.length);
    const short = shortenReward(inner, provider);
    const converted = convertReward(inner, provider);
    return converted !== "" ? `${short} (opptil, ${converted})` : `${short} (opptil)`;
  }

  if (trimmedReward.length === 0) {
    return "Cashback";
  }

  const short = shortenReward(trimmedReward, provider);
  const converted = convertReward(trimmedReward, provider);
  return converted !== "" ? `${short} (${converted})` : short;
}

function shortenReward(reward: string, provider: string): string {
  if (provider !== "sas") {
    return reward;
  }
  // "2 000 poeng" → "2000p"
  const fixedMatch = reward.match(/^([\d\s]+)\s*poeng$/i);
  if (fixedMatch !== null) {
    return `${fixedMatch[1].replace(/\s/g, "")}p`;
  }
  // "15 poeng per 100 kr" → "15p/100kr"
  const rateMatch = reward.match(/^([\d\s]+)\s*poeng\s+per\s+100\s*kr$/i);
  if (rateMatch !== null) {
    return `${rateMatch[1].replace(/\s/g, "")}p/100kr`;
  }
  return reward;
}

function convertReward(reward: string, provider: string): string {
  if (provider === "sas") {
    return convertSasToKr(reward);
  }
  if (provider === "trumf") {
    return convertTrumfToEb(reward);
  }
  return "";
}

function convertSasToKr(reward: string): string {
  // "500 poeng" → ~37 kr
  const fixedMatch = reward.match(/^([\d\s]+)\s*poeng$/i);
  if (fixedMatch !== null) {
    const points = Number.parseInt(fixedMatch[1].replace(/\s/g, ""), 10);
    const kr = Math.round(points / EB_PER_TRUMF_KR);
    return `~${kr} kr`;
  }
  // "15 poeng per 100 kr" → ~1,1%
  const rateMatch = reward.match(/^([\d\s]+)\s*poeng\s+per\s+100\s*kr$/i);
  if (rateMatch !== null) {
    const points = Number.parseInt(rateMatch[1].replace(/\s/g, ""), 10);
    const pct = points / EB_PER_TRUMF_KR;
    return `~${formatNo(pct)}%`;
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
