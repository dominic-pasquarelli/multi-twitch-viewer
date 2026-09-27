/** 950 → "950", 12_345 → "12.3K", 1_234_567 → "1.2M". */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${trim(n / 1000)}K`;
  return `${trim(n / 1_000_000)}M`;
}

const trim = (v: number) =>
  v >= 100 ? Math.round(v).toString() : v.toFixed(1).replace(/\.0$/, '');

/** Time since an ISO timestamp, e.g. "2h 05m" or "14m". */
export function formatUptime(startedAt: string, now: number = Date.now()): string {
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return '';
  const minutes = Math.max(0, Math.floor((now - start) / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/** Twitch thumbnail URLs contain {width}/{height} placeholders. */
export const sizedThumbnail = (template: string, width: number, height: number): string =>
  template.replace('{width}', String(width)).replace('{height}', String(height));
