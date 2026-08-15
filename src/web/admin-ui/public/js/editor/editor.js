import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { element, setMessage, setPending } from '../core/dom.js';
import { loadNotifications } from '../core/notifications.js';
import { createEditorState, markEditorChanged, markEditorSaved, replaceEditorState } from './state.js';
import { applyTemplate, updateSettings } from './commands.js';
import { normaliseEditorSettings } from './settings.js';
import { appendRow, renderRows } from './rows.js';
import { renderPreview } from './preview.js';
import { serializeDraft } from './serializer.js';
import { renderFinalJpeg } from './final-image.js';

function editorScreenId() { const id = Number(new URLSearchParams(window.location.search).get('id')); return Number.isInteger(id) && id > 0 ? id : null; }
function setEditorMessage(message, kind = 'error') { setMessage('screen-editor-message', message, kind); }
function settingsFromForm() { return normaliseEditorSettings({ background_color: element('editor-background-color').value, accent_color: element('editor-accent-color').value, text_color: element('editor-text-color').value, font_scale: element('editor-font-scale').value, table_width: element('editor-table-width').value, title: element('editor-menu-title').value.trim() }); }
function applySettingsToForm(settings) { const normalized = normaliseEditorSettings(settings); element('editor-background-color').value = normalized.background_color; element('editor-accent-color').value = normalized.accent_color; element('editor-text-color').value = normalized.text_color; element('editor-font-scale').value = normalized.font_scale; element('editor-table-width').value = normalized.table_width; element('editor-menu-title').value = normalized.title; }
function populateScreenEditor(screen, templates, editorState) {
  element('editor-location').value = screen.location_name; element('editor-name').value = screen.name; element('editor-resolution').value = screen.resolution; element('editor-status').value = screen.status === 'published' ? 'ready' : screen.status; element('editor-active').checked = screen.active !== false; element('editor-sftp-path').textContent = screen.sftp_path || 'Для точки ещё не настроен SFTP-каталог';
  const select = element('editor-template'); select.replaceChildren(new Option('Без шаблона', ''), ...templates.filter((template) => template.active || Number(template.id) === Number(editorState.templateId)).map((template) => new Option(template.name, String(template.id)))); select.value = editorState.templateId ? String(editorState.templateId) : '';
  const currentTemplate = templates.find((template) => Number(template.id) === Number(editorState.templateId)); element('editor-template-current').textContent = currentTemplate?.name || 'Без шаблона'; applySettingsToForm(editorState.settings); element('editor-publish').disabled = !screen.prepared_asset_key || !screen.sftp_directory_name;
}

export function initialiseScreenEditor() {
  const form = element('screen-editor-form'); const screenId = editorScreenId(); if (!(form instanceof HTMLFormElement) || !screenId) { window.location.replace('/screens.html'); return; }
  const editorState = createEditorState(); let screen = null; let templates = []; let products = []; let packaging = [];
  const previewTarget = element('editor-menu-preview'); const rowsTarget = element('editor-menu-rows'); const rowsEmpty = element('editor-menu-empty');
  const refreshPreview = () => renderPreview(editorState, { screen, products, packaging, target: previewTarget });
  const refreshRows = () => renderRows(editorState, { target: rowsTarget, empty: rowsEmpty, products, packaging, onChange: refreshPreview });
  const load = async () => { const editor = await api.get(`${API.screens}/${screenId}/editor`); screen = editor.screen; templates = editor.templates; products = editor.products; packaging = editor.packaging; replaceEditorState(editorState, { screen, rows: Array.isArray(editor.draft?.rows) ? editor.draft.rows : [], settings: normaliseEditorSettings(editor.draft?.settings || {}), templateId: screen.template_id || null, dirty: false }); populateScreenEditor(screen, templates, editorState); refreshRows(); refreshPreview(); };
  void load().catch((error) => setEditorMessage(error.message));

  ['editor-background-color','editor-accent-color','editor-text-color','editor-font-scale','editor-table-width','editor-menu-title'].forEach((id) => element(id)?.addEventListener('input', () => { updateSettings(editorState, settingsFromForm()); refreshPreview(); }));
  element('editor-add-section')?.addEventListener('click', () => { appendRow(editorState, 'section'); refreshRows(); refreshPreview(); });
  element('editor-add-item')?.addEventListener('click', () => { appendRow(editorState, 'item'); refreshRows(); refreshPreview(); });
  element('editor-add-packaging')?.addEventListener('click', () => { appendRow(editorState, 'packaging'); refreshRows(); refreshPreview(); });
  element('editor-template-apply')?.addEventListener('click', () => { const selected = Number(element('editor-template').value) || null; const template = templates.find((item) => Number(item.id) === selected); if (template) { applyTemplate(editorState, { ...template, rows: Array.isArray(template.rows) ? template.rows : [], settings: normaliseEditorSettings(template.settings || {}) }); applySettingsToForm(editorState.settings); refreshRows(); refreshPreview(); element('editor-template-current').textContent = template.name; setEditorMessage(`Шаблон «${template.name}» применён только к локальному черновику. Нажмите «Сохранить», чтобы записать изменения.`, 'success'); return; } editorState.templateId = null; markEditorChanged(editorState); element('editor-template-current').textContent = 'Без шаблона'; setEditorMessage('Шаблон отключён только в локальном черновике. Нажмите «Сохранить», чтобы записать изменение.', 'success'); });

  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const submit = element('editor-save'); setPending(submit, true, 'Сохраняем…');
    try {
      updateSettings(editorState, settingsFromForm());
      screen = await api.put(`${API.screens}/${screenId}`, { location_id: screen.location_id, name: element('editor-name').value, resolution: element('editor-resolution').value, status: element('editor-status').value, active: element('editor-active').checked, template_id: editorState.templateId });
      const saved = await api.put(`${API.screens}/${screenId}/draft`, serializeDraft(editorState));
      editorState.rows = structuredClone(saved.draft.rows || []); editorState.settings = normaliseEditorSettings(saved.draft.settings || {}); editorState.templateId = saved.screen.template_id || null; screen = saved.screen; editorState.screen = structuredClone(screen); markEditorSaved(editorState);
      let jpegPrepared = false; let jpegError = null;
      try { const jpeg = await renderFinalJpeg(editorState, { screen, products, packaging }); screen = await api.put(`${API.screens}/${screenId}/source`, jpeg, { headers: { 'Content-Type': 'image/jpeg' } }); editorState.screen = structuredClone(screen); jpegPrepared = true; } catch (error) { jpegError = error; }
      populateScreenEditor(screen, templates, editorState); refreshRows(); refreshPreview(); await loadNotifications();
      if (jpegPrepared) setEditorMessage('Монитор и меню сохранены. JPEG автоматически собран и подготовлен к публикации.', 'success'); else setEditorMessage(`Меню сохранено, но автоматическая сборка JPEG не завершена: ${jpegError?.message || 'неизвестная ошибка'}. Можно использовать ручную загрузку JPEG.`, 'error');
    } catch (error) { setEditorMessage(error.message); }
    finally { setPending(submit, false, 'Сохраняем…'); }
  });

  element('editor-upload')?.addEventListener('click', async () => { const file = element('editor-source-file')?.files?.[0]; if (!file) return setEditorMessage('Выберите JPEG-файл меню.'); const button = element('editor-upload'); setPending(button, true, 'Загружаем…'); try { screen = await api.put(`${API.screens}/${screenId}/source`, file, { headers: { 'Content-Type': 'image/jpeg' } }); editorState.screen = structuredClone(screen); populateScreenEditor(screen, templates, editorState); setEditorMessage('JPEG подготовлен. После проверки опубликуйте его на телевизор.', 'success'); await loadNotifications(); } catch (error) { setEditorMessage(error.message); } finally { setPending(button, false, 'Загружаем…'); } });
  element('editor-publish')?.addEventListener('click', async () => { const button = element('editor-publish'); setPending(button, true, 'Публикуем…'); try { screen = await api.post(`${API.screens}/${screenId}/publish`); editorState.screen = structuredClone(screen); populateScreenEditor(screen, templates, editorState); setEditorMessage('JPEG опубликован в папке SFTP торговой точки.', 'success'); await loadNotifications(); } catch (error) { setEditorMessage(error.message); } finally { setPending(button, false, 'Публикуем…'); } });
  window.addEventListener('beforeunload', (event) => { if (!editorState.dirty) return; event.preventDefault(); event.returnValue = ''; });
}
