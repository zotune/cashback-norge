/** One presentation model for terms in the site, extension and userscript.
 * Text is never summarized: only list/heading markers are removed. Long
 * conditions stay paragraphs; short, self-contained conditions become chips.
 */
export type TooltipItem = { kind: "chip" | "text"; text: string };
export type TooltipSection = { title?: string; items: TooltipItem[] };
const marker = /^[-•*]\s+/;
const clean = (line: string) => line.replace(marker, "");
export function parseTooltipSections(parts: string | string[]): TooltipSection[] {
  return (typeof parts === "string" ? [parts] : parts).flatMap((part) => part.split(/\n\s*\n/)).flatMap((part) => {
    const lines = part.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return [];
    const first = lines[0]!;
    const markdownHeading = /^#{1,3}\s+/.test(first) || /^\*\*.+\*\*$/.test(first);
    const hasHeading = markdownHeading || lines.length > 1 && (
      /^(medlemsfordel|medlemstilbud)$/i.test(first) || / tilbud$/i.test(first) ||
      lines.slice(1).some((line) => marker.test(line))
    );
    const title = hasHeading ? clean(first).replace(/^#{1,3}\s+|^\*\*|\*\*$/g, "") : undefined;
    const items = (hasHeading ? lines.slice(1) : lines).map((line): TooltipItem => {
      const text = clean(line);
      const short = text.length <= 72 && text.split(/\s+/).length <= 12 && !/https?:\/\/|^⚠/.test(text);
      return { kind: short ? "chip" : "text", text };
    });
    return [{ ...(title ? { title } : {}), items }];
  });
}
const escapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escape = (text: string) => text.replace(/[&<>"']/g, (char) => escapes[char]!);

export function formatTooltipHtml(parts: string | string[]): string {
  return parseTooltipSections(parts).map((section) => `<span class="offer-tooltip-section cbn-tooltip-content">${section.title ? `<strong class="offer-tooltip-title">${escape(section.title)}</strong>` : ""}<span class="tooltip-content-items">${section.items.map((item) => `<span class="${item.kind === "chip" ? "cbn-chip cbn-chip--muted tooltip-content-chip" : "tooltip-content-note"}">${escape(item.text)}</span>`).join("")}</span></span>`).join("");
}

export function setTooltipContent(tooltip: HTMLElement, parts: string[]): void {
  tooltip.classList.add("cbn-tooltip-rich");
  // The renderer escapes every source string; markup is exclusively ours.
  tooltip.innerHTML = formatTooltipHtml(parts);
}

export function createTooltipSection(part: string): HTMLDivElement | undefined {
  const html = formatTooltipHtml(part);
  if (!html) return undefined;
  const section = document.createElement("div");
  section.className = "offer-tooltip-section";
  section.innerHTML = html;
  return section;
}
