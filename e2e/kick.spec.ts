import { expect, test, type Page } from '@playwright/test';

const tile = (page: Page, channel: string) =>
  page.locator(`[data-testid=player-tile][data-channel=${channel}]`);
const player = (page: Page, channel: string) => tile(page, channel).locator('.mock-player');
const row = (page: Page, login: string) =>
  page.locator(`[data-testid=channel-row][data-channel=${login}]`);
type Mock = {
  mtvMock: {
    setLive(login: string, live: boolean): void;
    setKickLive(slug: string, live: boolean): void;
    setOfflineGrace(ms: number): void;
  };
};
const mock = (page: Page, fn: 'setLive' | 'setKickLive', login: string, live: boolean) =>
  page.evaluate(([f, l, v]) => (window as unknown as Mock).mtvMock[f](l, v), [
    fn,
    login,
    live,
  ] as const);
const refresh = (page: Page) => page.getByRole('button', { name: 'Refresh now' }).click();

const linkKick = async (page: Page, login: string) => {
  await page.getByTestId('settings-button').click();
  await page.getByRole('tab', { name: 'Account' }).click();
  await page.getByRole('button', { name: 'Linked Kick channels…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Linked Kick channels' });
  await dialog.getByTestId('kick-link-twitch').fill(login);
  await expect(dialog.getByTestId('kick-link-kick')).toHaveValue(login); // same name suggested
  await dialog.getByRole('button', { name: 'Link', exact: true }).click();
  return dialog;
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => (window as unknown as Mock).mtvMock.setOfflineGrace(0));
});

test('a linked channel plays from Kick while offline on Twitch, and switches back when live there', async ({
  page,
}) => {
  await page.evaluate(() => (location.hash = '#/bytebard/pixelpaladin'));
  await expect(tile(page, 'pixelpaladin')).toBeVisible();
  await expect(tile(page, 'bytebard')).toHaveCount(0); // offline on Twitch: hidden

  const dialog = await linkKick(page, 'bytebard');
  await expect(dialog.getByTestId('kick-link')).toContainText('Live on Kick · IRL');
  await page.keyboard.press('Escape');

  await expect(player(page, 'bytebard')).toHaveAttribute('data-platform', 'kick');
  await tile(page, 'bytebard').hover();
  await expect(tile(page, 'bytebard').getByTestId('kick-badge')).toBeVisible();
  await expect(tile(page, 'bytebard').getByTestId('stream-info')).toContainText('bytebard on Kick');
  await expect(tile(page, 'bytebard').getByRole('button', { name: 'Open on Kick' })).toBeVisible();
  // The sidebar lists it as live, on Kick.
  await expect(row(page, 'bytebard')).toHaveAttribute('data-live', 'true');
  await expect(row(page, 'bytebard').getByTestId('kick-badge')).toBeVisible();
  // Its chat tab shows Kick chat.
  await page.getByTestId('chat-toggle').click();
  await page.getByRole('tab', { name: /bytebard/ }).click();
  await expect(page.getByTestId('chat-panel').locator('[data-platform=kick]')).toContainText(
    'Kick chat for bytebard',
  );

  // Live on Twitch: Twitch wins.
  await mock(page, 'setLive', 'bytebard', true);
  await refresh(page);
  await expect(player(page, 'bytebard')).toHaveAttribute('data-platform', 'twitch');
  await expect(page.getByTestId('chat-panel').locator('[data-platform=twitch]')).toBeVisible();
  // Offline on Twitch again while still live on Kick: back to Kick.
  await mock(page, 'setLive', 'bytebard', false);
  await refresh(page);
  await expect(player(page, 'bytebard')).toHaveAttribute('data-platform', 'kick');
  // Offline on both: like any offline stream (this temporary view drops it).
  await mock(page, 'setKickLive', 'bytebard', false);
  await refresh(page);
  await expect(tile(page, 'bytebard')).toHaveCount(0, { timeout: 10_000 });
});

test('a favorite live only on Kick joins the Favorites view and gets a go-live alert', async ({
  page,
}) => {
  await mock(page, 'setKickLive', 'bytebard', false);
  await row(page, 'bytebard').hover();
  await page.locator('[data-channel=bytebard] + [data-testid=favorite-toggle]').click();
  await linkKick(page, 'bytebard');
  await page.keyboard.press('Escape');
  await page.locator('body').press('h');
  await expect(page.getByTestId('home-button')).toHaveAttribute('aria-pressed', 'true');
  await expect(tile(page, 'bytebard')).toHaveCount(0);

  await mock(page, 'setKickLive', 'bytebard', true);
  await refresh(page);
  await expect(page.getByText('ByteBard just went live on Kick')).toBeVisible();
  await expect(player(page, 'bytebard')).toHaveAttribute('data-platform', 'kick');
});
