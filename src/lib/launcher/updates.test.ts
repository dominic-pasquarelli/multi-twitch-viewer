import { describe, expect, it, vi } from 'vitest';
import { checkForUpdate } from './updates';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function fetcher(version: Response | Error, tag: Response | Error) {
  return vi.fn(async (url: string) => {
    const r = url.startsWith('/__mtv') ? version : tag;
    if (r instanceof Error) throw r;
    return r.clone();
  }) as unknown as typeof fetch;
}

describe('checkForUpdate', () => {
  it('reports a newer release', async () => {
    const res = await checkForUpdate(
      fetcher(json({ version: '0.2.0', commit: A }), json({ object: { sha: B } })),
    );
    expect(res).toMatchObject({ kind: 'available', latestCommit: B });
  });
  it('reports up to date', async () => {
    const res = await checkForUpdate(
      fetcher(json({ version: '0.2.0', commit: A }), json({ object: { sha: A } })),
    );
    expect(res.kind).toBe('up-to-date');
  });
  it('does nothing outside the launcher or for local builds', async () => {
    expect(
      (await checkForUpdate(fetcher(new Response('<html>', { status: 404 }), json({})))).kind,
    ).toBe('not-launcher');
    expect((await checkForUpdate(fetcher(new Error('offline'), json({})))).kind).toBe(
      'not-launcher',
    );
    expect(
      (await checkForUpdate(fetcher(json({ version: '0.2.0', commit: 'dev' }), json({})))).kind,
    ).toBe('dev-build');
  });
  it('is quiet when GitHub is unreachable', async () => {
    const res = await checkForUpdate(
      fetcher(json({ version: '0.2.0', commit: A }), new Error('offline')),
    );
    expect(res.kind).toBe('unknown');
  });
});
