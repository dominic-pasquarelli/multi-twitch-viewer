// @ts-check
// Runs in the app window before the page. Exposes a small, safe API as
// `window.mtvDesktop`; the page has no other access to Electron or Node.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mtvDesktop', {
  isDesktop: true,
  version: process.argv.find((a) => a.startsWith('--mtv-version='))?.split('=')[1] ?? '',
  showWindow: () => ipcRenderer.send('mtv:show-window'),
  openTwitchSignIn: () => ipcRenderer.invoke('mtv:twitch-sign-in'),
  /** @param {string} login */
  openTwitchChannel: (login) => ipcRenderer.invoke('mtv:twitch-channel', String(login)),
  getUpdateStatus: () => ipcRenderer.invoke('mtv:update-status'),
  checkForUpdates: () => ipcRenderer.invoke('mtv:update-check'),
  installUpdate: () => ipcRenderer.send('mtv:update-install'),
  /** @param {readonly string[] | undefined} channels */
  playAll: (channels) => ipcRenderer.send('mtv:play-all', channels),
  /** @param {{ hideStreamInfo: boolean, skipContentWarning: boolean }} options */
  setPlayerChrome: (options) =>
    ipcRenderer.send('mtv:player-chrome', {
      hideStreamInfo: Boolean(options?.hideStreamInfo),
      skipContentWarning: Boolean(options?.skipContentWarning),
    }),
  /** @param {(status: unknown) => void} callback */
  onUpdateStatus: (callback) => {
    /** @param {unknown} _event @param {unknown} status */
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('mtv:update-status', listener);
    return () => ipcRenderer.removeListener('mtv:update-status', listener);
  },
  /** @param {(channel: string) => void} callback */
  onPlayerContextMenu: (callback) => {
    /** @param {unknown} _event @param {unknown} channel */
    const listener = (_event, channel) => callback(String(channel));
    ipcRenderer.on('mtv:player-context-menu', listener);
    return () => ipcRenderer.removeListener('mtv:player-context-menu', listener);
  },
  /** @param {(error: {channel: string, code: 3000}) => void} callback */
  onPlayerError: (callback) => {
    /** @param {unknown} _event @param {{channel: string, code: 3000}} error */
    const listener = (_event, error) => callback(error);
    ipcRenderer.on('mtv:player-error', listener);
    return () => ipcRenderer.removeListener('mtv:player-error', listener);
  },
  /** @param {(hidden: boolean) => void} callback */
  onBackgroundChange: (callback) => {
    /** @param {unknown} _event @param {unknown} hidden */
    const listener = (_event, hidden) => callback(Boolean(hidden));
    ipcRenderer.on('mtv:background', listener);
    return () => ipcRenderer.removeListener('mtv:background', listener);
  },
});
