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
  await expect(page.getByTestId('volume-hud')).toContainText('60%');

  const t = tile(page, 'novastrike');
  await t.hover();
  const bar = t.getByTitle(/Drag onto another stream/);
  const box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + 4);
  await page.mouse.wheel(0, 100); // scroll down = quieter
  await expect(t.getByTestId('volume-hud')).toContainText('45%');
});
