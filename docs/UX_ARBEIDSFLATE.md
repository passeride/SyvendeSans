# SyvendeSans – UX-skisse for arbeidsflaten

**Status** · Forslag basert på prototypen i PR #2 og sammenligning med Obsidian.

## Hva vi tar med videre

Dagens prototype åpner et ekte vault og gir oss en fungerende Markdown-editor. I skjermbildet konkurrerer tilkoblingsstatus, full filsti og lagreknapp om plassen over notatet. Filoversikten viser hele stien på hver rad, slik at det er tungt å se hvilke notater som hører sammen. Linjenummer og kontrasterende editorfelt trekker oppmerksomheten vekk fra teksten. Koden setter hele arbeidsflaten i ventemodus under GitHub-kall, også når nettverksoppgaven gjelder én fil.

Fra Obsidian tar vi med oss arbeidsmåten: mapper du kan orientere deg i, faner som bevarer kontekst, og tastatursøk som lar deg hoppe mellom notater og handlinger. SyvendeSans får en egen visuell utforming med en lys eller mørk nøytral flate, grønn aksent for aktiv fane og synktilstand, og tydelig typografi. Bruk vanlig proporsjonal skrift i notatteksten som standard og monospace i kode. Linjenummer kan slås på i kildevisningen.

## Desktop og web

| Venstre side | Arbeidsflate |
|---|---|
| **Vaultnavn ▾** · skjul sidepanel | **Finn notat** · **Kommandoer** · synkstatus |
| **Filer** · **Nylig** | **Conditional entropy ×** · A priori × · Logarithms × · **+** |
| ▾ Studiet → ▾ Crypto → Conditional entropy | Studiet / Crypto |
| ▸ Prosjekt · ▸ Innboks | **Conditional entropy** · Rediger / Les |
| **Innstillinger** | Notattekst i en lesbar kolonne som kan utvides for tabeller, kode og formler |

- **Sidepanelet** viser et innrykket mappetre. Rader bruker korte navn og får full sti som verktøytips ved tvetydighet. Aktivt notat vises i treet. Brukeren kan skjule, vise og justere bredden på panelet. Nylig-listen gir et sted å ta opp tråden når man gjenåpner vaultet.
- **Faner** viser notatnavn og bare nødvendig mappesti ved like navn. Velg en fil for å åpne den eller ta fokus til en eksisterende fane. Lenker bruker aktiv fane som standard, med et valg for ny fane. Fanebytte bevarer markør, rulleposisjon, undo og lesemodus. Lukkede faner med ulagrede endringer beholder et lokalt utkast. Gjenåpning gjenoppretter fanene på samme enhet.
- **Hurtigåpner** søker lokalt etter notatnavn og sti. Åpner med nylige notater før første tastetrykk. Piltaster og Enter åpner valgt notat, modifisert Enter åpner det i en ny fane. Treffer med samme navn viser mappesti.
- **Kommandopalett** søker i handlinger og viser snarveiene. Første sett er Nytt notat, Åpne hurtig, Vis/skjul filer, Bytt lesemodus, Synk nå, Bytt vault og Innstillinger. Festede kommandoer ligger øverst. Kommandoregisteret brukes også av meny og tastatursnarveier. Native klienter får Ctrl+P og Ctrl+O. På web skal synlige knapper alltid fungere, og appen må ha konfigurerbare snarveier som kan brukes sammen med nettleserens egne kommandoer.
- **Synkstatus** ligger rolig øverst. Vis «Lagret på enheten», «Synker», «Synket», «Frakoblet» eller «Trenger oppmerksomhet». Klikk gir detaljer og relevant handling. En konflikt åpner sammenligning og beholder utkastet. Før lokal utkastlagring er implementert, skal UI-et bare vise lagringsstatus som faktisk kan bekreftes.

## Android og smal web

| Område | Innhold |
|---|---|
| Topp | **Filer** · notattittel · synkstatus |
| Midt | Notatet bruker hele bredden. Rediger / Les ligger i notatmenyen. |
| Navigasjon | **Finn** · **Nytt** · **Faner (3)** · **Kommandoer** |

Filer åpner et panel over notatet. Fanetelleren åpner en liste med notattittel og mappe. Hurtigåpner og palett får et eget panel med stort søkefelt og tastaturfokus. Under skriving skal verken panelet eller navigasjonen dekke markøren. Nytt notat setter fokus i editoren slik at systemdiktering kan brukes direkte. Alt som kan gjøres med en gest har også en synlig knapp.

## Minne, innlogging og vault-innstillinger

| Data | Hvor det lever | Oppførsel |
|---|---|---|
| GitHub-/synktoken på Windows, Linux og Android | Windows Credential Manager, Linux Secret Service eller Android-lagring kryptert med nøkkel beskyttet av Keystore | «Husk på denne enheten» gjør at siste vault åpnes igjen. Hvis sikkert lager er utilgjengelig, tilbys øktinnlogging. «Glem denne enheten» sletter appens lagrede legitimasjon. |
| Vedvarende webinnlogging | Pålitelig statisk frontend sammen med en liten innloggingstjeneste på samme origin. Tjenesten holder GitHub-legitimasjon og gir nettleseren en Secure, HttpOnly-øktcookie. | GitHub App for vanlig innlogging og kortlivede tilgangstoken. Brukerspesifikke økter, beskyttelse av skriv mot CSRF og eksplisitt utlogging. Standalone Pages med manuelt token bruker fortsatt øktminne. |
| Appinnstillinger som skal følge vaultet | `.syvende-sans/settings.json` | Versjonert skjema for tema, editorvalg, standardmodus, snarveier, innboksmappe og festede kommandoer. Følger valgt vault og gren. |
| Appens skjermoppsett | `.syvende-sans/layout.json` | Delte valg som standard sidepanelvisning og normal eller bred tekstkolonne. Mobil kan tilpasse visningen til skjermbredden. |
| Siste vaultforbindelse, åpne faner, markør og scroll, cache og utkast | Enhetslokalt, per konto, vault og gren | Dette er gjenoppretting av en økt og teknisk tilstand. En telefon skal kunne fortsette der den slapp mens desktop har en annen faneliste. |

Token må holdes utenfor WebView på native der det er praktisk mulig, i et smalt GitHub-grensesnitt som bare utfører vault-operasjoner. Hold token, responslogger og privat notatinnhold utenfor telemetri. Bufret innhold skal holde seg til riktig profil og vault. «Glem denne enheten» gir et eksplisitt valg om å fjerne lokale kopier, med tydelig varsel om usynkede utkast. Hvis GitHub-tilgangen utløper, behold utkast og vis «Koble til på nytt» uten å avbryte skrivingen.

Bruk rask lokal lesing og skriv endrede vault-innstillinger samlet i bakgrunnen. For GitHub brukes filens basis-SHA. Flett uavhengige felt ved samtidige endringer, og behold begge verdier til brukeren kan velge hvis samme felt kolliderer. I et skrivebeskyttet vault kan innstillingene leses, og appen viser hvorfor endringer ikke kan lagres dit. Hvis mappen mangler, bruk standardverdier og opprett den ved første bekreftede innstillingsendring. Støtt ukjente felter uten å overskrive dem. Filtreet filtrerer ut konfigurasjonsmappen.

## Ytelseskrav før utgivelse

| Handling | Foreslått godkjenningsmål |
|---|---|
| Åpne palett eller bytte mellom varme faner | p95 ≤ 50 ms fra input til synlig resultat |
| Lokalt notatsøk ved 10 000 stier | p95 ≤ 100 ms fra tastetrykk til oppdaterte treff |
| Åpne et bufret notat | p95 ≤ 150 ms fra valg til redigerbar tekst |
| Varm oppstart med lagret vault | p95 ≤ 1 s til brukbart skall med bufret navigasjon |
| Skrive i et åpent notat under synk | p95 ≤ 50 ms fra tastetrykk til synlig tekst i et notat på 100 KB |

Mål i produksjonsbygg på Windows, Linux, vanlig nettleser og fysisk Android, med kald og varm cache, og både normalt og begrenset nett. Logg klienttid og ventetid på GitHub hver for seg. Test med 10 000 og 50 000 filstier. Budsjettene er mål for neste iterasjon.

Vis skallet, siste arbeidsflate og bufret mappetre før venting på nett. Bytt fra global `busy` til operasjonsstatus per notat eller vault. Bruk én aktiv CodeMirror-visning og behold tilstanden for åpne faner med kontrollert cache. Render bare den synlige delen av mappetreet, bygg søkeindeksen én gang per endret filoversikt og flytt tyngre jobb av UI-tråden ved behov. Last forhåndsvisning av Markdown ved bruk. Ved rask navigering skal gamle nettverkssvar ignoreres hvis brukeren har valgt en annen fane.

## Rekkefølge og brukertest

1. Bygg arbeidsflate, filtrerbart mappetre, faner og paletter over dagens GitHub-klient. Lever lokal øktgjenoppretting, utkast per fane og responsiv status før automatisk synk.
2. Legg til native tokenminne og versjonerte vault-innstillinger. Test ugyldig tilgang, skrivebeskyttet vault og samtidige settings-endringer.
3. Legg til varig webinnlogging og synkkø. Test på tregt nett og med endringer fra to klienter. Bruk samme notatlayout på alle plattformer.

**Godkjenn arbeidsflyten** ved å starte appen på nytt og finne igjen samme notat uten å lime inn token, åpne to notater med samme navn, bytte fane midt i en redigering, opprette et diktert notat på Android og fortsette å navigere under langt GitHub-kall. Ingen av disse oppgavene skal medføre tap av tekst eller fokus. Endre tema på desktop og sjekk at det kommer frem på Android etter synk.

## Referanser

- [SyvendeSans-prototypen](https://github.com/passeride/SyvendeSans/pull/2)
- [Obsidian – faner](https://obsidian.md/help/tabs)
- [Obsidian – sidepaneler](https://obsidian.md/help/sidebar)
- [Obsidian – kommandopalett](https://obsidian.md/help/plugins/command-palette)
- [Obsidian – hurtigåpner](https://obsidian.md/help/plugins/quick-switcher)
- [GitHub App – anbefalt tokenhåndtering](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app)
