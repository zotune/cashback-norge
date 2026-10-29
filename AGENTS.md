# Arbeidsregler for Cashback Norge

Disse instruksjonene gjelder hele repoet. Les relevante eksisterende providere,
delte funksjoner og workflow-filer før du endrer crawler, prismatch eller
tilbudsvisning.

## Finn riktig integrasjon og felles kode

- Butikkfordeler, cashback og rabattkoder hører hjemme i
  `src/backend/providers/`, bruker `CashbackOffer` fra `src/shared/cashback.ts`
  og samles via `collectProviderOffers` i `src/backend/provider-offers.ts`.
  Koble nye providere til `src/backend/index.ts`, CLI-valg, metadata og indeksen.
- Produktsammenligning hører hjemme i `src/shared/<kilde>-price-match.ts` og
  kobles til `findPriceMatches` i `src/shared/price-match.ts`. Bruk
  `GetPriceMatchForProductMessage`, `PriceMatchOffer` og `PriceMatchAlternative`
  fra `src/shared/extension-messages.ts`. Produktpriser skal ikke legges inn
  som butikkcashback i den daglige indeksen.
- Les en tilsvarende kilde og følg dataene helt til klienten før du endrer noe.
  `src/extension/content.ts` har produktmetadata, panel og runtime-validering;
  `src/extension/background.ts` håndterer extensionens prismatch-forespørsler.
  Userscriptet bruker også den delte prismatch-koden.
- Hold kildeadaptere små: de skal hente og oversette kildens data. Felles
  prisparsing, produktmatching, rabattberegning og formatering skal ligge i
  `src/shared/`, ikke kopieres mellom providere eller klienter. Hvis nødvendig
  logikk bare finnes lokalt i én kilde eller i `content.ts`, trekk den ut til
  en delt funksjon og bruk den begge steder når en ny kilde trenger den.

## Crawling og datakilder

- Bruk **Crawlee** for nye butikk- og tilbudscrawlere, også når dataene er JSON.
  Følg repoets mønster med `HttpCrawler` eller `CheerioCrawler`, `Configuration`
  og `MemoryStorage({ persistStorage: false })`. Ikke lag en separat løsning med
  vanlig `fetch` som erstatning for crawleren.
- Foretrekk et tilgjengelig API fremfor HTML-skraping. Undersøk dokumenterte
  API-er og nettsidens offentlige JSON-/GraphQL-kall først, deretter JSON-LD
  og innebygde sidedata. Bruk HTML/DOM som fallback når de strukturerte kildene
  ikke dekker behovet. Verifiser faktiske svar for søk, pris, lager og frakt;
  ikke anta at et endepunkt finnes ut fra URL-navnet. Noter valgt kilde og
  eventuelle begrensninger i adapteren.
- JSON innebygd i en offentlig JavaScript-fil kan leses uten å kjøre
  tredjepartskode. Finn gjeldende fil fra nettsiden; ikke hardkod filnavn med
  deploy-hash. Bruk eksisterende autorisert API-konfigurasjon der den finnes,
  og hold private API-nøkler og tokens i miljøvariabler på backend, utenfor
  klientbunter og logger.
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
- Crawlee-kravet gjelder backend-crawlere. Prismatch som hentes ved visning i
  nettleseren skal følge de eksisterende adapterne med injiserbare
  `requestJson`/`requestText`-funksjoner og klientens transport. Ikke trekk
  Crawlee eller Node-avhengigheter inn i extensionen eller userscriptet.
  Begrens også disse oppslagene med tidsavbrudd og et endelig antall kandidater,
  sider og eventuelle forsøk; respekter kildens ratebegrensninger.

## Felles prisuthenting og normalisering

- Bruk strukturerte prisfelter for det aktuelle produktet og valgt variant
  før fritekst. Gjenbruk produktmetadata fra `extractProductPageMeta` i
  `src/extension/content.ts` fremfor en egen produkthøster for hver priskilde.
  En nødvendig forbedring skal gjelde alle relevante kilder.
- Gjenbruk eksisterende pris- og tallfunksjoner. Mangler en egnet delt parser,
  trekk ut eller lag én i `src/shared/` med tester før flere adaptere bruker
  den. Kildespesifikk felttolkning blir i adapteren. Ikke lag nye kopier av
  generelle pris-regexer, prosentregning eller kroneformatering.
- Produktmetadata skal velge en navngitt Product-oppføring. En navnløs
  Product-blokk fra et anmeldelseswidget må ikke overta for selve produktet
  ved oppdatering. Bruk de delte JSON-LD-/Next-funksjonene i
  `src/shared/product-data.ts` fremfor egne script-dekodere.
- Behold numerisk beløp og eksplisitt valuta gjennom beregning og sortering;
  formater først for visning. Håndter desimalkomma, tusenskilletegn, harde
  mellomrom og beløp i øre ut fra kildens faktiske format og enhet. Ikke gjett
  valuta eller del et beløp på 100 uten grunnlag i kilden.
- Skill gjeldende varepris fra førpris, historisk laveste pris, månedsbeløp,
  enhetspris, minstekjøp og rabattbeløp. Et aggregert «fra»-beløp er ikke bevis
  på et kjøpbart tilbud for valgt variant; kontroller butikkens konkrete tilbud.
- Skill varepris, frakt og totalsum. Legg bare til kjent frakt én gang, og
  vis tydelig når frakt er ukjent. Ukjent frakt er ikke gratis frakt. Bruk
  `shippingPrice`, `totalPrice` og `sortAmount` etter den delte datamodellen;
  bruk samme prisgrunnlag i sammenligning, sortering og eventuell besparelse.
- Manglende, ugyldige eller ikke-endelige beløp skal gi ukjent pris eller
  ingen match, aldri en oppdiktet nullpris. Godta null bare ved eksplisitt
  dokumentert gratispris. Sammenlign samme valuta; eventuell omregning bruker
  `src/shared/exchange-rates.ts` og må fremgå som omregnet/omtrentlig pris.

## Domener, rabatter og felles funksjoner

- Bruk eksisterende funksjoner i `src/shared/reward.ts`,
  `src/shared/reward-calculation.ts` og `src/shared/cashback.ts`. Ikke lag egne
  prosentberegninger, formateringsregler eller parallelle tilbudsskjemaer for
  en ny provider.
- Bruk blant annet `extractBenefitReward`, `extractPercentageReward`,
  `extractKrReward` og `extractExplicitTotalPriceReward` etter hva kilden
  faktisk tilbyr. Faste bonuser og rabattbeløp bruker
  `extractKrReward(..., { totalsum: false })`. `100 kr` i rabatt og
  `100 kr totalsum` som kunden betaler er ulike fordeler. Bruk de delte
  beregningsfunksjonene og `formatKr` ved visning.
- Bruk samme tilbudsdata og beregningsregler i nettsiden, extensionen og
  userscriptet. Nye felter må valideres av det delte skjemaet og være med hele
  veien gjennom indeksen og meldingene til extensionen.
- Skill rabattbeløp fra minstekjøp, ordinær pris, poengsaldo og produktmengde.
  Hent selve fordelen før tall fra beskrivelsen.
- Respekter minstekjøp og forskjellen mellom «over» og «minst». En rabatt på én
  vare eller den dyreste varen må ikke beregnes fra summen av hele handlekurven.
- Før slike vilkår videre med `rewardCalculation.minimumPurchaseNok`,
  `minimumPurchaseExclusive` og `singleItemOnly` etter den delte modellen.
  Behold prosentintervaller, «opptil» og medlems-/kategoribegrensninger i data
  og vilkår. Ikke bruk maksimumssatsen som en garantert rabatt eller trekk fra
  cashback, kuponger eller medlemsfordeler i en prismatch uten at vilkårene
  og muligheten for å kombinere fordelene er dokumentert og støttet i felles kode.
- Gratisvarer følger eksisterende standard `0 kr totalsum`. Ikke finn på en
  kroneverdi for en gave, regn «2 for 1» som rabatt på hele handlekurven eller
  presenter en bursdagsgave som cashback.
- Bruk verifiserte domenekoblinger i `data/provider-overrides.json` og de delte
  funksjonene for domenenormalisering og oppslag. Eksplisitte koblinger går foran
  tvetydige treff. Logo-CDN-er, annonselenker og sporingsdomener er ikke bevis på
  butikkens domene. Butikker uten kjent domene kan vises på nettsiden uten å
  utløse varsler på tilfeldige nettsteder.

## Nye prismatch-kilder

- Søk først med verifisert produkt-URL, GTIN/EAN eller MPN der kilden støtter
  det, deretter kontrollert tittelsøk. En intern butikk-/produkt-ID i en URL
  er ikke automatisk en EAN. Også kodetreff må kontrolleres mot produktet.
- Gjenbruk `src/shared/product-match.ts`, `src/shared/product-title-match.ts`
  og ved behov `src/shared/grocery-price-match-utils.ts`. Bruk felles anker,
  kandidatscoring og variantkontroller; ikke innfør løsere matching for å få
  flere treff. Modell, størrelse, mengde, farge, språk, utgave og tilstand må
  stemme der de skiller produktene. Utvid felles kontroller med tester når en
  ny kategori trenger flere variantfelter.
- Vis kjøpbare tilbud med verifisert lagerstatus. Utsolgte, historiske,
  forhåndsbestilte og brukte varer skal ikke blandes inn som ordinære tilbud
  på en ny vare på lager. Ukjent lagerstatus skal ikke gjøres om til «på lager».
- Sett `source`, `sourceName`, produktnavn, butikk, beløp, valuta og lenker fra
  verifiserte kildedata. Behold skillet mellom sammenligningens `productUrl`
  og butikkens `offerUrl`. Sett bare `matchedExactProduct` og
  `matchedCurrentMerchant` når oppslaget faktisk dokumenterer dette.
- Koble adapteren inn i den felles pipelinen og vurder alle kilde-/host-lister,
  kategorifiltre, variant- og plausibilitetskontroller og sortering. Oppdater
  både `PriceMatchOffer.source` i `src/shared/extension-messages.ts` og
  runtime-valideringen i `src/extension/content.ts`; en oppdatert TypeScript-type
  alene gjør ikke at klienten godtar en ny kilde. Én kildefeil må ikke stoppe
  andre kilder, og «ingen treff» må kunne skilles fra transport-/formatfeil
  under feilsøking.
- Legg nødvendige verter i `host_permissions` i
  `src/extension/public/manifest.json` og `@connect` i
  `vite.userscript.config.ts`. Test forespørslene via extensionens bakgrunn
  og userscriptets transport, ikke bare via Node. Hvis kildens egne
  produktsider skal støttes, oppdater også gjenkjenning og kilde-/host-lister
  i `content.ts` og `price-match.ts` uten å aktivere oppslag på alle listesider.
- Pokepris (`https://www.pokepris.no/`) er en prismatch-kilde for forseglede
  Pokémon TCG-produkter. Adapteren bruker JSON-LD og sidens offentlige
  `getProducts`-oppslag der transporten støtter det. Next-oppslaget returnerer
  HTTP 500 med extensionens transport; bruk de offentlige produkt-/settsidene
  med strukturerte data i extensionen. Oppdag gjeldende action-ID, settlenker
  og scriptfiler fra nettsiden; ikke hardkod deploy-hasher eller kjør
  tredjepartskode. Nye oppslag skal fortsatt
  undersøke tilgjengelige API-er og strukturerte data først.
  Bruk også den offentlige `seriesWithSets`-taksonomien: settsiden med
  SEO-lenker utelater enkelte japanske sett. Velg det konkrete settet foran
  serieprefikser som «Mega Evolution», og bruk avgrenset kategori-fallback.
  Kontroller sett, språk, produkttype (booster pack/box, ETB, bundle), antall
  pakker og eventuell gradering/tilstand før støtte for enkeltkort utvides.
  En booster pack og en booster box er ulike produkter. Når språk ikke er
  oppgitt på butikksiden, krev at dens konkrete produkt-URL finnes blant
  tilbudene før språkvarianten godtas. Behold variantparametere i URL-er.
  På Prisjakt kan språk også hentes fra tilbudene for den konkrete
  produkt-ID-en og sendes videre som `productLanguage`; blandede språk gir
  ukjent språk. Uten oppgitt språk skal en butikk-URL fra Pokepris bekreftes
  mot samme produkt-ID via Prisjakts eksisterende API før treffet godtas.
  På Klarna kan en gyldig EAN/GTIN fra de konkrete butikklenkene bekreftes
  mot sidens produkt-ID i Klarnas API. Det samme gjelder Godpris og Prisradar
  når deres faktiske kodeoppslag returnerer den konkrete produkt-ID-en/URL-en.
  Bruk også gyldige GTIN-er fra sidens strukturerte produktmetadata; UPC og
  EAN kan sammenlignes som GTIN-14 med ledende nuller. Et kodetreff må fortsatt
  avvises ved motstridende sett, språk eller pakning i titlene.
  En utsolgt butikklenke kan bekrefte
  identitet selv om prisen ikke skal vises. Ikke hardkod produkt-ID-er fra
  topplisten eller regresjonstestene i matcheren.
  Oppføringer merket `is_preorder` i sidedata skal utelates selv om JSON-LD
  bruker en generell InStock-status. Bruk den delte regelen i
  `src/shared/price-match-availability.ts` også for eksplisitte statuser i
  Klarna og Prisjakt. Bekreftet forhåndsbestilling fra én kilde kan utelukke
  samme produkt, butikk, beløp og valuta hos andre kilder som feilmerker lager;
  ikke fjern andre produkter eller priser på grunnlag av butikkens navn alene.
  Bruk konkrete tilbud på lager, ikke sidens historiske/utsolgte minimum eller
  generelle prisstatistikk.
- For Pokepris skal prismatch-raden åpne produktets konkrete prisliste på
  `https://www.pokepris.no/produkt/<id>`, ikke forsiden eller et generelt søk.
  Tooltipen skal vise produkt, språk/variant, butikker og priser på lager,
  samt kjent frakt/totalsum eller tydelig «frakt ukjent». Bruk eksisterende
  prismatch-tooltip og legg butikkprisene i `alternatives`. Butikkens
  direkte produktlenke beholdes separat i `offerUrl`.

## Chips og tooltips

- Legg navn, farger og standardtips i `src/shared/provider-data.ts`, og send
  metadataene med indeksen slik eksisterende klienter kan vise nye providere.
  Følg `src/shared/UI.md` og de delte UI- og temafunksjonene.
- For `gratisbursdag`: chipen heter **Gratis bursdag**, med lilla bakgrunn
  (`#7c3aed`) og hvit tekst (`#ffffff`).
- For `pokepris`: chipen heter **Pokepris**, med svart bakgrunn (`#000000`)
  og hvit tekst (`#ffffff`) i både lyst og mørkt tema. Bruk de delte metadataene
  også i prismatch-panelet og behold fargene med `preserveInDark`.
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
- Test kildeadaptere med representative JSON-/HTML-fixtures og injisert
  transport eller en lokal testserver. Dekk riktige treff, feil variant,
  utsolgt, manglende pris/valuta/frakt, endret svarformat og relevante feil
  som HTTP 429/5xx, tidsavbrudd og brutt forbindelse. Kontroller at forsøk og
  paginering stopper ved grensen, og at én kildefeil lar andre kilder virke.
  Dekk felles pris-/rabattlogikk med realistiske eksempler på prosentintervall,
  kronerabatt mot totalsum, gratisvare og grensen for minstekjøp.
- Ved prismatch-endringer: kjør `pnpm run test:backend`, `pnpm run check`,
  `pnpm run build:extension` og `pnpm run build:userscript`, samt andre berørte
  bygg. Verifiser treff og avviste feiltreff på reelle produktsider i bygget
  extension og userscript. `scripts/dev/test-price-match.mts` og
  `scripts/dev/e2e-product-match.mjs` kan brukes til feilsøking; de logger
  resultater og erstatter ikke tester med assertions. Kontroller også at
  vanlige produktsider og øvrige kilder fortsatt virker.
- Ved endringer i Pokepris-matching: bruk `scripts/dev/audit-pokepris.mts`
  til å kontrollere første Prisjakt-side for samlekortspill, og behold skillet
  mellom faktiske treff, avviste varianter, manglende data og transportfeil.
  `scripts/dev/e2e-pokepris.mjs` har assertions for Klarna, MaxGaming, Prisjakt,
  regresjonssiden, farger og tooltip på desktop/mobil. Rapporter konkret om
  en reell side blokkerer testnettleseren; en API-test beviser ikke at den
  blokkerte siden viser panelet. Topplisten er testutvalg, ikke en whitelist
  i produksjonskoden eller bevis på at alle kategorisider er kontrollert.
  `scripts/dev/audit-tcg-categories.mts` kontrollerer også Klarna (opptil 48
  produkter via offentlig paginering), Prisradar og Godpris (første listeside).
  Rapporter dekning separat for hver kilde. Gjenbruk snapshots ved iterasjon
  med `--reuse-snapshots`, og skill produktmetadata fra kategorien fra en
  verifisert produktside. `e2e-pokepris.mjs --categories` velger aktuelle
  Prisradar-/Godpris-regresjoner fra rapporten, uten ID-whitelist i matcheren.
- Godpris publiserer nå navngitt Product og konkrete butikktilbud som JSON-LD.
  Les disse før eldre Inertia-`data-page`, og bruk aldri bare AggregateOffer-
  minimum som kjøpbart tilbud. Prisradar-metadata og priser skal bruke samme
  komplette Next-produktoppføring for riktig URL; referanser og anbefalte
  produkter skal ikke overta. Gjenbruk `src/shared/product-data.ts` i klienten
  og adapteren for koder og metadata.
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
