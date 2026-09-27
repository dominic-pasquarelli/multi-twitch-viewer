# Architecture

The app is a static React + TypeScript single-page app, built with Vite and served locally. It
has no backend: it talks to Twitch directly from the browser.

## Layers

Dependencies only point **down** this list. Each layer can be tested and upgraded on its own.

```
src/
├── lib/        Pure TypeScript, no React. The reusable core. Unit tested.
├── state/      Zustand stores: thin wrappers that call lib/ functions and persist.
├── ui/         Generic, app-agnostic components (Button, Dialog, Popover, Toasts, Form…).
├── features/   One folder per feature; each owns its components, hooks and CSS.
└── app/        Composition: providers, service wiring, the page shell.
```

### `lib/`: the core modules

| Module         | What it does                                                                                      | Swap / extend by…                                                   |
| -------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `layout/`      | Pure geometry: `computeLayout({mode, count, container, options})` → one rect per slot.            | Adding a mode: write `myLayout.ts`, route it in `computeLayout.ts`. |
| `view/`        | The "what I'm watching" model (`ViewState`) and pure operations: add, remove, swap, audio focus…  | Adding an operation + test; stores call it.                         |
| `presets/`     | Preset type, export/import file format, validation, merging.                                      | Bump `EXPORT_VERSION` and migrate in `sanitizePreset`.              |
| `twitch/`      | `TwitchApi` interface, Helix client (auth headers, pagination, 401/429), OAuth helpers, mock API. | Implement `TwitchApi` (e.g. a caching or proxy variant).            |
| `player/`      | `PlayerAdapter` interface, Twitch embed adapter, mock player, `PlayerController`, quality picker. | Implement `PlayerAdapter` for another player.                       |
| `persistence/` | `KeyValueStore` interface (localStorage with memory fallback) and the zustand adapter.            | Implement `KeyValueStore` (file, sync service…).                    |
| `channels/`    | Parse names, `@names`, twitch.tv, player and multitwitch links.                                   |                                                                     |
| `utils/`       | Formatting helpers (viewer counts, uptime, thumbnails).                                           |                                                                     |

### `state/`: stores

| Store                   | Persisted as    | Contents                                                       |
| ----------------------- | --------------- | -------------------------------------------------------------- |
| `viewStore`             | `session`       | Current `ViewState` (last session), undo history (memory only) |
| `presetsStore`          | `presets`       | Saved presets                                                  |
| `settingsStore`         | `settings`      | Preferences (gap, audio behaviour, quality, Client ID…)        |
| `channelPrefsStore`     | `channel-prefs` | Per-channel volume                                             |
| `authStore`             | `auth`          | Twitch token + user                                            |
| `uiStore`, `toastStore` | (not saved)     | Open dialogs, fullscreen, player status, toasts                |

Persisted data is re-validated on load (`sanitizeView`, `sanitizePreset`), so a corrupted or
old entry falls back to defaults instead of crashing the app. All keys are prefixed `mtv:`.

### `app/services`: dependency injection

`ServicesProvider` decides which implementations features get: the real Helix API and Twitch
embed, or the mock ones (`VITE_TWITCH_MOCK=true`, used by `npm run dev:mock` and the e2e tests).
Features only use `useServices()`, so they don't know or care which one is active.

## Windows launcher (`launcher/`)

A small Go program (`MultiTwitchViewer.exe`) that makes the app a double-click desktop tool:

- It embeds the built web app (`launcher/web`, filled by `npm run build:windows`) and serves it on
  `127.0.0.1:5757`, the same origin as `npm start`, so logins and presets are shared.
- It opens the app with `chrome.exe`/`msedge.exe --app=…`, a window without tabs that still uses
  your normal browser profile, so the twitch.tv cookies (Turbo) work. If neither browser is found,
  it opens the default browser.
- **Single instance**: if port 5757 already answers `/__mtv/health`, it just opens another window.
- **Auto-quit**: the web app POSTs `/__mtv/heartbeat` every 20 s (`src/lib/launcher/heartbeat.ts`,
  which does nothing outside the launcher). The launcher exits 3 minutes after the last heartbeat,
  which allows for browsers throttling background windows.
- On first run it creates a desktop shortcut. Errors are shown in a Windows message box.
- `winres/` holds the icon, version info and manifest (compiled in with `go-winres`).
- Platform-specific code is in `platform_windows.go`; `platform_other.go` lets it build and be
  tested on Linux or macOS.

## Key design decisions

- **Streams never reload when the layout changes.** Tiles are absolutely positioned and rendered
  in a fixed (alphabetical) DOM order. Reordering, swapping or switching layouts only changes
  their `left/top/width/height`. Moving an iframe in the DOM would restart the stream.
- **Nothing covers a player while it starts.** Twitch refuses to autoplay embeds that are smaller
  than 400×300, covered by other elements, or transformed. So the audible-stream highlight is
  an `outline` drawn in the gap _outside_ the player, the tile toolbar only appears on hover,
  tiles are positioned without CSS transforms, and the layout engine avoids tiles below 400×300
  when it can.
- **`PlayerController` reconciles desired vs actual player state.** The app says what it wants
  (muted, volume, quality). The controller applies it once the player is ready, and polls
  cheaply once a second to notice changes made with Twitch's own controls, which feed back into
  the store. That's how "unmute in the player → the others mute" works.
- **Implicit-grant OAuth, no server.** The token comes back in the URL fragment, is checked
  against a random `state`, and is stripped from the address bar immediately. It's validated at
  startup and hourly, as Twitch requires. Only `user:read:follows` is requested.
- **Offline hiding uses Helix live status**, not the player, so a hidden channel reappears on the
  next refresh after it goes live.

## Testing

- `npm test`: Vitest unit tests next to the code (`*.test.ts`). The `lib/` modules are covered
  the most, because that's where the logic lives.
- `npm run test:e2e`: Playwright, two projects:
  - `mock`: user flows against the mock build (layouts, audio keys, drag-swap, presets,
    offline hiding, paste links).
  - `twitch`: the **real** build with Twitch's servers stubbed in the browser. It covers the
    OAuth redirect and state check, Helix calls and headers, the embed-script loader, the
    `parent` parameter, and player mute syncing.

## Common changes

- **Tweak how layouts choose tile sizes**: `src/lib/layout/grid.ts` (scoring in `compareScores`)
  or `focus.ts` (`autoMainWidth`). Run `npx vitest src/lib/layout`.
- **Store presets somewhere else** (file, cloud sync): implement `KeyValueStore` and pass it to
  `zustandStorage(...)` in `presetsStore.ts`.
- **New keyboard shortcut**: add it to `features/shortcuts/shortcuts.ts` (help text) and
  `useHotkeys.ts` (behaviour).
- **New setting**: add a field and default in `settingsStore.ts` and a control in
  `features/settings/SettingsDialog.tsx`. Old saved settings merge with the new defaults
  automatically.
