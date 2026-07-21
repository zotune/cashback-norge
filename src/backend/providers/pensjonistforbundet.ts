// This file extracts publicly described member benefits from Pensjonistforbundet.
// It deliberately ignores member-only discount-code fields embedded in Next.js data.
import {
  Configuration,
  HttpCrawler,
  MemoryStorage,
  Request,
} from "crawlee";
import {
  isRecord,
  type CashbackOffer,
  normalizeDomainInput,
  parseUrl,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import { extractBenefitReward } from "../../shared/reward.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import { merchantDomainsFromHostname } from "../merchant-domains.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const SITE_ORIGIN = "https://www.pensjonistforbundet.no";
const LIST_URL = `${SITE_ORIGIN}/medlemsfordeler`;
const DEFAULT_TERMS = "Krever medlemskap i Pensjonistforbundet.";

const MERCHANT_NAME_BY_SLUG: Record<string, string> = {
  "treningsreiser-med-springtime": "Springtime",
  "online-trening-utviklet-av-fysioterapeuter": "iSteady",
  "fotefar-temareiser": "Fotefar Temareiser",
  apollo: "Apollo",
  "strykekvartett-i-bergen-og-oslo": "Oslo Quartet Series / Bergen Kammermusikkforening",
  solskjerming: "Fasadeprodukter",
  solgarden: "Solgården",
  "rabatt-pa-tannlege": "Smil / Clear tannlegesenter",
  "opel-og-citroen": "Mobile",
  "online-psykolog-og-fysioterapi": "Eyr",
  "nortrip-guiden": "Nortrip",
  "toyota-og-lexus": "Toyota / Lexus",
  "laering-gjort-enkelt-og-tilgjengelig-via-nett": "Senioruni",
  "seniorstrom-fra-ishavskraft": "Ishavskraft",
  "sklisikkert-underlag-hele-aret": "IsFritt",
  hurtigruten: "Boreal Adventure / Hurtigruten",
  "hotellavtale-med-thon": "Thon Hotels",
  hjertestarter: "Trygg Partner",
  "hjelpemidler-til-hus-og-hjem": "Velferdsbutikken",
  "dfds-til-danmark": "Go Nordic Cruiseline",
  "flytevest-redningsselskapet": "Redningsselskapet",
  "se-film-med-medlemsrabatt": "Filmweb Kinoklubb",
  "nyhet-filmweb-kinogavekort": "Filmweb kinogavekort",
  "briller-og-solbriller": "Extra Optical",
};

// The public Filmweb entry describes Kinoklubben but its CMS button references
// are not expanded in the list payload. Keep the official storefront explicit
// so this active offer does not depend on another provider's domain lookup.
const FALLBACK_DOMAINS_BY_SLUG: Record<string, string[]> = {
  "se-film-med-medlemsrabatt": ["kinoklubb.no"],
};

const SKIP_HOSTNAMES = new Set([
  "pensjonistforbundet.no",
  "images.ctfassets.net",
  "ctfassets.net",
  "safelinks.protection.outlook.com",
  "smartepenger.no",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "vimeo.com",
  "google.com",
  "google.no",
  "apple.com",
  "apps.apple.com",
  "play.google.com",
]);

export type FetchPensjonistforbundetInput = {
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

type RawBenefit = Record<string, unknown> & {
  contentType?: unknown;
  title?: unknown;
  slug?: unknown;
  summary?: unknown;
  ingress?: unknown;
  highlight?: unknown;
  content?: unknown;
  modules?: unknown;
};

export async function fetchPensjonistforbundet(
  input: FetchPensjonistforbundetInput,
): Promise<CashbackOffer[]> {
  input.logger.info("Pensjonistforbundet: fetching public member benefits...");

  const html = await fetchOfficialPage(LIST_URL);
  const benefits = readBenefits(html);
  input.logger.info(`Pensjonistforbundet: found ${benefits.length} public benefit entries`);

  const offers: CashbackOffer[] = [];
  let fromContent = 0;
  let lookedUp = 0;
  let overrideCount = 0;
  let fallbackCount = 0;
  let closedCount = 0;

  for (const benefit of benefits) {
    const slug = readString(benefit.slug);
    const title = normalizeText(readString(benefit.title));
    if (!isSafeSlug(slug) || title === "") continue;

    const summary = readString(benefit.summary);
    const ingress = readString(benefit.ingress);
    const highlight = readString(benefit.highlight);
    const content = readString(benefit.content);
    const topLevelText = [title, summary, ingress, highlight, content].join("\n");

    if (isClosedBenefit(topLevelText)) {
      closedCount++;
      continue;
    }

    const slugKey = slug.toLowerCase();
    const sourceUrl = `${SITE_ORIGIN}/medlemsfordeler/${encodeURIComponent(slug)}`;
    const merchantName = MERCHANT_NAME_BY_SLUG[slugKey] ?? cleanMerchantName(title);
    const publicStrings = collectPublicStrings([
      title,
      summary,
      ingress,
      highlight,
      content,
      benefit.modules,
    ]);

    let domains = (input.overrides.pensjonistforbundet?.[slugKey] ?? [])
      .map(normalizeDomainInput)
      .filter(isAllowedMerchantHostname);
    if (domains.length > 0) overrideCount++;

    if (domains.length === 0) {
      domains = extractMerchantDomains(publicStrings);
      if (domains.length > 0) fromContent++;
    }

    if (domains.length === 0) {
      for (const lookupName of lookupNames(merchantName, title)) {
        domains = lookupDomains(input.domainLookup, lookupName)
          .map(normalizeDomainInput)
          .filter(isAllowedMerchantHostname);
        if (domains.length > 0) {
          lookedUp++;
          break;
        }
      }
    }

    if (domains.length === 0) {
      domains = (FALLBACK_DOMAINS_BY_SLUG[slugKey] ?? [])
        .map(normalizeDomainInput)
        .filter(isAllowedMerchantHostname);
      if (domains.length > 0) fallbackCount++;
    }

    domains = uniqueStrings(
      domains.flatMap((domain) => merchantDomainsFromHostname(domain)),
    );

    if (domains.length === 0) {
      input.logger.warn(
        `Pensjonistforbundet benefit has no domain: ${merchantName} (${slug})`,
      );
      continue;
    }

    const reward = extractPublicReward(
      highlight,
      [summary, ingress, content].join("\n"),
    );

    offers.push({
      provider: "pensjonistforbundet",
      merchantName,
      domains,
      reward,
      sourceUrl,
      activationUrl: sourceUrl,
      terms: buildTerms(summary, ingress, content),
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(
    `Pensjonistforbundet: resolved ${fromContent} via public content, ${lookedUp} via lookup, ${overrideCount} via overrides, ${fallbackCount} via safe fallback`,
  );
  input.logger.info(
    `Pensjonistforbundet: produced ${offers.length} offers; skipped ${closedCount} closed entries`,
  );
  return uniqueOffers(offers);
}

async function fetchOfficialPage(url: string): Promise<string> {
  if (!isAllowedOfficialUrl(url)) {
    throw new Error(`Pensjonistforbundet refused non-official URL: ${url}`);
  }

  const storage = new MemoryStorage({ persistStorage: false });
  const crawlerConfig = new Configuration();
  crawlerConfig.useStorageClient(storage);
  let html: string | undefined;

  const crawler = new HttpCrawler({
    maxConcurrency: 1,
    maxRequestRetries: 2,
    maxRequestsPerCrawl: 1,
    requestHandlerTimeoutSecs: 30,
    preNavigationHooks: [({ request }, options) => {
      if (!isAllowedOfficialUrl(request.url)) {
        throw new Error(
          `Pensjonistforbundet refused non-official request URL: ${request.url}`,
        );
      }
      // The crawler must never follow an official page to another network target.
      options.followRedirect = false;
    }],
    requestHandler: async ({ body, request, response }) => {
      const loadedUrl = request.loadedUrl ?? request.url;
      if (!isAllowedOfficialUrl(loadedUrl)) {
        throw new Error(
          `Pensjonistforbundet returned a non-official response URL: ${loadedUrl}`,
        );
      }

      const statusCode = response.statusCode ?? 0;
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(
          `Pensjonistforbundet returned ${statusCode} for ${request.url}`,
        );
      }

      html = Buffer.isBuffer(body) ? body.toString("utf8") : body;
    },
  }, crawlerConfig);

  await crawler.run([new Request({
    url,
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "CashbackNorge/1.0",
    },
  })]);

  if (html === undefined) {
    throw new Error(`Pensjonistforbundet crawler received no page from ${url}`);
  }
  return html;
}

function isAllowedOfficialUrl(url: string): boolean {
  const parsed = parseUrl(url);
  if (parsed === undefined || parsed.origin !== SITE_ORIGIN) return false;
  return parsed.pathname === "/medlemsfordeler" ||
    /^\/medlemsfordeler\/[A-Za-z0-9-]+\/?$/.test(parsed.pathname);
}

function readBenefits(html: string): RawBenefit[] {
  const match = html.match(
    /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (match === null) {
    throw new Error("Pensjonistforbundet page contained no __NEXT_DATA__");
  }

  let data: unknown;
  try {
    data = JSON.parse(match[1] ?? "");
  } catch {
    throw new Error("Pensjonistforbundet page contained invalid __NEXT_DATA__");
  }

  if (!isRecord(data) || !isRecord(data.props) || !isRecord(data.props.pageProps)) {
    throw new Error("Pensjonistforbundet page contained unexpected Next.js data");
  }

  const pageProps = data.props.pageProps;
  const rawBenefits = Array.isArray(pageProps.allBenefits)
    ? pageProps.allBenefits
    : Array.isArray(pageProps.benefitsData)
    ? pageProps.benefitsData
    : [];

  const benefits = rawBenefits.filter((value): value is RawBenefit => {
    return isRecord(value) &&
      (value.contentType === undefined || value.contentType === "memberBenefit");
  });
  if (benefits.length === 0) {
    throw new Error("Pensjonistforbundet Next.js data contained no member benefits");
  }
  return benefits;
}

/**
 * Traverse public content for merchant URLs, but never enter the member-benefit
 * module that carries codes intended for signed-in members.
 */
function collectPublicStrings(value: unknown): string[] {
  const values: string[] = [];

  const visit = (current: unknown, key = ""): void => {
    if (isSensitiveField(key)) return;
    if (typeof current === "string") {
      values.push(current);
      return;
    }
    if (Array.isArray(current)) {
      for (const item of current) visit(item);
      return;
    }
    if (!isRecord(current)) return;
    for (const [childKey, childValue] of Object.entries(current)) {
      visit(childValue, childKey);
    }
  };

  visit(value);
  return values;
}

function isSensitiveField(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
  return normalized === "discountcode" ||
    normalized === "couponcode" ||
    normalized === "memberbenefit" ||
    normalized === "memberbenefitmodule" ||
    normalized === "shortbenefittext";
}

function extractMerchantDomains(strings: string[]): string[] {
  const domains: string[] = [];

  for (const text of strings) {
    for (const match of text.matchAll(/https?:\/\/[^\s)\]>"']+/gi)) {
      const domain = domainFromPublicUrl(match[0] ?? "");
      if (domain !== undefined) domains.push(domain);
    }

    // Do not mistake percent-encoded URL fragments such as "%2Fwww.example.no"
    // for a literal hostname. URLs are handled (and unwrapped) above.
    const textWithoutUrls = text.replace(/https?:\/\/\S+/gi, " ");
    for (const match of textWithoutUrls.matchAll(
      /\b(?:[a-z0-9æøå-]+\.)+(?:no|com|se|dk|net|org|app|md)\b/gi,
    )) {
      const domain = normalizeDomainInput(transliterateNorwegian(match[0] ?? ""));
      if (isAllowedMerchantHostname(domain)) domains.push(domain);
    }
  }

  return uniqueStrings(domains);
}

function extractPublicReward(highlight: string, text: string): string {
  const normalizedHighlight = normalizeThousands(highlight);
  const highlightedReward = extractBenefitReward(normalizedHighlight);
  if (highlightedReward !== "" && highlightedReward !== "Rabatt") {
    return highlightedReward;
  }

  // The site uses headings such as "2.000 i rabatt" while its public summary
  // confirms that the amount is kroner. Preserve that prominent public rate.
  const amountMatch = normalizedHighlight.match(
    /\b(\d[\d ]*)\s+(?:i\s+)?rabatt\b/i,
  );
  if (amountMatch !== null && /\b(?:kr|kroner)\b/i.test(normalizeThousands(text))) {
    const amount = Number.parseInt((amountMatch[1] ?? "").replace(/\s+/g, ""), 10);
    if (Number.isFinite(amount) && amount > 0) {
      return `${amount.toLocaleString("nb-NO").replace(/[\u00a0\u202f]/g, " ")} kr`;
    }
  }

  return extractBenefitReward(normalizeThousands(text)) || highlightedReward || "Medlemsfordel";
}

function normalizeThousands(value: string): string {
  return value.replace(/(\d)\.(?=\d{3}\b)/g, "$1");
}

function domainFromPublicUrl(rawUrl: string): string | undefined {
  let parsed = parseUrl(rawUrl.replace(/[.,;:!?]+$/, ""));
  if (parsed === undefined) return undefined;

  const hostname = normalizeDomainInput(parsed.hostname);
  if (hostname.endsWith("safelinks.protection.outlook.com")) {
    const target = parsed.searchParams.get("url");
    if (target === null) return undefined;
    parsed = parseUrl(target);
    if (parsed === undefined) return undefined;
  }

  const domain = normalizeDomainInput(parsed.hostname);
  return isAllowedMerchantHostname(domain) ? domain : undefined;
}

function isAllowedMerchantHostname(hostname: string): boolean {
  const normalized = normalizeDomainInput(hostname);
  if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(normalized)) return false;
  return ![...SKIP_HOSTNAMES].some((skipped) => {
    return normalized === skipped || normalized.endsWith(`.${skipped}`);
  });
}

function buildTerms(summary: string, ingress: string, content: string): string {
  const lines = uniqueTextLines([
    summary,
    ingress,
    ...content.split(/\n+/).filter(isUsefulTermsLine),
  ]).slice(0, 6);
  lines.push(DEFAULT_TERMS);
  return uniqueTextLines(lines).join("\n");
}

function isUsefulTermsLine(line: string): boolean {
  const cleaned = sanitizePublicLine(line);
  if (cleaned.length < 8 || cleaned.length > 280) return false;
  if (isForbiddenPublicLine(cleaned)) return false;
  return /\b(?:rabatt(?:er|en)?|medlemspris(?:er)?|halv\s+pris|avslag|spar|gjelder|kan ikke|maks|inntil|opptil|per person|bestillingsperiode|tilbud(?:et)?)\b/i.test(cleaned);
}

function uniqueTextLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const line of lines) {
    const cleaned = sanitizePublicLine(line);
    if (cleaned === "" || isForbiddenPublicLine(cleaned) || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
  }
  return result;
}

function sanitizePublicLine(value: string): string {
  return normalizeText(
    value
      .replace(/\[([^\]]+)]\((?:https?:\/\/|mailto:|tel:)[^)]+\)/gi, "$1")
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/^#{1,6}\s*/, "")
      .replace(/^[-*•–]\s*/, "")
      .replace(/[_*`]+/g, ""),
  );
}

function isForbiddenPublicLine(line: string): boolean {
  return /smarte\s*penger|smartepenger\.no/i.test(line) ||
    /\b(?:rabattkode(?:n)?|kampanjekode(?:n)?|kupongkode(?:n)?|kodeord(?:et)?|koden?)\b/i.test(line);
}

function isClosedBenefit(text: string): boolean {
  return /\b(?:avtalen|samarbeidsavtalen|medlemsfordelen|tilbudet)\s+(?:er\s+)?avsluttet\b/i.test(text);
}

function lookupNames(merchantName: string, title: string): string[] {
  return uniqueTextLines([
    merchantName,
    ...merchantName.split(/\s*\/\s*/),
    title,
    title.replace(/^rabatt\s+(?:hos|på)\s+/i, ""),
  ]);
}

function cleanMerchantName(title: string): string {
  return normalizeText(title)
    .replace(/^rabatt\s+(?:hos|på)\s+/i, "")
    .replace(/^medlemsfordel(?:er)?\s+(?:hos|på|fra)\s+/i, "");
}

function isSafeSlug(value: string): boolean {
  return /^[A-Za-z0-9-]+$/.test(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function transliterateNorwegian(value: string): string {
  return value
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a");
}

function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
