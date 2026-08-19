function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function createEditorState(initial = {}) {
  return {
    screen: clone(initial.screen ?? null),
    rows: clone(Array.isArray(initial.rows) ? initial.rows : []),
    settings: clone(initial.settings && typeof initial.settings === 'object' ? initial.settings : {}),
    selectedRowId: initial.selectedRowId ?? null,
    dirty: initial.dirty === true,
    revision: Number.isInteger(initial.revision) ? initial.revision : 0,
    draftRevision: Number.isInteger(initial.draftRevision) ? initial.draftRevision : 0
  };
}

export function snapshotEditorState(state) {
  return clone(state);
}

export function replaceEditorState(target, next) {
  const normalized = createEditorState(next);
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, normalized);
  return target;
}

export function markEditorChanged(state) {
  state.dirty = true;
  state.revision += 1;
  return state;
}

export function markEditorSaved(state) {
  state.dirty = false;
  return state;
}
