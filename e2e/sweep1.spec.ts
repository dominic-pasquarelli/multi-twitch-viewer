import { expect, test, type Page } from '@playwright/test';

const tile = (page: Page, login: string) =>
  page.locator(`[data-testid=player-tile][data-channel=${login}]`);
const player = (page: Page, login: string) => tile(page, login).locator('.mock-player');
const channels = ['pixelpaladin', 'novastrike', 'cozycartographer', 'lunarlatte'];

test('keyboard focus and chat use the isolated group', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'mtv:session',
      JSON.stringify({
        version: 1,
        state: {
          pinned: true,
          view: {
            channels: ['pixelpaladin', 'novastrike'],
            layout: { mode: 'grid', main: 'pixelpaladin', mainScale: 'auto' },
            audio: { mode: 'solo', active: ['pixelpaladin'] },
            chat: { open: true, channel: 'pixelpaladin' },
            groups: [
              { id: 'gta', name: 'GTA', channels: ['pixelpaladin'] },
              { id: 'mc', name: 'Minecraft', channels: ['novastrike'] },
            ],
            activeGroup: 'mc',
          },
        },
      }),
    ),
  );
  await page.goto('/');
  await expect(tile(page, 'pixelpaladin')).toBeHidden();
  await expect(tile(page, 'novastrike')).toBeVisible();
  await expect(page.getByTestId('chat-panel').getByRole('tab')).toHaveCount(1);
  await expect(page.getByTestId('chat-panel').getByRole('tab')).toHaveText('novastrike');
  await page.keyboard.press('1');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-muted', 'false');
  await page
    .getByRole('group', { name: 'Layout', exact: true })
    .getByRole('button', { name: /Focus/ })
    .click();
  await expect(player(page, 'novastrike')).toHaveAttribute('data-muted', 'false');
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-paused', 'true');
});

test('tile controls remain above videos and focus changes preserve an adjusted mix', async ({
  page,
}) => {
  await page.goto('/#/pixelpaladin/novastrike?layout=focus');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-paused', 'false');
  await page.getByRole('button', { name: 'Mix', exact: true }).click();
  const controls = tile(page, 'novastrike').getByTestId('stream-controls');
  await controls.getByRole('button', { name: 'Listen to this stream', exact: true }).click();
  await controls.getByRole('slider').fill('25');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-volume', '0.25');
  await controls.getByRole('button', { name: 'Make this the main stream' }).click();
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-muted', 'false');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-muted', 'false');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-volume', '0.25');
  for (const login of ['pixelpaladin', 'novastrike']) {
    const bar = (await tile(page, login).getByTestId('stream-controls').boundingBox())!;
    const video = (await player(page, login).boundingBox())!;
    expect(bar.y + bar.height).toBeLessThanOrEqual(video.y + 1);
    await expect(tile(page, login).getByRole('button', { name: 'Reload player' })).toBeVisible();
  }
});

test('Pause all stays paused and Play all resumes the streams', async ({ page }) => {
  await page.goto('/#/pixelpaladin/novastrike');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-paused', 'false');
  await page.getByTestId('pause-all').click();
  for (const login of channels.slice(0, 2))
    await expect(player(page, login)).toHaveAttribute('data-paused', 'true');
  await page.waitForTimeout(2200);
  for (const login of channels.slice(0, 2))
    await expect(player(page, login)).toHaveAttribute('data-paused', 'true');
  await page.getByTestId('play-all').click();
  for (const login of channels.slice(0, 2))
    await expect(player(page, login)).toHaveAttribute('data-paused', 'false');
});

test('groups cluster, isolate, preserve mounts and audio, and keep manual pauses', async ({
  page,
}) => {
  await page.goto(`/#/${channels.join('/')}?layout=focus`);
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-paused', 'false');
  await page.getByRole('button', { name: 'Mix', exact: true }).click();
  await tile(page, 'cozycartographer')
    .getByRole('button', { name: 'Listen to this stream', exact: true })
    .click();
  await tile(page, 'cozycartographer').getByRole('slider').fill('30');
  await page.getByTestId('manage-groups').click();
  const dialog = page.getByRole('dialog', { name: 'Stream groups', exact: true });
  const create = async (name: string, logins: string[]) => {
    await dialog.getByRole('textbox', { name: 'New group name' }).fill(name);
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    for (const login of logins)
      await dialog.getByRole('checkbox', { name: login, exact: true }).check();
  };
  await create('GTA RP', channels.slice(0, 2));
  await create('Minecraft', channels.slice(2));
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByTestId('stream-section')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/sweep1-groups.png' });
  const gtaBox = (await tile(page, 'pixelpaladin').boundingBox())!;
  const mcBox = (await tile(page, 'cozycartographer').boundingBox())!;
  expect(Math.abs(gtaBox.x - mcBox.x) + Math.abs(gtaBox.y - mcBox.y)).toBeGreaterThan(20);
  // A sentinel detects a replaced/remounted mock player as well as a replaced tile.
  await player(page, 'cozycartographer').evaluate((el) =>
    el.setAttribute('data-mount-sentinel', 'original'),
  );
  await player(page, 'lunarlatte').dispatchEvent('pointerdown');
  await page.evaluate(() =>
    (window as unknown as { mtvMock: { pause(login: string): void } }).mtvMock.pause('lunarlatte'),
  );
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-paused', 'true');
  const tabs = page.getByRole('navigation', { name: 'Stream groups' });
  await tabs.getByRole('button', { name: /^GTA RP/ }).click();
  await expect(tile(page, 'cozycartographer')).toBeHidden();
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-paused', 'true');
  await tabs.getByRole('button', { name: /^Minecraft/ }).click();
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-paused', 'false');
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-paused', 'true');
  await tabs.getByRole('button', { name: /^GTA RP/ }).click();
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-paused', 'true');
  await page.getByTestId('play-all').click();
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-paused', 'true');
  await tabs.getByRole('button', { name: /^Minecraft/ }).click();
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-paused', 'false');
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-volume', '0.30');
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-muted', 'false');
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-mount-sentinel', 'original');
  // Play all deliberately clears manual pause holds, even on hidden players.
  await tabs.getByRole('button', { name: /^All groups/ }).click();
  await expect(page.getByTestId('stream-section')).toHaveCount(2);
  await expect(tile(page, 'pixelpaladin')).toBeVisible();
  await page.reload();
  await expect(tabs.getByRole('button', { name: /^GTA RP/ })).toBeVisible();
  await expect(tabs.getByRole('button', { name: /^Minecraft/ })).toBeVisible();
});

test('bandwidth recovery pauses muted streams and restarts them gradually', async ({
  page,
  context,
}) => {
  test.setTimeout(65000);
  await page.goto('/#/pixelpaladin/novastrike/cozycartographer?layout=focus');
  for (const login of channels.slice(0, 3))
    await expect(player(page, login)).toHaveAttribute('data-paused', 'false');
  await context.setOffline(true);
  await expect(player(page, 'novastrike')).toHaveAttribute('data-paused', 'true');
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-paused', 'true');
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-paused', 'false');
  await context.setOffline(false);
  await expect(player(page, 'novastrike')).toHaveAttribute('data-paused', 'false', {
    timeout: 22000,
  });
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-paused', 'true');
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-paused', 'false', {
    timeout: 14000,
  });
});
