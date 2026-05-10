// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import { gotScraping } from "crawlee";
import type { CashbackOffer } from "../../shared/cashback.js";

const FIRESTORE_URL =
  "https://firestore.googleapis.com/v1/projects/rabattkode-784d5/databases/(default)/documents/discounts?pageSize=500";

// Domains that rabattkode stores with wrong TLD
const DOMAIN_CORRECTIONS: Record<string, string> = {
  "scandichotels.no": "scandichotels.com",
};

interface FirestoreDoc {
  fields: {
    url_plugin?: { stringValue: string };
    url_no_data_tracking?: { stringValue: string };
    discount_code?: { stringValue: string };
    discount_amount?: { integerValue: string };
    title?: { stringValue: string };
    subtitle?: { stringValue: string };
    is_published?: { booleanValue: boolean };
    is_reported?: { booleanValue: boolean };
  };
}

export async function crawlRabattkode(): Promise<CashbackOffer[]> {
  const generatedAt = new Date().toISOString();
  const response = await gotScraping(FIRESTORE_URL, {
    responseType: "json",
    throwHttpErrors: false,
    timeout: { request: 30_000 },
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Rabattkode Firestore responded ${response.statusCode}`);
  }
  const data = response.body as { documents?: FirestoreDoc[] };
  const docs = data.documents ?? [];

  const offers: CashbackOffer[] = [];

  for (const doc of docs) {
    const f = doc.fields;
    if (!f.is_published?.booleanValue) continue;
    if (f.is_reported?.booleanValue) continue;

    const pluginUrl = f.url_plugin?.stringValue ?? "";
    const siteUrl = f.url_no_data_tracking?.stringValue ?? pluginUrl;
    if (!siteUrl) continue;

    const code = f.discount_code?.stringValue ?? "";
    if (!code) continue;

    const amount = f.discount_amount?.integerValue ?? "";
    const title = f.title?.stringValue ?? "";
    const subtitle = f.subtitle?.stringValue ?? "";

    let domain: string;
    try {
      domain = new URL(siteUrl).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    domain = DOMAIN_CORRECTIONS[domain] ?? domain;

    const parts = domain.split(".");
    const CC_SUBDOMAINS = new Set(["no", "se", "dk", "fi", "de", "fr", "es", "it", "nl", "uk", "us", "eu"]);
    const firstPart = parts[0] ?? "";
    const namePart = parts.length >= 3 && CC_SUBDOMAINS.has(firstPart) ? parts[1] : parts[0];
    const merchantName = (namePart ?? domain).charAt(0).toUpperCase() + (namePart ?? domain).slice(1);
    const reward = amount ? `${amount}%` : title;
    const terms = [title, subtitle].filter(Boolean).join(". ");

    offers.push({
      provider: "rabattkode",
      merchantName,
      domains: [domain],
      reward,
      sourceUrl: siteUrl,
      activationUrl: siteUrl,
      discountCode: code,
      terms,
      updatedAt: generatedAt,
    });
  }

  return offers;
}
