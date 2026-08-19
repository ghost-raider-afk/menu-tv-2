import { element } from '../core/dom.js';
import { updateScreen, updateSettings } from './commands.js';
import { normaliseEditorSettings } from './settings.js';

const SETTINGS_INPUTS = Object.freeze([
  'editor-background-color',
  'editor-accent-color',
  'editor-text-color'
]);

const SCREEN_INPUTS = Object.freeze([
  'editor-name',
  'editor-resolution',
  'editor-status',
  'editor-active'
]);

function fontScaleValue() {
  const number = element('editor-font-scale-number');
  const range = element('editor-font-scale');
  return number?.value || range?.value || '100';
}

function syncFontScaleInputs(value) {
  const normalized = normaliseEditorSettings({ font_scale_percent: value }).font_scale_percent;
  const number = element('editor-font-scale-number');
  const range = element('editor-font-scale');
  if (number instanceof HTMLInputElement) number.value = String(normalized);
  if (range instanceof HTMLInputElement) range.value = String(normalized);
  return normalized;
}

export function readEditorSettings(baseSettings = {}) {
  return normaliseEditorSettings({
    ...baseSettings,
    background_color: element('editor-background-color').value,
    accent_color: element('editor-accent-color').value,
    text_color: element('editor-text-color').value,
    font_scale_percent: fontScaleValue()
  });
}

export function writeEditorSettings(settings) {
  const normalized = normaliseEditorSettings(settings);
  element('editor-background-color').value = normalized.background_color;
  element('editor-accent-color').value = normalized.accent_color;
  element('editor-text-color').value = normalized.text_color;
  syncFontScaleInputs(normalized.font_scale_percent);
  return normalized;
}

export function writeScreenProperties(screen) {
  element('editor-location').value = screen.location_name || '';
  element('editor-name').value = screen.name || '';
  element('editor-resolution').value = screen.resolution || '';
  element('editor-status').value = screen.status === 'published' ? 'ready' : screen.status;
  element('editor-active').checked = screen.active !== false;
  element('editor-sftp-path').textContent = screen.sftp_path || 'Для точки ещё не настроен SFTP-каталог';
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

export function syncDeliveryControls(screen, editorState) {
  const dirty = editorState?.dirty === true;
  const publish = element('editor-publish');
  const upload = element('editor-upload');
  const source = element('editor-source-file');
  if (publish instanceof HTMLButtonElement) publish.disabled = dirty || !screen?.prepared_asset_key || !screen?.sftp_directory_name;
  if (upload instanceof HTMLButtonElement) upload.disabled = dirty;
  if (source instanceof HTMLInputElement) source.disabled = dirty;
}

export function bindSettingsProperties(editorState, onChange) {
  const apply = () => {
    updateSettings(editorState, readEditorSettings(editorState.settings));
    onChange?.();
  };
  SETTINGS_INPUTS.forEach((id) => element(id)?.addEventListener('input', apply));

  const range = element('editor-font-scale');
  const number = element('editor-font-scale-number');
  range?.addEventListener('input', () => {
    syncFontScaleInputs(range.value);
    apply();
  });
  number?.addEventListener('input', () => {
    syncFontScaleInputs(number.value);
    apply();
  });
}

export function bindScreenProperties(editorState, onChange) {
  SCREEN_INPUTS.forEach((id) => {
    const target = element(id);
    const eventName = target instanceof HTMLSelectElement || target?.type === 'checkbox' ? 'change' : 'input';
    target?.addEventListener(eventName, () => {
      updateScreen(editorState, readScreenProperties(editorState.screen || {}));
      onChange?.();
    });
  });
}
