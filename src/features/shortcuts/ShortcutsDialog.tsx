import { useUi } from '@/state/uiStore';
import { Dialog } from '@/ui/Dialog';
import { SHORTCUTS } from './shortcuts';

export function ShortcutsDialog() {
  const open = useUi((s) => s.dialog === 'shortcuts');
  return (
    <Dialog
      open={open}
      title="Keyboard shortcuts"
      onClose={() => useUi.getState().openDialog(null)}
      width={460}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={s.keys} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '7px 12px 7px 0', whiteSpace: 'nowrap' }}>
                <kbd
                  style={{
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: 'var(--surface-3)',
                    font: 'inherit',
                  }}
                >
                  {s.keys}
                </kbd>
              </td>
              <td style={{ padding: '7px 0', color: 'var(--text-muted)' }}>{s.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ color: 'var(--text-faint)', fontSize: 12, marginBottom: 0 }}>
        Shortcuts pause while you are typing, and while a player has keyboard focus (move the mouse
        off the player to give focus back).
      </p>
    </Dialog>
  );
}
