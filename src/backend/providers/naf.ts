import { chromium } from "playwright";
import {
  type CashbackOffer,
  normalizeDomainInput,
  uniqueOffers,
  uniqueStrings,
} from "../../shared/cashback.js";
import { lookupDomains, type DomainLookup } from "../domain-lookup.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";

const LIST_URL = "https://www.naf.no/medlemskap/medlemsfordeler";

// Slug → correct brand name, for cards where NAF uses a generic category title
const SLUG_NAME_OVERRIDES: Record<string, string> = {
  "talkmore": "Talkmore",
  "bildeler": "Bildeler.no",
  "byggmakker": "Byggmakker",
  "maskinvask": "Circle K Bilvask",
  "drivstoff": "Circle K",
  "hurtiglading-circle-k": "Circle K",
  "dekk": "Bestdrive",
  "dekkhotell": "Bestdrive",
  "dekkmann-mc-dekk": "Bestdrive",
  "noddi-hjulskift": "Noddi",
  "leiebil-avis": "Avis",
  "homely": "Homely",
  "bilpleiekongen": "Bilpleiekongen",
  "naf-senter": "NAF Senter",
  "riis-bilglass": "Riis Bilglass",
  "elton": "Elton",
  "markabutikken": "Markabutikken",
  "flight-park": "Flight Park",
  "camping-norge": "Camping.no",
  "go-nordic-cruiseline": "Go Nordic Cruiseline",
  "nordkapplinjen": "Nordkapplinjen",
  "bo-sommarland": "Bø Sommarland",
  "zaptec-hjemmelader": "Zaptec",
  "garmin-mc": "Garmin",
  "bullfighter": "Bullfighter",
  "kjells-markiser-garasjeport": "Kjells Markiser",
  "kjells-markiser-solskjerming": "Kjells Markiser",
  "hallmark": "Hallmark",
  "sikker-pa-mc-kurs": "Førerutvikling.no",
};

const INTERNAL_DOMAINS = new Set([
  "naf.no",
  "sos.eu",
  "nafnettbutikk.no",
]);

const SKIP_HOSTNAMES = new Set([
  "google.com", "youtube.com", "facebook.com", "instagram.com",
  "twitter.com", "x.com", "linkedin.com", "apps.apple.com",
  "play.google.com", "clarity.microsoft.com", "cloudinary.com",
  "varify.io",
]);

const EXCLUDED_NAMES = new Set([
  "naf veihjelp", "naf forsikring", "naf billån", "naf billan",
  "naf grønt billån", "naf lease", "naf re-lease", "naf mc-lån",
  "naf caravanlån", "naf sykkel", "naf xtra", "naf veibok",
  "naf øvingsbane", "naf-kontroll", "naf magasinet", "motor magasin",
  "juridisk rådgivning", "juridisk og bilteknisk", "internasjonalt førerkort",
  "kjøpekontrakt", "nøkkelforsikring", "egenandelsforsikring", "veihjelp",
]);

function isInternal(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  return INTERNAL_DOMAINS.has(h) || h.endsWith(".naf.no") || SKIP_HOSTNAMES.has(h);
}

function isExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    EXCLUDED_NAMES.has(lower) ||
    [...EXCLUDED_NAMES].some((e) => lower.includes(e)) ||
    /^\d+\s*%\s+rabatt/i.test(lower) ||
    lower.includes("kampanje") ||
    lower.includes("tidsbegrenset")
  );
}

export type CrawlNafInput = {
  startUrl: string;
  overrides: ProviderOverrides;
  domainLookup: DomainLookup;
  generatedAt: string;
  logger: Logger;
};

export async function crawlNaf(input: CrawlNafInput): Promise<CashbackOffer[]> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  type BenefitEntry = {
    name: string;
    slug: string;
    reward: string;
    storeUrl?: string;
  };

  const benefits: BenefitEntry[] = [];

  try {
    input.logger.info("NAF: loading benefits page...");
    await page.goto(`${input.startUrl}?tabView=rabatter&query=`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(3000);

    // Click "Rabatter" tab if needed
    try {
      const tab = page.locator('button:has-text("Rabatter"), [role="tab"]:has-text("Rabatter")').first();
      if (await tab.isVisible({ timeout: 3000 })) {
        await tab.click();
        await page.waitForTimeout(2000);
      }
    } catch { /* already on tab */ }

    // Click "Vis flere" until gone
    let moreClicks = 0;
    while (moreClicks < 20) {
      const btn = page.locator('button:has-text("Vis flere"), button:has-text("Last inn flere"), button:has-text("Se flere")').first();
      if (!await btn.isVisible({ timeout: 2000 }).catch(() => false)) break;
      await btn.click();
      await page.waitForTimeout(1000);
      moreClicks++;
    }
    input.logger.info(`NAF: clicked "vis flere" ${moreClicks} times`);

    // Extract benefit cards
    const extracted = await page.evaluate((excludedNamesArr: string[]) => {
      const results: BenefitEntry[] = [];
      const seen = new Set<string>();

      type BenefitEntry = { name: string; slug: string; reward: string; storeUrl?: string };

      document.querySelectorAll('a[href*="/medlemskap/medlemsfordeler/"]').forEach((link) => {
        const href = link.getAttribute("href") ?? "";
        const slugMatch = href.match(/\/medlemskap\/medlemsfordeler\/([^/?#]+)/);
        if (!slugMatch) return;
        const slug = decodeURIComponent(slugMatch[1]!);
        if (!slug || seen.has(slug)) return;
        seen.add(slug);

        const name =
          link.querySelector("h2,h3,h4,h5")?.textContent?.trim() ||
          (link as HTMLElement).innerText?.split("\n")[0]?.trim() ||
          "";
        if (!name) return;
        if (excludedNamesArr.some((e) => name.toLowerCase().includes(e))) return;

        const allText = (link as HTMLElement).innerText || link.textContent || "";
        const discountMatch = allText.match(/(\d{1,3}(?:[,.]\d+)?\s*%|\d+\s*kr\s+(?:i\s+)?rabatt)/i);
        const reward = discountMatch ? (discountMatch[1] ?? "").trim() : "";

        results.push({ name, slug, reward });
      });

      return results;
    }, [...EXCLUDED_NAMES]);

    benefits.push(...extracted.filter((b) => !isExcluded(b.name)));
    input.logger.info(`NAF: found ${benefits.length} benefits on list page`);

    // Visit detail pages in parallel (concurrency = 5)
    const CONCURRENCY = 5;
    let completed = 0;
    const internalDomainsArr = [...INTERNAL_DOMAINS];

    async function scrapeDetail(b: typeof benefits[number]): Promise<void> {
      const detailPage = await browser.newPage();
      try {
        await detailPage.goto(`${LIST_URL}/${b.slug}`, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });
        await detailPage.waitForSelector('[class*="BenefitBulletsCard"]', { timeout: 5000 }).catch(() => {});

        const detail = await detailPage.evaluate((internalDomains: string[]) => {
          let storeUrl: string | undefined;
          const CTA_TEXTS = ["gå til", "bestill", "kjøp", "handle", "book", "se tilbud", "les mer", "se betingelser"];

          for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href^="http"]')) {
            const href = link.href;
            let hostname: string;
            try { hostname = new URL(href).hostname; } catch { continue; }
            const h = hostname.replace(/^www\./, "");
            if (internalDomains.some((d) => h === d || h.endsWith(`.${d}`))) continue;
            if (["google.com","youtube.com","facebook.com","instagram.com","twitter.com","x.com","linkedin.com"].some((s) => hostname.includes(s))) continue;
            const text = link.innerText?.trim().toLowerCase() ?? "";
            if (CTA_TEXTS.some((c) => text.includes(c)) || link.closest('[class*="cta"],[class*="button"],[class*="action"]')) {
              storeUrl = href;
              break;
            }
            if (!storeUrl) storeUrl = href;
          }

          const bulletCard = document.querySelector('[class*="BenefitBulletsCard"]');
          const searchText = bulletCard
            ? ((bulletCard as HTMLElement).innerText ?? "")
            : (document.querySelector("main")?.innerText ?? "");

          const pctMatches = searchText ? [...searchText.matchAll(/(\d{1,2}(?:[,.]\d+)?)\s*%/g)] : [];
          let reward = "";
          if (pctMatches.length > 0) {
            const vals = pctMatches
              .map(m => parseFloat((m[1] ?? "0").replace(",", ".")))
              .filter(v => v >= 1 && v <= 99);
            if (vals.length > 0) {
              const min = Math.min(...vals);
              const max = Math.max(...vals);
              const fmt = (v: number) => Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ",");
              reward = min < max ? `${fmt(min)}-${fmt(max)} %` : `${fmt(max)} %`;
            }
          }
          if (!reward) {
            const kr = searchText.match(/(\d+)\s*kr\s*(?:i\s*)?rabatt/i);
            if (kr) reward = (kr[1] ?? "") + " kr rabatt";
          }

          return { storeUrl, reward };
        }, internalDomainsArr);

        if (detail.storeUrl) b.storeUrl = detail.storeUrl;
        if (detail.reward) b.reward = detail.reward;
      } catch {
        // detail page failed — keep what we have
      } finally {
        await detailPage.close();
        completed++;
        process.stdout.write(`\r  NAF detail ${completed}/${benefits.length}: ${b.name.slice(0, 40)}  `);
      }
    }

    // Run with limited concurrency
    for (let i = 0; i < benefits.length; i += CONCURRENCY) {
      await Promise.all(benefits.slice(i, i + CONCURRENCY).map(scrapeDetail));
    }
  } finally {
    await browser.close();
  }

  input.logger.info(`NAF: extracted ${benefits.length} benefits, building offers...`);

  const offers: CashbackOffer[] = [];
  let lookedUp = 0;
  let fromUrl = 0;
  let overrideCount = 0;

  for (const b of benefits) {
    let domains: string[] = [];

    // 1. Domain from scraped storeUrl
    if (b.storeUrl) {
      try {
        const hostname = normalizeDomainInput(new URL(b.storeUrl).hostname);
        if (hostname) { domains = [hostname]; fromUrl++; }
      } catch { /* skip */ }
    }

    // 2. Domain lookup by merchant name
    if (domains.length === 0) {
      domains = lookupDomains(input.domainLookup, b.name);
      if (domains.length > 0) lookedUp++;
    }

    // 3. Provider overrides by slug
    if (domains.length === 0) {
      const overrideDomains = input.overrides.naf?.[b.slug] ?? [];
      const first = overrideDomains[0];
      if (first) { domains = [normalizeDomainInput(first)]; overrideCount++; }
    }

    if (domains.length === 0) {
      input.logger.warn(`NAF offer has no domain: ${b.name} (${b.slug})`);
      continue;
    }

    const sourceUrl = `${LIST_URL}/${b.slug}`;
    const merchantName = SLUG_NAME_OVERRIDES[b.slug] ?? b.name;
    offers.push({
      provider: "naf",
      merchantName,
      domains: uniqueStrings(domains),
      reward: b.reward,
      sourceUrl,
      activationUrl: sourceUrl,
      terms: "Krever NAF-medlemskap.",
      updatedAt: input.generatedAt,
    });
  }

  input.logger.info(`NAF: resolved ${fromUrl} via URL, ${lookedUp} via lookup, ${overrideCount} via override`);
  input.logger.info(`NAF: produced ${offers.length} offers`);
  return uniqueOffers(offers);
}
