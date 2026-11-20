# ADR-002: Embedded Syncthing as Noteriv sync provider

**Status:** Proposed; native builds not yet tested  
**Date:** 2026-11-12

## Decision

Use Syncthing as an embedded native synchronization engine, replacing the need to implement an Iroh-based file sync protocol. Reuse SyncUp's Go `gomobile` + Kotlin/Swift native bridge under MPL-2.0 and wrap its localhost REST API with an isolated Noteriv provider.

The Syncthing daemon on a NAS acts as an always-on peer. Public discovery / public relays provide connectivity without Tailscale, static IP or inbound router ports.

## Non-goals for this first change

- Not a production-ready native build or a claim of continuous background sync on iOS.
- Not a full GitHub fork: existing SyvendeSans is retained; upstream repositories are pinned as submodules.
- No simultaneous Git/WebDAV and Syncthing on one vault.
- No central hosted service or new proprietary sync protocol.

## Technical constraints

Noteriv Expo 54 / RN 0.81 and SyncUp Expo 57 / RN 0.86 have incompatible generated native bindings. Port and regenerate the bridge. Confirm app-private vault path mapping, Android SAF, iOS BGTaskScheduler constraints, loopback API security, license obligations and conflict handling.

## Go / no-go

- Both mobile platforms build and start embedded Go daemon.
- Pair with NAS by device ID or QR, accept share, sync files both directions.
- Same Markdown directory read by Noteriv and Syncthing (not duplicated).
- No data loss on concurrent offline edits, note rename/delete, interrupted transfers or app backgrounding.
- Verified connection on mobile data with no router port forwarding.
- MPL-2.0 source availability and third-party notices completed before release.

See [integration README](../../integrations/syncthing-mobile/README.md) and [licensing](../LICENSING.md).
