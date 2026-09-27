/** Data type used when dragging a channel from the sidebar onto the viewer. */
export const CHANNEL_MIME = 'application/x-mtv-channel';

/** Players are iframes, which swallow drag events; switch that off while dragging. */
export const setDragging = (on: boolean) => document.body.classList.toggle('mtv-dragging', on);
