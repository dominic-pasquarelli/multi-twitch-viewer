import { useRef, useState } from 'react';
import { Bookmark, Check, Download, Pencil, Save, Trash2, Upload } from 'lucide-react';
import { exportPresets, parsePresetsFile, type Preset } from '@/lib/presets/presets';
import { usePresets } from '@/state/presetsStore';
import { useUi } from '@/state/uiStore';
import { useViewStore } from '@/state/viewStore';
import { toast } from '@/state/toastStore';
import { Button, IconButton } from '@/ui/Button';
import { Popover } from '@/ui/Popover';
import { useFollowedLive } from '../follows/queries';
import { downloadText, pickTextFile } from './fileIO';
import styles from './PresetsMenu.module.css';

export function PresetsMenu() {
  const open = useUi((s) => s.presetsMenuOpen);
  const setOpen = useUi((s) => s.setPresetsMenuOpen);
  const openDialog = useUi((s) => s.openDialog);
  const presets = usePresets((s) => s.presets);
  const hasChannels = useViewStore((s) => s.view.channels.length > 0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const liveLogins = new Set((useFollowedLive().data ?? []).map((s) => s.login));

  const doExport = () => {
    downloadText(
      `multi-twitch-presets-${new Date().toISOString().slice(0, 10)}.json`,
      exportPresets(presets),
    );
  };
  const doImport = async () => {
    const text = await pickTextFile();
    if (!text) return;
    try {
      const { presets: incoming, skipped } = parsePresetsFile(text);
      usePresets.getState().importPresets(incoming);
      toast(
        `Imported ${incoming.length} preset${incoming.length === 1 ? '' : 's'}${skipped ? ` (${skipped} skipped as invalid)` : ''}.`,
      );
    } catch (err) {
      toast((err as Error).message, { tone: 'error' });
    }
  };

  return (
    <div className={styles.wrap}>
      <Button
        ref={buttonRef}
        variant="ghost"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        data-testid="presets-button"
        title="Saved presets (P)"
      >
        <Bookmark size={16} /> Presets
      </Button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        className={styles.panel}
        ignoreRefs={[buttonRef]}
      >
        {presets.length === 0 && (
          <div className={styles.empty}>
            No saved presets yet. Set up some streams and a layout, then save them here to pull them
            back up with one click.
          </div>
        )}
        {presets.map((p) => (
          <PresetRow key={p.id} preset={p} liveLogins={liveLogins} onDone={() => setOpen(false)} />
        ))}
        <div className={styles.divider} />
        <div className={styles.footer}>
          <Button
            size="small"
            variant="primary"
            disabled={!hasChannels}
            onClick={() => openDialog('savePreset')}
          >
            <Save size={14} /> Save current…
          </Button>
          <Button size="small" onClick={doImport}>
            <Upload size={14} /> Import
          </Button>
          <Button size="small" onClick={doExport} disabled={!presets.length}>
            <Download size={14} /> Export
          </Button>
        </div>
      </Popover>
    </div>
  );
}

function PresetRow({
  preset,
  liveLogins,
  onDone,
}: {
  preset: Preset;
  liveLogins: Set<string>;
  onDone(): void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(preset.name);
  const store = usePresets.getState();
  const liveCount = preset.view.channels.filter((c) => liveLogins.has(c)).length;

  if (renaming) {
    const commit = () => {
      store.rename(preset.id, name);
      setRenaming(false);
    };
    return (
      <div className={styles.row}>
        <input
          className={styles.renameInput}
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setRenaming(false);
          }}
          aria-label="Preset name"
        />
        <IconButton size="sm" label="Save name" icon={<Check size={15} />} onClick={commit} />
      </div>
    );
  }

  return (
    <div className={styles.row}>
      <button
        className={styles.load}
        data-testid="preset-load"
        onClick={() => {
          useViewStore.getState().loadView(preset.view);
          toast(`Loaded “${preset.name}”`, {
            action: { label: 'Undo', run: () => useViewStore.getState().undo() },
          });
          onDone();
        }}
        title={preset.view.channels.join(', ')}
      >
        <strong>{preset.name}</strong>
        <small>
          {preset.view.channels.length} stream{preset.view.channels.length === 1 ? '' : 's'} ·{' '}
          {preset.view.layout.mode}
          {liveLogins.size > 0 && (
            <>
              {' '}
              · <span className={styles.liveCount}>{liveCount} live</span>
            </>
          )}
        </small>
      </button>
      <div className={styles.actions}>
        <IconButton
          size="sm"
          label="Update with the current streams and layout"
          icon={<Save size={14} />}
          onClick={() => {
            store.overwrite(preset.id, useViewStore.getState().view);
            toast(`Updated “${preset.name}”`);
          }}
        />
        <IconButton
          size="sm"
          label="Rename"
          icon={<Pencil size={14} />}
          onClick={() => setRenaming(true)}
        />
        <IconButton
          size="sm"
          label="Delete"
          icon={<Trash2 size={14} />}
          onClick={() => {
            store.remove(preset.id);
            toast(`Deleted “${preset.name}”`, {
              action: { label: 'Undo', run: () => usePresets.getState().importPresets([preset]) },
            });
          }}
        />
      </div>
    </div>
  );
}
