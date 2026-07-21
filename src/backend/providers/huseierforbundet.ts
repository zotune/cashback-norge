// This file contains code to extract publicly available offer data from official websites.
// No login-only content or discount codes are collected.
import {
  Configuration,
  HttpCrawler,
  MemoryStorage,
} from "crawlee";
import {
  type CashbackOffer,
  isRecord,
  normalizeDomainInput,
  parseUrl,
  stripHtml,
  toBaseDomain,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import { extractBenefitReward } from "../../shared/reward.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import { merchantDomainsFromHostname } from "../merchant-domains.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const NATIONAL_LIST_URL = "https://www.huseierforbundet.no/medlemsfordeler";
const BERGEN_LIST_URL = "https://huseierforening.no/samarbeidspartnere/";
const NATIONAL_LIST_PAGE_ID = 3366;
const BERGEN_LIST_PAGE_ID = 559;
const BERGEN_ABM_PAGE_ID = 5989;
const DETAIL_CONCURRENCY = 4;
const WORDPRESS_FIELDS = "id,slug,status,parent,link,title,content";
const OFFICIAL_HOSTNAMES = new Set([
  "huseierforbundet.no",
  "huseierforening.no",
]);
const LIST_PAGE_ID_BY_HOSTNAME: Record<string, number> = {
  "huseierforbundet.no": NATIONAL_LIST_PAGE_ID,
  "huseierforening.no": BERGEN_LIST_PAGE_ID,
};
const ALLOWED_SINGLE_PAGE_IDS_BY_HOSTNAME: Record<string, Set<number>> = {
  "huseierforbundet.no": new Set([NATIONAL_LIST_PAGE_ID]),
  "huseierforening.no": new Set([BERGEN_LIST_PAGE_ID, BERGEN_ABM_PAGE_ID]),
};

const NATIONAL_LIST_API_URL = wordpressPageApiUrl(
  "www.huseierforbundet.no",
  NATIONAL_LIST_PAGE_ID,
);
const NATIONAL_CHILDREN_API_URL = wordpressChildrenApiUrl(
  "www.huseierforbundet.no",
  NATIONAL_LIST_PAGE_ID,
);
const BERGEN_LIST_API_URL = wordpressPageApiUrl(
  "huseierforening.no",
  BERGEN_LIST_PAGE_ID,
);
const BERGEN_CHILDREN_API_URL = wordpressChildrenApiUrl(
  "huseierforening.no",
  BERGEN_LIST_PAGE_ID,
);
const BERGEN_ABM_API_URL = wordpressPageApiUrl(
  "huseierforening.no",
  BERGEN_ABM_PAGE_ID,
);

const NATIONAL_TERMS = "Krever medlemskap i Norges Huseierforbund.";
const BERGEN_TERMS = "Krever medlemskap i Bergen Huseierforening.";

const MERCHANT_NAME_BY_KEY: Record<string, string> = {
  byggstart: "Byggstart",
  "city-maid": "CityMaid",
  "dalan-advokatfirma": "Dalan Advokatfirma",
  "f-tech": "F-Tech",
  fjordkraft: "Fjordkraft",
  "rekve-pleym": "Rekve Pleym",
  solibo: "Solibo",
  "stiegler-advokatfirma": "Stiegler Advokatfirma",
  tryg: "Tryg",
  "unirad-3": "Unirad",
  "bergen-abm-taksering": "ABM Taksering",
  "bergen-citymaid": "CityMaid",
  "bergen-fjordkraft": "Fjordkraft",
  "bergen-stiegler": "Stiegler Advokatfirma",
  "bergen-tryg-forsikring": "Tryg",
};

const SKIP_HOSTNAMES = new Set([
  "huseierforbundet.no",
  "huseierforening.no",
  "boligmentoren.no",
  "blimedlem.huseierforbundet.no",
  "minside.huseierforbundet.no",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "google.com",
  "google.no",
  "apps.apple.com",
  "play.google.com",
  "schema.org",
  "limedrop.no",
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "live.no",
  "yahoo.com",
  "broadpark.no",
  "ssb.no",
  "skatteetaten.no",
  "forsinkelsesrente.no",
]);

export type FetchHuseierforbundetInput = {
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

type BenefitSource = "national" | "bergen";

type BenefitEntry = {
  source: BenefitSource;
  sourceUrl: string;
  slug: string;
  overrideKey: string;
  merchantName: string;
  teaser: string;
};

type PageLink = {
  url: string;
  domain: string;
  text: string;
};

type WordPressPage = {
  id: number;
  slug: string;
  parent: number;
  link: string;
  title: string;
  content: string;
};

export async function fetchHuseierforbundet(
  input: FetchHuseierforbundetInput,
): Promise<CashbackOffer[]> {
  input.logger.info(
    "Norges Huseierforbund: fetching public benefits from official WordPress REST APIs...",
  );

  // Both sites advertise these public wp-json representations in the Link
  // header of their benefit pages. Fetch the active list pages and their
  // published children in parallel; no login endpoint or merchant is called.
  const apiResults = await crawlWordPressApi([
    NATIONAL_LIST_API_URL,
    NATIONAL_CHILDREN_API_URL,
    BERGEN_LIST_API_URL,
    BERGEN_CHILDREN_API_URL,
    BERGEN_ABM_API_URL,
  ], input.logger);

  const entries: BenefitEntry[] = [];
  const prefetchedDetails: WordPressPage[] = [];
  const nationalListPage = apiPage(apiResults, NATIONAL_LIST_API_URL);
  const nationalChildren = apiPages(apiResults, NATIONAL_CHILDREN_API_URL);
  const bergenListPage = apiPage(apiResults, BERGEN_LIST_API_URL);
  const bergenChildren = apiPages(apiResults, BERGEN_CHILDREN_API_URL);
  const bergenAbmPage = apiPage(apiResults, BERGEN_ABM_API_URL);

  if (nationalListPage !== undefined) {
    entries.push(...extractNationalEntries(nationalListPage.content));
  } else {
    input.logger.warn(
      `Norges Huseierforbund: could not load official API ${NATIONAL_LIST_API_URL}`,
    );
  }

  if (nationalChildren !== undefined) {
    prefetchedDetails.push(...nationalChildren);
  } else {
    input.logger.warn(
      `Norges Huseierforbund: could not load official API ${NATIONAL_CHILDREN_API_URL}`,
    );
  }

  if (bergenListPage !== undefined) {
    entries.push(...extractBergenEntries(bergenListPage.content));
  } else {
    input.logger.warn(
      `Norges Huseierforbund: could not load official API ${BERGEN_LIST_API_URL}`,
    );
  }

  if (bergenChildren !== undefined) {
    prefetchedDetails.push(...bergenChildren);
  } else {
    input.logger.warn(
      `Norges Huseierforbund: could not load official API ${BERGEN_CHILDREN_API_URL}`,
    );
  }

  if (bergenAbmPage !== undefined) {
    prefetchedDetails.push(bergenAbmPage);
  } else {
    input.logger.warn(
      `Norges Huseierforbund: could not load official API ${BERGEN_ABM_API_URL}`,
    );
  }

  if (entries.length === 0) {
    throw new Error(
      "Norges Huseierforbund: official REST benefit lists contained no offers",
    );
  }

  const nationalCount = entries.filter((entry) => entry.source === "national").length;
  const bergenCount = entries.length - nationalCount;
  input.logger.info(
    `Norges Huseierforbund: found ${nationalCount} national and ${bergenCount} Bergen benefit pages`,
  );

  const details = await resolveApiDetails(entries, prefetchedDetails, input.logger);
  const offers: CashbackOffer[] = [];
  let fromContent = 0;
  let lookedUp = 0;
  let overrideCount = 0;

  for (const { entry, html } of details) {
    const mainHtml = extractMainHtml(html);
    const text = pageText(mainHtml);

    let domains = (input.overrides.huseierforbundet?.[entry.overrideKey] ?? [])
      .map(normalizeDomainInput);
    if (domains.length > 0) {
      overrideCount++;
    }

    if (domains.length === 0) {
      domains = resolveDomainsFromContent(entry, mainHtml, text);
      if (domains.length > 0) fromContent++;
    }

    if (domains.length === 0) {
      for (const name of lookupNamesForEntry(entry)) {
        domains = lookupDomains(input.domainLookup, name);
        if (domains.length > 0) {
          lookedUp++;
          break;
        }
      }
    }

    if (domains.length === 0) {
      input.logger.warn(
        `Norges Huseierforbund offer has no domain: ${entry.merchantName} (${entry.overrideKey})`,
      );
      continue;
    }

    const detailReward = extractBenefitReward(normalizeRewardGrammar(text));
    const teaserReward = extractBenefitReward(normalizeRewardGrammar(entry.teaser));
    offers.push({
      provider: "huseierforbundet",
      merchantName: entry.merchantName,
      domains: uniqueStrings(
        domains.flatMap((domain) => merchantDomainsFromHostname(domain)),
      ),
      // Detail pages are more specific and are maintained independently of
      // their card teasers, so prefer the detail value when the two disagree.
      reward: detailReward || teaserReward || "Medlemsfordel",
      sourceUrl: entry.sourceUrl,
      // The official detail page contains the member-specific activation route.
      // Linking there also avoids leaking tracking parameters or codes from partner links.
      activationUrl: entry.sourceUrl,
      terms: buildTerms(entry, text, detailReward !== ""),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(
    `Norges Huseierforbund: resolved ${fromContent} via public API content, ${lookedUp} via lookup, ${overrideCount} via overrides`,
  );
  const unique = uniqueOffers(offers);
  input.logger.info(
    `Norges Huseierforbund: produced ${unique.length} unique offers from ${offers.length} resolved pages`,
  );
  return unique;
}

type WordPressApiValue = WordPressPage | WordPressPage[];

async function crawlWordPressApi(
  urls: string[],
  logger: Logger,
): Promise<Map<string, WordPressApiValue>> {
  for (const url of urls) {
    if (!isAllowedWordPressApiUrl(url)) {
      throw new Error(`Norges Huseierforbund refused non-allowlisted API URL: ${url}`);
    }
  }

  const values = new Map<string, WordPressApiValue>();
  const storage = new MemoryStorage({ persistStorage: false });
  const config = new Configuration();
  config.useStorageClient(storage);

  const crawler = new HttpCrawler({
    maxConcurrency: DETAIL_CONCURRENCY,
    maxRequestRetries: 1,
    maxRequestsPerCrawl: urls.length,
    preNavigationHooks: [({ request }, gotOptions) => {
      if (!isAllowedWordPressApiUrl(request.url)) {
        throw new Error(
          `Norges Huseierforbund refused non-allowlisted API URL: ${request.url}`,
        );
      }
      // Never follow an official API URL to a different network target.
      gotOptions.followRedirect = false;
    }],
    requestHandler: async ({ body, request, response }) => {
      const statusCode = response.statusCode ?? 0;
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(
          `Norges Huseierforbund returned ${statusCode} for ${request.url}`,
        );
      }

      const loadedUrl = request.loadedUrl ?? request.url;
      if (!isAllowedWordPressApiUrl(loadedUrl)) {
        throw new Error(
          `Norges Huseierforbund refused non-allowlisted API redirect: ${loadedUrl}`,
        );
      }

      const rawBody = Buffer.isBuffer(body) ? body.toString("utf8") : String(body);
      const value: unknown = JSON.parse(rawBody);
      const parsedValue = parseWordPressApiValue(value, apiHostname(request.url));
      if (parsedValue === undefined) {
        throw new Error(`Norges Huseierforbund returned invalid API data from ${request.url}`);
      }
      values.set(apiUrlKey(request.url), parsedValue);
    },
    failedRequestHandler: async ({ request, error }) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Norges Huseierforbund: failed official API ${request.url}: ${message}`);
    },
  }, config);

  await crawler.run(urls.map((url) => ({
    url,
    uniqueKey: apiUrlKey(url),
    headers: { Accept: "application/json" },
  })));
  return values;
}

function apiPage(
  values: Map<string, WordPressApiValue>,
  url: string,
): WordPressPage | undefined {
  const value = values.get(apiUrlKey(url));
  return value !== undefined && !Array.isArray(value) ? value : undefined;
}

function apiPages(
  values: Map<string, WordPressApiValue>,
  url: string,
): WordPressPage[] | undefined {
  const value = values.get(apiUrlKey(url));
  return Array.isArray(value) ? value : undefined;
}

function isOfficialPageUrl(url: string): boolean {
  const parsed = parseUrl(url);
  return parsed !== undefined &&
    parsed.protocol === "https:" &&
    parsed.username === "" &&
    parsed.password === "" &&
    parsed.port === "" &&
    OFFICIAL_HOSTNAMES.has(normalizeDomainInput(parsed.hostname));
}

function wordpressPageApiUrl(hostname: string, pageId: number): string {
  const url = new URL(`https://${hostname}/wp-json/wp/v2/pages/${pageId}`);
  url.searchParams.set("_fields", WORDPRESS_FIELDS);
  return url.toString();
}

function wordpressChildrenApiUrl(hostname: string, parentId: number): string {
  const url = new URL(`https://${hostname}/wp-json/wp/v2/pages`);
  url.searchParams.set("parent", String(parentId));
  url.searchParams.set("per_page", "100");
  url.searchParams.set("_fields", WORDPRESS_FIELDS);
  return url.toString();
}

function wordpressSlugApiUrl(hostname: string, slug: string): string {
  const url = new URL(`https://${hostname}/wp-json/wp/v2/pages`);
  url.searchParams.set("slug", slug);
  url.searchParams.set("_fields", WORDPRESS_FIELDS);
  return url.toString();
}

function isAllowedWordPressApiUrl(url: string): boolean {
  const parsed = parseUrl(url);
  if (
    parsed === undefined ||
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.port !== "" ||
    parsed.hash !== ""
  ) {
    return false;
  }

  const hostname = normalizeDomainInput(parsed.hostname);
  const listPageId = LIST_PAGE_ID_BY_HOSTNAME[hostname];
  if (listPageId === undefined) return false;
  if (parsed.searchParams.get("_fields") !== WORDPRESS_FIELDS) return false;

  const singlePageMatch = parsed.pathname.match(/^\/wp-json\/wp\/v2\/pages\/(\d+)$/);
  const singlePageId = Number(singlePageMatch?.[1]);
  if (ALLOWED_SINGLE_PAGE_IDS_BY_HOSTNAME[hostname]?.has(singlePageId)) {
    return hasExactSearchParams(parsed, ["_fields"]);
  }

  if (parsed.pathname !== "/wp-json/wp/v2/pages") return false;

  const parent = parsed.searchParams.get("parent");
  if (parent !== null) {
    return parent === String(listPageId) &&
      parsed.searchParams.get("per_page") === "100" &&
      hasExactSearchParams(parsed, ["_fields", "parent", "per_page"]);
  }

  const slug = parsed.searchParams.get("slug");
  return slug !== null &&
    /^[a-z0-9-]+$/.test(slug) &&
    hasExactSearchParams(parsed, ["_fields", "slug"]);
}

function hasExactSearchParams(url: URL, expected: string[]): boolean {
  const keys = [...url.searchParams.keys()];
  return keys.length === expected.length &&
    expected.every((key) => url.searchParams.getAll(key).length === 1);
}

function apiHostname(url: string): string {
  const parsed = parseUrl(url);
  if (parsed === undefined) return "";
  return normalizeDomainInput(parsed.hostname);
}

function apiUrlKey(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.sort();
  return parsed.toString();
}

function parseWordPressApiValue(
  value: unknown,
  expectedHostname: string,
): WordPressApiValue | undefined {
  if (Array.isArray(value)) {
    const pages = value.map((item) => parseWordPressPage(item, expectedHostname));
    return pages.some((page) => page === undefined)
      ? undefined
      : pages as WordPressPage[];
  }
  return parseWordPressPage(value, expectedHostname);
}

function parseWordPressPage(
  value: unknown,
  expectedHostname: string,
): WordPressPage | undefined {
  if (!isRecord(value) || !isRecord(value.title) || !isRecord(value.content)) {
    return undefined;
  }

  const link = typeof value.link === "string" ? value.link : "";
  const parsedLink = parseUrl(link);
  if (
    !Number.isInteger(value.id) ||
    typeof value.slug !== "string" ||
    !/^[a-z0-9-]+$/.test(value.slug) ||
    value.status !== "publish" ||
    !Number.isInteger(value.parent) ||
    typeof value.title.rendered !== "string" ||
    typeof value.content.rendered !== "string" ||
    value.content.protected !== false ||
    parsedLink === undefined ||
    !isOfficialPageUrl(link) ||
    normalizeDomainInput(parsedLink.hostname) !== expectedHostname
  ) {
    return undefined;
  }

  return {
    id: value.id as number,
    slug: value.slug,
    parent: value.parent as number,
    link: canonicalPageUrl(parsedLink),
    title: normalizeText(stripHtml(value.title.rendered)),
    content: value.content.rendered,
  };
}

function extractNationalEntries(html: string): BenefitEntry[] {
  const entries: BenefitEntry[] = [];
  const seen = new Set<string>();

  for (const link of extractLinks(extractMainHtml(html), NATIONAL_LIST_URL, false)) {
    const parsed = parseUrl(link.url);
    if (parsed === undefined || normalizeDomainInput(parsed.hostname) !== "huseierforbundet.no") {
      continue;
    }

    const match = parsed.pathname.match(/^\/medlemsfordeler\/([a-z0-9-]+)\/?$/i);
    const slug = match?.[1]?.toLowerCase();
    if (!slug || seen.has(slug)) continue;

    seen.add(slug);
    const overrideKey = slug;
    entries.push({
      source: "national",
      sourceUrl: canonicalPageUrl(parsed),
      slug,
      overrideKey,
      merchantName: MERCHANT_NAME_BY_KEY[overrideKey] ?? titleFromSlug(slug),
      teaser: "",
    });
  }

  return entries;
}

function extractBergenEntries(html: string): BenefitEntry[] {
  const mainHtml = extractMainHtml(html);
  const headings: Array<{
    start: number;
    end: number;
    name: string;
    url?: URL;
  }> = [];
  const headingPattern = /<h2\b[^>]*>\s*<a\b([^>]*)>([\s\S]*?)<\/a>\s*<\/h2>/gi;

  for (const match of mainHtml.matchAll(headingPattern)) {
    const start = match.index ?? 0;
    const href = readHref(match[1] ?? "");
    const name = normalizeText(stripHtml(match[2] ?? ""));
    const parsed = href ? parseUrl(new URL(decodeHtmlAttribute(href), BERGEN_LIST_URL).toString()) : undefined;
    headings.push({
      start,
      end: start + match[0].length,
      name,
      ...(parsed !== undefined ? { url: parsed } : {}),
    });
  }

  const entries: BenefitEntry[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index];
    if (heading === undefined || !heading.name || heading.url === undefined) continue;
    if (!isBergenBenefitUrl(heading.url)) continue;

    const slug = slugFromPath(heading.url.pathname);
    if (!slug || seen.has(slug)) continue;

    const nextStart = headings[index + 1]?.start ?? mainHtml.length;
    const teaser = pageText(mainHtml.slice(heading.end, nextStart));
    const overrideKey = `bergen-${slug}`;

    seen.add(slug);
    entries.push({
      source: "bergen",
      sourceUrl: canonicalPageUrl(heading.url),
      slug,
      overrideKey,
      merchantName: MERCHANT_NAME_BY_KEY[overrideKey] ?? heading.name,
      teaser: trimBergenTeaser(teaser),
    });
  }

  return entries;
}

function isBergenBenefitUrl(url: URL): boolean {
  if (normalizeDomainInput(url.hostname) !== "huseierforening.no") return false;

  const path = normalizePath(url.pathname);
  return /^\/samarbeidspartnere\/[a-z0-9-]+\/$/i.test(path) ||
    path === "/abm-taksering/";
}

function trimBergenTeaser(value: string): string {
  const cutIndex = value.search(/^bruk medlemsfordelene\b/im);
  return cutIndex === -1 ? value : value.slice(0, cutIndex).trim();
}

async function resolveApiDetails(
  entries: BenefitEntry[],
  prefetchedPages: WordPressPage[],
  logger: Logger,
): Promise<Array<{ entry: BenefitEntry; html: string }>> {
  const contentByUrl = new Map<string, string>();
  for (const page of prefetchedPages) {
    contentByUrl.set(page.link, page.content);
  }

  const missingEntries = entries.filter((entry) => !contentByUrl.has(entry.sourceUrl));
  const missingApiUrls = uniqueStrings(missingEntries.map((entry) => {
    const source = parseUrl(entry.sourceUrl);
    return wordpressSlugApiUrl(source?.hostname ?? "", entry.slug);
  }));

  if (missingApiUrls.length > 0) {
    const crawled = await crawlWordPressApi(missingApiUrls, logger);
    for (const entry of missingEntries) {
      const source = parseUrl(entry.sourceUrl);
      if (source === undefined) continue;
      const apiUrl = wordpressSlugApiUrl(source.hostname, entry.slug);
      const pages = apiPages(crawled, apiUrl) ?? [];
      const matchingPage = pages.find((page) => page.link === entry.sourceUrl);
      if (matchingPage !== undefined) {
        contentByUrl.set(entry.sourceUrl, matchingPage.content);
      }
    }
  }

  return entries.map((entry) => {
    const html = contentByUrl.get(entry.sourceUrl) ?? "";
    if (html === "") {
      logger.warn(
        `Norges Huseierforbund: official API had no detail content for ${entry.sourceUrl}`,
      );
    }
    return { entry, html };
  });
}

function resolveDomainsFromContent(
  entry: BenefitEntry,
  html: string,
  text: string,
): string[] {
  const links = extractLinks(html, entry.sourceUrl, true);
  const nameKey = normalizeKey(entry.merchantName);
  const slugKey = normalizeKey(entry.slug);
  const scoredLinks = links.map((link) => ({
    link,
    score: scoreMerchantLink(link, nameKey, slugKey),
  }));
  const bestScore = Math.max(0, ...scoredLinks.map(({ score }) => score));

  if (bestScore >= 50) {
    return uniqueStrings(
      scoredLinks
        .filter(({ score }) => score === bestScore)
        .map(({ link }) => link.domain),
    );
  }

  const textDomains = extractTextDomains(text);
  const matchingTextDomains = textDomains.filter((domain) => {
    const label = normalizeKey(toBaseDomain(domain).split(".")[0] ?? domain);
    return label.length >= 3 &&
      (nameKey.includes(label) || label.includes(nameKey) || slugKey.includes(label));
  });
  if (matchingTextDomains.length > 0) return uniqueStrings(matchingTextDomains);

  const candidateDomains = uniqueStrings([
    ...links.map((link) => link.domain),
    ...textDomains,
  ]);
  const baseDomains = uniqueStrings(candidateDomains.map(toBaseDomain));
  return baseDomains.length === 1 ? candidateDomains : [];
}

function scoreMerchantLink(
  link: PageLink,
  nameKey: string,
  slugKey: string,
): number {
  const label = normalizeKey(toBaseDomain(link.domain).split(".")[0] ?? link.domain);
  const linkTextKey = normalizeKey(link.text);

  if (
    label.length >= 3 &&
    (nameKey.includes(label) || label.includes(nameKey) || slugKey.includes(label))
  ) {
    return 100;
  }

  if (nameKey.length >= 3 && linkTextKey.includes(nameKey)) {
    return /\b(?:nettside|hjemmeside|bestill|besøk|gå til|les mer hos)\b/i.test(link.text)
      ? 80
      : 50;
  }

  return 0;
}

function extractLinks(
  html: string,
  baseUrl: string,
  externalOnly: boolean,
): PageLink[] {
  const links: PageLink[] = [];
  const seen = new Set<string>();
  const anchorPattern = /<a\b[^>]*href=(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const rawHref = decodeHtmlAttribute(match[1] ?? match[2] ?? "");
    if (!rawHref || /^(?:mailto|tel|javascript):/i.test(rawHref)) continue;

    let parsed: URL;
    try {
      parsed = new URL(rawHref, baseUrl);
    } catch {
      continue;
    }

    if (!/^https?:$/.test(parsed.protocol)) continue;
    if (/\.(?:jpe?g|png|gif|svg|webp|avif|mp4|pdf|css|js)$/i.test(parsed.pathname)) {
      continue;
    }

    const domain = normalizeDomainInput(parsed.hostname);
    if (externalOnly && isSkippedHostname(domain)) continue;

    const key = `${parsed.toString()}\n${normalizeText(stripHtml(match[3] ?? ""))}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({
      url: parsed.toString(),
      domain,
      text: normalizeText(stripHtml(match[3] ?? "")),
    });
  }

  return links;
}

function extractTextDomains(text: string): string[] {
  const domains: string[] = [];
  const pattern = /\b(?:[a-z0-9æøå-]+\.)+(?:no|com|net|org|app|as|io|eu)\b/gi;

  for (const match of text.matchAll(pattern)) {
    const domain = normalizeDomainInput(transliterateNorwegian(match[0] ?? ""));
    if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain)) continue;
    if (isSkippedHostname(domain)) continue;
    domains.push(domain);
  }

  return uniqueStrings(domains);
}

function buildTerms(
  entry: BenefitEntry,
  detailText: string,
  detailHasReward: boolean,
): string {
  const lines = uniqueTextLines([
    ...detailText.split(/\n+/),
    ...(detailHasReward ? [] : entry.teaser.split(/\n+/)),
  ])
    .filter(isUsefulTermsLine)
    .slice(0, 6);

  return uniqueTextLines([
    ...lines,
    entry.source === "bergen" ? BERGEN_TERMS : NATIONAL_TERMS,
  ]).join("\n");
}

function isUsefulTermsLine(line: string): boolean {
  const normalized = normalizeText(line);
  if (normalized.length < 12 || normalized.length > 280) return false;
  if (containsDiscountCode(normalized) || isPageNoise(normalized)) return false;

  return /\b(?:rabatt(?:er|en)?|medlemsfordel(?:er)?|medlemspris(?:er)?|avslag|gratis|kostnadsfri|spesialavtale|prioritert|inkludert|gjelder|bindingstid|bruddgebyr|medlemmer? får|opplys om medlemskapet|kan (?:ikke|kun)|maks|inntil)\b/i
    .test(normalized);
}

function containsDiscountCode(line: string): boolean {
  return /\b(?:rabatt|kampanje|kupong|medlems|avtale)?kod(?:e|en|er|ene)\b/i.test(line) ||
    /\b(?:min(?:\s+|-)?side|mine(?:\s+|-)?sider|logg(?:e)?\s+inn|login|medlemsnummer(?:et)?|medlemsnr)\b/i.test(line);
}

function isPageNoise(line: string): boolean {
  return /^(?:medlemsfordeler|medlemsfordel|kontakt|postadresse|besøksadresse|telefon|e-?post|facebook|linkedin|bli medlem|les mer|se alle|nyttige lenker|personvern|copyright)\b/i.test(line) ||
    /(?:\{\s*|\}\s*|=>|window\.|document\.|function\s*\(|cookie|googletagmanager)/i.test(line);
}

function lookupNamesForEntry(entry: BenefitEntry): string[] {
  return uniqueTextLines([
    entry.merchantName,
    entry.merchantName.replace(/\s+(?:advokatfirma|forsikring|gruppen)\s*$/i, ""),
    titleFromSlug(entry.slug.replace(/-3$/, "")),
  ]);
}

function extractMainHtml(html: string): string {
  const main = html.match(/<main\b[^>]*>[\s\S]*?<\/main>/i);
  if (main?.[0]) return main[0];

  const aviaStart = html.search(/<div\s+id=(?:"main"|'main')[^>]*>/i);
  if (aviaStart !== -1) {
    const aviaEnd = html.indexOf("<!-- end main -->", aviaStart);
    if (aviaEnd !== -1) return html.slice(aviaStart, aviaEnd);
  }

  return html;
}

function pageText(html: string): string {
  return stripHtml(
    html
      .replace(/\[\/?[a-z][^\]]*\]/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, " ")
      .replace(/<\/(?:h[1-6]|div|section|article)>/gi, "\n"),
  )
    .split(/\n+/)
    .map(normalizeText)
    .filter(Boolean)
    .join("\n");
}

function normalizeRewardGrammar(value: string): string {
  return value
    .replace(/(\d{1,3}(?:[,.]\d+)?)\s+prosents\b/gi, "$1 prosent")
    .replace(/(\d[\d\s]*(?:[,.]\d+)?)\s+kroners\b/gi, "$1 kroner");
}

function canonicalPageUrl(url: URL): string {
  const canonical = new URL(url.toString());
  canonical.hash = "";
  canonical.search = "";
  return canonical.toString();
}

function readHref(attributes: string): string {
  return attributes.match(/\bhref\s*=\s*"([^"]*)"/i)?.[1] ??
    attributes.match(/\bhref\s*=\s*'([^']*)'/i)?.[1] ??
    "";
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&#0*38;/gi, "&")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#0*39;/gi, "'");
}

function slugFromPath(path: string): string {
  return normalizePath(path).split("/").filter(Boolean).at(-1)?.toLowerCase() ?? "";
}

function normalizePath(path: string): string {
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

function titleFromSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isSkippedHostname(hostname: string): boolean {
  const normalized = normalizeDomainInput(hostname);
  return SKIP_HOSTNAMES.has(normalized) ||
    [...SKIP_HOSTNAMES].some((skipped) => normalized.endsWith(`.${skipped}`));
}

function transliterateNorwegian(value: string): string {
  return value
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a");
}

function normalizeKey(value: string): string {
  return transliterateNorwegian(normalizeText(value))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueTextLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const line of lines) {
    const normalized = normalizeText(line);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}
