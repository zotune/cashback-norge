import { isRecord, uniqueOffers, type CashbackOffer } from "../../shared/cashback.js";
import { cleanPromotionText as clean, readFreePromotion } from "../../shared/free-promotions.js";
import type { DomainLookup } from "../domain-lookup.js";
import type { Logger } from "../logger.js";
import type { ProviderOverrides } from "../provider-overrides.js";
import { crawlPromotionDocuments } from "./promotion-crawler.js";
import { promotionDomains } from "./promotion-domains.js";

export type FreeOffersInput = {
  generatedAt: string; logger: Logger; overrides: ProviderOverrides; domainLookup: DomainLookup;
  startUrl?: string; timeoutSecs?: number;
};

const LIMIT = 250;
// Both sites publish the same public Sanity project, discovered from their
// current asset URLs. These queries read only published, active catalogue data.
// No private API configuration, authenticated endpoint or third-party JS runs.
const PUBLISHED = '!(_id in path("drafts.**"))';
const SOURCE_FIELDS = '_id,title,short_description,content,link,active,visible,publish_time,valid_until_time,manualCheck,"slug":slug.current';
export const GRATIS_QUERY = `*[_type=="brandOffer" && brand=="gratis" && status=="approved" && stale!=true && ${PUBLISHED}] | order(_id asc) [0...${LIMIT + 1}]{title,intro,facts,sections,faq,needsReview,"slug":slug.current,"source":offer->{${SOURCE_FIELDS}}}`;
export const GJERRIGKNARK_QUERY = `*[_type=="content" && type=="story" && active==true && visible==true && publish_time<=now() && (!defined(valid_until_time)||valid_until_time>now()) && ${PUBLISHED} && references(*[_type=="category" && (gkid.current=="2" || "2" in parents[]->gkid.current)]._id)] | order(_id asc) [0...${LIMIT + 1}]{${SOURCE_FIELDS},"brandCopy":*[_type=="brandOffer" && brand=="gratis" && status=="approved" && stale!=true && offer._ref==^._id && ${PUBLISHED}][0]{facts}}`;

export function publicPromotionApi(query: string): string {
  return `https://6wpjub8n.api.sanity.io/v2025-02-19/data/query/production?query=${encodeURIComponent(query)}`;
}

export function fetchGratis(input: FreeOffersInput): Promise<CashbackOffer[]> {
  return fetchCatalogue(input, "gratis", GRATIS_QUERY);
}
export function fetchGjerrigknark(input: FreeOffersInput): Promise<CashbackOffer[]> {
  return fetchCatalogue(input, "gjerrigknark", GJERRIGKNARK_QUERY);
}

async function fetchCatalogue(input: FreeOffersInput, provider: "gratis" | "gjerrigknark", query: string): Promise<CashbackOffer[]> {
  let offers: CashbackOffer[] | undefined;
  await crawlPromotionDocuments({
    name: provider, startUrl: input.startUrl ?? publicPromotionApi(query), logger: input.logger, maxRequests: 1,
    ...(input.timeoutSecs === undefined ? {} : { timeoutSecs: input.timeoutSecs }),
    read: (body) => { offers = readFreeOffers(JSON.parse(body), provider, input); },
  });
  if (!offers?.length) throw new Error(`${provider}: public promotion catalogue contained no usable offers`);
  input.logger.info(`${provider}: ${offers.length} public promotions (${offers.filter((offer) => offer.promotion?.priceNok === 0).length} free, ${offers.filter((offer) => offer.domains.length > 0).length} with verified merchant domains)`);
  return offers;
}

export function readFreeOffers(value: unknown, provider: "gratis" | "gjerrigknark", input: FreeOffersInput): CashbackOffer[] {
  if (!isRecord(value) || !Array.isArray(value.result) || value.result.length > LIMIT ||
    !value.result.every((row) => isRecord(row) && typeof row.title === "string")) {
    throw new Error(`${provider}: invalid public catalogue schema or more than ${LIMIT} rows`);
  }
  const now = Date.parse(input.generatedAt);
  const offers: CashbackOffer[] = [];
  for (const row of value.result as Record<string, unknown>[]) {
    const source = provider === "gratis" ? row.source : row;
    if (!isRecord(source) || source.active !== true || source.visible !== true || !isRecord(source.link)) continue;
    const published = Date.parse(String(source.publish_time));
    const expires = source.valid_until_time == null ? undefined : Date.parse(String(source.valid_until_time));
    if (!Number.isFinite(published) || published > now || (expires !== undefined && (!Number.isFinite(expires) || expires <= now))) continue;
    const merchantName = clean(source.link.provider);
    const title = clean(row.title);
    const slug = clean(row.slug);
    if (!merchantName || !title || !slug || slug.includes("..") || /[?#]/.test(slug)) continue;
    const facts = provider === "gratis" ? row.facts : isRecord(row.brandCopy) ? row.brandCopy.facts : undefined;
    const factLines = isRecord(facts) ? [
      ["Dette får du", facts.whatYouGet], ["Hvem", facts.audience],
      ["Binding og kostnader", facts.commitment], ["Oppsigelse", facts.cancellation],
    ].flatMap(([label, text]) => clean(text) && clean(text) !== "ukjent" ? [`${label}: ${clean(text)}`] : []) : [];
    const body = portableText(source.content);
    const description = [clean(row.intro), clean(source.short_description), ...factLines, body].filter(Boolean).join("\n");
    const promotion = readFreePromotion(`${title}. ${clean(source.title)}`, description);
    if (!promotion) continue;
    const sourceUrl = provider === "gratis" ? `https://gratis.no/tilbud/${slug}` : `https://gjerrigknark.com/${slug}`;
    const sections = Array.isArray(row.sections) ? row.sections.filter(isRecord).map((section) => `${clean(section.heading)}: ${clean(section.body)}`) : [];
    const faq = Array.isArray(row.faq) ? row.faq.filter(isRecord).map((item) => `${clean(item.question)} ${clean(item.answer)}`) : [];
    const terms = [...new Set([
      title, description, ...sections, ...faq,
      ...(expires === undefined ? [] : [`Gyldig til: ${source.valid_until_time}`]),
      ...(source.manualCheck ? [`Kildens kontrollert-dato: ${clean(source.manualCheck)}`] : []),
      ...(row.needsReview === true ? ["Kilden har merket oppføringen for gjennomgang."] : []),
      `Kilde: ${provider === "gratis" ? "gratis.no" : "gjerrigknark.com"}. Oppført som aktiv hos kilden; ikke kontrollert av Cashback Norge.`,
      "Gave/prøvetilbud, ikke cashback. Kontroller oppsigelse, videre pris og vilkår hos tilbyderen.",
    ].filter(Boolean))].join("\n");
    offers.push({
      provider, merchantName,
      domains: promotionDomains({ ...input, provider, merchantName, destination: clean(source.link.url) }),
      // Older clients do not know promotion: keep paid prices out of their
      // reward parser too, while new clients show the structured price label.
      reward: promotion.priceNok === 0 ? "0 kr totalsum" : "Prøvetilbud",
      promotion: { ...promotion, ...(typeof source._id === "string" ? { id: source._id } : {}),
        ...(expires === undefined ? {} : { validUntil: new Date(expires).toISOString() }) },
      sourceUrl, activationUrl: sourceUrl, terms, updatedAt: input.generatedAt,
    });
  }
  return uniqueOffers(offers);
}

function portableText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.filter(isRecord).map((block) => Array.isArray(block.children) ?
    clean(block.children.filter(isRecord).map((span) => typeof span.text === "string" ? span.text : "").join("")) : "").filter(Boolean).join("\n");
}
