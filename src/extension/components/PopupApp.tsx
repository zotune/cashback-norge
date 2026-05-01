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
      href={props.offer.activationUrl}
      target="_blank"
      rel="noreferrer"
    >
      <div>
        <p className="merchant">
          <span>{formatRewardLabel(props.offer.reward)}</span>
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

function formatRewardLabel(reward: string): string {
  const trimmedReward = reward.trim();
  const maxPrefix = "Opptil ";

  if (trimmedReward.toLowerCase().startsWith(maxPrefix.toLowerCase())) {
    return `${trimmedReward.slice(maxPrefix.length)} (opptil)`;
  }

  return trimmedReward.length > 0 ? trimmedReward : "Cashback";
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
