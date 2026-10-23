// Public, server-rendered Instabank benefits. No merchant MCCs are inferred.
import { CheerioCrawler, Configuration, ErrorTracker, MemoryStorage, type CheerioCrawlingContext } from "crawlee";
import { type CashbackOffer, stripHtml } from "../../shared/cashback.js";
import { extractPercentageReward } from "../../shared/reward.js";
import { INSTABANK_CARD_URL, INSTABANK_DISCOUNTS_URL, INSTABANK_INTEREST_NOTICE, INSTABANK_PREPAYMENT_NOTICE, osloDate } from "../../shared/card-benefits.js";
import type { Logger } from "../logger.js";

type InstabankCheerio = CheerioCrawlingContext["$"];
const MONTHS = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
type Calendar = { year: number; months: { month: number; reward: string; category: string; mcc: string }[]; green: string; terms: string[] };

export type FetchInstabankInput = {
  generatedAt: string;
  logger: Logger;
  startUrl?: string;
  cardUrl?: string;
};

export async function fetchInstabank(input: FetchInstabankInput): Promise<CashbackOffer[]> {
  const startUrl = input.startUrl ?? INSTABANK_DISCOUNTS_URL;
  const cardUrl = input.cardUrl ?? INSTABANK_CARD_URL;
  const config = new Configuration();
  config.useStorageClient(new MemoryStorage({ persistStorage: false }));
  let calendar: Calendar | undefined;
  let costs: string | undefined;
  const failures: string[] = [];
  const crawler = new CheerioCrawler({
    maxConcurrency: 1, maxRequestsPerCrawl: 2, maxRequestRetries: 2,
    useSessionPool: false, ignoreSslErrors: false,
    navigationTimeoutSecs: 30, requestHandlerTimeoutSecs: 30,
    requestHandler: async ({ $, request, response }) => {
      const status = response.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        if ([401, 403, 404].includes(status)) request.noRetry = true;
        throw new Error(`Instabank: HTTP ${status} for ${request.url}`);
      }
      $("script, style, nav, header, footer").remove();
      if (request.userData.kind === "discounts") calendar = readCalendar($, input.generatedAt);
      else costs = readCosts($);
    },
    failedRequestHandler: async ({ request }, error) => {
      const message = `Instabank: ${request.url} failed after retries (${error.message.slice(0, 500)})`;
      failures.push(message);
      input.logger.warn(message);
    },
  }, config);
  crawler.stats.errorTracker = new ErrorTracker({ showErrorMessage: false });
  crawler.stats.errorTrackerRetry = new ErrorTracker({ showErrorMessage: false });
  input.logger.info(`Instabank: fetching public discount calendar and card costs from ${startUrl}`);
  await crawler.run([{ url: startUrl, userData: { kind: "discounts" } }, { url: cardUrl, userData: { kind: "card" } }]);
  if (calendar === undefined || costs === undefined) throw new Error(`Instabank: incomplete calendar or card terms; ${failures.join("; ")}`);
  const currentCalendar = calendar;
  const commonTerms = [
    "Betal med Instabank kredittkort. Rabatten trekkes automatisk fra neste faktura.",
    "MCC/bransjekoden som betalingsmottakeren er registrert med avgjør om et kjøp kvalifiserer. Vi kjenner ikke butikkens faktiske MCC-kode.",
    ...calendar.terms, costs, INSTABANK_INTEREST_NOTICE, INSTABANK_PREPAYMENT_NOTICE,
    `Kilde: ${INSTABANK_DISCOUNTS_URL}\nKort og priser: ${INSTABANK_CARD_URL}`,
  ].join("\n");
  const base = {
    provider: "instabank", domains: [], activationUrl: INSTABANK_CARD_URL,
    sourceUrl: INSTABANK_DISCOUNTS_URL, updatedAt: input.generatedAt,
  };
  const offers: CashbackOffer[] = currentCalendar.months.map((month) => {
    const validFrom = `${currentCalendar.year}-${String(month.month).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(currentCalendar.year, month.month, 0)).getUTCDate();
    const validUntil = `${currentCalendar.year}-${String(month.month).padStart(2, "0")}-${lastDay}`;
    return {
      ...base, merchantName: `Instabank · ${MONTHS[month.month - 1]} ${currentCalendar.year}`, reward: month.reward,
      cardBenefit: { kind: "monthly", category: month.category, validFrom, validUntil },
      terms: [`${month.reward} · ${month.category}`, `Gyldig ${validFrom} til ${validUntil}.`,
        month.mcc ? `Bransjevilkår/MCC: ${month.mcc}` : "Se bankens kategori- og MCC-vilkår.", commonTerms].join("\n"),
    };
  });
  offers.push({
    ...base, merchantName: "Instabank · fast grønn rabatt", reward: calendar.green,
    cardBenefit: { kind: "ongoing", category: "kollektivtransport og elbillading" },
    terms: [`${calendar.green} på kollektivtransport eller elbillading, etter bankens vilkår. Dette er en egen kategori; ikke ekstra rabatt på sportsutstyr eller andre månedsvarer.`, commonTerms].join("\n"),
  });
  input.logger.info(`Instabank: ${offers.length} card benefits (12 calendar months and 1 ongoing benefit), no inferred merchant domains`);
  return offers;
}

function readCalendar($: InstabankCheerio, generatedAt: string): Calendar {
  const text = clean($("body").html() ?? "");
  const dated = text.match(new RegExp(`\\bI\\s+(${MONTHS.join("|")})\\s+(20\\d{2})\\b`, "i"));
  const year = Number(dated?.[2]);
  if (!Number.isInteger(year) || year !== Number(osloDate(new Date(generatedAt)).slice(0, 4))) {
    throw new Error("Instabank: current calendar year could not be verified from the monthly announcement");
  }
  const months = new Map<number, Calendar["months"][number]>();
  // Elementor's public semantic icon boxes contain the complete calendar,
  // including hidden calendar rows. No deploy-specific ids or script execution.
  $(".elementor-icon-box-content").each((_index, element) => {
    const heading = clean($(element).find("h3").text()).toLowerCase().replace(/:$/, "");
    const month = MONTHS.indexOf(heading) + 1;
    if (!month) return;
    const description = clean($(element).find(".elementor-icon-box-description").text());
    const reward = extractPercentageReward(description);
    const category = description.replace(/^\d+(?:[.,]\d+)?\s*%\s*(?:rabatt\s*)?(?:på\s*)?(?:alt\s+av\s*)?/i, "").trim();
    if (!reward || !category) throw new Error(`Instabank: invalid calendar benefit for ${heading}`);
    const existing = months.get(month);
    if (existing && (existing.reward !== reward || existing.category !== category)) throw new Error(`Instabank: conflicting calendar entries for ${heading}`);
    months.set(month, { month, reward, category, mcc: "" });
  });
  if (months.size !== 12) throw new Error(`Instabank: expected 12 calendar months, found ${months.size}`);
  $(".elementor-widget-text-editor").each((_index, element) => {
    const description = clean($(element).html() ?? "");
    const heading = description.match(new RegExp(`^(${MONTHS.join("|")}):`, "i"));
    if (!heading) return;
    const entry = months.get(MONTHS.indexOf(heading[1]!.toLowerCase()) + 1);
    if (entry) entry.mcc = description;
  });
  const greenDescription = $("p").toArray().map((element) => clean($(element).text()))
    .find((line) => /fast.*rabatt/i.test(line) && /kollektiv/i.test(line) && /elbillading/i.test(line));
  const green = extractPercentageReward(greenDescription ?? "");
  if (!green) throw new Error("Instabank: current ongoing green benefit not found");
  const terms = [...new Set($("li").toArray().map((element) => clean($(element).text()))
    .filter((line) => /maks rabatt pr (?:måned|år)|retur av kjøp|ikke rabatt ved|feil MCC|annen MCC/i.test(line)))];
  if (!terms.some((line) => /maks rabatt pr måned/i.test(line)) || !terms.some((line) => /maks rabatt pr år/i.test(line))) {
    throw new Error("Instabank: monthly or yearly rebate cap missing");
  }
  return { year, months: [...months.values()].sort((a, b) => a.month - b.month), green, terms };
}

function readCosts($: InstabankCheerio): string {
  const text = clean($("body").html() ?? "");
  const fee = text.match(/Termingebyr\s+(\d+(?:[.,]\d+)?)\s*kr/i)?.[1];
  const rate = text.match(/Nominell rente\s+(\d+(?:[.,]\d+)?)\s*%/i)?.[1];
  const fx = text.match(/Valutapåslag\s+(\d+(?:[.,]\d+)?)\s*%/i)?.[1];
  if (!fee || !rate || !/ikke har en rentefri periode|ingen rentefri periode/i.test(text)) {
    throw new Error("Instabank: current interest-free-period statement, interest rate or term fee missing");
  }
  return `${rate} % nominell rente. Termingebyr ${fee} kr.${fx ? ` Valutapåslag ${fx} %.` : ""} Rabattgrenser gjelder samlet, ikke per kjøp. Renter og gebyrer kan spise opp rabatten.`;
}

function clean(text: string): string { return stripHtml(text).replace(/\s+/g, " ").trim(); }
