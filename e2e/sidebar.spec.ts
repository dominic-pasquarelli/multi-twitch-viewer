import { expect, test, type Page } from '@playwright/test';

const row = (page: Page, login: string) =>
  page.locator(`[data-testid=channel-row][data-channel=${login}]`);
const rail = (page: Page, login: string) =>
  page.locator(`[data-testid=rail-channel][data-channel=${login}]`);
const preview = (page: Page) => page.getByTestId('channel-preview');

test('expanded and collapsed followed channels have the same live hover preview', async ({
  page,
}) => {
  await page.goto('/');
  await row(page, 'pixelpaladin').hover();
  await expect(preview(page)).toContainText('PixelPaladin stream #1');
  const source = await preview(page)
    .getByAltText('PixelPaladin live stream preview')
    .getAttribute('src');

  await page.getByRole('button', { name: 'Collapse sidebar (B)' }).click();
  await rail(page, 'pixelpaladin').hover();
  await expect(preview(page)).toContainText('PixelPaladin stream #1');
  await expect(preview(page).getByAltText('PixelPaladin live stream preview')).toHaveAttribute(
    'src',
    source!,
  );

  await rail(page, 'pixelpaladin').click();
  await expect(page.locator('[data-testid=player-tile][data-channel=pixelpaladin]')).toBeVisible();
  await expect(preview(page)).toHaveCount(0);
});

test('history appears in the rail with live previews and a clear offline fallback', async ({
  page,
}) => {
  await page.goto('/#/pastlive/pastoffline');
  await expect(page.locator('[data-testid=player-tile][data-channel=pastoffline]')).toHaveAttribute(
    'data-status',
    'playing',
  );
  await row(page, 'pastlive').click();
  await row(page, 'pastoffline').click();
  await expect(page.locator('[data-testid=history-row][data-channel=pastlive]')).toBeVisible();
  await page.evaluate(() =>
    (
      window as unknown as { mtvMock: { setLive(login: string, live: boolean): void } }
    ).mtvMock.setLive('pastoffline', false),
  );
  await page.getByRole('button', { name: 'Refresh now' }).click();
  await expect(row(page, 'pastoffline')).toHaveAttribute('data-live', 'false');
  await row(page, 'pastlive').hover();
  await expect(preview(page).getByAltText('pastlive live stream preview')).toBeVisible();
  await row(page, 'pastoffline').hover();
  await expect(preview(page)).toContainText('Offline · no live preview');

  await page.getByRole('button', { name: 'Collapse sidebar (B)' }).click();
  await expect(rail(page, 'pastlive')).toHaveAttribute('data-history', 'true');
  await rail(page, 'pastlive').hover();
  await expect(preview(page).getByAltText('pastlive live stream preview')).toBeVisible();
  await rail(page, 'pastoffline').hover();
  await expect(preview(page)).toContainText('Offline · no live preview');
  await expect(preview(page).getByAltText('pastoffline live stream preview')).toHaveCount(0);
});

test('followed filtering matches loaded titles and tags', async ({ page }) => {
  await page.goto('/');
  await expect(row(page, 'pixelpaladin')).toBeVisible();
  const input = page.getByRole('textbox', { name: 'Filter followed channels' });
  await input.fill('Community stream #1');
  await expect(row(page, 'pixelpaladin')).toBeVisible();
  await expect(row(page, 'novastrike')).toHaveCount(0);
  await input.fill('Gaming #2');
  await expect(row(page, 'novastrike')).toBeVisible();
  await expect(row(page, 'pixelpaladin')).toHaveCount(0);
});

test('discovery searches categories, filters live metadata, and still searches channel names', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Discover', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search Twitch categories' }).fill('Chess');
  await page.getByTestId('category-result').filter({ hasText: 'Chess' }).click();
  await expect(row(page, 'quickscopequeen')).toBeVisible();
  await page.getByRole('textbox', { name: 'Filter loaded category streams' }).fill('Gaming #6');
  await expect(row(page, 'quickscopequeen')).toBeVisible();
  await expect(row(page, 'turbotortoise')).toHaveCount(0);
  await row(page, 'quickscopequeen').click();
  await expect(
    page.locator('[data-testid=player-tile][data-channel=quickscopequeen]'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Channels', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search Twitch channels' }).fill('Nova');
  await expect(row(page, 'novastrike')).toBeVisible();
  await row(page, 'novastrike').click();
  await expect(page.locator('[data-testid=player-tile][data-channel=novastrike]')).toBeVisible();
});
