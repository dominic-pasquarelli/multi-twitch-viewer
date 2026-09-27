import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { mkdtempSync, readFileSync } from 'node:fs';
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
      </div></div>`,
    }),
  );
  await win.evaluate(() => {
    const f = document.createElement('iframe');
    f.src = 'https://player.twitch.tv/?channel=tpain&parent=localhost';
    document.body.append(f);
  });
  const player = () => win.frames().find((f) => f.url().startsWith('https://player.twitch.tv'));
  const hiddenIds = () =>
    player()!.evaluate(() => [...document.querySelectorAll('[data-mtv-hidden]')].map((e) => e.id));

  await expect.poll(() => player()?.url() ?? '').toContain('player.twitch.tv');
  await expect.poll(hiddenIds).toEqual(['info']);
  // The "intended for certain audiences" notice is clicked through.
  await expect.poll(() => player()!.evaluate(() => !!document.getElementById('gate'))).toBe(false);

  // Turning the setting off shows it again.
  await win.evaluate(() =>
    (
      window as unknown as { mtvDesktop: { setPlayerChrome(o: Record<string, boolean>): void } }
    ).mtvDesktop.setPlayerChrome({ hideStreamInfo: false, skipContentWarning: false }),
  );
  await expect.poll(hiddenIds).toEqual([]);
  await app.close();
});
