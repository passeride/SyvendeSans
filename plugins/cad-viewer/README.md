# CAD Viewer for Noteriv

Installer **CAD Viewer** fra `passeride/SyvendeSans` på branchen `noteriv-plugins` under **Plugins → Community**. Aktiver pluginen i **Installed**. Noteriv må støtte pluginressurser og egne kodeblokker.

Legg en STL- eller STEP-fil i vaultet. Kjør **Sett inn 3D-modell** fra kommandopaletten, eller legg inn blokken selv:

~~~~markdown
```cad
Vedlegg/klokkeholder.step
```
~~~~

Bruk sti fra vault-roten eller start med `./` eller `../` for en sti relativ til notatet. Modellen lastes automatisk i lesevisningen. Når du åpner en CAD-fil direkte på mobil i en Noteriv-build med støtte for skjermfyllende vedlegg, bruker viseren hele området under tittellinjen. Dra for å rotere, bruk rullehjul eller klyp for å zoome, og bruk **Tilpass** for å se hele modellen igjen. Desktop har også fullskjerm.

Desktop støtter binær og ASCII STL samt STEP (`.step`, `.stp`) opp til 20 MiB. Mobilversjoner med støtte for binær lesing bruker samme filgrense. Eldre versjoner kan lese ASCII STL og STEP innenfor appens grense for tekstfiler. Visning krever WebGL 2. CAD-prosjekter fra FreeCAD, MitCad eller SolidCraft kan eksporteres til STEP først.

Pluginen tolker filene lokalt og fungerer frakoblet etter installasjon. Den bruker [Three.js](https://github.com/mrdoob/three.js), [occt-import-js med Open CASCADE](https://github.com/kovacsv/occt-import-js/tree/c2148e54b456b571238d35cac037d304053d64b2) og [fflate](https://github.com/101arrowz/fflate). Lisensfilene følger med pluginen.

## Bygg motorfilene på nytt

Kjør `npm ci` og `npm run build` i `build/`. Byggeskriptet oppdaterer også pluginens ressursliste i katalogen.
