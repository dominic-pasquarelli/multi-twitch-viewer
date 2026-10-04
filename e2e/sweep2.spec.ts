import { expect, test, type Page } from '@playwright/test';

const channels = [
  'pixelpaladin',
  'novastrike',
  'cozycartographer',
  'lunarlatte',
  'quickscopequeen',
];
const tile = (page: Page, login: string) =>
  page.locator(`[data-testid=player-tile][data-channel=${login}]`);
const player = (page: Page, login: string) => tile(page, login).locator('.mock-player');

async function seedGroups(page: Page) {
  await page.addInitScript(() => {
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
              channels: [
                'pixelpaladin',
                'novastrike',
                'cozycartographer',
                'lunarlatte',
                'quickscopequeen',
              ],
              layout: { mode: 'focus', main: 'pixelpaladin', mainScale: 'auto' },
              audio: { mode: 'solo', active: ['pixelpaladin'] },
              chat: { open: false, channel: 'pixelpaladin' },
              groups: [
                { id: 'gta', name: 'GTA RP', channels: ['pixelpaladin', 'novastrike'] },
                { id: 'mc', name: 'Minecraft', channels: ['cozycartographer', 'lunarlatte'] },
              ],
              activeGroup: null,
            },
          },
        }),
      );
  });
}

async function expectMain(page: Page, main: string, visible = channels) {
  await expect(tile(page, main)).toHaveAttribute('data-main', 'true');
  const mainBox = (await tile(page, main).boundingBox())!;
  for (const login of visible.filter((l) => l !== main)) {
    await expect(tile(page, login)).toHaveAttribute('data-main', 'false');
    const box = (await tile(page, login).boundingBox())!;
    expect(mainBox.width).toBeGreaterThan(box.width);
    await expect(player(page, login)).toHaveAttribute('data-quality', '720p60');
  }
  await expect(player(page, main)).toHaveAttribute('data-quality', 'chunked');
}

async function promote(page: Page, login: string) {
  await tile(page, login).hover();
  await tile(page, login).getByRole('button', { name: 'Make this the main stream' }).click();
}

test('one focused stream takes priority across groups while mix and player mounts stay intact', async ({
  page,
}) => {
  await seedGroups(page);
  await page.goto('/');
  for (const login of channels) {
    await expect(player(page, login)).toHaveAttribute('data-paused', 'false');
    await player(page, login).evaluate((el) => el.setAttribute('data-sweep2-mount', 'original'));
  }
  await expectMain(page, 'pixelpaladin');
  await page.getByRole('button', { name: 'Mix', exact: true }).click();
  await tile(page, 'cozycartographer').hover();
  await tile(page, 'cozycartographer')
    .getByRole('button', { name: 'Listen to this stream', exact: true })
    .click();
  await tile(page, 'cozycartographer').getByRole('slider').fill('35');
  // The first channel of another group must still offer the global main action.
  await promote(page, 'cozycartographer');
  await expectMain(page, 'cozycartographer');
  await expect(page.getByTestId('focused-section')).toHaveAttribute('data-group', 'mc');
  await expect(page.getByTestId('focused-section')).toContainText('Minecraft');
  await expect(page.locator('[data-testid=stream-section][data-group=gta]')).toContainText(
    'GTA RP',
  );
  await expect(page.locator('[data-testid=stream-section][data-group=mc]')).toContainText(
    'Minecraft',
  );
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-muted', 'false');
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-muted', 'false');
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-volume', '0.35');
  const autoWidth = (await tile(page, 'cozycartographer').boundingBox())!.width;
  await page.getByRole('slider', { name: 'Main stream size', exact: true }).fill('50');
  await expect
    .poll(async () => (await tile(page, 'cozycartographer').boundingBox())!.width)
    .toBeLessThan(autoWidth);
  await expectMain(page, 'cozycartographer');
  await page.getByRole('button', { name: 'Auto', exact: true }).click();
  await expectMain(page, 'cozycartographer');
  await page.getByTestId('add-channel').hover();
  for (const login of ['novastrike', 'lunarlatte', 'quickscopequeen'])
    await expect(tile(page, login)).toHaveCSS('outline-color', 'rgba(0, 0, 0, 0)');
  await page.screenshot({ path: 'test-results/sweep2-global-focus.png' });
  // An ungrouped stream can also become the one global main tile.
  await promote(page, 'quickscopequeen');
  await expectMain(page, 'quickscopequeen');
  await expect(page.getByTestId('focused-section')).toHaveAttribute('data-group', 'ungrouped');
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-volume', '0.35');
  for (const login of channels)
    await expect(player(page, login)).toHaveAttribute('data-sweep2-mount', 'original');
  await page.reload();
  await expectMain(page, 'quickscopequeen');
});

test('group tabs, keyboard slots and narrow layouts use the visible global focus', async ({
  page,
}) => {
  await seedGroups(page);
  await page.goto('/');
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-paused', 'false');
  await promote(page, 'cozycartographer');
  await page.getByTestId('add-channel').hover();
  await page.keyboard.press('m');
  await expect(page.locator('.mock-player[data-muted=false]')).toHaveCount(0);
  await page.keyboard.press('1');
  await expect(player(page, 'cozycartographer')).toHaveAttribute('data-muted', 'false');
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-muted', 'true');
  const groups = page.getByRole('navigation', { name: 'Stream groups' });
  await groups.getByRole('button', { name: /^GTA RP/ }).click();
  await expect(tile(page, 'cozycartographer')).toBeHidden();
  await expectMain(page, 'pixelpaladin', channels.slice(0, 2));
  await page.keyboard.press('1');
  await expect(player(page, 'pixelpaladin')).toHaveAttribute('data-muted', 'false');
  await groups.getByRole('button', { name: /^All groups/ }).click();
  await expectMain(page, 'cozycartographer');
  for (const size of [
    { width: 1800, height: 1000 },
    { width: 780, height: 1100 },
  ]) {
    await page.setViewportSize(size);
    await expectMain(page, 'cozycartographer');
    const viewport = (await page.getByTestId('viewer').boundingBox())!;
    const boxes = await Promise.all(
      channels.map(async (login) => {
        const box = (await tile(page, login).boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(viewport.x - 1);
        expect(box.y).toBeGreaterThanOrEqual(viewport.y - 1);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.x + viewport.width + 1);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.y + viewport.height + 1);
        expect(Math.abs(box.height - (box.width * 9) / 16)).toBeLessThanOrEqual(2);
        return box;
      }),
    );
    boxes.forEach((a, i) =>
      boxes.slice(i + 1).forEach((b) => {
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        expect(overlapX <= 1 || overlapY <= 1).toBe(true);
      }),
    );
  }
  await page.getByTestId('add-channel').hover();
  await page.screenshot({ path: 'test-results/sweep2-narrow-focus.png' });
});

test('number shortcuts skip a hidden offline main and honor Show offline', async ({ page }) => {
  await seedGroups(page);
  await page.goto('/');
  await expect(tile(page, 'pixelpaladin')).toHaveAttribute('data-status', 'playing');
  await expect(
    page.locator('[data-testid=channel-row][data-channel=pixelpaladin]'),
  ).toHaveAttribute('data-live', 'true');
  await page.evaluate(() =>
    (
      window as unknown as { mtvMock: { setLive(login: string, live: boolean): void } }
    ).mtvMock.setLive('pixelpaladin', false),
  );
  await page.getByRole('button', { name: 'Refresh now' }).click();
  await expect(tile(page, 'pixelpaladin')).toHaveCount(0);
  await expectMain(page, 'novastrike', channels.slice(1));
  await page.getByTestId('add-channel').hover();
  await page.keyboard.press('m');
  await page.keyboard.press('1');
  await expect(tile(page, 'novastrike')).toHaveAttribute('data-audible', 'true');
  await expect(tile(page, 'cozycartographer')).toHaveAttribute('data-audible', 'false');
  await page.keyboard.press('Shift+1');
  await expect(page.getByRole('button', { name: 'Mix', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(tile(page, 'novastrike')).toHaveAttribute('data-audible', 'false');
  // The offline channel remains in this pinned view and can be explicitly shown.
  await page.getByTestId('offline-bar').getByRole('button', { name: 'Show', exact: true }).click();
  await expect(tile(page, 'pixelpaladin')).toHaveAttribute('data-main', 'true');
  await page.keyboard.press('1');
  await expect(tile(page, 'pixelpaladin')).toHaveAttribute('data-audible', 'true');
  await expect(tile(page, 'novastrike')).toHaveAttribute('data-audible', 'false');
});
