export function readTcgProductKind(text: string): string | undefined {
  const normalized = normalizeTcgProductTitle(text);
  if (/\bpokemon center\b/.test(normalizeTcgText(text)) && /\b(?:elite trainer box|etb)\b/.test(normalized)) return "pokemon-center-etb";
  if (/\b(?:case|kartong)\b/.test(normalized)) return "case";
  if (/\b(?:elite trainer box|etb)\b/.test(normalized)) return "etb";
  if (/\bbooster (?:box|display)\b/.test(normalized)) return "booster-box";
  if (/\bblister\b/.test(normalized)) return "blister";
  if (/\bpremium deck (?:set|sett)\b/.test(normalized)) return "premium-deck-set";
  if (/\bbuild (?:and )?battle stadium\b/.test(normalized)) return "build-battle-stadium";
  if (/\bbuild (?:and )?battle\b/.test(normalized)) return "build-battle";
  if (/\bsurprise box\b/.test(normalized)) return "surprise-box";
  if (/\bbinder\b/.test(normalized)) return "binder";
  if (/\b(?:collection box|box samling)\b/.test(normalized)) return "collection-box";
  if (/\bultra premium collection\b/.test(normalized)) return "ultra-premium-collection";
  if (/\bpremium collection\b/.test(normalized)) return "premium-collection";
  if (/\b(?:booster )?bundle\b/.test(normalized)) return "bundle";
  if (/\bmini tin\b/.test(normalized) && /\bdisplay\b/.test(normalized)) return "mini-tin-display";
  if (/\bmini tin\b/.test(normalized)) return "mini-tin";
  if (/\btin\b/.test(normalized)) return "tin";
  if (/\bbooster (?:pack|pakke)\b/.test(normalized)) return "booster-pack";
  if (/\bcollection\b/.test(normalized)) return "collection";
  return undefined;
}

export function readTcgLanguage(text: string): { code: string; label: string } | undefined {
  const normalized = normalizeTcgText(text);
  for (const [code, label, pattern] of [
    ["en", "Engelsk", /\b(?:engelsk|english|en)\b/],
    ["jp", "Japansk", /\b(?:japansk|japanese|jpn|jp|ja)\b/],
    ["ko", "Koreansk", /\b(?:koreansk|korean|kor|ko)\b/],
    ["zh", "Kinesisk", /\b(?:kinesisk|chinese|zh|cn)\b/],
    ["es", "Spansk", /\b(?:spansk|spanish|espanol|es)\b/],
    ["de", "Tysk", /\b(?:tysk|german|deutsch|de)\b/],
    ["fr", "Fransk", /\b(?:fransk|french|francais|fr)\b/],
    ["it", "Italiensk", /\b(?:italiensk|italian|italiano|it)\b/],
  ] as const) if (pattern.test(normalized)) return { code, label };
  return undefined;
}

export function normalizeTcgText(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Language remains a separate variant check; these spellings describe the same form.
export function normalizeTcgProductTitle(text: string): string {
  return normalizeTcgText(text)
    .replace(/\bpokemon(?:\s+tcg)?\b|\btrading card game\b/g, " ")
    .replace(/\b(?:engelsk|english|en|japansk|japanese|jpn|jp|ja|koreansk|korean|kor|ko|kinesisk|chinese|zh|cn|spansk|spanish|espanol|es|tysk|german|deutsch|de|fransk|french|francais|fr|italiensk|italian|italiano|it)\b/g, " ")
    .replace(/\bbooster\s*(?:box|boks)\s+display\b|\bbooster\s+display\s+(?:box|boks)\b|\bbooster\s*(?:box|boks|display)\b/g, "booster box")
    .replace(/\bbooster\s*(?:pack|pakke)\b/g, "booster pack")
    .replace(/\bbooster bundle\b/g, "bundle")
    .replace(/\betb\b/g, "elite trainer box")
    .replace(/\belite trainer boks\b/g, "elite trainer box")
    .replace(/\bpremium samleboks\b/g, "premium collection")
    .replace(/\bex (?:box|boks|samleboks)\b/g, "ex collection box")
    .replace(/\bsamlekortspill\b|\bkortspill fra outland\b/g, " ")
    .replace(/\bcelebration collection 30th(?: anniversary)?\b/g, "30th celebration")
    .replace(/\b30th anniversary first partner illustration\b/g, "first partner illustration")
    .replace(/\bserie\b/g, "series")
    .replace(/\bbinder collection\b/g, "binder")
    .replace(/\bcollection box surprise box\b/g, "surprise box")
    .replace(/\s+/g, " ").trim();
}

export function isSameTcgProductTitle(first: string, second: string): boolean {
  if (hasTcgProductVariantConflict(first, second)) return false;
  const canonical = (text: string) => normalizeTcgProductTitle(text)
    .replace(/\b(?:scarlet violet|sword shield)\s+/g, "")
    .replace(/^mega evolution\s+(?!(?:booster|elite trainer|mini tin|tin|build|bundle|collection|premium)\b)/, "");
  return canonical(first) === canonical(second);
}

// Retailer titles can add packaging counts, series prefixes and SEO phrases.
// A code lookup must still retain the distinguishing set/character name.
export function hasTcgSetNameConflict(first: string, second: string): boolean {
  const signature = (text: string) => [...new Set(normalizeTcgProductTitle(text)
    .replace(/\b(?:scarlet violet|sword shield|mega evolution)\b/g, " ")
    .replace(/\b(?:elite trainer box|booster box|booster pack|premium collection|ultra premium collection|collection box|premium deck set|mini tin|build battle|build and battle)\b/g, " ")
    .replace(/\b\d+ (?:packs?|pakker|boosters?|packages|kort)\b/g, " ")
    .replace(/\b(?:tcg|poke|box|boks|kortboks|bundle|blister|collection|display|with|med|and|og|energi|samlerboks|boosterpakker|samlekortspill|samlekort|blå|bla|blue)\b/g, " ")
    .replace(/\s+/g, " ").trim().split(" ").filter(Boolean))].sort().join(" ");
  return signature(first) !== signature(second);
}

export function hasTcgProductVariantConflict(first: string, second: string): boolean {
  if (!/pok[eé]mon|\btcg\b/i.test(`${first} ${second}`)) return false;
  const a = readTcgProductKind(first);
  const b = readTcgProductKind(second);
  if (a !== undefined && b !== undefined && a !== b) return true;
  const firstLanguage = readTcgLanguage(first);
  const secondLanguage = readTcgLanguage(second);
  return firstLanguage !== undefined && secondLanguage !== undefined && firstLanguage.code !== secondLanguage.code;
}
