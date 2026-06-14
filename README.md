# [Cashback Norge](https://cashbacknorge.no)

> **Source available, not open source**
>
> This repository is public for transparency and review only.
> You may not copy, modify, redistribute, publish, sell, or use the code
> without prior written permission from the copyright holder.
> See [LICENSE](./LICENSE).

Viser cashback-tilbud automatisk når du handler på nett i Norge.

## iPhone / iPad

1. Installer **[Stay for Safari](https://apps.apple.com/no/app/stay-for-safari/id1591620171)** fra App Store
2. Åpne **[Safari](https://apps.apple.com/no/app/safari/id1146562112)** → trykk **aA** i adressefeltet → **Manage Extensions** → skru på **Stay**
3. Åpne **[Stay-appen](https://apps.apple.com/no/app/stay-for-safari/id1591620171)** → **Settings** → skru på **Silent Userscript Update**
4. Åpne **[Stay-appen](https://apps.apple.com/no/app/stay-for-safari/id1591620171)** → **Userscript** → lim inn lenken og trykk **Continue**:
   ```
   https://cashbacknorge.no/cashback-varsler.user.js
   ```
5. Åpne **[Safari](https://apps.apple.com/no/app/safari/id1146562112)** igjen og besøk en av butikkene under — Cashback Norge dukker opp nede til venstre på skjermen

## Chrome / Firefox (desktop)

Last ned og installer extensionen manuelt fra `dist/extension/` etter bygging.

For Chrome Web Store:

```bash
pnpm run build:store
```

Kommandoen bygger extensionen og lager en opplastbar zip i `dist/` med versjonen fra `src/extension/public/manifest.json`.

## License

Source available for transparency. Not open source.

This repository is public so users can inspect the extension and report issues.
The code is not licensed for reuse, copying, redistribution, or commercial use.
See [LICENSE](LICENSE).

## Disclaimer on crawlers

The crawlers only extract publicly available information. No proprietary or copyrighted content from third parties is included in this repository. Offers requiring authentication/login are not shown. If a discount code is shown, it is because it is available without login.
