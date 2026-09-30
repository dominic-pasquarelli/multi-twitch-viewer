import { expect, test, type Page } from '@playwright/test';

const tile = (page: Page, channel: string) =>
  page.locator(`[data-testid=player-tile][data-channel=${channel}]`);
type Mock = {
  mtvMock: { setLive(l: string, v: boolean): void; setOfflineGrace(ms: number): void };
};
const goOffline = async (page: Page, login: string) => {
  await page.evaluate((l) => (window as unknown as Mock).mtvMock.setLive(l, false), login);
  await page.getByRole('button', { name: 'Refresh now' }).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => (window as unknown as Mock).mtvMock.setOfflineGrace(0));
});

test('a temporary view drops streams that go offline (with Undo)', async ({ page }) => {
  await page.evaluate(() => (location.hash = '#/pixelpaladin/novastrike'));
  await expect(tile(page, 'novastrike')).toHaveAttribute('data-status', 'playing');
  await goOffline(page, 'novastrike');
  await expect(tile(page, 'novastrike')).toHaveCount(0);
  await expect(page.getByText('novastrike went offline and was removed')).toBeVisible();
  await expect(tile(page, 'pixelpaladin')).toBeVisible();
});

test('a view loaded from a preset keeps its offline streams', async ({ page }) => {
  await page.evaluate(() => (location.hash = '#/pixelpaladin/lunarlatte'));
  await expect(tile(page, 'lunarlatte')).toHaveAttribute('data-status', 'playing');
  await page.getByTestId('presets-button').click();
  await page.getByRole('button', { name: 'Save current…' }).click();
  await page.getByTestId('preset-name').fill('Pair');
  await page.keyboard.press('Enter');

  await page.getByTestId('presets-button').click();
  await expect(page.getByTestId('keep-view').locator('input')).toBeChecked();
  await page.keyboard.press('Escape');
  await goOffline(page, 'lunarlatte');
  await page.waitForTimeout(6_000); // the check runs every 5 s
  // Still part of the view (hidden until live), not removed.
  await expect(page).toHaveURL(/lunarlatte/);
  await expect(page.getByTestId('offline-bar')).toContainText('lunarlatte');
});

test('channels you watch without following them are kept in History', async ({ page }) => {
  await page.evaluate(() => (location.hash = '#/pixelpaladin/somestranger'));
  await expect(tile(page, 'somestranger')).toBeVisible();
  // Remove it: it's now in History, ready to bring back.
  await page.locator('[data-testid=channel-row][data-channel=somestranger]').click();
  const row = page.locator('[data-testid=history-row][data-channel=somestranger]');
  await expect(row).toBeVisible();
  await row.getByTestId('channel-row').click();
  await expect(tile(page, 'somestranger')).toBeVisible();
  // …and survives a restart.
  await page.reload();
  await page.locator('[data-testid=channel-row][data-channel=somestranger]').click();
  await expect(row).toBeVisible();
});

test('following a channel from the app', async ({ page }) => {
  await page.evaluate(() => (location.hash = '#/pixelpaladin/somestranger'));
  await tile(page, 'somestranger').hover();
  await page.getByTestId('stream-follow').click();
  await expect(page.getByText('You follow somestranger now')).toBeVisible();
  // Now a followed channel: no Follow button, and not under "Also watching".
  await expect(page.getByTestId('stream-follow')).toHaveCount(0);
  await expect(page.getByText(/Also watching/)).toHaveCount(0);
});
