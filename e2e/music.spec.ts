import { expect, test, type Page } from '@playwright/test';

const tile = (page: Page, channel: string) =>
  page.locator(`[data-testid=player-tile][data-channel=${channel}]`);
const player = (page: Page, channel: string) => tile(page, channel).locator('.mock-player');
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Music', exact: true });
const row = (page: Page, channel: string) =>
  page.locator(`[data-testid=music-row][data-channel=${channel}]`);
async function addMusic(page: Page, channels: string) {
  await page.getByTestId('music-button').click();
  await dialog(page).getByRole('textbox', { name: 'Add music channels' }).fill(channels);
  await dialog(page).getByRole('button', { name: 'Add', exact: true }).click();
}
async function setLive(page: Page, login: string, live: boolean) {
  await page.evaluate(
    ([l, v]) =>
      (window as unknown as { mtvMock: { setLive(l: string, v: boolean): void } }).mtvMock.setLive(
        l,
        v,
      ),
    [login, live] as const,
  );
  await page.getByRole('button', { name: 'Refresh now' }).click();
}

test('automatic DJs follow priority and live transitions, and mute all survives a switch', async ({
  page,
}) => {
  await page.goto('/#/pixelpaladin/novastrike');
  await addMusic(page, 'bytebard, lunarlatte cozycartographer');
  await dialog(page).getByRole('button', { name: 'Automatic', exact: true }).click();
  await expect(row(page, 'lunarlatte')).toHaveAttribute('data-current', 'true');
  await dialog(page).getByRole('button', { name: 'Done', exact: true }).click();
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-muted', 'false');
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-muted', 'true');
  await page.locator('body').press('m');
  await setLive(page, 'bytebard', true);
  await expect(tile(page, 'lunarlatte')).toHaveCount(0);
  await expect(player(page, 'bytebard')).toHaveAttribute('data-muted', 'true');
  await page.locator('body').press('m');
  await expect(player(page, 'bytebard')).toHaveAttribute('data-muted', 'false');
  await setLive(page, 'bytebard', false);
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-muted', 'false');
  await setLive(page, 'lunarlatte', false);
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-muted', 'false');
  await setLive(page, 'cozycartographer', false);
  await expect(page.getByTestId('player-tile')).toHaveCount(2);
  await page.getByTestId('music-button').click();
  await expect(page.getByTestId('music-status')).toContainText('No preferred DJs are live');
});

test('music has its own level alongside multi focus, persists, and respects app volume', async ({
  page,
}) => {
  await page.goto('/#/pixelpaladin/novastrike/cozycartographer');
  await page.getByRole('button', { name: 'Multi focus', exact: true }).click();
  await addMusic(page, 'lunarlatte');
  await dialog(page).getByRole('button', { name: 'Automatic', exact: true }).click();
  await dialog(page).getByRole('slider', { name: 'Music volume' }).fill('24');
  await dialog(page)
    .getByRole('checkbox', { name: /Mix with stream audio/ })
    .check();
  await dialog(page).getByRole('button', { name: 'Done', exact: true }).click();
  for (const c of ['pixelpaladin', 'novastrike', 'lunarlatte'])
    await expect(player(page, c)).toHaveAttribute('data-muted', 'false');
  await player(page, 'lunarlatte').evaluate((el) =>
    el.setAttribute('data-mount-check', 'original'),
  );
  await page.getByTestId('mixer-button').click();
  await page.getByRole('checkbox', { name: /Consistent volume/ }).check();
  await page.getByTestId('mixer-master').fill('80');
  await page.getByRole('button', { name: 'Equal levels', exact: true }).click();
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-volume', '0.24');
  await page.keyboard.press('Escape');
  await tile(page, 'cozycartographer').hover();
  await tile(page, 'cozycartographer')
    .getByRole('button', { name: 'Add to multi focus', exact: true })
    .click();
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-mount-check', 'original');
  await page.getByTestId('output-volume').fill('50');
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-volume', '0.12');
  await page.reload();
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-volume', '0.12');
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-muted', 'false');
  const session = await page.evaluate(
    () => JSON.parse(localStorage.getItem('mtv:session')!).state.view,
  );
  expect(session.channels).not.toContain('lunarlatte');
  expect(session.audio).not.toHaveProperty('suppressed');
});

test('pinning reuses a watched stream, overrides priorities and stops from tile controls', async ({
  page,
}) => {
  await page.goto('/#/pixelpaladin/lunarlatte');
  await addMusic(page, 'cozycartographer lunarlatte');
  await row(page, 'lunarlatte')
    .getByRole('button', { name: /Pin .* as music/ })
    .click();
  await dialog(page).getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByTestId('player-tile')).toHaveCount(2);
  await player(page, 'lunarlatte').evaluate((el) =>
    el.setAttribute('data-mount-check', 'original'),
  );
  await page.getByRole('button', { name: 'Refresh now' }).click();
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-muted', 'false');
  await page.getByTestId('music-button').click();
  await dialog(page).getByRole('button', { name: 'Automatic', exact: true }).click();
  await expect(row(page, 'cozycartographer')).toHaveAttribute('data-current', 'true');
  await row(page, 'lunarlatte')
    .getByRole('button', { name: /Move .* up/ })
    .click();
  await expect(row(page, 'lunarlatte')).toHaveAttribute('data-current', 'true');
  await dialog(page).getByRole('button', { name: 'Done', exact: true }).click();
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-mount-check', 'original');
  await tile(page, 'lunarlatte').hover();
  await tile(page, 'lunarlatte').getByRole('button', { name: 'Stop music', exact: true }).click();
  await expect(page.getByTestId('player-tile')).toHaveCount(2);
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-muted', 'false');
});

test('Pause all holds the DJ selection; Play all resumes selection; Clear all stops music', async ({
  page,
}) => {
  await page.goto('/');
  await addMusic(page, 'bytebard lunarlatte');
  await dialog(page).getByRole('button', { name: 'Automatic', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Done', exact: true }).click();
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-paused', 'false');
  await page.getByTestId('pause-all').click();
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-paused', 'true');
  await setLive(page, 'bytebard', true);
  await expect(tile(page, 'bytebard')).toHaveCount(0);
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-paused', 'true');
  await page.getByTestId('play-all').click();
  await expect(player(page, 'bytebard')).toHaveAttribute('data-paused', 'false');
  await page.getByTestId('clear-all').click();
  await expect(page.getByTestId('player-tile')).toHaveCount(0);
  await page.getByTestId('music-button').click();
  await expect(page.getByTestId('music-status')).toHaveText('Music is off.');
});

test('imports favorites and keeps the DJ visible across isolated groups', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'mtv:channel-prefs',
      JSON.stringify({ version: 1, state: { favorites: ['lunarlatte', 'bytebard'] } }),
    );
    localStorage.setItem(
      'mtv:session',
      JSON.stringify({
        version: 1,
        state: {
          pinned: true,
          view: {
            channels: ['pixelpaladin', 'novastrike'],
            layout: { mode: 'focus', main: 'pixelpaladin', mainScale: 'auto' },
            audio: { mode: 'solo', active: ['pixelpaladin'] },
            chat: { open: false, channel: 'pixelpaladin' },
            groups: [
              { id: 'one', name: 'First', channels: ['pixelpaladin'] },
              { id: 'two', name: 'Second', channels: ['novastrike'] },
            ],
            activeGroup: 'one',
          },
        },
      }),
    );
  });
  await page.goto('/');
  await page.getByTestId('music-button').click();
  await dialog(page).getByRole('button', { name: 'Add from favorites', exact: true }).click();
  await expect(dialog(page).getByTestId('music-row')).toHaveCount(2);
  await dialog(page).getByRole('button', { name: 'Automatic', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Done', exact: true }).click();
  await expect(tile(page, 'lunarlatte')).toBeVisible();
  await player(page, 'lunarlatte').evaluate((el) =>
    el.setAttribute('data-mount-check', 'original'),
  );
  await page
    .getByTestId('group-bar')
    .getByRole('button', { name: /Second/ })
    .click();
  await expect(tile(page, 'lunarlatte')).toBeVisible();
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-paused', 'false');
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-muted', 'false');
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-mount-check', 'original');
});
