// Shared website pieces for cashbacknorge.no and /dagligvarer: the support ad line at the
// bottom, the ad card, the sort menu, lazy batches and the Supabase votes.
// Styles live in site/site.css; the pages own their layout.
import { INSTABANK_AD, PROVIDER_COLORS, type BonusCard } from "../shared/provider-data";
import type { CashbackOffer } from "../shared/cashback";
import { getSupportAdvertisementText, getSupportAdvertisementTooltipParts, selectSupportAdvertisement, type SupportAdvertisement } from "../shared/support-advertisements";
import { formatTooltipHtml } from "../shared/tooltip-content";
import { getBrandChipCss, getBrandButtonCss } from "../shared/theme";
import { createCountBadge } from "../shared/ui";
import { GROCERY_CHAIN_LIST } from "../shared/grocery-chains";
import { createSelectionMenu } from "./selection-menu";
export { createSelectionMenu } from "./selection-menu";
import { formatKr } from "../shared/reward-calculation";

export { copyOffer } from "./offer-copy";

type Attach = (parent: ParentNode) => void;

/** Fill the fixed bottom line with the drawn support ad, its tooltip and the quokka pair. */
export function renderSupportFooter(line: HTMLElement, pick: SupportAdvertisement, cardBenefitOffers: CashbackOffer[], attach: Attach, assetBase = ""): void {
  line.replaceChildren();
  const anchor = document.createElement("span");
  anchor.className = "offer-wrap support-ad-anchor";
  const tooltip = document.createElement("span");
  tooltip.className = "offer-tooltip cbn-tooltip-rich";
  tooltip.innerHTML = formatTooltipHtml(getSupportAdvertisementTooltipParts(pick, cardBenefitOffers));
  anchor.append(tooltip);
  if (pick.affiliate) {
    const ad = document.createElement("span");
    ad.className = "cbn-chip cbn-chip--muted ad-chip";
    ad.textContent = "Ad";
    anchor.append(ad);
  }
  const link = document.createElement("a");
  link.href = pick.url;
  link.target = "_blank";
  link.rel = pick.affiliate ? "sponsored noopener noreferrer" : "noopener noreferrer";
  link.textContent = getSupportAdvertisementText(pick);
  const mascot = document.createElement("span");
  mascot.className = "quokka-love quokka-love--couple";
  mascot.setAttribute("role", "img");
  mascot.setAttribute("aria-label", "To quokkaer støtter veldedighet sammen");
  const image = document.createElement("img");
  image.src = `${assetBase}quokka-couple.png?v=quokka-1`;
  image.alt = "";
  mascot.append(image);
  anchor.append(link);
  line.append(anchor, mascot);
  attach(line);
}

export type SupportInvite = { id: string; name: string; url: string; title: string; description: string; action: string; finePrint?: string };

/** The Instabank card for this draw, or undefined when the draw picked another ad. */
export function getInstabankInvite(draw: number): SupportInvite | undefined {
  if (selectSupportAdvertisement(draw) !== INSTABANK_AD) return undefined;
  return {
    id: "instabank", name: "Instabank", url: INSTABANK_AD.url,
    title: getSupportAdvertisementText(INSTABANK_AD).replace(/^Instabank: /, "").replace(/^./, (c) => c.toUpperCase()),
    description: "Pluss fast 5 % rabatt på kollektivtransport og elbillading.",
    finePrint: INSTABANK_AD.example,
    action: "Få Instabank kredittkort",
  };
}

/** Fill the ad card (markup in the page) and show it. */
export function renderSupportInvite(card: HTMLElement, invite: SupportInvite, onDismiss?: () => void): void {
  card.dataset.invite = invite.id;
  card.querySelector<HTMLElement>("[data-invite-provider]")!.textContent = invite.name;
  card.querySelector<HTMLElement>("[data-invite-title]")!.textContent = invite.title;
  card.querySelector<HTMLElement>("[data-invite-description]")!.textContent = invite.description;
  const finePrint = card.querySelector<HTMLElement>("[data-invite-fine-print]")!;
  finePrint.textContent = invite.finePrint ?? "";
  finePrint.hidden = !invite.finePrint;
  const action = card.querySelector<HTMLAnchorElement>(".invite-card-action")!;
  action.href = invite.url;
  action.querySelector("span")!.textContent = invite.action;
  action.dataset.goatcounterClick = `${invite.id}-invite-card`;
  action.dataset.goatcounterTitle = `${invite.name}: annonse`;
  card.hidden = false;
  card.querySelector<HTMLButtonElement>(".invite-card-dismiss")!.addEventListener("click", () => {
    card.hidden = true;
    onDismiss?.();
  });
}

/** Render more of a long list while scrolling: calls loadMore while the sentinel is near the viewport. */
export function createLazyBatches(sentinel: Element, hasMore: () => boolean, loadMore: () => void): () => void {
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting) || !hasMore()) return;
    loadMore();
    rearm();
  }, { rootMargin: "0px 0px 1500px 0px" });
  // Observing again reports the current position, so a sentinel still near the viewport loads another batch.
  const rearm = () => {
    observer.unobserve(sentinel);
    observer.observe(sentinel);
  };
  return rearm;
}

export type ChoiceOption = { value: string; label: string };

/** Share the active-letter marker between the merchant and product lists. */
export function createAlphabetTracker(bar: HTMLElement, getOffset: () => number) {
  const rows: HTMLElement[] = [];
  const observed = new Set<HTMLElement>();
  let frame = 0;
  const select = (letter: string) => bar.querySelectorAll<HTMLElement>("[data-l], [data-letter]").forEach(item => {
    const active = (item.dataset.letter ?? item.dataset.l) === letter;
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "true"); else item.removeAttribute("aria-current");
  });
  const update = () => {
    frame = 0;
    if (bar.hidden || !rows.length) return;
    const line = Math.min(window.innerHeight - 1, Math.max(0, getOffset() + 4));
    // Rows are appended in reading order. Binary search also picks the first
    // card of a grid row, without measuring every loaded product on scroll.
    let low = 0, high = rows.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (rows[middle]!.getBoundingClientRect().bottom <= line) low = middle + 1;
      else high = middle;
    }
    select(rows[Math.min(low, rows.length - 1)]!.dataset.letter ?? "#");
  };
  const refresh = () => { if (!frame) frame = requestAnimationFrame(update); };
  const reset = () => { cancelAnimationFrame(frame); frame = 0; rows.length = 0; observed.clear(); select(""); };
  const observe = (items: Iterable<HTMLElement>) => {
    for (const item of items) if (!observed.has(item)) { observed.add(item); rows.push(item); }
    refresh();
  };
  window.addEventListener("scroll", refresh, { passive: true });
  window.addEventListener("resize", refresh, { passive: true });
  const header = document.querySelector(".sticky-header");
  if (header) new ResizeObserver(refresh).observe(header);
  return { select, reset, observe, refresh };
}

/** A single-choice popover menu in the same style as the filter menu (sorting and similar). */
export function createChoiceMenu(button: HTMLButtonElement, options: ChoiceOption[], getValue: () => string, onSelect: (value: string) => void): { refresh: () => void } {
  return createSelectionMenu(button, { className: "choice-menu", getOptions: () => options, isSelected: (value) => value === getValue(), onSelect, updateLabel: true });
}

/** Chip colours for the grocery chains, light and dark, as one style element. */
export function installGroceryChainStyles(): void {
  const style = document.createElement("style");
  style.textContent = GROCERY_CHAIN_LIST.map((chain) => getBrandChipCss(`.badge-chain-${chain.slug}`, chain) + getBrandButtonCss(`.badge-chain-${chain.slug}`, chain)).join("\n");
  document.head.append(style);
}

/** Identical extra-cashback rows on the home and grocery pages. */
export function renderBonusCardGroup(cards: Array<BonusCard & { rewardLabel?: string }>, container: HTMLElement, amount = 0): void {
  if (!document.getElementById("bonus-card-brand-styles")) {
    const style = document.createElement("style"); style.id = "bonus-card-brand-styles";
    style.textContent = Object.entries(PROVIDER_COLORS).map(([id, colors]) => getBrandChipCss(`.badge-${id}`, colors)).join("\n");
    document.head.append(style);
  }
  const esc = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
  container.innerHTML = cards.map((card) => {
    const sum = amount > 0 && !card.conditional ? amount : 0;
    let reward: string;
    if (card.rewardLabel !== undefined) {
      reward = card.rewardLabel;
    } else if (sum > 0 && card.minPct != null && card.maxPct != null) {
      reward = `+${formatKr(Math.round(sum * card.minPct))}–${formatKr(Math.round(sum * card.maxPct))} kr`;
    } else if (sum > 0) {
      reward = `+${card.approx ? "~" : ""}${formatKr(Math.round(sum * card.pct))} kr`;
      if (card.ebPer100kr) reward += ` (~${formatKr(Math.round(sum * card.ebPer100kr / 100))} EB)`;
    } else if (card.minPct != null && card.maxPct != null) {
      reward = `+${formatKr(card.minPct * 100)}–${formatKr(card.maxPct * 100)} %`;
    } else {
      reward = `+${card.approx ? "~" : ""}${formatKr(card.pct * 100)} %`;
      if (card.ebPer100kr) reward += ` (~${card.ebPer100kr} EB/100kr)`;
    }
    const ad = card.ad || card.badge === "crypto" || card.badge === "curve";
    return `<span class="tooltip-wrap"><span class="tooltip cbn-tooltip-rich">${formatTooltipHtml(card.tip)}</span>
      <a class="cbn-row bonus-chip" href="${esc(card.url)}" target="_blank" rel="${ad ? "sponsored " : ""}noopener noreferrer">
        <span class="bonus-chip-label">${esc(reward)}</span><span class="bonus-chip-brand">${card.ad ? '<span aria-hidden="true">🥳</span>' : ""}${ad ? '<span class="cbn-chip cbn-chip--muted ad-chip">Ad</span>' : ""}<span class="cbn-chip badge badge-${esc(card.badge)}">${esc(card.label)}</span></span>
      </a></span>`;
  }).join("");
}

export { createCountBadge };

/** Pale brand chips (white, yellow, silver) get the dark count plate so the number stays visible. */
export function fitCountToChip(chip: HTMLElement): void {
  const count = chip.querySelector(".cbn-count");
  if (!count) return;
  const [r = 0, g = 0, b = 0] = (getComputedStyle(chip).backgroundColor.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  count.classList.toggle("cbn-count--dark", (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.82);
}

// Votes go through the same Supabase Edge Functions as the discount codes. Writes are
// only possible through those functions; reads use the public anon key.
export const SUPABASE_URL = "https://tektckikcspxzhwjfzyn.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_FYwbz2OizGygwHzAJ4dbeQ_k4j6PX8s";

export type VoteResult = { ok?: boolean; rate_limited?: boolean; toggled_off?: boolean; deleted?: boolean; capped?: boolean; registered_id?: number; upvotes?: number; downvotes?: number } | null;

export async function fetchMyVotes(hostname: string): Promise<Record<number, number>> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/my-votes`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ hostname }),
    });
    if (!res.ok) return {};
    const data = await res.json() as { votes?: Array<{ code_id: number; vote: number }> };
    const map: Record<number, number> = {};
    for (const vote of data.votes ?? []) map[vote.code_id] = vote.vote;
    return map;
  } catch { return {}; }
}

export async function apiVote(codeId: number, vote: number, staticCode?: { hostname: string; code: string; reward: string }): Promise<VoteResult> {
  try {
    const body = { vote, ...(codeId > 0 ? { code_id: codeId } : {}), ...(staticCode ?? {}) };
    const res = await fetch(`${SUPABASE_URL}/functions/v1/vote`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify(body),
    });
    if (res.status === 429) return { rate_limited: true };
    return await res.json() as VoteResult;
  } catch { return null; }
}

export type VoteTally = { id: number; code: string; upvotes: number; downvotes: number };

/** Vote totals for every entry under one key (a store's hostname, or the grocery list), optionally recent ones only. */
export async function fetchVoteTallies(hostname: string, since?: string): Promise<VoteTally[]> {
  try {
    const filter = since ? `&created_at=gte.${encodeURIComponent(since)}` : "";
    const res = await fetch(`${SUPABASE_URL}/rest/v1/discount_codes?hostname=eq.${encodeURIComponent(hostname)}${filter}&select=id,code,code_votes(vote)`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    const rows = await res.json() as Array<{ id: number; code: string; code_votes?: Array<{ vote: number }> }>;
    if (!Array.isArray(rows)) return [];
    return rows.map((row) => ({
      id: row.id, code: row.code,
      upvotes: (row.code_votes ?? []).filter((vote) => vote.vote === 1).length,
      downvotes: (row.code_votes ?? []).filter((vote) => vote.vote === -1).length,
    }));
  } catch { return []; }
}
