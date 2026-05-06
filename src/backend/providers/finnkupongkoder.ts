import {
  CheerioCrawler,
  type CheerioCrawlingContext,
  Configuration,
  MemoryStorage,
  ProxyConfiguration,
} from "crawlee";
import {
  type CashbackOffer,
  normalizeDomainInput,
  parseUrl,
  uniqueOffers,
} from "../../shared/cashback.js";
import { extractKrReward, extractPercentageReward } from "../../shared/reward.js";
import type { Logger } from "../logger.js";

type FinnkupongkoderCheerio = CheerioCrawlingContext["$"];
type FinnkupongkoderElement = Parameters<FinnkupongkoderCheerio>[0];

const CODE_KEY = "22c8254afb65e1093b1e254c7e9fee46e9ed27cf";

// Domains that finnkupongkoder stores with wrong TLD
const DOMAIN_CORRECTIONS: Record<string, string> = {
  "scandichotels.no": "scandichotels.com",
};

export type CrawlFinnkupongkoderInput = {
  startUrl: string;
  maxRequestsPerCrawl: number;
  generatedAt: string;
  logger: Logger;
  proxyUrl?: string;
};

type ParseResult = {
  offers: CashbackOffer[];
  visibleOfferCount: number;
  maskedCodeCount: number;
};

type FinnkupongkoderCrawlResult = {
  offers: CashbackOffer[];
  visibleOfferCount: number;
  maskedCodeCount: number;
  blocked: boolean;
};

async function runFinnkupongkoderCrawl(
  input: CrawlFinnkupongkoderInput,
  proxyUrl?: string,
): Promise<FinnkupongkoderCrawlResult> {
  const rawOffers: CashbackOffer[] = [];
  let visibleOfferCount = 0;
  let maskedCodeCount = 0;
  let blockedByCloudflare = false;

  const storage = new MemoryStorage({ persistStorage: false });
  const config = new Configuration();
  config.useStorageClient(storage);

  const proxyConfiguration = proxyUrl
    ? new ProxyConfiguration({ proxyUrls: [proxyUrl] })
    : undefined;

  const crawler = new CheerioCrawler({
    maxRequestRetries: 0,
    maxRequestsPerCrawl: input.maxRequestsPerCrawl,
    ...(proxyConfiguration ? { proxyConfiguration } : {}),
    requestHandler: async ({ $, request }) => {
      const loadedUrl = request.loadedUrl ?? request.url;

      if (isCloudflareBlock($)) {
        blockedByCloudflare = true;
        return;
      }

      const result = parseFinnkupongkoderPage(
        $,
        loadedUrl,
        input.generatedAt,
      );
      rawOffers.push(...result.offers);
      visibleOfferCount += result.visibleOfferCount;
      maskedCodeCount += result.maskedCodeCount;
    },
    failedRequestHandler: async ({ request, error }) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message.includes("403") || message.includes("blocked")) {
        blockedByCloudflare = true;
        return;
      }
      input.logger.warn(
        `FinnKupongkoder: could not fetch ${request.url}: ${message}`,
      );
    },
  }, config);

  await crawler.run([input.startUrl]);

  return { offers: rawOffers, visibleOfferCount, maskedCodeCount, blocked: blockedByCloudflare };
}

export async function crawlFinnkupongkoder(
  input: CrawlFinnkupongkoderInput,
): Promise<CashbackOffer[]> {
  let result = await runFinnkupongkoderCrawl(input);

  if (result.blocked && input.proxyUrl) {
    input.logger.info("FinnKupongkoder: blocked, retrying via proxy");
    result = await runFinnkupongkoderCrawl(input, input.proxyUrl);
  }

  if (result.blocked) {
    input.logger.warn(
      "FinnKupongkoder: Cloudflare returned a block page; skipping this source.",
    );
  }

  input.logger.info(
    `FinnKupongkoder: ${result.visibleOfferCount} visible offers, ${result.maskedCodeCount} masked codes, ${result.offers.length} usable full codes`,
  );

  return uniqueOffers(result.offers);
}

function parseFinnkupongkoderPage(
  $: FinnkupongkoderCheerio,
  pageUrl: string,
  generatedAt: string,
): ParseResult {
  const modalResult = parseFinnkupongkoderDataModals($, pageUrl, generatedAt);

  if (modalResult.visibleOfferCount > 0) {
    return modalResult;
  }

  const offers: CashbackOffer[] = [];
  let visibleOfferCount = 0;
  let maskedCodeCount = 0;

  $("h3, h4").each((_i, heading) => {
    const title = normalizeText($(heading).text());

    if (!isLikelyOfferTitle(title)) {
      return;
    }

    const container = findOfferContainer($, heading);
    const containerText = normalizeText(container.text());

    if (!containsOfferCallToAction(containerText)) {
      return;
    }

    visibleOfferCount += 1;

    if (hasMaskedCode(containerText)) {
      maskedCodeCount += 1;
    }

    const discountCode = extractFullDiscountCode(containerText);

    if (discountCode === undefined) {
      return;
    }

    const sourceUrl = extractStoreUrl($, container, pageUrl) ?? pageUrl;
    const domain = extractDomainFromStoreUrl(sourceUrl);

    if (domain === undefined) {
      return;
    }

    offers.push({
      provider: "rabattkode",
      merchantName: extractMerchantName($, container, title, domain),
      domains: [domain],
      reward: extractReward(containerText, title),
      sourceUrl,
      activationUrl: sourceUrl,
      discountCode,
      terms: extractTerms(containerText, title),
      updatedAt: generatedAt,
    });
  });

  return {
    offers,
    visibleOfferCount,
    maskedCodeCount,
  };
}

function parseFinnkupongkoderDataModals(
  $: FinnkupongkoderCheerio,
  pageUrl: string,
  generatedAt: string,
): ParseResult {
  const offers: CashbackOffer[] = [];
  let visibleOfferCount = 0;
  let maskedCodeCount = 0;

  $("[data-modal]").each((_i, element) => {
    const entry = $(element);
    const modal = parseJsonRecord(entry.attr("data-modal") ?? "");

    if (modal === undefined) {
      return;
    }

    visibleOfferCount += 1;

    const maskedCode = normalizeText(entry.find(".js-cd").first().text());
    if (hasMaskedCode(maskedCode)) {
      maskedCodeCount += 1;
    }

    const encodedCode = readString(modal["entry.code"]);
    const discountCode = decodeFinnkupongkoderCode(encodedCode);

    if (
      discountCode === undefined ||
      !isDiscountCodeToken(discountCode)
    ) {
      return;
    }

    const rawDomain =
      entry.attr("data-dm") ?? readString(modal["entry.signupFormDomain"]);

    if (rawDomain.length === 0) {
      return;
    }

    const domain = DOMAIN_CORRECTIONS[normalizeDomainInput(rawDomain)] ?? normalizeDomainInput(rawDomain);
    const title =
      stripHtml(readString(modal["entry.title"])) ||
      stripHtml(entry.attr("data-title") ?? "");
    const sourceUrl =
      extractStoreUrl($, entry, pageUrl) ??
      parseUrlWithBase(`/butikk/${domain}`, pageUrl)?.toString() ??
      pageUrl;
    const merchantName =
      readString(modal["merchant.name"]) ||
      extractMerchantName($, entry, title, domain);
    const text = normalizeText(entry.text());

    offers.push({
      provider: "rabattkode",
      merchantName,
      domains: [domain],
      reward: extractReward(text, title),
      sourceUrl,
      activationUrl: sourceUrl,
      discountCode,
      terms: extractModalTerms(modal, title),
      updatedAt: generatedAt,
    });
  });

  return {
    offers,
    visibleOfferCount,
    maskedCodeCount,
  };
}

function isCloudflareBlock($: FinnkupongkoderCheerio): boolean {
  const title = normalizeText($("title").first().text());
  const bodyText = normalizeText($("body").text());

  return (
    title.includes("Attention Required") &&
    bodyText.includes("Cloudflare") &&
    bodyText.includes("You are unable to access")
  );
}

function findOfferContainer(
  $: FinnkupongkoderCheerio,
  heading: FinnkupongkoderElement,
): ReturnType<FinnkupongkoderCheerio> {
  let current = $(heading).parent();

  for (let depth = 0; depth < 7; depth += 1) {
    const text = normalizeText(current.text());
    const headingCount = current.find("h3, h4").length;

    if (
      containsOfferCallToAction(text) &&
      headingCount <= 2 &&
      text.length < 2_500
    ) {
      return current;
    }

    const parent = current.parent();
    if (parent.length === 0) {
      break;
    }

    current = parent;
  }

  return $(heading).parent();
}

function isLikelyOfferTitle(title: string): boolean {
  if (title.length < 8) {
    return false;
  }

  return /(?:rabattkode|kupong|salg|kampanje|tilbud|spar|avslag|gratis)/i.test(
    title,
  );
}

function containsOfferCallToAction(text: string): boolean {
  return /(?:vis rabattkode|få rabattkode|se rabatt|se tilbudet)/i.test(text);
}

function hasMaskedCode(text: string): boolean {
  return /\*{2,}\S+/.test(text);
}

function extractFullDiscountCode(text: string): string | undefined {
  const lines = splitLines(text);
  const ctaIndex = lines.findIndex((line) => containsOfferCallToAction(line));

  if (ctaIndex === -1) {
    return undefined;
  }

  for (const line of lines.slice(ctaIndex + 1)) {
    if (/^flere\s+/i.test(line) || /^vis detaljer$/i.test(line)) {
      break;
    }

    if (isDiscountCodeToken(line)) {
      return line;
    }
  }

  return undefined;
}

function isDiscountCodeToken(line: string): boolean {
  const value = line.trim();

  if (
    value.length < 3 ||
    value.startsWith("***") ||
    value.includes("{") ||
    value.includes("}") ||
    /\s/.test(value)
  ) {
    return false;
  }

  const reservedWords = new Set([
    "kode",
    "kopiere",
    "rabattkode",
    "tilbud",
    "populær",
  ]);

  if (reservedWords.has(value.toLowerCase())) {
    return false;
  }

  return /^[A-Za-z0-9][A-Za-z0-9!._-]{2,40}$/.test(value);
}

function decodeFinnkupongkoderCode(encodedCode: string): string | undefined {
  if (!encodedCode.endsWith("...")) {
    return undefined;
  }

  const payload = encodedCode.slice(0, -3);

  if (payload.length === 0 || payload.length % 6 !== 0) {
    return undefined;
  }

  const encodedCharCodes: number[] = [];

  for (let index = 0; index < payload.length; index += 6) {
    const encodedCharCode = Number.parseInt(
      `${payload.slice(index, index + 2)}${payload.slice(index + 4, index + 6)}${payload.slice(index + 2, index + 4)}`,
      16,
    );

    if (!Number.isFinite(encodedCharCode)) {
      return undefined;
    }

    encodedCharCodes.push(encodedCharCode);
  }

  let code = "";
  const codeLength = encodedCharCodes.length;

  for (let index = 0; index < codeLength; index += 1) {
    const encodedCharCode = encodedCharCodes[index];

    if (encodedCharCode === undefined) {
      return undefined;
    }

    const keyCharSum = sumKeyCharsForPosition(index, codeLength);
    const charCode = encodedCharCode - keyCharSum;

    if (charCode <= 0) {
      return undefined;
    }

    code = `${String.fromCharCode(charCode)}${code}`;
  }

  return code.trim();
}

function sumKeyCharsForPosition(index: number, codeLength: number): number {
  const pattern = new RegExp(`.{${index}}(.).{0,${codeLength - 1 - index}}`, "g");
  const matches = CODE_KEY.matchAll(pattern);
  let sum = 0;

  for (const match of matches) {
    const char = match[1];

    if (char !== undefined) {
      sum += char.charCodeAt(0);
    }
  }

  return sum;
}

function extractStoreUrl(
  $: FinnkupongkoderCheerio,
  container: ReturnType<FinnkupongkoderCheerio>,
  pageUrl: string,
): string | undefined {
  const href = container
    .find('a[href*="/butikk/"]')
    .toArray()
    .map((element) => $(element).attr("href") ?? "")
    .find((candidate) => candidate.length > 0);

  if (href === undefined) {
    return undefined;
  }

  return parseUrlWithBase(href, pageUrl)?.toString();
}

function extractDomainFromStoreUrl(storeUrl: string): string | undefined {
  const parsedUrl = parseUrl(storeUrl);
  const pathParts = parsedUrl?.pathname.split("/").filter(Boolean) ?? [];
  const storeIndex = pathParts.indexOf("butikk");
  const slug = storeIndex === -1 ? undefined : pathParts[storeIndex + 1];

  if (slug === undefined || slug.length === 0) {
    return undefined;
  }

  const domain = normalizeDomainInput(slug);
  return DOMAIN_CORRECTIONS[domain] ?? domain;
}

function extractMerchantName(
  $: FinnkupongkoderCheerio,
  container: ReturnType<FinnkupongkoderCheerio>,
  title: string,
  domain: string,
): string {
  const linkName = container
    .find('a[href*="/butikk/"]')
    .toArray()
    .map((element) => normalizeText($(element).text()))
    .map((text) => {
      return text
        .replace(/^flere\s+/i, "")
        .replace(/\s+rabattkoder.*$/i, "")
        .trim();
    })
    .find((candidate) => candidate.length > 0);

  if (linkName !== undefined) {
    return linkName;
  }

  const titleNameMatch = title.match(/rabattkode\s+([^:]+):/i);
  const titleName = titleNameMatch?.[1]?.trim();

  if (titleName !== undefined && titleName.length > 0) {
    return titleName;
  }

  return domain
    .split(".")[0]
    ?.replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) ?? domain;
}

function extractReward(containerText: string, title: string): string {
  const reward =
    findRewardValue(containerText) ??
    findRewardValue(title) ??
    "Rabattkode";

  return reward.replace(/\s+/g, " ").trim();
}

function findRewardValue(text: string): string | undefined {
  const reward = extractPercentageReward(text) || extractKrReward(text);
  return reward !== "" ? reward : undefined;
}

function extractTerms(containerText: string, title: string): string {
  const detailLines = splitLines(containerText).filter((line) => {
    return /(?:gyldig|utløper|folk brukte|godt å vite)/i.test(line);
  });

  return [title, ...detailLines].filter(Boolean).join("\n");
}

function extractModalTerms(
  modal: Record<string, unknown>,
  title: string,
): string {
  const expiry = readString(modal["entry.exd"]);
  const description = stripHtml(readString(modal["entry.description"]));
  const editorsNote = stripHtml(readString(modal["entry.editorsNote"]));
  const terms = [
    title,
    expiry.length > 0 ? `Gyldig til ${expiry}` : "",
    description,
    editorsNote,
  ];

  return terms.filter(Boolean).join("\n");
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(normalizeText)
    .filter((line) => line.length > 0);
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&nbsp;", " ")
    .replace(/&#(\d+);/g, (_match, codePoint: string) => {
      return String.fromCharCode(Number.parseInt(codePoint, 10));
    })
    .replace(/\s+/g, " ")
    .trim();
}

function parseJsonRecord(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseUrlWithBase(href: string, baseUrl: string): URL | undefined {
  try {
    return new URL(href, baseUrl);
  } catch {
    return undefined;
  }
}
