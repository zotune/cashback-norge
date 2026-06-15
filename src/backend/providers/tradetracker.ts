// TradeTracker's affiliate API is SOAP/cookie based. Only public merchant
// metadata and affiliate click links are written to the index.
import { readFile } from "node:fs/promises";
import {
  type CashbackOffer,
  normalizeDomainInput,
  stripHtml,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import type { Logger } from "../logger.js";

const API_URL = "https://ws.tradetracker.com/soap/affiliate";
const SOAP_NAMESPACE = "https://ws.tradetracker.com/soap/affiliate";
const CUSTOMER_ID_ENV_KEYS = [
  "TRADETRACKER_CUSTOMER_ID",
  "TRADETRACKER_CUSTOMERID",
  "TRADETRACKER_API_CUSTOMER_ID",
];
const PASSPHRASE_ENV_KEYS = [
  "TRADETRACKER_PASSPHRASE",
  "TRADETRACKER_API_KEY",
  "TRADETRACKER_API_PASSPHRASE",
];
const SITE_IDS_ENV_KEYS = [
  "TRADETRACKER_AFFILIATE_SITE_IDS",
  "TRADETRACKER_SITE_IDS",
];
const CHARITY_SHARE_OF_COMMISSION = 0.1;
const PAGE_LIMIT = 100;

const CAMPAIGN_DOMAIN_OVERRIDES: Record<string, string[]> = {
  "19888": ["aliexpress.com"],
  "ali express": ["aliexpress.com"],
  aliexpress: ["aliexpress.com"],
  "28120": ["elektroimportoren.no"],
  "elektroimportøren": ["elektroimportoren.no"],
  "elektroimportøren.no": ["elektroimportoren.no"],
};

export type FetchTradeTrackerInput = {
  apiUrl?: string;
  customerID?: string;
  passphrase?: string;
  affiliateSiteIDs?: string[];
  generatedAt: string;
  logger: Logger;
  locale?: string;
};

type TradeTrackerCredentials = {
  customerID: string;
  passphrase: string;
};

type TradeTrackerAffiliateSite = {
  ID: string;
  name: string;
  URL: string;
  status: string;
};

type TradeTrackerCampaign = {
  ID: string;
  name: string;
  URL: string;
  assignmentStatus: string;
  trackingURL: string;
  category: string;
  startDate: string;
  stopDate: string;
  campaignDescription: string;
  shopDescription: string;
  targetGroup: string;
  characteristics: string;
  policyCashbackStatus: string;
  policyDiscountCodeStatus: string;
  commission: TradeTrackerCommission;
};

type TradeTrackerCommission = {
  impressionCommission: number;
  clickCommission: number;
  fixedCommission: number;
  leadCommission: number;
  saleCommissionFixed: number;
  saleCommissionVariable: number;
  iLeadCommission: number;
  iSaleCommissionFixed: number;
  iSaleCommissionVariable: number;
  products?: TradeTrackerCommissionProduct[];
};

type TradeTrackerCommissionProduct = {
  name: string;
  leadCommission: number;
  saleCommissionFixed: number;
  saleCommissionVariable: number;
  iLeadCommission: number;
  iSaleCommissionFixed: number;
  iSaleCommissionVariable: number;
  guaranteedCommissionLead: number;
  guaranteedCommissionSalesVariable: number;
  guaranteedCommissionSalesFixed: number;
};

type SoapResponse = {
  cookie?: string;
  text: string;
};

export async function fetchTradeTracker(
  input: FetchTradeTrackerInput,
): Promise<CashbackOffer[]> {
  const credentials = await readTradeTrackerCredentials(input);
  if (credentials === undefined) {
    input.logger.warn(
      `TradeTracker: ${CUSTOMER_ID_ENV_KEYS[0]} or ${PASSPHRASE_ENV_KEYS[0]} is missing, skipping`,
    );
    return [];
  }

  input.logger.info("TradeTracker: authenticating...");

  const apiUrl = input.apiUrl ?? API_URL;
  const cookie = await authenticateTradeTracker(apiUrl, credentials, input.locale ?? "nb_NO");
  const siteIDs = uniqueStrings([
    ...(input.affiliateSiteIDs ?? []),
    ...await readConfiguredSiteIDs(),
  ]);

  const affiliateSites = siteIDs.length > 0
    ? siteIDs.map((ID) => ({ ID, name: "", URL: "", status: "configured" }))
    : await fetchAcceptedAffiliateSites(apiUrl, cookie);

  if (affiliateSites.length === 0) {
    input.logger.warn("TradeTracker: no accepted affiliate sites found");
    return [];
  }

  input.logger.info(
    `TradeTracker: fetching accepted campaigns for ${affiliateSites.length} site(s)...`,
  );

  const offers: CashbackOffer[] = [];
  let skippedNoDomain = 0;
  let skippedNoTrackingUrl = 0;
  let skippedNoReward = 0;
  let skippedSecretLink = 0;
  let skippedInactive = 0;

  for (const site of affiliateSites) {
    const campaigns = await fetchAcceptedCampaigns(apiUrl, cookie, site.ID);
    input.logger.info(
      `TradeTracker: site ${site.ID} returned ${campaigns.length} accepted campaign(s)`,
    );

    for (const campaign of campaigns) {
      if (!isCampaignActive(campaign, input.generatedAt)) {
        skippedInactive++;
        continue;
      }

      const domains = selectCampaignDomains(campaign);
      if (domains.length === 0) {
        skippedNoDomain++;
        input.logger.warn(
          `TradeTracker: no exact domain for ${campaign.name} (${campaign.ID})`,
        );
        continue;
      }

      const activationUrl = normalizeActivationUrl(campaign.trackingURL);
      if (activationUrl === undefined) {
        skippedNoTrackingUrl++;
        continue;
      }

      if (activationUrl.includes(credentials.passphrase)) {
        skippedSecretLink++;
        continue;
      }

      const extendedCommission = await fetchCampaignCommissionExtended(
        apiUrl,
        cookie,
        site.ID,
        campaign.ID,
        input.logger,
      );
      const commission = extendedCommission ?? campaign.commission;
      const reward = buildSupportReward(commission);
      if (!reward) {
        skippedNoReward++;
        continue;
      }

      offers.push({
        provider: "cbn",
        merchantName: cleanMerchantName(campaign.name),
        domains,
        reward,
        sourceUrl: normalizeMerchantUrl(campaign.URL) ?? `https://${domains[0]}`,
        activationUrl,
        terms: buildTerms(campaign, commission),
        updatedAt: input.generatedAt,
      });
    }
  }

  input.logger.info(
    `TradeTracker: produced ${offers.length} support offers` +
      ` (${skippedNoDomain} no domain, ${skippedNoReward} no reward,` +
      ` ${skippedNoTrackingUrl} no tracking URL, ${skippedSecretLink} secret-link skips,` +
      ` ${skippedInactive} inactive)`,
  );

  return uniqueOffers(offers);
}

export function parseTradeTrackerAffiliateSitesXml(
  xml: string,
): TradeTrackerAffiliateSite[] {
  return readCollectionItems(xml, "affiliateSites")
    .map(parseAffiliateSite)
    .filter((site) => site.ID.length > 0);
}

export function parseTradeTrackerCampaignsXml(xml: string): TradeTrackerCampaign[] {
  return readCollectionItems(xml, "campaigns")
    .map(parseCampaign)
    .filter((campaign) => campaign.ID.length > 0 && campaign.name.length > 0);
}

export function parseTradeTrackerCommissionExtendedXml(
  xml: string,
): TradeTrackerCommission | undefined {
  const block = readXmlElement(xml, "campaignCommissionExtended");
  return block === "" ? undefined : parseCommission(block);
}

async function readTradeTrackerCredentials(
  input: FetchTradeTrackerInput,
): Promise<TradeTrackerCredentials | undefined> {
  const customerID = input.customerID ?? await readFirstConfiguredValue(CUSTOMER_ID_ENV_KEYS);
  const passphrase = input.passphrase ?? await readFirstConfiguredValue(PASSPHRASE_ENV_KEYS);

  if (!customerID || !passphrase) {
    return undefined;
  }

  return {
    customerID,
    passphrase,
  };
}

async function readConfiguredSiteIDs(): Promise<string[]> {
  const value = await readFirstConfiguredValue(SITE_IDS_ENV_KEYS);
  if (!value) return [];

  return value
    .split(/[,\s]+/)
    .map((siteID) => siteID.trim())
    .filter((siteID) => /^\d+$/.test(siteID));
}

async function readFirstConfiguredValue(keys: string[]): Promise<string> {
  for (const key of keys) {
    const envValue = process.env[key]?.trim();
    if (envValue) return stripEnvQuotes(envValue);
  }

  let envFile = "";
  try {
    envFile = await readFile(".env", "utf8");
  } catch {
    return "";
  }

  for (const key of keys) {
    const line = envFile
      .split(/\r?\n/)
      .find((candidate) => candidate.trimStart().startsWith(`${key}=`));
    const value = line?.split("=").slice(1).join("=").trim();
    if (value) return stripEnvQuotes(value);
  }

  return "";
}

function stripEnvQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

async function authenticateTradeTracker(
  apiUrl: string,
  credentials: TradeTrackerCredentials,
  locale: string,
): Promise<string> {
  const response = await callSoap(apiUrl, "authenticate", [
    xmlTag("customerID", credentials.customerID),
    xmlTag("passphrase", credentials.passphrase),
    xmlTag("sandbox", "false"),
    xmlTag("locale", locale),
    xmlTag("demo", "false"),
  ].join(""));

  if (response.cookie === undefined) {
    throw new Error("TradeTracker authentication did not return a session cookie");
  }

  return response.cookie;
}

async function fetchAcceptedAffiliateSites(
  apiUrl: string,
  cookie: string,
): Promise<TradeTrackerAffiliateSite[]> {
  const response = await callSoap(apiUrl, "getAffiliateSites", [
    "<options>",
    xmlTag("affiliateSiteStatus", "accepted"),
    xmlTag("limit", "500"),
    xmlTag("offset", "0"),
    "</options>",
  ].join(""), cookie);

  return parseTradeTrackerAffiliateSitesXml(response.text)
    .filter((site) => site.status === "" || site.status === "accepted");
}

async function fetchAcceptedCampaigns(
  apiUrl: string,
  cookie: string,
  affiliateSiteID: string,
): Promise<TradeTrackerCampaign[]> {
  const campaigns: TradeTrackerCampaign[] = [];

  for (let offset = 0; ; offset += PAGE_LIMIT) {
    const response = await callSoap(apiUrl, "getCampaigns", [
      xmlTag("affiliateSiteID", affiliateSiteID),
      "<options>",
      xmlTag("assignmentStatus", "accepted"),
      xmlTag("limit", String(PAGE_LIMIT)),
      xmlTag("offset", String(offset)),
      "</options>",
    ].join(""), cookie);
    const page = parseTradeTrackerCampaignsXml(response.text)
      .filter((campaign) => campaign.assignmentStatus === "accepted");
    campaigns.push(...page);

    if (page.length < PAGE_LIMIT) {
      break;
    }
  }

  return campaigns;
}

async function fetchCampaignCommissionExtended(
  apiUrl: string,
  cookie: string,
  affiliateSiteID: string,
  campaignID: string,
  logger: Logger,
): Promise<TradeTrackerCommission | undefined> {
  try {
    const response = await callSoap(apiUrl, "getCampaignCommissionExtended", [
      xmlTag("affiliateSiteID", affiliateSiteID),
      xmlTag("campaignID", campaignID),
    ].join(""), cookie);

    return parseTradeTrackerCommissionExtendedXml(response.text);
  } catch (error) {
    logger.warn(
      `TradeTracker: extended commission unavailable for campaign ${campaignID}: ${formatError(error)}`,
    );
    return undefined;
  }
}

async function callSoap(
  apiUrl: string,
  operation: string,
  operationBody: string,
  cookie?: string,
): Promise<SoapResponse> {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: `${SOAP_NAMESPACE}/${operation}`,
      "User-Agent": "CashbackNorgeCrawler/1.0",
      ...(cookie !== undefined ? { Cookie: cookie } : {}),
    },
    body: buildSoapEnvelope(operation, operationBody),
    signal: AbortSignal.timeout(30_000),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`SOAP ${operation} returned HTTP ${response.status}`);
  }

  const fault = readSoapFault(text);
  if (fault !== "") {
    throw new Error(`SOAP ${operation} fault: ${fault}`);
  }

  const sessionCookie = readSessionCookie(response.headers);
  return sessionCookie === undefined
    ? { text }
    : { cookie: sessionCookie, text };
}

function buildSoapEnvelope(operation: string, operationBody: string): string {
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<soap-env:Envelope",
    " xmlns:soap-env=\"http://schemas.xmlsoap.org/soap/envelope/\"",
    " xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\"",
    ` xmlns:tns="${SOAP_NAMESPACE}">`,
    "<soap-env:Body>",
    `<tns:${operation}>`,
    operationBody,
    `</tns:${operation}>`,
    "</soap-env:Body>",
    "</soap-env:Envelope>",
  ].join("");
}

function readSessionCookie(headers: Headers): string | undefined {
  const setCookie = headers.get("set-cookie");
  const cookie = setCookie?.split(",").find((part) => /\bSID=/.test(part)) ?? setCookie;
  return cookie?.split(";")[0]?.trim() || undefined;
}

function readSoapFault(xml: string): string {
  const fault = readXmlElement(xml, "SOAP-ENV:Fault") || readXmlElement(xml, "Fault");
  if (fault === "") return "";

  return readXmlTag(fault, "faultstring") || cleanText(fault);
}

function parseAffiliateSite(block: string): TradeTrackerAffiliateSite {
  const info = readXmlElement(block, "info");
  return {
    ID: readXmlTag(block, "ID"),
    name: readXmlTag(block, "name"),
    URL: readXmlTag(block, "URL"),
    status: readXmlTag(info, "status"),
  };
}

function parseCampaign(block: string): TradeTrackerCampaign {
  const info = readXmlElement(block, "info");
  return {
    ID: readXmlTag(block, "ID"),
    name: readXmlTag(block, "name"),
    URL: readXmlTag(block, "URL"),
    assignmentStatus: readXmlTag(info, "assignmentStatus"),
    trackingURL: readXmlTag(info, "trackingURL"),
    category: readXmlTag(readXmlElement(info, "category"), "name"),
    startDate: readXmlTag(info, "startDate"),
    stopDate: readXmlTag(info, "stopDate"),
    campaignDescription: readXmlTag(info, "campaignDescription"),
    shopDescription: readXmlTag(info, "shopDescription"),
    targetGroup: readXmlTag(info, "targetGroup"),
    characteristics: readXmlTag(info, "characteristics"),
    policyCashbackStatus: readXmlTag(info, "policyCashbackStatus"),
    policyDiscountCodeStatus: readXmlTag(info, "policyDiscountCodeStatus"),
    commission: parseCommission(readXmlElement(info, "commission")),
  };
}

function parseCommission(block: string): TradeTrackerCommission {
  const productsBlock = readXmlElement(block, "products");
  const directBlock = block.replace(/<products\b[^>]*>[\s\S]*?<\/products>/i, "");
  const products = readTopLevelElements(productsBlock, "item")
    .map(parseCommissionProduct);
  const commission: TradeTrackerCommission = {
    impressionCommission: readXmlNumber(directBlock, "impressionCommission"),
    clickCommission: readXmlNumber(directBlock, "clickCommission"),
    fixedCommission: readXmlNumber(directBlock, "fixedCommission"),
    leadCommission: readXmlNumber(directBlock, "leadCommission"),
    saleCommissionFixed: readXmlNumber(directBlock, "saleCommissionFixed"),
    saleCommissionVariable: readXmlNumber(directBlock, "saleCommissionVariable"),
    iLeadCommission: readXmlNumber(directBlock, "iLeadCommission"),
    iSaleCommissionFixed: readXmlNumber(directBlock, "iSaleCommissionFixed"),
    iSaleCommissionVariable: readXmlNumber(directBlock, "iSaleCommissionVariable"),
  };

  if (products.length > 0) {
    commission.products = products;
  }

  return commission;
}

function parseCommissionProduct(block: string): TradeTrackerCommissionProduct {
  const campaignProduct = readXmlElement(block, "campaignProduct");
  return {
    name: readXmlTag(campaignProduct, "name"),
    leadCommission: readXmlNumber(block, "leadCommission"),
    saleCommissionFixed: readXmlNumber(block, "saleCommissionFixed"),
    saleCommissionVariable: readXmlNumber(block, "saleCommissionVariable"),
    iLeadCommission: readXmlNumber(block, "iLeadCommission"),
    iSaleCommissionFixed: readXmlNumber(block, "iSaleCommissionFixed"),
    iSaleCommissionVariable: readXmlNumber(block, "iSaleCommissionVariable"),
    guaranteedCommissionLead: readXmlNumber(block, "guaranteedCommissionLead"),
    guaranteedCommissionSalesVariable: readXmlNumber(block, "guaranteedCommissionSalesVariable"),
    guaranteedCommissionSalesFixed: readXmlNumber(block, "guaranteedCommissionSalesFixed"),
  };
}

function readCollectionItems(xml: string, collectionTagName: string): string[] {
  const collection = readXmlElement(xml, collectionTagName);
  if (collection === "") return [];

  return readTopLevelElements(collection, "item");
}

function readTopLevelElements(xml: string, tagName: string): string[] {
  const tags = [...xml.matchAll(new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi"))];
  const elements: string[] = [];
  let startIndex = -1;
  let depth = 0;

  for (const match of tags) {
    const tag = match[0] ?? "";
    const index = match.index ?? -1;
    const isClosing = tag.startsWith("</");
    const isSelfClosing = tag.endsWith("/>");

    if (!isClosing) {
      if (depth === 0) {
        startIndex = index;
      }
      if (!isSelfClosing) {
        depth++;
      }
      continue;
    }

    depth--;
    if (depth === 0 && startIndex >= 0) {
      elements.push(xml.slice(startIndex, index + tag.length));
      startIndex = -1;
    }
  }

  return elements;
}

function readXmlElement(block: string, tagName: string): string {
  const pattern = new RegExp(
    `<(?:[\\w-]+:)?${escapeRegExp(tagName.replace(/^[\w-]+:/, ""))}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${escapeRegExp(tagName.replace(/^[\w-]+:/, ""))}>`,
    "i",
  );
  return block.match(pattern)?.[1] ?? "";
}

function readXmlTag(block: string, tagName: string): string {
  const value = readXmlElement(block, tagName);
  return decodeXml(stripCdata(value))
    .replace(/\s+/g, " ")
    .trim();
}

function readXmlNumber(block: string, tagName: string): number {
  const value = readXmlTag(block, tagName).replace(",", ".");
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function xmlTag(tagName: string, value: string): string {
  return `<${tagName}>${escapeXml(value)}</${tagName}>`;
}

function stripCdata(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("<![CDATA[") && trimmed.endsWith("]]>")) {
    return trimmed.slice("<![CDATA[".length, -"]]>".length);
  }

  return value;
}

function decodeXml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, codePoint: string) => {
      return String.fromCodePoint(Number.parseInt(codePoint, 10));
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, codePoint: string) => {
      return String.fromCodePoint(Number.parseInt(codePoint, 16));
    })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function selectCampaignDomains(campaign: TradeTrackerCampaign): string[] {
  const overrideKey = normalizeCampaignKey(campaign.name);
  const overrideDomains = [
    ...(CAMPAIGN_DOMAIN_OVERRIDES[campaign.ID] ?? []),
    ...(CAMPAIGN_DOMAIN_OVERRIDES[overrideKey] ?? []),
  ];
  if (overrideDomains.length > 0) {
    return uniqueStrings(overrideDomains.map(normalizeDomainInput));
  }

  const domain = extractMerchantDomain(campaign.URL);
  return domain === undefined ? [] : [domain];
}

function isCampaignActive(campaign: TradeTrackerCampaign, generatedAt: string): boolean {
  const now = Date.parse(generatedAt);
  if (!Number.isFinite(now)) return true;

  const startDate = parseTradeTrackerDate(campaign.startDate, "start");
  if (startDate !== undefined && startDate.getTime() > now) {
    return false;
  }

  const stopDate = parseTradeTrackerDate(campaign.stopDate, "stop");
  if (stopDate !== undefined && stopDate.getTime() < now) {
    return false;
  }

  return true;
}

function parseTradeTrackerDate(
  value: string,
  boundary: "start" | "stop",
): Date | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;

  const timestamp = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? Date.parse(`${trimmed}T${boundary === "start" ? "00:00:00" : "23:59:59"}Z`)
    : Date.parse(trimmed);

  return Number.isFinite(timestamp) ? new Date(timestamp) : undefined;
}

function extractMerchantDomain(url: string): string | undefined {
  if (!url) return undefined;

  const domain = normalizeDomainInput(url);
  if (
    !domain.includes(".") ||
    domain === "tradetracker.com" ||
    domain === "tradetracker.net" ||
    domain.endsWith(".tradetracker.net")
  ) {
    return undefined;
  }

  return domain;
}

function normalizeMerchantUrl(url: string): string | undefined {
  try {
    const parsedUrl = new URL(url.includes("://") ? url : `https://${url}`);
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return undefined;
    }

    return parsedUrl.toString();
  } catch {
    return undefined;
  }
}

function normalizeActivationUrl(url: string): string | undefined {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return undefined;
    }

    return parsedUrl.toString();
  } catch {
    return undefined;
  }
}

function buildSupportReward(commission: TradeTrackerCommission): string {
  const salePercentValues = uniqueNumbers([
    commission.saleCommissionVariable,
    ...(commission.products ?? []).map((product) => product.saleCommissionVariable),
  ]).filter((value) => value > 0 && value <= 100);
  if (salePercentValues.length > 0) {
    return formatPercentRange(salePercentValues);
  }

  const saleFixedValues = uniqueNumbers([
    commission.saleCommissionFixed,
    ...(commission.products ?? []).map((product) => product.saleCommissionFixed),
  ]).filter((value) => value > 0);
  if (saleFixedValues.length > 0) {
    return `${formatNumberRange(saleFixedValues)} kr`;
  }

  const leadValues = uniqueNumbers([
    commission.leadCommission,
    commission.fixedCommission,
    ...(commission.products ?? []).map((product) => product.leadCommission),
  ]).filter((value) => value > 0);
  if (leadValues.length > 0) {
    return `${formatNumberRange(leadValues)} kr`;
  }

  const clickValues = uniqueNumbers([commission.clickCommission])
    .filter((value) => value > 0);
  if (clickValues.length > 0) {
    return `${formatNumberRange(clickValues)} kr`;
  }

  return "Veldedighet";
}

function buildTerms(
  campaign: TradeTrackerCampaign,
  commission: TradeTrackerCommission,
): string {
  const lines = [
    "Annonselenke via TradeTracker.",
    "Dette er ikke cashback utbetalt til deg.",
    "Tallet viser provisjonen CashbackNorge kan få.",
    "Det koster deg ingenting ekstra å bruke lenken.",
    `${formatPercent(CHARITY_SHARE_OF_COMMISSION * 100)} av provisjonen settes av til veldedighet.`,
    buildCharityExampleLine(commission),
    "Resten går til drift og videreutvikling av CashbackNorge.",
    "Veldedighetstotalen oppdateres på cashbacknorge.no.",
  ];

  const descriptions = [
    campaign.campaignDescription,
    campaign.shopDescription,
    campaign.targetGroup,
    campaign.characteristics,
  ].map(cleanText).filter(Boolean);
  const extraText = uniquePreserveOrder(descriptions).join(" ");
  if (extraText) lines.push(truncateText(extraText, 220));

  return uniquePreserveOrder(lines).join("\n");
}

function buildCharityExampleLine(commission: TradeTrackerCommission): string {
  const salePercentValues = uniqueNumbers([
    commission.saleCommissionVariable,
    ...(commission.products ?? []).map((product) => product.saleCommissionVariable),
  ]).filter((value) => value > 0 && value <= 100);
  if (salePercentValues.length > 0) {
    return `Denne butikken: ${formatPercentRange(salePercentValues)} provisjon x ${formatPercent(CHARITY_SHARE_OF_COMMISSION * 100)} = ca. ${formatPercentRange(scaleValues(salePercentValues, CHARITY_SHARE_OF_COMMISSION))} av kjøpet til veldedighet.`;
  }

  const saleFixedValues = uniqueNumbers([
    commission.saleCommissionFixed,
    ...(commission.products ?? []).map((product) => product.saleCommissionFixed),
  ]).filter((value) => value > 0);
  if (saleFixedValues.length > 0) {
    return `Denne butikken: ${formatNumberRange(saleFixedValues)} kr provisjon x ${formatPercent(CHARITY_SHARE_OF_COMMISSION * 100)} = ca. ${formatNumberRange(scaleValues(saleFixedValues, CHARITY_SHARE_OF_COMMISSION))} kr til veldedighet.`;
  }

  const leadValues = uniqueNumbers([
    commission.leadCommission,
    commission.fixedCommission,
    ...(commission.products ?? []).map((product) => product.leadCommission),
  ]).filter((value) => value > 0);
  if (leadValues.length > 0) {
    return `Denne butikken: ${formatNumberRange(leadValues)} kr provisjon x ${formatPercent(CHARITY_SHARE_OF_COMMISSION * 100)} = ca. ${formatNumberRange(scaleValues(leadValues, CHARITY_SHARE_OF_COMMISSION))} kr til veldedighet.`;
  }

  return "Eksakt provisjon varierer eller mangler i TradeTracker-data.";
}

function buildCommissionSummary(commission: TradeTrackerCommission): string {
  const parts: string[] = [];
  const salePercentValues = uniqueNumbers([
    commission.saleCommissionVariable,
    ...(commission.products ?? []).map((product) => product.saleCommissionVariable),
  ]).filter((value) => value > 0 && value <= 100);
  if (salePercentValues.length > 0) {
    parts.push(`Salg: ${formatPercentRange(salePercentValues)}`);
  }

  const saleFixedValues = uniqueNumbers([
    commission.saleCommissionFixed,
    ...(commission.products ?? []).map((product) => product.saleCommissionFixed),
  ]).filter((value) => value > 0);
  if (saleFixedValues.length > 0) {
    parts.push(`Fast salg: ${formatNumberRange(saleFixedValues)} kr`);
  }

  const leadValues = uniqueNumbers([
    commission.leadCommission,
    commission.fixedCommission,
    ...(commission.products ?? []).map((product) => product.leadCommission),
  ]).filter((value) => value > 0);
  if (leadValues.length > 0) {
    parts.push(`Lead/fast: ${formatNumberRange(leadValues)} kr`);
  }

  return parts.length === 0 ? "" : `Provisjon hos TradeTracker: ${parts.join(", ")}.`;
}

function scaleValues(values: number[], scale: number): number[] {
  return values.map((value) => value * scale);
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isFinite(value)))];
}

function formatPercentRange(values: number[]): string {
  return `${formatNumberRange(values)} %`;
}

function formatNumberRange(values: number[]): string {
  if (values.length === 0) return "";

  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max
    ? formatRewardNumber(max)
    : `${formatRewardNumber(min)}-${formatRewardNumber(max)}`;
}

function formatPercent(value: number): string {
  return `${formatRewardNumber(value)} %`;
}

function formatRewardNumber(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString("nb-NO").replace(/[\u00a0\u202f]/g, " ")
    : value.toLocaleString("nb-NO", { maximumFractionDigits: 2 }).replace(/[\u00a0\u202f]/g, " ");
}

function cleanText(value: string): string {
  return stripHtml(value)
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}...`;
}

function uniquePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }

  return unique;
}

function cleanMerchantName(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+\|\s+TradeTracker$/i, "")
    .trim();
}

function normalizeCampaignKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
