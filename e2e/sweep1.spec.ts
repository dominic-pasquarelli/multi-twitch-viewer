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

test('hover controls overlay full-size videos and focus changes preserve an adjusted mix', async ({
  page,
}) => {
  await page.goto('/#/pixelpaladin/novastrike?layout=focus');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-paused', 'false');
  await page.getByRole('button', { name: 'Mix', exact: true }).click();
  await tile(page, 'novastrike').hover();
  const controls = tile(page, 'novastrike').getByTestId('stream-controls');
  await controls.getByRole('button', { name: 'Listen to this stream', exact: true }).click();
  await controls.getByRole('slider').fill('25');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-volume', '0.25');
  await controls.getByRole('button', { name: 'Make this the main stream' }).click();
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-muted', 'false');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-muted', 'false');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-volume', '0.25');
  for (const login of ['pixelpaladin', 'novastrike']) {
    await tile(page, login).hover();
    const bar = (await tile(page, login).getByTestId('stream-controls').boundingBox())!;
    const video = (await player(page, login).boundingBox())!;
    const outer = (await tile(page, login).boundingBox())!;
    expect(video.y).toBeCloseTo(outer.y, 0);
    expect(video.x).toBeCloseTo(outer.x, 0);
    expect(video.width).toBeCloseTo(outer.width, 0);
    expect(video.height).toBeCloseTo(outer.height, 0);
    // Layout rectangles snap to whole pixels; allow that rounding, not a control strip.
    expect(Math.abs(video.height - (video.width * 9) / 16)).toBeLessThanOrEqual(2);
    expect(bar.y).toBeCloseTo(video.y, 0);
    expect(bar.y + bar.height).toBeLessThan(video.y + video.height);
    await expect(tile(page, login).getByRole('button', { name: 'Reload player' })).toBeVisible();
  }
  await page.getByTestId('add-channel').focus();
  await page.getByTestId('add-channel').hover();
  for (const login of ['pixelpaladin', 'novastrike'])
    await expect(tile(page, login).getByTestId('stream-controls')).toBeHidden();
});

test('hover outlines clear outside the viewer and volume controls remain usable while focused', async ({
  page,
}) => {
  await page.goto('/#/pixelpaladin/novastrike/cozycartographer?layout=focus');
  const stream = tile(page, 'novastrike');
  const controls = stream.getByTestId('stream-controls');
  await stream.hover();
  await expect(controls).toBeVisible();
  await expect(stream).toHaveAttribute('data-audible', 'false');
  await expect(stream).not.toHaveCSS('outline-color', 'rgba(0, 0, 0, 0)');
  await page.getByTestId('add-channel').hover();
  await expect(controls).toBeHidden();
  await expect(stream).toHaveCSS('outline-color', 'rgba(0, 0, 0, 0)');

  await stream.hover();
  await stream.getByRole('slider').focus();
  await page.getByTestId('add-channel').hover();
  await expect(controls).toBeVisible();
  await stream.getByRole('slider').fill('35');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-volume', '0.35');
  await page.getByTestId('add-channel').focus();
  await expect(controls).toBeHidden();
});

test('five-stream focus and grid layouts keep full 16:9 video areas without idle control strips', async ({
  page,
}) => {
  await page.setViewportSize({ width: 2558, height: 1381 });
  const fiveChannels = [...channels, 'quickscopequeen'];
  for (const mode of ['focus', 'grid']) {
    await page.goto(`/#/${fiveChannels.join('/')}?layout=${mode}`);
    await expect(page.getByTestId('player-tile')).toHaveCount(5);
    await page.getByTestId('add-channel').hover();
    for (const login of fiveChannels) {
      await expect(player(page, login)).toHaveAttribute('data-paused', 'false');
      await expect(tile(page, login).getByTestId('stream-controls')).toBeHidden();
      const video = (await player(page, login).boundingBox())!;
      const outer = (await tile(page, login).boundingBox())!;
      expect(video.x).toBeCloseTo(outer.x, 0);
      expect(video.y).toBeCloseTo(outer.y, 0);
      expect(video.width).toBeCloseTo(outer.width, 0);
      expect(video.height).toBeCloseTo(outer.height, 0);
      expect(Math.abs(video.height - (video.width * 9) / 16)).toBeLessThanOrEqual(2);
    }
    if (mode === 'focus') {
      await page.screenshot({ path: 'test-results/fixed-stream-borders.png' });
      await tile(page, 'novastrike').hover();
      await page.screenshot({ path: 'test-results/fixed-stream-hover.png' });
    }
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
  await tile(page, 'cozycartographer').hover();
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

test('bandwidth saving can be disabled immediately and stays off across restarts', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    // Existing saved settings omit the new preference and keep its enabled default.
    if (!localStorage.getItem('mtv:settings'))
      localStorage.setItem(
        'mtv:settings',
        JSON.stringify({ version: 1, state: { otherQuality: '720p' } }),
      );
    if (!localStorage.getItem('mtv:session'))
      localStorage.setItem(
        'mtv:session',
        JSON.stringify({
          version: 1,
          state: {
            pinned: true,
            view: {
              channels: ['pixelpaladin', 'novastrike', 'cozycartographer', 'lunarlatte'],
              layout: { mode: 'focus', main: 'pixelpaladin', mainScale: 'auto' },
              audio: { mode: 'solo', active: ['pixelpaladin'] },
              chat: { open: false, channel: 'pixelpaladin' },
              groups: [
                {
                  id: 'watching',
                  name: 'Watching',
                  channels: ['pixelpaladin', 'novastrike', 'cozycartographer'],
                },
                { id: 'other', name: 'Other', channels: ['lunarlatte'] },
              ],
              activeGroup: 'watching',
            },
          },
        }),
      );
  });
  await page.goto('/');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-quality', '720p60');
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-paused', 'false');
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-paused', 'true');
  await player(page, 'cozycartographer').dispatchEvent('pointerdown');
  await page.evaluate(() =>
    (window as unknown as { mtvMock: { pause(login: string): void } }).mtvMock.pause(
      'cozycartographer',
    ),
  );
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Players', exact: true }).click();
  const saving = page.getByRole('checkbox', { name: /Automatic bandwidth saving/ });
  await expect(saving).toBeChecked();
  await context.setOffline(true);
  await expect(player(page, 'novastrike')).toHaveAttribute('data-paused', 'true');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-quality', '360p30');
  await saving.uncheck();
  await expect(player(page, 'novastrike')).toHaveAttribute('data-paused', 'false');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-quality', '720p60');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-volume', '0.50');
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-paused', 'false');
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-paused', 'true');
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-paused', 'true');
  await expect(page.getByText(/Connection recovery: background quality reduced/)).toBeHidden();
  await page.keyboard.press('Escape');
  // Hidden-group pauses still work with bandwidth saving disabled, even offline.
  const groups = page.getByRole('navigation', { name: 'Stream groups' });
  await groups.getByRole('button', { name: /^Other/ }).click();
  await expect(player(page, 'novastrike')).toHaveAttribute('data-paused', 'true');
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-paused', 'false');
  await groups.getByRole('button', { name: /^Watching/ }).click();
  await expect(player(page, 'novastrike')).toHaveAttribute('data-paused', 'false');
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-paused', 'true');
  await context.setOffline(false);
  // The seed only fills empty storage; a restart loads the persisted preference.
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Players', exact: true }).click();
  await expect(saving).not.toBeChecked();
  await context.setOffline(true);
  await expect(player(page, 'novastrike')).toHaveAttribute('data-quality', '720p60');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-paused', 'false');
  await expect(page.getByText(/Connection recovery: background quality reduced/)).toBeHidden();
  // Re-enabling responds to new pressure normally.
  await saving.check();
  await expect(player(page, 'novastrike')).toHaveAttribute('data-paused', 'true');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-quality', '360p30');
  await context.setOffline(false);
});
