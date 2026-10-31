import { expect, test, type Page } from '@playwright/test';

const tile = (page: Page, channel: string) =>
  page.locator(`[data-testid=player-tile][data-channel=${channel}]`);
const mockPlayer = (page: Page, channel: string) => tile(page, channel).locator('.mock-player');

test('mute all stays silent through solo focus changes and restores the original stream', async ({
  page,
}) => {
  await page.goto('/#/pixelpaladin/novastrike');
  await expect(mockPlayer(page, 'pixelpaladin')).toHaveAttribute('data-muted', 'false');
  await page.locator('body').press('m');
  await page.locator('body').press('l');
  await tile(page, 'novastrike').hover();
  await tile(page, 'novastrike').getByRole('button', { name: 'Make this the main stream' }).click();
  await page.locator('body').press('l');
  await page.locator('body').press('l');
  await expect(mockPlayer(page, 'pixelpaladin')).toHaveAttribute('data-muted', 'true');
  await expect(mockPlayer(page, 'novastrike')).toHaveAttribute('data-muted', 'true');
  await page.locator('body').press('m');
  await expect(mockPlayer(page, 'pixelpaladin')).toHaveAttribute('data-muted', 'false');
  await expect(mockPlayer(page, 'novastrike')).toHaveAttribute('data-muted', 'true');
});

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

test('in Mix + Focus the main stream plays at the main level, the others at their own', async ({
  page,
}) => {
  await page.goto('/#/pixelpaladin/novastrike/cozycartographer?layout=focus');
  await page.getByRole('button', { name: 'Mix', exact: true }).click();
  const novastrike = tile(page, 'novastrike');
  await novastrike.hover();
  await novastrike.getByRole('button', { name: 'Listen to this stream', exact: true }).click();
  await novastrike.getByRole('slider').fill('20');
  await expect(mockPlayer(page, 'novastrike')).toHaveAttribute('data-volume', '0.20');
  // The main stream is at 100% while the others keep their own levels.
  await expect(mockPlayer(page, 'pixelpaladin')).toHaveAttribute('data-volume', '1.00');
  await tile(page, 'pixelpaladin').hover();
  await expect(tile(page, 'pixelpaladin').getByTestId('stream-volume')).toHaveText('100%');

  // The 20% stream becomes main: 100%, and the old main is back at its own 50%.
  await novastrike.hover();
  await novastrike.getByRole('button', { name: 'Make this the main stream' }).click();
  await expect(mockPlayer(page, 'novastrike')).toHaveAttribute('data-volume', '1.00');
  await expect(mockPlayer(page, 'pixelpaladin')).toHaveAttribute('data-volume', '0.50');

  // The main stream's slider sets the main level, for whichever stream is main.
  await novastrike.hover();
  await novastrike.getByRole('slider').fill('80');
  await expect(mockPlayer(page, 'novastrike')).toHaveAttribute('data-volume', '0.80');
  await page.getByTestId('mixer-button').click();
  const mainRow = page.locator('[data-testid=mixer-row][data-channel=novastrike]');
  await expect(mainRow).toContainText('Main');
  await expect(mainRow.getByTestId('mixer-volume')).toHaveText('80%');
  await page.keyboard.press('Escape');
  await tile(page, 'pixelpaladin').hover();
  await tile(page, 'pixelpaladin')
    .getByRole('button', { name: 'Make this the main stream' })
    .click();
  await expect(mockPlayer(page, 'pixelpaladin')).toHaveAttribute('data-volume', '0.80');
  await expect(mockPlayer(page, 'novastrike')).toHaveAttribute('data-volume', '0.20');

  // Turned off (or outside Focus), every stream plays at its own level.
  await page.getByTestId('mixer-button').click();
  await page.getByText('Main stream at full volume (Mix + Focus)').click();
  await expect(mockPlayer(page, 'pixelpaladin')).toHaveAttribute('data-volume', '0.50');
  await page.getByText('Main stream at full volume (Mix + Focus)').click();
  await expect(mockPlayer(page, 'pixelpaladin')).toHaveAttribute('data-volume', '0.80');
  await page.keyboard.press('Escape');
  await page.locator('body').press('l'); // grid
  await expect(mockPlayer(page, 'pixelpaladin')).toHaveAttribute('data-volume', '0.50');
  await expect(mockPlayer(page, 'novastrike')).toHaveAttribute('data-volume', '0.20');
});
