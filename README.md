# SyvendeSans

**SyvendeSans** er et planlagt lokal-først, selvhostet Markdown-notatverktøy i Rust med mål om kompatibilitet med eksisterende Obsidian-vaults.

## Hovedmål

- Markdown-filer og vedlegg som sannhetskilde; full offline-støtte.
- Desktop (Windows, Linux, macOS), Android, iOS og lesebasert webgrensesnitt.
- Egen synkroniseringsserver på NAS, tilgjengelig over Tailscale/valgfri Headscale.
- Hurtig Markdown-rendering, fulltekstsøk, wikilenker, tags og backlinks.
- Bevaring av filinnhold, konfliktbeskyttelse, historikk og egen backup.

## Design og forskning

- [Prosjektskisse og arkitektur](docs/PROSJEKTSKISSE.md)
- [Kartlegging av eksisterende Rust-editorer og gjenbrukbare biblioteker](docs/RUST_EDITOR_RESEARCH.md)

## Teknisk retning (foreløpig)

Gjenbruk de beste komponentene fremfor å låse oss til en full desktop-fork. Vi undersøker særlig `scoria-markdown` og `scoria-text` fra [Scoria](https://github.com/ragtux/scoria), mot `pulldown-cmark`/`comrak` og ulike UI-alternativer. Første avgjørelse tas etter parserbenchmark og editor-spikes på desktop og fysisk mobil.

Synkronisering bygges uavhengig av UI i Rust. Nettleseren er en autentisert leseklient til serveren og trenger ikke egen synk- eller VPN-motor.

**Status:** Tidlig GitHub-prototype for web, Windows, Linux og Android. NAS-server og lokal-først-synk er planlagt.

## Test GitHub-prototypen

Bruk Node.js 24 og kjør `npm ci` og `npm run dev`. For en statisk build, kjør
`npm run build` og server mappen `dist/` via HTTP(S).
[Build test apps](../../actions/workflows/build.yml) laster opp webbuild, Windows NSIS-installer,
Linux `.deb` og Android debug-APK. Web kan også publiseres fra `main` ved å velge
**Settings → Pages → Source → GitHub Actions** og kjøre **Publish web preview**.
Windows-testinstalleren er usignert. Android-testpakken bruker debug-signering.

Koble til et eksisterende vault med `eier/repo`, ønsket gren og et
[fine-grained GitHub-token](https://github.com/settings/personal-access-tokens/new)
begrenset til det vault-repoet. Gi **Contents: Read-only** for lesetesten og
**Contents: Read and write** for oppretting og redigering. Start skrivetesten på en
egen gren. Hvert klikk på **Lagre til GitHub** oppretter en commit på den valgte
grenen. Lagret blob-SHA brukes til å avvise overskriving fra en utdatert klient.

Tokenet holdes i klientens minne fram til frakobling eller reload. Appen kobler
direkte til GitHub REST API over HTTPS. GitHub Pages trenger ingen vault-tilgang
eller hemmeligheter. Workflowene bygger fra dette repoet alene.

Denne prototypen tilbyr søk på notatsti, Markdown-kilde, forhåndsvisning og enkel
oppretting/lagring. Obsidian-spesifikke wikilenker, vedlegg og backlinks ligger i
arbeidsplanen. Usendte endringer ligger i minnet. Lokale persistente utkast,
offline-synk og kontinuerlig synk mellom klienter er fremtidig arbeid.
