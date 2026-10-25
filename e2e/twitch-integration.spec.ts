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
    this.frame = frame; this.paused = false; this.pauses = 0; this.sync();
    (window.__fakePlayers = window.__fakePlayers || []).push(this);
    // Like Twitch, a click on the video toggles pause (after a delay, if set).
    var clickPauseMs = window.__fakeClickPauseMs;
    var listen = function () {
      var doc = frame.contentDocument;
      if (!clickPauseMs || !doc || doc.__fakeListening) return;
      doc.__fakeListening = true;
      doc.addEventListener('click', function () {
        setTimeout(function () { if (self.paused) self.play(); else self.pause(); }, clickPauseMs);
      });
    };
    listen(); frame.addEventListener('load', listen);
    setTimeout(function () { self.emit('ready'); self.emit('playing'); }, 30);
  }
  Player.prototype.sync = function () {
    this.frame.setAttribute('data-muted', String(this.muted));
    this.frame.setAttribute('data-volume', String(this.volume));
    this.frame.setAttribute('data-paused', String(this.paused));
    this.frame.setAttribute('data-pauses', String(this.pauses));
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
  Player.prototype.play = function () {
    if (!this.paused) return;
    this.paused = false; this.sync(); this.emit('playing');
  };
  Player.prototype.pause = function () {
    this.paused = true; this.pauses++; this.sync(); this.emit('pause');
  };
  Player.prototype.isPaused = function () { return this.paused; };
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

test('music uses live Helix priority, survives failed checks and syncs native player volume', async ({
  page,
}) => {
  await stubTwitch(page, []);
  let failed = false;
  let alphaLive = false;
  await page.route('https://api.twitch.tv/helix/streams?**', (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: cors });
    if (failed)
      return route.fulfill({
        status: 503,
        headers: cors,
        json: { message: 'Temporarily unavailable' },
      });
    const logins = new URL(route.request().url()).searchParams.getAll('user_login');
    return route.fulfill({
      headers: cors,
      json: {
        data: [stream('11', 1200), ...(alphaLive ? [stream('10', 5000)] : [])].filter((s) =>
          logins.includes(s.user_login),
        ),
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByTestId('music-button').click();
  const music = page.getByRole('dialog', { name: 'DJ & music', exact: true });
  await music.getByRole('textbox', { name: 'Add music channels' }).fill('alpha bravo');
  await music.getByRole('button', { name: 'Add', exact: true }).click();
  await music.getByRole('button', { name: 'Automatic', exact: true }).click();
  await music.getByRole('button', { name: 'Done', exact: true }).click();
  const bravo = page.locator('iframe[data-fake-twitch=bravo]');
  await expect(bravo).toHaveAttribute('data-muted', 'false');
  await page.evaluate(() => {
    type Fake = { opts: { channel: string }; setVolume(v: number): void };
    (window as unknown as { __fakePlayers: Fake[] }).__fakePlayers
      .find((p) => p.opts.channel === 'bravo')!
      .setVolume(0.22);
  });
  await page.getByTestId('music-button').click();
  await expect(music.getByRole('slider', { name: 'DJ volume' })).toHaveValue('22');
  await music.getByRole('button', { name: 'Done', exact: true }).click();
  failed = true;
  await page.getByRole('button', { name: 'Refresh now' }).click();
  await page.getByTestId('music-button').click();
  await expect(music).toContainText('Live status unavailable', {
    timeout: 15000,
  });
  await expect(bravo).toHaveAttribute('data-muted', 'false');
  await music.getByRole('button', { name: 'Done', exact: true }).click();
  failed = false;
  alphaLive = true;
  await page.getByRole('button', { name: 'Refresh now' }).click();
  await expect(page.locator('iframe[data-fake-twitch=alpha]')).toHaveAttribute(
    'data-volume',
    '0.22',
  );
  await expect(bravo).toHaveCount(0);
});

test('immersive mix links native volume changes while keeping cross-origin player controls usable', async ({
  page,
}) => {
  await stubTwitch(page, [], true);
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByTestId('channel-row').nth(0).click();
  await page.getByTestId('channel-row').nth(1).click();
  await page.getByRole('button', { name: 'Multi focus', exact: true }).click();
  await page.getByTestId('immersive-mix-toggle').click();
  await page.getByTestId('mixer-button').click();
  await page
    .getByTestId('mixer')
    .getByRole('checkbox', { name: /Set levels by role/ })
    .check();
  await page.keyboard.press('Escape');
  await page.getByTestId('output-volume').fill('50');
  const alpha = page.locator('iframe[data-fake-twitch=alpha]');
  const bravo = page.locator('iframe[data-fake-twitch=bravo]');
  await expect(alpha).toHaveAttribute('data-volume', '0.35');
  await expect(bravo).toHaveAttribute('data-volume', '0.35');
  await page.evaluate(() => {
    type Fake = { opts: { channel: string }; setVolume(v: number): void };
    (window as unknown as { __fakePlayers: Fake[] }).__fakePlayers
      .find((p) => p.opts.channel === 'alpha')!
      .setVolume(0.3);
  });
  const bar = page.locator('[data-testid=stream-mix-overlay][data-channel=alpha]');
  await expect(bar.getByRole('slider')).toHaveValue('60');
  await expect(bravo).toHaveAttribute('data-volume', '0.3');
  // Native iframe controls remain clickable outside the compact volume overlay.
  const video = page.frameLocator('iframe[data-fake-twitch=alpha]');
  await page.locator('[data-testid=player-tile][data-channel=alpha]').hover();
  await video.getByRole('button', { name: 'Native player control' }).click();
  await expect(video.locator('body')).toHaveAttribute('data-clicks', '1');
  await expect(bar).toBeVisible();
  await bar.getByRole('slider').focus();
  await page.keyboard.press('m');
  await expect(alpha).toHaveAttribute('data-muted', 'true');
  await expect(bravo).toHaveAttribute('data-muted', 'true');
});

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
  await expect(stream).toHaveAttribute('data-hovered', 'false');
  await expect(stream).toHaveAttribute('data-silent', 'true');
  await expect(stream).not.toHaveCSS('outline-style', 'dashed');

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
  await expect(stream).toHaveAttribute('data-hovered', 'false');
  await expect(stream).toHaveAttribute('data-silent', 'true');
  await expect(stream).not.toHaveCSS('outline-style', 'dashed');
  await enterVideo();
  await expect(controls).toBeVisible();
  await page.mouse.move(-10, -10);
  await expect(stream).toHaveAttribute('data-hovered', 'false');
  await expect(controls).toBeHidden();
  await expect(stream).toHaveAttribute('data-hovered', 'false');
  await expect(stream).toHaveAttribute('data-silent', 'true');
  await expect(stream).not.toHaveCSS('outline-style', 'dashed');
});

test('a stream selected with a click keeps playing when Twitch pauses it on that click', async ({
  page,
}) => {
  // Twitch can apply its click-to-pause later than the app's first check.
  await page.addInitScript(() => Object.assign(window, { __fakeClickPauseMs: 700 }));
  await stubTwitch(page, []);
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  const rows = page.getByTestId('channel-row');
  await rows.nth(0).click();
  await rows.nth(1).click();
  await page.keyboard.press('l');
  const tile = page.locator('[data-testid=player-tile][data-channel=bravo]');
  const bravo = page.locator('iframe[data-fake-twitch=bravo]');
  await expect(tile).toHaveAttribute('data-main', 'false');
  await expect(tile).toHaveAttribute('data-status', 'playing');

  await tile.hover();
  await bravo.click();
  await expect(tile).toHaveAttribute('data-main', 'true');
  await expect(bravo).toHaveAttribute('data-pauses', '1'); // the click's pause arrived…
  await expect(bravo).toHaveAttribute('data-paused', 'false'); // …and was undone
  await page.waitForTimeout(800);
  await expect(bravo).toHaveAttribute('data-paused', 'false');
  await expect(tile).toHaveAttribute('data-status', 'playing');
  await expect(page.getByText(/Connection recovery/)).toHaveCount(0);

  // Clicking the main stream again is a pause you asked for, even right away.
  await tile.hover();
  await bravo.click();
  await expect(bravo).toHaveAttribute('data-pauses', '2');
  await page.waitForTimeout(1500);
  await expect(bravo).toHaveAttribute('data-paused', 'true');
  await expect(tile).toHaveAttribute('data-status', 'paused');
});

test('a linked channel offline on Twitch plays through Kick: official API, browser player', async ({
  page,
}) => {
  await stubTwitch(page, []);
  const kickCalls: string[] = [];
  const kickCors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  await page.route('https://id.kick.com/oauth/token', (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: kickCors });
    kickCalls.push(`token ${route.request().postData()}`);
    return route.fulfill({
      headers: kickCors,
      json: { access_token: 'kick-token', token_type: 'Bearer', expires_in: 3600 },
    });
  });
  await page.route('https://api.kick.com/public/v1/channels?**', (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: kickCors });
    const url = new URL(route.request().url());
    kickCalls.push(
      `channels ${url.searchParams.getAll('slug').join(',')} ${route.request().headers()['authorization']}`,
    );
    return route.fulfill({
      headers: kickCors,
      json: {
        data: url.searchParams.getAll('slug').map((slug) => ({
          slug,
          stream_title: `${slug} on Kick`,
          category: { name: 'IRL' },
          stream: { is_live: true, viewer_count: 77, start_time: new Date().toISOString() },
        })),
      },
    });
  });
  await page.route('https://player.kick.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<p>Kick player</p>' }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  const rows = page.getByTestId('channel-row');
  await expect(rows).toHaveCount(3);

  await page.getByTestId('settings-button').click();
  await page.getByRole('tab', { name: 'Account' }).click();
  await page.getByTestId('kick-client-id').fill('kick-id');
  await page.getByTestId('kick-client-secret').fill('kick-secret');
  await page.getByRole('button', { name: 'Linked Kick channels…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Linked Kick channels' });
  await dialog.getByTestId('kick-link-twitch').fill('charlie');
  await dialog.getByRole('button', { name: 'Link', exact: true }).click();
  await expect(dialog.getByTestId('kick-link')).toContainText('Live on Kick · IRL');
  await page.keyboard.press('Escape');

  // Charlie is offline on Twitch, live on Kick: listed live, and it plays from Kick.
  const charlie = page.locator('[data-testid=channel-row][data-channel=charlie]');
  await expect(charlie).toHaveAttribute('data-live', 'true');
  await page.locator('[data-testid=channel-row][data-channel=alpha]').click();
  await charlie.click();
  const kick = page.locator('iframe[data-kick-player=charlie]');
  await expect(kick).toHaveAttribute(
    'src',
    /^https:\/\/player\.kick\.com\/charlie\?autoplay=true&muted=true&mtv=/,
  );
  await expect(page.locator('[data-testid=player-tile][data-channel=charlie]')).toHaveAttribute(
    'data-status',
    'playing',
  );
  // A browser can't set Kick's volume: it's unmuted only as the stream you hear.
  await page.keyboard.press('2');
  await expect(kick).toHaveAttribute('src', /muted=false/);
  await page.keyboard.press('1');
  await expect(kick).toHaveAttribute('src', /muted=true/);

  expect(kickCalls[0]).toBe(
    'token grant_type=client_credentials&client_id=kick-id&client_secret=kick-secret',
  );
  expect(kickCalls).toContain('channels charlie Bearer kick-token');
  expect(kickCalls.filter((c) => c.startsWith('token'))).toHaveLength(1);
});

test("the Mixer stays open while you use Twitch's own volume slider, and follows it", async ({
  page,
}) => {
  await stubTwitch(page, []);
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  const rows = page.getByTestId('channel-row');
  await rows.nth(0).click();
  await rows.nth(1).click();
  await page.getByRole('button', { name: 'Mix', exact: true }).click();
  const alpha = page.locator('iframe[data-fake-twitch=alpha]');
  await expect(alpha).toHaveAttribute('data-muted', 'false');

  await page.getByTestId('mixer-button').click();
  const mixer = page.getByTestId('mixer');
  const row = page.locator('[data-testid=mixer-row][data-channel=alpha]');
  await expect(row.getByTestId('mixer-volume')).toHaveText('50%');
  // Clicking into the player (to reach Twitch's controls) keeps the Mixer open.
  // Low on the video, where Twitch's controls are, clear of the open Mixer.
  const tile = page.locator('[data-testid=player-tile][data-channel=alpha]');
  const low = { x: 40, y: (await tile.boundingBox())!.height - 30 };
  await tile.hover({ position: low });
  await alpha.click({ position: low });
  await expect(mixer).toBeVisible();
  // Like dragging the volume slider in Twitch's controls.
  await page.evaluate(() => {
    type Fake = { opts: { channel: string }; setVolume(v: number): void };
    const players = (window as unknown as { __fakePlayers: Fake[] }).__fakePlayers;
    players.find((p) => p.opts.channel === 'alpha')!.setVolume(0.2);
  });
  await expect(row.getByTestId('mixer-volume')).toHaveText('20%', { timeout: 5000 });
  await expect(row.getByRole('slider')).toHaveValue('20');
  await expect(mixer).toBeVisible();
  // A click elsewhere in the app still closes it.
  await page.getByRole('heading', { name: 'Followed', exact: true }).click();
  await expect(mixer).toBeHidden();
  await tile.hover({ position: low });
  await expect(tile.getByTestId('stream-volume')).toHaveText('20%');
});

test('music picker uses offline Helix categories and remains usable when category lookup fails', async ({
  page,
}) => {
  const calls: string[] = [];
  await stubTwitch(page, calls);
  let failed = true;
  const requested: string[][] = [];
  await page.route('https://api.twitch.tv/helix/channels?**', (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: cors });
    requested.push(new URL(route.request().url()).searchParams.getAll('broadcaster_id'));
    return failed
      ? route.fulfill({ status: 503, headers: cors, json: { message: 'Unavailable' } })
      : route.fulfill({
          headers: cors,
          json: { data: [{ broadcaster_id: '12', game_name: 'DJs' }] },
        });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByTestId('music-button').click();
  const music = page.getByRole('dialog', { name: 'DJ & music', exact: true });
  await music.getByRole('button', { name: 'All followed', exact: true }).click();
  await expect(page.getByTestId('music-choice')).toHaveCount(3);
  await music.getByRole('button', { name: 'Add Alpha to music', exact: true }).click();
  await expect(page.getByTestId('music-row')).toHaveCount(1);
  await expect(
    music.getByRole('button', { name: 'Retry channel lookup', exact: true }),
  ).toBeVisible({ timeout: 15000 });
  failed = false;
  await music.getByRole('button', { name: 'Retry channel lookup', exact: true }).click();
  await music.getByRole('button', { name: 'Music & DJs', exact: true }).click();
  const charlie = page.locator('[data-testid=music-choice][data-channel=charlie]');
  await expect(charlie).toContainText('Last category: DJs');
  await expect(charlie).toContainText('Offline');
  await charlie.getByRole('button').click();
  await expect(page.getByTestId('music-row')).toHaveCount(2);
  expect(requested[0]).toEqual(['10', '11', '12']);
  expect(calls.some((c) => c.includes('scope=user:read:follows'))).toBe(true);
});

test('startup and silent pauses recover while an explicit pause survives retries and reloads', async ({
  page,
}) => {
  await stubTwitch(page, []);
  await page.route('https://player.twitch.tv/js/embed/v1.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: FAKE_PLAYER_SCRIPT.replace(
        "self.emit('ready'); self.emit('playing');",
        "self.paused = true; self.sync(); self.emit('ready'); self.emit('pause');",
      ),
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByTestId('channel-row').nth(0).click();
  const tile = page.locator('[data-testid=player-tile][data-channel=alpha]');
  const player = tile.locator('iframe');
  await expect(player).toHaveAttribute('data-paused', 'false', { timeout: 10000 });
  await page.evaluate(() => {
    const p = (
      window as unknown as {
        __fakePlayers: { opts: { channel: string }; paused: boolean; sync(): void }[];
      }
    ).__fakePlayers.find((p) => p.opts.channel === 'alpha')!;
    p.paused = true;
    p.sync(); // No PAUSE event: the periodic watchdog must notice.
  });
  await expect(player).toHaveAttribute('data-paused', 'false', { timeout: 10000 });
  await tile.hover();
  await tile.getByRole('button', { name: 'Pause alpha', exact: true }).click();
  await expect(player).toHaveAttribute('data-paused', 'true');
  await tile.getByRole('button', { name: 'Reload player', exact: true }).click();
  await expect(player).toHaveAttribute('data-paused', 'true');
  await page.getByTestId('playback-tools-button').click();
  await expect(page.locator('[data-testid=health-row][data-channel=alpha]')).toContainText(
    'Paused by you',
  );
  await page.getByRole('button', { name: 'Resume alpha', exact: true }).click();
  await expect(player).toHaveAttribute('data-paused', 'false');
});

test('desktop recovery distinguishes stale iframe focus from native pause intent and rejects unrelated messages', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as unknown as { mtvDesktop: unknown }).mtvDesktop = {
      isDesktop: true,
      version: 'test',
      playAll: () => {},
      onBackgroundChange: () => () => {},
      getUpdateStatus: async () => ({ state: 'dev', current: null }),
      onUpdateStatus: () => () => {},
    };
  });
  await stubTwitch(page, [], true);
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByTestId('channel-row').nth(0).click();
  const tile = page.locator('[data-testid=player-tile][data-channel=alpha]');
  const frame = page.frameLocator('iframe[data-fake-twitch=alpha]');
  await frame.getByRole('button', { name: 'Native player control' }).focus();
  await page.evaluate(() => {
    const player = (window as unknown as { __fakePlayers: { pause(): void }[] }).__fakePlayers[0]!;
    player.pause();
  });
  await expect(tile.locator('iframe')).toHaveAttribute('data-paused', 'false', { timeout: 10000 });
  await frame
    .locator('body')
    .evaluate(() => parent.postMessage({ type: 'mtv:playback-intent', paused: true }, '*'));
  await expect(tile.locator('iframe')).toHaveAttribute('data-paused', 'true');
  // A parent-window message has the wrong source/origin and must not release the hold.
  await page.evaluate(() =>
    window.postMessage({ type: 'mtv:playback-intent', paused: false }, '*'),
  );
  await page.getByTestId('playback-tools-button').click();
  await expect(page.locator('[data-testid=health-row][data-channel=alpha]')).toContainText(
    'Paused by you',
  );
  await page.keyboard.press('Escape');
  await frame
    .locator('body')
    .evaluate(() => parent.postMessage({ type: 'mtv:playback-intent', paused: false }, '*'));
  await expect(tile.locator('iframe')).toHaveAttribute('data-paused', 'false');
});

test('fullscreen layout/audio transitions recover buffering pauses and stale audio without losing manual pauses', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as unknown as { mtvDesktop: unknown }).mtvDesktop = {
      isDesktop: true,
      version: 'test',
      playAll: () => {},
      onBackgroundChange: () => () => {},
      getUpdateStatus: async () => ({ state: 'dev', current: null }),
      onUpdateStatus: () => () => {},
    };
    localStorage.setItem(
      'mtv:settings',
      JSON.stringify({ version: 1, state: { clickToFocus: false } }),
    );
  });
  await stubTwitch(page, [], true);
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByTestId('channel-row').nth(0).click();
  await page.getByTestId('channel-row').nth(1).click();
  const alpha = page.locator('[data-testid=player-tile][data-channel=alpha]');
  const bravo = page.locator('[data-testid=player-tile][data-channel=bravo]');
  await page.getByRole('button', { name: 'Multi focus', exact: true }).click();
  await page.locator('body').press('f');
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  const top = async () => {
    await page.mouse.move(600, 2);
  };
  for (let iteration = 0; iteration < 3; iteration++) {
    await top();
    await page.getByTitle(/^Focus:/).click();
    await top();
    await page.getByRole('button', { name: 'Solo', exact: true }).click();
    await top();
    await page.getByTitle(/^Grid:/).click();
    await top();
    await page.getByRole('button', { name: 'Duck', exact: true }).click();
    await top();
    await page.getByRole('button', { name: 'Multi focus', exact: true }).click();
    await top();
    await page.getByRole('button', { name: 'Mix', exact: true }).click();
    await page.evaluate(() => {
      type P = {
        opts: { channel: string };
        pause(): void;
        setMuted(m: boolean): void;
        setVolume(v: number): void;
      };
      const players = (window as unknown as { __fakePlayers: P[] }).__fakePlayers;
      players.find((p) => p.opts.channel === 'alpha')!.pause();
      const other = players.find((p) => p.opts.channel === 'bravo')!;
      other.setMuted(true);
      other.setVolume(0.1); // delayed Duck-mode command echo
    });
    await expect(alpha.locator('iframe')).toHaveAttribute('data-paused', 'false', {
      timeout: 10000,
    });
    await expect(bravo.locator('iframe')).toHaveAttribute('data-muted', 'false', {
      timeout: 10000,
    });
    await expect(bravo.locator('iframe')).toHaveAttribute('data-volume', '0.5', { timeout: 10000 });
  }
  await bravo.hover();
  await bravo.getByRole('button', { name: 'Pause bravo', exact: true }).click();
  await page.locator('body').press('f');
  await page.locator('body').press('f');
  await top();
  await page.getByTestId('playback-tools-button').click();
  await page.getByRole('button', { name: 'Rebuild visible players', exact: true }).click();
  await expect(alpha.locator('iframe')).toHaveAttribute('data-paused', 'false', { timeout: 10000 });
  await expect(bravo.locator('iframe')).toHaveAttribute('data-paused', 'true');
  await expect(page.locator('[data-testid=health-row][data-channel=bravo]')).toContainText(
    'Paused by you',
  );
  await expect(page.locator('[data-testid=health-row][data-channel=alpha]')).toContainText(
    'playing',
  );
});

test('DJ level stays independent of Multi focus priorities and rejects stale 100 percent player feedback', async ({
  page,
}) => {
  await stubTwitch(page, []);
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByTestId('channel-row').nth(0).click();
  await page.getByTestId('channel-row').nth(1).click();
  await page.getByRole('button', { name: 'Multi focus', exact: true }).click();
  await page.getByTestId('music-button').click();
  const music = page.getByRole('dialog', { name: 'DJ & music', exact: true });
  await music.getByRole('textbox', { name: 'Add music channels' }).fill('alpha bravo');
  await music.getByRole('button', { name: 'Add', exact: true }).click();
  await music.getByRole('slider', { name: 'DJ volume', exact: true }).fill('25');
  await music.getByRole('button', { name: 'DJ + stream audio', exact: true }).click();
  await music.getByRole('button', { name: 'Done', exact: true }).click();
  for (const login of ['alpha', 'bravo', 'alpha']) {
    await page.getByTestId('music-button').click();
    await page
      .locator(`[data-testid=music-row][data-channel=${login}]`)
      .getByRole('button', { name: /^Pin .* as music$/ })
      .click();
    await music.getByRole('button', { name: 'Done', exact: true }).click();
    const frame = page.locator(`iframe[data-fake-twitch=${login}]`);
    await expect(frame).toHaveAttribute('data-volume', '0.25');
    await page.getByTitle(/^Focus:/).click();
    await page.getByRole('button', { name: 'Multi focus', exact: true }).click();
    await expect(frame).toHaveAttribute('data-volume', '0.25');
    await page.evaluate((login) => {
      const players = (
        window as unknown as {
          __fakePlayers: { opts: { channel: string }; setVolume(v: number): void }[];
        }
      ).__fakePlayers;
      players.find((p) => p.opts.channel === login)!.setVolume(1);
    }, login);
    await expect(frame).toHaveAttribute('data-volume', '0.25', { timeout: 10000 });
    await page.getByTestId('music-button').click();
    await expect(music.getByRole('slider', { name: 'DJ volume', exact: true })).toHaveValue('25');
    await music.getByRole('button', { name: 'Done', exact: true }).click();
  }
});

test('system wake and reconnect rebuild active players, refresh live status and retain explicit pauses and DJ levels', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as unknown as { mtvDesktop: unknown }).mtvDesktop = {
      isDesktop: true,
      version: 'test',
      playAll: () => {},
      onBackgroundChange: () => () => {},
      getUpdateStatus: async () => ({ state: 'dev', current: null }),
      onUpdateStatus: () => () => {},
      onSystemResume: (callback: () => void) => {
        (window as unknown as { wake: () => void }).wake = callback;
        return () => {};
      },
    };
  });
  const calls: string[] = [];
  await stubTwitch(page, calls);
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByTestId('channel-row').nth(0).click();
  await page.getByTestId('channel-row').nth(1).click();
  await page.getByRole('button', { name: 'Multi focus', exact: true }).click();
  await page.getByTestId('music-button').click();
  const music = page.getByRole('dialog', { name: 'DJ & music', exact: true });
  await music.getByRole('textbox', { name: 'Add music channels' }).fill('alpha');
  await music.getByRole('button', { name: 'Add', exact: true }).click();
  await music
    .locator('[data-testid=music-row][data-channel=alpha]')
    .getByRole('button', { name: /^Pin .* as music$/ })
    .click();
  await music.getByRole('slider', { name: 'DJ volume', exact: true }).fill('25');
  await music.getByRole('button', { name: 'DJ + stream audio', exact: true }).click();
  await music.getByRole('button', { name: 'Done', exact: true }).click();
  const alpha = page.locator('iframe[data-fake-twitch=alpha]');
  const bravo = page.locator('iframe[data-fake-twitch=bravo]');
  await bravo.evaluate((el) => el.setAttribute('data-pause-mount', 'original'));
  await page.locator('[data-testid=player-tile][data-channel=bravo]').hover();
  await page.getByRole('button', { name: 'Pause bravo', exact: true }).click();
  await alpha.evaluate((el) => el.setAttribute('data-wake-mount', 'old'));
  const followedCalls = calls.filter((c) => c.startsWith('/helix/streams/followed')).length;
  await page.evaluate(() => {
    (window as unknown as { wake(): void }).wake();
    (window as unknown as { wake(): void }).wake();
  });
  await expect(alpha).not.toHaveAttribute('data-wake-mount', 'old');
  await expect(alpha).toHaveAttribute('data-volume', '0.25');
  await expect(alpha).toHaveAttribute('data-paused', 'false');
  await expect(bravo).toHaveAttribute('data-paused', 'true');
  await expect(bravo).toHaveAttribute('data-pause-mount', 'original');
  await expect
    .poll(() => calls.filter((c) => c.startsWith('/helix/streams/followed')).length)
    .toBeGreaterThan(followedCalls);
  await alpha.evaluate((el) => el.setAttribute('data-reconnect-mount', 'old'));
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    (window as unknown as { wake(): void }).wake();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    window.dispatchEvent(new Event('online'));
  });
  await expect(alpha).not.toHaveAttribute('data-reconnect-mount', 'old', { timeout: 15000 });
  await expect(alpha).toHaveAttribute('data-volume', '0.25');
  await expect(bravo).toHaveAttribute('data-paused', 'true');
  await page.getByTestId('playback-tools-button').click();
  await expect(
    page.getByRole('dialog', { name: 'Playback tools', exact: true }).getByRole('status'),
  ).toContainText('Manual pauses were preserved');
});
