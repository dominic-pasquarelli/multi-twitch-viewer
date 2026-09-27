// @ts-check
// Runs in the app window before the page. Exposes a small, safe API as
// `window.mtvDesktop`; the page has no other access to Electron or Node.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mtvDesktop', {
  isDesktop: true,
  version: process.argv.find((a) => a.startsWith('--mtv-version='))?.split('=')[1] ?? '',
  showWindow: () => ipcRenderer.send('mtv:show-window'),
  openTwitchSignIn: () => ipcRenderer.invoke('mtv:twitch-sign-in'),
  /** @param {(hidden: boolean) => void} callback */
  onBackgroundChange: (callback) => {
    /** @param {unknown} _event @param {unknown} hidden */
    const listener = (_event, hidden) => callback(Boolean(hidden));
    ipcRenderer.on('mtv:background', listener);
    return () => ipcRenderer.removeListener('mtv:background', listener);
  },
});
