// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import { gotScraping } from "crawlee";
import type { CashbackOffer } from "../../shared/cashback.js";
import type { Logger } from "../logger.js";

// ---------------------------------------------------------------------------
// Supertilbud
// ---------------------------------------------------------------------------

type RichTextBlock = { type: string; children: Array<{ text?: string; bold?: boolean }> };

type DnbSuperOfferItem = {
  offer: string;
  title: string;
  description: RichTextBlock[];
  disclaimer: RichTextBlock[];
  url: { path: string; href: string };
};

function extractRichText(blocks: RichTextBlock[]): string {
  return blocks
    .flatMap((p) => p.children.map((c) => c.text ?? ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

type DnbSuperOfferSection = {
  title: string;
  superOfferItems: DnbSuperOfferItem[];
};

export type FetchDnbSupertilbudInput = {
  pageDataUrl: string;
  generatedAt: string;
  logger: Logger;
};

/** Parse date range from title like "Supertilbud torsdag 7. – lørdag 9. mai." */
function parseSuperOfferDateRange(title: string): { start: Date; end: Date } | undefined {
  const MONTHS: Record<string, number> = {
    januar: 0, februar: 1, mars: 2, april: 3, mai: 4, juni: 5,
    juli: 6, august: 7, september: 8, oktober: 9, november: 10, desember: 11,
  };
  // "7. – 9. mai" — skip any non-digit chars between the two day numbers
  const m = title.match(/(\d{1,2})\.[^\d]+(\d{1,2})\.\s*([a-zæøåA-ZÆØÅ]+)/u);
  if (!m) return undefined;
  const [, startDay, endDay, monthStr] = m;
  const month = MONTHS[monthStr?.toLowerCase() ?? ""];
  if (month === undefined) return undefined;
  const year = new Date().getFullYear();
  const start = new Date(year, month, Number(startDay), 0, 0, 0);
  const end = new Date(year, month, Number(endDay), 23, 59, 59);
  return { start, end };
}

function extractDisclaimerCode(item: DnbSuperOfferItem): string | undefined {
  const text = extractRichText(item.disclaimer);
  const m = text.match(/Rabattkode[:\s]+([A-Z0-9]+)/i);
  return m?.[1];
}

function buildSuperOfferTerms(sectionTitle: string, item: DnbSuperOfferItem): string {
  const parts: string[] = [];
  parts.push(sectionTitle.replace(/\.\s*$/, ""));
  const desc = extractRichText(item.description);
  if (desc) parts.push(desc);
  const disclaimer = extractRichText(item.disclaimer)
    .replace(/Rabattkode[:\s]+[A-Z0-9]+\.?\s*/gi, "")
    .trim();
  if (disclaimer) parts.push(disclaimer);
  const code = extractDisclaimerCode(item);
  if (code) parts.push(`Rabattkode: ${code}.`);
  parts.push("Betal med DNB-kort.");
  return parts.join("\n");
}

export async function fetchDnbSupertilbud(
  input: FetchDnbSupertilbudInput,
): Promise<CashbackOffer[]> {
  input.logger.info(`Fetching DNB Supertilbud from ${input.pageDataUrl}`);

  const contentJson = await fetchPageContent(input.pageDataUrl, "DNB Supertilbud");

  // Find the superOffer section
  const superSection = contentJson.sections.find(
    (s): s is DnbSuperOfferSection =>
      isRecord(s) && Array.isArray((s as Record<string, unknown>).superOfferItems),
  ) as DnbSuperOfferSection | undefined;

  if (!superSection) {
    input.logger.info("DNB Supertilbud: no superOfferItems found");
    return [];
  }

  const sourceUrl = "https://www.dnb.no/kundeprogram/fordeler/supertilbud/manedens-tilbud";
  const offers: CashbackOffer[] = [];

  for (const item of superSection.superOfferItems) {
    const reward = item.offer.trim();
    if (!reward) continue;

    const domain = extractDomainFromUrl(item.url.href ?? item.url.path);
    if (!domain) continue;

    const discountCode = extractDisclaimerCode(item);
    const rewardLabel = reward.endsWith("%") ? reward : `${reward} %`;

    offers.push({
      provider: "dnb",
      merchantName: item.title,
      domains: [domain],
      reward: rewardLabel,
      sourceUrl,
      activationUrl: sourceUrl,
      terms: buildSuperOfferTerms(superSection.title, item),
      ...(discountCode !== undefined ? { discountCode } : {}),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`DNB Supertilbud: found ${offers.length} offers`);
  return offers;
}

// ---------------------------------------------------------------------------
// Faste rabatter
// ---------------------------------------------------------------------------

type DnbCardDiscount = {
  offer: string;
  title: string;
  description: string;
  hidden: boolean;
  url: { path: string; href: string };
};

type DnbPageData = {
  result: {
    data: {
      aemPage: {
        data: {
          content: string;
        };
      };
    };
  };
};

export type FetchDnbInput = {
  pageDataUrl: string;
  generatedAt: string;
  logger: Logger;
};

export async function fetchDnb(
  input: FetchDnbInput,
): Promise<CashbackOffer[]> {
  input.logger.info(`Fetching DNB faste rabatter from ${input.pageDataUrl}`);

  const contentJson = await fetchPageContent(input.pageDataUrl, "DNB faste rabatter");
  const discountCode = extractPageDiscountCode(contentJson.sections);
  if (!discountCode) throw new Error("DNB faste rabatter: no current discount code found");

  const discounts = extractCardDiscounts(contentJson.sections);
  if (discounts.length === 0) throw new Error("DNB faste rabatter: no discount cards found");
  const offers: CashbackOffer[] = [];

  for (const discount of discounts) {
    if (discount.hidden) {
      continue;
    }

    const reward = discount.offer.trim();

    if (reward === "" || reward === "0") {
      continue;
    }

    const domain = extractDomainFromUrl(discount.url.href ?? discount.url.path);

    if (domain === undefined) {
      continue;
    }

    const dnbUrl = "https://www.dnb.no/kundeprogram/fordeler/faste-rabatter";
    const termsParts: string[] = [];
    if (discount.description) termsParts.push(discount.description);
    termsParts.push(`Rabattkode: ${discountCode}. Betal med DNB-kort.`);

    offers.push({
      provider: "dnb",
      merchantName: discount.title,
      domains: [domain],
      reward,
      sourceUrl: dnbUrl,
      activationUrl: dnbUrl,
      terms: termsParts.join("\n"),
      discountCode,
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`Found ${offers.length} DNB faste rabatter`);
  return offers;
}

async function fetchPageContent(
  url: string,
  label: string,
): Promise<{ sections: unknown[] }> {
  const response = await gotScraping(url, {
    responseType: "text",
    throwHttpErrors: false,
    timeout: { request: 30_000 },
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`${label} returned ${response.statusCode}: ${response.statusMessage}`);
  }

  const text = response.body.trim();
  // Retain support for explicit legacy page-data URL overrides.
  if (text.startsWith("{")) {
    const body: unknown = JSON.parse(text);
    if (isDnbPageData(body)) {
      const content: unknown = JSON.parse(body.result.data.aemPage.data.content);
      if (isContentSections(content)) return content;
    }
  } else {
    // DNB now embeds its structured page data in Next.js Flight scripts.
    // Decode JSON only; never evaluate third-party JavaScript. Flight records
    // can span multiple script chunks, so join them before parsing records.
    const chunks: string[] = [];
    for (const script of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
      const push = script[1]?.trim().match(/^self\.__next_f\.push\(([\s\S]*)\);?$/);
      if (!push?.[1]) continue;
      try {
        const chunk: unknown = JSON.parse(push[1]);
        if (Array.isArray(chunk) && chunk[0] === 1 && typeof chunk[1] === "string") {
          chunks.push(chunk[1]);
        }
      } catch {
        // Ignore non-data scripts rather than executing them.
      }
    }
    for (const record of chunks.join("").split("\n")) {
      const match = record.match(/^[\da-f]+:(.+)$/i);
      if (!match?.[1]) continue;
      try {
        const content = findPageContent(JSON.parse(match[1]) as unknown);
        if (content) return content;
      } catch {
        // Flight also contains non-JSON records (imports and plain text).
      }
    }
  }
  throw new Error(`${label}: structured page content not found`);
}

function findPageContent(value: unknown): { sections: unknown[] } | undefined {
  if (isRecord(value)) {
    if (isRecord(value.pageData) && isContentSections(value.pageData.content)) {
      return value.pageData.content;
    }
    for (const child of Object.values(value)) {
      const content = findPageContent(child);
      if (content) return content;
    }
  } else if (Array.isArray(value)) {
    for (const child of value) {
      const content = findPageContent(child);
      if (content) return content;
    }
  }
  return undefined;
}

function extractPageDiscountCode(sections: unknown[]): string | undefined {
  for (const section of sections) {
    if (!isRecord(section) || !isRecord(section.priceContent)) continue;
    const { title, price } = section.priceContent;
    if (typeof title === "string" && /rabattkode/i.test(title) && typeof price === "string") {
      const code = price.trim();
      if (/^[A-Z0-9_-]+$/i.test(code)) return code;
    }
  }
  return undefined;
}

function extractDomainFromUrl(url: string): string | undefined {
  try {
    const cleaned = url.trim().replace(/\/+$/, "");
    const withScheme = cleaned.startsWith("http") ? cleaned : `https://${cleaned}`;
    const parsed = new URL(withScheme);
    let hostname = parsed.hostname.toLowerCase();
    if (hostname.startsWith("www.")) hostname = hostname.slice(4);
    const CC_SUBDOMAINS = new Set(["no", "se", "dk", "fi", "de", "fr", "es", "it", "nl", "uk", "us", "eu"]);
    const parts = hostname.split(".");
    const firstPart = parts[0] ?? "";
    if (parts.length >= 3 && CC_SUBDOMAINS.has(firstPart)) {
      hostname = parts.slice(1).join(".");
    }
    return hostname;
  } catch {
    return undefined;
  }
}

function extractCardDiscounts(sections: unknown[]): DnbCardDiscount[] {
  const discounts: DnbCardDiscount[] = [];

  for (const section of sections) {
    if (!isRecord(section)) {
      continue;
    }

    const items = section.cardDiscountsItems;

    if (!Array.isArray(items)) {
      continue;
    }

    for (const item of items) {
      if (!isRecord(item)) {
        continue;
      }

      if (
        typeof item.offer === "string" &&
        typeof item.title === "string" &&
        isRecord(item.url) &&
        typeof item.url.href === "string"
      ) {
        discounts.push({
          offer: item.offer as string,
          title: item.title as string,
          description: typeof item.description === "string" ? item.description : "",
          hidden: item.hidden === true,
          url: { path: (item.url.path as string) ?? "", href: item.url.href as string },
        });
      }
    }
  }

  return discounts;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isContentSections(value: unknown): value is { sections: unknown[] } {
  return isRecord(value) && Array.isArray(value.sections);
}

function isDnbPageData(value: unknown): value is DnbPageData {
  if (!isRecord(value)) {
    return false;
  }

  const result = value.result;

  if (!isRecord(result)) {
    return false;
  }

  const data = result.data;

  if (!isRecord(data)) {
    return false;
  }

  const aemPage = data.aemPage;

  if (!isRecord(aemPage)) {
    return false;
  }

  const pageData = aemPage.data;

  if (!isRecord(pageData)) {
    return false;
  }

  return typeof pageData.content === "string";
}
