import { expect, test, type Page } from '@playwright/test';

const channels = ['pixelpaladin', 'novastrike', 'cozycartographer', 'lunarlatte'];
const tile = (page: Page, c: string) =>
  page.locator(`[data-testid=player-tile][data-channel=${c}]`);
const player = (page: Page, c: string) => tile(page, c).locator('.mock-player');
const overlay = (page: Page, c: string) => tile(page, c).getByTestId('stream-mix-overlay');
const mix = (page: Page) => page.getByTestId('mixer');

test('immersive controls stay visible, adjust one stream without changing focus, and restore after reload', async ({
  page,
}) => {
  await page.goto(`/#/${channels.slice(0, 3).join('/')}`);
  await page.getByTestId('immersive-mix-toggle').click();
  await page.getByTestId('add-channel').hover();
  await expect(page.getByTestId('stream-mix-overlay')).toHaveCount(3);
  await page
    .locator('.mock-player')
    .evaluateAll((els) => els.forEach((el) => el.setAttribute('data-mount-check', 'original')));
  await overlay(page, 'novastrike').getByRole('slider').fill('28');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-volume', '0.28');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-muted', 'true');
  await overlay(page, 'novastrike')
    .getByRole('button', { name: 'Unmute novastrike', exact: true })
    .click();
  await expect(player(page, 'novastrike')).toHaveAttribute('data-muted', 'false');
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-muted', 'false');
  await page.getByTestId('output-volume').fill('50');
  await expect(overlay(page, 'novastrike')).toContainText('Out 14%');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-volume', '0.14');
  for (const c of channels.slice(0, 3))
    await expect(player(page, c)).toHaveAttribute('data-mount-check', 'original');
  // The overlay consumes context menus instead of closing the stream.
  await overlay(page, 'novastrike').getByRole('slider').click({ button: 'right' });
  await expect(tile(page, 'novastrike')).toBeVisible();
  await page.reload();
  await expect(overlay(page, 'novastrike').getByRole('slider')).toHaveValue('28');
  await page.getByRole('button', { name: 'Solo', exact: true }).click();
  await expect(page.getByTestId('stream-mix-overlay')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mix', exact: true }).click();
  await expect(page.getByTestId('stream-mix-overlay')).toHaveCount(3);
  await page.getByTestId('immersive-mix-toggle').click();
  await expect(page.getByTestId('stream-mix-overlay')).toHaveCount(0);
});

test('fixed priority, background and DJ levels share sliders and keep mute through changes', async ({
  page,
}) => {
  await page.addInitScript(
    () =>
      !localStorage.getItem('mtv:music') &&
      localStorage.setItem(
        'mtv:music',
        JSON.stringify({
          version: 1,
          state: {
            channels: ['lunarlatte'],
            mode: 'pinned',
            pinned: 'lunarlatte',
            volume: 0.25,
            mixWithStreams: true,
          },
        }),
      ),
  );
  await page.goto(
    '/#/pixelpaladin/novastrike/cozycartographer?layout=multi-focus&focus=pixelpaladin,novastrike',
  );
  await page.getByTestId('immersive-mix-toggle').click();
  await page.getByTestId('mixer-button').click();
  await mix(page)
    .getByRole('checkbox', { name: /Set levels by role/ })
    .check();
  await mix(page)
    .getByRole('spinbutton', { name: 'Priority level percent', exact: true })
    .fill('70');
  await mix(page)
    .getByRole('checkbox', { name: /Set background level/ })
    .check();
  await mix(page).getByRole('slider', { name: 'Background level', exact: true }).fill('15');
  await mix(page).getByRole('slider', { name: 'DJ level', exact: true }).fill('22');
  await mix(page)
    .getByRole('checkbox', { name: /Consistent volume/ })
    .check();
  await page.getByTestId('mixer-master').fill('40');
  await page.keyboard.press('Escape');
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-volume', '0.70');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-volume', '0.70');
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-volume', '0.15');
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-volume', '0.22');
  await expect(overlay(page, 'novastrike')).toContainText('Priority · linked');
  await overlay(page, 'pixelpaladin').getByRole('slider').fill('62');
  await expect(overlay(page, 'novastrike').getByRole('slider')).toHaveValue('62');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-volume', '0.62');
  await expect(overlay(page, 'cozycartographer')).toContainText('Muted');
  await page.locator('body').press('m');
  await overlay(page, 'pixelpaladin').getByRole('slider').fill('58');
  for (const c of channels) await expect(player(page, c)).toHaveAttribute('data-muted', 'true');
  await page.getByRole('button', { name: 'Unmute (M)', exact: true }).click();
  await page.keyboard.press('ArrowUp');
  await expect(overlay(page, 'pixelpaladin').getByRole('slider')).toHaveValue('63');
  await expect(overlay(page, 'novastrike').getByRole('slider')).toHaveValue('63');
  await expect(overlay(page, 'lunarlatte').getByRole('slider')).toHaveValue('27');
  await page.reload();
  await expect(player(page, 'novastrike')).toHaveAttribute('data-volume', '0.63');
  await expect(player(page, 'lunarlatte')).toHaveAttribute('data-volume', '0.27');
});

test('manual audio priorities do not change visual layout and are limited to three', async ({
  page,
}) => {
  await page.goto(`/#/${channels.join('/')}`);
  await page.getByTestId('immersive-mix-toggle').click();
  for (const c of channels.slice(0, 3))
    await overlay(page, c)
      .getByRole('button', { name: `Make ${c} an audio priority`, exact: true })
      .click();
  await expect(
    overlay(page, 'lunarlatte').getByRole('button', { name: /Make .* an audio priority/ }),
  ).toBeDisabled();
  for (const c of channels) await expect(tile(page, c)).toHaveAttribute('data-main', 'false');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-muted', 'true');
  await overlay(page, 'novastrike')
    .getByRole('button', { name: 'Remove novastrike from audio priority', exact: true })
    .click();
  await overlay(page, 'lunarlatte')
    .getByRole('button', { name: /Make .* an audio priority/ })
    .click();
  await page.getByTestId('mixer-button').click();
  await expect(mix(page).getByRole('combobox', { name: 'Priority selection' })).toHaveValue(
    'manual',
  );
  await expect(page.getByTestId('mix-priorities')).toContainText(
    'pixelpaladin, cozycartographer, lunarlatte',
  );
  await mix(page).getByRole('combobox', { name: 'Priority selection' }).selectOption('focus');
  await expect(page.getByTestId('mix-priorities')).toHaveText('Priority: pixelpaladin');
});

test('fixed levels restore individual balances when disabled and controls fit a narrow window', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'mtv:channel-prefs',
      JSON.stringify({ version: 1, state: { volumes: { pixelpaladin: 0.19, novastrike: 0.32 } } }),
    ),
  );
  await page.goto('/#/pixelpaladin/novastrike?layout=multi-focus&focus=pixelpaladin,novastrike');
  await page.getByTestId('immersive-mix-toggle').click();
  await page.getByTestId('mixer-button').click();
  await mix(page)
    .getByRole('checkbox', { name: /Set levels by role/ })
    .check();
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-volume', '0.70');
  await mix(page)
    .getByRole('checkbox', { name: /Set levels by role/ })
    .uncheck();
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-volume', '0.19');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-volume', '0.32');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 640, height: 800 });
  await page.getByRole('button', { name: 'Collapse sidebar (B)', exact: true }).click();
  for (const c of channels.slice(0, 2)) {
    const box = (await tile(page, c).boundingBox())!;
    const bar = (await overlay(page, c).boundingBox())!;
    expect(bar.x).toBeGreaterThanOrEqual(box.x);
    expect(bar.x + bar.width).toBeLessThanOrEqual(box.x + box.width + 1);
    expect(bar.y + bar.height).toBeLessThanOrEqual(box.y + box.height);
  }
  await page.getByTestId('mixer-button').click();
  await mix(page).getByRole('slider', { name: 'DJ level', exact: true }).fill('30');
  const rect = (await page.getByTestId('mixer').boundingBox())!;
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(640);
});
