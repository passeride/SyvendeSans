# Noteriv-plugins

Legg til GitHub-kilden `passeride/SyvendeSans` med branch `noteriv-plugins` i Noteriv under **Plugins → Community**.

| Plugin | Bruk |
| --- | --- |
| Notatverksted | Kjør **Lag demonotat i vaultet** fra kommandopaletten |
| PlantUML | Sett inn et diagram fra kommandopaletten og tegn det i lesevisning |
| Mermaid Diagrams | Tegn `mermaid-offline`-blokker lokalt |
| Spinnvill Patterns | Kjør **Sett inn Spinnvill-eksempel** fra kommandopaletten |
| CAD Viewer | Vis STL- og STEP-modeller fra vaultet i en `cad`-kodeblokk |

Katalogen ligger i `manifest.json` ved roten. Den lister også ressursfilene som Noteriv må hente sammen med hver plugin. Byggeskriptene og kildekoden ligger i [Noteriv](https://github.com/passeride/Noteriv/tree/main/desktop/examples/plugins). CAD Viewer har [sitt eget byggeskript](cad-viewer/build/build.mjs).
