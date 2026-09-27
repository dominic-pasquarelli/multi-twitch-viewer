// @vitest-environment node
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chromeUserAgent, isAllowedInApp, isExternalWebLink } from './navigation.mjs';
import { resolveFile, startServer } from './server.mjs';
import { parseState, restoreBounds } from './windowState.mjs';

describe('navigation rules', () => {
  it('keeps the app and Twitch login pages in the window', () => {
    expect(isAllowedInApp('http://localhost:5757/#/xqc')).toBe(true);
    expect(isAllowedInApp('https://id.twitch.tv/oauth2/authorize?x=1')).toBe(true);
    expect(isAllowedInApp('https://www.twitch.tv/login')).toBe(true);
  });
  it('sends everything else to the system browser', () => {
    expect(isAllowedInApp('https://github.com/x')).toBe(false);
    expect(isAllowedInApp('http://localhost:5173/')).toBe(false);
    expect(isAllowedInApp('https://twitch.tv.evil.com/')).toBe(false);
    expect(isAllowedInApp('http://www.twitch.tv/')).toBe(false);
    expect(isExternalWebLink('https://github.com')).toBe(true);
    expect(isExternalWebLink('file:///C:/Windows')).toBe(false);
  });
  it('strips Electron from the user agent', () => {
    expect(
      chromeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0) Chrome/140.0.0.0 multi-twitch-viewer/0.3.1 Electron/44.4.5 Safari/537.36',
      ),
    ).toBe('Mozilla/5.0 (Windows NT 10.0) Chrome/140.0.0.0 Safari/537.36');
  });
});

describe('window state', () => {
  const primary = { x: 0, y: 0, width: 1920, height: 1040 };
  const second = { x: 1920, y: 0, width: 2560, height: 1400 };
  it('reopens where it was, including on a second monitor', () => {
    const saved = { x: 2100, y: 50, width: 1800, height: 1000 };
    expect(restoreBounds(saved, [primary, second])).toEqual(saved);
  });
  it('comes back to the primary monitor when the other one is gone', () => {
    expect(restoreBounds({ x: 2100, y: 50, width: 1800, height: 1000 }, [primary])).toEqual({
      x: 160,
      y: 70,
      width: 1600,
      height: 900,
    });
  });
  it('ignores junk', () => {
    expect(restoreBounds(/** @type {any} */ ({ x: 'a' }), [primary]).width).toBe(1600);
    expect(parseState('not json')).toEqual({});
  });
});

describe('local server', () => {
  const root = mkdtempSync(join(tmpdir(), 'mtv-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), '<html>app</html>');
  writeFileSync(join(root, 'assets', 'a.js'), 'x');

  it('resolves files, falls back to index.html and blocks escapes', async () => {
    expect(await resolveFile(root, '/assets/a.js')).toBe(join(root, 'assets', 'a.js'));
    expect(await resolveFile(root, '/some/route?x=1')).toBe(join(root, 'index.html'));
    expect(await resolveFile(root, '/../../etc/passwd')).toBeNull();
    expect(await resolveFile(root, '/%2e%2e/%2e%2e/etc/passwd')).toBeNull();
  });

  it('serves the app over HTTP', async () => {
    const stop = await startServer(root, 5790);
    try {
      const res = await fetch('http://127.0.0.1:5790/deep/link');
      expect(await res.text()).toBe('<html>app</html>');
      expect(res.headers.get('content-type')).toContain('text/html');
      const asset = await fetch('http://127.0.0.1:5790/assets/a.js');
      expect(asset.headers.get('cache-control')).toContain('immutable');
      await expect(startServer(root, 5790)).rejects.toThrow();
    } finally {
      stop();
    }
  });
});

describe('updates', async () => {
  const { checkForUpdate, readBuildCommit, startUpdater, updaterCommand, INSTALL_SCRIPT_URL } =
    await import('./updates.mjs');
  const A = 'a'.repeat(40);
  const B = 'b'.repeat(40);
  const github = (body, status = 200, refs = '', refsStatus = 200) =>
    /** @type {typeof fetch} */ (
      async (/** @type {string} */ url) =>
        url.includes('/info/refs')
          ? new Response(refs, { status: refsStatus })
          : new Response(JSON.stringify(body), { status })
    );

  it('reports a newer commit on GitHub', async () => {
    const s = await checkForUpdate(A, github({ sha: B, commit: { message: 'Add thing\n\nbody' } }));
    expect(s).toMatchObject({
      state: 'available',
      current: A,
      latest: B,
      latestMessage: 'Add thing',
    });
  });
  it('reports up to date, dev builds and errors', async () => {
    expect((await checkForUpdate(A, github({ sha: A }))).state).toBe('up-to-date');
    expect((await checkForUpdate(null, github({ sha: A }))).state).toBe('dev');
    expect(await checkForUpdate(A, github({}, 403, '', 500))).toMatchObject({
      state: 'error',
      error: 'GitHub answered 403 / 500',
    });
  });
  it('falls back to git refs when the API is rate-limited', async () => {
    const refs = `001e# service=git-upload-pack\n0000015d${B} HEAD\0caps\n003f${B} refs/heads/main\n0044${A} refs/heads/mainline\n0000`;
    const s = await checkForUpdate(A, github({ message: 'rate limit' }, 403, refs));
    expect(s).toMatchObject({ state: 'available', latest: B });
    expect(s.latestMessage).toBeUndefined();
  });

  it('reads the commit stamped into the packaged app', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mtv-app-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ buildCommit: A }));
    expect(readBuildCommit(dir)).toBe(A);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ buildCommit: 'nope' }));
    expect(readBuildCommit(dir)).toBeNull();
  });
  it('runs the latest installer script in its own window, via Explorer', () => {
    /** @type {any[]} */
    const calls = [];
    /** @type {Record<string, string>} */
    const written = {};
    const fakeSpawn = /** @type {any} */ (
      (/** @type {any[]} */ ...args) => {
        calls.push(args);
        return { unref() {}, on() {} };
      }
    );
    const file = startUpdater({
      dir: '/data',
      spawnImpl: fakeSpawn,
      writeFile: /** @type {any} */ (
        (/** @type {string} */ p, /** @type {string} */ c) => (written[p] = c)
      ),
    });
    expect(file).toBe(join('/data', 'update-multi-twitch-viewer.cmd'));
    const script = written[file];
    expect(script).toContain('\r\n'); // Windows line endings
    expect(script).toContain(INSTALL_SCRIPT_URL);
    expect(script).toContain('-FromApp');
    expect(script).toContain('if errorlevel 1 pause');
    // The PowerShell command is wrapped in double quotes, so it must not contain any.
    expect(updaterCommand()).not.toContain('"');
    const [cmd, args, opts] = calls[0];
    expect(cmd).toBe('explorer.exe');
    expect(args).toEqual([file]);
    expect(opts).toMatchObject({ detached: true });
  });
});
