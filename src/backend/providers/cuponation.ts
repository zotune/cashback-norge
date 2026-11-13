// This file contains code to extract publicly available offer data from third-party websites.
// No proprietary or copyrighted content is included. Offers requiring authentication/login are not shown.
import {
  CheerioCrawler,
  type CheerioCrawlingContext,
  Configuration,
  MemoryStorage,
} from "crawlee";
import {
  type CashbackOffer,
  isRecord,
  stripHtml,
} from "../../shared/cashback.js";
import { extractUpToPercentageReward } from "../../shared/reward.js";
import { merchantDomainsFromUrl } from "../merchant-domains.js";
import type { Logger } from "../logger.js";
import { extractCouponMinimumPurchase, extractCouponReward } from "./rabattkode.js";

type CuponationCheerio = CheerioCrawlingContext["$"];

export type CrawlCuponationInput = {
  generatedAt: string;
  logger: Logger;
  startUrl: string;
};

type CuponationVoucher = {
  caption: {
    first: string;
    second: string;
  };
  code: string;
  endTime: string;
  expiration: {
    label: string;
  };
  isExpired: boolean;
  retailer: {
    merchantUrl: string;
    name: string;
  };
  termsAndConditions: {
    text: string;
  };
  title: string;
  type: string;
};

export async function crawlCuponation(
  input: CrawlCuponationInput,
): Promise<CashbackOffer[]> {
  const offers: CashbackOffer[] = [];
  let voucherCount = 0;
  let skippedWithoutReusableCode = 0;
  let fetchError: string | undefined;

  const storage = new MemoryStorage({ persistStorage: false });
  const config = new Configuration();
  config.useStorageClient(storage);

  const crawler = new CheerioCrawler({
    maxConcurrency: 1,
    maxRequestRetries: 2,
    maxRequestsPerCrawl: 1,
    requestHandlerTimeoutSecs: 30,
    requestHandler: async ({ $, request }) => {
      const loadedUrl = request.loadedUrl ?? request.url;
      const vouchers = extractVouchersFromNextData($);
      voucherCount = vouchers.length;

      for (const voucher of vouchers) {
        const offer = parseCuponationVoucher(voucher, loadedUrl, input.generatedAt);


        if (offer === undefined) {
          skippedWithoutReusableCode += 1;
          continue;
        }

        offers.push(offer);
      }
    },
    failedRequestHandler: async ({ request, error }) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      fetchError = `CupoNation: could not fetch ${request.url}: ${message}`;
    },
  }, config);

  await crawler.run([input.startUrl]);

  // CupoNation has no fallback in index.ts, so a failure is logged rather
  // than thrown, but it must not look like "no codes today".
  if (fetchError !== undefined) {
    input.logger.warn(fetchError);
  } else if (voucherCount === 0) {
    input.logger.warn(`CupoNation: no vouchers in the __NEXT_DATA__ of ${input.startUrl}; the page layout may have changed`);
  }

  input.logger.info(
    `CupoNation: ${voucherCount} top-20 vouchers, ${offers.length} reusable codes, ${skippedWithoutReusableCode} skipped`,
  );

  return offers;
}

function extractVouchersFromNextData(
  $: CuponationCheerio,
): CuponationVoucher[] {
  const nextDataText = $("#__NEXT_DATA__").first().text();

  if (nextDataText.length === 0) {
    return [];
  }

  const nextData = parseJson(nextDataText);

  if (!isRecord(nextData)) {
    return [];
  }

  const props = asRecord(nextData.props);
  const pageProps = asRecord(props?.pageProps);
  const vouchers = pageProps?.vouchers;

  if (!Array.isArray(vouchers)) {
    return [];
  }

  return vouchers.flatMap(parseCuponationVoucherShape);
}

function parseCuponationVoucherShape(value: unknown): CuponationVoucher[] {
  if (!isRecord(value)) {
    return [];
  }

  const retailer = asRecord(value.retailer);
  const merchantUrl = readString(retailer?.merchantUrl);
  const merchantName = readString(retailer?.name);
  const title = readString(value.title);
  const type = readString(value.type);

  if (
    merchantUrl.length === 0 ||
    merchantName.length === 0 ||
    title.length === 0 ||
    type.length === 0
  ) {
    return [];
  }

  const caption = asRecord(value.caption);
  const expiration = asRecord(value.expiration);
  const termsAndConditions = asRecord(value.termsAndConditions);

  return [
    {
      caption: {
        first: readString(caption?.first),
        second: readString(caption?.second),
      },
      code: readString(value.code),
      endTime: readString(value.endTime),
      expiration: {
        label: readString(expiration?.label),
      },
      isExpired: value.isExpired === true,
      retailer: {
        merchantUrl,
        name: merchantName,
      },
      termsAndConditions: {
        text: readString(termsAndConditions?.text),
      },
      title,
      type,
    },
  ];
}

function parseCuponationVoucher(
  voucher: CuponationVoucher,
  pageUrl: string,
  generatedAt: string,
): CashbackOffer | undefined {
  if (voucher.type !== "code" || voucher.isExpired) {
    return undefined;
  }

  const endTime = Date.parse(voucher.endTime);
  if (Number.isFinite(endTime) && endTime <= Date.parse(generatedAt)) {
    return undefined;
  }

  const discountCode = voucher.code.trim();

  if (!isReusableDiscountCode(discountCode)) {
    return undefined;
  }

  const domains = merchantDomainsFromUrl(voucher.retailer.merchantUrl);

  if (domains.length === 0) {
    return undefined;
  }

  const termsText = stripHtml(voucher.termsAndConditions.text)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "" && line !== "-")
    .join("\n");
  const rewardCalculation = extractCouponMinimumPurchase(`${voucher.title}\n${termsText}`);

  return {
    provider: "rabattkode",
    merchantName: voucher.retailer.name,
    domains,
    reward: extractReward(voucher, termsText),
    ...(rewardCalculation === undefined ? {} : { rewardCalculation }),
    sourceUrl: pageUrl,
    activationUrl: voucher.retailer.merchantUrl,
    discountCode,
    terms: extractTerms(voucher, termsText),
    updatedAt: generatedAt,
  };
}

function isReusableDiscountCode(code: string): boolean {
  if (code.length < 3 || /\s/.test(code)) {
    return false;
  }

  return code.toLowerCase() !== "uniquecodes";
}

// caption.first is the structured value of this code ("15%", "100 kr");
// the second caption is only the word "rabatt". A maximum stated in the
// title or terms ("få opptil 70% rabatt") keeps its qualifier.
function extractReward(voucher: CuponationVoucher, termsText: string): string {
  const caption = extractCouponReward(voucher.caption.first);
  const reward = caption || extractCouponReward(voucher.title);
  if (reward === "" || reward.startsWith("opptil ")) return reward;

  const upTo = extractUpToPercentageReward(`${voucher.title}\n${termsText}`);
  return upTo === `opptil ${reward}` ? upTo : reward;
}

function extractTerms(voucher: CuponationVoucher, termsText: string): string {
  const endTime = Date.parse(voucher.endTime);
  const validUntil = Number.isFinite(endTime)
    ? `Gyldig til ${new Intl.DateTimeFormat("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Oslo" }).format(new Date(endTime))}`
    : "";
  const terms = [
    voucher.title,
    voucher.expiration.label,
    validUntil,
    termsText,
  ];

  return terms.filter(Boolean).join("\n");
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
