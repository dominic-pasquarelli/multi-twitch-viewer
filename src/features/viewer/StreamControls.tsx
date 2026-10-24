import {
  ExternalLink,
  Heart,
  Link2,
  Maximize2,
  Pin,
  MessageSquare,
  RotateCw,
  Star,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { kickChannelUrl, kickSlugFor } from '@/lib/kick';
import { audioLevel, focusedChannels } from '@/lib/view/operations';
import { formatCount } from '@/lib/utils/format';
import { useChannelPrefs } from '@/state/channelPrefsStore';
import { useSettings } from '@/state/settingsStore';
import { toast } from '@/state/toastStore';
import { useUi } from '@/state/uiStore';
import { useViewStore } from '@/state/viewStore';
import { IconButton } from '@/ui/Button';
import { useLiveStatus } from '../follows/queries';
import { KickBadge } from '../kick/KickBadge';
import { useFollowChannel } from '../follows/useFollowChannel';
import { currentVolume, setStreamMix, useVolumeModel, VOLUME_STEP } from './volume';
import styles from './StreamControls.module.css';

/**
 * Compact hover controls at the top of the stream. Mix sliders adjust just
 * this channel's balance without changing the other streams' levels.
 */
export function StreamControls({ login, main }: { login: string; main: boolean }) {
  const view = useViewStore((s) => s.view);
  const duckLevel = useSettings((s) => s.duckLevel);
  const volumeModel = useVolumeModel();
  const live = useLiveStatus(view.channels).live;
  const { canFollow, follow } = useFollowChannel();
  const favorite = useChannelPrefs((s) => s.favorites.includes(login));
  const flashN = useUi((s) => (s.volumeFlash?.login === login ? s.volumeFlash.n : 0));
  const store = useViewStore.getState();
  const stream = live.get(login);
  const kick = kickSlugFor(stream);
  const kickLink = useChannelPrefs((s) => s.kickLinks[login]);
  const level = audioLevel(view, login, duckLevel);
  const volume = currentVolume(login, volumeModel);
  const multi = view.layout.mode === 'multi-focus';
  const focused = focusedChannels(view);

  return (
    <div
      className={styles.controls}
      data-testid="stream-controls"
      data-channel={login}
      onWheel={(e) => {
        if (e.deltaY === 0 || !(e.target instanceof HTMLInputElement)) return;
        setStreamMix(
          login,
          Math.max(0, Math.min(1, volume + (e.deltaY < 0 ? VOLUME_STEP : -VOLUME_STEP))),
        );
        useUi.getState().flashVolume(login);
      }}
    >
      <div className={styles.heading}>
        <div className={styles.chip} data-testid="stream-chip">
          <span className={styles.name}>{stream?.displayName ?? login}</span>
          {kick && <KickBadge />}
          {stream && (
            <span className={styles.meta} title="Viewers">
              {formatCount(stream.viewerCount)}
            </span>
          )}
        </div>
        <IconButton
          size="sm"
          label={level.focused ? 'Stop listening (M mutes all)' : 'Listen to this stream'}
          active={level.focused}
          icon={level.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          onClick={() => store.toggleAudio(login)}
        />
        <input
          className={styles.volume}
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          aria-label={`${stream?.displayName ?? login} volume`}
          title={
            volumeModel.priorityMain === login
              ? 'Main stream level: whichever stream is main plays at this (scroll to adjust)'
              : "This stream's mix volume (scroll to adjust)"
          }
          onChange={(e) => {
            setStreamMix(login, Number(e.target.value) / 100);
            useUi.getState().flashVolume(login);
          }}
        />
        <span
          key={flashN} // replays the highlight animation on every change
          className={`${styles.percent} ${flashN ? styles.flash : ''}`}
          data-testid="stream-volume"
        >
          {Math.round(volume * 100)}%
        </span>
      </div>
      <div className={styles.actions}>
        {multi && (
          <IconButton
            size="sm"
            label={main ? 'Remove from multi focus' : 'Add to multi focus'}
            active={main}
            disabled={main ? focused.length <= 1 : focused.length >= 3}
            icon={<Pin size={15} />}
            onClick={() => store.toggleFocusedChannel(login)}
          />
        )}
        {!multi && view.channels.length > 1 && !main && (
          <IconButton
            size="sm"
            label="Make this the main stream"
            icon={<Maximize2 size={15} />}
            onClick={() => store.setMain(login)}
          />
        )}
        <IconButton
          size="sm"
          label={view.chat.open && view.chat.channel === login ? 'Hide chat' : 'Show chat'}
          active={view.chat.open && view.chat.channel === login}
          icon={<MessageSquare size={15} />}
          onClick={() =>
            store.setChat({
              open: !(view.chat.open && view.chat.channel === login),
              channel: login,
            })
          }
        />
        <IconButton
          size="sm"
          label="Reload player"
          icon={<RotateCw size={15} />}
          onClick={() => useUi.getState().reloadPlayer(login)}
        />
        <IconButton
          size="sm"
          label={kick ? 'Open on Kick' : 'Open on Twitch'}
          icon={<ExternalLink size={15} />}
          onClick={() =>
            window.open(
              kick ? kickChannelUrl(kick) : `https://www.twitch.tv/${login}`,
              '_blank',
              'noopener',
            )
          }
        />
        <IconButton
          size="sm"
          label={
            kickLink
              ? `Linked to kick.com/${kickLink}: plays from Kick while offline on Twitch`
              : 'Link a Kick channel: watch there while offline on Twitch'
          }
          active={!!kickLink}
          icon={<Link2 size={15} />}
          onClick={() => useUi.getState().openKickLinks(login)}
          data-testid="stream-kick-link"
        />
        <IconButton
          size="sm"
          label={
            favorite
              ? 'Remove from favorites'
              : 'Add to favorites: the Favorites view, sorted first, go-live alerts'
          }
          active={favorite}
          icon={<Star size={15} fill={favorite ? 'currentColor' : 'none'} />}
          onClick={() => useChannelPrefs.getState().toggleFavorite(login)}
          data-testid="stream-favorite"
        />
        {canFollow(login) && (
          <IconButton
            size="sm"
            label="Follow on Twitch"
            icon={<Heart size={15} />}
            onClick={() => void follow(login)}
            data-testid="stream-follow"
          />
        )}
        <IconButton
          size="sm"
          label="Remove"
          icon={<X size={16} />}
          onClick={() => {
            store.removeChannel(login);
            toast(`Removed ${login}`, {
              action: { label: 'Undo', run: () => useViewStore.getState().undo() },
            });
          }}
        />
      </div>
      {stream && (stream.gameName || stream.title) && (
        <div
          className={styles.info}
          data-testid="stream-info"
          title={[stream.gameName, stream.title].filter(Boolean).join('\n')}
        >
          {stream.gameName && <span className={styles.category}>{stream.gameName}</span>}
          {stream.title && <span className={styles.title}>{stream.title}</span>}
        </div>
      )}
    </div>
  );
}
