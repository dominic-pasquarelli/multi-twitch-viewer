import { expect, test } from '@playwright/test';

test('in fullscreen the sidebar peeks from the left edge, and B keeps it open', async ({
  page,
}) => {
  await page.goto('/#/pixelpaladin/novastrike');
  const slot = page.getByTestId('sidebar-slot');
  const stream = page.locator('[data-testid=player-tile][data-channel=pixelpaladin]');
  await expect(stream).toBeVisible();
  await page.locator('body').press('f');
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);

  // Hidden by default, over the streams when it peeks.
  await expect(slot).toBeHidden();
  const wide = (await stream.boundingBox())!;
  await page.mouse.move(2, 400);
  await expect(slot).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Followed', exact: true })).toBeVisible();
  expect((await stream.boundingBox())!.x).toBeCloseTo(wide.x, 0); // streams don't move
  await page.mouse.move(1200, 400);
  await expect(slot).toBeHidden();

  // B: open beside the streams, which make room; B again tucks it away.
  await page.locator('body').press('b');
  await expect(slot).toBeVisible();
  await expect.poll(async () => (await stream.boundingBox())!.x).toBeGreaterThan(wide.x + 100);
  await page.mouse.move(1200, 400);
  await expect(slot).toBeVisible();
  await page.locator('body').press('b');
  await expect(slot).toBeHidden();

  // Leaving fullscreen shows it as usual; B there still collapses it to the rail.
  await page.locator('body').press('f');
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await expect(slot).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Followed', exact: true })).toBeVisible();
});
