import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { element, setMessage, clearMessage, setPending, makeButton, recordRow, refreshList } from '../core/dom.js';
import { loadNotifications } from '../core/notifications.js';
import { normaliseEditorSettings } from '../editor/settings.js';

const LAST_TEMPLATE_KEY = 'menu-tv-last-template-id';

async function loadTemplates() {
  state.templates = await api.get(API.templates);
  renderTemplates();
  return state.templates;
}
function rememberTemplate(id) { try { window.localStorage.setItem(LAST_TEMPLATE_KEY, String(id)); } catch { /* ignore */ } }
function lastTemplateId() { try { return Number(window.localStorage.getItem(LAST_TEMPLATE_KEY)) || null; } catch { return null; } }
function renderTemplates() {
  const list = document.querySelector('[data-templates-list]');
  const empty = document.querySelector('[data-templates-empty]');
  if (!list || !empty) return;
  const rows = state.templates.map((template) => {
    const settings = normaliseEditorSettings(template.settings || {});
    const background = settings.background_image_url ? 'с фоном' : 'стандартный фон';
    return recordRow(template.name, `${template.description || 'Без описания'} · ${template.active ? 'активен' : 'неактивен'} · ${background} · мониторов: ${template.assigned_screens || 0} · ${settings.font_scale === 'large' ? 'крупный текст' : settings.font_scale === 'small' ? 'компактный текст' : 'обычный текст'}`, [makeButton('Изменить', '', () => editTemplate(template)), makeButton('Удалить', 'danger', () => void deleteTemplate(template))]);
  });
  refreshList(list, empty, rows);
}
function renderTemplateBackground(settings = {}) {
  const normalized = normaliseEditorSettings(settings);
  const preview = element('template-background-preview');
  const status = element('template-background-status');
  const remove = element('template-background-remove');
  if (preview) {
    preview.style.backgroundColor = normalized.background_color;
    preview.style.backgroundImage = normalized.background_image_url ? `url("${normalized.background_image_url}")` : '';
    preview.classList.toggle('has-image', Boolean(normalized.background_image_url));
    const label = preview.querySelector('span');
    if (label) label.textContent = normalized.background_image_url ? 'Фон шаблона' : 'Стандартный фон';
  }
  if (status) status.textContent = normalized.background_image_url
    ? 'Фоновое изображение загружено и будет применяться вместе с шаблоном.'
    : (state.editingTemplateId ? 'Используется цвет фона.' : 'Для нового шаблона можно выбрать файл сейчас — он загрузится после создания.');
  if (remove instanceof HTMLButtonElement) remove.disabled = !state.editingTemplateId || !normalized.background_image_url;
}
function resetTemplateForm() {
  const form = element('template-form');
  if (!(form instanceof HTMLFormElement)) return;
  state.editingTemplateId = null;
  form.reset();
  element('template-active').checked = true;
  element('template-background-color').value = '#101828';
  element('template-accent-color').value = '#F4C915';
  element('template-text-color').value = '#F8FAFC';
  element('template-font-scale').value = 'medium';
  element('template-table-width').value = 'normal';
  element('template-menu-title').value = '';
  element('template-background-file').value = '';
  element('template-form-title').textContent = 'Новый шаблон';
  element('template-submit').textContent = 'Создать шаблон';
  element('cancel-template-edit')?.classList.add('is-hidden');
  renderTemplateBackground({ background_color: '#101828' });
  clearMessage('template-message');
}
function editTemplate(template) {
  state.editingTemplateId = template.id;
  rememberTemplate(template.id);
  element('template-name').value = template.name;
  element('template-description').value = template.description || '';
  element('template-active').checked = template.active;
  const settings = normaliseEditorSettings(template.settings || {});
  element('template-background-color').value = settings.background_color;
  element('template-accent-color').value = settings.accent_color;
  element('template-text-color').value = settings.text_color;
  element('template-font-scale').value = settings.font_scale;
  element('template-table-width').value = settings.table_width;
  element('template-menu-title').value = settings.title;
  element('template-background-file').value = '';
  element('template-form-title').textContent = 'Редактирование шаблона';
  element('template-submit').textContent = 'Сохранить шаблон';
  element('cancel-template-edit')?.classList.remove('is-hidden');
  renderTemplateBackground(settings);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function deleteTemplate(template) {
  if (!window.confirm(`Удалить шаблон «${template.name}»?`)) return;
  try {
    await api.delete(`${API.templates}/${template.id}`);
    if (state.editingTemplateId === template.id) resetTemplateForm();
    await loadTemplates();
  } catch (error) { setMessage('template-message', error.message); }
}
async function uploadBackground(templateId, file) {
  if (!file) throw new Error('Сначала выберите PNG, JPEG или WebP для фона.');
  return api.put(`${API.templates}/${templateId}/background`, file, { headers: { 'Content-Type': file.type || 'application/octet-stream' } });
}
async function refreshEditedTemplate(id) {
  await loadTemplates();
  const template = state.templates.find((item) => Number(item.id) === Number(id));
  if (template) editTemplate(template);
  return template;
}
export function initialiseTemplates() {
  const form = element('template-form');
  if (!(form instanceof HTMLFormElement)) return;
  renderTemplateBackground();
  void loadTemplates().then((templates) => {
    const requested = lastTemplateId();
    const template = templates.find((item) => Number(item.id) === requested) || templates.at(-1);
    if (template) editTemplate(template);
  }).catch((error) => setMessage('template-message', error.message));
  element('refresh-templates')?.addEventListener('click', () => { void loadTemplates(); });
  element('cancel-template-edit')?.addEventListener('click', resetTemplateForm);
  element('template-background-color')?.addEventListener('input', () => {
    const current = state.templates.find((item) => Number(item.id) === Number(state.editingTemplateId));
    renderTemplateBackground({ ...(current?.settings || {}), background_color: element('template-background-color').value });
  });
  element('template-background-file')?.addEventListener('change', () => {
    const file = element('template-background-file')?.files?.[0];
    const status = element('template-background-status');
    if (status && file) status.textContent = `Выбран файл: ${file.name}`;
  });
  element('template-background-upload')?.addEventListener('click', async () => {
    if (!state.editingTemplateId) return setMessage('template-message', 'Сначала создайте шаблон. Если файл уже выбран, он загрузится автоматически после создания.');
    const file = element('template-background-file')?.files?.[0];
    const button = element('template-background-upload');
    setPending(button, true, 'Загружаем…');
    try {
      await uploadBackground(state.editingTemplateId, file);
      await refreshEditedTemplate(state.editingTemplateId);
      await loadNotifications();
      setMessage('template-message', 'Фон шаблона загружен.', 'success');
    } catch (error) { setMessage('template-message', error.message); }
    finally { setPending(button, false, 'Загружаем…'); }
  });
  element('template-background-remove')?.addEventListener('click', async () => {
    if (!state.editingTemplateId) return;
    const button = element('template-background-remove');
    setPending(button, true, 'Удаляем…');
    try {
      await api.delete(`${API.templates}/${state.editingTemplateId}/background`);
      await refreshEditedTemplate(state.editingTemplateId);
      await loadNotifications();
      setMessage('template-message', 'Фон шаблона удалён.', 'success');
    } catch (error) { setMessage('template-message', error.message); }
    finally { setPending(button, false, 'Удаляем…'); }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = element('template-submit');
    const backgroundFile = element('template-background-file')?.files?.[0] || null;
    setPending(submit, true, 'Сохраняем…');
    try {
      const current = state.templates.find((item) => Number(item.id) === Number(state.editingTemplateId));
      const payload = {
        name: element('template-name').value,
        description: element('template-description').value,
        active: element('template-active').checked,
        settings: normaliseEditorSettings({
          ...(current?.settings || {}),
          background_color: element('template-background-color').value,
          accent_color: element('template-accent-color').value,
          text_color: element('template-text-color').value,
          font_scale: element('template-font-scale').value,
          table_width: element('template-table-width').value,
          title: element('template-menu-title').value.trim()
        })
      };
      let saved = state.editingTemplateId ? await api.put(`${API.templates}/${state.editingTemplateId}`, payload) : await api.post(API.templates, payload);
      if (backgroundFile) saved = await uploadBackground(saved.id, backgroundFile);
      rememberTemplate(saved.id);
      await refreshEditedTemplate(saved.id);
      await loadNotifications();
      setMessage('template-message', backgroundFile ? 'Шаблон и фон сохранены.' : 'Шаблон сохранён.', 'success');
    } catch (error) { setMessage('template-message', error.message); }
    finally { setPending(submit, false, 'Сохраняем…'); }
  });
}
