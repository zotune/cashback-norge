// Shared website pieces for cashbacknorge.no and /dagligvarer: the support ad line at the
// bottom, the ad card, the sort menu, lazy batches and the Supabase votes.
// Styles live in site/site.css; the pages own their layout.
import { INSTABANK_AD } from "../shared/provider-data";
import type { CashbackOffer } from "../shared/cashback";
import { getSupportAdvertisementText, getSupportAdvertisementTooltipParts, selectSupportAdvertisement, type SupportAdvertisement } from "../shared/support-advertisements";
import { formatTooltipHtml } from "../shared/tooltip-content";
import { getBrandChipCss } from "../shared/theme";
import { createCountBadge } from "../shared/ui";
import { GROCERY_CHAIN_LIST } from "../shared/grocery-chains";

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

/** A single-choice popover menu in the same style as the filter menu (sorting and similar). */
export function createChoiceMenu(button: HTMLButtonElement, options: ChoiceOption[], getValue: () => string, onSelect: (value: string) => void): { refresh: () => void } {
  const menu = document.createElement("div");
  menu.className = "provider-menu choice-menu cbn-card";
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", button.getAttribute("aria-label") ?? "");
  menu.hidden = true;
  menu.tabIndex = -1;
  document.body.append(menu);
  const label = button.querySelector<HTMLElement>("[data-choice-label]");
  let active = 0;

  const render = () => {
    menu.replaceChildren(...options.map((option, index) => {
      const row = document.createElement("div");
      const selected = option.value === getValue();
      row.className = `provider-option${index === active ? " is-active" : ""}`;
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(selected));
      row.dataset.value = option.value;
      const text = document.createElement("span");
      text.className = "provider-option-all";
      text.textContent = option.label;
      const check = document.createElement("span");
      check.className = "provider-option-check";
      check.setAttribute("aria-hidden", "true");
      check.textContent = selected ? "✓" : "";
      row.append(text, check);
      return row;
    }));
  };
  const refresh = () => {
    if (label) label.textContent = options.find((option) => option.value === getValue())?.label ?? "";
    if (!menu.hidden) render();
  };
  const position = () => {
    if (menu.hidden) return;
    const anchor = button.getBoundingClientRect();
    const width = Math.min(260, window.innerWidth - 24);
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(12, Math.min(anchor.right - width, window.innerWidth - width - 12))}px`;
    const height = menu.getBoundingClientRect().height;
    const below = window.innerHeight - anchor.bottom - 12;
    menu.style.top = `${below >= height ? anchor.bottom + 6 : Math.max(12, anchor.top - height - 6)}px`;
  };
  const close = (restoreFocus = false) => {
    if (menu.hidden) return;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    button.classList.remove("is-open");
    if (restoreFocus) button.focus({ preventScroll: true });
  };
  const open = () => {
    active = Math.max(0, options.findIndex((option) => option.value === getValue()));
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    button.classList.add("is-open");
    render();
    position();
    menu.focus({ preventScroll: true });
  };
  const choose = (value: string) => {
    onSelect(value);
    refresh();
    close(true);
  };
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", () => (menu.hidden ? open() : close(true)));
  menu.addEventListener("click", (event) => {
    const row = (event.target as Element).closest<HTMLElement>(".provider-option");
    if (row?.dataset.value !== undefined) choose(row.dataset.value);
  });
  menu.addEventListener("pointerover", (event) => {
    const row = (event.target as Element).closest<HTMLElement>(".provider-option");
    if (!row) return;
    active = options.findIndex((option) => option.value === row.dataset.value);
    menu.querySelectorAll(".provider-option").forEach((item, index) => item.classList.toggle("is-active", index === active));
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      active = (active + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      render();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(options[active]!.value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      close();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!menu.hidden && !menu.contains(event.target as Node) && !button.contains(event.target as Node)) close();
  });
  window.addEventListener("resize", position, { passive: true });
  window.addEventListener("scroll", position, { passive: true, capture: true });
  refresh();
  return { refresh };
}

/** Chip colours for the grocery chains, light and dark, as one style element. */
export function installGroceryChainStyles(): void {
  const style = document.createElement("style");
  style.textContent = GROCERY_CHAIN_LIST.map((chain) => getBrandChipCss(`.badge-chain-${chain.slug}`, chain)).join("\n");
  document.head.append(style);
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
