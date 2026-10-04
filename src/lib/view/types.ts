import type { LayoutMode, MainScale } from '../layout';

/**
 * solo: one stream audible, the rest muted.
 * duck: one stream at full volume, the rest quietly in the background.
 * mix:  any number of streams at full volume.
 */
export type AudioMode = 'solo' | 'duck' | 'mix';

export interface StreamGroup {
  id: string;
  name: string;
  channels: string[];
}

/**
 * Everything that describes "what I'm watching": the channels in display
 * order, the layout, which streams are audible and the chat panel.
 * Saved presets, the last session and share links all store this shape.
 */
export interface ViewState {
  channels: string[];
  /** Optional for compatibility with existing sessions and presets. */
  groups?: StreamGroup[];
  /** null shows all groups as clusters; a group id isolates its streams. */
  activeGroup?: string | null;
  layout: {
    mode: LayoutMode;
    /** Channel shown big in focus mode (defaults to the first channel). */
    main: string | null;
    mainScale: MainScale;
  };
  audio: {
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
