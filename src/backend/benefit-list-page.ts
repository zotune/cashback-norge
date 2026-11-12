// Shared parser for member-benefit pages that render every offer as a block
// containing the partner link and the reward text. Merchants and rewards are
// read from the live page — nothing is hardcoded — so new partners appear
// automatically and reward changes are picked up.
//
// Pages differ in markup (list items, cards, or one continuous block of
// sentences), so the caller supplies a block strategy. Within each block the
// first percentage / amount is the offer's reward, with no risk of a
// neighbour's number leaking in.
import { normalizeDomainInput, parseUrl, stripHtml } from "../shared/cashback.js";
import {
  extractKrReward,
  extractOreLitreReward,
  extractUpToPercentageReward,
} from "../shared/reward.js";

export type BenefitListOffer = {
  merchantName: string;
  domain: string;
  reward: string;
  text: string;
  discountCode?: string;
};

export type BlockStrategy =
  | { kind: "listItem" }
  | { kind: "divClass"; className: string }
  | { kind: "sentence" };

const GENERIC_LINK_TEXT =
  /^(?:les\s*mer|her|klikk\s*her|se\s*(?:mer|her)|link|lenke|nettbutikk|nettside|hjemmeside|bestill|kj[øo]p|>>|→|➔)\b/i;

const DEFAULT_EXCLUDE =
  /facebook\.com|instagram\.com|youtube\.com|linkedin\.com|twitter\.com|(^|\.)x\.com|tiktok\.com|google\.|gstatic|googleapis|vimeo\.com|cookieinformation|cookielaw|schema\.org|w3\.org|apple\.com|play\.google|itunes|wp\.com|gravatar/;

/**
 * "medlemskap i Kinoklubben til kun 125 kr … filmer til HALV PRIS": the member
 * buys a club membership at a member price, and the half price is the club's
 * own ticket benefit — not a 50 % discount from the organisation.
 */
export function halfPriceIsClubBenefit(text: string): boolean {
  return /\bhalv\s+pris\b/i.test(text) &&
    /\b(?:til|for)\s+(?:kun|bare)\s+(?:kr\.?\s*)?\d[\d\s.]*\s*(?:kr\b|kroner|,-)?/i.test(text) &&
    // "medlemskap", "årsmedlemskap", "klubbmedlemskap"
    /medlemskap/i.test(text);
}

/** Reads the reward from a single offer block's text. */
export function rewardFromText(text: string): string {
  // An explicit member discount wins over "halv pris": on Kinoklubben the
  // half price is what its own members pay for tickets, the partner discount
  // is on the membership ("40 % rabatt på medlemskapet").
  // "Opptil 30 %" keeps its qualifier.
  const percentage = extractUpToPercentageReward(text);
  if (percentage) return percentage;
  if (/\bhalv\s+pris\b/i.test(text)) return halfPriceIsClubBenefit(text) ? "Medlemspris" : "50 %";

  const oreLitre = extractOreLitreReward(text);
  if (oreLitre) return oreLitre;

  const kr = extractKrReward(text);
  if (kr) return kr;

  // "Kroner 1000 i avslag" — amount after the currency word, which the
  // structured extractor doesn't cover.
  const krEitherOrder = text.match(/(?:kr|kroner)\s*(\d[\d\s]{0,7}\d|\d)\b/i);
  if (krEitherOrder) {
    const amount = Number.parseInt((krEitherOrder[1] ?? "").replace(/\s/g, ""), 10);
    // Same "1 000 kr" format as the shared extractors.
    if (Number.isFinite(amount) && amount > 0) return `${amount.toLocaleString("nb-NO").replace(/[\u00a0\u202f]/g, " ")} kr`;
  }

  // Deliberately no "gratis" → "0 kr totalsum" branch: incidental words like
  // "gratis frakt/befaring" produce false 0-kr rewards. Member-price offers
  // without a stated number fall through to "Medlemspris".
  if (/\bmedlemspris(?:er)?\b|\bmedlemstilbud\b|\brabatt\b/i.test(text)) return "Medlemspris";

  return "";
}

const MAX_TERMS_LENGTH = 500;

/**
 * A code written in the block ("Legg inn rabattkoden RSMEDLEM", "Avtalekode:
 * D000004481"). Instructions ("bruk rabattkoden i kassen") are not codes: a
 * code is written in capitals/digits.
 */
export function discountCodeFromText(text: string): string | undefined {
  const match = text.match(/\b(?:[Rr]abatt|[Aa]vtale|[Kk]ampanje)?[Kk]oden?\s*:?\s*([A-Z0-9][A-Z0-9-]{2,29})\b/);
  return match?.[1];
}

/** Tooltip terms: the offer block's own text, then the provider's default. */
export function benefitTerms(text: string, defaultTerms: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized === "") return defaultTerms;
  let terms = normalized;
  if (terms.length > MAX_TERMS_LENGTH) {
    // Cut at a sentence (or at least a word) boundary, never mid-word.
    const cut = terms.slice(0, MAX_TERMS_LENGTH);
    const sentenceEnd = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "));
    terms = sentenceEnd > 100 ? cut.slice(0, sentenceEnd + 1) : `${cut.slice(0, cut.lastIndexOf(" "))} …`;
  }
  return `${terms}\n${defaultTerms}`;
}

export function parseBenefitListPage(
  html: string,
  officialHostname: RegExp,
  strategy: BlockStrategy,
  extraExclude?: RegExp,
): BenefitListOffer[] {
  const body = html.split(/<footer/i)[0] ?? html;
  const blocks = splitIntoBlocks(body, strategy);

  const offers: BenefitListOffer[] = [];
  const seenDomains = new Set<string>();

  for (const block of blocks) {
    const link = firstMerchantLink(block, officialHostname, extraExclude);
    if (link === undefined || seenDomains.has(link.domain)) continue;

    const text = blockText(block);
    const reward = rewardFromText(text);
    if (reward === "") continue;

    seenDomains.add(link.domain);
    const discountCode = discountCodeFromText(text);
    offers.push({
      merchantName: cleanMerchantName(link.text, link.domain),
      domain: link.domain,
      reward,
      text,
      ...(discountCode !== undefined ? { discountCode } : {}),
    });
  }

  return offers;
}

function splitIntoBlocks(body: string, strategy: BlockStrategy): string[] {
  if (strategy.kind === "listItem") {
    return [...body.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1] ?? "");
  }
  if (strategy.kind === "divClass") {
    return balancedDivBlocks(body, strategy.className);
  }
  // sentence: one continuous block; split on sentence boundaries and <br> so
  // each merchant's own sentence carries its reward.
  return body
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|li|h[1-6]|div)>/gi, "\n")
    .split(/\n+|(?<=[.!?])\s+(?=[A-ZÆØÅ0-9])/);
}

// Extracts each <div class="...className..."> together with its balanced
// closing </div>, so a whole card (heading + body + link) stays in one block.
function balancedDivBlocks(body: string, className: string): string[] {
  const blocks: string[] = [];
  const opener = new RegExp(`<div\\b[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>`, "gi");
  let match: RegExpExecArray | null;

  while ((match = opener.exec(body)) !== null) {
    const start = match.index;
    const tagPattern = /<\/?div\b[^>]*>/gi;
    tagPattern.lastIndex = start;
    let depth = 0;
    let end = -1;
    let tag: RegExpExecArray | null;
    while ((tag = tagPattern.exec(body)) !== null) {
      depth += /^<\/div/i.test(tag[0]) ? -1 : 1;
      if (depth === 0) {
        end = tag.index + tag[0].length;
        break;
      }
    }
    if (end === -1) break;
    blocks.push(body.slice(start, end));
    opener.lastIndex = end;
  }
  return blocks;
}

type MerchantLink = { text: string; domain: string };

function firstMerchantLink(
  block: string,
  officialHostname: RegExp,
  extraExclude: RegExp | undefined,
): MerchantLink | undefined {
  for (const match of block.matchAll(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const parsed = parseUrl((match[1] ?? "").replace(/&amp;/g, "&"));
    if (parsed === undefined) continue;

    const hostname = parsed.hostname.replace(/^www\./, "");
    if (
      officialHostname.test(hostname) ||
      DEFAULT_EXCLUDE.test(hostname) ||
      (extraExclude !== undefined && extraExclude.test(hostname))
    ) {
      continue;
    }

    return {
      text: stripHtml(match[2] ?? "").replace(/\s+/g, " ").trim(),
      domain: normalizeDomainInput(parsed.hostname),
    };
  }
  return undefined;
}

function cleanMerchantName(linkText: string, domain: string): string {
  const looksLikeUrl =
    linkText === "" ||
    /^https?:/i.test(linkText) ||
    /^www\./i.test(linkText) ||
    /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(linkText);

  if (linkText !== "" && !GENERIC_LINK_TEXT.test(linkText) && !looksLikeUrl && linkText.length <= 60) {
    return linkText;
  }

  const stem = domain.replace(/\.(?:no|com|net|health|ai|dk|se|org|eu|io)$/i, "").split(".").pop() ?? domain;
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

function blockText(block: string): string {
  return stripHtml(
    block
      .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|li|div|h[1-6])>/gi, "\n"),
  )
    .replace(/\s+/g, " ")
    .trim();
}
