import { isRecord, parseUrl } from "./cashback.js";
import { decodeHtmlEntities, isSameProductUrl } from "./product-match.js";
import { readTcgLanguages } from "./tcg-product-match.js";

export function parseLdJson(text: string): unknown {
  return decodeLdJsonStrings(JSON.parse(text));
}

export function readLdJsonScripts(html: string): unknown[] {
  const entries: unknown[] = [];
  for (const match of html.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try { entries.push(parseLdJson(match[1] ?? "")); } catch { /* Ignore malformed metadata. */ }
  }
  return entries;
}

// Decode the public Next payload as data, without evaluating its script wrapper.
export function readNextFlightPayloads(html: string): string[] {
  const payloads: string[] = [];
  for (const match of html.matchAll(/<script\b[^>]*>\s*self\.__next_f\.push\((\[[\s\S]*?\])\)\s*;?\s*<\/script\s*>/g)) {
    try {
      const row: unknown = JSON.parse(match[1] ?? "");
      if (Array.isArray(row) && row[0] === 1 && typeof row[1] === "string") payloads.push(row[1]);
    } catch { /* Other script content is not a data payload. */ }
  }
  return payloads;
}

export function readNextFlightValues(html: string): unknown[] {
  const values: unknown[] = [];
  for (const row of readNextFlightPayloads(html).join("").split("\n")) {
    const separator = row.indexOf(":");
    if (separator < 0) continue;
    try { values.push(JSON.parse(row.slice(separator + 1))); } catch { /* Skip references and streamed text. */ }
  }
  return values;
}

// Choose the actual product record, not a recommendation or a later Flight reference.
export function readNextProductData(html: string, productUrl: string): Record<string, unknown> | undefined {
  const pending = [...readNextFlightValues(html)];
  for (let visited = 0; visited < pending.length && visited < 50_000; visited += 1) {
    const item = pending[visited];
    if (Array.isArray(item)) pending.push(...item);
    else if (isRecord(item)) {
      if (typeof item.url === "string" && isSameProductUrl(item.url, productUrl) &&
        typeof item.title === "string" && Array.isArray(item.offers)) return item;
      pending.push(...Object.values(item));
    }
  }
  return undefined;
}

export function readStructuredProductCodes(product: Record<string, unknown> | undefined): string[] {
  if (product === undefined) return [];
  return [...new Set(Object.entries(product).flatMap(([key, raw]) => {
    if (!/^(gtin|ean|barcode|sku|mpn)/i.test(key)) return [];
    return (Array.isArray(raw) ? raw : [raw]).flatMap((value) =>
      typeof value === "string" || typeof value === "number" ? [String(value).trim()] : []).filter(Boolean);
  }))];
}

export function readComparisonProductLdJson(html: string, rawUrl: string): Record<string, unknown> | undefined {
  const schema = selectProductLdJson(readLdJsonScripts(html));
  if (schema !== undefined) return schema;
  const url = parseUrl(rawUrl);
  if (url?.hostname.replace(/^www\./, "") !== "prisradar.no" || !/^\/produkter\/[^/]+\/?$/.test(url.pathname)) return undefined;
  const product = readNextProductData(html, rawUrl);
  if (product === undefined) return undefined;
  const brand = isRecord(product.brand) && typeof product.brand.title === "string" ? { name: product.brand.title } : undefined;
  const attributes = isRecord(product.attributes) && Array.isArray(product.attributes.grouped)
    ? product.attributes.grouped.filter(isRecord).flatMap((group) => Array.isArray(group.values) ? group.values.filter(isRecord) : []) : [];
  return { "@type": "Product", name: product.title, url: product.url,
    ...(brand !== undefined ? { brand } : {}),
    ...(typeof product.ean === "string" && product.ean !== "$undefined" ? { gtin: product.ean } : {}),
    additionalProperty: attributes.filter((attribute) => /^(?:språk|language)$/i.test(String(attribute.title)))
      .map((attribute) => ({ name: attribute.title, value: attribute.value })),
  };
}

export function findStructuredProperty(value: unknown, name: string): unknown {
  const pending = [value];
  for (let visited = 0; pending.length > 0 && visited < 50_000; visited += 1) {
    const item = pending.pop();
    if (Array.isArray(item)) pending.push(...item);
    else if (isRecord(item)) {
      if (Object.hasOwn(item, name)) return item[name];
      pending.push(...Object.values(item));
    }
  }
  return undefined;
}

export function readProductLanguage(product: Record<string, unknown> | undefined, titles: string[]): string | undefined {
  const properties = Array.isArray(product?.additionalProperty) ? product.additionalProperty.filter(isRecord) : [];
  const values = [product?.inLanguage, ...properties.filter((property) => /^(?:språk|language)$/i.test(String(property.name))).map((property) => property.value), ...titles];
  const languages = new Set(values.filter((value): value is string => typeof value === "string")
    .flatMap((value) => readTcgLanguages(value).map((language) => language.code)));
  return languages.size === 1 ? [...languages][0] : undefined;
}

export function readProductOfferLanguage(html: string, productId: string): string | undefined {
  const rows = findStructuredProperty(readNextFlightValues(html), "offerRows");
  if (!Array.isArray(rows)) return undefined;
  const names = rows.filter(isRecord)
    .filter((row) => String(row.productId) === productId && typeof row.name === "string")
    .map((row) => row.name as string);
  return readProductLanguage(undefined, names);
}

// Shared by page metadata extraction and price-source adapters. Never execute scripts.
export function findTypedLdJson(value: unknown, type: string): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTypedLdJson(item, type);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  const found = Array.isArray(value["@graph"]) ? findTypedLdJson(value["@graph"], type) : undefined;
  if (found !== undefined) return found;
  const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
  return types.includes(type) ? value : undefined;
}

// Review widgets can prepend a nameless Product containing only aggregateRating.
// Keep the first named product, including when those records share an @graph.
export function selectProductLdJson(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const product = selectProductLdJson(item);
      if (product !== undefined) return product;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
  if (types.includes("Product") && typeof value.name === "string" && value.name.trim().length > 0) return value;
  return Array.isArray(value["@graph"]) ? selectProductLdJson(value["@graph"]) : undefined;
}

function decodeLdJsonStrings(value: unknown): unknown {
  if (typeof value === "string") return decodeHtmlEntities(value);
  if (Array.isArray(value)) return value.map(decodeLdJsonStrings);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeLdJsonStrings(item)]));
  return value;
}
