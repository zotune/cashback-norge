// Touch users get an explicit details button; links keep their normal one-tap action.
// One delegated controller per page/panel, with no observer or per-button document listeners.
import { BRAND_QUOKKA_DATA_URL } from "./brand.js";

let nextTooltipId = 0;

export function tooltipPosition(anchor: { left: number; bottom: number; top: number }, width: number, height: number, viewport: { width: number; height: number }) {
  const left = Math.max(8, Math.min(anchor.left, viewport.width - width - 8));
  const below = anchor.bottom + 8;
  const top = below + height <= viewport.height - 8 ? below : Math.max(8, anchor.top - height - 8);
  return { left, top };
}

export function createTooltipController(root: Document | ShadowRoot) {
  const doc = root.ownerDocument ?? root as Document;
  const view = doc.defaultView!;
  const targets = new WeakMap<HTMLButtonElement, HTMLElement>();
  let active: { button: HTMLButtonElement; tooltip: HTMLElement; style: string | null; topLayer: boolean } | undefined;

  const close = () => {
    if (!active) return;
    const { button, tooltip, style, topLayer } = active;
    button.setAttribute("aria-expanded", "false");
    tooltip.classList.remove("cbn-tooltip-open", "visible");
    if (topLayer) {
      try { (tooltip as HTMLElement & { hidePopover?: () => void }).hidePopover?.(); } catch { /* already closed */ }
      tooltip.removeAttribute("popover");
    }
    if (style === null) tooltip.removeAttribute("style"); else tooltip.setAttribute("style", style);
    active = undefined;
  };
  const onClick = (event: Event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>(".cbn-tooltip-trigger");
    if (!button || !targets.has(button)) return;
    event.preventDefault();
    event.stopPropagation();
    if (active?.button === button) { close(); return; }
    close();
    const tooltip = targets.get(button)!;
    const style = tooltip.getAttribute("style");
    const isBonusChipTooltip = tooltip.classList.contains("bonus-chip-tooltip");
    let topLayer = false;
    button.setAttribute("aria-expanded", "true");
    tooltip.classList.add("cbn-tooltip-open");
    const availableWidth = Math.max(80, doc.documentElement.clientWidth - 16);
    Object.assign(tooltip.style, {
      position: "fixed", left: "8px", top: "8px", bottom: "auto", right: "auto", transform: "none",
      width: isBonusChipTooltip ? "max-content" : `${Math.min(340, availableWidth)}px`,
      maxWidth: isBonusChipTooltip ? `${Math.min(320, availableWidth)}px` : "none",
      maxHeight: `${Math.max(80, view.innerHeight - 32)}px`, overflowY: "auto", boxSizing: "border-box", whiteSpace: "normal", margin: "0",
    });
    // iOS Safari can paint a shadow-DOM tooltip underneath the host page. A
    // manual popover enters the browser's top layer, while the normal z-index
    // path remains available on browsers without the Popover API.
    if (isBonusChipTooltip) {
      const popover = tooltip as HTMLElement & { showPopover?: () => void };
      if (typeof popover.showPopover === "function") {
        try {
          tooltip.setAttribute("popover", "manual");
          popover.showPopover();
          topLayer = true;
        } catch {
          tooltip.removeAttribute("popover");
        }
      }
    }
    active = { button, tooltip, style, topLayer };
    const rect = tooltip.getBoundingClientRect();
    const position = tooltipPosition(button.getBoundingClientRect(), rect.width, rect.height, { width: doc.documentElement.clientWidth, height: view.innerHeight });
    tooltip.style.left = `${position.left}px`;
    tooltip.style.top = `${position.top}px`;
  };
  const outside = (event: Event) => {
    if (active && !event.composedPath().includes(active.button) && !event.composedPath().includes(active.tooltip)) close();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && active) {
      const button = active.button; close(); button.focus(); event.stopPropagation();
    }
  };
  const onScroll = (event: Event) => {
    if (active && !(event.target instanceof Node && active.tooltip.contains(event.target))) close();
  };
  root.addEventListener("click", onClick);
  doc.addEventListener("pointerdown", outside, { passive: true });
  doc.addEventListener("keydown", onKey);
  doc.addEventListener("scroll", onScroll, { capture: true, passive: true });
  view.addEventListener("resize", close);

  return {
    close,
    add(parent: HTMLElement, tooltip: HTMLElement, label = "Vis vilkår og detaljer") {
      if (parent.querySelector(".cbn-tooltip-trigger")) return;
      const mascotAnchor = parent.closest<HTMLElement>(".offer-wrap, .offer-link-wrapper, .code-item-row, .tooltip-wrap");
      mascotAnchor?.classList.add("cbn-quokka-tooltip-anchor");
      if (!tooltip.querySelector(".cbn-tooltip-mascot")) {
        tooltip.classList.add("cbn-has-quokka");
        const mascot = doc.createElement("span");
        mascot.className = "cbn-tooltip-mascot";
        mascot.setAttribute("aria-hidden", "true");
        const image = doc.createElement("img");
        image.src = BRAND_QUOKKA_DATA_URL;
        image.alt = "";
        mascot.append(image);
        tooltip.prepend(mascot);
      }
      tooltip.id ||= `cbn-tooltip-${++nextTooltipId}`;
      tooltip.setAttribute("role", "tooltip");
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "cbn-button cbn-button--quiet cbn-tooltip-trigger";
      button.textContent = "ⓘ";
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-controls", tooltip.id);
      targets.set(button, tooltip);
      const action = parent.querySelector<HTMLElement>(":scope > .offer-action");
      if (action) {
        const details = doc.createElement("span");
        details.className = "cbn-offer-details";
        details.append(button);
        // Keep the amount's link separate from the details button and status labels.
        const reward = action.querySelector(".offer-reward, .offer-label");
        while (reward?.nextElementSibling) details.append(reward.nextElementSibling);
        action.after(details);
      } else parent.insertBefore(button, parent.querySelector(":scope > .code-source-badge, :scope > .provider-filter-link, :scope > .badge"));
    },
    addBeside(anchor: HTMLElement, tooltip: HTMLElement, label?: string) {
      const row = doc.createElement("div");
      row.className = "cbn-tooltip-row cbn-quokka-tooltip-anchor";
      anchor.replaceWith(row);
      row.append(anchor);
      if (anchor.classList.contains("bonus-chip")) {
        row.className += ` ${anchor.className}`;
        anchor.className = "bonus-chip-action";
        const details = doc.createElement("span");
        details.className = "cbn-offer-details";
        this.add(details, tooltip, label);
        const reward = anchor.querySelector(".bonus-chip-label");
        const brandLink = doc.createElement("a");
        brandLink.className = "bonus-chip-brand-link";
        for (const attribute of ["href", "target", "rel"]) {
          const value = anchor.getAttribute(attribute);
          if (value !== null) brandLink.setAttribute(attribute, value);
        }
        while (reward?.nextElementSibling) brandLink.append(reward.nextElementSibling);
        details.append(brandLink);
        row.append(details);
      } else {
        this.add(row, tooltip, label);
        row.prepend(row.querySelector(".cbn-tooltip-trigger")!);
      }
      return row;
    },
    dispose() {
      close();
      root.removeEventListener("click", onClick);
      doc.removeEventListener("pointerdown", outside);
      doc.removeEventListener("keydown", onKey);
      doc.removeEventListener("scroll", onScroll, true);
      view.removeEventListener("resize", close);
    },
  };
}
export type TooltipController = ReturnType<typeof createTooltipController>;

export function addSiteTooltipButtons(controller: TooltipController, parent: ParentNode) {
  parent.querySelectorAll<HTMLElement>(".offer-wrap, .code-item-row, .tooltip-wrap").forEach((wrapper) => {
    if (wrapper.querySelector(".cbn-tooltip-trigger")) return;
    const tooltip = wrapper.querySelector<HTMLElement>(":scope > .offer-tooltip, :scope > .tooltip");
    if (!tooltip) return;
    const row = wrapper.querySelector<HTMLElement>(":scope > .offer, :scope > .code-item");
    if (row) controller.add(row, tooltip);
    else if (wrapper.querySelector<HTMLElement>(":scope > .bonus-chip")) {
      controller.addBeside(wrapper.querySelector<HTMLElement>(":scope > .bonus-chip")!, tooltip);
    }
    else {
      wrapper.classList.add("cbn-tooltip-row");
      controller.add(wrapper, tooltip);
    }
  });
}
