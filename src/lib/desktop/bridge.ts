/**
 * The API the Electron app exposes to the page (desktop/preload.cjs).
 * Undefined when running in a normal browser (`npm start`, `npm run dev`).
 */
export interface DesktopBridge {
  isDesktop: true;
  version: string;
  /** Brings the app window back from the tray. */
  showWindow(): void;
  /** Opens a twitch.tv sign-in window so the players get Turbo/sub benefits. */
  openTwitchSignIn(): Promise<void>;
  /** Called with true when the window is hidden to the tray, false when shown. */
  onBackgroundChange(callback: (hidden: boolean) => void): () => void;
}

export const desktop: DesktopBridge | undefined = (
  globalThis as unknown as { mtvDesktop?: DesktopBridge }
).mtvDesktop;
