// Shared offer list for /dagligvarer and /dagens-tilbud: filter buttons per group (shop or
// category), search, sorting, filters, list/grid/table views, lazy batches, image preview,
// copy and votes. Each page passes a config that turns its catalogue into items:
//
//   { id, title, description?, group, store: { label, className?, url? }, amount,
//     prePrice?, saving?, imageUrl?, validFrom?, validTo?, link: { url, label },
//     unit?: { amount, unit }, bonus?: { label, rate }, rank? }
//
// `saving` is the discount in percent the page shows (the flyer's pre-price for groceries,
// Prisjakt's price drop for its deals); `prePrice` stays the shop's own pre-price.
(() => {
  const {
    createCountBadge, fitCountToChip, createChoiceMenu, createLazyBatches,
    renderSupportFooter, getInstabankInvite, renderSupportInvite, selectSupportAdvertisement,
    fetchVoteTallies, fetchMyVotes, apiVote, formatKr, copyOffer,
  } = window.SHARED;

  const BATCH = 40;
  const THUMBS_UP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`;
  const THUMBS_DOWN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>`;
  const COPY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  const EXTERNAL_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>`;
  const FILTER_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16l-6 7v6l-4 2v-8z"/></svg>`;
  const SORT_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/></svg>`;
  const VIEW_ICONS = {
    table: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/></svg>`,
    list: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><rect x="3" y="4.5" width="3" height="3" rx=".5"/><rect x="3" y="10.5" width="3" height="3" rx=".5"/><rect x="3" y="16.5" width="3" height="3" rx=".5"/></svg>`,
    grid: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/></svg>`,
  };
  const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
  const fold = (value) => String(value).toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a").normalize("NFD").replace(/[̀-ͯ]/g, "");
  // "9,90 kr", "2 507 kr": decimals only when the price has øre.
  const kr = (amount) => `${new Intl.NumberFormat("nb-NO", { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 }).format(amount)} kr`;
  const formatDate = (iso) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short", timeZone: "Europe/Oslo" }).format(date).replace(/\.$/, "");
  };
  const osloDay = (time) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date(time));
  // Whole days left in Oslo time: 0 is the last day.
  const daysLeft = (item, now = Date.now()) => Math.round((Date.parse(osloDay(Date.parse(item.validTo))) - Date.parse(osloDay(now))) / 86_400_000);

  const ALL_SORTS = [
    { value: "relevance", label: "Mest relevant" },
    { value: "saving", label: "Størst rabatt" },
    { value: "savingKr", label: "Mest spart i kr" },
    { value: "price", label: "Lavest pris" },
    { value: "votes", label: "Best vurdert (opp − ned)" },
    { value: "ending", label: "Utløper først", feature: "validity" },
    { value: "unit", label: "Lavest kilo-/literpris", feature: "unit" },
    { value: "name", label: "Navn A–Å" },
    { value: "store", label: "Butikk A–Å" },
    { value: "group", label: "Kategori A–Å", feature: "category" },
  ];
  const FILTER_DEFAULTS = { minSaving: 0, maxPrice: 0, maxUnit: 0, onlyPrePrice: false, endingSoon: false };

  /**
   * @param {object} config
   * @param {HTMLElement} config.mount        element the list is rendered into
   * @param {string} config.dataUrl          catalogue JSON
   * @param {string} config.storageKey       localStorage key for the viewer's choices
   * @param {string} config.voteKey          Supabase key the votes are stored under
   * @param {string} config.groupLabel       "Butikker" / "Kategorier"
   * @param {string} [config.noGroupsText]   shown when every filter is off
   * @param {(catalog: any) => {items: object[], updated?: string, note?: string}} config.read
   * @param {string[]} [config.groupOrder]   fixed chip order (else alphabetical)
   * @param {{unit?: boolean, validity?: boolean, bonus?: boolean, category?: boolean}} config.features
   * @param {string} [config.savingLabel]    column heading for `saving`
   * @param {string} [config.searchPlaceholder]
   * @param {(params: URLSearchParams, groups: string[]) => string[] | undefined} [config.onlyGroupsFromUrl]
   */
  window.createOfferList = (config) => {
    const features = config.features ?? {};
    const SORTS = ALL_SORTS.filter((sort) => !sort.feature || features[sort.feature]).map((sort) => sort.value === "saving" && config.savingLabel ? { ...sort, label: `Størst ${config.savingLabel.toLowerCase()}` } : sort);
    const wideScreen = window.matchMedia("(min-width: 1100px)");
    const state = { items: [], counts: new Map(), off: new Set(), query: "", sort: "relevance", sortDir: 1, view: wideScreen.matches ? "table" : "list", filters: { ...FILTER_DEFAULTS }, list: [], shown: 0 };
    const tallies = new Map();
    let myVotes = {};
    let previewFor = null;
    let rearmBatches = () => {};
    let sortMenu = { refresh() {} };
    let searchTimer;

    // ---------- markup ----------
    config.mount.innerHTML = `
      <div class="sticky-header" data-ol="sticky">
        <div class="group-heading"><span>${esc(config.groupLabel)} <small>Velg én eller flere</small></span><span class="group-actions">
          <button class="cbn-button cbn-button--quiet list-reset" data-ol="all" type="button">Velg alle</button>
          <button class="cbn-button cbn-button--quiet list-reset" data-ol="none" type="button">Velg ingen</button>
        </span></div>
        <div class="chip-toggles group-toggles" data-ol="groups" role="group" aria-label="${esc(config.groupLabel)}"></div>
        <div class="list-bar">
          <div class="count" data-ol="count" aria-live="polite"></div>
          <button class="cbn-button cbn-button--quiet filter-button" data-ol="filter-toggle" type="button" aria-expanded="false" aria-label="Flere filtre" title="Flere filtre">${FILTER_SVG}</button>
          <button class="cbn-button cbn-button--quiet sort-button" data-ol="sort" type="button" aria-label="Sorter tilbud">${SORT_SVG}<span data-choice-label></span></button>
          <div class="view-toggle" role="group" aria-label="Visning">
            <button class="cbn-button cbn-button--quiet view-table" type="button" data-view="table" aria-label="Tabell" title="Tabell">${VIEW_ICONS.table}</button>
            <button class="cbn-button cbn-button--quiet" type="button" data-view="list" aria-label="Liste" title="Liste">${VIEW_ICONS.list}</button>
            <button class="cbn-button cbn-button--quiet" type="button" data-view="grid" aria-label="Rutenett" title="Rutenett">${VIEW_ICONS.grid}</button>
          </div>
        </div>
        <div class="filters" data-ol="filters" hidden>
          <label>Min. ${esc((config.savingLabel ?? "Rabatt").toLowerCase())} <input class="cbn-field" type="number" min="0" max="99" step="5" inputmode="numeric" data-filter="minSaving" placeholder="%"></label>
          <label>Maks pris <input class="cbn-field" type="number" min="0" step="10" inputmode="decimal" data-filter="maxPrice" placeholder="kr"></label>
          ${features.unit ? `<label>Maks kilo-/literpris <input class="cbn-field" type="number" min="0" step="10" inputmode="decimal" data-filter="maxUnit" placeholder="kr"></label>` : ""}
          <label><input type="checkbox" data-filter="onlyPrePrice"> Bare med førpris</label>
          ${features.validity ? `<label><input type="checkbox" data-filter="endingSoon"> Utløper innen 2 dager</label>` : ""}
          <button class="cbn-button cbn-button--quiet" data-ol="filters-clear" type="button">Nullstill</button>
        </div>
        <div class="search-wrap">
          <div class="input-wrap flex1">
            <input class="cbn-field search" data-ol="search" type="search" placeholder="${esc(config.searchPlaceholder ?? "Søk ...")}" autocomplete="off" aria-label="Søk i tilbudene">
            <button class="cbn-button cbn-button--quiet input-clear" type="button" aria-label="Tøm søk">✕</button>
          </div>
        </div>
      </div>
      <div class="results" data-ol="results" aria-live="off"><div class="empty">Laster tilbud …</div></div>
      <div data-ol="more" aria-hidden="true"></div>
      <div class="az-bar" data-ol="az" hidden></div>
      <img class="deal-preview" data-ol="preview" alt="" hidden>`;
    const el = (name) => config.mount.querySelector(`[data-ol="${name}"]`);

    // ---------- preferences ----------
    function loadPreferences() {
      try {
        const saved = JSON.parse(localStorage.getItem(config.storageKey) || "{}");
        if (Array.isArray(saved.off)) state.off = new Set(saved.off.filter((name) => typeof name === "string"));
        if (SORTS.some((sort) => sort.value === saved.sort)) state.sort = saved.sort;
        if (["grid", "list", "table"].includes(saved.view)) state.view = saved.view;
        if (saved.sortDir === -1) state.sortDir = -1;
        if (saved.filters && typeof saved.filters === "object") {
          for (const key of Object.keys(FILTER_DEFAULTS)) {
            if (typeof saved.filters[key] === typeof FILTER_DEFAULTS[key]) state.filters[key] = saved.filters[key];
          }
        }
      } catch { /* Defaults: every group, most relevant, table on wide screens. */ }
    }
    function savePreferences() {
      try { localStorage.setItem(config.storageKey, JSON.stringify({ off: [...state.off], sort: state.sort, sortDir: state.sortDir, view: state.view, filters: state.filters })); } catch { /* Optional. */ }
    }

    // The spreadsheet needs the width; phones get the list instead.
    const effectiveView = () => state.view === "table" && !wideScreen.matches ? "list" : state.view;
    const isRunning = (item, now) => (!item.validTo || Date.parse(item.validTo) >= now) && (!item.validFrom || Date.parse(item.validFrom) <= now);
    const saving = (item) => item.saving ?? 0;
    const savingKr = (item) => item.prePrice > item.amount ? item.prePrice - item.amount : 0;
    const netVotes = (item) => { const t = tallies.get(item.id.toUpperCase()); return t ? t.upvotes - t.downvotes : 0; };

    // ---------- group filters ----------
    function renderGroups() {
      const nav = el("groups");
      nav.replaceChildren();
      const names = config.groupOrder?.filter((name) => state.counts.has(name)) ?? [...state.counts.keys()].sort((a, b) => (config.groupName?.(a) ?? a).localeCompare(config.groupName?.(b) ?? b, "nb"));
      for (const name of names) {
        const button = document.createElement("button");
        const on = !state.off.has(name);
        button.type = "button";
        button.className = "cbn-button cbn-button--filter group-toggle";
        button.dataset.group = name;
        button.setAttribute("aria-pressed", String(on));
        button.title = on ? `Skjul ${name}` : `Vis ${name}`;
        const check = document.createElement("span");
        check.className = "group-check";
        check.setAttribute("aria-hidden", "true");
        check.textContent = on ? "✓" : "+";
        const label = document.createElement("span");
        label.textContent = config.groupName?.(name) ?? name;
        button.append(check, label, createCountBadge(state.counts.get(name), `${state.counts.get(name)} tilbud`));
        nav.append(button);
        if (on) fitCountToChip(button);
      }
      el("all").disabled = ![...state.counts.keys()].some((name) => state.off.has(name));
      el("none").disabled = ![...state.counts.keys()].some((name) => !state.off.has(name));
    }

    // ---------- list ----------
    function relevance(item, words) {
      const title = item.foldedTitle ??= fold(item.title);
      return words.reduce((score, word) => score + (title.startsWith(word) ? 3 : title.includes(word) ? 2 : 1), 0);
    }
    function render() {
      const now = Date.now();
      const words = fold(state.query).split(/\s+/).filter(Boolean);
      const { minSaving, maxPrice, maxUnit, onlyPrePrice, endingSoon } = state.filters;
      const visible = state.items.filter((item) => isRunning(item, now) && !state.off.has(item.group) &&
        (!minSaving || saving(item) >= minSaving) &&
        (!maxPrice || item.amount <= maxPrice) &&
        (!features.unit || !maxUnit || (item.unit && item.unit.amount <= maxUnit)) &&
        (!onlyPrePrice || item.prePrice > item.amount) &&
        (!features.validity || !endingSoon || (item.validTo && daysLeft(item, now) <= 2)));
      let list = words.length === 0 ? visible : visible.filter((item) => {
        const text = item.searchText ??= fold(`${item.title} ${item.description ?? ""} ${item.store.label} ${item.group} ${item.category ?? ""}`);
        return words.every((word) => text.includes(word));
      });
      const byDiscount = (a, b) => saving(b) - saving(a) || a.amount - b.amount;
      // Without a search, "most relevant" is the source's own order when it has one.
      const natural = (a, b) => (a.rank ?? 0) - (b.rank ?? 0) || byDiscount(a, b);
      const sorters = {
        relevance: (a, b) => (words.length ? relevance(b, words) - relevance(a, words) : 0) || natural(a, b),
        saving: byDiscount,
        savingKr: (a, b) => savingKr(b) - savingKr(a) || byDiscount(a, b),
        price: (a, b) => a.amount - b.amount,
        votes: (a, b) => netVotes(b) - netVotes(a) || natural(a, b),
        ending: (a, b) => Date.parse(a.validTo ?? "9999") - Date.parse(b.validTo ?? "9999") || byDiscount(a, b),
        // Items without a printed unit price go last either way.
        unit: (a, b) => (a.unit?.amount ?? Infinity) - (b.unit?.amount ?? Infinity) || a.amount - b.amount,
        name: (a, b) => a.title.localeCompare(b.title, "nb"),
        store: (a, b) => a.store.label.localeCompare(b.store.label, "nb") || byDiscount(a, b),
        group: (a, b) => (a.category || a.group).localeCompare(b.category || b.group, "nb") || byDiscount(a, b),
      };
      const sorter = sorters[state.sort] || sorters.relevance;
      list = [...list].sort(state.sortDir === -1 ? (a, b) => sorter(b, a) : sorter);
      el("count").textContent = words.length ? `${list.length} av ${visible.length} tilbud` : `${visible.length} tilbud`;
      state.list = list;
      state.shown = 0;
      hidePreview();
      const results = el("results");
      const view = effectiveView();
      results.classList.toggle("results--grid", view === "grid");
      results.classList.toggle("results--table", view === "table");
      el("filter-toggle").classList.toggle("is-active", hasFilters());
      renderAzBar();
      if (list.length === 0) {
        const message = state.counts.size > 0 && [...state.counts.keys()].every((name) => state.off.has(name))
          ? (config.noGroupsText ?? "Velg minst én.")
          : words.length ? `Ingen tilbud på «${esc(state.query)}» akkurat nå.` : "Ingen tilbud med disse filtrene.";
        results.innerHTML = `<div class="empty">${message}</div>`;
        return;
      }
      results.replaceChildren();
      if (view === "table") results.innerHTML = tableHeadHtml();
      renderMore();
      rearmBatches();
    }
    function renderMore() {
      const end = Math.min(state.list.length, state.shown + BATCH);
      const template = document.createElement("template");
      const table = effectiveView() === "table";
      const rows = state.list.slice(state.shown, end).map(table ? tableRowHtml : cardHtml).join("");
      state.shown = end;
      if (table) {
        // Table rows only parse inside a table.
        template.innerHTML = `<table><tbody>${rows}</tbody></table>`;
        el("results").querySelector("tbody").append(...template.content.querySelector("tbody").children);
      } else {
        template.innerHTML = rows;
        el("results").append(template.content);
      }
    }

    // ---------- rows ----------
    const columns = () => [
      { label: "", sort: "" },
      { label: "Vare", sort: "name" },
      { label: "Butikk", sort: "store" },
      ...(features.category ? [{ label: "Kategori", sort: "group" }] : []),
      { label: "Pris", sort: "price", num: true },
      { label: "Førpris", sort: "", num: true },
      { label: config.savingLabel ?? "Rabatt", sort: "saving", num: true },
      { label: "Spart", sort: "savingKr", num: true },
      ...(features.unit ? [{ label: "Kilo-/literpris", sort: "unit", num: true }] : []),
      ...(features.validity ? [{ label: "Gyldig", sort: "ending" }] : []),
      ...(features.bonus ? [{ label: "Kortbonus", sort: "" }] : []),
      { label: "Stemmer", sort: "votes", num: true },
      { label: "", sort: "" },
    ];
    function tableHeadHtml() {
      return `<table class="deal-table"><thead><tr>${columns().map((column) => {
        const descending = ["saving", "savingKr", "votes"].includes(column.sort) !== (state.sortDir === -1);
        const sorted = column.sort && column.sort === state.sort ? ` aria-sort="${descending ? "descending" : "ascending"}"` : "";
        return `<th${column.num ? ' class="num"' : ""}${column.sort ? ` data-sort="${column.sort}" title="Sorter etter ${column.label.toLowerCase()}"` : ""}${sorted}>${esc(column.label)}</th>`;
      }).join("")}</tr></thead><tbody></tbody></table>`;
    }
    const thumbHtml = (item) => item.imageUrl
      ? `<button class="deal-thumb" type="button" data-preview="${esc(item.imageUrl)}" aria-label="Vis større bilde av ${esc(item.title)}"><img src="${esc(item.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('deal-thumb--empty');this.remove()"></button>`
      : `<span class="deal-thumb deal-thumb--empty" aria-hidden="true"></span>`;
    const titleHtml = (item) => `<span class="deal-title"><a href="${esc(item.link.url)}" target="_blank" rel="noopener" title="${esc(item.link.label)}">${esc(item.title)}${EXTERNAL_SVG}</a></span>`;
    const storeHtml = (item) => {
      const chip = `<span class="cbn-chip badge ${esc(item.store.className ?? "cbn-chip--muted")}">${esc(item.store.label)}</span>`;
      return item.store.url ? `<a class="deal-store-link" href="${esc(item.store.url)}" target="_blank" rel="noopener sponsored" title="Gå til ${esc(item.store.label)}">${chip}</a>` : chip;
    };
    const savingChipHtml = (item) => saving(item) > 0 ? `<span class="cbn-chip cbn-chip--highlight card-chip"${item.savingTitle ? ` title="${esc(item.savingTitle)}"` : ""}>−${saving(item)} %</span>` : "";
    const bonusHtml = (item) => item.bonus ? `<span class="cbn-chip cbn-chip--highlight card-chip" title="${esc(item.bonus.title ?? item.bonus.label)}">${esc(item.bonus.label)} ${esc(item.bonus.rate)}</span>` : "";
    function daysLeftHtml(item) {
      if (!item.validTo) return "";
      const days = daysLeft(item);
      const label = days <= 0 ? "Siste dag" : days === 1 ? "1 dag igjen" : `${days} dager igjen`;
      const tone = days <= 0 ? "last" : days <= 2 ? "soon" : "ok";
      return `<span class="days-left days-left--${tone}" title="Gyldig t.o.m. ${esc(formatDate(item.validTo))}">${label}</span>`;
    }
    const copyButtonHtml = () => `<button class="cbn-button cbn-button--quiet copy-btn" type="button" aria-label="Kopier tilbudet som bilde">${COPY_SVG}<span class="vote-tooltip">Kopier som bilde</span></button>`;
    const actionsHtml = (item) => `<span class="deal-actions">${copyButtonHtml()}${voteButtons(item)}</span>`;
    function voteButtons(item) {
      const tally = tallies.get(item.id.toUpperCase());
      const net = tally ? tally.upvotes - tally.downvotes : 0;
      const mine = tally ? myVotes[tally.id] : undefined;
      return `<span class="deal-votes">
        <button class="cbn-button cbn-button--quiet vote-btn${mine === -1 ? " downvoted" : ""}" type="button" data-vote="-1" aria-label="Dårlig tilbud">${THUMBS_DOWN_SVG}<span class="vote-count">${net < 0 ? -net : ""}</span><span class="vote-tooltip">Ikke noe tilbud</span></button>
        <button class="cbn-button cbn-button--quiet vote-btn${mine === 1 ? " voted" : ""}" type="button" data-vote="1" aria-label="Godt tilbud">${THUMBS_UP_SVG}<span class="vote-count">${net > 0 ? net : ""}</span><span class="vote-tooltip">Godt tilbud!</span></button>
      </span>`;
    }
    function tableRowHtml(item) {
      return `<tr class="deal-row" data-id="${esc(item.id)}">
        <td>${thumbHtml(item)}</td>
        <td>${titleHtml(item)}${item.description ? `<br><span class="deal-desc">${esc(item.description)}</span>` : ""}</td>
        <td>${storeHtml(item)}</td>
        ${features.category ? `<td><span class="deal-desc">${esc(item.category || item.group)}</span></td>` : ""}
        <td class="num"><strong class="deal-price">${esc(kr(item.amount))}</strong></td>
        <td class="num">${item.prePrice > item.amount ? `<s class="deal-before">${esc(kr(item.prePrice))}</s>` : ""}</td>
        <td class="num">${savingChipHtml(item)}</td>
        <td class="num">${savingKr(item) > 0 ? esc(kr(savingKr(item))) : ""}</td>
        ${features.unit ? `<td class="num">${item.unit ? `${esc(formatKr(item.unit.amount))} kr/${item.unit.unit}` : ""}</td>` : ""}
        ${features.validity ? `<td>${daysLeftHtml(item)}</td>` : ""}
        ${features.bonus ? `<td>${bonusHtml(item)}</td>` : ""}
        <td class="num deal-vote-cell">${voteButtons(item)}</td>
        <td class="deal-copy-cell">${copyButtonHtml()}</td>
      </tr>`;
    }
    function cardHtml(item) {
      const before = item.prePrice > item.amount || saving(item) > 0
        ? `<span class="deal-before">${item.prePrice > item.amount ? `<s aria-label="Førpris">${esc(kr(item.prePrice))}</s>` : ""}${savingChipHtml(item)}</span>`
        : "";
      return `<article class="cbn-card deal-row" data-id="${esc(item.id)}">
        ${thumbHtml(item)}
        <div class="deal-main">
          ${titleHtml(item)}
          ${item.description ? `<span class="deal-desc">${esc(item.description)}</span>` : ""}
        </div>
        <div class="deal-side">
          <strong class="deal-price">${esc(kr(item.amount))}</strong>
          ${before}
          ${actionsHtml(item)}
        </div>
        <div class="deal-details">
          <div class="deal-meta">${storeHtml(item)}${bonusHtml(item)}${features.category ? `<span class="deal-valid">${esc(item.category || item.group)}</span>` : ""}</div>
          ${item.validTo ? `<div class="deal-meta deal-meta--validity">${daysLeftHtml(item)}<span class="deal-valid">t.o.m. ${esc(formatDate(item.validTo))}</span></div>` : ""}
        </div>
      </article>`;
    }

    // ---------- preview, copy, votes ----------
    function showPreview(thumb) {
      const preview = el("preview");
      previewFor = thumb;
      preview.src = thumb.dataset.preview;
      preview.hidden = false;
      const place = () => {
        if (previewFor !== thumb) return;
        const rect = thumb.getBoundingClientRect();
        const width = preview.offsetWidth || 320;
        const height = preview.offsetHeight || 320;
        const right = rect.right + 12;
        const left = right + width <= window.innerWidth - 12 ? right : Math.max(12, rect.left - width - 12);
        const top = Math.min(Math.max(12, rect.top + rect.height / 2 - height / 2), window.innerHeight - height - 12);
        preview.style.left = `${left}px`;
        preview.style.top = `${Math.max(12, top)}px`;
      };
      place();
      preview.onload = place;
    }
    function hidePreview() {
      previewFor = null;
      el("preview").hidden = true;
    }
    const itemOf = (element) => state.items.find((item) => item.id === element.closest(".deal-row")?.dataset.id);

    // A real PNG attachment also pastes into native Notes; remote HTML images do not.
    async function copyItem(button) {
      const item = itemOf(button);
      if (!item || button.disabled) return;
      const price = `${kr(item.amount)}${item.prePrice > item.amount ? ` (før ${kr(item.prePrice)})` : ""}${saving(item) > 0 ? ` −${saving(item)} %` : ""}`;
      const where = [item.store.label, item.validTo ? `t.o.m. ${formatDate(item.validTo)}` : ""].filter(Boolean).join(" · ");
      const tooltip = button.querySelector(".vote-tooltip");
      button.disabled = true;
      button.classList.add("copied");
      tooltip.textContent = "Lager bilde …";
      try {
        tooltip.textContent = await copyOffer({ title: item.title, description: item.description, price, where, url: item.link.url, imageUrl: item.imageUrl });
      } catch {
        tooltip.textContent = "Kunne ikke kopiere";
      }
      button.disabled = false;
      setTimeout(() => { button.classList.remove("copied"); tooltip.textContent = "Kopier som bilde"; }, 2500);
    }
    async function castVote(button) {
      const row = button.closest(".deal-row");
      const item = itemOf(button);
      if (!item || button.disabled) return;
      const vote = Number(button.dataset.vote);
      const key = item.id.toUpperCase();
      const tally = tallies.get(key);
      button.closest(".deal-votes").querySelectorAll(".vote-btn").forEach((other) => { other.disabled = true; });
      const result = await apiVote(tally?.id ?? 0, vote, { hostname: config.voteKey, code: item.id, reward: item.title.slice(0, 80) });
      if (result?.rate_limited) {
        showRowMessage(row, "Grensen er 5 nye stemmer/rabattkoder per 24 timer.");
      } else if (result && typeof result.upvotes === "number") {
        const id = result.registered_id ?? tally?.id;
        if (result.deleted || id === undefined) tallies.delete(key);
        else tallies.set(key, { id, code: key, upvotes: result.upvotes, downvotes: result.downvotes });
        if (result.capped) showRowMessage(row, "Tilbudet har allerede 5 stemmer i denne retningen.");
        if (id !== undefined && !result.capped) {
          if (result.toggled_off || result.deleted) delete myVotes[id];
          else myVotes[id] = vote;
        }
      } else {
        showRowMessage(row, "Klarte ikke å lagre stemmen. Prøv igjen.");
      }
      if (state.sort === "votes" && result && !result.capped && typeof result.upvotes === "number") render();
      else replaceVotes(row, item);
    }
    function replaceVotes(row, item) {
      const template = document.createElement("template");
      template.innerHTML = voteButtons(item);
      row.querySelector(".deal-votes")?.replaceWith(template.content);
    }
    function showRowMessage(row, text) {
      const target = row.tagName === "TR" ? row.lastElementChild : row;
      if (target.querySelector(".rate-limit-msg")) return;
      const message = document.createElement("div");
      message.className = "rate-limit-msg";
      message.textContent = text;
      target.append(message);
      setTimeout(() => message.remove(), 2500);
    }
    async function loadVotes() {
      // Offers change within days; older votes are not needed.
      const since = new Date(Date.now() - 21 * 86_400_000).toISOString();
      const [rows, mine] = await Promise.all([fetchVoteTallies(config.voteKey, since), fetchMyVotes(config.voteKey)]);
      myVotes = mine;
      for (const row of rows) tallies.set(row.code.toUpperCase(), row);
      if (rows.length === 0 && Object.keys(mine).length === 0) return;
      if (state.sort === "votes" || effectiveView() === "table") return render();
      config.mount.querySelectorAll(".deal-row").forEach((row) => { const item = itemOf(row); if (item) replaceVotes(row, item); });
    }

    // ---------- filters, alphabet, controls ----------
    const hasFilters = () => Object.keys(FILTER_DEFAULTS).some((key) => state.filters[key] !== FILTER_DEFAULTS[key]);
    function setupFilters() {
      const panel = el("filters");
      const toggle = el("filter-toggle");
      const sync = () => panel.querySelectorAll("[data-filter]").forEach((input) => {
        const value = state.filters[input.dataset.filter];
        if (input.type === "checkbox") input.checked = value;
        else input.value = value ? String(value) : "";
      });
      sync();
      panel.hidden = !hasFilters();
      toggle.setAttribute("aria-expanded", String(!panel.hidden));
      toggle.addEventListener("click", () => {
        panel.hidden = !panel.hidden;
        toggle.setAttribute("aria-expanded", String(!panel.hidden));
      });
      let timer;
      panel.addEventListener("input", (event) => {
        const input = event.target.closest("[data-filter]");
        if (!input) return;
        state.filters[input.dataset.filter] = input.type === "checkbox" ? input.checked : Math.max(0, Number(input.value.replace(",", ".")) || 0);
        clearTimeout(timer);
        timer = setTimeout(() => { savePreferences(); render(); }, 150);
      });
      el("filters-clear").addEventListener("click", () => {
        state.filters = { ...FILTER_DEFAULTS };
        sync();
        savePreferences();
        render();
      });
    }
    // Alphabet scroll, as on the front page, while the list is sorted by name.
    const letterOf = (item) => { const first = item.title.charAt(0).toUpperCase(); return /[A-ZÆØÅ]/.test(first) ? first : "#"; };
    function renderAzBar() {
      const bar = el("az");
      const show = state.sort === "name" && state.list.length > 20;
      bar.hidden = !show;
      if (show) bar.innerHTML = [...new Set(state.list.map(letterOf))].map((letter) => `<span data-letter="${esc(letter)}">${esc(letter)}</span>`).join("");
    }
    function setupAzBar() {
      el("az").addEventListener("click", (event) => {
        const letter = event.target.closest("[data-letter]")?.dataset.letter;
        if (!letter) return;
        const index = state.list.findIndex((item) => letterOf(item) === letter);
        if (index < 0) return;
        while (state.shown <= index) renderMore();
        const row = el("results").querySelectorAll(".deal-row")[index];
        if (!row) return;
        const top = row.getBoundingClientRect().top + window.scrollY - el("sticky").offsetHeight - (config.mount.querySelector(".deal-table thead")?.offsetHeight ?? 0) - 8;
        window.scrollTo({ top });
        rearmBatches();
      });
    }
    function syncUrl() {
      const url = new URL(location.href);
      if (state.query) url.searchParams.set("q", state.query);
      else url.searchParams.delete("q");
      for (const name of config.dropUrlParams ?? []) url.searchParams.delete(name);
      if (url.href !== location.href) history.replaceState(null, "", url);
    }
    function setupControls() {
      el("groups").addEventListener("click", (event) => {
        const button = event.target.closest(".group-toggle");
        if (!button) return;
        const name = button.dataset.group;
        if (state.off.has(name)) state.off.delete(name);
        else state.off.add(name);
        savePreferences();
        renderGroups();
        render();
      });
      el("all").addEventListener("click", () => { state.off.clear(); savePreferences(); renderGroups(); render(); });
      el("none").addEventListener("click", () => { state.off = new Set(state.counts.keys()); savePreferences(); renderGroups(); render(); });
      setupFilters();
      const search = el("search");
      const wrap = search.closest(".input-wrap");
      search.addEventListener("input", () => {
        wrap.classList.toggle("has-value", search.value.length > 0);
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => { state.query = search.value.trim(); render(); syncUrl(); }, 120);
      });
      wrap.querySelector(".input-clear").addEventListener("click", () => {
        search.value = "";
        wrap.classList.remove("has-value");
        state.query = "";
        render();
        syncUrl();
        search.focus();
      });
      sortMenu = createChoiceMenu(el("sort"), SORTS, () => state.sort, (value) => {
        state.sort = value;
        state.sortDir = 1;
        savePreferences();
        render();
      });
      const updateViewButtons = () => config.mount.querySelectorAll("[data-view]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.view === effectiveView())));
      config.mount.querySelector(".view-toggle").addEventListener("click", (event) => {
        const button = event.target.closest("[data-view]");
        if (!button || button.dataset.view === state.view) return;
        state.view = button.dataset.view;
        savePreferences();
        updateViewButtons();
        render();
      });
      wideScreen.addEventListener("change", () => { updateViewButtons(); render(); });
      updateViewButtons();
      // Sticky table headings sit just under the sticky filter bar.
      new ResizeObserver(() => document.documentElement.style.setProperty("--sticky-height", `${el("sticky").offsetHeight}px`)).observe(el("sticky"));
      rearmBatches = createLazyBatches(el("more"), () => state.shown < state.list.length, renderMore);

      const results = el("results");
      const hoverCapable = window.matchMedia("(hover: hover) and (pointer: fine)");
      results.addEventListener("pointerover", (event) => {
        if (!hoverCapable.matches || effectiveView() === "grid") return;
        const thumb = event.target.closest(".deal-thumb[data-preview]");
        if (thumb && thumb !== previewFor) showPreview(thumb);
      });
      results.addEventListener("pointerout", (event) => {
        const thumb = event.target.closest(".deal-thumb[data-preview]");
        if (thumb && hoverCapable.matches && !thumb.contains(event.relatedTarget)) hidePreview();
      });
      results.addEventListener("click", (event) => {
        const vote = event.target.closest(".vote-btn");
        if (vote) return void castVote(vote);
        const copy = event.target.closest(".copy-btn");
        if (copy) return void copyItem(copy);
        const thumb = event.target.closest(".deal-thumb[data-preview]");
        if (thumb && effectiveView() !== "grid") return void (previewFor === thumb ? hidePreview() : showPreview(thumb));
        const header = event.target.closest("th[data-sort]");
        if (header) {
          // Same column again flips the direction.
          if (state.sort === header.dataset.sort) state.sortDir = -state.sortDir;
          else { state.sort = header.dataset.sort; state.sortDir = 1; }
          savePreferences();
          sortMenu.refresh();
          render();
        }
      });
      document.addEventListener("pointerdown", (event) => { if (previewFor && !event.target.closest(".deal-thumb")) hidePreview(); });
      window.addEventListener("scroll", () => { if (previewFor && !hoverCapable.matches) hidePreview(); }, { passive: true });
      document.addEventListener("keydown", (event) => { if (event.key === "Escape") hidePreview(); });
    }

    // ---------- start ----------
    loadPreferences();
    const params = new URLSearchParams(location.search);
    state.query = params.get("q") || "";
    el("search").value = state.query;
    el("search").closest(".input-wrap").classList.toggle("has-value", state.query.length > 0);
    setupControls();
    setupAzBar();
    // One draw per page, so the top card and the bottom line agree.
    const draw = Math.random();
    const footer = document.querySelector(".fixed-footer .tip-line");
    if (footer) renderSupportFooter(footer, selectSupportAdvertisement(draw), [], window.CashbackTooltips.attach, "/");
    const inviteCard = document.getElementById("support-invite");
    const invite = getInstabankInvite(draw);
    if (inviteCard && invite) renderSupportInvite(inviteCard, invite, () => el("search").focus({ preventScroll: true }));

    return (async () => {
      try {
        const response = await fetch(config.dataUrl, { cache: "no-cache" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const { items, updated, note } = config.read(await response.json());
        state.items = items.filter((item) => typeof item.id === "string" && Number.isFinite(item.amount) && item.amount > 0);
        const now = Date.now();
        for (const item of state.items) if (isRunning(item, now)) state.counts.set(item.group, (state.counts.get(item.group) || 0) + 1);
        const only = config.onlyGroupsFromUrl?.(params, [...state.counts.keys()]);
        if (only?.length) {
          state.off = new Set([...state.counts.keys()].filter((name) => !only.includes(name)));
          savePreferences();
        }
        if (updated) { const target = document.getElementById("updated"); if (target) target.textContent = `Oppdatert ${formatDate(updated)}`; }
        if (note) { const target = document.getElementById("note"); if (target) target.textContent = note; }
        renderGroups();
        render();
        syncUrl();
        void loadVotes();
      } catch {
        el("results").innerHTML = `<div class="empty">Klarte ikke å hente tilbudene akkurat nå. Prøv igjen senere.</div>`;
      }
    })();
  };
})();
