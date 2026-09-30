/**
 * The API the Electron app exposes to the page (desktop/preload.cjs).
 * Undefined when running in a normal browser (`npm start`, `npm run dev`).
 */
export interface UpdateStatus {
  /** dev = run from source (no update checks). */
  state: 'dev' | 'checking' | 'up-to-date' | 'available' | 'installing' | 'error';
  current: string | null;
  latest?: string;
  latestMessage?: string;
  error?: string;
  checkedAt?: string;
}

export interface PlayerChrome {
  /** Hide the channel/title/Follow/Subscribe overlay at the top of each player. */
  hideStreamInfo: boolean;
  /** Click through the "intended for certain audiences" notice. */
  skipContentWarning: boolean;
}

export interface DesktopBridge {
  isDesktop: true;
  version: string;
  /** Brings the app window back from the tray. */
  showWindow(): void;
  /** Opens a channel's twitch.tv page (to follow it); resolves when it's closed. */
  openTwitchChannel?(login: string): Promise<void>;
  /** Opens a twitch.tv sign-in window so the players get Turbo/sub benefits. */
  openTwitchSignIn(): Promise<void>;
  getUpdateStatus(): Promise<UpdateStatus>;
  checkForUpdates(): Promise<UpdateStatus>;
  /** Rebuilds and reinstalls from the latest code on GitHub; the app closes and reopens. */
  installUpdate(): void;
  /** Presses play inside every Twitch player (gets past content blurs the embed API can't). */
  playAll?(): void;
  /** Tweaks Twitch's own UI inside the players (see desktop/playerChrome.mjs). */
  setPlayerChrome?(options: PlayerChrome): void;
  onUpdateStatus(callback: (status: UpdateStatus) => void): () => void;
  /** Called with the channel when a player is right-clicked. */
  onPlayerContextMenu?(callback: (channel: string) => void): () => void;
  /** Called with true when the window is hidden to the tray, false when shown. */
  onBackgroundChange(callback: (hidden: boolean) => void): () => void;
}

export const desktop: DesktopBridge | undefined = (
  globalThis as unknown as { mtvDesktop?: DesktopBridge }
).mtvDesktop;
