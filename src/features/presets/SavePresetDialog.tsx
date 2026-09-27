import { useState } from 'react';
import { usePresets } from '@/state/presetsStore';
import { useUi } from '@/state/uiStore';
import { useViewStore } from '@/state/viewStore';
import { toast } from '@/state/toastStore';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field } from '@/ui/Form';
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
  const exists = presets.some((p) => p.name === name.trim());
  const save = () => {
    if (!name.trim()) return;
    usePresets.getState().save(name, view);
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
      <div className={formStyles.row} style={{ justifyContent: 'flex-end' }}>
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!name.trim()}>
          {exists ? 'Update' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
