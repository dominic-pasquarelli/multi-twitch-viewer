import { useState } from 'react';
import { Layers, Plus } from 'lucide-react';
import { useViewStore } from '@/state/viewStore';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import styles from './GroupBar.module.css';

export function GroupBar() {
  const view = useViewStore((s) => s.view);
  const [open, setOpen] = useState(false);
  const groups = view.groups ?? [];
  if (!view.channels.length) return null;
  return (
    <>
      <nav className={styles.bar} aria-label="Stream groups" data-testid="group-bar">
        <Layers size={15} aria-hidden />
        <div className={styles.tabs}>
          <button
            aria-pressed={!view.activeGroup}
            onClick={() => useViewStore.getState().setActiveGroup(null)}
          >
            All groups <span>{view.channels.length}</span>
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              aria-pressed={view.activeGroup === g.id}
              onClick={() => useViewStore.getState().setActiveGroup(g.id)}
            >
              {g.name} <span>{g.channels.length}</span>
            </button>
          ))}
        </div>
        <Button
          size="small"
          variant="ghost"
          onClick={() => setOpen(true)}
          data-testid="manage-groups"
        >
          {groups.length ? 'Manage groups' : 'Create group'}
        </Button>
      </nav>
      <Dialog open={open} title="Stream groups" onClose={() => setOpen(false)} width={560}>
        {open && <GroupEditor />}
      </Dialog>
    </>
  );
}

function GroupEditor() {
  const view = useViewStore((s) => s.view);
  const actions = useViewStore.getState();
  const groups = view.groups ?? [];
  const [name, setName] = useState('');
  const [selected, setSelected] = useState(view.activeGroup ?? groups[0]?.id ?? '');
  const group = groups.find((g) => g.id === selected);
  return (
    <div className={styles.editor}>
      <p>
        Keep related perspectives together. All groups clusters them on screen; a group tab pauses
        hidden streams and keeps their audio settings.
      </p>
      <form
        className={styles.create}
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setSelected(actions.createGroup(name));
          setName('');
        }}
      >
        <input
          aria-label="New group name"
          placeholder="e.g. GTA RP or Minecraft"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={!name.trim() || groups.length >= 16}>
          <Plus size={14} /> Create
        </Button>
      </form>
      {groups.length > 0 && (
        <>
          <label className={styles.field}>
            Edit group
            <select
              aria-label="Edit group"
              value={group?.id ?? ''}
              onChange={(e) => setSelected(e.target.value)}
            >
              {!group && <option value="">Choose a group</option>}
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          {group && (
            <>
              <GroupName key={group.id} id={group.id} name={group.name} />
              <fieldset className={styles.members}>
                <legend>Streams in {group.name}</legend>
                {view.channels.map((login) => {
                  const owner = groups.find((g) => g.channels.includes(login));
                  return (
                    <label key={login}>
                      <input
                        type="checkbox"
                        checked={owner?.id === group.id}
                        onChange={(e) =>
                          actions.assignGroup(login, e.target.checked ? group.id : null)
                        }
                      />
                      <span>{login}</span>
                      {owner && owner.id !== group.id && <small>Move from {owner.name}</small>}
                    </label>
                  );
                })}
              </fieldset>
              <Button
                variant="danger"
                size="small"
                onClick={() => {
                  actions.removeGroup(group.id);
                  setSelected(groups.find((g) => g.id !== group.id)?.id ?? '');
                }}
              >
                Remove group
              </Button>
              <small>Removing a group keeps its streams in All groups.</small>
            </>
          )}
        </>
      )}
    </div>
  );
}

function GroupName({ id, name }: { id: string; name: string }) {
  const [draft, setDraft] = useState(name);
  return (
    <form
      className={styles.create}
      onSubmit={(e) => {
        e.preventDefault();
        useViewStore.getState().renameGroup(id, draft);
      }}
    >
      <input
        aria-label="Group name"
        maxLength={40}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <Button type="submit" disabled={!draft.trim() || draft.trim() === name}>
        Rename
      </Button>
    </form>
  );
}
