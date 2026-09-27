// @ts-check
// Automatic updates from the GitHub releases page (electron-updater). New
// versions download in the background and install when the app restarts.
import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;
const CHECK_EVERY = 6 * 60 * 60 * 1000;

/** @param {{ onReady(version: string): void }} opts */
export function startAutoUpdates(opts) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', (info) => opts.onReady(info.version));
  autoUpdater.on('error', (err) => console.warn('[updates]', err?.message ?? err));
  const check = () => void autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, CHECK_EVERY);
  return { installNow: () => autoUpdater.quitAndInstall() };
}
