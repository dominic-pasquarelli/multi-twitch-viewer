import { expect, test, type Page } from '@playwright/test';

const tiles = (page: Page) => page.getByTestId('player-tile');
const tile = (page: Page, channel: string) =>
  page.locator(`[data-testid=player-tile][data-channel=${channel}]`);
const box = async (page: Page, channel: string) => (await tile(page, channel).boundingBox())!;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('channel-row').first()).toBeVisible();
});

test('adds live follows with one click and tiles them to fill the screen', async ({ page }) => {
  const rows = page.getByTestId('channel-row');
  for (let i = 0; i < 4; i++) await rows.nth(i).click();
  await expect(tiles(page)).toHaveCount(4);

  const viewer = (await page.getByTestId('viewer').boundingBox())!;
  const areas = await tiles(page).evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect()).map((r) => r.width * r.height),
  );
  const filled = areas.reduce((a, b) => a + b, 0) / (viewer.width * viewer.height);
  expect(filled).toBeGreaterThan(0.6);

  // Clicking again removes it; Undo brings it back.
  await rows.nth(0).click();
  await expect(tiles(page)).toHaveCount(3);
  await page.keyboard.press('Control+z');
  await expect(tiles(page)).toHaveCount(4);
});

test('only one stream is audible and number keys switch it', async ({ page }) => {
  await page.goto('/#/pixelpaladin/novastrike/cozycartographer');
  await expect(tiles(page)).toHaveCount(3);
  await expect(tile(page, 'pixelpaladin')).toHaveAttribute('data-audible', 'true');

  await page.keyboard.press('3');
  await expect(tile(page, 'cozycartographer')).toHaveAttribute('data-audible', 'true');
  await expect(tile(page, 'pixelpaladin')).toHaveAttribute('data-audible', 'false');
  // The (mock) player really got unmuted, the others muted.
  await expect(tile(page, 'cozycartographer').locator('.mock-player')).toHaveAttribute(
    'data-muted',
    'false',
  );
  await expect(tile(page, 'pixelpaladin').locator('.mock-player')).toHaveAttribute(
    'data-muted',
    'true',
  );

  await page.keyboard.press('m');
  await expect(page.locator('[data-audible=true]')).toHaveCount(0);
  await page.keyboard.press('m');
  await expect(tile(page, 'cozycartographer')).toHaveAttribute('data-audible', 'true');
});

test('focus layout makes one stream big, and dragging swaps streams', async ({ page }) => {
  await page.goto('/#/pixelpaladin/novastrike/cozycartographer/lunarlatte?layout=focus');
  await expect(tiles(page)).toHaveCount(4);
  const main = await box(page, 'pixelpaladin');
  const other = await box(page, 'lunarlatte');
  expect(main.width).toBeGreaterThan(other.width * 1.5);

  // Nothing is drawn on top of a stream; hovering it shows its controls in
  // the top bar, and dragging its name there onto another stream swaps them.
  await tile(page, 'lunarlatte').hover();
  await expect(tile(page, 'lunarlatte').locator('button')).toHaveCount(0);
  const chip = page.getByTestId('stream-chip');
  await expect(chip).toContainText('LunarLatte');
  await chip.dragTo(tile(page, 'pixelpaladin'));

  await expect.poll(async () => (await box(page, 'lunarlatte')).width).toBeCloseTo(main.width, 0);
  await expect(page).toHaveURL(
    /#\/lunarlatte\/novastrike\/cozycartographer\/pixelpaladin\?layout=focus/,
  );
});

test('presets save and restore a setup', async ({ page }) => {
  await page.goto('/#/pixelpaladin/novastrike');
  await expect(tiles(page)).toHaveCount(2);
  await page.getByTestId('presets-button').click();
  await page.getByRole('button', { name: 'Save current…' }).click();
  await page.getByTestId('preset-name').fill('Duo');
  await page.keyboard.press('Enter');

  await page.getByTestId('add-channel').fill('lunarlatte');
  await page.keyboard.press('Enter');
  await expect(tiles(page)).toHaveCount(3);

  await page.getByTestId('presets-button').click();
  await page.getByTestId('preset-load').filter({ hasText: 'Duo' }).click();
  await expect(tiles(page)).toHaveCount(2);

  await page.reload();
  await expect(tiles(page)).toHaveCount(2);
});

test('offline channels step aside until they go live', async ({ page }) => {
  await page.getByTestId('add-channel').fill('pixelpaladin, bytebard');
  await page.keyboard.press('Enter');
  await expect(tiles(page)).toHaveCount(1);
  await expect(page.getByTestId('offline-bar')).toContainText('bytebard');
  await page.getByTestId('offline-bar').getByRole('button', { name: 'Show' }).click();
  await expect(tiles(page)).toHaveCount(2);
});

test('pasting a multitwitch link loads all of its channels', async ({ page }) => {
  const input = page.getByTestId('add-channel');
  await input.focus();
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'https://www.multitwitch.tv/pixelpaladin/novastrike/lunarlatte');
    document.activeElement!.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  });
  await expect(tiles(page)).toHaveCount(3);
});

test('the top bar never overlaps itself in a narrow window (half a monitor)', async ({ page }) => {
  for (const width of [1278, 1000, 800]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#/pixelpaladin/novastrike?layout=focus');
    await tile(page, 'novastrike').hover();
    await expect(page.getByTestId('stream-controls')).toBeVisible();
    const boxes = await page.locator('header').evaluate((bar) =>
      [...bar.querySelectorAll('button, input, [data-testid=stream-chip]')]
        .filter((e) => (e as HTMLElement).offsetParent !== null)
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 0)
        .map((r) => ({ x: r.x, y: r.y, r: r.right, b: r.bottom })),
    );
    for (const a of boxes) {
      expect(a.r).toBeLessThanOrEqual(width + 1); // nothing off-screen
      for (const b of boxes) {
        if (a === b) continue;
        const overlap =
          Math.min(a.r, b.r) - Math.max(a.x, b.x) > 1 &&
          Math.min(a.b, b.b) - Math.max(a.y, b.y) > 1;
        const nested = a.x >= b.x && a.r <= b.r && a.y >= b.y && a.b <= b.b; // e.g. input inside a label
        const nested2 = b.x >= a.x && b.r <= a.r && b.y >= a.y && b.b <= a.b;
        expect(overlap && !nested && !nested2, `overlap at ${width}px`).toBe(false);
      }
    }
    await expect(page.getByTestId('settings-button')).toBeInViewport();
  }
});
