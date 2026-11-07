// Native Notes does not reliably import remote <img> links from clipboard HTML.
// Copy a self-contained PNG of the offer instead. Plain text remains the fallback
// for browsers without image clipboard support; no third-party code is executed.
export type CopyableOffer = {
  title: string;
  description?: string;
  price: string;
  where: string;
  url: string;
  imageUrl?: string;
};

export async function createOfferImage(offer: CopyableOffer): Promise<{ blob: Blob; hasProductImage: boolean }> {
  let image: ImageBitmap | undefined;
  if (offer.imageUrl) {
    try {
      const response = await fetch(offer.imageUrl, { signal: AbortSignal.timeout(8000), referrerPolicy: "no-referrer" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      image = await createImageBitmap(await response.blob());
    } catch { /* The offer can still be copied, with an explicit message about the missing image. */ }
  }
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  const width = 640;
  const padding = 32;
  const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const lines: Array<{ text: string; font: string; color: string; y: number }> = [];
  let y = image ? 264 : padding;
  const addText = (text: string, size: number, weight: number, color: string) => {
    const face = `${weight} ${size}px ${font}`;
    context.font = face;
    let line = "";
    // Split long URLs as well as words, so nothing overflows the image.
    for (const word of text.split(/\s+/)) {
      if (line && context.measureText(`${line} ${word}`).width > width - 2 * padding) {
        lines.push({ text: line, font: face, color, y });
        y += size * 1.4;
        line = "";
      }
      for (const character of `${line ? " " : ""}${word}`) {
        if (context.measureText(line + character).width > width - 2 * padding) {
          lines.push({ text: line, font: face, color, y });
          y += size * 1.4;
          line = "";
        }
        line += character;
      }
    }
    if (line) {
      lines.push({ text: line, font: face, color, y });
      y += size * 1.4;
    }
    y += 10;
  };
  addText(offer.title, 28, 700, "#172026");
  if (offer.description) addText(offer.description, 20, 400, "#5d6b71");
  addText(offer.price, 26, 700, "#166b47");
  addText(offer.where, 20, 500, "#172026");
  addText(offer.url, 16, 400, "#5d6b71");
  addText("Cashback Norge · Sjekk pris og vilkår hos butikken", 14, 400, "#5d6b71");
  canvas.width = width * 2;
  canvas.height = Math.ceil(y + padding) * 2;
  context.scale(2, 2);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, canvas.height / 2);
  if (image) {
    const scale = Math.min((width - padding * 2) / image.width, 200 / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    context.drawImage(image, (width - w) / 2, padding + (200 - h) / 2, w, h);
    image.close();
  }
  context.textBaseline = "top";
  for (const line of lines) {
    context.font = line.font;
    context.fillStyle = line.color;
    context.fillText(line.text, padding, line.y);
  }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG export failed")), "image/png"));
  return { blob, hasProductImage: image !== undefined };
}

export async function copyOffer(offer: CopyableOffer): Promise<string> {
  const text = [offer.title, offer.description, offer.price, offer.where, offer.url].filter(Boolean).join("\n");
  if (!window.ClipboardItem || !navigator.clipboard?.write || (ClipboardItem.supports && !ClipboardItem.supports("image/png"))) {
    await navigator.clipboard.writeText(text);
    return "Tekst og lenke kopiert";
  }
  const image = createOfferImage(offer);
  // Start the write in the click handler, before awaiting image loading. Safari
  // requires this user gesture; ClipboardItem accepts a promise for the PNG.
  await navigator.clipboard.write([new ClipboardItem({ "image/png": image.then(({ blob }) => blob) })]);
  const { hasProductImage } = await image;
  return offer.imageUrl && !hasProductImage ? "Kopiert uten produktbilde" : "Tilbudet kopiert som bilde";
}
