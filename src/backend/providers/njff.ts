// This file extracts only publicly available benefit information from NJFF.
// Member-only discount codes on Min side are deliberately never collected.
//
// NJFF serves these benefits as server-rendered Enonic pages. The public
// `card-service` referenced by the list page is a generic card paginator and
// returns unrelated site content, not the benefit carousel or benefit details.
// Keep the canonical list/detail HTML as the source until NJFF exposes a
// benefit-specific public API.
import {
  CheerioCrawler,
  type CheerioCrawlingContext,
  Configuration,
  MemoryStorage,
} from "crawlee";
import {
  type CashbackOffer,
  normalizeDomainInput,
  parseUrl,
  toBaseDomain,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import { extractBenefitReward } from "../../shared/reward.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

type NjffCheerio = CheerioCrawlingContext["$"];

const LABEL_LIST = "list";
const LABEL_DETAIL = "detail";
const OFFICIAL_HOSTNAME = "njff.no";
const OFFICIAL_LIST_PATH = "/medlem/medlemsfordeler";
const DEFAULT_TERMS = "Krever NJFF-medlemskap.";

const MERCHANT_NAME_BY_SLUG: Record<string, string> = {
  "medlemsfordel-hos-kikkertsalg.no": "Kikkertsalg",
  "amok-equipment--rabatt-for-njff-medlemmer": "Amok Equipment",
  "rabatt-hos-hekta-pa-tur": "Hekta på tur",
  "ull-fra-janus-wool": "Janus",
  "kvalitetskniver-fra-helle": "Helle",
  "medlemsfordeler-hos-brecom-as": "Brecom",
  "hadeland-glassverk-tilbyr-rabatt-for-njff-medlemmer": "Hadeland Glassverk",
  "finn-fiskeplasser-og-fa-mer-fisk-med-fishbuddy": "Fishbuddy",
  "rabatt-hos-fjellsport": "Fjellsport",
  "porsgrunds-porselaensfabrik-rabatt-for-njff-medlemmer": "Porsgrunds Porselænsfabrik",
  "rabatt-hos-skitt-fiske": "Skitt Fiske",
  "hansker-fra-mechanix": "Mechanix Wear",
  "non-stop-dogwear": "Non-stop dogwear",
  "medlemstilbud-hos-jaktia": "Jaktia",
  "thorbjornrud-hotell--rabatt-for-njffs-medlemmer": "Thorbjørnrud Hotell",
  "medlemsrabatt-hos-thon-hotels": "Thon Hotels",
  "sportsman-s-pride": "Sportsman's Pride",
  "enklere-og-tryggere-jakt-med-wehunt": "WeHunt",
  "rabatt-hos-horselslaben": "Hørselslaben",
  "se-alt-innholdet-fra-naturkanal1": "Naturkanal1",
  "rabatt-hos-ravno": "Ravnø",
  "advokathjelp-hos-molteberg-nilsen": "Molteberg Nilsen",
};

// Some official offer pages link straight to a booking engine or an email
// client. The extension should still trigger on the merchant's own website.
const DOMAIN_BY_SLUG: Record<string, string[]> = {
  "se-alt-innholdet-fra-naturkanal1": ["naturkanal1.no"],
  "thorbjornrud-hotell--rabatt-for-njffs-medlemmer": ["thorbjornrudhotell.no"],
};

const REWARD_BY_SLUG: Record<string, string> = {
  "sportsman-s-pride": "Medlemspris",
};

const EXCLUDED_SLUGS = new Set([
  "jakt-&-fiske",
  "jaktradiolisens",
  "lytt-deg-gjennom-jegerproveboka",
]);

const SKIP_DOMAINS = new Set([
  "njff.no",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "tiktok.com",
  "snapchat.com",
  "spotify.com",
  "outlook.com",
  "google.com",
  "apple.com",
  "apps.apple.com",
  "play.google.com",
]);

const NOISY_SELECTORS = [
  "script",
  "style",
  "noscript",
  "nav",
  "header",
  "footer",
  "form",
  "iframe",
  "svg",
  ".breadcrumbs",
  ".carousel-part",
  ".social-sharing",
].join(", ");

export type CrawlNjffInput = {
  startUrl: string;
  maxRequestsPerCrawl: number;
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

type NjffEntry = {
  slug: string;
  sourceUrl: string;
  title: string;
  text: string;
  domains: string[];
};

export async function crawlNjff(input: CrawlNjffInput): Promise<CashbackOffer[]> {
  if (!isOfficialNjffUrl(input.startUrl, false)) {
    throw new Error(`NJFF refused non-official start URL: ${input.startUrl}`);
  }

  const entries = new Map<string, NjffEntry>();
  const storage = new MemoryStorage({ persistStorage: false });
  const config = new Configuration();
  config.useStorageClient(storage);

  const crawler = new CheerioCrawler({
    maxConcurrency: 4,
    maxRequestsPerCrawl: input.maxRequestsPerCrawl,
    preNavigationHooks: [({ request }, gotOptions) => {
      const allowDetail = request.label === LABEL_DETAIL;
      if (!isOfficialNjffUrl(request.url, allowDetail)) {
        throw new Error(`NJFF refused non-official crawl URL: ${request.url}`);
      }
      // Do not let an official URL redirect the crawler to another host.
      gotOptions.followRedirect = false;
    }],
    requestHandler: async ({ $, request, response, enqueueLinks }) => {
      const statusCode = response.statusCode ?? 0;
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(`NJFF returned ${statusCode} for ${request.url}`);
      }

      if ((request.label ?? LABEL_LIST) === LABEL_LIST) {
        const urls = collectDetailUrls($, input.startUrl);
        input.logger.info(`NJFF: found ${urls.length} public benefit pages`);
        await enqueueLinks({ urls, label: LABEL_DETAIL });
        return;
      }

      const slug = slugFromUrl(request.url);
      if (slug === "" || EXCLUDED_SLUGS.has(slug)) return;

      const loadedUrl = request.loadedUrl ?? request.url;
      if (!isOfficialNjffUrl(loadedUrl, true)) {
        input.logger.warn(`NJFF ignored non-official detail URL: ${loadedUrl}`);
        return;
      }

      const main = $("main").first().clone();
      main.find(NOISY_SELECTORS).remove();
      const title = normalizeText(main.find("h1").first().text());
      const text = normalizeText(main.text());
      if (title === "" || text === "") return;

      entries.set(slug, {
        slug,
        sourceUrl: loadedUrl,
        title,
        text,
        domains: DOMAIN_BY_SLUG[slug] ??
          collectMerchantDomains(main, $, merchantName(slug, title)),
      });
    },
  }, config);

  await crawler.run([{ url: input.startUrl, label: LABEL_LIST }]);

  const offers: CashbackOffer[] = [];
  let fromPage = 0;
  let fromLookup = 0;
  let fromOverride = 0;

  for (const entry of entries.values()) {
    const name = merchantName(entry.slug, entry.title);
    let domains = (input.overrides.njff?.[entry.slug] ?? [])
      .map(normalizeDomainInput);
    if (domains.length > 0) fromOverride++;

    if (domains.length === 0 && entry.domains.length > 0) {
      domains = entry.domains;
      fromPage++;
    }

    if (domains.length === 0) {
      domains = lookupDomains(input.domainLookup, name);
      if (domains.length > 0) fromLookup++;
    }

    if (domains.length === 0) {
      input.logger.warn(`NJFF offer has no merchant domain: ${name} (${entry.slug})`);
      continue;
    }

    const reward = REWARD_BY_SLUG[entry.slug] ??
      extractBenefitReward(`${entry.title}\n${entry.text}`);
    if (reward === "") {
      input.logger.warn(`NJFF offer has no public reward: ${name} (${entry.slug})`);
      continue;
    }

    offers.push({
      provider: "njff",
      merchantName: name,
      domains: uniqueStrings(domains),
      reward,
      sourceUrl: entry.sourceUrl,
      activationUrl: entry.sourceUrl,
      terms: buildTerms(entry.text),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(
    `NJFF: resolved ${fromPage} from official pages, ${fromLookup} via lookup, ${fromOverride} via overrides`,
  );
  input.logger.info(`NJFF: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}

function collectDetailUrls($: NjffCheerio, startUrl: string): string[] {
  const start = new URL(startUrl);
  const prefix = `${start.pathname.replace(/\/$/, "")}/`;
  const urls: string[] = [];

  $("main a[href]").each((_, element) => {
    const href = $(element).attr("href") ?? "";
    const parsed = parseUrl(href) ?? parseUrl(new URL(href, start).toString());
    if (parsed === undefined || parsed.origin !== start.origin) return;
    if (!parsed.pathname.startsWith(prefix) || parsed.pathname.includes("/_/")) return;

    const slug = slugFromUrl(parsed.toString());
    if (slug === "" || EXCLUDED_SLUGS.has(slug)) return;
    parsed.search = "";
    parsed.hash = "";
    urls.push(parsed.toString());
  });

  return uniqueStrings(urls);
}

function isOfficialNjffUrl(url: string, allowDetail: boolean): boolean {
  const parsed = parseUrl(url);
  if (
    parsed === undefined ||
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.port !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    normalizeDomainInput(parsed.hostname) !== OFFICIAL_HOSTNAME
  ) {
    return false;
  }

  const path = parsed.pathname.replace(/\/$/, "");
  return path === OFFICIAL_LIST_PATH ||
    (allowDetail && path.startsWith(`${OFFICIAL_LIST_PATH}/`));
}

function collectMerchantDomains(
  main: ReturnType<NjffCheerio>,
  $: NjffCheerio,
  name: string,
): string[] {
  const domains: string[] = [];

  main.find("a[href]").each((_, element) => {
    const href = $(element).attr("href") ?? "";
    const parsed = parseUrl(href);
    if (parsed === undefined || !/^https?:$/.test(parsed.protocol)) return;
    if (/\.(?:jpg|jpeg|png|gif|svg|webp|pdf|css|js)$/i.test(parsed.pathname)) return;

    const domain = toBaseDomain(normalizeDomainInput(parsed.hostname));
    if (isSkippedDomain(domain)) return;
    domains.push(domain);
  });

  const candidates = uniqueStrings(domains);
  if (candidates.length <= 1) return candidates;

  const nameKey = normalizeKey(name);
  const matching = candidates.filter((domain) => {
    const label = normalizeKey(domain.split(".")[0] ?? domain);
    return label.length >= 3 && (nameKey.includes(label) || label.includes(nameKey));
  });

  return matching.length > 0 ? matching : [];
}

function isSkippedDomain(domain: string): boolean {
  return [...SKIP_DOMAINS].some((skipped) => {
    return domain === skipped || domain.endsWith(`.${skipped}`);
  });
}

function merchantName(slug: string, title: string): string {
  return MERCHANT_NAME_BY_SLUG[slug] ?? title
    .replace(/^(?:medlemsfordel|medlemsrabatt|medlemstilbud|rabatt)\s+(?:hos|fra)\s+/i, "")
    .replace(/\s*[-–—]\s*rabatt\s+for\s+NJFF(?:s)?-medlemmer.*$/i, "")
    .replace(/\s+tilbyr\s+rabatt\s+for\s+NJFF(?:s)?-medlemmer.*$/i, "")
    .replace(/[.\s]+$/, "")
    .trim();
}

function buildTerms(text: string): string {
  const lines = text
    .split(/(?<=[.!?])\s+|[\r\n]+/)
    .map(normalizeText)
    .filter((line) => line.length >= 12 && line.length <= 360)
    .filter((line) => /\b(?:rabatt|medlemspris|tilbud|gjelder|unntak|ordinær|utvalgte)\b/i.test(line))
    // Activation details remain private even if a page happens to render them.
    .filter((line) => !containsPrivateInstructions(line));

  return uniqueStrings(lines).slice(0, 4).concat(DEFAULT_TERMS).join("\n");
}

function containsPrivateInstructions(line: string): boolean {
  return /\b(?:rabatt|kampanje|kupong|medlems|avtale)?kod(?:e|en|er|ene)\b/i.test(line) ||
    /\b(?:logg(?:e)?\s+inn|login|min(?:\s+|-)?side|medlemsnummer(?:et)?|medlemsnr)\b/i.test(line);
}

function slugFromUrl(url: string): string {
  const parsed = parseUrl(url);
  if (parsed === undefined) return "";
  const segments = parsed.pathname.split("/").filter(Boolean);
  return decodeURIComponent(segments.at(-1) ?? "").toLowerCase();
}

function normalizeText(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
