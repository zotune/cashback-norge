export function readTcgProductKind(text: string): string | undefined {
  // An advertised alternative is not the selected package. An actual case
  // (including a case of Pokémon Center ETBs) still takes precedence.
  const normalized = normalizeTcgProductTitle(text.replace(/\(\s*(?:case|kartong)\s+(?:tilgjengelig|available)\s*\)/gi, ""));
  if (/\b(?:case|kartong)\b/.test(normalized)) return "case";
  if (/\bpokemon center\b/.test(normalizeTcgText(text)) && /\b(?:elite trainer box|etb)\b/.test(normalized)) return "pokemon-center-etb";
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
  if (/\bbooster (?:packs?|pakker?)\b/.test(normalized)) return "booster-pack";
  if (/\bcollection\b/.test(normalized)) return "collection";
  return undefined;
}

export function readTcgLanguage(text: string): { code: string; label: string } | undefined {
  const languages = readTcgLanguages(text);
  return languages.length === 1 ? languages[0] : undefined;
}

export function readTcgLanguages(text: string): Array<{ code: string; label: string }> {
  const normalized = normalizeTcgText(text);
  const languages = [];
  for (const [code, label, pattern] of [
    ["en", "Engelsk", /\b(?:engelsk|english|en)\b/],
    ["jp", "Japansk", /\b(?:japansk|japanese|jpn|jp|ja)\b/],
    ["ko", "Koreansk", /\b(?:koreansk|korean|kor|ko)\b/],
    ["zh", "Kinesisk", /\b(?:kinesisk|chinese|zh|cn)\b/],
    ["es", "Spansk", /\b(?:spansk|spanish|espanol|es)\b/],
    ["de", "Tysk", /\b(?:tysk|german|deutsch|de)\b/],
    ["fr", "Fransk", /\b(?:fransk|french|francais|fr)\b/],
    ["it", "Italiensk", /\b(?:italiensk|italian|italiano|it)\b/],
  ] as const) if (pattern.test(normalized)) languages.push({ code, label });
  return languages;
}

// A catalog association does not prove the merchant's selected edition or
// packaging. Use the original offer title, before prices enter the comparison.
// Missing form evidence remains unknown; the caller decides whether to omit it.
export function readTcgSealedOfferIssue(productName: string, offerName: string, language: string): string | undefined {
  const normalized = normalizeTcgText(offerName);
  if (/\b(?:used|brukt|opened|apnet|graded|gradert|psa|bgs|cgc)\b/.test(normalized)) return "condition-mismatch";
  const expectedKind = readTcgProductKind(productName);
  const offerKind = readTcgProductKind(offerName);
  if (offerKind === undefined) return "unknown-product-form";
  if (expectedKind !== offerKind) return "product-form-mismatch";
  const languages = readTcgLanguages(offerName);
  if (languages.length > 1) return "ambiguous-language";
  if (languages[0] !== undefined && languages[0].code !== language) return "language-mismatch";
  if (offerName.split("+").filter((part) => readTcgProductKind(part) !== undefined).length > 1) return "combined-products";
  // Count purchased boxes/tins separately from the booster packs inside them.
  const unitCount = (text: string) => {
    const title = normalizeTcgProductTitle(text);
    return Number(title.match(/\b(\d+)\s*x\b/)?.[1] ?? title.match(/^(\d+)\s+(?:elite trainer box|booster box|mini tins?|tins?)\b/)?.[1] ?? "1");
  };
  if (["etb", "pokemon-center-etb", "booster-box", "mini-tin", "tin"].includes(offerKind) && unitCount(productName) !== unitCount(offerName)) return "quantity-mismatch";
  const packCount = (text: string) => normalizeTcgText(text).match(/\b(\d+)\s*(?:booster packs?|boosters?|packs?|pakker)\b/)?.[1];
  const expectedPacks = packCount(productName) ?? (expectedKind === "booster-pack" ? "1" : undefined);
  const offeredPacks = packCount(offerName);
  if (expectedPacks !== undefined && offeredPacks !== undefined && Number(expectedPacks) !== Number(offeredPacks)) return "quantity-mismatch";
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
  const signature = (text: string) => [...readTcgSetWords(text)].sort().join(" ");
  return signature(first) !== signature(second);
}

// The words left after form, packaging, series and filler: mostly the set or
// character name ("ascended heroes", "30th celebration").
function readTcgSetWords(text: string): Set<string> {
  return new Set(normalizeTcgProductTitle(text)
    .replace(/\b(?:scarlet violet|sword shield|mega evolution)\b/g, " ")
    .replace(/\b(?:elite trainer box|booster box|booster pack|premium collection|ultra premium collection|collection box|premium deck set|mini tin|build battle|build and battle)\b/g, " ")
    .replace(/\b\d+ (?:packs?|pakker|boosters?|packages|kort)\b/g, " ")
    .replace(/\b(?:tcg|poke|box|boks|kortboks|bundle|blister|collection|display|with|med|and|og|energi|samlerboks|boosterpakker|samlekortspill|samlekort|blå|bla|blue)\b/g, " ")
    .replace(/\s+/g, " ").trim().split(" ").filter(Boolean));
}

export function hasTcgProductVariantConflict(first: string, second: string): boolean {
  if (!/pok[eé]mon|\btcg\b/i.test(`${first} ${second}`)) return false;
  const a = readTcgProductKind(first);
  const b = readTcgProductKind(second);
  if (a !== undefined && b !== undefined && a !== b) return true;
  // Two sealed products of one form are different sets unless one title's
  // set words contain the other's: an Ascended Heroes ETB is not a 30th
  // Celebration ETB. Retailer extras on one side ("Mega Evolution", "ny") pass.
  if (a !== undefined && b !== undefined) {
    const firstSet = readTcgSetWords(first);
    const secondSet = readTcgSetWords(second);
    const within = (inner: Set<string>, outer: Set<string>) => [...inner].every((word) => outer.has(word));
    if (firstSet.size > 0 && secondSet.size > 0 && !within(firstSet, secondSet) && !within(secondSet, firstSet)) return true;
  }
  const firstLanguage = readTcgLanguage(first);
  const secondLanguage = readTcgLanguage(second);
  return firstLanguage !== undefined && secondLanguage !== undefined && firstLanguage.code !== secondLanguage.code;
}
