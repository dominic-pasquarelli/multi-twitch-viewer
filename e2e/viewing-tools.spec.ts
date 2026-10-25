import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const tile = (page: Page, login: string) =>
  page.locator(`[data-testid=player-tile][data-channel=${login}]`);
const player = (page: Page, login: string) => tile(page, login).locator('.mock-player');
const music = (page: Page) => page.getByRole('dialog', { name: 'Music', exact: true });
const tools = (page: Page) => page.getByRole('dialog', { name: 'Playback tools', exact: true });
async function addDJs(page: Page, names: string) {
  await page.getByTestId('music-button').click();
  await music(page).getByRole('textbox', { name: 'Add music channels' }).fill(names);
  await music(page).getByRole('button', { name: 'Add', exact: true }).click();
}
async function mockStatus(
  page: Page,
  changes: { login: string; live?: boolean; category?: string }[],
) {
  await page.evaluate((changes) => {
    const mock = (
      window as unknown as {
        mtvMock: { setCategory(l: string, c: string): void; setLive(l: string, v: boolean): void };
      }
    ).mtvMock;
    for (const c of changes) {
      if (c.category) mock.setCategory(c.login, c.category);
      if (c.live !== undefined) mock.setLive(c.login, c.live);
    }
  }, changes);
}

test('DJ rules filter categories, keep the current DJ, skip for the session and apply trims/fades', async ({
  page,
}) => {
  await page.goto('/#/novastrike');
  await mockStatus(page, [
    { login: 'synthwavesam', category: 'Music' },
    { login: 'holoharper', category: 'DJs' },
  ]);
  await addDJs(page, 'pixelpaladin synthwavesam holoharper');
  await music(page).getByText('DJ rules and transitions', { exact: true }).click();
  await music(page)
    .getByRole('checkbox', { name: /Only automatically select/ })
    .check();
  await music(page)
    .getByRole('checkbox', { name: /Keep the current DJ/ })
    .check();
  await music(page).getByRole('button', { name: 'Automatic', exact: true }).click();
  await expect(page.getByTestId('music-status')).toContainText('SynthWaveSam');
  await music(page).getByRole('slider', { name: 'Music volume', exact: true }).fill('20');
  await music(page).getByRole('slider', { name: 'SynthWaveSam DJ trim', exact: true }).fill('50');
  await music(page)
    .getByRole('combobox', { name: 'DJ transition fade', exact: true })
    .selectOption('0.5');
  await expect(player(page, 'synthwavesam')).toHaveAttribute('data-volume', '0.10');
  await page
    .locator('[data-testid=music-row][data-channel=synthwavesam]')
    .getByRole('button', { name: 'Skip this session', exact: true })
    .click();
  await expect(page.getByTestId('music-status')).toContainText('No preferred DJs');
  await music(page).getByRole('button', { name: 'Done', exact: true }).click();
  await mockStatus(page, [{ login: 'holoharper', live: true }]);
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
  await expect(player(page, 'holoharper')).toHaveAttribute('data-volume', '0.20');
  await mockStatus(page, [{ login: 'pixelpaladin', category: 'Music' }]);
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
  await page.getByTestId('music-button').click();
  await expect(page.getByTestId('music-status')).toContainText('HoloHarper');
  await music(page).getByText('DJ rules and transitions', { exact: true }).click();
  await music(page)
    .getByRole('checkbox', { name: /Keep the current DJ/ })
    .uncheck();
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-volume', '0.20');
  await page.reload();
  await page.getByTestId('music-button').click();
  await expect(
    music(page).getByRole('slider', { name: 'SynthWaveSam DJ trim', exact: true }),
  ).toHaveValue('50');
  await expect(music(page).getByRole('button', { name: /Skipped this session/ })).toHaveCount(0);
});

test('hold-to-listen restores the original mix and mute-all cancels a held preview', async ({
  page,
}) => {
  await page.goto('/#/pixelpaladin/novastrike');
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-muted', 'false');
  await player(page, 'pixelpaladin').evaluate((el) =>
    el.setAttribute('data-mount-check', 'original'),
  );
  await tile(page, 'novastrike').hover();
  await page.keyboard.down('q');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-muted', 'false');
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-volume', '0.06');
  await page.keyboard.up('q');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-muted', 'true');
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-volume', '0.50');
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-mount-check', 'original');
  const hold = tile(page, 'novastrike').getByRole('button', {
    name: 'Hold to listen to novastrike (Q)',
    exact: true,
  });
  await hold.hover();
  await page.mouse.down();
  await expect(player(page, 'novastrike')).toHaveAttribute('data-muted', 'false');
  await page.mouse.move(10, 10);
  await page.mouse.up();
  await expect(player(page, 'novastrike')).toHaveAttribute('data-muted', 'true');
  await tile(page, 'novastrike').hover();
  await page.keyboard.down('q');
  await page.keyboard.press('m');
  await page.keyboard.up('q');
  for (const login of ['pixelpaladin', 'novastrike'])
    await expect(player(page, login)).toHaveAttribute('data-muted', 'true');
});

test('complete scenes restore DJs and mix preferences, including through keyboard Undo', async ({
  page,
}) => {
  await page.goto('/#/pixelpaladin/novastrike?layout=multi-focus&focus=pixelpaladin,novastrike');
  await page.getByTestId('immersive-mix-toggle').click();
  await page.getByRole('slider', { name: 'App volume', exact: true }).fill('40');
  await addDJs(page, 'synthwavesam');
  await music(page).getByRole('button', { name: 'Automatic', exact: true }).click();
  await music(page).getByRole('slider', { name: 'Music volume', exact: true }).fill('20');
  await music(page).getByRole('slider', { name: 'SynthWaveSam DJ trim', exact: true }).fill('50');
  await music(page).getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByTestId('presets-button').click();
  await page.getByRole('button', { name: 'Save current…', exact: true }).click();
  await page.getByTestId('preset-name').fill('Working');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('slider', { name: 'App volume', exact: true }).fill('100');
  await page.getByTestId('music-button').click();
  await music(page).getByRole('button', { name: 'Off', exact: true }).click();
  await music(page).getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByTestId('immersive-mix-toggle').click();
  await page.getByTestId('presets-button').click();
  await page.getByTestId('preset-load').filter({ hasText: 'Working' }).click();
  await expect(page.getByRole('slider', { name: 'App volume', exact: true })).toHaveValue('40');
  await expect(player(page, 'synthwavesam')).toHaveAttribute('data-volume', '0.04');
  await expect(tile(page, 'pixelpaladin').getByTestId('stream-mix-overlay')).toBeVisible();
  await page.locator('body').press('Control+z');
  await expect(page.getByRole('slider', { name: 'App volume', exact: true })).toHaveValue('100');
  await expect(tile(page, 'synthwavesam')).toHaveCount(0);
  await expect(page.getByTestId('stream-mix-overlay')).toHaveCount(0);
});

test('muted indicators open actionable reasons and playback health respects manual pauses', async ({
  page,
}) => {
  await page.goto('/#/pixelpaladin/novastrike');
  await tile(page, 'novastrike').getByTestId('stream-muted-badge').click();
  const audio = page.getByRole('dialog', { name: 'Stream audio', exact: true });
  await expect(audio.getByRole('status')).toHaveText('Muted by Solo');
  await audio.getByRole('button', { name: 'Listen to novastrike', exact: true }).click();
  await expect(player(page, 'novastrike')).toHaveAttribute('data-muted', 'false');
  await audio.getByRole('button', { name: 'Done', exact: true }).click();
  await tile(page, 'novastrike').hover();
  await tile(page, 'novastrike')
    .getByRole('button', { name: 'Pause novastrike', exact: true })
    .click();
  await page.getByTestId('playback-tools-button').click();
  const row = page.locator('[data-testid=health-row][data-channel=novastrike]');
  await expect(row).toContainText('Paused by you');
  await row.getByRole('button', { name: 'Resume novastrike', exact: true }).click();
  await expect(player(page, 'novastrike')).toHaveAttribute('data-paused', 'false');
  await expect(row).toContainText('playing');
  await page.setViewportSize({ width: 640, height: 800 });
  expect(await tools(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test('sleep timer fades using wall-clock time, pauses streams and preserves saved output', async ({
  page,
}) => {
  await page.goto('/#/pixelpaladin/novastrike');
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-volume', '0.50');
  await page.clock.install();
  await page.getByTestId('playback-tools-button').click();
  await tools(page).getByRole('tab', { name: 'Sleep timer', exact: true }).click();
  await tools(page).getByRole('spinbutton', { name: 'Sleep timer minutes' }).fill('1');
  await tools(page).getByRole('combobox', { name: 'Sleep timer fade' }).selectOption('10');
  await tools(page).getByRole('button', { name: 'Start sleep timer', exact: true }).click();
  await page.clock.fastForward(55_000);
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-volume', '0.25');
  await page.clock.fastForward(5_000);
  await expect(tools(page).getByTestId('sleep-timer-status')).toContainText('Timer finished');
  await page.clock.fastForward(10_000);
  for (const login of ['pixelpaladin', 'novastrike'])
    await expect(player(page, login)).toHaveAttribute('data-paused', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('slider', { name: 'App volume', exact: true })).toHaveValue('100');
  await page.getByRole('button', { name: /Play all/, exact: false }).click();
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-paused', 'false');
});

test('full backup previews and restores settings while rejecting invalid files', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'mtv:settings',
      JSON.stringify({
        version: 1,
        state: { kickClientSecret: 'must-not-export', clientId: 'private-client' },
      }),
    ),
  );
  await page.goto('/#/pixelpaladin/novastrike');
  await page.getByRole('slider', { name: 'App volume', exact: true }).fill('42');
  await page.getByTestId('playback-tools-button').click();
  await tools(page).getByRole('tab', { name: 'Backup & restore', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await tools(page).getByRole('button', { name: 'Download full backup', exact: true }).click();
  const download = await downloading;
  const text = await readFile((await download.path())!, 'utf8');
  expect(text).not.toContain('must-not-export');
  expect(text).not.toContain('private-client');
  await page.keyboard.press('Escape');
  await page.getByRole('slider', { name: 'App volume', exact: true }).fill('80');
  await page.getByTestId('playback-tools-button').click();
  await tools(page).getByRole('tab', { name: 'Backup & restore', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await tools(page).getByRole('button', { name: 'Choose backup to restore', exact: true }).click();
  await (
    await chooser
  ).setFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(tools(page).getByRole('region', { name: 'Backup restore preview' })).toBeVisible();
  await tools(page).getByRole('button', { name: 'Restore these settings', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('slider', { name: 'App volume', exact: true })).toHaveValue('42');
  await page.getByTestId('playback-tools-button').click();
  await tools(page).getByRole('tab', { name: 'Backup & restore', exact: true }).click();
  const badChooser = page.waitForEvent('filechooser');
  await tools(page).getByRole('button', { name: 'Choose backup to restore', exact: true }).click();
  await (
    await badChooser
  ).setFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"no"}'),
  });
  await expect(tools(page).getByRole('alert')).toContainText('Unsupported backup');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('slider', { name: 'App volume', exact: true })).toHaveValue('42');
});

test('Mix plus Multi focus can unmute several watched DJ candidates without switching the music pin', async ({
  page,
}) => {
  await page.goto('/#/pixelpaladin/novastrike/cozycartographer');
  await addDJs(page, 'pixelpaladin novastrike lunarlatte');
  await music(page).getByRole('button', { name: 'Pin LunarLatte as music', exact: true }).click();
  await music(page).getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Multi focus', exact: true }).click();
  for (const c of ['pixelpaladin', 'novastrike', 'lunarlatte'])
    await expect(player(page, c)).toHaveAttribute('data-muted', 'false');
  await page.getByTestId('immersive-mix-toggle').click();
  const overlay = tile(page, 'novastrike').getByTestId('stream-mix-overlay');
  await overlay.getByRole('button', { name: 'Mute novastrike', exact: true }).click();
  await expect(player(page, 'novastrike')).toHaveAttribute('data-muted', 'true');
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-muted', 'false');
  await overlay.getByRole('button', { name: 'Unmute novastrike', exact: true }).click();
  for (const c of ['pixelpaladin', 'novastrike', 'lunarlatte'])
    await expect(player(page, c)).toHaveAttribute('data-muted', 'false');
  await page.getByTestId('music-button').click();
  await expect(page.getByTestId('music-status')).toContainText('Pinned: LunarLatte');
});
