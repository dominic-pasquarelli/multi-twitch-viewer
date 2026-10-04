// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { APP_ID, desktopIcons, setWindowBranding } from './branding.mjs';

describe('Windows taskbar branding', () => {
  it('uses a real packaged ICO outside the archive while keeping the tray PNG', () => {
    expect(
      desktopIcons({
        platform: 'win32',
        isPackaged: true,
        resourcesPath: '/installed/resources',
        desktopDir: '/installed/resources/app.asar/desktop',
      }),
    ).toEqual({
      windowIcon: join('/installed/resources', 'app-icon.ico'),
      trayIcon: join('/installed/resources/app.asar/desktop', 'assets', 'icon.png'),
    });
    expect(
      desktopIcons({
        platform: 'win32',
        isPackaged: false,
        resourcesPath: '/electron/resources',
        desktopDir: '/source/desktop',
      }).windowIcon,
    ).toBe(join('/source/desktop', 'assets', 'icon.ico'));
  });

  it('sets a group icon and paired relaunch fields for installed and development windows', () => {
    const setAppDetails = vi.fn();
    const opts = {
      platform: 'win32',
      iconPath: 'C:\\Program Files\\MTV\\resources\\app-icon.ico',
      execPath: 'C:\\Program Files\\MTV\\Multi Twitch Viewer.exe',
      appPath: 'C:\\Source with spaces\\Multi Twitch Viewer',
      isPackaged: true,
    };
    setWindowBranding({ setAppDetails }, opts);
    expect(setAppDetails).toHaveBeenLastCalledWith({
      appId: APP_ID,
      appIconPath: opts.iconPath,
      appIconIndex: 0,
      relaunchCommand: `"${opts.execPath}"`,
      relaunchDisplayName: 'Multi Twitch Viewer',
    });
    setWindowBranding({ setAppDetails }, { ...opts, isPackaged: false });
    expect(setAppDetails.mock.calls[1][0].relaunchCommand).toBe(
      `"${opts.execPath}" "${opts.appPath}"`,
    );
    setWindowBranding({ setAppDetails }, { ...opts, platform: 'linux' });
    expect(setAppDetails).toHaveBeenCalledTimes(2);
  });
});

describe('Windows ICO asset', () => {
  it('has bitmap frames for taskbar sizes, correct transparency masks, and the unchanged branding PNG at 256px', () => {
    const ico = readFileSync(new URL('./assets/icon.ico', import.meta.url));
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    const sizes = [16, 24, 32, 48, 64, 128, 256];
    expect(ico.readUInt16LE(4)).toBe(sizes.length);
    for (const [i, size] of sizes.entries()) {
      const entry = 6 + 16 * i;
      expect(ico[entry] || 256).toBe(size);
      expect(ico[entry + 1] || 256).toBe(size);
      const length = ico.readUInt32LE(entry + 8);
      const offset = ico.readUInt32LE(entry + 12);
      expect(offset + length).toBeLessThanOrEqual(ico.length);
      const frame = ico.subarray(offset, offset + length);
      if (size === 256) {
        expect(frame.equals(readFileSync(new URL('./assets/icon.png', import.meta.url)))).toBe(
          true,
        );
        continue;
      }
      expect(frame.readUInt32LE(0)).toBe(40);
      expect(frame.readInt32LE(4)).toBe(size);
      expect(frame.readInt32LE(8)).toBe(size * 2);
      expect(frame.readUInt16LE(14)).toBe(32);
      const maskStride = Math.ceil(size / 32) * 4;
      expect(length).toBe(40 + size * size * 4 + maskStride * size);
      const maskOffset = 40 + size * size * 4;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const alpha = frame[40 + (y * size + x) * 4 + 3];
          const masked = !!(
            frame[maskOffset + y * maskStride + Math.floor(x / 8)] &
            (1 << (7 - (x % 8)))
          );
          expect(masked).toBe(alpha === 0);
        }
      }
    }
  });
});
