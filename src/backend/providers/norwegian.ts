// Extracts public Norwegian Reward offers without executing third-party code.
import { Configuration, ErrorTracker, HttpCrawler, MemoryStorage } from "crawlee";
import {
  type CashbackOffer,
  isRecord,
  normalizeDomainInput,
  parseUrl,
  stripHtml,
  toBaseDomain,
  uniqueOffers,
} from "../../shared/cashback.js";
import { extractPercentageReward } from "../../shared/reward.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

type PartnerSource = { slug: string; merchantName: string; url: string; termsUrl?: string };

// These public co-branded pages confirm the benefit independently of
// norwegian.com's blocked catalogue. Rates are always read from the live page.
const PARTNER_SOURCES: PartnerSource[] = [
  {
    slug: "avis", merchantName: "AVIS", url: "https://one.avisworld.com/no_NO/Avis-NorwegianReward",
    termsUrl: "https://one.avisworld.com/no_NO/Avis-NorwegianReward/Termsandconditions",
  },
  { slug: "talkmore", merchantName: "Talkmore", url: "https://talkmore.no/privat/vilkar/partnere/norwegian" },
  { slug: "parkvia", merchantName: "ParkVia", url: "https://norwegianreward.parkvia.com/nb-NO" },
];

export type FetchNorwegianRewardInput = {
  apiUrl: string;
  gridListId: number;
  generatedAt: string;
  logger: Logger;
  overrides: ProviderOverrides;
  /** Optional source URLs for isolated crawl verification. */
  partnerSources?: PartnerSource[];
};

const MAX_REQUESTS = 40;
const SKIP_SLUGS = new Set(["norwegian-kortet", "flybilletter", "norwegian-holidays"]);
const EXCLUDED_LINK_HOSTS = [
  "norwegian.com", "norwegian.no", "norwegianreward.com", "facebook.com", "instagram.com",
  "youtube.com", "tiktok.com", "x.com", "cookielaw.org", "lc.chat", "apple.com", "google.com", "strompris.no",
];

export async function fetchNorwegianReward(input: FetchNorwegianRewardInput): Promise<CashbackOffer[]> {
  const listUrl = new URL(input.apiUrl);
  listUrl.searchParams.set("languageCode", "nb");
  listUrl.searchParams.set("marketCode", "no");
  listUrl.searchParams.set("gridListId", String(input.gridListId));
  const sources = input.partnerSources ?? PARTNER_SOURCES;
  const offers = new Map<string, CashbackOffer>();
  const partnerTerms = new Map<string, string>();
  const failures: string[] = [];
  const storage = new MemoryStorage({ persistStorage: false });
  const config = new Configuration();
  config.useStorageClient(storage);
  let partnerOfferCount = 0;

  const crawler = new HttpCrawler({
    maxConcurrency: 1,
    maxRequestsPerCrawl: MAX_REQUESTS,
    maxRequestRetries: 2,
    useSessionPool: false,
    ignoreSslErrors: false,
    navigationTimeoutSecs: 30,
    requestHandlerTimeoutSecs: 30,
    requestHandler: async ({ body, request, response }) => {
      const status = response.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        // Repeating the same unauthenticated request cannot fix an access block.
        if (status === 401 || status === 403 || status === 404) request.noRetry = true;
        throw new Error(`Norwegian Reward: HTTP ${status} for ${request.url}`);
      }
      const html = Buffer.isBuffer(body) ? body.toString("utf8") : body;
      if (request.userData.kind === "catalogue") {
        let data: unknown;
        try { data = JSON.parse(html); } catch {
          throw new Error(`Norwegian Reward: invalid catalogue JSON at ${request.url}`);
        }
        const items = readGridListItems(data, listUrl);
        if (items.length === 0) throw new Error(`Norwegian Reward: no partners in catalogue at ${request.url}`);
        input.logger.info(`Norwegian Reward: ${items.length} partners in grid list`);
        const partners = items.filter((item) => !SKIP_SLUGS.has(item.slug));
        if (partners.length > MAX_REQUESTS - sources.length - sources.filter((source) => source.termsUrl).length - 1) {
          throw new Error(`Norwegian Reward: catalogue exceeds ${MAX_REQUESTS} request limit`);
        }
        await crawler.addRequests(partners.map((item) => ({ url: item.url, userData: { kind: "partner", ...item } })));
        return;
      }

      const slug = String(request.userData.slug);
      const merchantName = String(request.userData.merchantName);
      const mainPart = readMainContent(html);
      const text = readOfferText(mainPart);
      if (!/\bNorwegian\s+Reward\b/i.test(text)) {
        throw new Error(`Norwegian Reward: membership information missing for ${slug} at ${request.url}`);
      }
      if (request.userData.kind === "partner-terms") {
        partnerTerms.set(slug, `${text}\nVilkår: ${request.url}`);
        return;
      }
      const reward = readCashPointsReward(text);
      if (!reward) {
        if (request.userData.kind === "confirmed-partner") {
          throw new Error(`Norwegian Reward: current CashPoints rate missing for ${slug} at ${request.url}`);
        }
        input.logger.info(`Norwegian Reward: ${slug} has no percentage CashPoints rate in its content, skipping`);
        return;
      }
      const mappedDomains = input.overrides.norwegian?.[slug];
      // A co-branded host (e.g. avisworld.com) is not the merchant's domain.
      const domains = mappedDomains !== undefined && mappedDomains.length > 0
        ? mappedDomains.map(normalizeDomainInput)
        : request.userData.kind === "confirmed-partner" ? [] : findPartnerDomains(mainPart, slug);
      if (domains.length === 0) {
        input.logger.warn(`Norwegian Reward: no verified partner domain for ${slug} at ${request.url}`);
        return;
      }
      const offer: CashbackOffer = {
        provider: "norwegian", merchantName, domains, reward,
        sourceUrl: request.url, activationUrl: request.url,
        terms: [
          readTitle(html),
          text,
          "Krever medlemskap i Norwegian Reward. Fordelen opptjenes som CashPoints.",
          `Kilde: ${request.url}`,
        ].filter(Boolean).join("\n"),
        updatedAt: input.generatedAt,
      };
      // Prefer the partner's own current terms when both sources are available.
      if (request.userData.kind === "confirmed-partner" || !offers.has(slug)) {
        offers.set(slug, offer);
        if (request.userData.kind === "confirmed-partner") partnerOfferCount++;
      }
    },
    failedRequestHandler: async ({ request }, error) => {
      const message = `Norwegian Reward: ${request.url} failed (${error.message.slice(0, 500)})`;
      failures.push(message);
      input.logger.warn(message);
    },
  }, config);
  // Long upstream errors must not overflow Crawlee's recursive error grouping.
  crawler.stats.errorTracker = new ErrorTracker({ showErrorMessage: false });
  crawler.stats.errorTrackerRetry = new ErrorTracker({ showErrorMessage: false });
  input.logger.info(`Fetching Norwegian Reward catalogue and ${sources.length} public partner sources`);
  await crawler.run([
    { url: listUrl.href, userData: { kind: "catalogue" } },
    ...sources.map((source) => ({ url: source.url, userData: { kind: "confirmed-partner", ...source } })),
    ...sources.flatMap((source) => source.termsUrl === undefined ? [] : [
      { url: source.termsUrl, userData: { kind: "partner-terms", slug: source.slug } },
    ]),
  ]);
  if (offers.size === 0) {
    throw new Error(`Norwegian Reward: no verified offers; ${failures.join("; ") || "no current CashPoints rates found"}`);
  }
  input.logger.info(`Found ${offers.size} Norwegian Reward offers with verified domains (${partnerOfferCount} from public partner sources)`);
  return uniqueOffers([...offers.entries()].map(([slug, offer]) => ({
    ...offer,
    terms: [offer.terms, partnerTerms.get(slug)].filter(Boolean).join("\n"),
  })));
}

function readCashPointsReward(text: string): string {
  const matches = [...text.matchAll(/(?:opptil\s+|up\s+to\s+)?\d+(?:[.,]\d+)?\s*%\s*(?:i\s+)?CashPoints\b/gi)];
  const reward = extractPercentageReward(matches.map((match) => match[0]).join("\n"));
  return reward && matches.some((match) => /^(?:opptil|up to)\b/i.test(match[0])) ? `Opptil ${reward}` : reward;
}

function readMainContent(html: string): string {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  return (main ?? html.split(/<\/header\s*>/i).slice(-1)[0] ?? html)
    .split(/<footer\b/i)[0]!
    .replace(/<(script|style|nav|header|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
}

function readOfferText(html: string): string {
  // Booking inputs, dropdown choices and generic navigation do not belong in
  // the benefit tooltip. Preserve the actual headings, paragraphs and terms.
  const blocks = [...html.matchAll(/<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .filter((match) => !/<(?:input|select|button|label)\b/i.test(match[2]!))
    .map((match) => stripHtml(match[2]!).replace(/[^\S\n]+/g, " ").trim())
    .filter(Boolean);
  return [...new Set(blocks)].join("\n").replace(/\n\s+/g, "\n").trim();
}

function findPartnerDomains(mainPart: string, slug: string): string[] {
  const domains = new Set<string>();
  for (const match of mainPart.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)) {
    const parsed = parseUrl((match[1] ?? "").replace(/&amp;/g, "&"));
    if (!parsed || EXCLUDED_LINK_HOSTS.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) continue;
    const domain = toBaseDomain(normalizeDomainInput(parsed.hostname));
    // Generic navigation, booking and tracking hosts must not become the shop.
    if (domain.split(".")[0]!.replace(/[^a-z0-9]/gi, "") !== slug.replace(/[^a-z0-9]/gi, "")) continue;
    domains.add(domain);
  }
  // Multiple outbound hosts do not establish which one belongs to the shop.
  return domains.size === 1 ? [...domains] : [];
}

function readTitle(body: string): string {
  return stripHtml(body.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "")
    .replace(/\s*\|\s*Norwegian\s*$/i, "").trim();
}

function readGridListItems(data: unknown, listUrl: URL): PartnerSource[] {
  if (!isRecord(data) || !Array.isArray(data.items)) return [];
  const items = new Map<string, PartnerSource>();
  for (const item of data.items) {
    if (!isRecord(item) || typeof item.url !== "string") continue;
    let url: URL;
    try { url = new URL(item.url, listUrl); } catch { continue; }
    if (!url || url.origin !== listUrl.origin || url.search || url.hash) continue;
    const slug = url.pathname.match(/^\/no\/reward\/vare-partnere\/([a-z0-9-]+)\/?$/i)?.[1];
    if (!slug || typeof item.heading !== "string" || !item.heading.trim()) continue;
    items.set(slug, { slug, merchantName: stripHtml(item.heading).trim(), url: url.href });
  }
  return [...items.values()];
}
