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

| Module         | What it does                                                                                        | Swap / extend by…                                                   |
| -------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `layout/`      | Pure geometry: `computeLayout({mode, count, container, options})` → one rect per slot.              | Adding a mode: write `myLayout.ts`, route it in `computeLayout.ts`. |
| `view/`        | The "what I'm watching" model (`ViewState`) and pure operations: add, remove, swap, audio focus…    | Adding an operation + test; stores call it.                         |
| `audio/`       | Volume model: per-channel volumes, or one master volume with per-channel balance (consistent mode). | Add a mode in `volumeModel.ts` + tests.                             |
| `history/`     | Log of channels watched without following them (newest first, capped, validated on load).           |                                                                     |
| `presets/`     | Preset type, export/import file format, validation, merging.                                        | Bump `EXPORT_VERSION` and migrate in `sanitizePreset`.              |
| `twitch/`      | `TwitchApi` interface, Helix client (auth headers, pagination, 401/429), OAuth helpers, mock API.   | Implement `TwitchApi` (e.g. a caching or proxy variant).            |
| `player/`      | `PlayerAdapter` interface, Twitch embed adapter, mock player, `PlayerController`, quality picker.   | Implement `PlayerAdapter` for another player.                       |
| `persistence/` | `KeyValueStore` interface (localStorage with memory fallback) and the zustand adapter.              | Implement `KeyValueStore` (file, sync service…).                    |
| `alerts/`      | Which streams just went live (for notifications), favorites-first sorting.                          |                                                                     |
| `channels/`    | Parse names, `@names`, twitch.tv, player and multitwitch links.                                     |                                                                     |
| `utils/`       | Formatting helpers (viewer counts, uptime, thumbnails).                                             |                                                                     |

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

## Desktop app (`desktop/`, Electron)

Plain JavaScript modules, typechecked through `tsconfig.desktop.json` (`// @ts-check`), with no
build step:

| Module             | What it does                                                                                                                                                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.mjs`         | App lifecycle: single instance, window, close-to-tray, permissions, links, Twitch sign-in window.                                                                                                                                                                       |
| `server.mjs`       | Serves `dist/` on `localhost:5757` (IPv4 + IPv6). The Twitch OAuth redirect and embed `parent` need exactly that origin.                                                                                                                                                |
| `windowState.mjs`  | Saves and restores size, position and maximized (never fullscreen: it can't be moved or left there); falls back to the primary monitor if the saved one is gone.                                                                                                        |
| `navigation.mjs`   | Only the app and `*.twitch.tv` pages may load in the window; everything else opens in the system browser. Also the permission allow-list and the Chrome-like user agent.                                                                                                |
| `tray.mjs`         | Tray icon and menu (show, restart to install update, quit).                                                                                                                                                                                                             |
| `updates.mjs`      | Compares the commit stamped into the build with the newest commit on `main` (GitHub API, or the git refs endpoint if rate-limited); **Update now** runs the installer script.                                                                                           |
| `playerChrome.mjs` | Tweaks Twitch's UI inside the player iframes (only the main process can reach them): hides the stream-info overlay (found from the channel link and Follow/Subscribe buttons, not Twitch's class names) and clicks through the "intended for certain audiences" notice. |
| `preload.cjs`      | The only bridge to the page: `window.mtvDesktop` (see `src/lib/desktop/bridge.ts`).                                                                                                                                                                                     |

Behaviour notes:

- **Hidden to the tray**, the page gets `mtvDesktop.onBackgroundChange(true)` and unmounts the
  players and chat (no hidden audio or bandwidth). The live-list polling keeps running
  (`backgroundThrottling: false`, `refetchIntervalInBackground`), so go-live notifications still
  fire. Clicking one calls `showWindow()`.
- The window is sandboxed (`contextIsolation`, `sandbox`, no Node integration). The page can only
  use the bridge functions.
- Packaging: `electron-builder.yml` (NSIS one-click installer, no publishing). The app has no
  runtime dependencies; the web app's libraries are already bundled into `dist/`.
- **Delivery without CI**: `scripts/windows/install.ps1` (run by `Install Multi Twitch Viewer.cmd`
  or by **Update now**) does the whole pipeline on the user's PC:
  1. finds the newest commit on `main`;
  2. downloads a private portable Node.js LTS and the source zip for that commit, keeping
     `node_modules` between runs;
  3. runs `npm install`, then `npm run build`, then
     `electron-builder --win -c.extraMetadata.buildCommit=<sha>`;
  4. closes the app, runs the installer silently (`/S`) and relaunches it.

  It skips the build when the installed commit is already the newest (use `-Force` to rebuild).

- Tests: `desktop/desktop.test.mjs` (unit) and `e2e/desktop.spec.ts`, which drives the real app
  with Playwright: tray hide/show, blocked navigation, and window position across restarts.

## Key design decisions

- **Streams never reload when the layout changes.** Tiles are absolutely positioned and rendered
  in a fixed (alphabetical) DOM order. Reordering, swapping or switching layouts only changes
  their `left/top/width/height`. Moving an iframe in the DOM would restart the stream.
- **Videos fill their 16:9 tiles.** The iframe uses the full tile rectangle; reserving a control
  strip inside that rectangle changes its aspect ratio and adds Twitch letterboxing.
  `StreamControls` temporarily overlays the top on hover or keyboard focus, including in Mix,
  and becomes hidden and stops intercepting input when idle. Highlights use an `outline` in
  the gap outside the player. Tiles are positioned without CSS transforms, and the layout
  engine avoids Twitch's 400×300 autoplay minimum when it can. Twitch may restrict obscured
  embeds, so controls should cover as little video as possible and never persist just because
  the stream was previously hovered.
- **Hover crosses iframe boundaries.** A transparent entry surface receives the first pointer
  movement, then disappears immediately. The iframe stays interactive throughout, so native
  player clicks still work. Transient hover uses boundary events
  and parent pointer movement rather than the remembered keyboard target; viewport exit, hidden
  groups and window focus loss clear it. This handles cross-origin players that swallow parent
  hover events when the pointer moves between videos.
- **Streams keep playing unless you paused them.** When a player reports `paused`, the tile
  resumes it after a moment unless you interacted with that player just before
  (`playerInteraction.ts`: click/focus inside it). `AutoResume` caps retries so a player that
  keeps pausing isn't fought forever.
- **Groups keep player DOM stable.** Optional groups and the selected tab are part of `ViewState`
  and validated when sessions/presets load. `groupedLayout` computes separate sections, while all
  tiles retain alphabetical DOM order. Isolated tabs hide mounted tiles and add a separate group
  pause reason; they do not alter saved audio state. Arrange mode alone intercepts video dragging.
- **Recovery is temporary state.** `PlaybackRecovery` combines sustained low buffer/frame rate,
  repeated unrequested pauses and offline events. It caps background quality, holds muted streams,
  and resumes one every eight seconds after fifteen stable seconds. Manual, group and bandwidth
  pause reasons are independent. The persisted `bandwidthSaving` setting (on by default) disables
  only network pressure handling, immediately clearing quality caps and bandwidth holds without
  releasing manual or hidden-group pauses. Re-enabling starts with fresh pressure evidence.
  A shared reload budget limits reloads across embed remounts, independently of this preference.
  Exact decoding errors are observed only in verified HTTPS Twitch player frames in Electron;
  browser recovery uses sustained playback starvation.
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
  - `mock`: user flows against the mock build (layouts, audio keys, drag-swap, auto-resume, presets,
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
