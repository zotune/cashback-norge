import { bindThemeTarget, createThemeStore, installThemeStyles, mountThemeControl, THEME_STORAGE_KEY } from "../shared/theme";
import { addSiteTooltipButtons, createTooltipController } from "../shared/tooltips";

const tooltipController = createTooltipController(document);
declare global {
  interface Window { CashbackTooltips: { attach: (parent: ParentNode) => void; close: () => void } }
}
window.CashbackTooltips = { attach: (parent) => addSiteTooltipButtons(tooltipController, parent), close: tooltipController.close };

let saved: unknown;
try { saved = localStorage.getItem(THEME_STORAGE_KEY); } catch { /* System default. */ }
installThemeStyles(document.head);
const theme = createThemeStore({
  initialPreference: saved,
  save: (preference) => localStorage.setItem(THEME_STORAGE_KEY, preference),
  watch: (receive) => {
    const onStorage = (event: StorageEvent) => { if (event.key === THEME_STORAGE_KEY || event.key === null) receive(event.newValue); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  },
});
bindThemeTarget(theme, document.documentElement);
const mount = () => document.querySelectorAll<HTMLElement>("[data-theme-control]").forEach((slot) => mountThemeControl(theme, slot));
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
else mount();
