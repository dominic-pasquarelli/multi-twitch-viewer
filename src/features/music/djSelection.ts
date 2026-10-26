import { activeMusicChannel } from '@/lib/music/music';
import { mainChannel } from '@/lib/view/operations';
import { useMusicStore } from '@/state/musicStore';
import { useViewStore } from '@/state/viewStore';

/** Select music first, then focus its video on a subsequent click. Never reorder DJs. */
export function selectOrFocusDJ(channel: string): 'switched' | 'focused' | 'unchanged' {
  const music = useMusicStore.getState();
  if (music.mode === 'off' || !music.channels.includes(channel)) return 'unchanged';
  if (activeMusicChannel(music) !== channel) {
    music.pin(channel, { preservePaused: true });
    return 'switched';
  }
  const store = useViewStore.getState();
  if (store.view.layout.mode === 'focus' && mainChannel(store.view) === channel) return 'unchanged';
  store.setMain(channel, { preserveAudio: true });
  return 'focused';
}
