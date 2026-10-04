import { beforeEach, describe, expect, it } from 'vitest';
import { emptyView } from '@/lib/view/operations';
import { useViewStore } from './viewStore';

const store = () => useViewStore.getState();
beforeEach(() =>
  useViewStore.setState({ view: emptyView(), history: [], mutedFrom: null, pinned: false }),
);

describe('group store transitions', () => {
  it('adds new streams to the isolated tab and preserves membership on replacement', () => {
    store().addChannels(['a', 'b']);
    const id = store().createGroup('GTA RP');
    store().assignGroup('a', id);
    store().setActiveGroup(id);
    store().addChannels(['c']);
    expect(store().view.groups?.[0]?.channels).toEqual(['a', 'c']);
    store().replaceChannel('c', 'd');
    expect(store().view.groups?.[0]?.channels).toEqual(['a', 'd']);
    store().undo();
    expect(store().view.groups?.[0]?.channels).toEqual(['a', 'c']);
  });

  it('removing a group keeps its streams and undo restores the isolated tab', () => {
    store().addChannels(['a', 'b']);
    const id = store().createGroup('Minecraft');
    store().assignGroup('b', id);
    store().setActiveGroup(id);
    store().removeGroup(id);
    expect(store().view.channels).toEqual(['a', 'b']);
    expect(store().view.activeGroup).toBeNull();
    store().undo();
    expect(store().view.activeGroup).toBe(id);
  });

  it('sidebar toggles add to the current tab and swapping crosses group slots', () => {
    store().addChannels(['a', 'b']);
    const first = store().createGroup('GTA');
    const second = store().createGroup('Minecraft');
    store().assignGroup('a', first);
    store().assignGroup('b', second);
    store().setActiveGroup(first);
    store().toggleChannel('c');
    expect(store().view.groups?.[0]?.channels).toEqual(['a', 'c']);
    store().replaceChannel('a', 'b');
    expect(store().view.groups?.[0]?.channels).toEqual(['b', 'c']);
    expect(store().view.groups?.[1]?.channels).toEqual(['a']);
  });

  it('focus audio targets the visible group and existing streams can move into an empty group', () => {
    store().addChannels(['a', 'b']);
    const id = store().createGroup('Minecraft');
    store().setActiveGroup(id);
    store().addChannels(['b']);
    expect(store().view.groups?.[0]?.channels).toEqual(['b']);
    store().setLayoutMode('focus');
    expect(store().view.audio.active).toEqual(['b']);
  });
});
