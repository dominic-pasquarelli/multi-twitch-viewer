import { useEffect } from 'react';
import { desktop } from '@/lib/desktop/bridge';
import { useClientId } from '@/app/servicesContext';
import { useSettings } from '@/state/settingsStore';
import { useUi } from '@/state/uiStore';
import { useViewStore } from '@/state/viewStore';
import { Toasts } from '@/ui/Toasts';
import { useGoLiveAlerts } from '@/features/alerts/useGoLiveAlerts';
import { SetupDialog } from '@/features/auth/SetupDialog';
import { useAuthBootstrap } from '@/features/auth/useAuthBootstrap';
import { ChatPanel } from '@/features/chat/ChatPanel';
import { Sidebar } from '@/features/follows/Sidebar';
import { SavePresetDialog } from '@/features/presets/SavePresetDialog';
import { SettingsDialog } from '@/features/settings/SettingsDialog';
import { ShortcutsDialog } from '@/features/shortcuts/ShortcutsDialog';
import { useHotkeys } from '@/features/shortcuts/useHotkeys';
import { useFullscreenSync } from '@/features/topbar/fullscreen';
import { TopBar } from '@/features/topbar/TopBar';
import { installAudioUnlock } from '@/features/viewer/playerRegistry';
import { UpdateBanner } from '@/features/updates/UpdateBanner';
import { useHashSync } from '@/features/viewer/useHashSync';
import { Viewer } from '@/features/viewer/Viewer';
import styles from './App.module.css';

export function App() {
  const clientId = useClientId();
  useAuthBootstrap(clientId);
  useHotkeys();
  useHashSync();
  useFullscreenSync();
  useGoLiveAlerts();
  useEffect(() => installAudioUnlock(), []);
  useEffect(
    () => desktop?.onBackgroundChange((hidden) => useUi.getState().setBackgrounded(hidden)),
    [],
  );

  const hideStreamInfo = useSettings((s) => s.hideStreamInfo);
  useEffect(() => desktop?.setPlayerChrome?.({ hideStreamInfo }), [hideStreamInfo]);

  const sidebarCollapsed = useSettings((s) => s.sidebarCollapsed);
  const chatOpen = useViewStore((s) => s.view.chat.open);
  const fullscreen = useUi((s) => s.fullscreen);
  // Hidden in the tray: unmount the players so nothing plays or downloads.
  const backgrounded = useUi((s) => s.backgrounded);

  return (
    <div className={`${styles.app} ${fullscreen ? styles.fullscreen : ''}`}>
      {fullscreen && <div className={styles.hotzone} />}
      <div className={styles.top}>
        <TopBar />
      </div>
      <div className={`${styles.side} ${sidebarCollapsed ? styles.collapsed : ''}`}>
        <Sidebar />
      </div>
      <main className={styles.main}>{!backgrounded && <Viewer />}</main>
      {chatOpen && !backgrounded && (
        <div className={styles.chat}>
          <ChatPanel />
        </div>
      )}
      <SettingsDialog />
      <SetupDialog />
      <SavePresetDialog />
      <ShortcutsDialog />
      <UpdateBanner />
      <Toasts />
    </div>
  );
}
