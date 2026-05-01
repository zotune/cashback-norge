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

  useEffect(() => {
    loadCurrentTabOffers(setState);
  }, []);

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
      <p className="eyebrow">{state.hostname}</p>
      <h1>{state.offers.length > 0 ? "Cashback offers" : "No cashback"}</h1>
      <div className="offers">
        {state.offers.map((offer) => {
          return (
            <OfferRow
              key={`${offer.provider}:${offer.sourceUrl}`}
              offer={offer}
            />
          );
        })}
      </div>
    </main>
  );
}

function OfferRow(props: { offer: CashbackOffer }): ReactElement {
  return (
    <a
      className="offer"
      href={props.offer.provider === "trumf" ? props.offer.sourceUrl : props.offer.activationUrl}
      target="_blank"
      rel="noreferrer"
    >
      <div>
        <p className="merchant">
          <span>{formatRewardLabel(props.offer.reward, props.offer.provider)}</span>
          <span
            className={`provider-badge provider-${props.offer.provider}`}
          >
            {formatProviderName(props.offer.provider)}
          </span>
        </p>
        <p className="muted">{props.offer.merchantName}</p>
      </div>
      <span className="reward" aria-hidden="true">
        Open
      </span>
    </a>
  );
}

const EB_PER_TRUMF_KR = 13.5;

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
  const fixedMatch = reward.match(/^([\d\s]+)\s*poeng$/i);
  if (fixedMatch !== null) {
    return `${fixedMatch[1].replace(/\s/g, "")}p`;
  }
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
  const fixedMatch = reward.match(/^([\d\s]+)\s*poeng$/i);
  if (fixedMatch !== null) {
    const points = Number.parseInt(fixedMatch[1].replace(/\s/g, ""), 10);
    const kr = Math.round(points / EB_PER_TRUMF_KR);
    return `~${kr} kr`;
  }
  const rateMatch = reward.match(/^([\d\s]+)\s*poeng\s+per\s+100\s*kr$/i);
  if (rateMatch !== null) {
    const points = Number.parseInt(rateMatch[1].replace(/\s/g, ""), 10);
    const pct = points / EB_PER_TRUMF_KR;
    return `~${formatNo(pct)}%`;
  }
  return "";
}

function convertTrumfToEb(reward: string): string {
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
    return "SAS EuroBonus";
  }

  return "Klarna";
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
