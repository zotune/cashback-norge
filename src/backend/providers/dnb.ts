import type { CashbackOffer } from "../../shared/cashback.js";
import type { Logger } from "../logger.js";

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

  const response = await fetch(input.pageDataUrl);

  if (!response.ok) {
    throw new Error(
      `DNB page-data returned ${response.status}: ${response.statusText}`,
    );
  }

  const body: unknown = await response.json();

  if (!isDnbPageData(body)) {
    throw new Error("DNB page-data returned unexpected format");
  }

  const contentJson: unknown = JSON.parse(body.result.data.aemPage.data.content);

  if (!isContentSections(contentJson)) {
    throw new Error("DNB content sections have unexpected format");
  }

  const discounts = extractCardDiscounts(contentJson.sections);
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

    offers.push({
      provider: "dnb",
      merchantName: discount.title,
      domains: [domain],
      reward,
      sourceUrl: dnbUrl,
      activationUrl: dnbUrl,
      terms: "Rabattkode DNB4935 i handlekurven. Betal med DNB-kort.",
      discountCode: "DNB4935",
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`Found ${offers.length} DNB faste rabatter`);
  return offers;
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
    if (parts.length >= 3 && CC_SUBDOMAINS.has(parts[0])) {
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
