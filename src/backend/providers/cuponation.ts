import {
  CheerioCrawler,
  type CheerioCrawlingContext,
  Configuration,
  MemoryStorage,
} from "crawlee";
import {
  type CashbackOffer,
  isRecord,
} from "../../shared/cashback.js";
import { merchantDomainsFromUrl } from "../merchant-domains.js";
import type { Logger } from "../logger.js";

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
  expiration: {
    label: string;
  };
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

  const storage = new MemoryStorage({ persistStorage: false });
  const config = new Configuration();
  config.useStorageClient(storage);

  const crawler = new CheerioCrawler({
    maxRequestRetries: 0,
    maxRequestsPerCrawl: 1,
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
      input.logger.warn(
        `CupoNation: could not fetch ${request.url}: ${message}`,
      );
    },
  }, config);

  await crawler.run([input.startUrl]);

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
      expiration: {
        label: readString(expiration?.label),
      },
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
  if (voucher.type !== "code") {
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

  return {
    provider: "rabattkode",
    merchantName: voucher.retailer.name,
    domains,
    reward: extractReward(voucher),
    sourceUrl: pageUrl,
    activationUrl: voucher.retailer.merchantUrl,
    discountCode,
    terms: extractTerms(voucher),
    updatedAt: generatedAt,
  };
}

function isReusableDiscountCode(code: string): boolean {
  if (code.length < 3 || /\s/.test(code)) {
    return false;
  }

  return code.toLowerCase() !== "uniquecodes";
}

function extractReward(voucher: CuponationVoucher): string {
  const caption = [voucher.caption.first, voucher.caption.second]
    .filter(Boolean)
    .join(" ")
    .trim();

  return caption.length > 0 ? caption : voucher.title;
}

function extractTerms(voucher: CuponationVoucher): string {
  const terms = [
    voucher.title,
    voucher.expiration.label,
    stripHtml(voucher.termsAndConditions.text),
  ];

  return terms.filter(Boolean).join("\n");
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
