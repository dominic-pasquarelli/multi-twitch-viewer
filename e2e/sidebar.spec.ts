import { expect, test, type Page } from '@playwright/test';

const row = (page: Page, login: string) =>
  page.locator(`[data-testid=channel-row][data-channel=${login}]`);
const rail = (page: Page, login: string) =>
  page.locator(`[data-testid=rail-channel][data-channel=${login}]`);
const preview = (page: Page) => page.getByTestId('channel-preview');
const historySection = (page: Page, status: 'live' | 'offline' | 'checking') =>
  page.locator(`[data-testid=history-section][data-status=${status}]`);

const seedHistory = async (page: Page) =>
  page.addInitScript(() => {
    localStorage.setItem(
      'mtv:settings',
      JSON.stringify({ version: 1, state: { refreshSeconds: 1 } }),
    );
    localStorage.setItem(
      'mtv:watch-history',
      JSON.stringify({
        version: 1,
        state: {
          entries: [
            { login: 'pastnew', displayName: 'pastnew', lastWatched: 3 },
            { login: 'pastlive', displayName: 'pastlive', lastWatched: 2 },
            { login: 'pastoffline', displayName: 'pastoffline', lastWatched: 1 },
          ],
        },
      }),
    );
  });

const setLive = async (page: Page, login: string, live: boolean, refresh = true) => {
  await page.evaluate(
    ({ login, live }) =>
      (
        window as unknown as { mtvMock: { setLive(login: string, live: boolean): void } }
      ).mtvMock.setLive(login, live),
    { login, live },
  );
  if (refresh) await page.getByRole('button', { name: 'Refresh now' }).click();
};

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

test('live history appears in the rail while expanded history keeps its offline fallback', async ({
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
  await expect(historySection(page, 'live').getByTestId('history-row')).toHaveCount(1);
  await expect(historySection(page, 'offline').getByTestId('history-row')).toHaveCount(1);
  await row(page, 'pastlive').hover();
  await expect(preview(page).getByAltText('pastlive live stream preview')).toBeVisible();
  await row(page, 'pastoffline').hover();
  await expect(preview(page)).toContainText('Offline · no live preview');

  await page.getByRole('button', { name: 'Collapse sidebar (B)' }).click();
  await expect(rail(page, 'pastlive')).toHaveAttribute('data-history', 'true');
  await rail(page, 'pastlive').hover();
  await expect(preview(page).getByAltText('pastlive live stream preview')).toBeVisible();
  await expect(rail(page, 'pastoffline')).toHaveCount(0);
  await expect(historySection(page, 'offline')).toHaveCount(0);
  await expect(historySection(page, 'checking')).toHaveCount(0);
});

test('history photos survive watching and rail transitions while live and offline stay separate', async ({
  page,
}) => {
  await seedHistory(page);
  await page.goto('/');
  await expect(row(page, 'pastlive').locator('img')).toBeVisible();
  // The mock API supplies real SVG profile images. Check decoded image pixels,
  // so a letter fallback cannot accidentally satisfy the avatar assertions.
  await expect
    .poll(() =>
      row(page, 'pastlive')
        .locator('img')
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  const photo = await row(page, 'pastlive').locator('img').getAttribute('src');
  expect(photo).toMatch(/^data:image\/svg\+xml,/);
  await setLive(page, 'pastoffline', false);
  await expect(historySection(page, 'offline').getByTestId('history-row')).toHaveCount(1);
  await expect
    .poll(() =>
      historySection(page, 'live')
        .getByTestId('history-row')
        .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-channel'))),
    )
    .toEqual(['pastnew', 'pastlive']);
  await expect(
    historySection(page, 'offline').locator('[data-channel=pastoffline]').first(),
  ).toBeVisible();

  await row(page, 'pastlive').hover();
  await expect(preview(page).getByAltText('pastlive live stream preview')).toBeVisible();
  await row(page, 'pastlive').click();
  await expect(row(page, 'pastlive')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Also watching · 1', { exact: true })).toBeVisible();
  await expect(page.locator('[data-testid=history-row][data-channel=pastlive]')).toHaveCount(0);
  // Read immediately after the row moves, rather than waiting for a refetch.
  expect(
    await row(page, 'pastlive').evaluate((row) => row.querySelector('img')?.getAttribute('src')),
  ).toBe(photo);
  await expect(row(page, 'pastlive')).toHaveCount(1);

  await page.getByRole('button', { name: 'Collapse sidebar (B)' }).click();
  const watching = page.getByRole('group', { name: 'Also watching', exact: true });
  await expect(watching.locator('[data-channel=pastlive]')).toHaveCount(1);
  await expect(rail(page, 'pastlive').locator('img')).toHaveAttribute('src', photo!);
  await expect(rail(page, 'pastlive')).toHaveAttribute('data-history', 'false');
  await expect(rail(page, 'pastoffline')).toHaveCount(0);
  await expect(historySection(page, 'offline')).toHaveCount(0);
  await expect(historySection(page, 'checking')).toHaveCount(0);
  await expect(
    page
      .getByRole('group', { name: 'Live followed channels', exact: true })
      .locator('[data-channel=pixelpaladin]'),
  ).toHaveCount(1);
  await rail(page, 'pastlive').hover();
  await expect(preview(page).getByAltText('pastlive live stream preview')).toBeVisible();

  await rail(page, 'pastlive').click();
  await expect(rail(page, 'pastlive')).toHaveAttribute('data-history', 'true');
  expect(
    await rail(page, 'pastlive').evaluate((row) => row.querySelector('img')?.getAttribute('src')),
  ).toBe(photo);
  await expect(historySection(page, 'live').locator('[data-channel=pastlive]')).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Also watching', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Expand sidebar (B)' }).click();
  await expect(row(page, 'pastlive').locator('img')).toHaveAttribute('src', photo!);
  await setLive(page, 'pastoffline', true);
  await expect(historySection(page, 'live').getByTestId('history-row')).toHaveCount(3);
  await expect(historySection(page, 'offline').getByTestId('history-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Collapse sidebar (B)' }).click();
  await expect(historySection(page, 'live').locator('[data-channel=pastoffline]')).toHaveCount(1);
  await expect(historySection(page, 'offline')).toHaveCount(0);
  await rail(page, 'pastoffline').hover();
  await expect(preview(page).getByAltText('pastoffline live stream preview')).toBeVisible();
  // The rail hides an offline history icon after a background refresh.
  await setLive(page, 'pastnew', false, false);
  await expect(rail(page, 'pastnew')).toHaveCount(0);
  await expect(historySection(page, 'offline')).toHaveCount(0);
  await expect(historySection(page, 'live').locator('[data-channel=pastnew]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand sidebar (B)' }).click();
  await expect(
    historySection(page, 'offline').locator('[data-channel=pastnew]').first(),
  ).toBeVisible();
  await row(page, 'pastnew').hover();
  await expect(preview(page)).toContainText('Offline · no live preview');
});

test('split history keeps its toggle, filtering, forget, follow and clear actions', async ({
  page,
}) => {
  await seedHistory(page);
  await page.goto('/');
  await expect(row(page, 'pastlive')).toBeVisible();
  await setLive(page, 'pastoffline', false);
  await expect(historySection(page, 'offline').getByTestId('history-row')).toHaveCount(1);
  await page.getByRole('button', { name: /^History ·/ }).click();
  await expect(page.getByTestId('history-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Collapse sidebar (B)' }).click();
  await expect(page.getByTestId('history-section')).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand sidebar (B)' }).click();
  await page.getByRole('button', { name: /^History ·/ }).click();
  await expect(row(page, 'pastlive')).toBeVisible();
  await row(page, 'pastlive').hover();
  await page.getByRole('button', { name: 'Remove pastlive from history', exact: true }).click();
  await expect(row(page, 'pastlive')).toHaveCount(0);
  await row(page, 'pastnew').hover();
  await page.getByRole('button', { name: 'Follow pastnew', exact: true }).click();
  await expect(page.locator('[data-testid=history-row][data-channel=pastnew]')).toHaveCount(0);
  await expect(row(page, 'pastnew')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Filter followed channels' }).fill('pastoffline');
  await expect(historySection(page, 'live').getByTestId('history-row')).toHaveCount(0);
  await expect(historySection(page, 'offline').getByTestId('history-row')).toHaveCount(1);
  await page.getByTestId('history-clear').click();
  await expect(page.getByTestId('history-row')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^History ·/ })).toHaveCount(0);
});

test('history status polls hide and restore live rail icons and dismiss disconnected previews', async ({
  page,
}) => {
  await seedHistory(page);
  await page.goto('/');
  const liveRow = historySection(page, 'live').locator(
    '[data-testid=channel-row][data-channel=pastnew]',
  );
  await expect(liveRow).toHaveAttribute('data-live', 'true');
  await expect(liveRow).toBeVisible();
  await liveRow.hover();
  await expect(preview(page).getByAltText('pastnew live stream preview')).toBeVisible();
  // Poll while the mouse stays over its original row position.
  await setLive(page, 'pastnew', false, false);
  await expect(
    historySection(page, 'offline').locator('[data-channel=pastnew]').first(),
  ).toBeVisible();
  await expect(
    page
      .locator('[data-testid=channel-preview][data-channel=pastnew]')
      .getByAltText('pastnew live stream preview'),
  ).toHaveCount(0);

  await page.getByRole('button', { name: 'Collapse sidebar (B)' }).click();
  await expect(rail(page, 'pastnew')).toHaveCount(0);
  await expect(historySection(page, 'offline')).toHaveCount(0);
  await expect(historySection(page, 'checking')).toHaveCount(0);
  await setLive(page, 'pastnew', true, false);
  await expect(historySection(page, 'live').locator('[data-channel=pastnew]')).toHaveCount(1);
  await expect(rail(page, 'pastnew')).toHaveAttribute('data-history', 'true');
  const photo = await rail(page, 'pastnew').locator('img').getAttribute('src');
  await rail(page, 'pastnew').hover();
  await expect(preview(page).getByAltText('pastnew live stream preview')).toBeVisible();
  await setLive(page, 'pastnew', false, false);
  await expect(rail(page, 'pastnew')).toHaveCount(0);
  await expect(page.locator('[data-testid=channel-preview][data-channel=pastnew]')).toHaveCount(0);
  // Go-live polling restores the icon and its photo without expanding the rail.
  await setLive(page, 'pastnew', true, false);
  await expect(rail(page, 'pastnew')).toHaveAttribute('data-live', 'true');
  await expect(rail(page, 'pastnew').locator('img')).toHaveAttribute('src', photo!);
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
