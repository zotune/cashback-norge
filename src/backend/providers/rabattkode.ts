import type { CashbackOffer } from "../../shared/cashback.js";

const FIRESTORE_URL =
  "https://firestore.googleapis.com/v1/projects/rabattkode-784d5/databases/(default)/documents/discounts?pageSize=500";

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
  const res = await fetch(FIRESTORE_URL);
  if (!res.ok) {
    throw new Error(`Rabattkode Firestore responded ${res.status}`);
  }
  const data = (await res.json()) as { documents?: FirestoreDoc[] };
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

    const firstPart = domain.split(".")[0] ?? domain;
    const merchantName = firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
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
