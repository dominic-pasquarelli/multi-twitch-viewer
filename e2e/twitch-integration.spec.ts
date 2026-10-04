import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Runs the real (non-mock) build with Twitch's servers stubbed in the browser:
 * OAuth redirect, token validation, Helix API and the embed player script.
 */

const CLIENT_ID = 'e2etestclientid0000000000000';
const TOKEN = 'e2e-token';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

const users = {
  '1': { id: '1', login: 'viewer', display_name: 'Viewer', profile_image_url: '' },
  '10': { id: '10', login: 'alpha', display_name: 'Alpha', profile_image_url: '' },
  '11': { id: '11', login: 'bravo', display_name: 'Bravo', profile_image_url: '' },
  '12': { id: '12', login: 'charlie', display_name: 'Charlie', profile_image_url: '' },
};
const stream = (id: '10' | '11', viewers: number) => ({
  user_id: id,
  user_login: users[id].login,
  user_name: users[id].display_name,
  game_name: 'Chess',
  title: `${users[id].display_name} live`,
  viewer_count: viewers,
  started_at: new Date(Date.now() - 3_600_000).toISOString(),
  thumbnail_url: 'https://static-cdn.jtvnw.net/previews-ttv/live_user_x-{width}x{height}.jpg',
  type: 'live',
});

/** A stand-in for https://player.twitch.tv/js/embed/v1.js with the same API surface. */
const FAKE_PLAYER_SCRIPT = `
(function () {
  function Player(id, opts) {
    var self = this;
    this.opts = opts; this.muted = !!opts.muted; this.volume = 0.5; this.listeners = {};
    var frame = document.createElement('iframe');
    frame.src = 'about:blank';
    frame.setAttribute('data-fake-twitch', opts.channel);
    frame.setAttribute('data-parent', (opts.parent || []).join(','));
    frame.style.width = opts.width; frame.style.height = opts.height;
    document.getElementById(id).appendChild(frame);
    this.frame = frame; this.sync();
    (window.__fakePlayers = window.__fakePlayers || []).push(this);
    setTimeout(function () { self.emit('ready'); self.emit('playing'); }, 30);
  }
  Player.prototype.sync = function () {
    this.frame.setAttribute('data-muted', String(this.muted));
    this.frame.setAttribute('data-volume', String(this.volume));
  };
  Player.prototype.addEventListener = function (e, cb) { (this.listeners[e] = this.listeners[e] || []).push(cb); };
  Player.prototype.emit = function (e) { (this.listeners[e] || []).forEach(function (cb) { cb(); }); };
  Player.prototype.setMuted = function (m) { this.muted = m; this.sync(); };
  Player.prototype.getMuted = function () { return this.muted; };
  Player.prototype.setVolume = function (v) { this.volume = v; this.sync(); };
  Player.prototype.getVolume = function () { return this.volume; };
  Player.prototype.getQualities = function () { return []; };
  Player.prototype.getQuality = function () { return 'auto'; };
  Player.prototype.setQuality = function () {};
  Player.prototype.play = function () {}; Player.prototype.pause = function () {};
  Player.READY = 'ready'; Player.PLAYING = 'playing'; Player.PAUSE = 'pause'; Player.OFFLINE = 'offline';
  Player.ONLINE = 'online'; Player.ENDED = 'ended'; Player.PLAYBACK_BLOCKED = 'blocked';
  window.Twitch = { Player: Player };
})();`;

async function stubTwitch(page: Page, calls: string[], crossOriginPlayers = false) {
  await page.route('https://id.twitch.tv/oauth2/authorize?**', (route: Route) => {
    const url = new URL(route.request().url());
    calls.push(
      `authorize client_id=${url.searchParams.get('client_id')} scope=${url.searchParams.get('scope')}`,
    );
    const back = `${url.searchParams.get('redirect_uri')}/#access_token=${TOKEN}&scope=user%3Aread%3Afollows&state=${url.searchParams.get('state')}&token_type=bearer`;
    return route.fulfill({ status: 302, headers: { Location: back } });
  });
  await page.route('https://id.twitch.tv/oauth2/validate', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: cors })
      : route.fulfill({
          headers: cors,
          json: {
            client_id: CLIENT_ID,
            login: 'viewer',
            user_id: '1',
            scopes: ['user:read:follows'],
            expires_in: 5_000_000,
          },
        }),
  );
  await page.route('https://api.twitch.tv/helix/**', (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const url = new URL(req.url());
    calls.push(
      `${url.pathname} auth=${req.headers()['authorization']} client=${req.headers()['client-id']}`,
    );
    const json = (body: unknown) => route.fulfill({ headers: cors, json: body });
    switch (url.pathname) {
      case '/helix/users': {
        const ids = url.searchParams.getAll('id');
        return json({
          data: ids.length
            ? ids.map((id) => users[id as keyof typeof users]).filter(Boolean)
            : [users['1']],
        });
      }
      case '/helix/streams/followed':
        return json({ data: [stream('10', 5000), stream('11', 1200)], pagination: {} });
      case '/helix/channels/followed':
        return json({
          total: 3,
          data: ['10', '11', '12'].map((id) => ({
            broadcaster_id: id,
            broadcaster_login: users[id as keyof typeof users].login,
            broadcaster_name: users[id as keyof typeof users].display_name,
            followed_at: '2024-01-01T00:00:00Z',
          })),
          pagination: {},
        });
      case '/helix/streams':
        return json({ data: [] });
      default:
        return json({ data: [] });
    }
  });
  await page.route('https://player.twitch.tv/js/embed/v1.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: crossOriginPlayers
        ? FAKE_PLAYER_SCRIPT.replace(
            "frame.src = 'about:blank';",
            "frame.src = 'https://player.twitch.tv/?channel=' + encodeURIComponent(opts.channel);",
          )
        : FAKE_PLAYER_SCRIPT,
    }),
  );
  if (crossOriginPlayers)
    await page.route('https://player.twitch.tv/?**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><body style="margin:0;height:100vh;background:#203040;color:white">Cross-origin player<button style="position:absolute;left:50%;top:70%" onclick="document.body.dataset.clicks=String(Number(document.body.dataset.clicks||0)+1)">Native player control</button></body></html>',
      }),
    );
  await page.route('https://static-cdn.jtvnw.net/**', (route) => route.fulfill({ status: 404 }));
}

test('logs in with Twitch, lists live follows and plays them through the embed API', async ({
  page,
}) => {
  const calls: string[] = [];
  await stubTwitch(page, calls);
  await page.goto('/');

  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByText('Logged in as Viewer')).toBeVisible();
  // The token never stays in the address bar.
  await expect(page).not.toHaveURL(/access_token/);
  expect(calls[0]).toBe(`authorize client_id=${CLIENT_ID} scope=user:read:follows`);

  // Live follows, sorted by viewers; the offline follow is listed separately.
  const rows = page.getByTestId('channel-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Alpha');
  await expect(rows.nth(1)).toContainText('Bravo');
  await expect(rows.nth(2)).toContainText('Charlie');
  expect(calls).toContain(`/helix/streams/followed auth=Bearer ${TOKEN} client=${CLIENT_ID}`);

  await rows.nth(0).click();
  await rows.nth(1).click();
  const alpha = page.locator('iframe[data-fake-twitch=alpha]');
  const bravo = page.locator('iframe[data-fake-twitch=bravo]');
  await expect(alpha).toHaveAttribute('data-parent', 'localhost');
  // First stream added is the one you hear; the other stays muted.
  await expect(alpha).toHaveAttribute('data-muted', 'false');
  await expect(bravo).toHaveAttribute('data-muted', 'true');

  await page.keyboard.press('2');
  await expect(bravo).toHaveAttribute('data-muted', 'false');
  await expect(alpha).toHaveAttribute('data-muted', 'true');

  // Unmuting inside a player (with its own button) mutes the other one.
  await page.evaluate(() => {
    type Fake = { opts: { channel: string }; setMuted(m: boolean): void };
    const players = (window as unknown as { __fakePlayers: Fake[] }).__fakePlayers;
    players.find((p) => p.opts.channel === 'alpha')!.setMuted(false);
  });
  await expect(bravo).toHaveAttribute('data-muted', 'true', { timeout: 5000 });
  await expect(page.locator('[data-testid=player-tile][data-channel=alpha]')).toHaveAttribute(
    'data-audible',
    'true',
  );
  // Focus layout: clicking into a (real iframe) player makes it the main stream.
  await page.keyboard.press('l');
  const width = async (c: string) =>
    (await page.locator(`[data-testid=player-tile][data-channel=${c}]`).boundingBox())!.width;
  await expect.poll(() => width('alpha')).toBeGreaterThan(await width('bravo'));
  // Reveal controls before the native iframe click that promotes the stream.
  await page.locator('[data-testid=player-tile][data-channel=bravo]').hover();
  await page.locator('iframe[data-fake-twitch=bravo]').click();
  await expect.poll(async () => (await width('bravo')) > (await width('alpha'))).toBe(true);
});

test('ignores a login redirect whose state does not match', async ({ page }) => {
  const calls: string[] = [];
  await stubTwitch(page, calls);
  await page.goto(
    `/#access_token=${TOKEN}&scope=user%3Aread%3Afollows&state=forged&token_type=bearer`,
  );
  await expect(page.getByText(/did not come from this app/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
  expect(calls.filter((c) => c.startsWith('/helix'))).toHaveLength(0);
});

test('controls follow the pointer into and out of cross-origin videos without intercepting native controls', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'mtv:settings',
      JSON.stringify({ version: 1, state: { clickToFocus: false } }),
    ),
  );
  await stubTwitch(page, [], true);
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  const rows = page.getByTestId('channel-row');
  await rows.nth(0).click();
  await rows.nth(1).click();
  const stream = page.locator('[data-testid=player-tile][data-channel=bravo]');
  const controls = stream.getByTestId('stream-controls');
  const frame = stream.locator('iframe');
  const video = page.frameLocator('iframe[data-fake-twitch=bravo]').locator('body');
  await expect(video).toContainText('Cross-origin player');
  const enterVideo = async () => {
    const rect = (await frame.boundingBox())!;
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  };

  await page.getByTestId('add-channel').hover();
  await expect(controls).toBeHidden();
  await enterVideo();
  await expect(controls).toBeVisible();
  await expect(stream).toHaveAttribute('data-hovered', 'true');
  await expect(stream).not.toHaveCSS('outline-color', 'rgba(0, 0, 0, 0)');
  await expect(frame).toHaveCSS('pointer-events', 'auto');
  // Arrange mode's global rule still disables iframe interception during a drag.
  await page.locator('body').evaluate((body) => body.classList.add('mtv-dragging'));
  await expect(frame).toHaveCSS('pointer-events', 'none');
  await page.locator('body').evaluate((body) => body.classList.remove('mtv-dragging'));
  await expect(frame).toHaveCSS('pointer-events', 'auto');
  // A first click arriving from outside must reach the native player immediately.
  await page.getByTestId('add-channel').hover();
  await expect(controls).toBeHidden();
  const nativeControl = (await video
    .getByRole('button', { name: 'Native player control' })
    .boundingBox())!;
  // mouse.click() batches move/down/up concurrently; deliver actual input in order.
  await page.mouse.move(
    nativeControl.x + nativeControl.width / 2,
    nativeControl.y + nativeControl.height / 2,
  );
  await page.mouse.down();
  await page.mouse.up();
  await expect(video).toHaveAttribute('data-clicks', '1');
  await expect(controls).toBeVisible();
  await controls.getByRole('button', { name: 'Reload player' }).click();
  await expect(video).toContainText('Cross-origin player');
  await page.getByTestId('add-channel').hover();
  await page.getByTestId('add-channel').focus();
  await expect(controls).toBeHidden();
  await expect(stream).toHaveCSS('outline-color', 'rgba(0, 0, 0, 0)');

  // Jump directly from one video to the other, without entering parent UI.
  const alphaRect = (await page.locator('iframe[data-fake-twitch=alpha]').boundingBox())!;
  await page.mouse.move(alphaRect.x + alphaRect.width / 2, alphaRect.y + alphaRect.height / 2);
  await expect(page.locator('[data-channel=alpha][data-testid=player-tile]')).toHaveAttribute(
    'data-hovered',
    'true',
  );
  await enterVideo();
  await expect(stream).toHaveAttribute('data-hovered', 'true');
  await expect(controls).toBeVisible();
  await page.getByRole('heading', { name: 'Followed', exact: true }).hover();
  await expect(controls).toBeHidden();
  await expect(stream).toHaveCSS('outline-color', 'rgba(0, 0, 0, 0)');
  await enterVideo();
  await expect(controls).toBeVisible();
  await page.mouse.move(-10, -10);
  await expect(stream).toHaveAttribute('data-hovered', 'false');
  await expect(controls).toBeHidden();
  await expect(stream).toHaveCSS('outline-color', 'rgba(0, 0, 0, 0)');
});
