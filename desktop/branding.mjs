// @ts-check
import { join } from 'node:path';

export const APP_ID = 'com.dominicpasquarelli.multitwitchviewer';
export const APP_NAME = 'Multi Twitch Viewer';

/**
 * Windows Shell needs a real ICO on disk, rather than a PNG inside app.asar.
 * The tray keeps using the existing PNG on every platform.
 * @param {{ platform: string; isPackaged: boolean; resourcesPath: string; desktopDir: string }} opts
 */
export function desktopIcons(opts) {
  const trayIcon = join(opts.desktopDir, 'assets', 'icon.png');
  return {
    trayIcon,
    windowIcon:
      opts.platform === 'win32'
        ? opts.isPackaged
          ? join(opts.resourcesPath, 'app-icon.ico')
          : join(opts.desktopDir, 'assets', 'icon.ico')
        : trayIcon,
  };
}

/**
 * Set the taskbar group's own icon before the window is shown. Child login and
 * channel windows need the same identity so they cannot introduce Electron's
 * default icon into the group.
 * @param {{ setAppDetails(options: import('electron').AppDetailsOptions): void }} win
 * @param {{ platform: string; iconPath: string; execPath: string; appPath: string; isPackaged: boolean }} opts
 */
export function setWindowBranding(win, opts) {
  if (opts.platform !== 'win32') return;
  win.setAppDetails({
    appId: APP_ID,
    appIconPath: opts.iconPath,
    appIconIndex: 0,
    relaunchCommand: opts.isPackaged
      ? `"${opts.execPath}"`
      : `"${opts.execPath}" "${opts.appPath}"`,
    relaunchDisplayName: APP_NAME,
  });
}
