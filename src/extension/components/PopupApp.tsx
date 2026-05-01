import { useEffect, useState, type ReactElement } from "react";
import type { CashbackOffer } from "../../shared/cashback.js";
import {
  type GetOffersForUrlMessage,
  isOffersForUrlResponse,
} from "../../shared/extension-messages.js";

type PopupState =
  | {
      status: "loading";
    }
  | {
      status: "ready";
      hostname: string;
      offers: CashbackOffer[];
    }
  | {
      status: "error";
      message: string;
    };

export function PopupApp(): ReactElement {
  const [state, setState] = useState<PopupState>({ status: "loading" });
  const [sumInput, setSumInput] = useState("");

  useEffect(() => {
    loadCurrentTabOffers(setState);
  }, []);

  const amount = sumInput.length > 0 ? Number.parseInt(sumInput.replace(/[^0-9]/g, ""), 10) || 0 : 0;

  if (state.status === "loading") {
    return (
      <main className="popup">
        <p className="eyebrow">Cashback</p>
        <h1>Checking...</h1>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="popup">
        <p className="eyebrow">Cashback</p>
        <h1>Not available</h1>
        <p className="muted">{state.message}</p>
      </main>
    );
  }

  return (
    <main className="popup">
      <div className="popup-header">
        <div>
          <p className="eyebrow">{state.hostname}</p>
          <h1>{state.offers.length > 0 ? "Cashback offers" : "No cashback"}</h1>
        </div>
        <input
          className="sum-input"
          type="text"
          inputMode="numeric"
          placeholder="Kjøpesum"
          value={sumInput}
          onChange={(e) => setSumInput(e.target.value.replace(/[^0-9]/g, ""))}
        />
      </div>
      <div className="offers">
        {state.offers.map((offer) => {
          return (
            <OfferRow
              key={`${offer.provider}:${offer.sourceUrl}`}
              offer={offer}
              amount={amount}
            />
          );
        })}
      </div>
    </main>
  );
}

function OfferRow(props: { offer: CashbackOffer; amount: number }): ReactElement {
  const hasBreakdown = props.offer.terms.includes("\n") && /\d+.*%/.test(props.offer.terms);
  const [copied, setCopied] = useState(false);

  let rewardText: string;
  if (props.amount > 0) {
    const result = calculateCashback(props.offer, props.amount);
    rewardText = result !== "" ? result : formatRewardLabel(props.offer.reward, props.offer.provider);
  } else {
    rewardText = formatRewardLabel(props.offer.reward, props.offer.provider);
  }

  const discountCode = props.offer.discountCode;

  function handleCopyClick(e: React.MouseEvent): void {
    if (discountCode === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(discountCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="offer-wrapper" style={{ position: "relative" }}>
      {hasBreakdown && (
        <div className="offer-tooltip">{props.offer.terms}</div>
      )}
      <a
        className="offer"
        href={props.offer.provider === "trumf" ? props.offer.sourceUrl : props.offer.activationUrl}
        target="_blank"
        rel="noreferrer"
      >
        <div>
          <p className="merchant">
            <span>{rewardText}</span>
            <span
              className={`provider-badge provider-${props.offer.provider}`}
            >
              {formatProviderName(props.offer.provider)}
            </span>
          </p>
          <p className="muted">{props.offer.merchantName}</p>
        </div>
        {discountCode !== undefined && (
          <span
            className="copy-code-btn"
            title={copied ? "Kopiert!" : `Kopier rabattkode: ${discountCode}`}
            onClick={handleCopyClick}
            role="button"
          >
            {copied ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            )}
          </span>
        )}
      </a>
    </div>
  );
}

const EB_PER_TRUMF_KR = 13.5;

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
  const rangeMatch = reward.match(/^([\d,]+)-([\d,]+)\s*%$/);
  if (rangeMatch !== null) {
    const minPct = Number.parseFloat(rangeMatch[1].replace(",", "."));
    const maxPct = Number.parseFloat(rangeMatch[2].replace(",", "."));
    const minEb = Math.round(minPct * EB_PER_TRUMF_KR);
    const maxEb = Math.round(maxPct * EB_PER_TRUMF_KR);
    return `~${minEb}-${maxEb} EB/100kr`;
  }
  const pctMatch = reward.match(/^([\d,]+)\s*%$/);
  if (pctMatch !== null) {
    const pct = Number.parseFloat(pctMatch[1].replace(",", "."));
    const ebPer100 = Math.round(pct * EB_PER_TRUMF_KR);
    return `~${ebPer100} EB/100kr`;
  }
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

function formatProviderName(provider: CashbackOffer["provider"]): string {
  if (provider === "remember") {
    return "re:member";
  }

  if (provider === "trumf") {
    return "Trumf";
  }

  if (provider === "sas") {
    return "SAS EB";
  }

  if (provider === "tfbank") {
    return "TF Bank";
  }

  if (provider === "dnb") {
    return "DNB";
  }

  return "Klarna";
}

function calculateCashback(offer: CashbackOffer, amount: number): string {
  const reward = offer.reward.trim();

  const rangeMatch = reward.match(/^([\d,]+)-([\d,]+)\s*%$/);
  if (rangeMatch !== null) {
    const minPct = Number.parseFloat(rangeMatch[1].replace(",", "."));
    const maxPct = Number.parseFloat(rangeMatch[2].replace(",", "."));
    const minKr = Math.round(amount * minPct / 100);
    const maxKr = Math.round(amount * maxPct / 100);
    const label = minKr === maxKr ? `${minKr} kr` : `${minKr}-${maxKr} kr`;
    return addEbSuffix(label, minPct, maxPct, amount, offer.provider);
  }

  const pctMatch = reward.match(/^([\d,]+)\s*%$/);
  if (pctMatch !== null) {
    const pct = Number.parseFloat(pctMatch[1].replace(",", "."));
    const kr = Math.round(amount * pct / 100);
    return addEbSuffix(`${kr} kr`, pct, pct, amount, offer.provider);
  }

  const sasRateMatch = reward.match(/^([\d\s]+)\s*poeng\s+per\s+100\s*kr$/i);
  if (sasRateMatch !== null) {
    const points = Number.parseInt(sasRateMatch[1].replace(/\s/g, ""), 10);
    const eb = Math.round(amount * points / 100);
    const kr = Math.round(eb / EB_PER_TRUMF_KR);
    return `~${kr} kr (~${eb} EB)`;
  }

  const sasFixedMatch = reward.match(/^([\d\s]+)\s*poeng$/i);
  if (sasFixedMatch !== null) {
    const points = Number.parseInt(sasFixedMatch[1].replace(/\s/g, ""), 10);
    const kr = Math.round(points / EB_PER_TRUMF_KR);
    return `~${kr} kr (~${points} EB)`;
  }

  const klarnaMatch = reward.match(/^([\d.]+)%$/);
  if (klarnaMatch !== null) {
    const pct = Number.parseFloat(klarnaMatch[1]);
    const kr = Math.round(amount * pct / 100);
    return `${kr} kr`;
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

function loadCurrentTabOffers(
  setState: (state: PopupState) => void,
): void {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];

    if (activeTab === undefined || activeTab.url === undefined) {
      setState({ status: "error", message: "No active tab" });
      return;
    }

    const parsedUrl = parseUrl(activeTab.url);

    if (parsedUrl === undefined) {
      setState({ status: "ready", hostname: "", offers: [] });
      return;
    }

    const message: GetOffersForUrlMessage = {
      type: "get-offers-for-url",
      url: activeTab.url,
    };

    chrome.runtime.sendMessage(message, (response: unknown) => {
      if (!isOffersForUrlResponse(response) || !response.ok) {
        setState({ status: "error", message: "Could not read offers" });
        return;
      }

      setState({
        status: "ready",
        hostname: parsedUrl.hostname,
        offers: response.offers,
      });
    });
  });
}

function parseUrl(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}
