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
    fetchVoteTallies, fetchMyVotes, apiVote, formatKr, copyOffer, createSelectionMenu, getDealLowPrice, createAlphabetTracker,
    installScrollTopButton, setupExtraCashbackToggle,
  } = window.SHARED;

  const BATCH = 40;
  const THUMBS_UP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`;
  const THUMBS_DOWN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>`;
  const COPY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
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
    { value: "rank", label: "Plassering i topplisten", feature: "sources" },
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
   * @param {(panel: HTMLElement) => void} [config.extraCashback]  fills the "Ekstra cashback" panel
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
    config.mount.classList.toggle("offer-list--products", Boolean(features.category));
    const SORTS = ALL_SORTS.filter((sort) => !sort.feature || features[sort.feature]).map((sort) => sort.value === "saving" && config.savingLabel ? { ...sort, label: `Størst ${config.savingLabel.toLowerCase()}` } : sort);
    const wideScreen = window.matchMedia("(min-width: 1100px)");
    const state = { items: [], counts: new Map(), off: new Set(), offCategories: new Set(), offStores: new Set(), offSources: new Set(), category: "", query: "", sort: "relevance", sortDir: 1, view: wideScreen.matches ? "table" : "list", filters: { ...FILTER_DEFAULTS }, list: [], ranks: new Map(), shown: 0 };
    if (features.sources) window.SHARED.installProviderChipStyles();
    const tallies = new Map();
    let myVotes = {};
    let previewFor = null;
    let rearmBatches = () => {};
    let sortMenu = { refresh() {} };
    let filterMenu = { refresh() {} };
    let searchTimer;

    // ---------- markup ----------
    config.mount.innerHTML = `
      <div class="sticky-header" data-ol="sticky">
        ${!features.category ? `<div class="group-heading"><span>Butikker</span><span class="group-actions"><button class="cbn-button cbn-button--quiet list-reset" data-ol="all" type="button">Velg alle</button><button class="cbn-button cbn-button--quiet list-reset" data-ol="none" type="button">Velg ingen</button><button class="cbn-button cbn-button--quiet" data-ol="scroll-top" type="button" hidden></button><button class="cbn-button cbn-button--quiet filter-picker" data-ol="filter-toggle" type="button" aria-label="Filtrer på pris og rabatt"><span>Filter</span><span class="filter-picker-count" data-ol="filter-toggle-count" hidden></span>${FILTER_SVG}</button></span></div><div class="chip-toggles group-toggles" data-ol="groups" role="group" aria-label="Butikker"></div>` : ""}
        ${(() => {
          // Summary, reset, back-to-top and Filter on the right of the first heading row.
          const bar = `<span class="offer-filter-bar"><span data-ol="filter-summary"></span><button class="cbn-button cbn-button--quiet list-reset" data-ol="filter-reset" type="button" hidden>Nullstill valg</button>
            <button class="cbn-button cbn-button--quiet" data-ol="scroll-top" type="button" hidden></button>
            <button class="cbn-button cbn-button--quiet filter-picker" data-ol="filter-picker" type="button" aria-label="Filtrer butikker, kategorier og kilder"><span>Filter</span><span class="filter-picker-count" data-ol="filter-picker-count" hidden></span>${FILTER_SVG}</button></span>`;
          if (!features.category) return `<span hidden>${bar}</span>`;
          return features.sources
            ? `<div class="group-heading"><span>Kilder:</span>${bar}</div><div class="chip-toggles group-toggles source-toggles" data-ol="sources" role="group" aria-label="Kilder"></div>`
            : `<div class="group-heading"><span></span>${bar}</div>`;
        })()}
        ${features.category ? `<div class="category-nav" data-ol="category-nav"></div>` : ""}
        <div class="active-offer-filters" data-ol="active-filters" hidden></div>
        <div class="list-bar">
          ${config.extraCashback ? `<button class="cbn-button cbn-button--quiet bonus-toggle" data-ol="bonus-toggle" type="button" aria-expanded="false"><span class="bonus-toggle-arrow">▶</span> Ekstra cashback</button>` : ""}
          <div class="count" data-ol="count" aria-live="polite"></div>
          ${features.category ? `<button class="cbn-button cbn-button--quiet filter-button" data-ol="filter-toggle" type="button" aria-expanded="false" aria-label="Flere filtre" title="Pris og rabatt">Pris/rabatt</button>` : ""}
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
        ${config.extraCashback ? `<div class="bonus-chips-portal" data-ol="bonus-panel" style="display:none"></div>` : ""}
      </div>
      ${config.toplists ? `<div class="toplists" role="group" aria-label="Topplister"><span>Topplister</span>${config.toplists.map((entry) => `<button class="cbn-button cbn-button--filter" type="button" data-toplist="${esc(entry.sort)}">${esc(entry.label)}</button>`).join("")}<small data-ol="toplist-note"></small></div>` : ""}
      <div class="results" data-ol="results" aria-live="off"><div class="empty">Laster tilbud …</div></div>
      <div data-ol="more" aria-hidden="true"></div>
      <div class="az-bar" data-ol="az" hidden></div>
      <img class="deal-preview" data-ol="preview" alt="" hidden>`;
    const el = (name) => config.mount.querySelector(`[data-ol="${name}"]`);

    const alphabet = createAlphabetTracker(el("az"), () => el("sticky").offsetHeight + (config.mount.querySelector("thead")?.offsetHeight ?? 0) + 8);

    // ---------- preferences ----------
    function loadPreferences() {
      try {
        const saved = JSON.parse(localStorage.getItem(config.storageKey) || "{}");
        if (Array.isArray(saved.off)) state.off = new Set(saved.off.filter((name) => typeof name === "string"));
        if (SORTS.some((sort) => sort.value === saved.sort)) state.sort = saved.sort;
        if (["grid", "list", "table"].includes(saved.view)) state.view = saved.view;
        if (saved.sortDir === -1) state.sortDir = -1;
        if (Array.isArray(saved.offCategories)) state.offCategories = new Set(saved.offCategories.filter((value) => typeof value === "string"));
        else if (typeof saved.category === "string") state.category = saved.category;
        if (Array.isArray(saved.offStores)) state.offStores = new Set(saved.offStores.filter((value) => typeof value === "string"));
        if (Array.isArray(saved.offSources)) state.offSources = new Set(saved.offSources.filter((value) => typeof value === "string"));
        if (saved.filters && typeof saved.filters === "object") {
          for (const key of Object.keys(FILTER_DEFAULTS)) {
            if (typeof saved.filters[key] === typeof FILTER_DEFAULTS[key]) state.filters[key] = saved.filters[key];
          }
        }
      } catch { /* Defaults: every group, most relevant, table on wide screens. */ }
    }
    function savePreferences() {
      try { localStorage.setItem(config.storageKey, JSON.stringify({ off: [...state.off], offCategories: [...state.offCategories], offStores: [...state.offStores], offSources: [...state.offSources], sort: state.sort, sortDir: state.sortDir, view: state.view, filters: state.filters })); } catch { /* Optional. */ }
    }

    // The spreadsheet needs the width; phones get the list instead.
    const effectiveView = () => state.view === "table" && !wideScreen.matches ? "list" : state.view;
    const isRunning = (item, now) => (!item.validTo || Date.parse(item.validTo) >= now) && (!item.validFrom || Date.parse(item.validFrom) <= now);
    const saving = (item) => item.saving ?? 0;
    const savingKr = (item) => item.prePrice > item.amount ? item.prePrice - item.amount : 0;
    const netVotes = (item) => { const t = tallies.get(item.id.toUpperCase()); return t ? t.upvotes - t.downvotes : 0; };

    // ---------- group filters ----------
    function filterOptions() {
      const names = config.groupOrder?.filter((name) => state.counts.has(name)) ?? [...state.counts.keys()].sort((a, b) => a.localeCompare(b, "nb"));
      const options = [{ value: "group:*", label: `Alle ${config.groupLabel.toLowerCase()}`, section: config.groupLabel }, ...names.map((name) => ({ value: `group:${name}`, label: config.groupName?.(name) ?? name, count: state.counts.get(name), section: config.groupLabel, className: config.groupClass?.(name) }))];
      if (features.category) {
        // Categories are chosen in the navigator above the list; the menu keeps the shops.
        options.splice(0, options.length);
        for (const [kind, field, section] of [["store", "store", "Butikker"]]) {
          const counts = new Map();
          for (const item of state.items) {
            const values = kind === "store" ? [...new Set((item.sources ?? [item]).map(source => source.store.label))] : [item.category];
            for (const value of values) if (value) counts.set(value, (counts.get(value) || 0) + 1);
          }
          options.push({ value: `${kind}:*`, label: `Alle ${section.toLowerCase()}`, section });
          for (const value of [...counts.keys()].sort((a, b) => a.localeCompare(b, "nb"))) options.push({ value: `${kind}:${value}`, label: value, count: counts.get(value), section });
        }
      }
      if (features.sources) {
        const counts = new Map();
        for (const item of state.items) for (const source of item.sources ?? []) counts.set(source.source, (counts.get(source.source) || 0) + 1);
        options.push({ value: "source:*", label: "Alle kilder", section: "Kilde" });
        const order = ["prisjakt", "klarna", "godpris", "prisradar"];
        for (const [source, count] of [...counts].sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))) options.push({ value: `source:${source}`, label: window.SHARED.PROVIDER_NAMES[source] || source, section: "Kilde", count, className: `badge-${source}` });
      }
      return options;
    }
    const filterSet = (value) => value.startsWith("category:") ? state.offCategories : value.startsWith("store:") ? state.offStores : value.startsWith("source:") ? state.offSources : state.off;
    const filterValue = (value) => value.slice(value.indexOf(":") + 1);
    // The number on the Filter button: choices turned off, or price/discount limits set.
    const setFilterCount = (name, count) => { const badge = el(`${name}-count`); if (badge) { badge.hidden = count === 0; badge.textContent = String(count); } };
    // Categories are a path, not two lists: Alle › Skjønnhet og helse › Ansiktsserum. The path is
    // stored in the same sets as before (every other group/category turned off).
    const categoryPath = () => {
      const groups = [...state.counts.keys()];
      const group = state.off.size > 0 && state.off.size === groups.length - 1 ? groups.find((name) => !state.off.has(name)) : undefined;
      const categories = [...new Set(state.items.filter((item) => !group || item.group === group).map((item) => item.category).filter(Boolean))];
      const category = state.offCategories.size > 0 ? categories.filter((name) => !state.offCategories.has(name)) : [];
      return { group, category: category.length === 1 ? category[0] : undefined };
    };
    function setCategoryPath(group, category) {
      state.off = group ? new Set([...state.counts.keys()].filter((name) => name !== group)) : new Set();
      state.offCategories = category ? new Set(state.items.map((item) => item.category).filter((name) => name && name !== category)) : new Set();
      updateSelectionFilters();
    }
    function renderCategoryNav() {
      const nav = el("category-nav");
      if (!nav) return;
      const { group, category } = categoryPath();
      const crumb = (label, data, current) => current
        ? `<span class="category-crumb" aria-current="true">${esc(label)}</span>`
        : `<button class="cbn-button cbn-button--quiet category-crumb" type="button" ${data}>${esc(label)}</button>`;
      const crumbs = [crumb("Alle kategorier", 'data-cat-group=""', !group),
        ...(group ? [crumb(config.groupName?.(group) ?? group, `data-cat-group="${esc(group)}"`, !category)] : []),
        ...(category ? [crumb(category, "", true)] : [])].join('<span class="category-sep" aria-hidden="true">›</span>');
      // The level below the path (or the siblings of a chosen subcategory), with counts.
      const counts = new Map();
      for (const item of state.items) {
        const key = group ? (item.group === group ? item.category : undefined) : item.group;
        if (key) counts.set(key, (counts.get(key) || 0) + 1);
      }
      const names = group ? [...counts.keys()].sort((a, b) => a.localeCompare(b, "nb")) : (config.groupOrder?.filter((name) => counts.has(name)) ?? [...counts.keys()].sort((a, b) => a.localeCompare(b, "nb")));
      const chips = names.map((name) => {
        const pressed = group ? name === category : false;
        const data = group ? `data-cat-group="${esc(group)}" data-cat="${esc(name)}"` : `data-cat-group="${esc(name)}"`;
        return `<button class="cbn-button cbn-button--filter group-toggle category-option" type="button" aria-pressed="${pressed}" ${data}><span>${esc(config.groupName?.(name) ?? name)}</span><span class="cbn-count">${counts.get(name).toLocaleString("nb-NO")}</span>${group ? "" : '<span class="category-arrow" aria-hidden="true">›</span>'}</button>`;
      }).join("");
      nav.innerHTML = `<nav class="category-crumbs" aria-label="Kategori"><span class="category-nav-label">Kategori:</span>${crumbs}</nav><div class="chip-toggles category-options" role="group" aria-label="${group ? "Underkategorier" : "Kategorier"}">${chips}</div>`;
    }
    const hasSelectionFilters = () => state.off.size > 0 || state.offCategories.size > 0 || state.offStores.size > 0 || state.offSources.size > 0;
    function renderGroups() {
      const options = filterOptions().filter((option) => !option.value.endsWith(":*"));
      const selected = options.filter((option) => !filterSet(option.value).has(filterValue(option.value)));
      // The category path shows itself; the summary counts the shop choices.
      const shopFilters = selected.length < options.length;
      el("filter-summary").textContent = shopFilters ? `${selected.length} av ${options.length} butikker` : "";
      el("filter-picker").classList.toggle("is-active", shopFilters);
      el("filter-reset").hidden = !hasSelectionFilters();

      setFilterCount("filter-picker", options.length - selected.length);
      const active = el("active-filters");
      if (!features.category) {
        active.hidden = true;
        const nav = el("groups"); nav.replaceChildren();
        for (const option of options) {
          const name = filterValue(option.value), on = !state.off.has(name);
          const chip = document.createElement("button");
          chip.type = "button"; chip.dataset.group = name;
          chip.className = `cbn-button group-toggle ${on && option.className ? `cbn-button--brand ${option.className}` : "cbn-button--filter"}`;
          chip.setAttribute("aria-pressed", String(on));
          chip.title = on ? `Skjul ${option.label}` : `Vis ${option.label}`;
          const check = document.createElement("span"); check.className = "group-check"; check.textContent = on ? "✓" : "+"; check.setAttribute("aria-hidden", "true");
          const label = document.createElement("span"); label.textContent = option.label;
          chip.append(check, label, createCountBadge(option.count || 0, `${option.count || 0} tilbud`));
          nav.append(chip); fitCountToChip(chip);
        }
        el("all").disabled = state.off.size === 0;
        el("none").disabled = options.every((option) => state.off.has(filterValue(option.value)));
        return;
      }
      if (features.sources) {
        // Price sources as toggles in each source's colour, like the shops on Dagligvarer.
        const nav = el("sources"); nav.replaceChildren();
        for (const option of options.filter((option) => option.value.startsWith("source:"))) {
          const name = filterValue(option.value), on = !state.offSources.has(name);
          const chip = document.createElement("button");
          chip.type = "button"; chip.dataset.source = name;
          chip.className = `cbn-button group-toggle ${on ? `cbn-button--brand ${option.className}` : "cbn-button--filter"}`;
          chip.setAttribute("aria-pressed", String(on));
          chip.title = on ? `Skjul tilbud fra ${option.label}` : `Vis tilbud fra ${option.label}`;
          const check = document.createElement("span"); check.className = "group-check"; check.textContent = on ? "✓" : "+"; check.setAttribute("aria-hidden", "true");
          const label = document.createElement("span"); label.textContent = option.label;
          chip.append(check, label, createCountBadge(option.count || 0, `${option.count || 0} tilbud`));
          nav.append(chip); fitCountToChip(chip);
        }
      }
      renderCategoryNav();
      const filtered = selected.filter((option) => !option.value.startsWith("source:") && !option.value.startsWith("group:") && !option.value.startsWith("category:") && filterSet(option.value).size > 0);
      active.hidden = filtered.length === 0;
      active.replaceChildren();
      const sections = new Map();
      for (const option of filtered) {
        if (!sections.has(option.section)) {
          const section = document.createElement("div");
          section.className = "active-offer-filter-group";
          section.setAttribute("role", "group");
          section.setAttribute("aria-label", option.section);
          const heading = document.createElement("span");
          heading.className = "active-offer-filter-label";
          heading.textContent = `${option.section}:`;
          const chips = document.createElement("div");
          chips.className = "active-offer-filter-chips";
          section.append(heading, chips);
          active.append(section);
          sections.set(option.section, chips);
        }
        const chip = document.createElement("button");
        chip.className = `cbn-chip active-provider ${option.className || "cbn-chip--highlight"}`;
        chip.type = "button";
        chip.dataset.removeFilter = option.value;
        chip.setAttribute("aria-label", `Fjern ${option.label}-filter`);
        const label = document.createElement("span"); label.textContent = option.label;
        const remove = document.createElement("span"); remove.textContent = "×"; remove.setAttribute("aria-hidden", "true");
        chip.append(label, createCountBadge(option.count || 0, `${option.count || 0} tilbud`), remove);
        sections.get(option.section).append(chip);
        fitCountToChip(chip);
      }
      filterMenu.refresh();
    }
    function updateSelectionFilters() { savePreferences(); renderGroups(); render(); }

    // ---------- list ----------
    function relevance(item, words) {
      const title = item.foldedTitle ??= fold(item.title);
      return words.reduce((score, word) => score + (title.startsWith(word) ? 3 : title.includes(word) ? 2 : 1), 0);
    }
    function render() {
      const now = Date.now();
      const words = fold(state.query).split(/\s+/).filter(Boolean);
      const { minSaving, maxPrice, maxUnit, onlyPrePrice, endingSoon } = state.filters;
      const choices = features.sources ? state.items.flatMap((item) => {
        const available = (item.sources ?? []).filter((source) => !state.offSources.has(source.source) && isRunning(source, now) && !state.offStores.has(source.store.label));
        const best = [...available].sort((a, b) => a.amount - b.amount)[0];
        return best ? [{ ...item, ...best, id: item.id, rank: item.rank, group: item.group, category: item.category, sources: available,
          lowestPriceEver: item.lowestPriceEver, historyScope: item.historyScope, historyRange: item.historyRange, historyStartedAt: item.historyStartedAt, historyUpdatedAt: item.historyUpdatedAt }] : [];
      }) : state.items;
      const visible = choices.filter((item) => isRunning(item, now) && !state.off.has(item.group) &&
        !state.offCategories.has(item.category) && !state.offStores.has(item.store.label) &&
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
        rank: natural,
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
      config.mount.querySelectorAll("[data-toplist]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.toplist === state.sort && state.sortDir === 1)));
      if (config.toplists) el("toplist-note").textContent = state.sort === "votes" ? "Tommel opp minus tommel ned. # viser fortsatt plasseringen i topplisten." : state.sort === "saving" ? "Prisfall mot kildens sammenligningspris. Hold over prosenten for prisgrunnlaget." : state.sort === "relevance" ? "Kildenes rekkefølge vektes sammen, med mest vekt på Prisjakt og Klarna. Ingen klikkdata. # beholdes ved søk og filtrering." : "";
      state.shown = 0;
      hidePreview();
      const results = el("results");
      const view = effectiveView();
      results.classList.toggle("results--grid", view === "grid");
      results.classList.toggle("results--table", view === "table");
      el("filter-toggle").classList.toggle("is-active", hasFilters());
      setFilterCount("filter-toggle", Object.keys(FILTER_DEFAULTS).filter((key) => state.filters[key] !== FILTER_DEFAULTS[key]).length);
      alphabet.reset();
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
      if (!el("az").hidden) alphabet.observe(el("results").querySelectorAll(".deal-row"));
    }

    // ---------- rows ----------
    const columns = () => [
      ...(config.toplists ? [{ label: "#", sort: "rank", num: true }] : []),
      { label: "", sort: "" },
      { label: "Vare", sort: "name" },
      { label: "Butikk", sort: "store" },
      ...(features.sources ? [{ label: "Kilde", sort: "" }] : []),
      ...(features.category ? [{ label: "Kategori", sort: "group" }] : []),
      { label: "Pris", sort: "price", num: true },
      { label: config.savingLabel ?? "Rabatt", sort: "saving", num: true },
      ...(!features.history ? [{ label: "Spart", sort: "savingKr", num: true }] : []),
      ...(features.history ? [{ label: "Mot lavpris", sort: "", num: true }] : []),
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
      ? `<a class="deal-thumb" href="${esc(item.link.url)}" target="_blank" rel="noopener" data-preview="${esc(item.imageUrl)}" aria-label="Åpne ${esc(item.title)}"><img src="${esc(item.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('deal-thumb--empty');this.remove()"></a>`
      : `<span class="deal-thumb deal-thumb--empty" aria-hidden="true"></span>`;
    const rankHtml = (item) => config.toplists && state.ranks.has(item.id) ? `<span class="cbn-chip cbn-chip--muted deal-rank" title="Plassering i den samlede topplisten før søk og filtrering">#${state.ranks.get(item.id)}</span>` : "";
    const sourcesHtml = (item) => `<span class="deal-sources">${(item.sources ?? []).map((source) => `<a class="cbn-chip badge badge-${esc(source.source)} deal-source" href="${esc(source.link.url)}" target="_blank" rel="noopener" title="${esc(`${window.SHARED.PROVIDER_NAMES[source.source] || source.source}: ${kr(source.amount)} · ${source.store.label}${source.updatedAt ? ` · Hentet ${formatDate(source.updatedAt)}` : ""}`)}">${esc(window.SHARED.PROVIDER_NAMES[source.source] || source.source)}</a>`).join(" ")}</span>`;
    const titleHtml = (item) => `<span class="deal-title"><a href="${esc(item.link.url)}"${item.imageUrl ? ` data-preview="${esc(item.imageUrl)}"` : ""} target="_blank" rel="noopener" title="${esc(item.link.label)}">${esc(item.title)}</a></span>`;
    const storeHtml = (item) => {
      const initial = features.category ? `<span class="deal-store-initial" aria-hidden="true"${item.store.iconUrl ? ' style="display:none"' : ""}>${esc(item.store.label.charAt(0))}</span>` : "";
      const chip = `<span class="cbn-chip badge ${esc(item.store.className ?? "cbn-chip--muted")}">${item.store.iconUrl ? `<img class="deal-store-icon" src="${esc(item.store.iconUrl)}" alt="" loading="lazy" onerror="this.nextElementSibling.style.display='inline-flex';this.remove()">` : ""}${initial}<span class="deal-store-name">${esc(item.store.label)}</span></span>`;
      if (!features.category) return `<button class="cbn-button cbn-button--quiet deal-store-filter" type="button" data-store-group="${esc(item.group)}" title="Vis bare ${esc(item.store.label)}" aria-label="Vis bare ${esc(item.store.label)}">${chip}</button>`;
      const store = item.store.url ? `<a class="deal-store-link" href="${esc(item.store.url)}" target="_blank" rel="noopener" title="Gå til ${esc(item.store.label)}">${chip}</a>` : chip;
      return store;
    };
    const categoryHtml = (item) => `<span class="deal-categories">${item.group ? `<button class="category-link deal-main-category" type="button" data-only-group="${esc(item.group)}" title="Vis hele ${esc(item.group)}">${esc(item.group)}</button>` : ""}${item.group && item.category && item.group !== item.category ? `<span class="category-sep" aria-hidden="true">›</span><button class="category-link" type="button" data-category="${esc(item.category)}" data-category-group="${esc(item.group)}" title="Vis bare ${esc(item.category)}">${esc(item.category)}</button>` : ""}</span>`;
    const historyHtml = (item) => {
      const low = getDealLowPrice(item.amount, item.lowestPriceEver);
      if (!low) return `<span class="deal-valid" title="Full historikk for riktig produkt/variant er ikke tilgjengelig">—</span>`;
      const aboveLow = item.amount > low.lowestPrice;
      const difference = low.dropToLowPercent ? `${new Intl.NumberFormat("nb-NO").format(low.dropToLowPercent)} %` : "0,1 %";
      const period = item.historyRange === "3m" ? "de siste tre månedene" : item.historyRange === "2y" ? "de siste to årene" : "gjennom hele historikken";
      const tip = `Laveste registrerte varepris ${period}, inkludert dagens bekreftede pris.${item.historyStartedAt ? ` Registrert siden ${formatDate(item.historyStartedAt)}.` : ""} ${item.historyScope === "variant" ? "Valgt variant." : "Alle varianter av produktet."} Frakt er ikke med.${item.historyUpdatedAt ? ` Siste registrerte prisendring ${formatDate(item.historyUpdatedAt)}.` : ""}`;
      return `<span class="deal-history" title="${esc(tip)}"><span>${esc(kr(low.lowestPrice))}</span> <span class="cbn-chip cbn-chip--highlight${aboveLow ? " cbn-chip--warning" : ""} card-chip" title="${aboveLow ? `Dagens pris må falle ${low.dropToLowPercent ? "" : "mindre enn "}${difference} for å nå laveste registrerte pris` : "Dagens pris er på laveste registrerte nivå"}">${aboveLow ? low.dropToLowPercent ? `−${difference} til lavpris` : "&lt;0,1 % til lavpris" : "Laveste nå"}</span>${(() => { const notes = [item.historyRange === "3m" ? "siste 3 mnd" : item.historyRange === "2y" ? "siste 2 år" : "", item.historyScope === "product" ? "alle varianter" : ""].filter(Boolean); return notes.length ? `<small>${notes.join(" · ")}</small>` : ""; })()}</span>`;
    };
    const savingChipHtml = (item) => saving(item) > 0 ? `<span class="cbn-chip cbn-chip--highlight card-chip"${item.savingTitle ? ` title="${esc(item.savingTitle)}"` : ""}>−${saving(item)} %</span>` : "";
    const bonusHtml = (item) => item.bonus ? `<a class="cbn-chip cbn-chip--highlight card-chip" href="${esc(item.bonus.url)}" target="_blank" rel="noopener" title="${esc(item.bonus.title ?? item.bonus.label)}">${esc(item.bonus.label)} ${esc(item.bonus.rate)}</a>` : "";
    // Brand, shop count, shipping, pack size and flyer details as one short muted line with
    // separators; the cards already carry enough chips.
    const factsHtml = (item) => {
      const parts = (item.details ?? (item.description ? item.description.split(/\s*·\s*|,\s+/) : [])).filter(Boolean);
      return parts.length ? `<span class="deal-facts">${parts.map((part) => `<span class="deal-fact">${esc(part)}</span>`).join('<span class="deal-fact-sep" aria-hidden="true">·</span>')}</span>` : "";
    };
    function daysLeftHtml(item) {
      if (!item.validTo) return "";
      const days = daysLeft(item);
      const label = days <= 0 ? "Siste dag" : days === 1 ? "1 dag igjen" : `${days} dager igjen`;
      const tone = days <= 0 ? "last" : days <= 2 ? "soon" : "ok";
      return `<span class="days-left days-left--${tone}" title="Gyldig t.o.m. ${esc(formatDate(item.validTo))}">${label}</span>`;
    }
    const copyButtonHtml = () => `<button class="cbn-button cbn-button--quiet copy-btn" type="button" aria-label="Kopier tilbudet som bilde">${COPY_SVG}<span class="vote-tooltip">Kopier som bilde</span></button>`;
    const actionsHtml = (item) => `<span class="deal-actions">${voteButtons(item)}${copyButtonHtml()}</span>`;
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
      return `<tr class="cbn-row cbn-row--offer deal-row" data-id="${esc(item.id)}" data-letter="${esc(letterOf(item))}">
        ${config.toplists ? `<td class="num deal-rank-cell">${rankHtml(item)}</td>` : ""}
        <td>${thumbHtml(item)}</td>
        <td>${titleHtml(item)}${factsHtml(item)}</td>
        <td>${storeHtml(item)}</td>
        ${features.sources ? `<td>${sourcesHtml(item)}</td>` : ""}
        ${features.category ? `<td>${categoryHtml(item)}</td>` : ""}
        <td class="num"><span class="deal-price-stack"><strong class="deal-price">${esc(kr(item.amount))}</strong> ${item.prePrice > item.amount ? `<s class="deal-before" aria-label="Førpris">${esc(kr(item.prePrice))}</s>` : ""}</span></td>
        <td class="num">${savingChipHtml(item)}</td>
        ${!features.history ? `<td class="num">${savingKr(item) > 0 ? esc(kr(savingKr(item))) : ""}</td>` : ""}
        ${features.history ? `<td class="num">${historyHtml(item)}</td>` : ""}
        ${features.unit ? `<td class="num">${item.unit ? `${esc(formatKr(item.unit.amount))} kr/${item.unit.unit}` : ""}</td>` : ""}
        ${features.validity ? `<td>${validityHtml(item)}</td>` : ""}
        ${features.bonus ? `<td>${bonusHtml(item)}</td>` : ""}
        <td class="num deal-vote-cell">${voteButtons(item)}</td>
        <td class="deal-copy-cell">${copyButtonHtml()}</td>
      </tr>`;
    }
    function cardHtml(item) {
      const before = item.prePrice > item.amount ? `<s class="deal-before" aria-label="Førpris">${esc(kr(item.prePrice))}</s>` : "";
      const validity = item.validTo ? validityHtml(item) : "";
      return `<article class="cbn-card cbn-row cbn-row--offer deal-row deal-card" data-id="${esc(item.id)}" data-letter="${esc(letterOf(item))}">
        ${thumbHtml(item)}
        <div class="deal-head">
          <div class="deal-heading">${rankHtml(item)}${titleHtml(item)}${factsHtml(item)}</div>
          <div class="deal-pricing"><strong class="deal-price">${esc(kr(item.amount))}</strong><span class="deal-pricing-sub">${before}${savingChipHtml(item)}</span></div>
        </div>
        <div class="deal-foot">
          <div class="deal-meta">${storeHtml(item)}${features.sources ? sourcesHtml(item) : ""}${bonusHtml(item)}${features.category ? categoryHtml(item) : ""}${features.history && getDealLowPrice(item.amount, item.lowestPriceEver) ? `<span class="deal-history-summary">Lavest ${historyHtml(item)}</span>` : ""}${validity}</div>
          ${actionsHtml(item)}
        </div>
      </article>`;
    }

    // ---------- preview, copy, votes ----------
    function validityHtml(item) {
      // Days left matter most; the date follows.
      return item.validTo ? `<span class="deal-validity">${daysLeftHtml(item)} <span class="deal-valid">t.o.m. ${esc(formatDate(item.validTo))}</span></span>` : `<span class="deal-valid" title="Butikken oppgir ingen sluttdato">—</span>`;
    }
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
        // Prefer a side, then above/below. Never paint over the triggering link/chip.
        let left, top;
        if (rect.right + width + 12 <= window.innerWidth - 12) { left = rect.right + 12; top = rect.top; }
        else if (rect.left - width - 12 >= 12) { left = rect.left - width - 12; top = rect.top; }
        else { left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)); top = rect.top - height - 12 >= 12 ? rect.top - height - 12 : rect.bottom + 12; }
        top = Math.max(12, Math.min(top, window.innerHeight - height - 12));
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
    const itemOf = (element) => state.list.find((item) => item.id === element.closest(".deal-row")?.dataset.id);

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
        tooltip.textContent = await copyOffer({ title: item.title, description: item.description, price, where, url: item.link.url, imageUrl: item.copyImageUrl || item.imageUrl });
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
        alphabet.select(letter);
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
      if (!features.category) {
        el("groups").addEventListener("click", (event) => { const name = event.target.closest("[data-group]")?.dataset.group; if (name) { if (state.off.has(name)) state.off.delete(name); else state.off.add(name); updateSelectionFilters(); } });
        el("all").addEventListener("click", () => { state.off.clear(); updateSelectionFilters(); });
        el("none").addEventListener("click", () => { state.off = new Set(state.counts.keys()); updateSelectionFilters(); });
      }
      if (features.category)
      filterMenu = createSelectionMenu(el("filter-picker"), {
        id: `${config.voteKey}-filters`, multiple: true, placeholder: "Søk i filtervalgene …", getOptions: filterOptions,
        isSelected: (value) => filterValue(value) === "*" ? filterSet(value).size === 0 : value.startsWith("group:") ? !state.off.has(filterValue(value)) : filterSet(value).size > 0 && !filterSet(value).has(filterValue(value)),
        onSelect: (value) => {
          const set = filterSet(value), name = filterValue(value);
          if (name === "*") set.clear();
          else if (value.startsWith("group:")) { if (set.has(name)) set.delete(name); else set.add(name); }
          else if (set.size === 0) {
            const prefix = value.slice(0, value.indexOf(":") + 1);
            for (const option of filterOptions()) if (option.value.startsWith(prefix) && !option.value.endsWith(":*") && option.value !== value) set.add(filterValue(option.value));
          } else if (set.has(name)) { set.delete(name); if (value.startsWith("category:")) { const item = state.items.find((item) => item.category === name); if (item) state.off.delete(item.group); } }
          else set.add(name);
          updateSelectionFilters();
        },
        onBulk: (selected, section) => { for (const option of filterOptions().filter((option) => option.section === section && !option.value.endsWith(":*"))) { const set = filterSet(option.value), name = filterValue(option.value); if (selected) set.delete(name); else set.add(name); } updateSelectionFilters(); },
      });
      el("category-nav")?.addEventListener("click", (event) => {
        const target = event.target.closest("[data-cat-group]");
        if (!target) return;
        const { group, category } = categoryPath();
        const nextGroup = target.dataset.catGroup || undefined;
        // A second click on the chosen subcategory goes back up to its main category.
        const nextCategory = target.dataset.cat && !(nextGroup === group && target.dataset.cat === category) ? target.dataset.cat : undefined;
        setCategoryPath(nextGroup, nextCategory);
      });
      el("sources")?.addEventListener("click", (event) => {
        const name = event.target.closest("[data-source]")?.dataset.source;
        if (!name) return;
        if (state.offSources.has(name)) state.offSources.delete(name);
        else state.offSources.add(name);
        updateSelectionFilters();
      });
      el("filter-reset").addEventListener("click", () => { state.off.clear(); state.offCategories.clear(); state.offStores.clear(); state.offSources.clear(); updateSelectionFilters(); });
      el("active-filters").addEventListener("click", (event) => {
        const value = event.target.closest("[data-remove-filter]")?.dataset.removeFilter;
        if (!value) return;
        const set = filterSet(value);
        set.add(filterValue(value));
        // Removing the last narrow filter restores the implicit "all" selection.
        if (!value.startsWith("group:")) {
          const prefix = value.slice(0, value.indexOf(":") + 1);
          if (filterOptions().filter((option) => option.value.startsWith(prefix) && !option.value.endsWith(":*")).every((option) => set.has(filterValue(option.value)))) set.clear();
        }
        updateSelectionFilters();
      });
      config.mount.querySelectorAll("[data-toplist]").forEach((button) => button.addEventListener("click", () => {
        state.sort = button.dataset.toplist; state.sortDir = 1; savePreferences(); sortMenu.refresh(); render();
      }));
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
        if (!hoverCapable.matches) return;
        const thumb = event.target.closest("[data-preview]");
        if (thumb && thumb !== previewFor) showPreview(thumb);
      });
      results.addEventListener("pointerout", (event) => {
        const thumb = event.target.closest("[data-preview]");
        if (thumb && hoverCapable.matches && !thumb.contains(event.relatedTarget)) hidePreview();
      });
      results.addEventListener("click", (event) => {
        const store = event.target.closest("[data-store-group]");
        if (store) { state.off = new Set([...state.counts.keys()].filter((name) => name !== store.dataset.storeGroup)); updateSelectionFilters(); return; }
        const group = event.target.closest("[data-only-group]");
        if (group) return void setCategoryPath(group.dataset.onlyGroup);
        const category = event.target.closest("[data-category]");
        if (category) return void setCategoryPath(category.dataset.categoryGroup || state.items.find((item) => item.category === category.dataset.category)?.group, category.dataset.category);
        const vote = event.target.closest(".vote-btn");
        if (vote) return void castVote(vote);
        const copy = event.target.closest(".copy-btn");
        if (copy) return void copyItem(copy);
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
      document.addEventListener("pointerdown", (event) => { if (previewFor && !event.target.closest("[data-preview]")) hidePreview(); });
      window.addEventListener("scroll", hidePreview, { passive: true });
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
    installScrollTopButton(el("scroll-top"));
    if (config.extraCashback) {
      config.extraCashback(el("bonus-panel"));
      setupExtraCashbackToggle(el("bonus-toggle"), el("bonus-panel"), `${config.storageKey}-bonus-open`);
    }
    // One draw per page, so the top card and the bottom line agree.
    const draw = Math.random();
    const footer = document.querySelector(".fixed-footer .tip-line");
    if (footer) renderSupportFooter(footer, selectSupportAdvertisement(draw), [], window.CashbackTooltips.attach, "/");
    const inviteCard = document.getElementById("support-invite");
    const invite = getInstabankInvite(draw);
    if (inviteCard && invite) renderSupportInvite(inviteCard, invite, () => el("search").focus({ preventScroll: true }));

    return (async () => {
      try {
        let response = await fetch(config.dataUrl, { cache: "no-cache" });
        if (!response.ok && config.fallbackDataUrl) response = await fetch(config.fallbackDataUrl, { cache: "no-cache" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const { items, updated, note } = config.read(await response.json());
        state.items = items.filter((item) => typeof item.id === "string" && Number.isFinite(item.amount) && item.amount > 0);
        state.ranks = new Map([...state.items].sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity)).map((item, index) => [item.id, index + 1]));
        if (state.category) { state.offCategories = new Set(state.items.map((item) => item.category).filter((name) => name !== state.category)); state.category = ""; }
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
