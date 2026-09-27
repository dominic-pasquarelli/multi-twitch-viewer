/** Single source of truth for keyboard shortcuts (used by the handler and the help dialog). */
export const SHORTCUTS: { keys: string; description: string }[] = [
  { keys: '1 – 9', description: 'Hear stream 1–9 (others mute)' },
  { keys: 'Shift + 1 – 9', description: 'Add/remove stream from the audio mix' },
  { keys: 'M', description: 'Mute everything / bring the audio back' },
  { keys: '↑  ↓', description: 'Volume of the stream you are hearing (or scroll over its bar)' },
  { keys: 'L', description: 'Switch between grid and focus layout' },
  { keys: '[  ]', description: 'Focus layout: main stream smaller / bigger' },
  { keys: '\\', description: 'Focus layout: automatic main size' },
  { keys: '/', description: 'Add channels' },
  { keys: 'B', description: 'Show/hide the followed sidebar' },
  { keys: 'C', description: 'Show/hide chat' },
  { keys: 'F', description: 'Fullscreen' },
  { keys: 'P', description: 'Presets menu' },
  { keys: 'Ctrl/⌘ + Z', description: 'Undo (removed stream, loaded preset…)' },
  { keys: '?', description: 'This help' },
];
