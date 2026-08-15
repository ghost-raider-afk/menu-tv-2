import { normaliseEditorSettings } from './settings.js';

export function serializeDraft(editorState) {
  return {
    rows: structuredClone(Array.isArray(editorState.rows) ? editorState.rows : []),
    settings: normaliseEditorSettings(editorState.settings || {}),
    template_id: editorState.templateId ?? null
  };
}
