import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { element, setMessage, setPending } from '../core/dom.js';
import { loadNotifications } from '../core/notifications.js';
import { createEditorState, markEditorSaved, replaceEditorState } from './state.js';
import { updateSettings } from './commands.js';
import { createEditorHistory } from './history.js';
import { normaliseEditorSettings } from './settings.js';
import { appendRow, renderRows } from './rows.js';
import { bindSettingsProperties, readEditorSettings, readScreenProperties, writeEditorSettings, writeScreenProperties } from './properties.js';
import { applySelectedTemplate, populateTemplateSelect } from './templates.js';
import { renderPreview } from './preview.js';
import { serializeDraft } from './serializer.js';
import { renderFinalJpeg } from './final-image.js';

function editorScreenId() {
  const id = Number(new URLSearchParams(window.location.search).get('id'));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function setEditorMessage(message, kind = 'error') {
  setMessage('screen-editor-message', message, kind);
}

function populateEditor(screen, templates, editorState) {
  writeScreenProperties(screen);
  writeEditorSettings(editorState.settings);
  populateTemplateSelect(templates, editorState);
}

export function initialiseScreenEditor() {
  const form = element('screen-editor-form');
  const screenId = editorScreenId();
  if (!(form instanceof HTMLFormElement) || !screenId) {
    window.location.replace('/screens.html');
    return;
  }

  const editorState = createEditorState();
  const history = createEditorHistory(editorState);
  let screen = null;
  let templates = [];
  let products = [];
  let packaging = [];

  const previewTarget = element('editor-menu-preview');
  const rowsTarget = element('editor-menu-rows');
  const rowsEmpty = element('editor-menu-empty');
  const refreshPreview = () => renderPreview(editorState, { screen, products, packaging, target: previewTarget });
  const refreshRows = () => renderRows(editorState, { target: rowsTarget, empty: rowsEmpty, products, packaging, onChange: refreshPreview });

  const load = async () => {
    const editor = await api.get(`${API.screens}/${screenId}/editor`);
    screen = editor.screen;
    templates = editor.templates;
    products = editor.products;
    packaging = editor.packaging;
    replaceEditorState(editorState, {
      screen,
      rows: Array.isArray(editor.draft?.rows) ? editor.draft.rows : [],
      settings: normaliseEditorSettings(editor.draft?.settings || {}),
      templateId: screen.template_id || null,
      dirty: false
    });
    history.clear();
    populateEditor(screen, templates, editorState);
    refreshRows();
    refreshPreview();
  };
  void load().catch((error) => setEditorMessage(error.message));

  bindSettingsProperties(editorState, refreshPreview);
  element('editor-add-section')?.addEventListener('click', () => { history.checkpoint(); appendRow(editorState, 'section'); refreshRows(); refreshPreview(); });
  element('editor-add-item')?.addEventListener('click', () => { history.checkpoint(); appendRow(editorState, 'item'); refreshRows(); refreshPreview(); });
  element('editor-add-packaging')?.addEventListener('click', () => { history.checkpoint(); appendRow(editorState, 'packaging'); refreshRows(); refreshPreview(); });
  element('editor-template-apply')?.addEventListener('click', () => {
    applySelectedTemplate(editorState, templates, {
      checkpoint: history.checkpoint,
      onApplied: () => { refreshRows(); refreshPreview(); }
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = element('editor-save');
    setPending(submit, true, 'Сохраняем…');
    try {
      updateSettings(editorState, readEditorSettings(editorState.settings));
      screen = await api.put(`${API.screens}/${screenId}`, {
        ...readScreenProperties(screen),
        template_id: editorState.templateId
      });
      const saved = await api.put(`${API.screens}/${screenId}/draft`, serializeDraft(editorState));
      replaceEditorState(editorState, {
        screen: saved.screen,
        rows: saved.draft.rows || [],
        settings: normaliseEditorSettings(saved.draft.settings || {}),
        templateId: saved.screen.template_id || null,
        dirty: false,
        revision: editorState.revision
      });
      screen = saved.screen;
      markEditorSaved(editorState);
      history.clear();

      let jpegPrepared = false;
      let jpegError = null;
      try {
        const jpeg = await renderFinalJpeg(editorState, { screen, products, packaging });
        screen = await api.put(`${API.screens}/${screenId}/source`, jpeg, { headers: { 'Content-Type': 'image/jpeg' } });
        editorState.screen = structuredClone(screen);
        jpegPrepared = true;
      } catch (error) {
        jpegError = error;
      }

      populateEditor(screen, templates, editorState);
      refreshRows();
      refreshPreview();
      await loadNotifications();
      if (jpegPrepared) setEditorMessage('Монитор и меню сохранены. JPEG автоматически собран и подготовлен к публикации.', 'success');
      else setEditorMessage(`Меню сохранено, но автоматическая сборка JPEG не завершена: ${jpegError?.message || 'неизвестная ошибка'}. Можно использовать ручную загрузку JPEG.`, 'error');
    } catch (error) {
      setEditorMessage(error.message);
    } finally {
      setPending(submit, false, 'Сохраняем…');
    }
  });

  element('editor-upload')?.addEventListener('click', async () => {
    const file = element('editor-source-file')?.files?.[0];
    if (!file) return setEditorMessage('Выберите JPEG-файл меню.');
    const button = element('editor-upload');
    setPending(button, true, 'Загружаем…');
    try {
      screen = await api.put(`${API.screens}/${screenId}/source`, file, { headers: { 'Content-Type': 'image/jpeg' } });
      editorState.screen = structuredClone(screen);
      populateEditor(screen, templates, editorState);
      setEditorMessage('JPEG подготовлен. После проверки опубликуйте его на телевизор.', 'success');
      await loadNotifications();
    } catch (error) {
      setEditorMessage(error.message);
    } finally {
      setPending(button, false, 'Загружаем…');
    }
  });

  element('editor-publish')?.addEventListener('click', async () => {
    const button = element('editor-publish');
    setPending(button, true, 'Публикуем…');
    try {
      screen = await api.post(`${API.screens}/${screenId}/publish`);
      editorState.screen = structuredClone(screen);
      populateEditor(screen, templates, editorState);
      setEditorMessage('JPEG опубликован в папке SFTP торговой точки.', 'success');
      await loadNotifications();
    } catch (error) {
      setEditorMessage(error.message);
    } finally {
      setPending(button, false, 'Публикуем…');
    }
  });

  window.addEventListener('beforeunload', (event) => {
    if (!editorState.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
}
