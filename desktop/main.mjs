// @ts-check
// Electron entry point: one window showing the web app from a local server,
// living in the tray when closed, remembering its position, updating itself.
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Notification,
  screen,
  session,
  shell,
  webFrameMain,
} from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_PERMISSIONS,
  chromeUserAgent,
  isAllowedInApp,
  isExternalWebLink,
} from './navigation.mjs';
import { applyPlayerChrome } from './playerChrome.mjs';
import { APP_URL, startServer } from './server.mjs';
import { createTray } from './tray.mjs';
import { checkForUpdate, readBuildCommit, startUpdater } from './updates.mjs';
import { parseState, restoreBounds } from './windowState.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const APP_ID = 'com.dominicpasquarelli.multitwitchviewer';
const ICON = join(here, 'assets', 'icon.png');
const WEB_ROOT = process.env.MTV_WEB_ROOT ?? join(here, '..', 'dist');
// Tests run with a throwaway profile folder.
if (process.env.MTV_USER_DATA) app.setPath('userData', process.env.MTV_USER_DATA);
const STATE_FILE = join(app.getPath('userData'), 'window-state.json');

/** @type {BrowserWindow | null} */
let win = null;
let quitting = false;
/** @type {ReturnType<typeof createTray> | null} */
let tray = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(start);
}

app.setAppUserModelId(APP_ID); // Windows notifications need this
app.userAgentFallback = chromeUserAgent(app.userAgentFallback);

async function start() {
  try {
    await startServer(WEB_ROOT);
  } catch {
    dialog.showErrorBox(
      'Multi Twitch Viewer',
      'Port 5757 is already in use, so the app can’t start.\n\nIs the web version (npm start) still running? Close it and try again.',
    );
    app.quit();
    return;
  }

  session.defaultSession.setPermissionRequestHandler((_wc, permission, done) =>
    done(ALLOWED_PERMISSIONS.has(permission)),
  );
  session.defaultSession.setPermissionCheckHandler((_wc, permission) =>
    ALLOWED_PERMISSIONS.has(permission),
  );

  createWindow();
  tray = createTray({
    iconPath: ICON,
    onShow: showWindow,
    onQuit: () => {
      quitting = true;
      app.quit();
    },
    onInstallUpdate: () => installUpdate(),
  });

  startUpdateChecks();

  ipcMain.on('mtv:show-window', () => showWindow());
  ipcMain.handle('mtv:twitch-sign-in', () => openTwitchSignIn());
  ipcMain.handle('mtv:update-status', () => updateStatus);
  ipcMain.handle('mtv:update-check', () => runUpdateCheck());
  ipcMain.on('mtv:update-install', () => installUpdate());
  ipcMain.on('mtv:player-chrome', (_e, options) => {
    playerChrome = { hideStreamInfo: Boolean(options?.hideStreamInfo) };
    for (const frame of win?.webContents.mainFrame.framesInSubtree ?? []) {
      applyPlayerChrome(frame, playerChrome);
    }
  });
}

/** How Twitch's own player UI should look (set from the app's settings). */
let playerChrome = { hideStreamInfo: true };

// ---- Updates ---------------------------------------------------------------

const UPDATE_CHECK_EVERY = 6 * 60 * 60 * 1000;
const buildCommit = readBuildCommit(app.getAppPath());
/** @type {import('./updates.mjs').UpdateStatus} */
let updateStatus = { state: buildCommit ? 'checking' : 'dev', current: buildCommit };
/** @type {string | null} */
let notifiedFor = null;

async function runUpdateCheck() {
  updateStatus = await checkForUpdate(buildCommit);
  win?.webContents.send('mtv:update-status', updateStatus);
  tray?.setUpdateAvailable(updateStatus.state === 'available');
  if (updateStatus.state === 'available' && updateStatus.latest !== notifiedFor) {
    notifiedFor = updateStatus.latest ?? null;
    const n = new Notification({
      title: 'Update available',
      body: `${updateStatus.latestMessage ?? 'A new version is on GitHub.'}\nOpen Settings or the tray menu to install it.`,
    });
    n.on('click', () => showWindow());
    n.show();
  }
  return updateStatus;
}

function startUpdateChecks() {
  if (!buildCommit) return; // running from source: update with git instead
  setTimeout(() => void runUpdateCheck(), 15_000);
  setInterval(() => void runUpdateCheck(), UPDATE_CHECK_EVERY);
}

/**
 * Starts the installer script in its own window. It rebuilds the app, then
 * closes this one, installs the new version and reopens it.
 */
function installUpdate() {
  if (process.platform !== 'win32' || updateStatus.state === 'installing') return;
  try {
    startUpdater({ dir: app.getPath('userData') });
    updateStatus = { ...updateStatus, state: 'installing' };
  } catch (err) {
    updateStatus = { ...updateStatus, state: 'error', error: `Couldn't start the updater: ${err}` };
  }
  win?.webContents.send('mtv:update-status', updateStatus);
  tray?.setUpdateAvailable(false);
}

function createWindow() {
  const state = readState();
  const bounds = restoreBounds(
    state.bounds,
    screen
      .getAllDisplays()
      .sort((a) => (a.id === screen.getPrimaryDisplay().id ? -1 : 1))
      .map((d) => d.workArea),
  );
  win = new BrowserWindow({
    ...bounds,
    minWidth: 640,
    minHeight: 400,
    title: 'Multi Twitch Viewer',
    icon: ICON,
    backgroundColor: '#0e0e10',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Keep checking who's live (for alerts) while hidden in the tray.
      backgroundThrottling: false,
      additionalArguments: [`--mtv-version=${app.getVersion()}`],
    },
  });
  win.setMenu(null);
  if (state.maximized) win.maximize();
  if (state.fullscreen) win.setFullScreen(true);
  win.once('ready-to-show', () => win?.show());

  const wc = win.webContents;
  // Links to anything but the app/Twitch login open in the normal browser.
  wc.setWindowOpenHandler(({ url }) => {
    if (isExternalWebLink(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (event, url) => {
    if (!isAllowedInApp(url)) {
      event.preventDefault();
      if (isExternalWebLink(url)) void shell.openExternal(url);
    }
  });
  // Each Twitch player (an iframe) gets its UI tweaks once it has loaded.
  wc.on('did-frame-finish-load', (_e, isMainFrame, processId, routingId) => {
    if (!isMainFrame) applyPlayerChrome(webFrameMain.fromId(processId, routingId), playerChrome);
  });
  wc.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    if (input.control && input.shift && key === 'i') wc.toggleDevTools();
    else if (key === 'f5' || (input.control && key === 'r')) wc.reload();
  });

  // Closing hides to the tray (streams stop; alerts keep coming). Quit from the tray.
  win.on('close', (event) => {
    saveState();
    if (quitting) return;
    event.preventDefault();
    win?.hide();
    wc.send('mtv:background', true);
    const s = readState();
    if (!s.trayHintShown) {
      new Notification({
        title: 'Still running in the tray',
        body: 'Multi Twitch Viewer keeps watching for channels going live. Right-click the tray icon to quit.',
      }).show();
      writeState({ ...s, trayHintShown: true });
    }
  });
  for (const e of /** @type {const} */ ([
    'resize',
    'move',
    'maximize',
    'unmaximize',
    'enter-full-screen',
    'leave-full-screen',
  ])) {
    win.on(/** @type {any} */ (e), debounce(saveState, 500));
  }

  void win.loadURL(APP_URL);
}

function showWindow() {
  if (!win) return;
  if (!win.isVisible()) win.webContents.send('mtv:background', false);
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/** Signs in to twitch.tv inside the app, so the players get Turbo/sub benefits. */
function openTwitchSignIn() {
  return new Promise((resolve) => {
    const child = new BrowserWindow({
      parent: win ?? undefined,
      modal: true,
      width: 520,
      height: 760,
      title: 'Sign in to Twitch',
      autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, sandbox: true },
    });
    child.setMenu(null);
    child.webContents.setWindowOpenHandler(({ url }) => {
      if (isExternalWebLink(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    // Done once Twitch leaves the login page.
    child.webContents.on('did-navigate', (_e, url) => {
      const u = new URL(url);
      if (u.hostname === 'www.twitch.tv' && !u.pathname.startsWith('/login')) child.close();
    });
    child.on('closed', () => {
      win?.webContents.reload(); // reload players so they pick up the sign-in
      resolve(undefined);
    });
    void child.loadURL('https://www.twitch.tv/login');
  });
}

/** @returns {import('./windowState.mjs').WindowState} */
function readState() {
  try {
    return parseState(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

/** @param {import('./windowState.mjs').WindowState} state */
function writeState(state) {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch {
    // not critical
  }
}

function saveState() {
  if (!win || win.isDestroyed()) return;
  const current = readState();
  writeState({
    ...current,
    // Normal (non-maximized) bounds, so un-maximizing later restores properly.
    bounds: win.getNormalBounds(),
    maximized: win.isMaximized(),
    fullscreen: win.isFullScreen(),
  });
}

/** @template {(...args: any[]) => void} F @param {F} fn @param {number} ms */
function debounce(fn, ms) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let t;
  return /** @type {F} */ (
    (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    }
  );
}

app.on('before-quit', () => {
  quitting = true;
  saveState();
});
// Stay alive in the tray when the window is hidden.
app.on('window-all-closed', () => {});
