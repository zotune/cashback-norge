// Grocery chains on cashbacknorge.no/dagligvarer: the names Tjek uses for the dealers
// (the daily crawl's allowlist), the label shown, and the chip colours.
//
// Colours were checked one by one against each chain's logo (Tjek dealer logo and colour,
// November 2026): REMA 1000 blue, KIWI green with black lettering, MENY and SPAR red,
// Joker green with white text for legibility, Extra's yellow with red, Coop Prix yellow with blue, Coop Mega
// dark green, Obs blue, Coop Marked and Matkroken red, Bunnpris yellow with black,
// Nærbutikken silver with the red heart, Europris green and Oda orange; Gigaboks red
// (#e4143b, its logo and gigaboks.no stylesheet), Holdbart's dark green lettering and Afood
// Market's navy logo tile, each with white text. Swedish border stores in Tjek (Hypermat,
// MaxiMat, Nordby, eurocash) are left out: their flyers are priced in SEK.
// `search` is the chain's own product search ({q} = the product), checked November 2026
// (Holdbart: /search?q= lists matching products).
// Obs searches its online assortment (verified LEGO results; groceries such as kaviar
// are not in that assortment). KIWI, REMA 1000, the other Coop chains, Bunnpris, Gigaboks, Nærbutikken and Matkroken have no product
// search on the web, and Afood Market's search jumps to unrelated single products; their offers
// link to the flyer offer on eTilbudsavis instead.
export type GroceryChain = { name: string; label: string; slug: string; bg: string; fg: string; search?: string };

export const GROCERY_CHAIN_LIST: GroceryChain[] = [
  { name: "REMA 1000", label: "REMA 1000", slug: "rema", bg: "#0033a0", fg: "#ffffff" },
  { name: "KIWI", label: "KIWI", slug: "kiwi", bg: "#50b848", fg: "#111111" },
  { name: "MENY", label: "MENY", slug: "meny", bg: "#da1f3d", fg: "#ffffff", search: "https://meny.no/sok?query={q}&expanded=products" },
  { name: "SPAR", label: "SPAR", slug: "spar", bg: "#dc1e21", fg: "#ffffff", search: "https://spar.no/sok?query={q}&expanded=products" },
  { name: "Joker", label: "Joker", slug: "joker", bg: "#008c58", fg: "#ffffff", search: "https://joker.no/sok?query={q}&expanded=products" },
  { name: "Extra", label: "Extra", slug: "extra", bg: "#ffd400", fg: "#c8102e" },
  { name: "Coop Mega", label: "Coop Mega", slug: "coop-mega", bg: "#2f5d2a", fg: "#ffffff" },
  { name: "Coop Prix", label: "Coop Prix", slug: "coop-prix", bg: "#ffcc00", fg: "#00468c" },
  { name: "Obs", label: "Obs", slug: "obs", bg: "#004993", fg: "#ffffff", search: "https://www.obs.no/sok?q={q}" },
  { name: "Coop Marked", label: "Coop Marked", slug: "coop-marked", bg: "#da0b16", fg: "#ffffff" },
  { name: "Bunnpris", label: "Bunnpris", slug: "bunnpris", bg: "#fff200", fg: "#111111" },
  { name: "Gigaboks", label: "Gigaboks", slug: "gigaboks", bg: "#e4143b", fg: "#ffffff" },
  { name: "Nærbutikken", label: "Nærbutikken", slug: "naerbutikken", bg: "#e9e9ed", fg: "#c8102e" },
  { name: "Matkroken", label: "Matkroken", slug: "matkroken", bg: "#c8102e", fg: "#ffffff" },
  { name: "Europris", label: "Europris", slug: "europris", bg: "#00693e", fg: "#ffffff", search: "https://www.europris.no/sok?q={q}" },
  { name: "oda", label: "Oda", slug: "oda", bg: "#f4511e", fg: "#ffffff", search: "https://oda.com/no/search/products/?q={q}" },
  { name: "Holdbart", label: "Holdbart", slug: "holdbart", bg: "#364e27", fg: "#ffffff", search: "https://www.holdbart.no/search?q={q}" },
  { name: "Afood Market", label: "Afood Market", slug: "afood-market", bg: "#18277d", fg: "#ffffff" },
];

export const GROCERY_CHAINS = GROCERY_CHAIN_LIST.map((chain) => chain.name);

const FLYER_SEARCH = "https://etilbudsavis.no/soek/{q}";

/** Where an offer leads: the chain's own product search, or the flyer offer on eTilbudsavis. */
export function getGroceryOfferLink(chainName: string, query: string): { url: string; label: string } {
  const chain = getGroceryChain(chainName);
  const url = (chain?.search ?? FLYER_SEARCH).replace("{q}", encodeURIComponent(query));
  return { url, label: chain?.slug === "obs" ? "Søk i Obs sitt nettutvalg (matvarer kan mangle)" : chain?.search !== undefined ? `Se varen hos ${chain.label}` : "Se tilbudet i kundeavisen (eTilbudsavis)" };
}

/** A search query from a flyer heading: without "alt av", sizes and prices. */
export function getGrocerySearchQuery(heading: string): string {
  return heading
    .replace(/\b(?:alt av|utvalgte|flere varianter|ass\.?)\b/gi, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:x\s*\d+(?:[.,]\d+)?\s*)?(?:kg|g|gr|l|liter|dl|cl|ml|stk|pk|pakk)\b\.?/gi, " ")
    .replace(/[^\p{L}\p{N}&%' -]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 4)
    .join(" ");
}

export function getGroceryChain(name: string): GroceryChain | undefined {
  return GROCERY_CHAIN_LIST.find((chain) => chain.name === name);
}

export type GroceryQuantity = { unit: string; from: number; to: number };

/** The unit price a flyer prints ("Pr kg 162,16", "193,33/KG", "Enh.pris 27,60 pr. l"), first value of a range.
 * Without a printed one, the offer's own price is a unit price when the flyer says so ("Pr kg", quantity 1 kg)
 * or when it is one pack of a stated weight/volume ("1 kg", "500 g"). Multipacks ("6 x 47 g": the quantity is
 * one piece) and per-piece prices stay unknown rather than guessed. */
export function getGroceryUnitPrice(
  description: string,
  offer?: { amount?: number; quantity?: GroceryQuantity },
): { amount: number; unit: "kg" | "l" } | undefined {
  return getPrintedGroceryUnitPrice(description) ?? getQuantityUnitPrice(description, offer);
}

function getQuantityUnitPrice(
  description: string,
  offer: { amount?: number; quantity?: GroceryQuantity } | undefined,
): { amount: number; unit: "kg" | "l" } | undefined {
  const amount = offer?.amount;
  const quantity = offer?.quantity;
  if (amount === undefined || !Number.isFinite(amount) || amount <= 0 || quantity === undefined) return undefined;
  if (quantity.from !== quantity.to || !(quantity.from > 0)) return undefined;
  const unit = quantity.unit === "g" ? "kg" : quantity.unit === "ml" ? "l" : undefined;
  if (unit === undefined) return undefined;
  // Multipacks, multi-buys ("3 for 100", "2 for 110": the price is for several) and "fra"-sizes.
  if (/\d\s*x\s*\d/i.test(description) || /\b\d+\s*-?\s*pk\b/i.test(description) || /\b\d+\s*for\s*\d/i.test(description) ||
    /\bfra\s+\d/i.test(description) || /\bpr\.?\s*(?:pk|pakke|stk|boks|brett|flaske|beger|pose)\b/i.test(description)) return undefined;
  // "Pr kg" with no number: the flyer price itself is per kilo.
  const perUnit = new RegExp(String.raw`\bpr\.?\s*${unit === "kg" ? "kg" : "l(?:iter)?"}\b(?!\s*(?:fra\s*)?\d)`, "i");
  if (perUnit.test(description)) return quantity.from === 1000 ? { amount, unit } : undefined;
  // One pack of the stated size: "1 kg", "500 g", "1,5 l".
  const sizes = [...description.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|dl|cl|ml)\b/gi)].map((match) => {
    const value = Number(match[1]!.replace(",", "."));
    const factor = { kg: 1000, g: 1, l: 1000, dl: 100, cl: 10, ml: 1 }[match[2]!.toLowerCase() as "kg"];
    return value * factor;
  });
  if (sizes.length !== 1 || Math.abs(sizes[0]! - quantity.from) > 0.5) return undefined;
  return { amount: Math.round((amount / (quantity.from / 1000)) * 100) / 100, unit };
}

function getPrintedGroceryUnitPrice(description: string): { amount: number; unit: "kg" | "l" } | undefined {
  const number = String.raw`(\d{1,5}(?:[.,]\d{1,2})?)`;
  const unit = String.raw`(kg|l(?:iter)?)\b`;
  const patterns: Array<[RegExp, number, number]> = [
    [new RegExp(String.raw`enh\.?\s*pris\s*${number}\s*(?:kr\s*)?pr\.?\s*${unit}`, "i"), 1, 2],
    [new RegExp(String.raw`\bpr\.?\s*${unit}\s*(?:fra\s*)?${number}`, "i"), 2, 1],
    [new RegExp(String.raw`${number}\s*(?:kr\s*)?\/\s*${unit}`, "i"), 1, 2],
    [new RegExp(String.raw`${number}\s*(?:kr\s*)?pr\.?\s*${unit}`, "i"), 1, 2],
  ];
  for (const [pattern, amountGroup, unitGroup] of patterns) {
    const match = description.match(pattern);
    if (!match) continue;
    const amount = Number(match[amountGroup]!.replace(",", "."));
    if (Number.isFinite(amount) && amount > 0) return { amount, unit: match[unitGroup]!.toLowerCase() === "kg" ? "kg" : "l" };
  }
  return undefined;
}

// Payment cards that give extra bonus on groceries, checked on the issuers' pages
// November 2026 (trumf.no/trumf-kredittkort and its terms, coop.no/medlem/fordeler/coop-mastercard).
export type GroceryCardBonus = { id: string; label: string; rate: string; chains?: string[]; url: string; tip: string };

const NORGESGRUPPEN = ["MENY", "SPAR", "Joker", "KIWI", "Nærbutikken"];
const COOP = ["Extra", "Coop Mega", "Coop Prix", "Obs", "Coop Marked", "Matkroken"];

export const GROCERY_CARD_BONUSES: GroceryCardBonus[] = [
  {
    id: "trumf", label: "Trumf Kredittkort", rate: "3–5 %", chains: NORGESGRUPPEN,
    url: "https://www.trumf.no/trumf-kredittkort",
    tip: "# Trumf Kredittkort\n3 % Trumf-bonus når du betaler med kortet i Trumf Pay hos MENY, SPAR, KIWI, Joker og Nærbutikken (2 % med det fysiske kortet).\nTrippel-Trumf-torsdag: 4 %, eller 5 % i Trumf Pay.\nI nettbutikkene må du være innlogget Trumf-medlem.\nIngen årsavgift. Gjelder ikke andre dagligvarekjeder.",
  },
  {
    id: "coop", label: "Coop Mastercard", rate: "2 %", chains: COOP,
    url: "https://www.coop.no/medlem/fordeler/coop-mastercard",
    tip: "# Coop Mastercard\nMinst 2 % samlet: minst 1 % kjøpeutbytte som Coop-medlem og 1 % ekstra bonus med kortet.\nKjøpeutbyttet varierer mellom samvirkelag.\nKortbonusen er begrenset til 2 500 kr per år.\nIngen årsavgift. Gjelder ikke andre dagligvarekjeder.",
  },
];

/** The chain's own card bonus, if it has one. */
export function getGroceryCardBonus(chainName: string): GroceryCardBonus | undefined {
  return GROCERY_CARD_BONUSES.find((card) => card.chains?.includes(chainName));
}
