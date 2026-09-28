import { useRef, useState } from 'react';
import { SlidersHorizontal, Volume2, VolumeX, X } from 'lucide-react';
import { audioLevel, slotOrder } from '@/lib/view/operations';
import { useSettings } from '@/state/settingsStore';
import { toast } from '@/state/toastStore';
import { useViewStore } from '@/state/viewStore';
import { IconButton } from '@/ui/Button';
import { Checkbox } from '@/ui/Form';
import { Popover } from '@/ui/Popover';
import { useLiveStatus } from '../follows/queries';
import { currentVolume, setMaster, setStreamMix, useVolumeModel } from '../viewer/volume';
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
  const volumeModel = useVolumeModel();
  const live = useLiveStatus(view.channels).live;
  const channels = slotOrder(view, view.channels);
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
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        className={styles.panel}
        ignoreRefs={[wrapRef]}
      >
        <div data-testid="mixer">
          <Checkbox
            checked={volumeModel.consistent}
            onChange={(v) => update({ consistentVolume: v })}
            label="Consistent volume"
            help="Every stream you switch to plays at the same master volume. The sliders below then even out a loud or quiet streamer."
          />
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
            return (
              <div
                key={login}
                className={`${styles.row} ${level.muted ? styles.muted : ''}`}
                data-testid="mixer-row"
                data-channel={login}
              >
                <IconButton
                  size="sm"
                  label={level.focused ? `Stop listening to ${name}` : `Listen to ${name}`}
                  active={level.focused}
                  icon={level.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  onClick={() => useViewStore.getState().toggleAudio(login)}
                />
                <span className={styles.name} title={name}>
                  {i < 9 && <kbd>{i + 1}</kbd>} {name}
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={pct(volume)}
                  onChange={(e) => setStreamMix(login, Number(e.target.value) / 100)}
                  aria-label={`${name} volume`}
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
