import { useState } from 'react';
import { usePresets } from '@/state/presetsStore';
import { useUi } from '@/state/uiStore';
import { useViewStore } from '@/state/viewStore';
import { toast } from '@/state/toastStore';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field, Checkbox } from '@/ui/Form';
import { captureScene } from './scenes';
import formStyles from '@/ui/Form.module.css';

export function SavePresetDialog() {
  const open = useUi((s) => s.dialog === 'savePreset');
  const close = () => useUi.getState().openDialog(null);
  return (
    <Dialog open={open} title="Save preset" onClose={close} width={440}>
      {open && <SaveForm onDone={close} />}
    </Dialog>
  );
}

function SaveForm({ onDone }: { onDone(): void }) {
  const view = useViewStore((s) => s.view);
  const presets = usePresets((s) => s.presets);
  const [name, setName] = useState('');
  const [complete, setComplete] = useState(true);
  const exists = presets.some((p) => p.name === name.trim());
  const save = () => {
    if (!name.trim()) return;
    usePresets.getState().save(name, view, complete ? captureScene() : undefined);
    useViewStore.getState().setPinned(true); // a saved collection keeps its streams
    toast(`${exists ? 'Updated' : 'Saved'} “${name.trim()}”`);
    onDone();
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field
        label="Name"
        help={
          exists
            ? 'A preset with this name exists — saving will update it.'
            : `Saves ${view.channels.length} stream(s): ${view.channels.join(', ')} — plus the layout, audio and chat setup.`
        }
      >
        <input
          className={formStyles.input}
          autoFocus
          value={name}
          maxLength={80}
          placeholder="e.g. Friday tournament"
          onChange={(e) => setName(e.target.value)}
          data-testid="preset-name"
        />
      </Field>
      <Checkbox
        checked={complete}
        onChange={setComplete}
        label="Save as a complete scene"
        help="Also restore DJ order and rules, DJ trims, mix priorities, channel levels, app volume, audio behavior and player quality. Sleep timers and temporary listening are excluded."
      />
      <div className={formStyles.row} style={{ justifyContent: 'flex-end' }}>
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!name.trim()}>
          {exists ? 'Update' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
