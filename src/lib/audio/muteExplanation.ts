import type { ViewState } from '@/lib/view/types';
import { activeMusicChannel, type MusicPlayback } from '@/lib/music/music';

export function muteExplanation(
  login: string,
  view: ViewState,
  music: MusicPlayback,
  mutedAll: boolean,
): string {
  if (mutedAll) return 'App muted';
  const dj = activeMusicChannel(music);
  if (dj === login && music.muted) return 'DJ muted';
  if (music.mode !== 'off' && !music.mixWithStreams && login !== dj) return 'Music-only listening';
  if (music.mode !== 'off' && music.channels.includes(login) && login !== dj)
    return 'Another DJ is selected';
  return view.audio.mode === 'solo' ? 'Muted by Solo' : 'Not selected in the audio mix';
}
