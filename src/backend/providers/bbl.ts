// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
// Boligbyggelagenes felles fordelsprogram (fordelerformedlemmer.no). The
// Next.js page embeds all contracts as JSON; "National" contracts apply to
// members of every participating boligbyggelag.
import { gotScraping } from "crawlee";
import type { CashbackOffer } from "../../shared/cashback.js";
import { normalizeDomainInput, parseUrl, stripHtml, toBaseDomain } from "../../shared/cashback.js";
import { extractBenefitReward, formatPercentageReward } from "../../shared/reward.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

export type FetchBblInput = {
  /** BBL-specific page whose embedded JSON carries the national contracts */
  pageUrl: string;
  generatedAt: string;
  logger: Logger;
  overrides: ProviderOverrides;
};

const DEFAULT_TERMS = "Krever medlemskap i et boligbyggelag tilknyttet Fordelskortet. Registrer betalingskort på fordelerformedlemmer.no for bonus.";

type BblContract = {
  name: string;
  contractType: string;
  bonusRate: string | number;
  bonusText: string | null;
  discountText: string | null;
  benefit: string | null;
  urlWebsite: string | null;
  urlNotLoggedIn: string | null;
};

export async function fetchBbl(input: FetchBblInput): Promise<CashbackOffer[]> {
  input.logger.info(`Fetching BBL member benefits from ${input.pageUrl}`);

  const response = await gotScraping(input.pageUrl, {
    responseType: "text",
    throwHttpErrors: false,
    timeout: { request: 30_000 },
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(
      `BBL page returned ${response.statusCode}: ${response.statusMessage}`,
    );
  }

  const contracts = readContracts(response.body);

  if (contracts.length === 0) {
    throw new Error("BBL page contained no contracts");
  }

  const national = contracts.filter((c) => c.contractType === "National");
  input.logger.info(`BBL: ${contracts.length} contracts, ${national.length} national`);

  const offers: CashbackOffer[] = [];

  for (const contract of national) {
    const merchantName = contract.name.trim();
    const bonusRate = Number.parseFloat(String(contract.bonusRate ?? "0"));
    const discountText = (contract.discountText ?? "").trim();
    const benefitText = stripHtml(contract.benefit ?? "");

    let reward = "";
    if (Number.isFinite(bonusRate) && bonusRate > 0) {
      reward = formatPercentageReward([bonusRate]);
    } else {
      reward = extractBenefitReward(`${discountText}\n${benefitText}`);
    }

    if (reward === "") {
      input.logger.info(`BBL: no parseable reward for ${merchantName}, skipping`);
      continue;
    }

    const domain = await resolveContractDomain(contract, input.logger);

    if (domain === undefined) {
      input.logger.warn(`BBL: no domain for ${merchantName}, skipping`);
      continue;
    }

    const slug = merchantName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const overrideDomains = (input.overrides["bbl"] ?? {})[slug];
    const domains = overrideDomains !== undefined && overrideDomains.length > 0
      ? overrideDomains
      : [domain];

    const termsParts = [
      contract.bonusText?.trim() !== "" && contract.bonusText != null ? `Bonus: ${contract.bonusText.trim()}` : "",
      discountText !== "" ? `Rabatt: ${discountText}` : "",
      DEFAULT_TERMS,
    ].filter((part) => part !== "");

    offers.push({
      provider: "bbl",
      merchantName,
      domains,
      reward,
      sourceUrl: input.pageUrl,
      activationUrl: input.pageUrl,
      terms: termsParts.join("\n"),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`Found ${offers.length} BBL offers with domains`);
  return offers;
}

const TRACKING_HOSTS = /(^|\.)adtraction\.com$|(^|\.)adt\d*\.com$/;

async function resolveContractDomain(
  contract: BblContract,
  logger: Logger,
): Promise<string | undefined> {
  const rawUrl = (contract.urlWebsite ?? contract.urlNotLoggedIn ?? "").trim();

  if (rawUrl === "") {
    return undefined;
  }

  const parsed = parseUrl(rawUrl.includes("://") ? rawUrl : `https://${rawUrl}`);

  if (parsed === undefined) {
    return undefined;
  }

  const hostname = normalizeDomainInput(parsed.hostname);

  if (!TRACKING_HOSTS.test(hostname)) {
    // Adtraction links often live on merchant subdomains (in.skogstadsport.no)
    return toBaseDomain(hostname);
  }

  // Generic tracking host: follow the redirect to the merchant
  try {
    const response = await gotScraping(rawUrl, {
      method: "HEAD",
      followRedirect: false,
      responseType: "text",
      throwHttpErrors: false,
      timeout: { request: 8_000 },
    });
    const location = Array.isArray(response.headers.location)
      ? response.headers.location[0]
      : response.headers.location;

    if (location !== undefined) {
      const resolved = parseUrl(location) ?? parseUrl(new URL(location, rawUrl).toString());
      if (resolved !== undefined) {
        return toBaseDomain(normalizeDomainInput(resolved.hostname));
      }
    }
  } catch {
    logger.warn(`BBL: failed to resolve tracking link for ${contract.name}`);
  }

  return undefined;
}

function readContracts(body: string): BblContract[] {
  const match = body.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );

  if (match === null) {
    return [];
  }

  try {
    const data: unknown = JSON.parse(match[1] ?? "");
    const contracts = (((data as Record<string, unknown>).props as Record<string, unknown>)
      ?.pageProps as Record<string, unknown>)
      ?.propsInitialBblContracts as Record<string, unknown> | undefined;
    const list = contracts?.contracts;
    return Array.isArray(list) ? (list as BblContract[]) : [];
  } catch {
    return [];
  }
}
