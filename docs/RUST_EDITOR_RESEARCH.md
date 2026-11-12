# Kartlegging: Rust Markdown-editorer, visere og gjenbruk for SyvendeSans

**Vurdert:** 12. november 2026  
**Status:** Teknisk evaluering av kildekode, dokumentasjon, manifest og vedlikeholdsaktivitet. **Ikke** en kompilert ytelsesbenchmark, mobiltest eller sikkerhetsrevisjon.  
**Beslutningsspørsmål:** Bør SyvendeSans forke en eksisterende editor, hente ut biblioteker, eller lage et nytt UI rundt en delt Rust-kjerne?

## Kort anbefaling

**Ikke fork en komplett desktop-app som første steg.** Det låser SyvendeSans til enten GPUI/desktop eller en stor React/Expo-struktur. **Lag et nytt, lite Rust-workspace og vurder særskilt gjenbruk av Scorias biblioteker**:

1. **`scoria-markdown`**: sterkeste kandidat til Obsidian-spesifikk parser, inklusive byte-spans, wikilenker og callouts.
2. **`scoria-text`**: tekstbuffer, seleksjoner, Unicode-graphemes, undo og redigeringskommandoer uavhengig av GPUI.
3. **`scoria-cache` / `scoria-vault`**: mulig gjenbruk av Obsidian-kompatibel linkoppløsning, metadata, filformat og sikker fil-I/O.
4. **`pulldown-cmark` og `comrak`**: referansealternativer som må benchmarkes, ikke avvises på forhånd.
5. **Dioxus 0.7 + CodeMirror 6** eller **Tauri 2 + CodeMirror 6**: mest pragmatisk for en *delt web/desktop/mobil editor*. Rust-kjernen eier innhold og sync. **egui/eframe** spikes hvis helt JS-fri UI prioriteres.
6. Egen **Axum + SQLite-revisjonert sync** bak system-Tailscale; ingen kandidat her leverer hele denne arkitekturen trygt og ferdig.

En **full Scoria-fork** er beste alternativ **hvis desktop-only blir akseptabelt i første store fase**. En **Noteriv-fork** er mest funksjonsrik hvis vi aksepterer separate TypeScript/React Native-klienter. Ingen av dem er en ferdig forkbar løsning for *samme Rust UI + robust mobil + read-only NAS web + revisjonert self-hosted sync*.

## 1. Sammenligningsmatrise

| Prosjekt | Lisens | Faktisk arkitektur / styrker | Mobil og web | Fork-konklusjon |
|---|---|---|---|---|
| [Scoria](https://github.com/ragtux/scoria) | MIT | Rust + GPUI, Obsidian-semantikk, parser/tekst/vault splittet i crates | Ingen dokumentert komplett mobil/web-klient | **Høy verdi som bibliotekkilde; medium som hel fork** |
| [Ferrite](https://github.com/OlaProeis/Ferrite) | MIT | Rust + egui, custom editor, ropey, comrak, virtualisering, IME-arbeid, native preview | Desktop-utgivelser; mobil/web ikke produktlevert | **God editor-referanse; full fork middels/lav** |
| [Noteriv](https://github.com/thejacedev/Noteriv) | MIT | Tauri 2/Next.js desktop, CodeMirror 6, vault, graph, tags, plugins, Git/WebDAV; Expo mobile separat | Android/iOS via egen React Native/Expo-app; ingen delt browser-first kjerne | **Høy feature-gjenbruk; men bryter målet om felles Rust-app** |
| [Markion](https://github.com/willmove/markion) | MIT | Rust + GPUI, kilde/visuell/split/lesing; har modulære crates | Desktop; ingen dokumentert mobil/web-produkt | **God UX og render-referanse, ikke hel fork** |
| [Opensidian](https://github.com/jpzk/opensidian) | GPL-3.0 | Rust + Tauri, Obsidian-liknende UI, wikilenker, graf, plugin-eksperiment | Linux-pakker er dokumentert; andre klienter krever mer arbeid | **Kun hvis GPL-krav og desktop-scope aksepteres** |
| [Inlyne](https://github.com/inlyne-project/inlyne) | MIT | Rust GPU-basert Markdown/HTML-viser uten nettleser | Ikke editor, ikke webutgave | **Ideer for renderer/ytelse; ikke full fork** |
| [Tachyon](https://github.com/DailenG/tachyon) | Apache-2.0 | Rust + GPUI, blokkvis editing, visuell markdown | Desktop | **Ideer for incremental rendering** |
| [Skymark](https://github.com/sirius-zuo/skymark) | MIT | Tauri 2 + CodeMirror 6, split view, forhåndsvisning | Desktop, ikke komplett vault-synk/mobil | **Lett referanse for webview-editor** |
| [Rhyolite](https://github.com/lockedmutex/rhyolite) | GPL-3.0 | Rust/Freya native, notat-UI under omskriving | Ingen dokumentert full plattformmatrise | **For tidlig og copyleft for basisfork** |
| [markdown-oxide](https://github.com/Feel-ix-343/markdown-oxide) | Apache-2.0 | Rust LSP: backlinks, wikilenke-komplettering, tagger og rename | LSP-tjeneste, ikke renderer/editor | **Se på datamodell/algoritmer; egen kompakt kjerne foretrekkes** |

*Merk:* MIT/Apache er normalt enkle å gjenbruke med riktige notices; GPL kan være et bevisst alternativ, men medfører forpliktelser ved distribusjon av avledet program. Enkelte assets kan ha andre lisenser. Kontroller filnivå før import.

## 2. Scoria – nærmest SyvendeSans' domenekrav

Kilde: [ragtux/scoria](https://github.com/ragtux/scoria). Prosjektet er aktivt og lisensiert MIT. Kildeinspisert på `main` med SHA **`c9479a5550fe20c2d4b087743aeca7e460992f98`** per 12.11.2026. Versjonen i repository-manifestet var 0.6.0. Markedsnettstedet og GitHub README kan være på ulike publiseringstrinn.

Scoria er en ekte Obsidian-vault-klient, ikke bare en filbasert Markdown-editor. Dokumentasjonen hevder at parseren passerer alle 652 CommonMark-eksemplene og at 1008/1009 egenrapporterte Obsidian-korpusnotater matcher renderingen av Obsidian 1.13.7. **Dette er prosjektets egne tall; SyvendeSans må reprodusere testene før vi stoler på resultatene.**

### Spesielt gjenbrukbare crates

| Crate | Verifisert i kildekode | Avhengigheter / vurdering |
|---|---|---|
| [scoria-markdown](https://github.com/ragtux/scoria/tree/main/crates/scoria-markdown) | Én parser for CommonMark + wikilenker, embeds, frontmatter, tags, block-ID, callouts, math, highlights og kommentarer; AST med byte-spans; HTML-rendering og highlighting | **Cargo.toml har ingen avhengigheter.** Beste spike-kandidat. Interne tester under `tests/{commonmark,corpus,obsidian}.rs` |
| [scoria-text](https://github.com/ragtux/scoria/tree/main/crates/scoria-text) | `TextBuffer`, `FileText`, Unicode-grapheme, cursor, selection, undo, autopair, formattering og tabellkommandoer | Ingen GPUI-avhengighet; bruker bl.a. regex og scoria-markdown. Kan brukes under en annen UI-adapter |
| [scoria-cache](https://github.com/ragtux/scoria/tree/main/crates/scoria-cache) | Per-fil metadata og vault-wide link resolution | Bygger på scoria-markdown og scoria-formats; kan redusere eget Obsidian-arbeid |
| [scoria-vault](https://github.com/ragtux/scoria/tree/main/crates/scoria-vault) | Mapper, filtyper, .obsidian-konfig, filhåndtering | Krever ekstra crates; mindre portabelt på mobil pga. OS-sandbox og fil-I/O |
| [scoria-search](https://github.com/ragtux/scoria/tree/main/crates/scoria-search) | Søkegrammatikk, filmatching, fuzzy search | Lite crate; kan kombineres med egen SQLite FTS5-index |
| [scoria-math](https://github.com/ragtux/scoria/tree/main/crates/scoria-math) | Ren Rust matematikk/rendering | Evaluér senere, ikke i MVP |
| [scoria-canvas](https://github.com/ragtux/scoria/tree/main/crates/scoria-canvas) | Obsidian Canvas-modell | God framtidig kilde, utenfor MVP |

**Viktig:** `publish = false` i Scorias workspace. Dette er **ikke crates.io-pakker** som vi bare kan legge til med versjonsnummer. Evaluer enten en Git-avhengighet pinet til commit eller kopier ut de nødvendige crates med MIT-notices og proveniens. Siste alternativ gir mer vedlikehold. Aldri spor flytende `main` som produksjonsavhengighet.

**Største hinder for full fork:** GPUI-desktopgrensesnittet kan ikke gjenbrukes direkte i vanlig nettleser. Mobil krever i praksis eget UI. Derfor kan det være bedre å la SyvendeSans eie UI og synk mens vi bruker kildekoden i Scorias frikoblede crates.

**Spike:** Bygg `scoria-markdown` og `scoria-text` uten GPU, kjør upstream tester, test åpning/lagring av vårt eksempelvault, sammenlikn parsetid og feil mot pulldown-cmark/comrak. Undersøk også eventuelle API-endringer mellom upstream commits.

## 3. Ferrite – tungt utviklet editor, men mindre portabel enn et bibliotek

Kilde: [OlaProeis/Ferrite](https://github.com/OlaProeis/Ferrite), MIT. `Cargo.toml` viser egui/eframe 0.34, `ropey`, `comrak`, `syntect`, `notify` og flere editor-/plattformavhengigheter. Filstrukturen har egne `src/editor`, `src/markdown`, `src/preview` og `src/ui`, men ikke et uavhengig publisert editor-crate.

**Verdifullt å undersøke:** store filer/virtualisering, syntax highlighting, seleksjoner, IME/CJK, multi-cursor, tabeller, synk mellom editor og preview, minneprofil. Dette kan spare utviklingstid hvis det lar seg trekke ut, men bør ikke gjøres før vi vet at egui-widgeten oppfører seg på mobil.

**Begrensninger:** Produktet har hovedsakelig desktop-distribusjon; Android/iOS og browser er ikke dokumentert som gjennomtestede, fullverdige Ferrite-klienter. Ferrite har også funksjoner som kjørbare kodeblokker; **ta aldri med kodekjøring fra et vilkårlig notat uten tydelig egen sikkerhetsmodell.**

**Fork:** Bare aktuelt hvis en spike viser at egui + editoren kan kjøre godt på Android, iOS og WASM. Å forke hele Ferrite og samtidig bygge nytt vault-/synksystem kan bli mer arbeid enn modulær nybygging.

## 4. Noteriv – raskest vei til mange funksjoner, men en annen plattformstrategi

Kilde: [thejacedev/Noteriv](https://github.com/thejacedev/Noteriv), MIT, aktiv. Verifisert i README og `desktop/src-tauri/Cargo.toml`:

- Desktop: Next.js 16, React 19, CodeMirror 6, Tauri 2/Rust. Vault, graph, daglige notater, plugins, Git/WebDAV, backlinks, dataview.
- Mobil: **Separat** React Native 0.81 / Expo 54-app, med egen renderer og fil-/synkmodell.
- Desktop-backend: Rust-filoperasjoner, `notify`, `atomicwrites`, Git/WebDAV-kommandoer.
- Synk via eksisterende WebDAV/folder er dokumentert som modification-time-basert / *last-write-wins*; Git er mer robust. Dette oppfyller **ikke** uten videre SyvendeSans' offline/revisjonskrav.
- Rust-backenden har ikke OS keyring-avhengighet i manifestet; vår credential-arkitektur bør være strengere.

**Full fork er meningsfull** hvis vi godtar TS/React/Expo og vil ha funksjonsrik notatapp først, med ny selvhostet sync-protokoll senere. **Ikke ideelt** hvis målet er å dele nesten all kjernelogikk i Rust på mobil, desktop og web. Bruk derfor komponenter/design som referanse, og særlig CodeMirror-integrasjonen, uten å overta hele arkitekturen.

## 5. Øvrige kandidater

**Markion** ([repo](https://github.com/willmove/markion), MIT) har avanserte desktop-redigeringsmodi i GPUI og workspace-crates. God inspirasjon for UX, cursorstabilitet og desktop-målinger. Mangler direkte web/mobil UI-gjenbruk.

**Opensidian** ([repo](https://github.com/jpzk/opensidian), GPL-3.0-or-later) ligger meget nær Obsidian-funksjoner, men lisensvalget og desktop-fokus er vesentlig. Vurder bare full fork hvis prosjektet bevisst vil ha GPL-basert videreutvikling.

**Inlyne** ([repo](https://github.com/inlyne-project/inlyne), MIT) renderer Markdown via Comrak til eget HTML/GPU-oppsett, men er primært en **viewer**, ikke editor; og gir ikke browserplattform.

**markdown-oxide** ([repo](https://github.com/Feel-ix-343/markdown-oxide), Apache-2.0) gir Obsidian-lignende linking, backlinks og rename-funksjoner gjennom LSP. Relevante algoritmer, men vi bør ikke måtte starte en separat LSP-server for lokal mobilindeks.

**Skymark** ([repo](https://github.com/sirius-zuo/skymark), MIT) er en enkel Tauri 2/CodeMirror 6-referanse for split preview, autosave og scroll-synk. Ikke en ferdig selvhostet note-service.

## 6. Biblioteker hvis vi bygger SyvendeSans modulært

| Del | Førstevalg / alternativer | Hvorfor |
|---|---|---|
| Obsidian-semantikk | **scoria-markdown (pinet)**; ellers pulldown-cmark + eget semantikklag; sammenlikn comrak | Spans, wikilenker, embeds, callouts, byte-preservering |
| Tekstmodell | **scoria-text (spike)**; `ropey` ved større dokumenter | Redigering, undo, Unicode-korrekthet, UI-uavhengighet |
| Editor-widget | **CodeMirror 6** i Dioxus/Tauri; alternativ egui custom widget | Den største mobil/IME-risikoen ligger her |
| Native Markdown-preview | `egui_commonmark` eller `egui_markdown` *hvis* egui blir valgt | Gjenbrukbar viewer, men ikke automatisk Obsidian-kompatibel |
| Filsystem | `notify` + periodisk rescan, `tempfile`, path-validation | Andre editorer kan endre vault |
| Fulltekst | `rusqlite` + SQLite FTS5 | Rebyggbar lokal/server-index |
| Sync-protokoll | `serde`, `blake3`, `uuid`/`ulid`, `tokio` | Typede meldinger, innholdshash, revisions |
| Server | `axum`, `tower`, `rustls`-basert HTTPS eller privat TLS-terminering | NAS, API, WebSocket |
| Mobile secrets | Keychain/Keystore via native adapter | Device-token uten klartekst på disk |
| Sikker HTML | `ammonia` eller streng DOM-komponentrendering + CSP | Ikke render vilkårlig HTML uten filter |
| CRDT (senere) | `loro`, `automerge` eller `yrs` | Først ved krav om concurrent editing |
| VPN | OS-Tailscale; Headscale valgfritt | Rust-appen har vanlig HTTPS-klient |

**Merk:** Et bibliotek som kompilerer til WASM er ikke automatisk egnet for mobil input eller direkte filesystem. Den faktiske UI-plattformen må testes med tastatur, seleksjon og offline-flyt.

## 7. Hva jeg ville valgt nå

**Arkitekturstrategi: modulær greenfield med forsiktig bibliotekgjenbruk.**

- Opprett et lite SyvendeSans Rust-workspace. Ikke kopier store kodebaser nå.
- Kjør en **avgrenset arkitekturspike** der vi kompilerer og tester `scoria-markdown` og `scoria-text` ved pinet SHA og sammenligner `pulldown-cmark`/`comrak`.
- Bygg to tynne UI-prototyper for **samme fil**: Dioxus + CodeMirror, og Tauri 2 + CodeMirror. Hvis ønsket om ren Rust-UI er viktigst, legg til egui/eframe som tredje. Test fysisk Android/iOS før hovedvalg.
- Prioriter byte-bevarende åpning/lagring og riktig linkmodell før visuelle Obsidian-funksjoner.
- Implementér synk som en uavhengig protokoll med lokal kø, serverrevisjoner, CAS og konfliktkopier; **ikke adopter Noterivs last-write-wins WebDAV/folder som standard**.
- Legg webvisning over Axum read-only API, med Tailscale Serve ved NAS. Ingen klient-VPN i appen.
- Vurder å sende oppstrøms forbedringer til Scoria i stedet for å holde store interne forks.

### Konkret go/no-go

| Test | Bestått når |
|---|---|
| Parserkonformitet | Referansevault parser/renderes med dokumenterte forskjeller og uten lenketap |
| Bytebevaring | Uendrede filer er byte-identiske etter åpen/lukk, CRLF, BOM, frontmatter |
| Editor-mobil | Android og iOS: IME, copy/paste, swipe, selection, tastatur og 100 KB tekst fungerer |
| Rust/WASM | Browser åpner og viser vault gjennom API uten native fil-/syncdeps |
| Desktop-ytelse | P95-åpning, scroll, søk og minne ligger innenfor egne budsjetter |
| Sync | Klientkrasj, offline-endringer, konflikter, rename/delete og retry kan ikke stille miste data |
| Lisens | Notices, filer, bilder, fonter og tredjepartslisenser er gjennomgått |

### Foreslått ADR-sekvens

- `ADR-001`: Vanlige Markdown-filer er sannhetskilde.
- `ADR-002`: Scoria-moduler vs pulldown-cmark/comrak.
- `ADR-003`: Dioxus vs Tauri vs egui etter fysisk mobilspike.
- `ADR-004`: Revisjonert sync og konfliktpolicy.
- `ADR-005`: Tailscale som ekstern nettverkstransport.

## Kilder og inspirasjon

- [Scoria repository og workspace](https://github.com/ragtux/scoria)
- [Scoria markdown crate](https://github.com/ragtux/scoria/tree/main/crates/scoria-markdown)
- [Scoria tekstmodell](https://github.com/ragtux/scoria/tree/main/crates/scoria-text)
- [Scoria manual / kompatibilitet](https://scoria.cc/)
- [Ferrite](https://github.com/OlaProeis/Ferrite)
- [Noteriv](https://github.com/thejacedev/Noteriv)
- [Noteriv synkroniseringsmodell](https://docs.noteriv.com/sync/)
- [Markion](https://github.com/willmove/markion)
- [Opensidian](https://github.com/jpzk/opensidian)
- [Inlyne](https://github.com/inlyne-project/inlyne)
- [markdown-oxide](https://github.com/Feel-ix-343/markdown-oxide)
- [Dioxus mobile](https://dioxuslabs.com/learn/0.7/guides/platforms/mobile/)
- [Tauri 2](https://v2.tauri.app/)
- [egui/eframe](https://github.com/emilk/egui)
- [egui_commonmark](https://github.com/lampsitter/egui_commonmark)
- [egui_markdown](https://github.com/membrane-io/egui_markdown)
- [pulldown-cmark](https://docs.rs/pulldown-cmark/)
- [Comrak](https://comrak.ee/)

**Oppsummering:** Scoria er det mest lovende kildetreet for *Obsidian-spesifikk semantikk*, Ferrite for *native editing-ytelse*, Noteriv for *funksjonsbredde og CodeMirror-integrasjon*. SyvendeSans bør eie sin egen Rust-kjerne og sync, og teste de beste gjenbrukbare modulene før det velges en full fork.
