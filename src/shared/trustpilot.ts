// Keyless consumer-site search + the profile's public Next JSON, inspected 2026-11-08.
// These are website endpoints, not the API-key Business API. They can return a WAF
// challenge (403); never execute it or treat it as an empty list/zero rating.
import { isRecord, normalizeHostname, parseUrl } from "./cashback.js";
import { readNextPageData } from "./product-data.js";
import type { StoreRating } from "./product-reviews.js";

export const TRUSTPILOT_CACHE_PREFIX = "trustpilot-store-v1:";
export const TRUSTPILOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const FAILURE_MAX_AGE_MS = 5 * 60 * 1000;
const MAX_REVIEWS = 3;
export type TrustpilotReview = { id: string; title: string; text: string; rating: number; date: string; verified: boolean; reply?: string };
export type TrustpilotProfile = StoreRating & { source: "trustpilot"; maxScore: 5; domain: string; businessUnitId: string; reviews: TrustpilotReview[]; warning?: string };
export type TrustpilotResult = { domain: string; profileUrl: string; checkedAt: number } & (
  { status: "ok"; profile: TrustpilotProfile } |
  { status: "blocked" | "unavailable" | "not-found"; reason: string }
);
export type TrustpilotRequest = (url: string) => Promise<{ status: number; text: string }>;
type ClientOptions = { read: (key: string) => Promise<unknown>; write: (key: string, value: TrustpilotResult) => Promise<void>; request?: TrustpilotRequest; now?: () => number };

export function trustpilotDomain(raw: string): string | undefined {
  const url = parseUrl(raw.includes("://") ? raw : `https://${raw}`);
  if (!url || !["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) return undefined;
  const domain = normalizeHostname(url.hostname);
  return domain.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain) ? domain : undefined;
}

export function trustpilotProfileUrl(domain: string): string {
  return `https://no.trustpilot.com/review/${encodeURIComponent(domain)}`;
}

export function trustpilotPageDomain(rawUrl: string): string | undefined {
  const url = parseUrl(rawUrl);
  if (url?.protocol !== "https:" || !["no.trustpilot.com", "www.trustpilot.com"].includes(url.hostname) || url.port) return undefined;
  const match = /^\/review\/([^/]+)\/?$/.exec(url.pathname);
  return match && !/%/.test(match[1]!) ? trustpilotDomain(match[1]!) : undefined;
}

export function trustpilotSearchUrl(domain: string): string {
  return `https://no.trustpilot.com/api/consumersitesearch-api/businessunits/search?${new URLSearchParams({ country: "NO", locale: "nb-NO", page: "1", pageSize: "5", query: domain })}`;
}

const validScore = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 5;
const validCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const shortText = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

function readBusiness(value: unknown, domain: string, search: boolean): TrustpilotProfile | undefined {
  if (!isRecord(value) || typeof value.identifyingName !== "string" || normalizeHostname(value.identifyingName) !== domain ||
    typeof value.websiteUrl !== "string" || trustpilotDomain(value.websiteUrl) !== domain) return undefined;
  const id = search ? value.businessUnitId : value.id;
  const score = search && isRecord(value.score) ? value.score.trustScore : value.trustScore;
  const name = shortText(value.displayName, 160);
  if (typeof id !== "string" || !/^[a-f\d]{24}$/.test(id) || !name || !validScore(score) || !validCount(value.numberOfReviews)) return undefined;
  const alert = isRecord(value.consumerAlert) ? value.consumerAlert : undefined;
  const warning = alert ? shortText(alert.title, 250) || "Trustpilot viser et varsel på denne profilen. Les det hos Trustpilot." : "";
  return { source: "trustpilot", maxScore: 5, shopName: name, domain, businessUnitId: id, score, count: value.numberOfReviews,
    url: trustpilotProfileUrl(value.identifyingName), reviews: [], ...(warning ? { warning } : {}) };
}

export function readTrustpilotSearch(value: unknown, domain: string): TrustpilotProfile | undefined {
  if (!isRecord(value) || !Array.isArray(value.businessUnits)) throw new Error("Trustpilot: ukjent format i virksomhetssøket");
  return value.businessUnits.slice(0, 5).map((business) => readBusiness(business, domain, true)).find(Boolean);
}

export function readTrustpilotPage(html: string, domain: string): TrustpilotProfile | undefined {
  const data = readNextPageData(html);
  const props = isRecord(data) && isRecord(data.props) && isRecord(data.props.pageProps) ? data.props.pageProps : undefined;
  if (!props) return undefined;
  const profile = readBusiness(props.businessUnit, domain, false);
  if (!profile) return undefined;
  const reviews = Array.isArray(props.reviews) ? props.reviews.slice(0, 20) : [];
  profile.reviews = reviews.filter(isRecord).flatMap((review): TrustpilotReview[] => {
    const date = isRecord(review.dates) ? review.dates.publishedDate : undefined;
    const verification = isRecord(review.labels) && isRecord(review.labels.verification) ? review.labels.verification : undefined;
    if (review.filtered !== false || review.isPending !== false || review.isCurrentlyUnderModeration === true ||
      typeof review.id !== "string" || !/^[a-f\d]{24}$/.test(review.id) || !validScore(review.rating) || !Number.isInteger(review.rating) ||
      typeof date !== "string" || !Number.isFinite(Date.parse(date)) || !shortText(review.text, 500)) return [];
    const reply = isRecord(review.reply) ? shortText(review.reply.message, 500) : "";
    return [{ id: review.id, title: shortText(review.title, 160), text: shortText(review.text, 500), rating: review.rating,
      date, verified: verification?.isVerified === true, ...(reply ? { reply } : {}) }];
  }).slice(0, MAX_REVIEWS);
  return profile;
}

export function isTrustpilotProfile(value: unknown): value is TrustpilotProfile {
  if (!isRecord(value) || value.source !== "trustpilot" || value.maxScore !== 5 || typeof value.domain !== "string" || trustpilotDomain(value.domain) !== value.domain ||
    typeof value.businessUnitId !== "string" || !/^[a-f\d]{24}$/.test(value.businessUnitId) || typeof value.shopName !== "string" || !value.shopName.trim() || value.shopName.length > 160 ||
    !validScore(value.score) || !validCount(value.count) || typeof value.url !== "string" || trustpilotPageDomain(value.url) !== value.domain ||
    (value.warning !== undefined && (typeof value.warning !== "string" || value.warning.length > 250)) || !Array.isArray(value.reviews) || value.reviews.length > MAX_REVIEWS) return false;
  return value.reviews.every((review) => isRecord(review) && typeof review.id === "string" && /^[a-f\d]{24}$/.test(review.id) &&
    typeof review.title === "string" && review.title.length <= 160 && typeof review.text === "string" && review.text.length <= 500 &&
    validScore(review.rating) && Number.isInteger(review.rating) && typeof review.date === "string" && Number.isFinite(Date.parse(review.date)) &&
    typeof review.verified === "boolean" && (review.reply === undefined || typeof review.reply === "string" && review.reply.length <= 500));
}

export function isTrustpilotResult(value: unknown): value is TrustpilotResult {
  return isRecord(value) && typeof value.domain === "string" && trustpilotDomain(value.domain) === value.domain &&
    typeof value.profileUrl === "string" && trustpilotPageDomain(value.profileUrl) === value.domain && typeof value.checkedAt === "number" && Number.isFinite(value.checkedAt) &&
    (value.status === "ok" ? isTrustpilotProfile(value.profile) && value.profile.domain === value.domain :
      ["blocked", "unavailable", "not-found"].includes(String(value.status)) && typeof value.reason === "string" && value.reason.length <= 1000);
}

export function isFreshTrustpilotResult(value: unknown, domain: string, now = Date.now()): value is TrustpilotResult {
  return isTrustpilotResult(value) && value.domain === domain && value.checkedAt <= now && now - value.checkedAt < (value.status === "ok" ? TRUSTPILOT_MAX_AGE_MS : FAILURE_MAX_AGE_MS);
}

export async function requestTrustpilot(url: string): ReturnType<TrustpilotRequest> {
  const response = await fetch(url, { credentials: "include", headers: { Accept: "application/json,text/html" }, signal: AbortSignal.timeout(8000) });
  return { status: response.status, text: await response.text() };
}

export function createTrustpilotClient(options: ClientOptions) {
  const now = options.now ?? Date.now;
  const inFlight = new Map<string, Promise<TrustpilotResult>>();
  async function request(url: string) {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await (options.request ?? requestTrustpilot)(url);
        if (response.status >= 500 && attempt === 0) continue;
        return response;
      } catch (error) {
        if (attempt === 0) continue;
        throw new Error(`Trustpilot: ${new URL(url).pathname}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  async function save(result: TrustpilotResult) {
    await options.write(TRUSTPILOT_CACHE_PREFIX + result.domain, result).catch(() => {});
    return result;
  }
  return {
    async get(rawDomain: string): Promise<TrustpilotResult | undefined> {
      const domain = trustpilotDomain(rawDomain);
      if (!domain) return undefined;
      const cached = await options.read(TRUSTPILOT_CACHE_PREFIX + domain).catch(() => undefined);
      if (isFreshTrustpilotResult(cached, domain, now())) return cached;
      if (inFlight.has(domain)) return inFlight.get(domain)!;
      const promise = (async (): Promise<TrustpilotResult> => {
        const base = { domain, profileUrl: trustpilotProfileUrl(domain), checkedAt: now() };
        let profile: TrustpilotProfile | undefined;
        let reason = "Trustpilot: ingen vurderinger funnet";
        let status: "blocked" | "unavailable" | "not-found" = "not-found";
        let rateLimited = false;
        try {
          const response = await request(trustpilotSearchUrl(domain));
          if (response.status === 200) profile = readTrustpilotSearch(JSON.parse(response.text), domain);
          else { rateLimited = response.status === 429; status = response.status === 403 || response.status === 429 ? "blocked" : "unavailable"; reason = `Trustpilot: virksomhetssøk: HTTP ${response.status}`; }
        } catch (error) { status = "unavailable"; reason = `Trustpilot: virksomhetssøk: ${error instanceof Error ? error.message : String(error)}`; }
        // One profile page only; never crawl review pagination or execute third-party scripts.
        try { if (!rateLimited) {
          // Profiles live at /review/<domain> or /review/www.<domain>; try the other form on a 404.
          let response = await request(profile?.url ?? base.profileUrl);
          if (response.status === 404 && !profile) response = await request(trustpilotProfileUrl(`www.${domain}`));
          if (response.status === 200) {
            const page = readTrustpilotPage(response.text, domain);
            if (page && (!profile || page.businessUnitId === profile.businessUnitId)) profile = page;
            else if (!profile) { status = "unavailable"; reason = "Trustpilot: profilsiden mangler gyldige data for dette domenet"; }
          } else if (!profile) { status = response.status === 403 || response.status === 429 ? "blocked" : response.status === 404 ? "not-found" : "unavailable"; reason = `Trustpilot: profilsiden: HTTP ${response.status}`; }
        } } catch (error) { if (!profile) { status = "unavailable"; reason = `Trustpilot: profilsiden: ${error instanceof Error ? error.message : String(error)}`; } }
        // A profile opened by the user may have been captured while the request was running.
        const captured = await options.read(TRUSTPILOT_CACHE_PREFIX + domain).catch(() => undefined);
        if (isFreshTrustpilotResult(captured, domain, now()) && captured.status === "ok" && captured.checkedAt >= base.checkedAt) return captured;
        return save(profile ? { ...base, status: "ok", profile } : { ...base, status, reason: reason.slice(0, 1000) });
      })().finally(() => inFlight.delete(domain));
      inFlight.set(domain, promise);
      return promise;
    },
    async capture(profile: TrustpilotProfile, pageUrl: string): Promise<TrustpilotResult | undefined> {
      if (!isTrustpilotProfile(profile) || trustpilotPageDomain(pageUrl) !== profile.domain) return undefined;
      return save({ domain: profile.domain, profileUrl: profile.url, checkedAt: now(), status: "ok", profile });
    },
  };
}
