# Embedded Syncthing for Noteriv — first integration spike

This is **new SyvendeSans adapter code** targeting SyncUp's existing native Go/RN interface. It is **not installed into Noteriv** and does not make APK/iOS builds runnable yet.

## Where the reusable code lives

Run `git submodule update --init --recursive` from the SyvendeSans repo root.

- `vendor/noteriv/desktop` and `vendor/noteriv/phone` are the original app, at a pinned upstream commit.
- `vendor/syncup/backend/wrapper.go` embeds `syncthing/lib/syncthing` via `gomobile` (MPL-2.0).
- `vendor/syncup/mobile-app/src/NativeGoServerBridge.ts` defines SyncUp's TurboModule interface.
- `vendor/syncup/mobile-app/src/GoServerBridgeJSI.ts` wraps the TurboModule.
- `vendor/syncup/mobile-app/android/app/src/main/java/com/siddarthkay/syncup` contains Kotlin bridge and service.
- `vendor/syncup/mobile-app/ios/syncup` contains Objective-C++ / Swift bridge and lifecycle code.
- `src/embedded-sync.ts` (this directory) implements a first **original** Syncthing client adapter with loopback-only REST calls, start/stop, ping, status, scan, pairing and configuring an *existing* Noteriv vault folder.

The original Go/Kotlin/Swift code is available by submodule checkout; it is not copied or relicensed as MIT.

## Still required before it works in Noteriv

1. Port native files and generated bindings into Noteriv's `phone` app; regenerate RN TurboModule bindings.
2. **Version mismatch:** Noteriv was inspected at Expo 54 / RN 0.81; SyncUp at Expo 57 / RN 0.86. Upgrading or backporting is mandatory, and not performed yet.
3. Register Android `GoServerBridgePackage`, background service and native AAR; register iOS Objective-C++ bridge, XCFramework, Podfile and scheduled background tasks.
4. Pass the real bridge into `EmbeddedSyncthing` from React Native. Add vault-specific provider settings and QR-pairing UI.
5. Guarantee one sync engine per vault. Disable existing Git/WebDAV/folder auto-sync while Syncthing owns that vault.
6. Invalidate Noteriv note caches after filesystem changes, without overwriting unsaved editor buffers. Test conflict copies and deletions.
7. Run physical-device tests, verify no port-forwarding required, and confirm that iOS runs opportunistically (not continuously).
8. Complete [licensing checklist](../../docs/LICENSING.md) before redistribution.

This integration intentionally uses Noteriv's existing local vault directory. Syncthing must not synchronize a duplicate copy in another app sandbox.
