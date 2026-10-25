import { expect, test, type Page } from '@playwright/test';

const tile = (page: Page, channel: string) =>
  page.locator(`[data-testid=player-tile][data-channel="${channel}"]`);
const player = (page: Page, channel: string) => tile(page, channel).locator('.mock-player');
const row = (page: Page, login: string) =>
  page.locator(`[data-testid=channel-row][data-channel="${login}"]`);
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

test('Twitch stays the default, while direct Kick lookup opens the same username independently', async ({
  page,
}) => {
  const input = page.getByTestId('add-channel');
  const platform = page.getByRole('combobox', { name: 'Stream platform', exact: true });
  await expect(platform).toHaveValue('twitch');
  await mock(page, 'setLive', 'bytebard', true);
  await refresh(page);
  await input.fill('bytebard');
  await expect(page.getByRole('option').filter({ hasText: /[Bb]yte[Bb]ard/ })).toHaveCount(2);
  await expect(
    page
      .getByRole('option')
      .filter({ hasText: /[Bb]yte[Bb]ard/ })
      .first()
      .getByTestId('kick-badge'),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole('option')
      .filter({ hasText: /[Bb]yte[Bb]ard/ })
      .last()
      .getByTestId('kick-badge'),
  ).toBeVisible();
  await input.press('Enter');
  await expect(player(page, 'bytebard')).toHaveAttribute('data-platform', 'twitch');
  await platform.selectOption('kick');
  await input.fill('bytebard');
  await page
    .getByRole('option')
    .filter({ hasText: /bytebard/ })
    .click();
  await expect(player(page, 'kick:bytebard')).toHaveAttribute('data-platform', 'kick');
  await expect(page.getByTestId('player-tile')).toHaveCount(2);
  await tile(page, 'kick:bytebard').hover();
  await expect(tile(page, 'kick:bytebard').getByTestId('stream-kick-link')).toHaveCount(0);
  await expect(tile(page, 'kick:bytebard').getByTestId('stream-follow')).toHaveCount(0);
  await tile(page, 'kick:bytebard').getByRole('slider').fill('22');
  await expect(player(page, 'kick:bytebard')).toHaveAttribute('data-volume', '0.22');
  await expect(player(page, 'bytebard')).toHaveAttribute('data-volume', '0.50');
  await tile(page, 'kick:bytebard').getByRole('button', { name: 'Show chat', exact: true }).click();
  await expect(page.getByTestId('chat-panel').locator('[data-platform=kick]')).toBeVisible();
  await tile(page, 'kick:bytebard').hover();
  await tile(page, 'kick:bytebard').getByTestId('stream-favorite').click();
  await page.reload();
  await expect(player(page, 'kick:bytebard')).toHaveAttribute('data-platform', 'kick');
  await expect(player(page, 'kick:bytebard')).toHaveAttribute('data-volume', '0.22');
  const prefs = await page.evaluate(
    () => JSON.parse(localStorage.getItem('mtv:channel-prefs')!).state,
  );
  expect(prefs.kickLinks).toEqual({});
  expect(prefs.favorites).toContain('kick:bytebard');
  await expect(platform).toHaveValue('twitch');
  await player(page, 'kick:bytebard').evaluate((el) =>
    el.setAttribute('data-kick-mount-check', 'original'),
  );
  await tile(page, 'kick:bytebard').hover();
  await tile(page, 'kick:bytebard')
    .getByRole('button', { name: 'Pin as music', exact: true })
    .click();
  await page.getByTestId('music-button').click();
  const music = page.getByRole('dialog', { name: 'DJ & music', exact: true });
  await expect(music.getByTestId('music-status')).toContainText('kick:bytebard');
  await music.getByRole('slider', { name: 'DJ volume', exact: true }).fill('17');
  await music.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(player(page, 'kick:bytebard')).toHaveAttribute('data-volume', '0.17');
  await tile(page, 'kick:bytebard').hover();
  await tile(page, 'kick:bytebard')
    .getByRole('button', { name: 'Stop music', exact: true })
    .click();
  await expect(player(page, 'kick:bytebard')).toHaveAttribute('data-volume', '0.22');
  await expect(player(page, 'kick:bytebard')).toHaveAttribute('data-kick-mount-check', 'original');
});

test('direct Kick favorites join home and alert without a Twitch link; history and scenes preserve them', async ({
  page,
}) => {
  await page.getByTestId('add-channel').fill('kick:bytebard');
  await page.getByTestId('add-channel').press('Enter');
  await expect(player(page, 'kick:bytebard')).toHaveAttribute('data-platform', 'kick');
  await tile(page, 'kick:bytebard').hover();
  await tile(page, 'kick:bytebard').getByTestId('stream-favorite').click();
  await page.getByTestId('presets-button').click();
  await page.getByRole('button', { name: 'Save current…', exact: true }).click();
  await page.getByTestId('preset-name').fill('Kick desk');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByTestId('clear-all').click();
  await expect(
    page.locator('[data-testid=history-row][data-channel="kick:bytebard"]'),
  ).toBeVisible();
  await page.getByTestId('presets-button').click();
  await page.getByTestId('preset-load').filter({ hasText: 'Kick desk' }).click();
  await expect(player(page, 'kick:bytebard')).toHaveAttribute('data-platform', 'kick');
  await page.getByTestId('clear-all').click();
  await page.locator('body').press('h');
  await expect(player(page, 'kick:bytebard')).toHaveAttribute('data-platform', 'kick');
  await mock(page, 'setKickLive', 'bytebard', false);
  await refresh(page);
  await expect(tile(page, 'kick:bytebard')).toHaveCount(0, { timeout: 10000 });
  await mock(page, 'setKickLive', 'bytebard', true);
  await refresh(page);
  await expect(page.getByText('bytebard just went live on Kick', { exact: true })).toBeVisible();
  await expect(player(page, 'kick:bytebard')).toHaveAttribute('data-platform', 'kick');
});
