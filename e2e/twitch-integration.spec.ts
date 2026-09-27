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

async function stubTwitch(page: Page, calls: string[]) {
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
    route.fulfill({ contentType: 'application/javascript', body: FAKE_PLAYER_SCRIPT }),
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

test('the Windows app offers a newer release', async ({ page }) => {
  await stubTwitch(page, []);
  await page.route('**/__mtv/version', (route) =>
    route.fulfill({ json: { version: '0.2.0', commit: 'a'.repeat(40) } }),
  );
  await page.route('https://api.github.com/**', (route) =>
    route.fulfill({ headers: cors, json: { object: { sha: 'b'.repeat(40) } } }),
  );
  await page.goto('/');
  const banner = page.getByTestId('update-banner');
  await expect(banner).toContainText('A new version');
  await banner.getByRole('button', { name: 'Not now' }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await page.waitForTimeout(500);
  await expect(banner).toHaveCount(0); // stays dismissed for that version
});
