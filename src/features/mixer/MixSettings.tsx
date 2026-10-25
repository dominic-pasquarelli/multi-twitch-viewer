import { PanelBottom } from 'lucide-react';
import { mixPriorities } from '@/lib/audio/mixPreferences';
import { useMixStore } from '@/state/mixStore';
import { useMusicStore } from '@/state/musicStore';
import { useUi } from '@/state/uiStore';
import { useViewStore } from '@/state/viewStore';
import { Button, IconButton } from '@/ui/Button';
import { Checkbox } from '@/ui/Form';
import { useMusicChannel } from '../music/useMusic';
import { setImmersiveMix } from '../viewer/volume';
import styles from './MixSettings.module.css';

export function ImmersiveMixButton() {
  const immersive = useMixStore((s) => s.immersive);
  const mode = useViewStore((s) => s.view.audio.mode);
  const active = immersive && mode === 'mix';
  return (
    <IconButton
      size="sm"
      label={active ? 'Hide immersive mix sliders' : 'Immersive mix: show sliders on every stream'}
      icon={<PanelBottom size={16} />}
      active={active}
      data-testid="immersive-mix-toggle"
      onClick={() => setImmersiveMix(!active)}
    />
  );
}

function Level({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange(v: number): void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.level}>
      <span>{label}</span>
      <input
        type="range"
        aria-label={label}
        min={0}
        max={100}
        step={1}
        value={Math.round(value * 100)}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
      />
      <input
        type="number"
        aria-label={`${label} percent`}
        min={0}
        max={100}
        step={1}
        value={Math.round(value * 100)}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value !== '') onChange(e.target.valueAsNumber / 100);
        }}
      />
      <span>%</span>
    </div>
  );
}

/** The same controls appear in the Mixer and Settings → Audio. */
export function MixSettings() {
  const prefs = useMixStore();
  const music = useMusicStore();
  const musicChannel = useMusicChannel();
  const view = useViewStore((s) => s.view);
  const main = useUi((s) => s.mainStream);
  const visibleChannels = useUi((s) => s.visibleChannels);
  const priorities = mixPriorities(view, prefs, musicChannel, main, visibleChannels);
  return (
    <section className={styles.settings} aria-label="Mix controls">
      <Checkbox
        checked={prefs.immersive}
        onChange={setImmersiveMix}
        label="Immersive mix"
        help="Keep compact volume sliders over every video in Mix. Player controls and full-screen viewing still work."
      />
      <Checkbox
        checked={prefs.enabled}
        onChange={(enabled) => {
          if (enabled) useViewStore.getState().setAudioMode('mix');
          prefs.update({ enabled });
        }}
        label="Set levels by role"
        help="Give priority streams a shared level. Muted streams stay muted; App volume scales the final mix."
      />
      {prefs.enabled && (
        <div className={styles.roles}>
          {view.audio.mode !== 'mix' && (
            <small>Fixed role levels take effect when you switch back to Mix.</small>
          )}
          <label className={styles.source}>
            Priority selection
            <select
              value={prefs.prioritySource}
              aria-label="Priority selection"
              onChange={(e) =>
                prefs.update({
                  prioritySource: e.target.value as 'focus' | 'manual',
                  priorities,
                })
              }
            >
              <option value="focus">Follow visual focus</option>
              <option value="manual">Choose streams manually</option>
            </select>
          </label>
          <small>
            {prefs.prioritySource === 'focus'
              ? 'Uses the large stream(s) in Focus or Multi focus; Grid uses the first visible stream.'
              : 'Use the crown on a stream or mixer row to choose up to three. Layout stays unchanged.'}
          </small>
          <div className={styles.priorities} data-testid="mix-priorities">
            Priority: {priorities.join(', ') || 'None selected'}
          </div>
          <Level
            label="Priority level"
            value={prefs.priorityLevel}
            onChange={(priorityLevel) => prefs.update({ priorityLevel })}
          />
          <Checkbox
            checked={prefs.backgroundEnabled}
            onChange={(backgroundEnabled) => prefs.update({ backgroundEnabled })}
            label="Set background level"
            help="Other audible video streams share this level. Off keeps their individual levels."
          />
          {prefs.backgroundEnabled && (
            <Level
              label="Background level"
              value={prefs.backgroundLevel}
              onChange={(backgroundLevel) => prefs.update({ backgroundLevel })}
            />
          )}
          <small>
            Fixed levels are player percentages before App volume, independent of the
            Consistent-volume master. A slider marked “linked” changes that role for every stream
            using it.
          </small>
        </div>
      )}
      <div className={styles.music}>
        <div className={styles.musicTitle}>
          <strong>DJ / music</strong>
          <Button size="small" variant="ghost" onClick={() => useUi.getState().openDialog('music')}>
            Choose DJs
          </Button>
        </div>
        <Level label="DJ level" value={music.volume} onChange={music.setVolume} />
        {music.mode !== 'off' ? (
          <Checkbox
            checked={music.mixWithStreams}
            onChange={music.setMixWithStreams}
            label="Mix music with stream audio"
            help="Off keeps music-only listening. The DJ level follows automatic DJ switches."
          />
        ) : (
          <small>Music is off. Choose or pin a DJ to use this level.</small>
        )}
      </div>
    </section>
  );
}
