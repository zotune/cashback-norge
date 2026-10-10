(function(){"use strict";const $=`
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
`,C={crypto:{bg:"#002d74",fg:"#ffffff"},remember:{bg:"#111111",fg:"#ff9900"},klarna:{bg:"#ffa8cd",fg:"#0b051d"},coupert:{bg:"#f03d30",fg:"#ffffff"},trumf:{bg:"#07006b",fg:"#ffffff"},sas:{bg:"#00005c",fg:"#ffffff"},tfbank:{bg:"#e30613",fg:"#ffffff"},dnb:{bg:"#14555a",fg:"#ffffff"},curve:{bg:"#000000",fg:"#ffffff"},rabattkode:{bg:"#e74c3c",fg:"#ffffff"},norskfamilie:{bg:"#ff6600",fg:"#ffffff"},logbuy:{bg:"#d81939",fg:"#ffffff"},obos:{bg:"#003087",fg:"#ffffff"},bob:{bg:"#ffffff",fg:"#5b2486"},usbl:{bg:"#34413e",fg:"#ffffff"},bate:{bg:"#ffffff",fg:"#ef1c24"},tobb:{bg:"#00466b",fg:"#ffffff"},naf:{bg:"#FFD100",fg:"#000000"},tekna:{bg:"#ffffff",fg:"#00a3ad"},nito:{bg:"#c8e6b8",fg:"#003b00"},sparebank1:{bg:"#005aa4",fg:"#ffffff"},studentkortet:{bg:"#1B2838",fg:"#ffffff"},studenttorget:{bg:"#009fe3",fg:"#ffffff"},nettbonus:{bg:"#5b0f8c",fg:"#ffffff"},spenn:{bg:"#E51454",fg:"#ffffff"},spareborsen:{bg:"#C9A24A",fg:"#1A1A1A"},rabble:{bg:"#2d2145",fg:"#f8a6a6"},dreams:{bg:"#a389d8",fg:"#1a1a1a"},utdanningibergen:{bg:"#ffffff",fg:"#000000"},unidays:{bg:"#00b140",fg:"#ffffff"},unio:{bg:"#ffffff",fg:"#6b5330"},coop:{bg:"#003366",fg:"#ffffff"},elkjop:{bg:"#1d1b58",fg:"#ffffff"},akademikerne:{bg:"#fff7f0",fg:"#113063"},huseierne:{bg:"#ffffff",fg:"#0f1a18"},huseierforbundet:{bg:"#ffffff",fg:"#0f1a18"},amcar:{bg:"#c01921",fg:"#ffffff"},horselsforbundet:{bg:"#ffffff",fg:"#f1774f"},knbf:{bg:"#00205b",fg:"#ffffff"},njff:{bg:"#ffffff",fg:"#003a5d"},pensjonistforbundet:{bg:"#ffffff",fg:"#000000"},kna:{bg:"#d60929",fg:"#ffffff"},syklistforeningen:{bg:"#e61414",fg:"#ffffff"},revmatikerforbundet:{bg:"#ffffff",fg:"#2d4f9e"},redningsselskapet:{bg:"#ffffff",fg:"#0a2a66"},lhl:{bg:"#ffffff",fg:"#4b1d6f"},skiforeningen:{bg:"#ffffff",fg:"#0067b1"},agrol:{bg:"#ffffff",fg:"#3d3d3d"},kondis:{bg:"#ffffff",fg:"#8b1a1a"},santander:{bg:"#ffffff",fg:"#ec0000"},norwegian:{bg:"#d81939",fg:"#ffffff"},vestbo:{bg:"#ffffff",fg:"#1dc1dd"},bbl:{bg:"#1657e2",fg:"#ffffff"},elbilforeningen:{bg:"#003a78",fg:"#ffffff"},ys:{bg:"#006e26",fg:"#ffffff"},lofavor:{bg:"#dc141a",fg:"#ffffff"},cbn:{bg:"#ffe4e6",fg:"#be123c"}},m="cashback-norge-theme",v=t=>t==="light"||t==="dark"?t:"system";function q(t={}){const n=t.media??window.matchMedia("(prefers-color-scheme: dark)");let o=v(t.initialPreference),r=0;const f=new Set,a=()=>({preference:o,resolved:o==="system"?n.matches?"dark":"light":o}),d=()=>f.forEach(s=>s(a())),g=s=>{r++,o=v(s),d()};n.addEventListener("change",d);const u=t.watch?.(g);if(t.load){const s=r;t.load().then(e=>{r===s&&g(e)}).catch(()=>{})}return{state:a,set(s){g(s);try{Promise.resolve(t.save?.(o)).catch(()=>{})}catch{}},subscribe(s){return f.add(s),s(a()),()=>{f.delete(s)}},dispose(){n.removeEventListener("change",d),u?.(),f.clear()}}}const M={...C,prisradar:{bg:"#ffffff",fg:"#0c4598"},google:{bg:"#ffffff",fg:"#1a73e8"},panflights:{bg:"#ffffff",fg:"#1375f7"},enhver:{bg:"#ffffff",fg:"#162333"},sesum:{bg:"#f3f4f6",fg:"#111827"}},T=`
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
${Object.entries(M).map(([t,n])=>{const r=["#ffffff","#fff7f0","#f3f4f6"].includes(n.bg.toLowerCase())?`background:#34373d;color:color-mix(in srgb, ${n.fg} 30%, #ededed 70%);`:n.fg.toLowerCase()==="#ffffff"?"color:#e5e5e5;":"";return r?`:root[data-cbn-theme="dark"] .provider-${t}, :root[data-cbn-theme="dark"] .badge-${t}, :host([data-cbn-theme="dark"]) .provider-${t} {${r}}`:""}).join(`
`)}
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
`,P={system:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',light:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',dark:'<path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/>'},x=t=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[t]}</svg>`,k={system:"Følg systemet",light:"Lys",dark:"Mørk"};let j=0;function N(t,n){return t.subscribe(({resolved:o})=>{n.dataset.cbnTheme=o})}function B(t,n,o="down"){const r=document.createElement("div");r.className="cbn-theme",r.dataset.placement=o;const f=`cbn-theme-menu-${++j}`;r.innerHTML=`<button type="button" class="cbn-theme-toggle cbn-button cbn-button--quiet" aria-expanded="false" aria-controls="${f}"></button><div id="${f}" class="cbn-theme-menu cbn-popover" role="group" aria-label="Utseende" hidden><strong>Utseende</strong>${["system","light","dark"].map(e=>`<button type="button" class="cbn-theme-option cbn-button cbn-button--quiet" data-mode="${e}" aria-pressed="false">${x(e)}${k[e]}</button>`).join("")}</div>`;const a=r.querySelector(".cbn-theme-toggle"),d=r.querySelector(".cbn-theme-menu"),g=()=>{d.hidden=!0,a.setAttribute("aria-expanded","false")};a.addEventListener("click",()=>{d.hidden=!d.hidden,a.setAttribute("aria-expanded",String(!d.hidden))}),r.addEventListener("keydown",e=>{e.key==="Escape"&&(g(),a.focus(),e.stopPropagation())}),r.querySelectorAll("[data-mode]").forEach(e=>e.addEventListener("click",()=>{t.set(v(e.dataset.mode)),g(),a.focus()}));const u=e=>{e.composedPath().includes(r)||g()};document.addEventListener("pointerdown",u,{passive:!0});const s=t.subscribe(({preference:e,resolved:i})=>{a.innerHTML=x(e);const b=`Utseende: ${k[e]}${e==="system"?` (${i==="dark"?"mørk":"lys"})`:""}`;a.title=b,a.setAttribute("aria-label",b),r.querySelectorAll("[data-mode]").forEach(c=>c.setAttribute("aria-pressed",String(c.dataset.mode===e)))});return n.append(r),()=>{s(),document.removeEventListener("pointerdown",u),r.remove()}}function z(t){const n=document.createElement("style");n.textContent=T+$,t.append(n)}let O=0;function H(t,n,o,r){const f=Math.max(8,Math.min(t.left,r.width-n-8)),a=t.bottom+8,d=a+o<=r.height-8?a:Math.max(8,t.top-o-8);return{left:f,top:d}}function I(t){const n=t.ownerDocument??t,o=n.defaultView,r=new WeakMap;let f;const a=()=>{if(!f)return;const{button:e,tooltip:i,style:b}=f;e.setAttribute("aria-expanded","false"),i.classList.remove("cbn-tooltip-open","visible"),b===null?i.removeAttribute("style"):i.setAttribute("style",b),f=void 0},d=e=>{const i=e.target.closest(".cbn-tooltip-trigger");if(!i||!r.has(i))return;if(e.preventDefault(),e.stopPropagation(),f?.button===i){a();return}a();const b=r.get(i);f={button:i,tooltip:b,style:b.getAttribute("style")},i.setAttribute("aria-expanded","true"),b.classList.add("cbn-tooltip-open"),Object.assign(b.style,{position:"fixed",left:"8px",top:"8px",bottom:"auto",right:"auto",transform:"none",width:`${Math.min(340,n.documentElement.clientWidth-16)}px`,maxWidth:"none",maxHeight:`${Math.max(80,o.innerHeight-32)}px`,overflowY:"auto",boxSizing:"border-box",whiteSpace:"normal"});const c=b.getBoundingClientRect(),l=H(i.getBoundingClientRect(),c.width,c.height,{width:n.documentElement.clientWidth,height:o.innerHeight});b.style.left=`${l.left}px`,b.style.top=`${l.top}px`},g=e=>{f&&!e.composedPath().includes(f.button)&&!e.composedPath().includes(f.tooltip)&&a()},u=e=>{if(e.key==="Escape"&&f){const i=f.button;a(),i.focus(),e.stopPropagation()}},s=e=>{f&&!(e.target instanceof Node&&f.tooltip.contains(e.target))&&a()};return t.addEventListener("click",d),n.addEventListener("pointerdown",g,{passive:!0}),n.addEventListener("keydown",u),n.addEventListener("scroll",s,{capture:!0,passive:!0}),o.addEventListener("resize",a),{close:a,add(e,i,b="Vis vilkår og detaljer"){if(e.querySelector(".cbn-tooltip-trigger"))return;i.id||=`cbn-tooltip-${++O}`,i.setAttribute("role","tooltip");const c=n.createElement("button");c.type="button",c.className="cbn-button cbn-button--quiet cbn-tooltip-trigger",c.textContent="ⓘ",c.setAttribute("aria-label",b),c.setAttribute("aria-expanded","false"),c.setAttribute("aria-controls",i.id),r.set(c,i);const l=e.querySelector(":scope > .offer-action");if(l){const p=n.createElement("span");p.className="cbn-offer-details",p.append(c);const h=l.querySelector(".offer-reward, .offer-label");for(;h?.nextElementSibling;)p.append(h.nextElementSibling);l.after(p)}else e.insertBefore(c,e.querySelector(":scope > .code-source-badge, :scope > .provider-filter-link, :scope > .badge"))},addBeside(e,i,b){const c=n.createElement("div");if(c.className="cbn-tooltip-row",e.replaceWith(c),c.append(e),e.classList.contains("bonus-chip")){c.className+=` ${e.className}`,e.className="bonus-chip-action";const l=n.createElement("span");l.className="cbn-offer-details",this.add(l,i,b);const p=e.querySelector(".bonus-chip-label"),h=n.createElement("a");h.className="bonus-chip-brand-link";for(const L of["href","target","rel"]){const A=e.getAttribute(L);A!==null&&h.setAttribute(L,A)}for(;p?.nextElementSibling;)h.append(p.nextElementSibling);l.append(h),c.append(l)}else this.add(c,i,b),c.prepend(c.querySelector(".cbn-tooltip-trigger"));return c},dispose(){a(),t.removeEventListener("click",d),n.removeEventListener("pointerdown",g),n.removeEventListener("keydown",u),n.removeEventListener("scroll",s,!0),o.removeEventListener("resize",a)}}}function R(t,n){n.querySelectorAll(".offer-wrap, .code-item-row, .tooltip-wrap").forEach(o=>{if(o.querySelector(".cbn-tooltip-trigger"))return;const r=o.querySelector(":scope > .offer-tooltip, :scope > .tooltip");if(!r)return;const f=o.querySelector(":scope > .offer, :scope > .code-item");f?t.add(f,r):o.querySelector(":scope > .bonus-chip")?t.addBeside(o.querySelector(":scope > .bonus-chip"),r):(o.classList.add("cbn-tooltip-row"),t.add(o,r))})}const y=I(document);window.CashbackTooltips={attach:t=>R(y,t),close:y.close};let w;try{w=localStorage.getItem(m)}catch{}z(document.head);const E=q({initialPreference:w,save:t=>localStorage.setItem(m,t),watch:t=>{const n=o=>{(o.key===m||o.key===null)&&t(o.newValue)};return window.addEventListener("storage",n),()=>window.removeEventListener("storage",n)}});N(E,document.documentElement);const S=()=>document.querySelectorAll("[data-theme-control]").forEach(t=>B(E,t));document.readyState==="loading"?document.addEventListener("DOMContentLoaded",S,{once:!0}):S()})();
