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
2. Åpne **Safari** på en nettside → trykk på **sidemenyen** ved adressefeltet (**aA** på eldre iOS) → **Administrer utvidelser / Manage Extensions** → skru på **Stay** → **Ferdig / Done**
3. Åpne **Stay-appen** → **Settings** nederst til høyre → skru på **Silent Userscript Update** under **General**
4. I **Stay-appen** → **Userscripts** nederst til venstre → **+** øverst til høyre → **Link** → lim inn lenken og trykk **Continue**:
   ```
   https://cashbacknorge.no/cashback-varsler.user.js
   ```
5. Åpne **Safari** igjen → sidemenyen → **Stay** → **Tillat alltid… / Always Allow…** → **Tillat alltid på alle nettsteder / Always Allow on Every Website**. Gå videre hvis dette allerede er gjort i Stay sin egen guide.
6. Besøk en butikk fra oversikten i **Safari** — Cashback Norge dukker opp nederst til venstre på skjermen.

Se den [visuelle guiden med animasjoner](https://cashbacknorge.no/iphone/). Menynavnene i Stay er på engelsk; Safari følger språket på enheten.

## Android (Firefox)

Chrome på Android støtter ikke Chrome Web Store-utvidelser. Automatiske varsler på Android krever en nettleser som støtter userscripts, som Firefox.

1. Installer [Firefox](https://play.google.com/store/apps/details?id=org.mozilla.firefox) og åpne [Android-guiden](https://cashbacknorge.no/android/) i Firefox.
2. Legg til [Tampermonkey](https://addons.mozilla.org/android/addon/tampermonkey/) i Firefox.
3. Åpne [Cashback Norge-scriptet](https://cashbacknorge.no/cashback-varsler.user.js) i Firefox og trykk **Installer / Install**.
4. Automatiske oppdateringer er på som standard i Tampermonkey 5.5: **Settings → Script Update → Check Interval: Every Day**, **Automatic installation** på. Scriptet har både `@updateURL`, `@downloadURL` og en versjon som oppdateres ved bygging.
5. Besøk en nettbutikk i Firefox. Firefox kan også settes som standardnettleser; varslene kjører fortsatt bare i nettleseren der scriptet er installert.

Oppsettet er kontrollert mot [Mozilla](https://support.mozilla.org/en-US/kb/find-and-install-add-ons-firefox-android), [Tampermonkeys installasjonsguide](https://www.tampermonkey.net/faq.php?q=Q102) og den offisielle Tampermonkey 5.5-pakken fra Mozilla Add-ons. Installasjonsguidene har ikke butikkindeksen og deler en lett karusell.

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
