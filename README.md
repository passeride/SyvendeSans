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

**Status:** Forprosjekt / design. Det finnes foreløpig ingen ferdig klient, server eller installasjonspakker.
