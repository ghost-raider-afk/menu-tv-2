import { element, setMessage } from '../core/dom.js';
import { applyTemplate } from './commands.js';
import { markEditorChanged } from './state.js';
import { normaliseEditorSettings } from './settings.js';
import { writeEditorSettings } from './properties.js';

function templateById(templates, id) {
  return templates.find((item) => Number(item.id) === Number(id));
}

export function populateTemplateSelect(templates, editorState) {
  const select = element('editor-template');
  if (!(select instanceof HTMLSelectElement)) return;
  select.replaceChildren(
    new Option('Без шаблона', ''),
    ...templates
      .filter((template) => template.active || Number(template.id) === Number(editorState.templateId))
      .map((template) => new Option(template.name, String(template.id)))
  );
  select.value = editorState.templateId ? String(editorState.templateId) : '';
  updateCurrentTemplateLabel(templates, editorState.templateId);
}

export function updateCurrentTemplateLabel(templates, templateId) {
  const current = templateById(templates, templateId);
  const label = element('editor-template-current');
  if (label) label.textContent = current?.name || 'Без шаблона';
}

export function applySelectedTemplate(editorState, templates, { checkpoint, onApplied } = {}) {
  const selected = Number(element('editor-template')?.value) || null;
  checkpoint?.();
  if (!selected) {
    editorState.templateId = null;
    markEditorChanged(editorState);
    updateCurrentTemplateLabel(templates, null);
    setMessage('screen-editor-message', 'Шаблон отключён только в локальном черновике. Нажмите «Сохранить», чтобы записать изменение.', 'success');
    onApplied?.();
    return null;
  }

  const template = templateById(templates, selected);
  if (!template) return null;
  applyTemplate(editorState, {
    ...template,
    rows: Array.isArray(template.rows) ? template.rows : [],
    settings: normaliseEditorSettings(template.settings || {})
  });
  writeEditorSettings(editorState.settings);
  updateCurrentTemplateLabel(templates, editorState.templateId);
  setMessage('screen-editor-message', `Шаблон «${template.name}» применён только к локальному черновику. Нажмите «Сохранить», чтобы записать изменения.`, 'success');
  onApplied?.();
  return template;
}
