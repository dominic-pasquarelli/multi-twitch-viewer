import { normalizeChannel } from '../channels/parseChannels';
import type { ViewState } from './types';
import { focusedChannels } from './operations';
import type { LayoutMode } from '../layout';

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
  if (view.layout.mode === 'multi-focus') {
    params.set('layout', 'multi-focus');
    params.set('focus', focusedChannels(view).join(','));
  }
  const query = params.toString();
  return `#/${view.channels.join('/')}${query ? `?${query}` : ''}`;
}

export interface HashView {
  channels: string[];
  mode: LayoutMode;
  main: string | null;
  focused?: string[];
}

export function hashToView(hash: string): HashView | null {
  if (!hash.startsWith('#/')) return null;
  const [path = '', query = ''] = hash.slice(2).split('?');
  const channels = [
    ...new Set(
      path
        .split('/')
        .map((s) => normalizeChannel(decodeURIComponent(s)))
        .filter((s): s is string => !!s),
    ),
  ];
  if (!channels.length) return null;
  const params = new URLSearchParams(query);
  const main = normalizeChannel(params.get('main') ?? '');
  const multi = params.get('layout') === 'multi-focus';
  const focused = [...new Set((params.get('focus') ?? '').split(',').map(normalizeChannel))]
    .filter((c): c is string => !!c && channels.includes(c))
    .slice(0, 3);
  return {
    channels,
    mode: multi ? 'multi-focus' : params.get('layout') === 'focus' ? 'focus' : 'grid',
    main: main && channels.includes(main) ? main : null,
    ...(multi ? { focused: params.has('focus') ? focused : channels.slice(0, 2) } : {}),
  };
}
