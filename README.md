# Multi Twitch Viewer

A personal, local-only replacement for multitwitch.tv. Log in once, see which of your followed
channels are live, and watch several streams at once with layouts that actually use your screen.

- **Followed channels sidebar**: live channels (viewers, category, uptime, hover preview) and
  offline follows. Click to add or remove, **Shift+click** to watch only that one, or drag a
  channel onto a stream to replace it. It collapses to an avatar rail with `B`.
- **Smart layouts with no wasted space**
  - **Grid** picks the arrangement with the biggest videos. For example, 5 streams become
    2 large + 3 smaller instead of a 3×2 grid with a hole.
  - **Focus** makes one stream big and wraps the rest around it. Its automatic size keeps the
    others at or above Twitch's 400×300 autoplay minimum. Adjust it with the slider or `[` `]`.
  - Drag a stream by its grip onto another to swap them. Streams never reload when they move.
  - Offline channels step aside and give their space to live ones, then come back when they go live.
- **Favorites and go-live alerts**: star channels (☆ on hover in the sidebar) to keep them at the
  top. When a favorite goes live you get a Windows notification; click it to start watching.
  Settings can switch this to everyone you follow, or off.
- **Audio without the chaos**: pick a stream with `1`–`9` or its speaker button, and choose what
  the others do (top bar):
  - **Solo**: the others are muted. Unmuting inside a Twitch player also mutes the rest.
  - **Duck**: the others keep playing quietly (20% by default) so you notice when something happens.
  - **Mix** (`Shift+1`–`9`): several streams at full volume.
  - `↑`/`↓` changes the volume of the stream you're hearing, or scroll over a stream's hover
    bar. Volume is remembered **per channel**, so loud streamers stay tamed. `M` mutes all and restores.
- **Presets**: save the current streams, layout, audio and chat as a named preset and load it in
  one click, with a live count for each. Export and import them as a JSON file for backup.
- **Bookmarkable links**: the address bar always matches what you're watching
  (`http://localhost:5757/#/chan1/chan2?layout=focus`). Pasting a multitwitch.tv link into the
  add box loads all of its channels.
- **Also**: tabbed chat (`C`) that follows the stream you're hearing, fullscreen (`F`), undo
  (`Ctrl+Z`), and optional "match quality to tile size" to save bandwidth.

## Windows desktop app (easiest)

### Install (once)

Pick one:

- **Double-click:** download
  [`Install Multi Twitch Viewer.cmd`](https://github.com/dominic-pasquarelli/multi-twitch-viewer/raw/main/Install%20Multi%20Twitch%20Viewer.cmd)
  (if the browser shows the text instead, right-click the link → _Save link as…_) and double-click
  it. If Windows says _"Windows protected your PC"_, click **More info → Run anyway**.
- **Or paste one line:** press Start, type **PowerShell**, open it, paste this and press Enter:

  ```powershell
  irm https://raw.githubusercontent.com/dominic-pasquarelli/multi-twitch-viewer/main/scripts/windows/install.ps1 | iex
  ```

A window shows the progress. It downloads the newest code from GitHub, builds the app on your PC
and installs it. The first time takes about 5 minutes; after that, about 1–2. When it's done, the app
opens and **Multi Twitch Viewer** shortcuts are on your desktop and in the Start menu.

Nothing else is needed: no Node.js, Git or admin rights. The installer keeps its own private copy
of the build tools in `%LOCALAPPDATA%\MultiTwitchViewer-Builder` (safe to delete; a log of the
last run is saved there as `last-run.log`).

### Updates

The app checks GitHub for new code (at start and every 6 hours). When there is some, you get a
notification and an **Update now** button (also in **Settings → App updates** and the tray menu).
One click closes the app, rebuilds it from the latest code, reinstalls and reopens it. Your
presets, settings and Twitch login are kept.

So the whole pipeline is: **merge to `main` on GitHub → click Update now.** No GitHub Actions are
involved.

### First run

1. Do the [one-time Twitch setup](#one-time-twitch-setup-about-3-minutes) and log in when the app
   asks.
2. For Turbo in the players, open **Settings → Sign in to Twitch players** once. The desktop app
   has its own built-in browser, so it doesn't use your normal browser's Twitch login.

### How it behaves

- **Closing the window keeps it in the system tray** (bottom-right, near the clock). Streams stop,
  but go-live alerts for your favorites keep coming. Click the tray icon to reopen, or right-click
  → **Quit**.
- It reopens at the same size, position and monitor, maximized or fullscreen included, and
  restores your last streams.
- Its presets and settings are separate from the browser version (`npm start`). To move presets
  between them, use **Presets → Export / Import**.

## Run from source (any OS)

### Requirements

- [Node.js](https://nodejs.org/) **22.12 or newer** (24 LTS recommended; `.nvmrc` included).
- **Chrome or Edge** is recommended for Turbo; see [Turbo / no ads](#turbo--no-ads).

### Quick start

```bash
npm install
npm start          # builds and opens http://localhost:5757
```

To try the app without a Twitch account (fake channels and fake players):

```bash
npm run dev:mock
```

### One-time Twitch setup (about 3 minutes)

Seeing your followed channels needs a free Twitch "application" so the app can ask Twitch who you
follow. The app walks you through this (**Set up Twitch login**). The steps are:

1. Open the [Twitch developer console](https://dev.twitch.tv/console/apps/create). Twitch requires
   two-factor authentication on your account for this.
2. Register an application:
   - **Name**: anything unique, e.g. `yourname-multi-viewer`
   - **OAuth Redirect URL**: `http://localhost:5757` (exactly: no trailing slash, and `localhost`, not `127.0.0.1`)
   - **Category**: Website Integration
   - **Client type**: Public
3. Open the app's **Manage** page and copy the **Client ID**. You don't need the client secret.
4. Paste the Client ID into the app's setup screen and click **Save and log in**. Alternatively,
   copy `.env.example` to `.env.local` and set `VITE_TWITCH_CLIENT_ID=...`.

The app only asks for the `user:read:follows` permission. The login lasts about 60 days. After
that the app shows **Log in again**, which is one click because Twitch remembers you approved it.

## Turbo / no ads

**Desktop app:** use **Settings → Sign in to Twitch players** once; that's all.

**Browser version (`npm start`):** the video players are Twitch's official embedded players. They use the Twitch login from the
browser you run the app in, so your Turbo (or sub) benefits apply when:

1. You're logged in at [twitch.tv](https://www.twitch.tv) in the **same browser**, and
2. The browser lets the embedded players use their twitch.tv cookies (third-party cookies).
   - **Chrome and Edge** allow this by default. If you've blocked third-party cookies, add an
     exception: Settings → Privacy and security → Third-party cookies → _Allowed to use
     third-party cookies_ → add `[*.]twitch.tv`.
   - **Firefox, Safari and Brave** block or partition these cookies by default, so players may act
     logged out (ads, no Turbo). Use Chrome or Edge, or add a site exception for `twitch.tv` in
     their privacy settings.

A quick check: a player whose Twitch controls show your account (for example in chat, or the
lack of a "Log in" prompt) is logged in.

## Using it

| Do this                         | How                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------- |
| Add a stream                    | Click it in the sidebar, drag it in, or type names or links in the top box (`/`) |
| Remove a stream                 | Click it again in the sidebar, or use ✕ on the stream (then Undo)                |
| Choose what you hear            | `1`–`9`, the speaker button on a stream, or unmute it in the player              |
| Hear the others quietly         | **Duck** in the top bar (background level in Settings)                           |
| Change volume                   | `↑`/`↓`, or scroll over a stream's hover bar                                     |
| Get told when someone goes live | Star them in the sidebar; allow notifications in Settings → Go-live alerts       |
| Hear several at once            | `Shift+1`–`9`, or switch **Solo audio** to **Mix audio**                         |
| Make one stream big             | `L` or **Focus**; the ⤢ button on a stream makes it the main one                 |
| Rearrange                       | Drag a stream's grip (top-left on hover) onto another stream                     |
| Save the current setup          | **Presets** → **Save current…**                                                  |
| Keyboard shortcuts              | `?`                                                                              |

Shortcuts pause while a Twitch player has keyboard focus (after you click inside it). Moving the
mouse off the player hands focus back.

### Where your data lives

Everything stays in this browser's local storage for `http://localhost:5757`: presets, settings,
per-channel volumes, the last session and the Twitch login. Nothing is sent anywhere except
Twitch. To back up or move presets, use **Presets → Export / Import**.

Keep using the same address (`localhost:5757`). Browser storage is per address, so a different
port or `127.0.0.1` starts with empty presets.

## Troubleshooting

- **"redirect_mismatch" / "Parameter redirect_uri does not match"**: the OAuth Redirect URL in the
  Twitch console must be exactly `http://localhost:5757`.
- **Port 5757 is busy**: set `MTV_PORT=6000` in `.env.local` (any free port), and update the
  redirect URL in the Twitch console to match.
- **A stream shows a play button**: Twitch only autoplays players that are at least 400×300 and
  not covered by anything. Click to start it, or give it more room (fewer streams, focus layout,
  hide chat or the sidebar).
- **No sound after reopening the app**: browsers block sound until you interact with the page.
  Click anywhere or press any key.
- **Followed list is empty or says "login expired"**: click **Log in again**.

## Development

```bash
npm run dev          # dev server with hot reload (real Twitch)
npm run dev:mock     # dev server with fake Twitch data
npm run check        # typecheck + lint + unit tests
npm run test:e2e     # browser tests (first time: npx playwright install chromium)
npm run format       # prettier
npm run desktop      # run the desktop (Electron) app from source
npm run desktop:mock # …with fake Twitch data
npm run desktop:dist # build the Windows installer into release/ (best run on Windows)
```

The desktop app lives in `desktop/`, and the Windows install/update script in
`scripts/windows/install.ps1`. GitHub Actions (`.github/workflows/ci.yml`) only runs when started
by hand, so it never uses Actions minutes on its own; `npm run check` runs the same checks
locally.

Code is organised as independent, reusable modules. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the module map and how to extend or fix one
piece without touching the others.
