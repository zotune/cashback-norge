# Chrome Web Store screenshots

Upload these two files under **Screenshots**, in this order:

1. `cashback-1280x800.png` — the current extension on KICKS, with the quokka logo and four feature icons.
2. `prismatch-1280x800.png` — the current price comparison view with Prisjakt, Klarna and Prisradar.

Both exports are **1280 × 800, 24-bit RGB PNG, without alpha**. The 128 px store listing icon is separate: `src/extension/public/icons/store_icon_128.png` from the repository root.

`layout.html` is the editable composition. Open it directly in a browser for the main image, or append `?variant=prismatch` for the second image. Capture the viewport at exactly 1280 × 800 with a device scale factor of 1 and an opaque background.

The source panel images were captured from the existing `renderNotice()` implementation in `src/extension/content.ts`, using its own offer sorting and light theme. No extension styles or displayed rewards were rewritten for the screenshots. The main image shows expanded extra cashback; the price image shows that section collapsed.

Captured on 2026-10-11 from the daily index generated at `2026-10-11T13:13:01.149Z`. The Sony WH-1000XM6 price results were fetched through the shared `findPriceMatches()` implementation at `2026-10-11T13:29:40.590Z`. These are examples from that capture, not continuously updated image content.

The KICKS product background was captured from its public Dior Dune product page, then softened within the HTML composition. Store favicons and the approved quokka asset are used unchanged.
