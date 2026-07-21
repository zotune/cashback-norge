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
  extractPercentageReward,
} from "../shared/reward.js";

export type BenefitListOffer = {
  merchantName: string;
  domain: string;
  reward: string;
  text: string;
};

export type BlockStrategy =
  | { kind: "listItem" }
  | { kind: "divClass"; className: string }
  | { kind: "sentence" };

const GENERIC_LINK_TEXT =
  /^(?:les\s*mer|her|klikk\s*her|se\s*(?:mer|her)|link|lenke|nettbutikk|nettside|hjemmeside|bestill|kj[øo]p|>>|→|➔)\b/i;

const DEFAULT_EXCLUDE =
  /facebook\.com|instagram\.com|youtube\.com|linkedin\.com|twitter\.com|(^|\.)x\.com|tiktok\.com|google\.|gstatic|googleapis|vimeo\.com|cookieinformation|cookielaw|schema\.org|w3\.org|apple\.com|play\.google|itunes|wp\.com|gravatar/;

/** Reads the reward from a single offer block's text. */
export function rewardFromText(text: string): string {
  if (/\bhalv\s+pris\b/i.test(text)) return "50 %";

  const percentage = extractPercentageReward(text);
  if (percentage) return percentage;

  const oreLitre = extractOreLitreReward(text);
  if (oreLitre) return oreLitre;

  const kr = extractKrReward(text);
  if (kr) return kr;

  // "Kroner 1000 i avslag" — amount after the currency word, which the
  // structured extractor doesn't cover.
  const krEitherOrder = text.match(/(?:kr|kroner)\s*(\d[\d\s]{0,7}\d|\d)\b/i);
  if (krEitherOrder) return `${(krEitherOrder[1] ?? "").replace(/\s/g, "")} kr`;

  // Deliberately no "gratis" → "0 kr totalsum" branch: incidental words like
  // "gratis frakt/befaring" produce false 0-kr rewards. Member-price offers
  // without a stated number fall through to "Medlemspris".
  if (/\bmedlemspris(?:er)?\b|\bmedlemstilbud\b|\brabatt\b/i.test(text)) return "Medlemspris";

  return "";
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
    offers.push({
      merchantName: cleanMerchantName(link.text, link.domain),
      domain: link.domain,
      reward,
      text,
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
