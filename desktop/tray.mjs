// @ts-check
import { Menu, Tray, nativeImage } from 'electron';

/**
 * Tray icon: click to show the window; menu to show, install an update, or quit.
 * @param {{ iconPath: string; onShow(): void; onQuit(): void; onInstallUpdate(): void }} opts
 */
export function createTray(opts) {
  const image = nativeImage.createFromPath(opts.iconPath).resize({ width: 16, height: 16 });
  const tray = new Tray(image);
  tray.setToolTip('Multi Twitch Viewer');
  let updateReady = false;
  const render = () =>
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Show Multi Twitch Viewer', click: opts.onShow },
        ...(updateReady
          ? [{ label: 'Restart to install update', click: opts.onInstallUpdate }]
          : []),
        { type: 'separator' },
        { label: 'Quit', click: opts.onQuit },
      ]),
    );
  render();
  tray.on('click', opts.onShow);
  return {
    tray,
    setUpdateReady() {
      updateReady = true;
      tray.setToolTip('Multi Twitch Viewer: update ready (restart to install)');
      render();
    },
  };
}
