# Source attribution and licensing

Reviewed 2026-11-12. Engineering guidance, not legal advice.

| Project | Pinned ref | License |
|---|---|---|
| [Noteriv](https://github.com/thejacedev/Noteriv) | `00b8a9593e99c47f5ead22f0a8e91852f66b1e6a` | MIT |
| [SyncUp](https://github.com/sidtech-solutions/syncup) | `4bca426a5b7f98ef4d3b8358535c4d3a3b990f48` | MPL-2.0 |
| [Syncthing](https://github.com/syncthing/syncthing) | Pinned by SyncUp `backend/go.mod` | MPL-2.0 |
| Original SyvendeSans adapter | This repository | Proposed MIT |

## Implications

- Preserve original Noteriv MIT license/copyright attribution if distributing its code.
- **MPL-2.0 is file-level copyleft.** If SyncUp/Syncthing source files are reused or modified and distributed, preserve their notices, include the license and provide source for covered files and modifications under MPL-2.0. New independent files may retain a separate compatible license.
- Source submodules are pinned and preserve provenance; they are not the same as distributing license notices inside finished apps.
- Review generated code, Go transitive dependencies, third-party assets and icons separately before packaging. Do not assume brand/logo rights are covered by source licenses.
- Keep Syncthing REST bound to loopback with API-key protection, never expose GUI publicly. Local keys need protected app storage.
- Syncthing is not backup. NAS still needs versioned snapshots and restore tests.

**Current scope:** No upstream code has been copied or modified inside SyvendeSans. Pinned submodules point to complete original repositories. New TypeScript adapter is separate code. App distribution checks are pending.
