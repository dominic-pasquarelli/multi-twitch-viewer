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
