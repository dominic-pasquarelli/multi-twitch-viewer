import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The real Electron app, showing the mock build (see playwright.config.ts).
 * Needs a display: run under xvfb-run on Linux CI.
 */

const launch = (userData: string) =>
  electron.launch({
    // Test-only: CI runners and root shells can't use Chromium's sandbox helper.
    args: ['.', ...(process.env.CI || process.getuid?.() === 0 ? ['--no-sandbox'] : [])],
    env: { ...process.env, MTV_USER_DATA: userData },
  });

const mainWindow = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    return { visible: w.isVisible(), bounds: w.getBounds() };
  });

// Two app launches in one test; CI runners start Electron slowly.
test.describe.configure({ mode: 'serial', timeout: 90_000 });

test('desktop app: plays streams, hides to the tray, remembers its window', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'mtv-desktop-'));
  let app = await launch(userData);
  let win = await app.firstWindow();

  await expect(win).toHaveTitle('Multi Twitch Viewer');
  expect(await win.evaluate(() => navigator.userAgent.includes('Electron'))).toBe(false);
  await win.evaluate(() => (location.hash = '#/pixelpaladin/novastrike'));
  await expect(win.getByTestId('player-tile')).toHaveCount(2);

  // Closing the window keeps the app in the tray, with the streams stopped.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
  await expect.poll(async () => (await mainWindow(app)).visible).toBe(false);
  await expect(win.getByTestId('player-tile')).toHaveCount(0);

  // A notification click / tray click brings it back with the streams.
  await win.evaluate(() =>
    (window as unknown as { mtvDesktop: { showWindow(): void } }).mtvDesktop.showWindow(),
  );
  await expect.poll(async () => (await mainWindow(app)).visible).toBe(true);
  await expect(win.getByTestId('player-tile')).toHaveCount(2);

  // Links elsewhere never take over the app window.
  await win.evaluate(() => (location.href = 'https://example.com/'));
  await win.waitForTimeout(300);
  expect(win.url()).toContain('http://localhost:5757/');

  // Window position is remembered across restarts.
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setBounds({ x: 40, y: 50, width: 1100, height: 700 }),
  );
  await expect
    .poll(() => {
      try {
        return JSON.parse(readFileSync(join(userData, 'window-state.json'), 'utf8')).bounds?.width;
      } catch {
        return undefined;
      }
    })
    .toBe(1100);
  await app.evaluate(({ app: a }) => a.quit());
  await app.close().catch(() => {});

  app = await launch(userData);
  win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  const { bounds } = await mainWindow(app);
  expect(bounds).toMatchObject({ width: 1100, height: 700 });
  // The last session (streams) comes back too.
  await expect(win.getByTestId('player-tile')).toHaveCount(2);
  await app.evaluate(({ app: a }) => a.quit());
  await app.close().catch(() => {});
});

test("desktop app: hides Twitch's stream info and content notice in the players (settings)", async () => {
  const app = await launch(mkdtempSync(join(tmpdir(), 'mtv-desktop-')));
  const win = await app.firstWindow();
  // A stand-in for Twitch's player: stream info on top, controls below.
  await app.context().route('https://player.twitch.tv/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<style>body{margin:0;height:300px}video{position:absolute;inset:0}</style><div><video></video><div>
        <div id="info"><a href="https://www.twitch.tv/tpain">TPAIN</a>
          <button data-a-target="subscribe-button">Subscribe</button></div>
        <div data-a-target="player-controls" id="controls"><button>play</button></div>
        <div id="gate"><button onclick="this.parentElement.remove()">Start Watching</button></div>
        <button data-a-target="player-overlay-play-button" onclick="window.presses = (window.presses || 0) + 1">play</button>
      </div></div>`,
    }),
  );
  await win.evaluate(() => {
    const f = document.createElement('iframe');
    f.src = 'https://player.twitch.tv/?channel=tpain&parent=localhost';
    f.style.cssText = 'position:fixed;left:300px;top:200px;width:400px;height:300px;z-index:99';
    document.body.append(f);
  });
  const player = () => win.frames().find((f) => f.url().startsWith('https://player.twitch.tv'));
  const hiddenIds = () =>
    player()!.evaluate(() => [...document.querySelectorAll('[data-mtv-hidden]')].map((e) => e.id));

  await expect.poll(() => player()?.url() ?? '').toContain('player.twitch.tv');
  await expect.poll(hiddenIds).toEqual(['info']);
  // The "intended for certain audiences" notice is clicked through.
  await expect.poll(() => player()!.evaluate(() => !!document.getElementById('gate'))).toBe(false);

  // Play all presses play inside the player itself.
  await win.evaluate(() =>
    (window as unknown as { mtvDesktop: { playAll(): void } }).mtvDesktop.playAll(),
  );
  await expect
    .poll(() => player()!.evaluate(() => (window as unknown as { presses?: number }).presses))
    .toBe(1);

  // Right-clicking inside a player closes that stream (a small one).
  await win.evaluate(() => (location.hash = '#/pixelpaladin/tpain'));
  await expect(win.locator('[data-testid=player-tile][data-channel=tpain]')).toHaveCount(1);
  const frameBox = (await win.locator('iframe[src*="player.twitch.tv"]').boundingBox())!;
  // Retried: a click that lands before the frame takes input is ignored.
  await expect(async () => {
    await win.mouse.click(frameBox.x + 200, frameBox.y + 250, { button: 'right' });
    await expect(win.locator('[data-testid=player-tile][data-channel=tpain]')).toHaveCount(0, {
      timeout: 1000,
    });
  }).toPass({ timeout: 10_000 });

  // Turning the setting off shows it again.
  await win.evaluate(() =>
    (
      window as unknown as { mtvDesktop: { setPlayerChrome(o: Record<string, boolean>): void } }
    ).mtvDesktop.setPlayerChrome({ hideStreamInfo: false, skipContentWarning: false }),
  );
  await expect.poll(hiddenIds).toEqual([]);
  await app.close();
});

test('desktop app: fullscreen never gets stuck', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'mtv-desktop-'));
  // An old saved state from a session that ended in fullscreen.
  writeFileSync(
    join(userData, 'window-state.json'),
    JSON.stringify({ bounds: { x: 40, y: 50, width: 1100, height: 700 }, fullscreen: true }),
  );
  const app = await launch(userData);
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  const isFullScreen = () =>
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isFullScreen());
  expect(await isFullScreen()).toBe(false); // not restored

  // F (the app's fullscreen) and back out with F again.
  await win.locator('body').click({ position: { x: 5, y: 300 } });
  await win.keyboard.press('f');
  await expect.poll(isFullScreen).toBe(true);
  await expect.poll(() => win.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await win.keyboard.press('f');
  await expect.poll(isFullScreen).toBe(false);

  // F11 toggles the window's own fullscreen; Esc leaves it.
  // Real key presses (Playwright's synthetic keys skip the app's key handler).
  const press = (keyCode: string) =>
    app.evaluate(({ BrowserWindow }, k) => {
      const wc = BrowserWindow.getAllWindows()[0]!.webContents;
      wc.sendInputEvent({ type: 'keyDown', keyCode: k });
      wc.sendInputEvent({ type: 'keyUp', keyCode: k });
    }, keyCode);
  await press('F11');
  await expect.poll(isFullScreen).toBe(true);
  await press('Escape');
  await expect.poll(isFullScreen).toBe(false);
  await app.evaluate(({ app: a }) => a.quit());
  await app.close().catch(() => {});
});
