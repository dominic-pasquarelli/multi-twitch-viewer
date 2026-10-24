import { useRef, useState } from 'react';
import { Pin, SlidersHorizontal, Volume2, VolumeX, X } from 'lucide-react';
import { audioLevel, slotOrder, focusedChannels } from '@/lib/view/operations';
import { useSettings } from '@/state/settingsStore';
import { toast } from '@/state/toastStore';
import { useViewStore } from '@/state/viewStore';
import { Button, IconButton } from '@/ui/Button';
import { Checkbox } from '@/ui/Form';
import { Popover } from '@/ui/Popover';
import { useLiveStatus } from '../follows/queries';
import {
  balanceFocusedAudio,
  currentVolume,
  setMaster,
  setStreamMix,
  useVolumeModel,
} from '../viewer/volume';
import styles from './Mixer.module.css';

/**
 * Every stream's level in one place (top-bar popover), for balancing the
 * streams you hear together in Mix mode. Also switches consistent volume and
 * removes streams (handy for ones you don't follow, which aren't in the sidebar).
 */
export function Mixer() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const view = useViewStore((s) => s.view);
  const duckLevel = useSettings((s) => s.duckLevel);
  const update = useSettings((s) => s.update);
  const mainPriority = useSettings((s) => s.mainPriority);
  const volumeModel = useVolumeModel();
  const live = useLiveStatus(view.channels).live;
  const multi = view.layout.mode === 'multi-focus';
  const channels = slotOrder(view, view.channels);
  const focused = focusedChannels(view, channels);
  const pct = (v: number) => Math.round(v * 100);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <IconButton
        size="sm"
        label="Mixer: balance the streams' volumes"
        icon={<SlidersHorizontal size={16} />}
        active={open}
        onClick={() => setOpen(!open)}
        disabled={!view.channels.length}
        data-testid="mixer-button"
      />
      {/* Stays open while you use a player's own volume slider, so you can watch its row follow. */}
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        className={styles.panel}
        ignoreRefs={[wrapRef]}
        closeOnBlur={false}
      >
        <div data-testid="mixer">
          {multi && (
            <div className={styles.focusControls}>
              <strong>Multi focus · {focused.length}/3</strong>
              <p className={styles.help}>
                Pin two or three streams to keep them large. Remove a pin before choosing a fourth.
                Adjust each slider to balance their audio.
              </p>
              <Button size="small" onClick={balanceFocusedAudio} disabled={!focused.length}>
                Equal levels
              </Button>
            </div>
          )}
          <Checkbox
            checked={volumeModel.consistent}
            onChange={(v) => update({ consistentVolume: v })}
            label="Consistent volume"
            help="Every stream you switch to plays at the same master volume. The sliders below then even out a loud or quiet streamer."
          />
          {!multi && (
            <Checkbox
              checked={mainPriority}
              onChange={(v) => update({ mainPriority: v })}
              label="Main stream at full volume (Mix + Focus)"
              help="The big stream plays at the main level (100% unless you set its slider); the others keep their own levels, and get them back when another stream is main."
            />
          )}
          {volumeModel.consistent && (
            <label className={`${styles.row} ${styles.master}`}>
              <span className={styles.name}>Master</span>
              <input
                type="range"
                min={0}
                max={100}
                value={pct(volumeModel.master)}
                onChange={(e) => setMaster(Number(e.target.value) / 100)}
                aria-label="Master volume"
                data-testid="mixer-master"
              />
              <span className={styles.percent}>{pct(volumeModel.master)}%</span>
            </label>
          )}
          {channels.map((login, i) => {
            const level = audioLevel(view, login, duckLevel);
            const volume = currentVolume(login, volumeModel);
            const name = live.get(login)?.displayName ?? login;
            const isMain = volumeModel.priorityMain === login;
            return (
              <div
                key={login}
                className={`${styles.row} ${level.muted ? styles.muted : ''}`}
                data-testid="mixer-row"
                data-channel={login}
              >
                {multi && (
                  <IconButton
                    size="sm"
                    label={
                      focused.includes(login)
                        ? `Remove ${name} from multi focus`
                        : `Add ${name} to multi focus`
                    }
                    active={focused.includes(login)}
                    disabled={focused.includes(login) ? focused.length <= 1 : focused.length >= 3}
                    icon={<Pin size={15} />}
                    onClick={() => useViewStore.getState().toggleFocusedChannel(login)}
                  />
                )}
                <IconButton
                  size="sm"
                  label={level.focused ? `Stop listening to ${name}` : `Listen to ${name}`}
                  active={level.focused}
                  icon={level.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  onClick={() => useViewStore.getState().toggleAudio(login)}
                />
                <span className={styles.name} title={name}>
                  {i < 9 && <kbd>{i + 1}</kbd>} {name}
                  {(isMain || (multi && focused.includes(login))) && (
                    <span
                      className={styles.mainTag}
                      title={
                        multi
                          ? 'Selected as a large stream; its slider sets its own mix level'
                          : "Plays at the main level while it's the main stream; its own level comes back after"
                      }
                    >
                      {multi ? 'Focus' : 'Main'}
                    </span>
                  )}
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={pct(volume)}
                  onChange={(e) => setStreamMix(login, Number(e.target.value) / 100)}
                  aria-label={isMain ? `Main stream level (${name})` : `${name} volume`}
                />
                <span className={styles.percent} data-testid="mixer-volume">
                  {pct(volume)}%
                </span>
                <IconButton
                  size="sm"
                  label={`Remove ${name}`}
                  icon={<X size={15} />}
                  onClick={() => {
                    useViewStore.getState().removeChannel(login);
                    toast(`Removed ${name}`, {
                      action: { label: 'Undo', run: () => useViewStore.getState().undo() },
                    });
                  }}
                />
              </div>
            );
          })}
          <p className={styles.help}>
            {view.audio.mode === 'mix'
              ? 'Turn streams on with their speaker button (or Shift+1–9) to hear them together.'
              : 'Switch to Mix to hear several streams at once.'}
          </p>
        </div>
      </Popover>
    </div>
  );
}
