import type { LayoutMode, MainScale } from '../layout';

export type AudioMode = 'solo' | 'mix';

/**
 * Everything that describes "what I'm watching": the channels in display
 * order, the layout, which streams are audible and the chat panel.
 * Saved presets, the last session and share links all store this shape.
 */
export interface ViewState {
  channels: string[];
  layout: {
    mode: LayoutMode;
    /** Channel shown big in focus mode (defaults to the first channel). */
    main: string | null;
    mainScale: MainScale;
  };
  audio: {
    /** solo: one stream audible at a time. mix: any number. */
    mode: AudioMode;
    /** Channels that are unmuted. */
    active: string[];
  };
  chat: {
    open: boolean;
    channel: string | null;
  };
}

export const EMPTY_VIEW: ViewState = {
  channels: [],
  layout: { mode: 'grid', main: null, mainScale: 'auto' },
  audio: { mode: 'solo', active: [] },
  chat: { open: false, channel: null },
};

export const MAX_CHANNELS = 16;
