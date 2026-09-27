// @ts-check
// Serves the built web app on http://localhost:5757. It must be localhost on
// that exact port: Twitch's OAuth redirect and embed `parent` checks rely on it,
// and it keeps the Electron app's storage separate from nothing else.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

export const PORT = 5757;
export const APP_URL = `http://localhost:${PORT}/`;

/** @type {Record<string, string>} */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/**
 * Resolves a URL path to a file inside `root`, or null for anything that
 * would escape it. Unknown paths fall back to index.html (single-page app).
 * @param {string} root
 * @param {string} urlPath
 */
export async function resolveFile(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  } catch {
    return null;
  }
  const candidate = normalize(join(root, decoded));
  if (candidate !== root && !candidate.startsWith(root.endsWith(sep) ? root : root + sep))
    return null;
  try {
    if ((await stat(candidate)).isFile()) return candidate;
  } catch {
    // fall through to index.html
  }
  return join(root, 'index.html');
}

/** @param {string} root */
export function createAppHandler(root) {
  /** @type {import('node:http').RequestListener} */
  return async (req, res) => {
    const file = await resolveFile(root, req.url ?? '/');
    if (!file) {
      res.writeHead(400).end();
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': file.includes(`${sep}assets${sep}`)
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  };
}

/**
 * Starts the server on IPv4 and (if available) IPv6 loopback, so "localhost"
 * works whichever one Windows resolves first. Rejects if the port is taken.
 * @param {string} root
 * @param {number} [port]
 * @returns {Promise<() => void>} stop function
 */
export async function startServer(root, port = PORT) {
  const handler = createAppHandler(root);
  /** @param {string} host */
  const listen = (host) =>
    new Promise((resolve, reject) => {
      const server = createServer(handler);
      server.once('error', reject);
      server.listen(port, host, () => resolve(server));
    });
  /** @type {import('node:http').Server[]} */
  const servers = [/** @type {import('node:http').Server} */ (await listen('127.0.0.1'))];
  try {
    servers.push(/** @type {import('node:http').Server} */ (await listen('::1')));
  } catch {
    // No IPv6 loopback: fine.
  }
  return () => servers.forEach((s) => s.close());
}
