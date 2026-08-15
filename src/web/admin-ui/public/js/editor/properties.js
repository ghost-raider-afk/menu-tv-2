import { element } from '../core/dom.js';
import { updateSettings } from './commands.js';
import { normaliseEditorSettings } from './settings.js';

const SETTINGS_INPUTS = Object.freeze([
  'editor-background-color',
  'editor-accent-color',
  'editor-text-color',
  'editor-font-scale',
  'editor-table-width',
  'editor-menu-title'
]);

export function readEditorSettings(baseSettings = {}) {
  return normaliseEditorSettings({
    ...baseSettings,
    background_color: element('editor-background-color').value,
    accent_color: element('editor-accent-color').value,
    text_color: element('editor-text-color').value,
    font_scale: element('editor-font-scale').value,
    table_width: element('editor-table-width').value,
    title: element('editor-menu-title').value.trim()
  });
}

export function writeEditorSettings(settings) {
  const normalized = normaliseEditorSettings(settings);
  element('editor-background-color').value = normalized.background_color;
  element('editor-accent-color').value = normalized.accent_color;
  element('editor-text-color').value = normalized.text_color;
  element('editor-font-scale').value = normalized.font_scale;
  element('editor-table-width').value = normalized.table_width;
  element('editor-menu-title').value = normalized.title;
  return normalized;
}

export function writeScreenProperties(screen) {
  element('editor-location').value = screen.location_name || '';
  element('editor-name').value = screen.name || '';
  element('editor-resolution').value = screen.resolution || '';
  element('editor-status').value = screen.status === 'published' ? 'ready' : screen.status;
  element('editor-active').checked = screen.active !== false;
  element('editor-sftp-path').textContent = screen.sftp_path || 'Для точки ещё не настроен SFTP-каталог';
  element('editor-publish').disabled = !screen.prepared_asset_key || !screen.sftp_directory_name;
}

export function readScreenProperties(screen) {
  return {
    location_id: screen.location_id,
    name: element('editor-name').value,
    resolution: element('editor-resolution').value,
    status: element('editor-status').value,
    active: element('editor-active').checked
  };
}

export function bindSettingsProperties(editorState, onChange) {
  SETTINGS_INPUTS.forEach((id) => element(id)?.addEventListener('input', () => {
    updateSettings(editorState, readEditorSettings(editorState.settings));
    onChange?.();
  }));
}
