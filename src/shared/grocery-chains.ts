// Grocery chains on cashbacknorge.no/dagligvarer: the names Tjek uses for the dealers
// (the daily crawl's allowlist), the label shown, and the chip colours.
//
// Colours were checked one by one against each chain's logo (Tjek dealer logo and colour,
// November 2026): REMA 1000 blue, KIWI green with black lettering, MENY and SPAR red,
// Joker green with yellow, Extra's yellow with red, Coop Prix yellow with blue, Coop Mega
// dark green, Obs blue, Coop Marked and Matkroken red, Bunnpris yellow with black,
// Nærbutikken silver with the red heart, Europris green and Oda orange.
// `search` is the chain's own product search ({q} = the product), checked November 2026.
// KIWI, REMA 1000, Coop's chains, Bunnpris, Nærbutikken and Matkroken have no product
// search on the web; their offers link to the flyer offer on eTilbudsavis instead.
export type GroceryChain = { name: string; label: string; slug: string; bg: string; fg: string; search?: string };

export const GROCERY_CHAIN_LIST: GroceryChain[] = [
  { name: "REMA 1000", label: "REMA 1000", slug: "rema", bg: "#0033a0", fg: "#ffffff" },
  { name: "KIWI", label: "KIWI", slug: "kiwi", bg: "#50b848", fg: "#111111" },
  { name: "MENY", label: "MENY", slug: "meny", bg: "#da1f3d", fg: "#ffffff", search: "https://meny.no/sok?query={q}&expanded=products" },
  { name: "SPAR", label: "SPAR", slug: "spar", bg: "#dc1e21", fg: "#ffffff", search: "https://spar.no/sok?query={q}&expanded=products" },
  { name: "Joker", label: "Joker", slug: "joker", bg: "#008c58", fg: "#ffe600", search: "https://joker.no/sok?query={q}&expanded=products" },
  { name: "Extra", label: "Extra", slug: "extra", bg: "#ffd400", fg: "#c8102e" },
  { name: "Coop Mega", label: "Coop Mega", slug: "coop-mega", bg: "#2f5d2a", fg: "#ffffff" },
  { name: "Coop Prix", label: "Coop Prix", slug: "coop-prix", bg: "#ffcc00", fg: "#00468c" },
  { name: "Obs", label: "Obs", slug: "obs", bg: "#004993", fg: "#ffffff" },
  { name: "Coop Marked", label: "Coop Marked", slug: "coop-marked", bg: "#da0b16", fg: "#ffffff" },
  { name: "Bunnpris", label: "Bunnpris", slug: "bunnpris", bg: "#fff200", fg: "#111111" },
  { name: "Nærbutikken", label: "Nærbutikken", slug: "naerbutikken", bg: "#e9e9ed", fg: "#c8102e" },
  { name: "Matkroken", label: "Matkroken", slug: "matkroken", bg: "#c8102e", fg: "#ffffff" },
  { name: "Europris", label: "Europris", slug: "europris", bg: "#00693e", fg: "#ffffff", search: "https://www.europris.no/sok?q={q}" },
  { name: "oda", label: "Oda", slug: "oda", bg: "#f4511e", fg: "#ffffff", search: "https://oda.com/no/search/products/?q={q}" },
];

export const GROCERY_CHAINS = GROCERY_CHAIN_LIST.map((chain) => chain.name);

const FLYER_SEARCH = "https://etilbudsavis.no/soek/{q}";

/** Where an offer leads: the chain's own product search, or the flyer offer on eTilbudsavis. */
export function getGroceryOfferLink(chainName: string, query: string): { url: string; label: string } {
  const chain = getGroceryChain(chainName);
  const url = (chain?.search ?? FLYER_SEARCH).replace("{q}", encodeURIComponent(query));
  return { url, label: chain?.search !== undefined ? `Se varen hos ${chain.label}` : "Se tilbudet i kundeavisen (eTilbudsavis)" };
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
