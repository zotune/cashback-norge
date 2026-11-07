import { createCountBadge } from "../shared/ui";

export type SelectionOption = { value: string; label: string; section?: string; className?: string; count?: number };
type SelectionMenuOptions = {
  id?: string;
  className?: string;
  multiple?: boolean;
  placeholder?: string;
  getOptions: () => SelectionOption[];
  isSelected: (value: string) => boolean;
  onSelect: (value: string) => void;
  onBulk?: (selected: boolean, section: string) => void;
  updateLabel?: boolean;
};
let sequence = 0;
const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("nb");

/** Shared searchable combobox/listbox for provider filters, offer filters and sorting. */
export function createSelectionMenu(button: HTMLButtonElement, config: SelectionMenuOptions) {
  const id = config.id ?? `selection-menu-${++sequence}`;
  const menu = document.createElement("div");
  menu.id = id;
  menu.className = `provider-menu cbn-card selection-menu ${config.className ?? ""}`;
  menu.setAttribute("role", "dialog");
  menu.setAttribute("aria-label", button.getAttribute("aria-label") ?? "Velg");
  menu.hidden = true;
  const sections = document.createElement("div");
  sections.className = "selection-sections";
  const search = document.createElement("input");
  search.id = `${id}-search`;
  search.className = "cbn-field selection-search";
  search.type = "search";
  search.placeholder = config.placeholder ?? "Søk i valgene …";
  search.setAttribute("role", "combobox");
  search.setAttribute("aria-label", search.placeholder);
  search.setAttribute("aria-autocomplete", "list");
  search.setAttribute("aria-controls", `${id}-options`);
  search.autocomplete = "off";
  const actions = document.createElement("div");
  actions.className = "selection-actions";
  const list = document.createElement("div");
  list.id = `${id}-options`;
  list.className = "selection-options";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", menu.getAttribute("aria-label")!);
  if (config.multiple) list.setAttribute("aria-multiselectable", "true");
  const done = document.createElement("button");
  done.type = "button";
  done.className = "cbn-button cbn-button--quiet selection-done";
  done.textContent = "Ferdig";
  done.hidden = !config.multiple;
  menu.append(sections, search, actions, list, done);
  document.body.append(menu);
  let section = "";
  let visible: SelectionOption[] = [];
  let active = 0;
  const position = () => {
    if (menu.hidden) return;
    const rect = button.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 24);
    menu.style.width = `${width}px`;
    menu.style.maxHeight = `${Math.min(480, window.innerHeight - 24)}px`;
    const height = menu.getBoundingClientRect().height;
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const down = below >= height || below >= above;
    menu.style.maxHeight = `${Math.min(480, Math.max(120, down ? below : above))}px`;
    menu.style.left = `${Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))}px`;
    menu.style.top = `${Math.max(12, down ? rect.bottom + 6 : rect.top - menu.getBoundingClientRect().height - 6)}px`;
  };
  const activate = (index: number) => {
    active = visible.length ? Math.max(0, Math.min(visible.length - 1, index)) : -1;
    list.querySelectorAll<HTMLElement>("[role=option]").forEach((row, i) => row.classList.toggle("is-active", i === active));
    if (active >= 0) search.setAttribute("aria-activedescendant", `${id}-option-${active}`);
    else search.removeAttribute("aria-activedescendant");
  };
  const render = () => {
    const options = config.getOptions();
    const names = [...new Set(options.map((option) => option.section).filter((name): name is string => Boolean(name)))];
    if (!names.includes(section)) section = names[0] ?? "";
    sections.replaceChildren();
    sections.hidden = names.length < 2;
    for (const name of names) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "cbn-button cbn-button--filter";
      tab.textContent = name;
      tab.setAttribute("aria-pressed", String(section === name));
      tab.addEventListener("click", () => { section = name; search.value = ""; active = 0; render(); search.focus(); });
      sections.append(tab);
    }
    actions.replaceChildren();
    if (config.onBulk) for (const [selected, label] of [[true, "Velg alle"], [false, "Velg ingen"]] as const) {
      const action = document.createElement("button");
      action.className = "cbn-button cbn-button--quiet";
      action.type = "button";
      action.textContent = label;
      action.addEventListener("click", () => { config.onBulk!(selected, section); render(); });
      actions.append(action);
    }
    const query = fold(search.value.trim());
    actions.hidden = !config.onBulk || Boolean(query);
    visible = options.filter((option) => (Boolean(query) || !section || option.section === section) && fold(option.label).includes(query));
    list.replaceChildren();
    for (const [index, option] of visible.entries()) {
      const row = document.createElement("div");
      row.id = `${id}-option-${index}`;
      row.className = "provider-option";
      row.dataset.value = option.value;
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(config.isSelected(option.value)));
      const label = document.createElement("span");
      label.className = option.className ? `cbn-chip badge ${option.className}` : "provider-option-all";
      label.textContent = option.label;
      if (query && option.section) label.title = option.section;
      if (option.count !== undefined) label.append(createCountBadge(option.count, `${option.count} treff`));
      const check = document.createElement("span");
      check.className = "provider-option-check";
      check.setAttribute("aria-hidden", "true");
      check.textContent = config.isSelected(option.value) ? "✓" : "";
      row.append(label, check);
      row.addEventListener("pointerover", () => activate(index));
      list.append(row);
    }
    if (!visible.length) { const empty = document.createElement("p"); empty.className = "selection-empty"; empty.textContent = "Ingen treff"; list.append(empty); }
    activate(active);
    position();
  };
  const refresh = () => {
    if (config.updateLabel) {
      const label = button.querySelector("[data-choice-label]");
      if (label) label.textContent = config.getOptions().find((option) => config.isSelected(option.value))?.label ?? "";
    }
    if (!menu.hidden) render();
  };
  const close = (restoreFocus = false) => {
    menu.hidden = true;
    button.classList.remove("is-open");
    button.setAttribute("aria-expanded", "false");
    search.setAttribute("aria-expanded", "false");
    if (restoreFocus) button.focus({ preventScroll: true });
  };
  const open = (selectedSection?: string) => {
    if (selectedSection) section = selectedSection;
    search.value = "";
    active = 0;
    menu.hidden = false;
    button.classList.add("is-open");
    button.setAttribute("aria-expanded", "true");
    search.setAttribute("aria-expanded", "true");
    render();
    search.focus({ preventScroll: true });
  };
  const choose = (value: string) => { config.onSelect(value); refresh(); if (!config.multiple) close(true); };
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-controls", id);
  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", () => menu.hidden ? open() : close(true));
  done.addEventListener("click", () => close(true));
  search.addEventListener("input", () => { active = 0; render(); });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(true); }
    else if (event.target === search && ["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault(); activate((active + (event.key === "ArrowDown" ? 1 : -1) + visible.length) % visible.length);
      list.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
    } else if (event.target === search && event.key === "Enter" && visible[active]) { event.preventDefault(); choose(visible[active]!.value); }
  });
  list.addEventListener("click", (event) => { const row = (event.target as Element).closest<HTMLElement>("[data-value]"); if (row?.dataset.value !== undefined) choose(row.dataset.value); });
  document.addEventListener("pointerdown", (event) => { if (!menu.hidden && !menu.contains(event.target as Node) && !button.contains(event.target as Node)) close(); });
  document.addEventListener("focusin", (event) => { if (!menu.hidden && !menu.contains(event.target as Node) && !button.contains(event.target as Node)) close(); });
  window.addEventListener("resize", position, { passive: true });
  window.addEventListener("scroll", position, { passive: true, capture: true });
  refresh();
  return { refresh, open, close };
}
