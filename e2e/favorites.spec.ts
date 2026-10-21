import { expect, test, type Page } from '@playwright/test';

const tile = (page: Page, channel: string) =>
  page.locator(`[data-testid=player-tile][data-channel=${channel}]`);
type Mock = {
  mtvMock: { setLive(l: string, v: boolean): void; setOfflineGrace(ms: number): void };
};
const setLive = async (page: Page, login: string, live: boolean) => {
  await page.evaluate(([l, v]) => (window as unknown as Mock).mtvMock.setLive(l, v), [
    login,
    live,
  ] as const);
  await page.getByRole('button', { name: 'Refresh now' }).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => (window as unknown as Mock).mtvMock.setOfflineGrace(0));
});

test('the Favorites view fills with live favorites, keeps extras and follows go-live changes', async ({
  page,
}) => {
  // No favorites yet: Home opens the editor; add channels by name there.
  await page.getByTestId('home-button').click();
  const dialog = page.getByRole('dialog', { name: 'Favorites' });
  await dialog.getByTestId('favorites-add').fill('pixelpaladin, novastrike bytebard');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  const rows = dialog.getByTestId('favorite-row');
  await expect(rows).toHaveCount(3);
  await expect(dialog.locator('[data-channel=bytebard]')).toHaveAttribute('data-live', 'false');
  await expect(dialog.locator('[data-channel=pixelpaladin]')).toContainText('Live · Just Chatting');
  await dialog.getByRole('button', { name: 'Open Favorites view' }).click();

  await expect(tile(page, 'pixelpaladin')).toBeVisible();
  await expect(tile(page, 'novastrike')).toBeVisible();
  await expect(page.getByTestId('player-tile')).toHaveCount(2); // bytebard is offline
  await expect(page.getByTestId('home-button')).toHaveAttribute('aria-pressed', 'true');

  // Streams you add yourself stay alongside the favorites.
  await page.locator('[data-testid=channel-row][data-channel=lunarlatte]').click();
  await expect(tile(page, 'lunarlatte')).toBeVisible();

  // A favorite going live joins; one going offline leaves.
  await setLive(page, 'bytebard', true);
  await expect(tile(page, 'bytebard')).toBeVisible();
  await setLive(page, 'novastrike', false);
  await expect(tile(page, 'novastrike')).toHaveCount(0, { timeout: 10_000 });
  await expect(tile(page, 'lunarlatte')).toBeVisible();

  // A favorite you close stays closed while it stays live…
  await tile(page, 'pixelpaladin').hover();
  await tile(page, 'pixelpaladin').getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh now' }).click();
  await page.waitForTimeout(500);
  await expect(tile(page, 'pixelpaladin')).toHaveCount(0);
  // …and comes back the next time it goes live.
  await setLive(page, 'novastrike', true);
  await expect(tile(page, 'novastrike')).toBeVisible();

  // The pinned Presets row shows who is live and reopens the full view.
  await page.getByTestId('presets-button').click();
  const row = page.getByTestId('favorites-preset');
  await expect(row).toContainText('3 live of 3');
  await expect(page.getByTestId('home-note')).toBeVisible();
  await row.getByRole('button', { name: /Favorites/ }).click();
  await expect(tile(page, 'pixelpaladin')).toBeVisible();
  await expect(tile(page, 'lunarlatte')).toHaveCount(0);

  // Clear all leaves the Favorites view; Undo brings it back.
  await page.getByTestId('clear-all').click();
  await expect(page.getByTestId('home-button')).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Undo' }).last().click();
  await expect(page.getByTestId('home-button')).toHaveAttribute('aria-pressed', 'true');
  await expect(tile(page, 'pixelpaladin')).toBeVisible();
});

test('a star on the hover bar adds a favorite, and Favorites can open at launch', async ({
  page,
}) => {
  await page.evaluate(() => (location.hash = '#/cozycartographer'));
  await tile(page, 'cozycartographer').hover();
  const star = tile(page, 'cozycartographer').getByTestId('stream-favorite');
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  await star.click();
  await expect(star).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('settings-button').click();
  await page.getByText('Open on Favorites at launch').click();
  await page.keyboard.press('Escape');

  // A fresh launch (no link in the address bar) opens the live favorites.
  await page.evaluate(() => (location.hash = '#/novastrike'));
  await expect(tile(page, 'novastrike')).toBeVisible();
  await page.goto('/');
  await expect(tile(page, 'cozycartographer')).toBeVisible();
  await expect(tile(page, 'novastrike')).toHaveCount(0);
  await expect(page.getByTestId('home-button')).toHaveAttribute('aria-pressed', 'true');

  // Opening a link still shows the link; H returns to Favorites.
  await page.goto('/#/novastrike');
  await expect(tile(page, 'novastrike')).toBeVisible();
  await expect(page.getByTestId('home-button')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('body').press('h');
  await expect(tile(page, 'cozycartographer')).toBeVisible();
  await expect(tile(page, 'novastrike')).toHaveCount(0);
});
