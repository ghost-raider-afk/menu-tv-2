import { normaliseEditorSettings } from './settings.js';

export function serializeDraft(editorState, screen = null) {
  return {
    rows: structuredClone(Array.isArray(editorState.rows) ? editorState.rows : []),
    settings: normaliseEditorSettings(editorState.settings || {}),
    template_id: editorState.templateId ?? null,
    revision: editorState.draftRevision,
    ...(screen ? { screen: structuredClone(screen) } : {})
  };
}
