import { expect, test, type Page } from '@playwright/test';

const tile = (page: Page, channel: string) =>
  page.locator(`[data-testid=player-tile][data-channel="${channel}"]`);
const player = (page: Page, channel: string) => tile(page, channel).locator('.mock-player');
const dialog = (page: Page) => page.getByRole('dialog', { name: 'DJ & music', exact: true });
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
  await dialog(page).getByRole('slider', { name: 'DJ volume' }).fill('24');
  await dialog(page).getByRole('button', { name: 'DJ + stream audio', exact: true }).click();
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

test('quick DJ volume follows the selected DJ and preserves output, mute and pause intent', async ({
  page,
}) => {
  await page.goto('/#/pixelpaladin/novastrike');
  const quick = page.getByTestId('dj-volume');
  await expect(quick).toHaveCount(0);
  await addMusic(page, 'bytebard lunarlatte');
  await dialog(page).getByRole('button', { name: 'Automatic', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Done', exact: true }).click();
  await expect(quick).toHaveValue('35');
  await player(page, 'lunarlatte').evaluate((el) =>
    el.setAttribute('data-mount-check', 'original'),
  );
  await quick.fill('20');
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-volume', '0.20');
  await expect(page.getByTestId('output-volume')).toHaveValue('100');
  await page.getByTestId('output-volume').fill('50');
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-volume', '0.10');
  await quick.fill('0');
  await expect(quick).toBeVisible();
  await quick.fill('30');
  await quick.dispatchEvent('wheel', { deltaY: -100 });
  await expect(quick).toHaveValue('35');
  await quick.press('ArrowRight');
  await expect(quick).toHaveValue('36');
  await page.getByTestId('music-button').click();
  await expect(dialog(page).getByRole('slider', { name: 'DJ volume', exact: true })).toHaveValue(
    '36',
  );
  await dialog(page).getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('body').press('m');
  await quick.fill('40');
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-muted', 'true');
  await quick.press('m');
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-muted', 'false');
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-volume', '0.20');
  await page.getByTestId('pause-all').click();
  await quick.fill('50');
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-paused', 'true');
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-mount-check', 'original');
  await page.getByTestId('play-all').click();
  await setLive(page, 'bytebard', true);
  await expect(player(page, 'bytebard')).toHaveAttribute('data-volume', '0.25');
  await expect(quick).toHaveValue('50');
  await page.reload();
  await expect(quick).toHaveValue('50');
  await expect(page.getByTestId('output-volume')).toHaveValue('50');
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(quick).toBeInViewport();
  await expect(quick.locator('..').getByText('50%', { exact: true })).toBeVisible();
  expect((await quick.boundingBox())!.x).toBeGreaterThan(
    (await page.getByTestId('output-volume').boundingBox())!.x,
  );
  await page.getByTestId('music-button').click();
  await dialog(page).getByRole('button', { name: 'Off', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Done', exact: true }).click();
  await expect(quick).toHaveCount(0);
});

test('live DJ buttons switch first, focus second and preserve the order, mix and player mounts', async ({
  page,
}) => {
  await page.goto('/#/pixelpaladin/lunarlatte/cozycartographer');
  await page.getByRole('button', { name: /^Focus:/ }).click();
  await addMusic(page, 'bytebard lunarlatte cozycartographer kick:bytebard');
  await dialog(page).getByRole('button', { name: 'Automatic', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'DJ + stream audio', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Done', exact: true }).click();
  const quick = page.getByTestId('live-djs');
  const choice = (channel: string) => quick.locator(`button[data-channel="${channel}"]`);
  await expect(choice('bytebard')).toHaveCount(0); // Offline choices stay out of the strip.
  await expect(choice('lunarlatte')).toHaveAttribute('aria-pressed', 'true');
  await expect(choice('kick:bytebard')).toContainText('Kick');
  await page.getByTestId('dj-volume').fill('23');
  for (const c of ['pixelpaladin', 'lunarlatte', 'cozycartographer'])
    await player(page, c).evaluate((el) => el.setAttribute('data-mount-check', 'original'));
  await choice('cozycartographer').click();
  await expect(tile(page, 'pixelpaladin')).toHaveAttribute('data-main', 'true');
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-volume', '0.23');
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-muted', 'false');
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-muted', 'true');
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-muted', 'false');
  await choice('cozycartographer').click();
  await expect(tile(page, 'cozycartographer')).toHaveAttribute('data-main', 'true');
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-muted', 'false');
  for (const c of ['pixelpaladin', 'lunarlatte', 'cozycartographer'])
    await expect(player(page, c)).toHaveAttribute('data-mount-check', 'original');
  await quick.getByRole('button', { name: 'Resume Automatic', exact: true }).click();
  await expect(choice('lunarlatte')).toHaveAttribute('aria-pressed', 'true');
  await expect(tile(page, 'cozycartographer')).toHaveAttribute('data-main', 'true');
  await choice('kick:bytebard').click();
  await expect(player(page, 'kick:bytebard')).toHaveAttribute('data-platform', 'kick');
  await expect(player(page, 'kick:bytebard')).toHaveAttribute('data-volume', '0.23');
  await expect(tile(page, 'cozycartographer')).toHaveAttribute('data-main', 'true');
  const savedOrder = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('mtv:music')!).state.channels);
  expect(await savedOrder()).toEqual([
    'bytebard',
    'lunarlatte',
    'cozycartographer',
    'kick:bytebard',
  ]);
  await page.reload();
  await expect(choice('kick:bytebard')).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(quick).toBeInViewport();
  await choice('lunarlatte').click();
  await expect(choice('lunarlatte')).toHaveAttribute('aria-pressed', 'true');
  expect(await savedOrder()).toEqual([
    'bytebard',
    'lunarlatte',
    'cozycartographer',
    'kick:bytebard',
  ]);
});

test('quick DJ switching and Resume Automatic preserve mute all and Pause all', async ({
  page,
}) => {
  await page.goto('/#/pixelpaladin/lunarlatte/cozycartographer');
  await page.getByRole('button', { name: /^Focus:/ }).click();
  await addMusic(page, 'lunarlatte cozycartographer');
  await dialog(page).getByRole('button', { name: 'Automatic', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('body').press('m');
  await page.getByTestId('pause-all').click();
  const quick = page.getByTestId('live-djs');
  const cozy = quick.locator('button[data-channel=cozycartographer]');
  await cozy.click();
  await cozy.click();
  await expect(tile(page, 'cozycartographer')).toHaveAttribute('data-main', 'true');
  for (const c of ['pixelpaladin', 'lunarlatte', 'cozycartographer']) {
    await expect(player(page, c)).toHaveAttribute('data-muted', 'true');
    await expect(player(page, c)).toHaveAttribute('data-paused', 'true');
  }
  await quick.getByRole('button', { name: 'Resume Automatic', exact: true }).click();
  await expect(cozy).toHaveAttribute('aria-pressed', 'true');
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-paused', 'true');
  await page.getByTestId('play-all').click();
  await expect(quick.locator('button[data-channel=lunarlatte]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-muted', 'true');
  await page.locator('body').press('m');
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-muted', 'false');
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

test('DJ picker suggests live and offline music, searches follows and preserves chosen order', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'mtv:channel-prefs',
      JSON.stringify({ version: 1, state: { favorites: ['pixelpaladin'] } }),
    ),
  );
  await page.goto('/#/pixelpaladin/novastrike');
  await expect(page.getByTestId('music-button')).toBeVisible();
  await page.evaluate(() => {
    const mock = (
      window as unknown as { mtvMock: { setCategory(login: string, category: string): void } }
    ).mtvMock;
    mock.setCategory('synthwavesam', 'Music');
    mock.setCategory('holoharper', 'DJs');
  });
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
  await page.getByTestId('music-button').click();
  const choice = (login: string) =>
    page.locator(`[data-testid=music-choice][data-channel=${login}]`);
  await expect(choice('synthwavesam')).toContainText('Live in Music');
  await expect(choice('holoharper')).toContainText('Last category: DJs');
  await expect(choice('pixelpaladin')).toHaveCount(0);
  await choice('holoharper').getByRole('button').click();
  await choice('synthwavesam').getByRole('button').click();
  await expect(choice('synthwavesam').getByRole('button')).toBeDisabled();
  await expect(page.getByTestId('music-row')).toHaveCount(2);
  await expect(page.getByTestId('music-row').first()).toHaveAttribute('data-channel', 'holoharper');
  await expect(page.getByTestId('music-status')).toHaveText('Music is off.');
  await dialog(page).getByRole('button', { name: 'All followed', exact: true }).click();
  await dialog(page).getByRole('searchbox').fill('  nova  ');
  await expect(page.getByTestId('music-choice')).toHaveCount(1);
  await choice('novastrike').getByRole('button').click();
  await dialog(page).getByRole('searchbox').fill('');
  await dialog(page).getByRole('button', { name: 'Followed favorites', exact: true }).click();
  await expect(page.getByTestId('music-choice')).toHaveCount(1);
  await expect(choice('pixelpaladin')).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Done', exact: true }).click();
  await page.reload(); // Categories return to the demo defaults; local observations survive.
  await page.getByTestId('music-button').click();
  await expect(choice('synthwavesam')).toContainText('Previously seen in Music');
  await expect(choice('holoharper')).toContainText('Previously seen in DJs');
  await expect(page.getByTestId('music-row')).toHaveCount(3);
  await expect(page.getByTestId('music-row').first()).toHaveAttribute('data-channel', 'holoharper');
  await page.setViewportSize({ width: 640, height: 800 });
  await choice('holoharper').scrollIntoViewIfNeeded();
  const bounds = (await dialog(page).boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(640);
  expect(await dialog(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test('muted highlights stay quiet until audio editing, hover, focus or immersive mixing', async ({
  page,
}) => {
  await page.goto('/#/pixelpaladin/novastrike');
  await page.mouse.move(0, 0);
  await expect(tile(page, 'novastrike')).toHaveAttribute('data-silent', 'true');
  const badge = tile(page, 'novastrike').getByTestId('stream-muted-badge');
  await expect(badge).toBeHidden();
  await expect(tile(page, 'novastrike')).not.toHaveCSS('outline-style', 'dashed');
  await tile(page, 'novastrike').hover();
  await expect(badge).toBeVisible();
  await expect(tile(page, 'novastrike')).toHaveCSS('outline-style', 'dashed');
  await page.mouse.move(0, 0);
  await expect(badge).toBeHidden();
  await tile(page, 'novastrike').focus();
  await expect(badge).toBeVisible();
  await badge.focus();
  await expect(badge).toBeVisible();
  await page.getByTestId('music-button').focus();
  await expect(badge).toBeHidden();
  await page.getByTestId('mixer-button').click();
  await expect(badge).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(badge).toBeHidden();
  await expect(tile(page, 'pixelpaladin')).toHaveAttribute('data-silent', 'false');
  await player(page, 'pixelpaladin').evaluate((el) =>
    el.setAttribute('data-mount-check', 'original'),
  );
  await page.getByTestId('immersive-mix-toggle').click();
  const overlay = tile(page, 'pixelpaladin').getByTestId('stream-mix-overlay');
  await overlay.getByRole('slider').fill('0');
  await expect(tile(page, 'pixelpaladin')).toHaveAttribute('data-silent', 'true');
  await expect(tile(page, 'pixelpaladin').getByTestId('stream-muted-badge')).toHaveAttribute(
    'aria-label',
    'Stream volume is 0%',
  );
  await overlay.getByRole('slider').fill('1');
  await expect(tile(page, 'pixelpaladin')).toHaveAttribute('data-silent', 'false');
  await page.getByRole('slider', { name: 'App volume', exact: true }).fill('0');
  await expect(tile(page, 'pixelpaladin')).toHaveAttribute('data-silent', 'true');
  await page.getByRole('slider', { name: 'App volume', exact: true }).fill('100');
  await expect(tile(page, 'pixelpaladin')).toHaveAttribute('data-silent', 'false');
  await page.locator('body').press('m');
  await expect(tile(page, 'pixelpaladin')).toHaveAttribute('data-silent', 'true');
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-mount-check', 'original');
  await page.getByTestId('immersive-mix-toggle').click();
  await page.mouse.move(0, 0);
  await expect(tile(page, 'novastrike').getByTestId('stream-muted-badge')).toBeHidden();
});

test('muted highlight preference persists, and Off also hides highlights in immersive mix', async ({
  page,
}) => {
  await page.goto('/#/pixelpaladin/novastrike');
  const muted = tile(page, 'novastrike');
  const badge = muted.getByTestId('stream-muted-badge');
  await page.getByTestId('mixer-button').click();
  await page
    .getByRole('combobox', { name: 'Muted stream highlights', exact: true })
    .selectOption('always');
  await page.keyboard.press('Escape');
  await page.mouse.move(0, 0);
  await expect(badge).toBeVisible();
  await page.reload();
  await expect(badge).toBeVisible();
  await page.getByTestId('mixer-button').click();
  await page
    .getByRole('combobox', { name: 'Muted stream highlights', exact: true })
    .selectOption('off');
  await expect(badge).toBeHidden();
  await page.keyboard.press('Escape');
  await page.getByTestId('immersive-mix-toggle').click();
  await muted.hover();
  await expect(badge).toBeHidden();
  await expect(muted).not.toHaveCSS('outline-style', 'dashed');
  await expect(muted).toHaveAttribute('data-silent', 'true');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-muted', 'true');
  await page.reload();
  await expect(badge).toBeHidden();
});

test('DJ choices make manual selection, listening mix, silence and offline waiting explicit', async ({
  page,
}) => {
  await page.goto('/#/pixelpaladin/novastrike');
  await expect(page.getByTestId('music-button')).toHaveText('DJ off');
  await addMusic(page, 'bytebard lunarlatte cozycartographer');
  await dialog(page)
    .getByRole('combobox', { name: 'Pick a DJ', exact: true })
    .selectOption('lunarlatte');
  await expect(
    dialog(page).getByRole('button', { name: 'Pick a DJ', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('music-status')).toContainText('Pinned: LunarLatte');
  await dialog(page).getByRole('button', { name: 'DJ + stream audio', exact: true }).click();
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-muted', 'false');
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-muted', 'false');
  await dialog(page).getByRole('button', { name: 'DJ only', exact: true }).click();
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-muted', 'true');
  await dialog(page)
    .getByRole('combobox', { name: 'Pick a DJ', exact: true })
    .selectOption('bytebard');
  await expect(dialog(page)).toContainText('This DJ is offline. Waiting for them');
  await expect(dialog(page)).toContainText('One fixed DJ · no automatic fallback');
  await dialog(page).getByRole('button', { name: 'Automatic', exact: true }).click();
  await expect(page.getByTestId('music-status')).toContainText('Selected: LunarLatte');
  await dialog(page).getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByTestId('music-button')).toHaveText('DJ: lunarlatte');
  await page.locator('body').press('m');
  await expect(page.getByTestId('music-button')).toHaveText('DJ muted');
  await page.getByTestId('music-button').click();
  await expect(dialog(page)).toContainText('All app audio is muted.');
  await dialog(page).getByRole('button', { name: 'Unmute app', exact: true }).click();
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-muted', 'false');
  await dialog(page).getByRole('button', { name: 'Off', exact: true }).click();
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-muted', 'false');
  await expect(page.getByTestId('music-status')).toHaveText('Music is off.');
  await expect(dialog(page).getByTestId('music-row')).toHaveCount(3);
  await page.setViewportSize({ width: 480, height: 800 });
  expect(await dialog(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});
