import { expect, test, type Page } from '@playwright/test';

const tile = (page: Page, channel: string) =>
  page.locator(`[data-testid=player-tile][data-channel=${channel}]`);
const mockPlayer = (page: Page, channel: string) => tile(page, channel).locator('.mock-player');

test('hovering a stream shows its category and title, in grid and focus', async ({ page }) => {
  await page.goto('/#/pixelpaladin/novastrike');
  for (const layout of ['grid', 'focus']) {
    if (layout === 'focus') await page.keyboard.press('l');
    await tile(page, 'novastrike').hover();
    const info = tile(page, 'novastrike').getByTestId('stream-info');
    await expect(info).toBeVisible();
    await expect(info).toContainText('Counter-Strike 2');
    await expect(info).toContainText('NovaStrike stream #2 — come hang out!');
    // It stays one line at the top of the video.
    const bar = (await tile(page, 'novastrike').getByTestId('stream-controls').boundingBox())!;
    const video = (await tile(page, 'novastrike').boundingBox())!;
    expect(bar.height).toBeLessThan(video.height / 3);
  }
});

test('the app volume scales every stream and is remembered', async ({ page }) => {
  await page.goto('/#/pixelpaladin/novastrike');
  await page.getByRole('button', { name: 'Duck', exact: true }).click();
  await expect(mockPlayer(page, 'pixelpaladin')).toHaveAttribute('data-volume', '0.50');
  await expect(mockPlayer(page, 'novastrike')).toHaveAttribute('data-volume', '0.10');

  await page.getByTestId('output-volume').fill('50');
  await expect(mockPlayer(page, 'pixelpaladin')).toHaveAttribute('data-volume', '0.25');
  await expect(mockPlayer(page, 'novastrike')).toHaveAttribute('data-volume', '0.05');
  // Each stream keeps its own level: the hover slider still says 50%.
  await tile(page, 'pixelpaladin').hover();
  await expect(tile(page, 'pixelpaladin').getByTestId('stream-volume')).toHaveText('50%');

  await page.reload();
  await expect(page.getByTestId('output-volume')).toHaveValue('50');
  await expect(mockPlayer(page, 'pixelpaladin')).toHaveAttribute('data-volume', '0.25');

  await page.getByTestId('output-volume').fill('100');
  await expect(mockPlayer(page, 'pixelpaladin')).toHaveAttribute('data-volume', '0.50');
});
