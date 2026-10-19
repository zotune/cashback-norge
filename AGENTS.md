# Arbeidsregler for Cashback Norge

Disse instruksjonene gjelder hele repoet. Les relevante eksisterende providere,
delte funksjoner og workflow-filer før du endrer crawler eller tilbudsvisning.

## Crawling og datakilder

- Bruk **Crawlee** for nye butikk- og tilbudscrawlere, også når dataene er JSON.
  Følg repoets mønster med `HttpCrawler` eller `CheerioCrawler`, `Configuration`
  og `MemoryStorage({ persistStorage: false })`. Ikke lag en separat løsning med
  vanlig `fetch` som erstatning for crawleren.
- Se først etter et offentlig API eller strukturerte data. JSON innebygd i en
  offentlig JavaScript-fil kan leses uten å kjøre tredjepartskode. Finn gjeldende
  fil fra nettsiden; ikke hardkod filnavn med deploy-hash.
- Bruk avgrenset kø, tidsavbrudd og automatiske forsøk. For en liten kilde er
  `maxConcurrency: 1`, `maxRequestRetries: 2` og 30 sekunders tidsavbrudd et
  passende utgangspunkt. Begrens antall sider og følg bare relevante lenker.
- Behold sertifikatkontroll. Undersøk transportfeil og bruk eksisterende
  Crawlee-mønstre fremfor å skru av TLS-verifisering.
- Feilmeldinger må identifisere kilde, forespørsel og konkret feil. Ikke skjul
  årsaken bak bare `fetch failed`. Ikke logg hemmeligheter eller proxy-nøkler.
- Koble kilden til `collectProviderOffers` og eksisterende CLI-konfigurasjon.
  Følg det delte fallback-mønsteret med maksimalt 14 dager gamle data og behold
  opprinnelig `updatedAt` når tidligere tilbud gjenbrukes.

## Domener, rabatter og felles funksjoner

- Bruk eksisterende funksjoner i `src/shared/reward.ts`,
  `src/shared/reward-calculation.ts` og `src/shared/cashback.ts`. Ikke lag egne
  prosentberegninger, formateringsregler eller parallelle tilbudsskjemaer for
  en ny provider.
- Bruk samme tilbudsdata og beregningsregler i nettsiden, extensionen og
  userscriptet. Nye felter må valideres av det delte skjemaet og være med hele
  veien gjennom indeksen og meldingene til extensionen.
- Skill rabattbeløp fra minstekjøp, ordinær pris, poengsaldo og produktmengde.
  Hent selve fordelen før tall fra beskrivelsen.
- Respekter minstekjøp og forskjellen mellom «over» og «minst». En rabatt på én
  vare eller den dyreste varen må ikke beregnes fra summen av hele handlekurven.
- Gratisvarer følger eksisterende standard `0 kr totalsum`. Ikke finn på en
  kroneverdi for en gave, regn «2 for 1» som rabatt på hele handlekurven eller
  presenter en bursdagsgave som cashback.
- Bruk verifiserte domenekoblinger i `data/provider-overrides.json` og de delte
  funksjonene for domenenormalisering og oppslag. Eksplisitte koblinger går foran
  tvetydige treff. Logo-CDN-er, annonselenker og sporingsdomener er ikke bevis på
  butikkens domene. Butikker uten kjent domene kan vises på nettsiden uten å
  utløse varsler på tilfeldige nettsteder.

## Chips og tooltips

- Legg navn, farger og standardtips i `src/shared/provider-data.ts`, og send
  metadataene med indeksen slik eksisterende klienter kan vise nye providere.
  Følg `src/shared/UI.md` og de delte UI- og temafunksjonene.
- For `gratisbursdag`: chipen heter **Gratis bursdag**, med lilla bakgrunn
  (`#7c3aed`) og hvit tekst (`#ffffff`).
- Hent all nyttig offentlig informasjon til tooltipen: konkret gave/rabatt,
  beskrivelse, medlemskap/app, registrert fødselsdato, gyldighet, minstekjøp,
  unntak, engangsbruk, brukssted og om tilbudet gjelder fysisk butikk eller nett.
- Ta med kilde og kildens bekreftelsesstatus. Ikke presenter en ubekreftet
  oppføring som verifisert av Cashback Norge, og ikke finn på personlige koder.
- Kontroller mobil og desktop: riktig farge, lesbar tekst og en tooltip som
  holder seg innenfor skjermen. Kontroller også visningen i selve extensionen.

## Verifisering og GitHub Actions

- En lokal live-test er ikke tilstrekkelig bevis på at crawleren virker i
  GitHub Actions. Sammenlign faktisk Node-versjon og transport ved forskjeller.
  Test relevante feil, som brutt forbindelse og forsøk på nytt.
- Kjør relevante tester, typekontroll og nødvendige bygg. Bruk blant annet
  `pnpm run test:backend`, `pnpm run check` og `pnpm run build:backend` ved
  crawlerendringer. Bygg berørte klienter når data eller klientkode endres.
- **En grønn Daily crawl betyr ikke at alle kilder lyktes.**
  `collectProviderOffers` kan utelate en kilde og fortsatt la jobben lykkes.
  Les loggen for den aktuelle provideren, sjekk antall tilbud og kontroller den
  publiserte `cashback-index.json` før du sier at integrasjonen er live og virker.
  Skill forventede feil i negative tester fra feil i selve crawl-steget.
- Når brukeren har bedt om push og Daily crawl: push rettingen, start
  `.github/workflows/crawl.yml` på `main`, bekreft riktig `headSha`, og følg opp
  providerresultatet. Rapporter konkret dersom kilden fortsatt feiler.
- En butikk som finnes i den publiserte indeksen må også testes med en eldre
  innebygd indeks og cache i extensionen. Omstart må beholde nyere data, hente
  oppdateringer og varsle åpne faner. En test bare med en fersk lokal indeks
  avdekker ikke feil i oppdateringen hos eksisterende brukere.

## Git og genererte data

- Repoets `.git/hooks/pre-commit` **forbyr `cashback-index.json` i manuelle
  commits**. Ikke stage den med `--force` og ikke omgå hooken. Daily crawl
  oppdaterer og committer indeksen selv. Lokale forhåndsvisninger kan beholdes.
- Hent siste `main` før push. Bevar ferske data fra automatiske crawl-commits
  og eventuelle brukerendringer; ikke erstatt dem med en eldre lokal indeks.
- Mellomlagring eller backup må være avgrenset til egne endringer. Rydd bare
  opp midlertidige stasher du selv har opprettet og identifisert.
- Daily crawl committer og pusher fra committen den startet på. Unngå en ny
  push til `main` midt i kjøringen som gjør denne pushen ugyldig. Vent med
  dokumentasjonsendringer til kjøringen er ferdig. En nødvendig ny retting kan
  kreve at den gamle kjøringen erstattes med en ny.
