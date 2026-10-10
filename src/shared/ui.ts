/** Shared visual components for HTML, React and the extension's shadow DOM.
 * Screens own layout and sizing; these classes own surfaces and interaction states.
 * No observer or runtime DOM scan is needed, including on the full store list.
 */
export const UI_CSS = `
:root, :host {
  --cbn-control-radius: 7px; --cbn-card-radius: 10px; --cbn-chip-radius: 4px;
  --cbn-plate: #eaf0ec; --cbn-plate-hover: #dfe8e2; --cbn-plate-down: #d2ded6;
  --cbn-field: #eaf0ec; --cbn-on-accent: #fff;
}
:root[data-cbn-theme="dark"], :host([data-cbn-theme="dark"]) {
  --cbn-plate: #262626; --cbn-plate-hover: #333; --cbn-plate-down: #404040;
  --cbn-field: #202020; --cbn-on-accent: #102016;
}
.cbn-button {
  border: 0; border-radius: var(--cbn-control-radius); box-shadow: none;
  background: var(--cbn-button-bg, var(--cbn-plate));
  color: var(--cbn-button-fg, var(--cbn-text));
  font-family: inherit; cursor: pointer; text-decoration: none;
  transition: background-color .12s, color .12s;
  -webkit-tap-highlight-color: transparent;
}
.cbn-button:hover:not(:disabled) { background: color-mix(in srgb, var(--cbn-button-bg, var(--cbn-plate-hover)) 90%, var(--cbn-text) 10%); }
.cbn-button:active:not(:disabled) { background: color-mix(in srgb, var(--cbn-button-bg, var(--cbn-plate-down)) 82%, var(--cbn-text) 18%); }
.cbn-button:disabled { opacity: .4; cursor: default; }
.cbn-button--quiet { --cbn-button-bg: transparent; --cbn-button-fg: var(--cbn-muted); }
.cbn-button--primary { --cbn-button-bg: var(--cbn-accent); --cbn-button-fg: var(--cbn-on-accent); }
.cbn-button[aria-pressed="true"], .cbn-button.is-active { background: var(--cbn-highlight); color: var(--cbn-accent); }
.cbn-field, .cbn-field-group {
  border: 0; border-radius: var(--cbn-control-radius); box-shadow: none;
  background: var(--cbn-field); color: var(--cbn-text); outline: none;
  transition: background-color .12s;
}
.cbn-field:hover, .cbn-field-group:hover { background: var(--cbn-plate); }
.cbn-field::placeholder { color: var(--cbn-subtle); }
.cbn-field-group .cbn-field { background: transparent; }
.cbn-field:focus, .cbn-field-group:focus-within { outline: 2px solid var(--cbn-accent); outline-offset: 1px; }
.cbn-field-group .cbn-field:focus { outline: none; }
.cbn-card { border: 0; border-radius: var(--cbn-card-radius); box-shadow: none; background: var(--cbn-surface); }
.cbn-row { border: 0; border-radius: var(--cbn-control-radius); box-shadow: none; background: var(--cbn-soft); transition: background-color .12s; }
.cbn-row:hover { background: var(--cbn-hover); }
.cbn-row:active { background: var(--cbn-plate-down); }
.cbn-chip { border: 0; border-radius: var(--cbn-chip-radius); box-shadow: none; }
.cbn-chip[href], button.cbn-chip { transition: filter .12s; }
.cbn-chip[href]:hover, button.cbn-chip:hover { filter: brightness(1.14); }
.cbn-chip--muted { display: inline-block; padding: 0 4px; font-size: 9px; font-weight: 600; line-height: 14px; white-space: nowrap; vertical-align: middle; background: var(--cbn-plate); color: var(--cbn-muted); }
.cbn-popover { border: 0; border-radius: var(--cbn-card-radius); background: var(--cbn-surface); box-shadow: 0 8px 30px #0003; }
.cbn-button:focus-visible, .cbn-chip:focus-visible, .cbn-row:focus-visible { outline: 2px solid var(--cbn-accent); outline-offset: 2px; }
.cbn-tooltip-trigger { display: none; flex: 0 0 32px; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; font: 18px/1 system-ui, sans-serif; }
.cbn-tooltip-row { display: contents; }
.cbn-offer-details { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; }
.bonus-chip.cbn-tooltip-row { display: flex; }
.bonus-chip-action { flex: 1; min-width: 0; color: inherit; text-decoration: none; }
.bonus-chip-brand-link { display: inline-flex; align-items: center; color: inherit; text-decoration: none; }
.cbn-tooltip-open.cbn-tooltip-open { display: block; opacity: 1; pointer-events: auto; z-index: 2147483647; }
.cbn-tooltip-open::after { display: none; }
@media (hover: none), (pointer: coarse), (max-width: 520px) {
  .cbn-tooltip-trigger { display: inline-flex; }
  .cbn-tooltip-row { display: flex; align-items: center; gap: 4px; min-width: 0; }
  .cbn-tooltip-row > .cbn-row, .cbn-tooltip-row > a { flex: 1; min-width: 0; }
  .offer-tooltip:not(.cbn-tooltip-open), .bonus-chip-tooltip:not(.cbn-tooltip-open), .tooltip-wrap > .tooltip:not(.cbn-tooltip-open) { visibility: hidden; pointer-events: none; }
}
@media (prefers-reduced-motion: reduce) { .cbn-button, .cbn-field, .cbn-field-group, .cbn-row, .cbn-chip { transition: none; } }
`;

export function createMutedChip(label: string): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.className = "cbn-chip cbn-chip--muted";
  chip.textContent = label;
  return chip;
}
