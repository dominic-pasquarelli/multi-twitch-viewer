import { normalizeLogin } from '../channels/parseChannels';
import type { ViewState } from './types';

/**
 * multitwitch-style share/bookmark links: #/chan1/chan2?layout=focus&main=chan2
 */
export function viewToHash(view: ViewState): string {
  if (!view.channels.length) return '';
  const params = new URLSearchParams();
  if (view.layout.mode === 'focus') {
    params.set('layout', 'focus');
    if (view.layout.main) params.set('main', view.layout.main);
  }
  const query = params.toString();
  return `#/${view.channels.join('/')}${query ? `?${query}` : ''}`;
}

export interface HashView {
  channels: string[];
  mode: 'grid' | 'focus';
  main: string | null;
}

export function hashToView(hash: string): HashView | null {
  if (!hash.startsWith('#/')) return null;
  const [path = '', query = ''] = hash.slice(2).split('?');
  const channels = [
    ...new Set(
      path
        .split('/')
        .map((s) => normalizeLogin(decodeURIComponent(s)))
        .filter((s): s is string => !!s),
    ),
  ];
  if (!channels.length) return null;
  const params = new URLSearchParams(query);
  const main = normalizeLogin(params.get('main') ?? '');
  return {
    channels,
    mode: params.get('layout') === 'focus' ? 'focus' : 'grid',
    main: main && channels.includes(main) ? main : null,
  };
}
