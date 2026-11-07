// Grocery chains on cashbacknorge.no/dagligvarer: the names Tjek uses for the dealers
// (the daily crawl's allowlist), the label shown, and the chip colours.
//
// Colours were checked one by one against each chain's logo (Tjek dealer logo and colour,
// November 2026): REMA 1000 blue, KIWI green with black lettering, MENY and SPAR red,
// Joker green with yellow, Extra's yellow with red, Coop Prix yellow with blue, Coop Mega
// dark green, Obs blue, Coop Marked and Matkroken red, Bunnpris yellow with black,
// Nærbutikken silver with the red heart, Europris green and Oda orange.
export type GroceryChain = { name: string; label: string; slug: string; bg: string; fg: string };

export const GROCERY_CHAIN_LIST: GroceryChain[] = [
  { name: "REMA 1000", label: "REMA 1000", slug: "rema", bg: "#0033a0", fg: "#ffffff" },
  { name: "KIWI", label: "KIWI", slug: "kiwi", bg: "#50b848", fg: "#111111" },
  { name: "MENY", label: "MENY", slug: "meny", bg: "#da1f3d", fg: "#ffffff" },
  { name: "SPAR", label: "SPAR", slug: "spar", bg: "#dc1e21", fg: "#ffffff" },
  { name: "Joker", label: "Joker", slug: "joker", bg: "#008c58", fg: "#ffe600" },
  { name: "Extra", label: "Extra", slug: "extra", bg: "#ffd400", fg: "#c8102e" },
  { name: "Coop Mega", label: "Coop Mega", slug: "coop-mega", bg: "#2f5d2a", fg: "#ffffff" },
  { name: "Coop Prix", label: "Coop Prix", slug: "coop-prix", bg: "#ffcc00", fg: "#00468c" },
  { name: "Obs", label: "Obs", slug: "obs", bg: "#004993", fg: "#ffffff" },
  { name: "Coop Marked", label: "Coop Marked", slug: "coop-marked", bg: "#da0b16", fg: "#ffffff" },
  { name: "Bunnpris", label: "Bunnpris", slug: "bunnpris", bg: "#fff200", fg: "#111111" },
  { name: "Nærbutikken", label: "Nærbutikken", slug: "naerbutikken", bg: "#e9e9ed", fg: "#c8102e" },
  { name: "Matkroken", label: "Matkroken", slug: "matkroken", bg: "#c8102e", fg: "#ffffff" },
  { name: "Europris", label: "Europris", slug: "europris", bg: "#00693e", fg: "#ffffff" },
  { name: "oda", label: "Oda", slug: "oda", bg: "#f4511e", fg: "#ffffff" },
];

export const GROCERY_CHAINS = GROCERY_CHAIN_LIST.map((chain) => chain.name);

export function getGroceryChain(name: string): GroceryChain | undefined {
  return GROCERY_CHAIN_LIST.find((chain) => chain.name === name);
}
