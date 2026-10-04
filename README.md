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
    With many streams, **Auto** fills a column down the right side, then a row along the bottom,
    before adding a second column.
  - Turn on **Arrange**, then drag anywhere on a stream onto another to swap them. Streams
    never reload when they move.
  - Offline channels step aside and give their space to live ones, then come back when they go live.
- **Favorites and go-live alerts**: star channels (☆ on hover in the sidebar) to keep them at the
  top. When a favorite goes live you get a Windows notification; click it to start watching.
  Settings can switch this to everyone you follow, or off.
- **Controls on each stream**: hovering a stream shows its controls (listen, volume, make main,
  chat, reload, open on Twitch, remove) in a compact overlay at the top of its video. The controls
  disappear when you leave the stream, and stay open while you edit its volume. If a stream pauses on its own it resumes automatically; one
  you paused yourself (clicked inside the player) stays paused.
- **Stream groups**: **Create group / Manage groups** names related perspectives and assigns streams.
  **All groups** clusters them together; group tabs isolate one group and pause hidden streams.
  Returning restores the same mix and volumes, keeping manual pauses. Groups save with sessions and presets.
- **Connection recovery**: sustained playback starvation reduces background quality to 360p (or
  the lowest available rendition) and temporarily pauses muted streams. After the connection settles,
  streams resume one at a time. Turn off **Automatic bandwidth saving** in **Settings → Players**
  to keep your selected qualities and resume streams paused by this mode. Manual and hidden-group
  pauses are preserved. The desktop app also reloads decoding Error #3000 with bounded retries;
  the browser version can recover sustained stalls but cannot read an error inside Twitch's iframe.
- **Audio without the chaos**: pick a stream with `1`–`9` or its speaker button, and choose what
  the others do (top bar):
  - **Solo**: the others are muted. Unmuting inside a Twitch player also mutes the rest.
  - **Duck**: the others keep playing quietly (20% by default) so you notice when something happens.
  - **Mix** (`Shift+1`–`9`): several streams at full volume.
    Changing the main video keeps your mix. Hover a stream to adjust its volume directly on the video.
  - **Mixer** (sliders button next to them): every stream's volume in one list, to balance the
    streams you hear together.
  - **Consistent volume** (in the Mixer or Settings → Audio): every stream you switch to plays at
    one master volume. Mixer sliders then just even out a loud or quiet streamer.
  - `↑`/`↓` changes the volume of the stream you're hearing, or scroll over the stream controls
    in the top bar. Volume is remembered **per channel**, so loud streamers stay tamed. `M` mutes all and restores.
- **Temporary views**: a view you put together drops streams once they go offline (after about
  1½ minutes, with Undo). A view loaded from or saved as a preset keeps them (hidden until they're
  live again). Switch it per view at the top of **Presets**, or turn it off in Settings → Layout.
- **History and following**: channels you watch without following them are kept under
  **History** in the sidebar, to bring back later. The ♡ button (top-bar controls, _Also watching_ and
  History) opens the channel's Twitch page to follow it; Twitch doesn't let apps follow for you.
  Collapsed followed and history icons show the same hover preview as the expanded sidebar.
- **Discovery**: the sidebar's **Discover** tab searches channel names or Twitch categories.
  Selecting a category lists its live streams. Filter loaded results by title, tags, category or language.
- **Presets**: save the current streams, layout, audio and chat as a named preset and load it in
  one click, with a live count for each. Export and import them as a JSON file for backup.
- **Bookmarkable links**: the address bar always matches what you're watching
  (`http://localhost:5757/#/chan1/chan2?layout=focus`). Pasting a multitwitch.tv link into the
  add box loads all of its channels.
- **Also**: tabbed chat (`C`) that follows the stream you're hearing, fullscreen (`F`), undo
  (`Ctrl+Z`).
- **Quality where it counts**: the main stream plays at source quality, the smaller ones at a
  quality that matches their size (never below 360p), which saves bandwidth and CPU. Change both in
  **Settings → Players**.

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
notification and an **Update now** button (also in **Settings → App & updates** and the tray menu).
One click closes the app, rebuilds it from the latest code, reinstalls and reopens it. Your
presets, settings and Twitch login are kept.

So the whole pipeline is: **merge to `main` on GitHub → click Update now.** No GitHub Actions are
involved.

### First run

1. Do the [one-time Twitch setup](#one-time-twitch-setup-about-3-minutes) and log in when the app
   asks.
2. For Turbo in the players, open **Settings → Account → Sign in to Twitch players** once. The desktop app
   has its own built-in browser, so it doesn't use your normal browser's Twitch login.

### How it behaves

- **Closing the window keeps it in the system tray** (bottom-right, near the clock). Streams stop,
  but go-live alerts for your favorites keep coming. Click the tray icon to reopen, or right-click
  → **Quit**.
- Twitch's own stream info at the top of each player (channel, title, Follow/Subscribe/Gift) is
  hidden so it doesn't get in the way; Twitch's play, volume and fullscreen buttons stay. The
  "intended for certain audiences" notice is clicked through for you (blurred streams start playing). Both can be turned off in
  **Settings → Players**.
- Fullscreen: `F` (the app) or `F11` (the window); `F`, `F11` or `Esc` leaves it. It always opens
  windowed, so it can be moved to another monitor.
- It reopens at the same size, position and monitor, maximized included, and
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
   - **Name**: anything unique that does **not** contain the word “Twitch” (Twitch rejects
     those with “Invalid client name”), e.g. `yourname-multiviewer`
   - **OAuth Redirect URL**: `http://localhost:5757` (exactly: no trailing slash, and `localhost`, not `127.0.0.1`)
   - **Category**: Website Integration
   - **Client type**: Public
3. Open the app's **Manage** page and copy the **Client ID**. You don't need the client secret.
4. Paste the Client ID into the app's setup screen and click **Save and log in**. Alternatively,
   copy `.env.example` to `.env.local` and set `VITE_TWITCH_CLIENT_ID=...`.

The app only asks for the `user:read:follows` permission. The login lasts about 60 days. After
that the app shows **Log in again**, which is one click because Twitch remembers you approved it.

## Turbo / no ads

**Desktop app:** use **Settings → Account → Sign in to Twitch players** once; that's all.

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

| Do this                          | How                                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Add a stream                     | Click it in the sidebar, drag it in, or type names or links in the top box (`/`)                                |
| Remove a stream                  | Right-click its bar (or its video in the desktop app), click it again in the sidebar, or ✕ above it (then Undo) |
| Choose what you hear             | `1`–`9`, click the stream (grid with Solo/Duck), the speaker button in the top bar, or unmute it in the player  |
| Hear the others quietly          | **Duck** in the top bar (background level in Settings)                                                          |
| Change volume                    | `↑`/`↓`, or scroll over the stream controls in the top bar                                                      |
| Get told when someone goes live  | Star them in the sidebar; allow notifications in Settings → Alerts                                              |
| Hear several at once             | `Shift+1`–`9`, or switch **Solo audio** to **Mix audio**                                                        |
| Balance volumes                  | The Mixer (sliders button in the top bar); **Consistent volume** keeps switching even                           |
| Pause / unpause streams          | **Pause all** / **Play all** in the top bar; hidden groups stay paused                                          |
| Watch everyone who's live        | **Watch all** next to _Live_ in the sidebar (only the matches, if you filtered)                                 |
| Start over with no streams       | 🗑 **Clear all** in the top bar (then Undo if it was a mistake)                                                  |
| Remove a stream you don't follow | Click it under **Also watching** in the sidebar, or ✕ in the Mixer                                              |
| Make one stream big              | `L` or **Focus**; click a small playing stream (or ⤢ in the top bar) to make it main                            |
| Rearrange                        | Enable **Arrange**, then drag a stream window onto another                                                      |
| Save the current setup           | **Presets** → **Save current…**                                                                                 |
| Keyboard shortcuts               | `?`                                                                                                             |

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
- **A stream shows unmuted but makes no sound**: fixed in the desktop app, which now lets the app
  unmute players itself. If it happens anyway, use **Reload player** (hover the stream, top bar).
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
