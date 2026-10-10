import { UI_CSS } from "./ui";
import { PROVIDER_COLORS } from "./provider-data";

export type ThemePreference = "system" | "light" | "dark";
export const THEME_STORAGE_KEY = "cashback-norge-theme";
export const normalizeTheme = (value: unknown): ThemePreference => value === "light" || value === "dark" ? value : "system";

type ThemeState = { preference: ThemePreference; resolved: "light" | "dark" };
type ThemeOptions = {
  initialPreference?: unknown;
  load?: () => Promise<unknown>;
  save?: (preference: ThemePreference) => unknown;
  watch?: (receive: (value: unknown) => void) => () => void;
  media?: Pick<MediaQueryList, "matches" | "addEventListener" | "removeEventListener">;
};

export function createThemeStore(options: ThemeOptions = {}) {
  const media = options.media ?? window.matchMedia("(prefers-color-scheme: dark)");
  let preference = normalizeTheme(options.initialPreference);
  let revision = 0;
  const listeners = new Set<(state: ThemeState) => void>();
  const state = (): ThemeState => ({ preference, resolved: preference === "system" ? media.matches ? "dark" : "light" : preference });
  const notify = () => listeners.forEach((listener) => listener(state()));
  const receive = (value: unknown) => {
    revision++;
    preference = normalizeTheme(value);
    notify();
  };
  media.addEventListener("change", notify);
  const stopWatching = options.watch?.(receive);
  if (options.load) {
    const startedAt = revision;
    void options.load().then((value) => {
      // A delayed storage read must not overwrite a choice made in the meantime.
      if (revision === startedAt) receive(value);
    }).catch(() => { /* System appearance also works without storage. */ });
  }
  return {
    state,
    set(value: ThemePreference) {
      receive(value);
      try { void Promise.resolve(options.save?.(preference)).catch(() => {}); } catch { /* Storage is optional. */ }
    },
    subscribe(listener: (value: ThemeState) => void) {
      listeners.add(listener);
      listener(state());
      return () => { listeners.delete(listener); };
    },
    dispose() { media.removeEventListener("change", notify); stopWatching?.(); listeners.clear(); },
  };
}
export type ThemeStore = ReturnType<typeof createThemeStore>;

const darkProviderColors = { ...PROVIDER_COLORS,
  prisradar: { bg: "#ffffff", fg: "#0c4598" }, google: { bg: "#ffffff", fg: "#1a73e8" },
  panflights: { bg: "#ffffff", fg: "#1375f7" }, enhver: { bg: "#ffffff", fg: "#162333" },
  sesum: { bg: "#f3f4f6", fg: "#111827" },
};
const darkProviderCss = Object.entries(darkProviderColors).map(([id, colors]) => {
  const pale = ["#ffffff", "#fff7f0", "#f3f4f6"].includes(colors.bg.toLowerCase());
  const declarations = pale ? `background:#34373d;color:color-mix(in srgb, ${colors.fg} 30%, #ededed 70%);`
    : colors.fg.toLowerCase() === "#ffffff" ? "color:#e5e5e5;" : "";
  return declarations ? `:root[data-cbn-theme="dark"] .provider-${id}, :root[data-cbn-theme="dark"] .badge-${id}, :host([data-cbn-theme="dark"]) .provider-${id} {${declarations}}` : "";
}).join("\n");

// Neutral charcoal, with green reserved for actions and rewards.
export const THEME_CSS = `
:root, :host {
  color-scheme: light;
  --cbn-bg: #f7faf8; --cbn-surface: #fff; --cbn-soft: #f7faf8;
  --cbn-text: #172026; --cbn-muted: #5d6b71; --cbn-subtle: #8a9a92;
  --cbn-border: #d6e1dc; --cbn-hover: #edf2ef; --cbn-accent: #22794f;
  --cbn-highlight: #eaf7ef; --cbn-highlight-border: #a9d9bd;
  --cbn-tooltip: #172026; --cbn-glass: rgba(244,248,246,.7);
  --cbn-glass-surface: rgba(255,255,255,.92);
}
:root[data-cbn-theme="dark"], :host([data-cbn-theme="dark"]) {
  color-scheme: dark;
  --cbn-bg: #0a0a0a; --cbn-surface: #171717; --cbn-soft: #282828;
  --cbn-text: #dedede; --cbn-muted: #b7b7b7; --cbn-subtle: #aaa;
  --cbn-border: #3d3d3d; --cbn-hover: #363636; --cbn-accent: #7ddc9f;
  --cbn-highlight: #193526; --cbn-highlight-border: #376b4b;
  --cbn-tooltip: #363636; --cbn-glass: rgba(10,10,10,.94);
  --cbn-glass-surface: rgba(23,23,23,.98);
}
${darkProviderCss}
:root[data-cbn-theme="dark"] .cbn-chip--muted, :host([data-cbn-theme="dark"]) .cbn-chip--muted { background: #3b3b3b; color: #c8c8c8; }
:root[data-cbn-theme="dark"] .app-chip, :host([data-cbn-theme="dark"]) .app-chip { background: #303d4b; color: #bfd0e5; }
:root[data-cbn-theme="dark"] .ad-chip, :host([data-cbn-theme="dark"]) .ad-chip { background: #40372b; color: #e3c79d; }
:root[data-cbn-theme="dark"] .offer-card-only-warn, :host([data-cbn-theme="dark"]) .card-only-warn { color: #c7b98e; }
.cbn-theme { position: relative; display: inline-flex; flex: 0 0 auto; color: var(--cbn-muted); font: 13px/1.4 ui-sans-serif, system-ui, sans-serif; }
.cbn-theme button { font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.cbn-theme .cbn-theme-toggle { display: grid; place-items: center; width: 32px; height: 32px; padding: 6px; border-radius: 50%; }
.cbn-theme-toggle svg { width: 18px; height: 18px; pointer-events: none; }
.cbn-theme-menu { position: absolute; top: calc(100% + 6px); right: 0; z-index: 1000; min-width: 156px; padding: 6px; color: var(--cbn-text); text-align: left; }
.cbn-theme-menu[hidden] { display: none; }
.cbn-theme-menu strong { display: block; font-size: 11px; font-weight: 600; padding: 5px 9px; color: var(--cbn-muted); }
.cbn-theme .cbn-theme-option { display: flex; align-items: center; gap: 9px; width: 100%; min-height: 38px; padding: 8px 9px; text-align: left; white-space: nowrap; }
.cbn-theme-option svg { width: 16px; height: 16px; }
.cbn-theme-option[aria-pressed="true"]::after { content: '✓'; margin-left: auto; }
.cbn-theme[data-placement="up"] .cbn-theme-menu { top: auto; bottom: calc(100% + 6px); }
.guide-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.brand > [data-theme-control] { margin-left: auto; }
.theme-slot { display: flex; align-items: center; }
.theme-footer { display: flex; justify-content: flex-end; padding: 0 8px 6px; }
:root[data-cbn-theme="dark"] .install-chrome { --cbn-button-bg: #162338; --cbn-button-fg: #9bc3ff; }
:root[data-cbn-theme="dark"] .install-iphone { --cbn-button-bg: #291e36; --cbn-button-fg: #d1a9f0; }
:root[data-cbn-theme="dark"] .install-android { --cbn-button-bg: #193024; --cbn-button-fg: #91dba9; }
:root[data-cbn-theme="dark"] .adblock-warning { background: #302614; color: #f4cd7c; }
`;

const ICONS = {
  system: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  dark: '<path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/>',
};
const svg = (mode: ThemePreference) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[mode]}</svg>`;
const LABELS = { system: "Følg systemet", light: "Lys", dark: "Mørk" };
let nextControl = 0;

export function bindThemeTarget(store: ThemeStore, target: HTMLElement): () => void {
  return store.subscribe(({ resolved }) => { target.dataset.cbnTheme = resolved; });
}

export function mountThemeControl(store: ThemeStore, slot: HTMLElement, placement: "up" | "down" = "down"): () => void {
  const control = document.createElement("div");
  control.className = "cbn-theme";
  control.dataset.placement = placement;
  const id = `cbn-theme-menu-${++nextControl}`;
  control.innerHTML = `<button type="button" class="cbn-theme-toggle cbn-button cbn-button--quiet" aria-expanded="false" aria-controls="${id}"></button><div id="${id}" class="cbn-theme-menu cbn-popover" role="group" aria-label="Utseende" hidden><strong>Utseende</strong>${(["system", "light", "dark"] as const).map((mode) => `<button type="button" class="cbn-theme-option cbn-button cbn-button--quiet" data-mode="${mode}" aria-pressed="false">${svg(mode)}${LABELS[mode]}</button>`).join("")}</div>`;
  const toggle = control.querySelector<HTMLButtonElement>(".cbn-theme-toggle")!;
  const menu = control.querySelector<HTMLElement>(".cbn-theme-menu")!;
  const close = () => { menu.hidden = true; toggle.setAttribute("aria-expanded", "false"); };
  toggle.addEventListener("click", () => { menu.hidden = !menu.hidden; toggle.setAttribute("aria-expanded", String(!menu.hidden)); });
  control.addEventListener("keydown", (event) => { if (event.key === "Escape") { close(); toggle.focus(); event.stopPropagation(); } });
  control.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => button.addEventListener("click", () => {
    store.set(normalizeTheme(button.dataset.mode)); close(); toggle.focus();
  }));
  const outside = (event: PointerEvent) => { if (!event.composedPath().includes(control)) close(); };
  document.addEventListener("pointerdown", outside, { passive: true });
  const unsubscribe = store.subscribe(({ preference, resolved }) => {
    toggle.innerHTML = svg(preference);
    const label = `Utseende: ${LABELS[preference]}${preference === "system" ? ` (${resolved === "dark" ? "mørk" : "lys"})` : ""}`;
    toggle.title = label; toggle.setAttribute("aria-label", label);
    control.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.mode === preference)));
  });
  slot.append(control);
  return () => { unsubscribe(); document.removeEventListener("pointerdown", outside); control.remove(); };
}

export function installThemeStyles(parent: HTMLElement | ShadowRoot): void {
  const style = document.createElement("style");
  style.textContent = THEME_CSS + UI_CSS;
  parent.append(style);
}
