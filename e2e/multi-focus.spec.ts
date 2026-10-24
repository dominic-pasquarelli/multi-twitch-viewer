import { expect, test, type Page } from '@playwright/test';

const channels = ['pixelpaladin', 'novastrike', 'cozycartographer', 'lunarlatte'];
const tile = (page: Page, c: string) =>
  page.locator(`[data-testid=player-tile][data-channel=${c}]`);
const player = (page: Page, c: string) => tile(page, c).locator('.mock-player');
const row = (page: Page, c: string) => page.locator(`[data-testid=mixer-row][data-channel=${c}]`);

test('connection recovery protects all three focused streams even when muted', async ({
  page,
  context,
}) => {
  await page.goto(
    `/#/${channels.join('/')}?layout=multi-focus&focus=${channels.slice(0, 3).join(',')}`,
  );
  for (const c of channels) await expect(player(page, c)).toHaveAttribute('data-paused', 'false');
  await page.locator('body').press('m');
  await context.setOffline(true);
  await expect(page.getByRole('status').filter({ hasText: 'Connection recovery' })).toBeVisible();
  await expect(player(page, channels[3]!)).toHaveAttribute('data-paused', 'true');
  for (const c of channels.slice(0, 3)) {
    await expect(player(page, c)).toHaveAttribute('data-muted', 'true');
    await expect(player(page, c)).toHaveAttribute('data-paused', 'false');
    await expect(player(page, c)).toHaveAttribute('data-quality', 'chunked');
  }
});

test('multi focus selects peers, balances their audio, preserves players and restores the session', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'mtv:settings',
      JSON.stringify({ version: 1, state: { otherQuality: '720p' } }),
    ),
  );
  await page.goto(`/#/${channels.join('/')}`);
  await expect(player(page, channels[0]!)).toHaveAttribute('data-paused', 'false');
  await page
    .locator('.mock-player')
    .evaluateAll((els) => els.forEach((el) => el.setAttribute('data-mount-check', 'original')));
  await page.getByRole('button', { name: 'Multi focus', exact: true }).click();
  for (const c of channels.slice(0, 2)) {
    await expect(tile(page, c)).toHaveAttribute('data-main', 'true');
    await expect(player(page, c)).toHaveAttribute('data-muted', 'false');
    await expect(player(page, c)).toHaveAttribute('data-volume', '0.50');
    await expect(player(page, c)).toHaveAttribute('data-quality', 'chunked');
  }
  await expect(player(page, channels[2]!)).toHaveAttribute('data-muted', 'true');
  await page.getByTestId('mixer-button').click();
  await row(page, channels[0]!).getByRole('slider').fill('25');
  await expect(player(page, channels[0]!)).toHaveAttribute('data-volume', '0.25');
  await expect(player(page, channels[1]!)).toHaveAttribute('data-volume', '0.50');
  await row(page, channels[2]!)
    .getByRole('button', { name: /Add .* to multi focus/ })
    .click();
  await expect(tile(page, channels[2]!)).toHaveAttribute('data-main', 'true');
  await expect(player(page, channels[2]!)).toHaveAttribute('data-quality', 'chunked');
  await expect(
    row(page, channels[3]!).getByRole('button', { name: /Add .* to multi focus/ }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Equal levels', exact: true }).click();
  for (const c of channels.slice(0, 3))
    await expect(player(page, c)).toHaveAttribute('data-volume', '0.33');
  await page.keyboard.press('Escape');
  await page.locator('body').press('m');
  for (const c of channels) await expect(player(page, c)).toHaveAttribute('data-muted', 'true');
  await page.locator('body').press('m');
  for (const c of channels.slice(0, 3))
    await expect(player(page, c)).toHaveAttribute('data-muted', 'false');
  const boxes = await Promise.all(channels.map((c) => tile(page, c).boundingBox()));
  for (const box of boxes.slice(0, 3)) {
    expect(Math.abs(box!.width - boxes[0]!.width)).toBeLessThanOrEqual(1);
    expect(box!.width).toBeGreaterThan(boxes[3]!.width);
  }
  for (const c of channels)
    await expect(player(page, c)).toHaveAttribute('data-mount-check', 'original');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Multi focus', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  for (const c of channels.slice(0, 3)) {
    await expect(tile(page, c)).toHaveAttribute('data-main', 'true');
    await expect(player(page, c)).toHaveAttribute('data-volume', '0.33');
  }
  await tile(page, channels[1]!).hover();
  await tile(page, channels[1]!).getByRole('button', { name: 'Remove from multi focus' }).click();
  await expect(tile(page, channels[1]!)).toHaveAttribute('data-main', 'false');
  await expect(player(page, channels[1]!)).toHaveAttribute('data-muted', 'true');
});

test('consistent-volume mixer balances focused streams independently and share links select them', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'mtv:settings',
      JSON.stringify({ version: 1, state: { consistentVolume: true } }),
    ),
  );
  await page.goto(`/#/${channels.join('/')}?layout=multi-focus&focus=novastrike,cozycartographer`);
  await expect(tile(page, 'novastrike')).toHaveAttribute('data-main', 'true');
  await expect(tile(page, 'cozycartographer')).toHaveAttribute('data-main', 'true');
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-muted', 'true');
  await page.getByTestId('mixer-button').click();
  await row(page, 'novastrike').getByRole('slider').fill('20');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-volume', '0.20');
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-volume', '0.50');
  await page.getByTestId('mixer-master').fill('80');
  await expect(player(page, 'novastrike')).toHaveAttribute('data-volume', '0.32');
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-volume', '0.80');
  await page.getByRole('button', { name: 'Equal levels', exact: true }).click();
  await expect(player(page, 'novastrike')).toHaveAttribute('data-volume', '0.40');
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-volume', '0.40');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    window.location.hash = '#/pixelpaladin/novastrike';
  });
  await expect(tile(page, 'pixelpaladin')).toHaveAttribute('data-main', 'false');
  await expect(tile(page, 'novastrike')).toHaveAttribute('data-main', 'false');
});
