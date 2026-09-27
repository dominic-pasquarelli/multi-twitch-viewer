import { expect, test, type Page } from '@playwright/test';

const tile = (page: Page, channel: string) =>
  page.locator(`[data-testid=player-tile][data-channel=${channel}]`);
const mockPlayer = (page: Page, channel: string) => tile(page, channel).locator('.mock-player');

test('starring a channel keeps it at the top and alerts when it goes live', async ({ page }) => {
  await page.goto('/');
  const rows = page.getByTestId('channel-row');
  await expect(rows.first()).toHaveAttribute('data-live', 'true');
  const liveCount = await page.locator('[data-testid=channel-row][data-live=true]').count();
  // WaffleWizard is offline and last alphabetically…
  await expect(rows.last()).toHaveAttribute('data-channel', 'wafflewizard');

  await rows.last().hover();
  await page.locator('[data-channel=wafflewizard] + [data-testid=favorite-toggle]').click();
  // …until it's a favorite: then it's first among the offline channels.
  await expect(rows.nth(liveCount)).toHaveAttribute('data-channel', 'wafflewizard');

  await page.evaluate(() =>
    (window as unknown as { mtvMock: { setLive(l: string, v: boolean): void } }).mtvMock.setLive(
      'wafflewizard',
      true,
    ),
  );
  await page.getByRole('button', { name: 'Refresh now' }).click();

  await expect(page.getByText('WaffleWizard just went live')).toBeVisible();
  // Now live and, as a favorite, first in the live list.
  await expect(rows.first()).toHaveAttribute('data-channel', 'wafflewizard');
  await page.getByRole('button', { name: 'Watch' }).click();
  await expect(tile(page, 'wafflewizard')).toBeVisible();
});

test('duck mode keeps other streams playing quietly', async ({ page }) => {
  await page.goto('/#/pixelpaladin/novastrike/cozycartographer');
  await expect(mockPlayer(page, 'novastrike')).toHaveAttribute('data-muted', 'true');

  await page.getByRole('button', { name: 'Duck', exact: true }).click();
  await expect(mockPlayer(page, 'pixelpaladin')).toHaveAttribute('data-muted', 'false');
  await expect(mockPlayer(page, 'pixelpaladin')).toHaveAttribute('data-volume', '0.50');
  await expect(mockPlayer(page, 'novastrike')).toHaveAttribute('data-muted', 'false');
  await expect(mockPlayer(page, 'novastrike')).toHaveAttribute('data-volume', '0.10');

  // Switching focus swaps who is loud.
  await page.keyboard.press('2');
  await expect(mockPlayer(page, 'novastrike')).toHaveAttribute('data-volume', '0.50');
  await expect(mockPlayer(page, 'pixelpaladin')).toHaveAttribute('data-volume', '0.10');

  // M still silences everything.
  await page.keyboard.press('m');
  await expect(page.locator('.mock-player[data-muted=false]')).toHaveCount(0);
});

test('arrow keys and the mouse wheel change volume', async ({ page }) => {
  await page.goto('/#/pixelpaladin/novastrike');
  await expect(mockPlayer(page, 'pixelpaladin')).toHaveAttribute('data-muted', 'false');
  // Wait for the player's own volume (50%) to be adopted as the channel volume.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('mtv:channel-prefs') ?? ''))
    .toContain('pixelpaladin');

  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(mockPlayer(page, 'pixelpaladin')).toHaveAttribute('data-volume', '0.60');
  // The top-bar controls show the stream whose volume changed.
  await expect(page.getByTestId('stream-volume')).toHaveText('60%');

  // Hover another stream, then scroll over its controls in the top bar.
  await tile(page, 'novastrike').hover();
  await expect(page.getByTestId('stream-chip')).toContainText('NovaStrike');
  await page.getByTestId('stream-controls').hover();
  await page.mouse.wheel(0, 100); // scroll down = quieter
  await expect(page.getByTestId('stream-volume')).toHaveText('45%');
});

test('streams that pause on their own resume; ones you pause stay paused', async ({ page }) => {
  await page.goto('/#/pixelpaladin/novastrike');
  await expect(tile(page, 'novastrike')).toHaveAttribute('data-status', 'playing');
  await expect(tile(page, 'pixelpaladin')).toHaveAttribute('data-status', 'playing');
  const pause = (login: string) =>
    page.evaluate(
      (l) => (window as unknown as { mtvMock: { pause(l: string): void } }).mtvMock.pause(l),
      login,
    );

  // The player pauses by itself (e.g. Twitch pausing a covered player).
  await pause('novastrike');
  await expect(mockPlayer(page, 'novastrike')).toHaveAttribute('data-paused', 'true');
  await expect(mockPlayer(page, 'novastrike')).toHaveAttribute('data-paused', 'false');

  // You click the player and pause it: it stays paused.
  await mockPlayer(page, 'pixelpaladin').click();
  await pause('pixelpaladin');
  await page.waitForTimeout(1500);
  await expect(mockPlayer(page, 'pixelpaladin')).toHaveAttribute('data-paused', 'true');
});

test('focus auto lines the small streams up with the main one; clicking one promotes it', async ({
  page,
}) => {
  await page.goto('/#/pixelpaladin/novastrike/cozycartographer/lunarlatte?layout=focus');
  await expect(tile(page, 'lunarlatte')).toBeVisible();
  const box = async (c: string) => (await tile(page, c).boundingBox())!;
  const main = await box('pixelpaladin');
  const side = await Promise.all(['novastrike', 'cozycartographer', 'lunarlatte'].map(box));
  // A strip flush with the main stream: beside it (same top and bottom) or
  // below it (same left and right), whichever gives bigger video here.
  const first = side[0]!;
  const last = side[2]!;
  if (first.x >= main.x + main.width) {
    expect(Math.abs(first.y - main.y)).toBeLessThan(2);
    expect(Math.abs(last.y + last.height - (main.y + main.height))).toBeLessThan(2);
  } else {
    expect(first.y).toBeGreaterThanOrEqual(main.y + main.height);
    expect(Math.abs(first.x - main.x)).toBeLessThan(2);
    expect(Math.abs(last.x + last.width - (main.x + main.width))).toBeLessThan(2);
  }

  // Click the video area of a small stream: it becomes the main one.
  await mockPlayer(page, 'cozycartographer').click();
  await expect.poll(async () => (await box('cozycartographer')).width).toBeCloseTo(main.width, 0);
  await expect(tile(page, 'cozycartographer')).toHaveAttribute('data-audible', 'true');
  await expect(page).toHaveURL(/main=cozycartographer/);
});
