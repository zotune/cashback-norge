# Reels for cashbacknorge.no

Elleve vertikale videoer (1080×1920, 30 fps, 15–23 s) med norsk voiceover, karaoke-tekst og **ekte skjermbilder** fra cashbacknorge.no og userscriptet/utvidelsen, hentet 6. okt. 2026.

| Fil | Tema | Krok (første sekund) |
|---|---|---|
| `out/01-prismatch-mobil.mp4` | Prismatch på mobil (Elkjøp vs HomeIT) | «Samme mobil 📱 4 300 kr billigere? 👀» |
| `out/02-strom-bonus.mp4` | Strømbonus ved bytte | «Bytter du strøm ⚡ uten bonus? 😬» |
| `out/03-rabattkoder.mp4` | Rabattkoder + cashback + Sum-feltet (Lyko) | «Slutt å google rabattkode 🙄» |
| `out/04-iphone.mp4` | Montasje + oppsett på iPhone/Safari | «Har du denne på iPhonen? 📱👀» |
| `out/05-chrome-pc.mp4` | Chrome-utvidelsen på PC/Mac (Lyko vs Hair247) | «Handler du på PC/Mac? 💻» |
| `out/06-matpriser.mp4` | Matpriser (Joker/SPAR mot REMA, Meny) | «Samme ost 🧀 69 kr billigere?» |
| `out/07-spill.mp4` | Spill: Epic mot Steam | «Samme spill 🎮 380 kr billigere?» |
| `out/09-hotell.mp4` | Hotell på FINN mot Skyscanner | «Samme hotell 🏨 487 kr billigere?» |
| `out/10-mobil-bonus.mp4` | Mobilbonus (Talkmore/Trumf, frist 13. okt.) | «Bytt mobilabonnement 📱 få 1 500 kr?» |
| `out/11-medlemsfordeler.mp4` | Fagforening/medlemspriser (SATS) | «Medlem i fagforening? 🤝» |
| `out/12-rabattkoder-community.mp4` | Stem på koder og del egne | «Rabattkoden funket ikke… igjen? 😤» |

Hver video finnes også som `*-uten-musikk.mp4`. Bruk den hvis du vil legge på trendende lyd fra Instagram-biblioteket (gir ofte mer rekkevidde). Sett musikken til ca. 10–15 % volum.

## Hva som ikke ligger i git

Ferdige videoer (`out/`), skjermbilder (`shots/`, `videos/*/assets/`) og byggfiler er holdt utenfor repoet.

- Skjermbildene viser tredjeparts nettsider med produktbilder, logoer og priser, og repoet er offentlig.
- Mp4-filene ville gjort git-historikken stor for alltid.

Ta backup av `out/` og `videos/*/assets/` et annet sted, for eksempel Google Drive. Uten `assets/` kan videoene ikke rendres på nytt fra en fersk klone, men nye skjermbilder kan tas med skriptene under.

## Oppsett

```bash
cd marketing/reels
npm install && npx playwright install chromium
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

## Lage flere / endre

```bash
.venv/bin/python tts.py videos/<navn>          # stemme + ord-timing (Microsoft nb-NO-PernilleNeural via edge-tts)
node render.mjs <navn> --still 0,5,10          # raske stillbilder til kontroll (build/<navn>/still-*.png)
node render.mjs <navn>                         # full mp4 til out/
```

- Manus står i `videos/<navn>/script.json`. `{vist|uttalt}` viser én tekst og uttaler en annen, f.eks. `{13 490 kr|tretten tusen fire hundre og nitti kroner}`. `*ord*` markerer ord som får grønn uthevingsfarge.
- Animasjonen står i `videos/<navn>/scene.js` (GSAP). Felles komponenter ligger i `shared/reel.js` og `shared/reel.css`: kamerazoom, ringer, trykk, stickers, sluttkort og karaoke-tekst.
- Nye skjermbilder:
  - `overlay.mjs <url> <out.png> <ventetid-ms>` setter inn userscriptet på en ekte butikkside.
  - `lyko.mjs` og `desktop.mjs` fanger Sum-felt, «Kopiert!»-tilstand og desktop.
  - `sitefull.mjs <søk>` fanger søk på cashbacknorge.no.
  - `overlay-food.mjs`, `overlay-hotels.mjs`, `overlay-flights.mjs` og `games-capture.mjs` er varianter for mat, hotell, fly og spill. `overlay-flights.mjs` har den mest komplette GM-shimmen (cookies, headere, timeout).
  - `lyko-codes.mjs` fanger stemming og innsending av rabattkoder med Supabase-kallene stubbet, så ingenting lagres.
  - Fly (08) mangler: sas.no gir blank side i automatisert nettleser.
- Kontroller stemmen med `.venv/bin/python stt.py build/<navn>/voice.wav` (Whisper-transkripsjon).

**Priser og bonuser er øyeblikksbilder fra 6. okt. 2026.** Publiser snart, eller ta nye skjermbilder og render på nytt. Ta vare på skjermbildene i `shots/` som dokumentasjon. Markedsføringsloven § 3 krever at påstander kan dokumenteres.

## Tekster til Instagram

Ligger som `.txt` ved siden av hver video i `out/`. Hver fil har bildetekst, en første kommentar å pinne og en alternativ første linje til A/B-test.

## Hva som får folk til å trykke – og hvordan det er brukt her

| Funn (kilde) | Slik er det brukt |
|---|---|
| Hovedbudskapet bør komme i løpet av 3 s. Over 63 % av TikToks annonser med høyest CTR gjør det ([TikTok](https://ads.tiktok.com/help/article/creative-best-practices)). Nysgjerrighets- og problemoverskrifter får rundt 9–10 % CTR, mot 2 % for «spar X %» ([Realize/Taboola](https://realize.com/marketing-hub/realize-data-cyber-5-ad-copy/)). | Sticker med konkret kr-beløp eller spørsmål vises allerede i første bilde, og første bilde fungerer også som cover. |
| Ekte skjerm og UGC-stil slår polert grafikk. Liftoff målte +152 % installasjonskonvertering. AppsFlyer fant at tutorials gir +45 % IPM ([Liftoff](https://itbrief.com.au/story/ugc-interactive-ads-drive-major-gains-for-mobile-app-installs), [AppsFlyer](https://www.appsflyer.com/company/newsroom/pr/ai-emotion-creative-trends/)). | Bare ekte skjermbilder. Grafikk brukes kun til kr-tall og CTA. Video 4 og 5 er tutorials. |
| Å bryte safe zone kostet 39 % CTR ([Meta](https://developers.facebook.com/blog/post/2024/11/07/unlock-the-power-of-reel-ads/)). Over 75 % ser med lyd, men tekst trengs fortsatt. | Tekst holdes mellom ca. y 290 og 1330. Karaoke-teksten følger stemmen ord for ord. |
| AI-stemme presterte likt med menneskestemme i WPP-studien, men 58 % sier de ville stolt mindre på merkevaren ([WPP](https://www.wppmedia.com/news/ai-voices-audio-ads), [Adobe](https://www.adobe.com/express/learn/blog/ai-audio-consumer-trust)). | Microsoft-stemme på norsk, ca. 3 ord/s. A/B-test gjerne mot din egen stemme. |
| Instagram tillater maks 5 hashtags (des. 2025). Bare 55–125 tegn vises før «mer». | 5 hashtags, og krok + søkeord står først i teksten. |
| Lenke i bio konverterer 5–10 %, kommentar-til-DM 15–30 % (leverandørtall). | Neste steg: «Kommenter SPAR, så sender vi lenken» med ManyChat eller lignende. |

**Juss:**
- Ingen alkohol eller Vinmonopolet, heller ikke i bakgrunnen. Alkoholloven § 9-2 forbyr det for kommersielle aktører, og Helsedirektoratet gir overtredelsesgebyr.
- Prisene er datert, og strømvideoen har med påslag/vilkår og «inneholder annonselenker».
- Egen profil som markedsfører eget produkt trenger normalt ikke «Reklame»-merking. Betalte creator-videoer og partnerinnhold må merkes i selve videoen.

## Testplan

1. **Lenke i bio:** `https://cashbacknorge.no/?utm_campaign=ig-bio`. GoatCounter på siden viser kampanjen.
2. **Én video per lenke:** Legg ut én video om gangen, 3–4 per uke. Del hver i Story med lenke-sticker til `?utm_campaign=ig-01-prismatch` osv., så du ser hvilken video som gir klikk.
3. **Les Insights etter 48 t:**
   - **Hook rate** (3 s-visninger / visninger): mål > 30 %.
   - **Hold** (15 s / 3 s): mål > 25 %.
   - **Delinger per rekkevidde:** Instagrams sterkeste signal for nye seere.
4. **Test kroker:** Lag 2–3 kroker per vinner. Bytt bare `hook`-linja i `script.json` og stickeren, og render på nytt (ca. 30 s per video).
5. **Sesong:** Black Friday (27. nov.) – «Sjekk om tilbudet faktisk er billigst» med prismatch passer perfekt.
