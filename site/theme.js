(function(){"use strict";const k=`
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
@media (prefers-reduced-motion: reduce) { .cbn-button, .cbn-field, .cbn-field-group, .cbn-row, .cbn-chip { transition: none; } }
`,l="cashback-norge-theme",u=e=>e==="light"||e==="dark"?e:"system";function w(e={}){const o=e.media??window.matchMedia("(prefers-color-scheme: dark)");let c=u(e.initialPreference),n=0;const i=new Set,a=()=>({preference:c,resolved:c==="system"?o.matches?"dark":"light":c}),b=()=>i.forEach(r=>r(a())),d=r=>{n++,c=u(r),b()};o.addEventListener("change",b);const s=e.watch?.(d);if(e.load){const r=n;e.load().then(t=>{n===r&&d(t)}).catch(()=>{})}return{state:a,set(r){d(r);try{Promise.resolve(e.save?.(c)).catch(()=>{})}catch{}},subscribe(r){return i.add(r),r(a()),()=>{i.delete(r)}},dispose(){o.removeEventListener("change",b),s?.(),i.clear()}}}const y=`
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
  --cbn-bg: #0f0f0f; --cbn-surface: #181818; --cbn-soft: #222;
  --cbn-text: #f1f1f1; --cbn-muted: #b3b3b3; --cbn-subtle: #a0a0a0;
  --cbn-border: #363636; --cbn-hover: #303030; --cbn-accent: #7ddc9f;
  --cbn-highlight: #193526; --cbn-highlight-border: #376b4b;
  --cbn-tooltip: #303030; --cbn-glass: rgba(15,15,15,.94);
  --cbn-glass-surface: rgba(24,24,24,.98);
}
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
`,E={system:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',light:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',dark:'<path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/>'},h=e=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${E[e]}</svg>`,p={system:"Følg systemet",light:"Lys",dark:"Mørk"};let S=0;function L(e,o){return e.subscribe(({resolved:c})=>{o.dataset.cbnTheme=c})}function M(e,o,c="down"){const n=document.createElement("div");n.className="cbn-theme",n.dataset.placement=c;const i=`cbn-theme-menu-${++S}`;n.innerHTML=`<button type="button" class="cbn-theme-toggle cbn-button cbn-button--quiet" aria-expanded="false" aria-controls="${i}"></button><div id="${i}" class="cbn-theme-menu cbn-popover" role="group" aria-label="Utseende" hidden><strong>Utseende</strong>${["system","light","dark"].map(t=>`<button type="button" class="cbn-theme-option cbn-button cbn-button--quiet" data-mode="${t}" aria-pressed="false">${h(t)}${p[t]}</button>`).join("")}</div>`;const a=n.querySelector(".cbn-theme-toggle"),b=n.querySelector(".cbn-theme-menu"),d=()=>{b.hidden=!0,a.setAttribute("aria-expanded","false")};a.addEventListener("click",()=>{b.hidden=!b.hidden,a.setAttribute("aria-expanded",String(!b.hidden))}),n.addEventListener("keydown",t=>{t.key==="Escape"&&(d(),a.focus(),t.stopPropagation())}),n.querySelectorAll("[data-mode]").forEach(t=>t.addEventListener("click",()=>{e.set(u(t.dataset.mode)),d(),a.focus()}));const s=t=>{t.composedPath().includes(n)||d()};document.addEventListener("pointerdown",s,{passive:!0});const r=e.subscribe(({preference:t,resolved:A})=>{a.innerHTML=h(t);const v=`Utseende: ${p[t]}${t==="system"?` (${A==="dark"?"mørk":"lys"})`:""}`;a.title=v,a.setAttribute("aria-label",v),n.querySelectorAll("[data-mode]").forEach(x=>x.setAttribute("aria-pressed",String(x.dataset.mode===t)))});return o.append(n),()=>{r(),document.removeEventListener("pointerdown",s),n.remove()}}function T(e){const o=document.createElement("style");o.textContent=y+k,e.append(o)}let g;try{g=localStorage.getItem(l)}catch{}T(document.head);const f=w({initialPreference:g,save:e=>localStorage.setItem(l,e),watch:e=>{const o=c=>{(c.key===l||c.key===null)&&e(c.newValue)};return window.addEventListener("storage",o),()=>window.removeEventListener("storage",o)}});L(f,document.documentElement);const m=()=>document.querySelectorAll("[data-theme-control]").forEach(e=>M(f,e));document.readyState==="loading"?document.addEventListener("DOMContentLoaded",m,{once:!0}):m()})();
