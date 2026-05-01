type CashbackOffer = {
  provider: "trumf" | "klarna" | "remember";
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

const HOST_ID = "mimir-cashback-notice";

chrome.runtime.onMessage.addListener((message) => {
  if (isCashbackFoundMessage(message)) {
    renderNotice(message.offers);
    return;
  }

  if (isCashbackNoneMessage(message)) {
    clearNotice();
  }
});

requestCurrentOffers();

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
      renderNotice(response.offers);
      return;
    }

    clearNotice();
  });
}

function renderNotice(offers: CashbackOffer[]): void {
  clearNotice();

  const host = document.createElement("div");
  host.id = HOST_ID;
  const shadowRoot = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host {
      all: initial;
      bottom: 16px;
      left: 16px;
      position: fixed;
      z-index: 2147483647;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .notice {
      width: min(340px, calc(100vw - 32px));
      color: #172026;
      background: #ffffff;
      border: 1px solid #c9d7cf;
      border-radius: 8px;
      box-shadow: 0 14px 38px rgba(11, 25, 34, 0.2);
      overflow: hidden;
    }

    .notice.collapsed {
      width: min(280px, calc(100vw - 32px));
    }

    .topline {
      height: 4px;
      background: linear-gradient(90deg, #1f8f5f, #f4b942);
    }

    .collapsed-bar {
      align-items: center;
      appearance: none;
      background: #ffffff;
      border: 0;
      color: #172026;
      cursor: pointer;
      display: none;
      font: inherit;
      gap: 10px;
      min-height: 46px;
      padding: 10px 12px;
      text-align: left;
      width: 100%;
    }

    .notice.collapsed .collapsed-bar {
      display: flex;
    }

    .notice.collapsed .body {
      display: none;
    }

    .collapsed-text {
      display: grid;
      gap: 2px;
      min-width: 0;
    }

    .collapsed-title {
      font-size: 13px;
      font-weight: 800;
      line-height: 1.15;
      overflow-wrap: anywhere;
    }

    .collapsed-meta {
      color: #4f5f66;
      font-size: 12px;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }

    .body {
      display: grid;
      gap: 10px;
      padding: 14px;
    }

    .header {
      align-items: start;
      display: grid;
      gap: 10px;
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .brand {
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

    .meta {
      color: #4f5f66;
      font-size: 12px;
      line-height: 1.35;
      margin: 0;
      overflow-wrap: anywhere;
    }

    .actions {
      align-items: center;
      display: flex;
      gap: 8px;
      justify-content: flex-end;
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

    .offer-open {
      color: #1f8f5f;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
    }

    button {
      appearance: none;
      border: 0;
      border-radius: 6px;
      cursor: pointer;
      font: inherit;
      min-height: 32px;
      padding: 0 11px;
    }

    .collapse-toggle {
      background: #edf2ef;
      color: #203027;
      min-height: 30px;
      padding: 0;
      width: 30px;
    }

    .open {
      background: #1f8f5f;
      color: #ffffff;
      font-size: 13px;
      font-weight: 700;
    }
  `;

  const offer = offers[0];

  if (offer === undefined) {
    return;
  }

  const notice = document.createElement("section");
  notice.className = "notice";

  const topLine = document.createElement("div");
  topLine.className = "topline";

  const collapsedBar = document.createElement("button");
  collapsedBar.className = "collapsed-bar";
  collapsedBar.type = "button";
  collapsedBar.setAttribute("aria-label", "Expand cashback offers");

  const collapsedIcon = createSiteIcon();

  const collapsedText = document.createElement("span");
  collapsedText.className = "collapsed-text";

  const collapsedTitle = document.createElement("span");
  collapsedTitle.className = "collapsed-title";
  collapsedTitle.textContent = `Cashback hos ${offer.merchantName}`;

  const collapsedMeta = document.createElement("span");
  collapsedMeta.className = "collapsed-meta";
  collapsedMeta.textContent = `${offers.length} offer${offers.length === 1 ? "" : "s"}`;

  collapsedText.append(collapsedTitle, collapsedMeta);
  collapsedBar.append(collapsedIcon, collapsedText);

  const body = document.createElement("div");
  body.className = "body";

  const header = document.createElement("div");
  header.className = "header";

  const brand = document.createElement("div");
  brand.className = "brand";

  const siteIcon = createSiteIcon();

  const title = document.createElement("p");
  title.className = "title";
  title.textContent = `Cashback hos ${offer.merchantName}`;

  const collapseButton = document.createElement("button");
  collapseButton.className = "collapse-toggle";
  collapseButton.type = "button";
  collapseButton.textContent = "-";
  collapseButton.setAttribute("aria-label", "Collapse cashback offers");
  collapseButton.addEventListener("click", () => {
    setCollapsed(notice, collapseButton, true);
  });

  collapsedBar.addEventListener("click", () => {
    setCollapsed(notice, collapseButton, false);
  });

  brand.append(siteIcon, title);
  header.append(brand, collapseButton);

  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = "All offers, best first";

  const offerList = document.createElement("div");
  offerList.className = "offer-list";

  for (const currentOffer of offers) {
    const offerLink = document.createElement("a");
    offerLink.className = "offer-link";
    offerLink.href = currentOffer.activationUrl;
    offerLink.target = "_blank";
    offerLink.rel = "noreferrer";

    const offerLabel = document.createElement("span");
    offerLabel.className = "offer-label";

    const offerReward = document.createElement("span");
    offerReward.textContent = formatRewardLabel(currentOffer.reward);

    const providerBadge = document.createElement("span");
    providerBadge.className = `provider-badge provider-${currentOffer.provider}`;
    providerBadge.textContent = formatProviderName(currentOffer.provider);

    const offerOpen = document.createElement("span");
    offerOpen.className = "offer-open";
    offerOpen.textContent = "Open";

    offerLabel.append(offerReward, providerBadge);
    offerLink.append(offerLabel, offerOpen);
    offerList.append(offerLink);
  }

  const actions = document.createElement("div");
  actions.className = "actions";

  const openButton = document.createElement("button");
  openButton.className = "open";
  openButton.type = "button";
  openButton.textContent = "Top offer";
  openButton.addEventListener("click", () => {
    window.open(offer.activationUrl, "_blank", "noopener,noreferrer");
  });

  actions.append(openButton);
  body.append(header, meta, offerList, actions);
  notice.append(topLine, collapsedBar, body);
  shadowRoot.append(style, notice);
  document.documentElement.append(host);
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
  collapseButton: HTMLButtonElement,
  collapsed: boolean,
): void {
  notice.classList.toggle("collapsed", collapsed);
  collapseButton.textContent = collapsed ? "+" : "-";
  collapseButton.setAttribute(
    "aria-label",
    collapsed ? "Expand cashback offers" : "Collapse cashback offers",
  );
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
): value is "trumf" | "klarna" | "remember" {
  return value === "trumf" || value === "klarna" || value === "remember";
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

function formatRewardLabel(reward: string): string {
  const trimmedReward = reward.trim();
  const maxPrefix = "Opptil ";

  if (trimmedReward.toLowerCase().startsWith(maxPrefix.toLowerCase())) {
    return `${trimmedReward.slice(maxPrefix.length)} (opptil)`;
  }

  return trimmedReward.length > 0 ? trimmedReward : "Cashback";
}
