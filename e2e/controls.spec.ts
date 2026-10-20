import { expect, test, type Page } from '@playwright/test';

const tile = (page: Page, channel: string) =>
  page.locator(`[data-testid=player-tile][data-channel=${channel}]`);

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
