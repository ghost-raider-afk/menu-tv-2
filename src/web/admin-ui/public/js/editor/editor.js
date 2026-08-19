import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { element, setMessage, setPending } from '../core/dom.js';
import { loadNotifications } from '../core/notifications.js';
import { createEditorState, markEditorSaved, replaceEditorState } from './state.js';
import { updateSettings } from './commands.js';
import { createEditorHistory } from './history.js';
import { normaliseEditorSettings } from './settings.js';
import { appendRow, renderRows } from './rows.js';
import { bindScreenProperties, bindSettingsProperties, readEditorSettings, readScreenProperties, syncDeliveryControls, writeEditorSettings, writeScreenProperties } from './properties.js';
import { applySelectedTemplate, populateTemplateSelect } from './templates.js';
import { renderPreview } from './preview.js';
import { serializeDraft } from './serializer.js';
import { renderFinalJpeg } from './final-image.js';

const EDITOR_LOADING_CONTROLS = Object.freeze([
  'editor-name',
  'editor-resolution',
  'editor-status',
  'editor-active',
  'editor-template',
  'editor-template-apply',
  'editor-background-color',
  'editor-accent-color',
  'editor-text-color',
  'editor-font-scale',
  'editor-font-scale-number',
  'editor-add-section',
  'editor-add-item',
  'editor-add-packaging',
  'editor-source-file',
  'editor-upload',
  'editor-publish',
  'editor-save'
]);

function editorScreenId() {
  const id = Number(new URLSearchParams(window.location.search).get('id'));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function setEditorMessage(message, kind = 'error') {
  setMessage('screen-editor-message', message, kind);
}

function setEditorLoading(form, loading) {
  form.setAttribute('aria-busy', loading ? 'true' : 'false');
  EDITOR_LOADING_CONTROLS.forEach((id) => {
    const control = element(id);
    if (control && 'disabled' in control) control.disabled = loading;
  });
}

function populateEditor(screen, templates, editorState) {
  writeScreenProperties(screen);
  writeEditorSettings(editorState.settings);
  populateTemplateSelect(templates, editorState);
  syncDeliveryControls(screen, editorState);
}

function setDirtyState(editorState) {
  const target = element('editor-dirty-state');
  if (!target) return;
  target.textContent = editorState.dirty
    ? 'Есть несохранённые изменения. Публикация заблокирована до сохранения.'
    : 'Все изменения сохранены.';
  target.classList.toggle('is-dirty', editorState.dirty);
}

function setFontScaleState(preview) {
  const target = element('editor-font-scale-effective');
  if (!target) return;
  const vertical = preview?.layout?.vertical;
  if (!vertical) {
    target.textContent = 'Фактический масштаб будет рассчитан после загрузки меню.';
    target.classList.remove('is-auto-reduced');
    return;
  }
  target.textContent = vertical.autoReduced
    ? `Задано ${vertical.requestedPercent}%, автоматически применено ${vertical.effectivePercent}% для вмещения всех строк.`
    : `Фактически: ${vertical.effectivePercent}%. Автоматическое уменьшение не требуется.`;
  target.classList.toggle('is-auto-reduced', vertical.autoReduced);
}

function setLayoutWarning(preview, screen) {
  const target = element('editor-layout-warning');
  if (!target) return;
  if (preview?.invalidResolution) {
    target.classList.remove('is-hidden');
    target.textContent = 'Укажите разрешение в формате 1920×1080.';
    return;
  }
  const overflowing = preview?.layout?.vertical?.fits === false;
  target.classList.toggle('is-hidden', !overflowing);
  target.textContent = overflowing
    ? `Меню не помещается в ${screen?.resolution || 'текущее разрешение'} даже при минимальном автоматическом масштабе. Сократите количество строк.`
    : '';
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

  setEditorLoading(form, true);

  const refreshPreview = (screenOverride = editorState.screen || screen) => renderPreview(editorState, {
    screen: screenOverride,
    products,
    packaging,
    target: previewTarget
  });

  const refreshEditorView = () => {
    const activeScreen = editorState.screen || screen;
    const preview = refreshPreview(activeScreen);
    setLayoutWarning(preview, activeScreen);
    setFontScaleState(preview);
    setDirtyState(editorState);
    syncDeliveryControls(screen || activeScreen, editorState);
    return preview;
  };

  const refreshRows = () => renderRows(editorState, {
    target: rowsTarget,
    empty: rowsEmpty,
    products,
    packaging,
    onChange: refreshEditorView
  });

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
      dirty: false,
      revision: 0,
      draftRevision: Number(editor.draft?.revision || 0)
    });
    history.clear();
    populateEditor(screen, templates, editorState);
    refreshRows();
    setEditorLoading(form, false);
    refreshEditorView();
  };
  void load().catch((error) => setEditorMessage(error.message));

  bindSettingsProperties(editorState, refreshEditorView);
  bindScreenProperties(editorState, refreshEditorView);
  element('editor-add-section')?.addEventListener('click', () => { history.checkpoint(); appendRow(editorState, 'section'); refreshRows(); refreshEditorView(); });
  element('editor-add-item')?.addEventListener('click', () => { history.checkpoint(); appendRow(editorState, 'item'); refreshRows(); refreshEditorView(); });
  element('editor-add-packaging')?.addEventListener('click', () => { history.checkpoint(); appendRow(editorState, 'packaging'); refreshRows(); refreshEditorView(); });
  element('editor-template-apply')?.addEventListener('click', () => {
    applySelectedTemplate(editorState, templates, {
      checkpoint: history.checkpoint,
      onApplied: () => { refreshRows(); refreshEditorView(); }
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = element('editor-save');
    setPending(submit, true, 'Сохраняем…');
    try {
      updateSettings(editorState, readEditorSettings(editorState.settings));
      const screenPayload = {
        ...readScreenProperties(editorState.screen || screen),
        template_id: editorState.templateId
      };
      const preview = refreshPreview(screenPayload);
      setLayoutWarning(preview, screenPayload);
      setFontScaleState(preview);
      if (preview?.invalidResolution) throw new Error('Укажите разрешение в формате 1920×1080.');
      if (!preview?.layout?.vertical?.fits) {
        throw new Error(`Меню не помещается в ${screenPayload.resolution} даже при минимальном автоматическом масштабе. Сократите количество строк.`);
      }

      const saved = await api.put(`${API.screens}/${screenId}/draft`, serializeDraft(editorState, screenPayload));
      replaceEditorState(editorState, {
        screen: saved.screen,
        rows: saved.draft.rows || [],
        settings: normaliseEditorSettings(saved.draft.settings || {}),
        templateId: saved.screen.template_id || null,
        dirty: false,
        revision: editorState.revision,
        draftRevision: Number(saved.draft.revision || 0)
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
      refreshEditorView();
      await loadNotifications();
      if (jpegPrepared) setEditorMessage('Монитор и меню сохранены. JPEG автоматически собран и подготовлен к публикации.', 'success');
      else setEditorMessage(`Меню сохранено, но автоматическая сборка JPEG не завершена: ${jpegError?.message || 'неизвестная ошибка'}. Можно использовать ручную загрузку JPEG после проверки.`, 'error');
    } catch (error) {
      setEditorMessage(error.message);
    } finally {
      setPending(submit, false, 'Сохраняем…');
    }
  });

  element('editor-upload')?.addEventListener('click', async () => {
    if (editorState.dirty) return setEditorMessage('Сначала сохраните изменения меню. Ручной JPEG должен соответствовать сохранённой версии.');
    const file = element('editor-source-file')?.files?.[0];
    if (!file) return setEditorMessage('Выберите JPEG-файл меню.');
    const button = element('editor-upload');
    setPending(button, true, 'Загружаем…');
    try {
      screen = await api.put(`${API.screens}/${screenId}/source`, file, { headers: { 'Content-Type': 'image/jpeg' } });
      editorState.screen = structuredClone(screen);
      populateEditor(screen, templates, editorState);
      refreshEditorView();
      setEditorMessage('JPEG подготовлен. После проверки опубликуйте его на телевизор.', 'success');
      await loadNotifications();
    } catch (error) {
      setEditorMessage(error.message);
    } finally {
      setPending(button, false, 'Загружаем…');
    }
  });

  element('editor-publish')?.addEventListener('click', async () => {
    if (editorState.dirty) return setEditorMessage('Сначала сохраните изменения. Нельзя публиковать JPEG от предыдущей версии меню.');
    const button = element('editor-publish');
    setPending(button, true, 'Публикуем…');
    try {
      screen = await api.post(`${API.screens}/${screenId}/publish`);
      editorState.screen = structuredClone(screen);
      populateEditor(screen, templates, editorState);
      refreshEditorView();
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
