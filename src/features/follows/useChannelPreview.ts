import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ChannelRowInfo } from './channelRows';

export interface PreviewPosition {
  row: ChannelRowInfo;
  top: number;
  left: number;
}

/** One preview for sidebar rows, rail avatars, history and discovery results. */
export function useChannelPreview() {
  const [preview, setPreview] = useState<PreviewPosition | null>(null);
  const anchor = useRef<{ row: ChannelRowInfo; el: HTMLElement } | null>(null);
  const hidePreview = () => {
    anchor.current = null;
    setPreview(null);
  };
  const showPreview = (row: ChannelRowInfo, el: HTMLElement | null) => {
    if (!el) return hidePreview();
    anchor.current = { row, el };
    const box = el.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - 16);
    setPreview({
      row,
      top: Math.max(8, Math.min(box.top, window.innerHeight - 270)),
      left: Math.max(8, Math.min(box.right + 8, window.innerWidth - width - 8)),
    });
  };
  const onPreviewScroll = () => {
    const current = anchor.current;
    if (
      current &&
      current.el.isConnected &&
      (current.el.matches(':hover') || document.activeElement === current.el)
    ) {
      showPreview(current.row, current.el);
    } else hidePreview();
  };
  return { preview, showPreview, hidePreview, onPreviewScroll };
}

/** Keep an open preview current when a channel's live lookup finishes or changes. */
export function useRowPreview(
  row: ChannelRowInfo,
  onHover: ((el: HTMLElement | null) => void) | undefined,
) {
  const active = useRef<HTMLElement | null>(null);
  const refresh = useEffectEvent(() => {
    if (active.current) onHover?.(active.current);
  });
  useEffect(() => {
    refresh();
  }, [row.stream, row.displayName, row.avatar, row.liveKnown]);
  return (el: HTMLElement | null) => {
    active.current = el;
    onHover?.(el);
  };
}
