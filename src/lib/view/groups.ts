import type { StreamGroup, ViewState } from './types';
import { mainChannel } from './operations';

const MAX_GROUPS = 16;
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validate persisted groups, dropping unknown channels and duplicate memberships. */
export function sanitizeGroups(input: unknown, channels: string[]): StreamGroup[] {
  if (!Array.isArray(input)) return [];
  const ids = new Set<string>();
  const assigned = new Set<string>();
  const groups: StreamGroup[] = [];
  for (const item of input.slice(0, MAX_GROUPS)) {
    if (
      !isObject(item) ||
      typeof item.id !== 'string' ||
      !item.id ||
      item.id.length > 100 ||
      ids.has(item.id)
    )
      continue;
    if (typeof item.name !== 'string' || !item.name.trim()) continue;
    const sourceChannels = item.channels;
    const members = Array.isArray(sourceChannels)
      ? channels.filter((c) => sourceChannels.includes(c) && !assigned.has(c))
      : [];
    ids.add(item.id);
    members.forEach((c) => assigned.add(c));
    groups.push({ id: item.id, name: item.name.trim().slice(0, 40), channels: members });
  }
  return groups;
}

export function normalizeGroups(view: ViewState): ViewState {
  if (!view.groups && !view.activeGroup) return view;
  const groups = sanitizeGroups(view.groups, view.channels);
  const activeGroup = groups.some((g) => g.id === view.activeGroup) ? view.activeGroup : null;
  return { ...view, groups, activeGroup };
}

export function createGroup(view: ViewState, name: string, id: string): ViewState {
  if (!name.trim() || (view.groups?.length ?? 0) >= MAX_GROUPS) return view;
  return normalizeGroups({
    ...view,
    groups: [...(view.groups ?? []), { id, name: name.trim().slice(0, 40), channels: [] }],
  });
}

export function renameGroup(view: ViewState, id: string, name: string): ViewState {
  if (!name.trim()) return view;
  return {
    ...view,
    groups: view.groups?.map((g) => (g.id === id ? { ...g, name: name.trim().slice(0, 40) } : g)),
  };
}

export function removeGroup(view: ViewState, id: string): ViewState {
  return normalizeGroups({ ...view, groups: view.groups?.filter((g) => g.id !== id) });
}

/** Assign each stream to at most one group without altering audio or channel order. */
export function assignGroup(view: ViewState, login: string, id: string | null): ViewState {
  if (!view.channels.includes(login) || (id && !view.groups?.some((g) => g.id === id))) return view;
  return {
    ...view,
    groups: (view.groups ?? []).map((g) => ({
      ...g,
      channels:
        g.id === id
          ? [...g.channels.filter((c) => c !== login), login]
          : g.channels.filter((c) => c !== login),
    })),
  };
}

/** Replacement keeps the replaced stream's group, like its audio and focus slot. */
export function replaceGroupChannel(
  view: ViewState,
  target: string,
  replacement: string,
): ViewState {
  return normalizeGroups({
    ...view,
    groups: view.groups?.map((g) => ({
      ...g,
      channels: g.channels.map((c) => (c === target ? replacement : c)),
    })),
  });
}

/** Swapping tiles also swaps their group slots, including an ungrouped slot. */
export function swapGroupChannels(view: ViewState, a: string, b: string): ViewState {
  if (!view.channels.includes(a) || !view.channels.includes(b)) return view;
  return normalizeGroups({
    ...view,
    groups: view.groups?.map((g) => ({
      ...g,
      channels: g.channels.map((c) => (c === a ? b : c === b ? a : c)),
    })),
  });
}

export function displayedChannels(view: ViewState, channels = view.channels): string[] {
  const group = view.groups?.find((g) => g.id === view.activeGroup);
  return group ? channels.filter((c) => group.channels.includes(c)) : channels;
}

export interface StreamSection {
  id: string;
  name: string;
  channels: string[];
}

export function streamSections(view: ViewState, visible = view.channels): StreamSection[] {
  const shown = displayedChannels(view, visible);
  if (!view.groups?.length) return [{ id: 'all', name: '', channels: shown }];
  const groups = view.activeGroup
    ? view.groups.filter((g) => g.id === view.activeGroup)
    : view.groups;
  const sections = groups
    .map((g) => ({
      ...g,
      channels: shown.filter((c) => g.channels.includes(c)),
    }))
    .filter((g) => g.channels.length);
  if (!view.activeGroup) {
    const assigned = new Set(view.groups.flatMap((g) => g.channels));
    const ungrouped = shown.filter((c) => !assigned.has(c));
    if (ungrouped.length)
      sections.push({ id: 'ungrouped', name: 'Ungrouped', channels: ungrouped });
  }
  return sections;
}

/** Match grouped slots, with one global main before the remaining clusters in Focus. */
export function groupedSlotOrder(view: ViewState, visible = view.channels): string[] {
  const clustered = streamSections(view, visible).flatMap((section) => section.channels);
  if (view.layout.mode !== 'focus') return clustered;
  const main = mainChannel(view, displayedChannels(view, visible));
  return main ? [main, ...clustered.filter((login) => login !== main)] : clustered;
}
