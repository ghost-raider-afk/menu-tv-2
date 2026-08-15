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
  const rows = state.templates.map((template) => recordRow(template.name, `${template.description || 'Без описания'} · ${template.active ? 'активен' : 'неактивен'} · мониторов: ${template.assigned_screens || 0} · ${template.settings?.font_scale === 'large' ? 'крупный текст' : template.settings?.font_scale === 'small' ? 'компактный текст' : 'обычный текст'}`, [makeButton('Изменить', '', () => editTemplate(template)), makeButton('Удалить', 'danger', () => void deleteTemplate(template))]));
  refreshList(list, empty, rows);
}
function resetTemplateForm() {
  const form = element('template-form');
  if (!(form instanceof HTMLFormElement)) return;
  state.editingTemplateId = null;
  form.reset();
  element('template-active').checked = true;
  element('template-background-color').value = '#101828';
  element('template-accent-color').value = '#2563EB';
  element('template-text-color').value = '#F8FAFC';
  element('template-font-scale').value = 'medium';
  element('template-table-width').value = 'normal';
  element('template-menu-title').value = '';
  element('template-form-title').textContent = 'Новый шаблон';
  element('template-submit').textContent = 'Создать шаблон';
  element('cancel-template-edit')?.classList.add('is-hidden');
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
  element('template-form-title').textContent = 'Редактирование шаблона';
  element('template-submit').textContent = 'Сохранить шаблон';
  element('cancel-template-edit')?.classList.remove('is-hidden');
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
export function initialiseTemplates() {
  const form = element('template-form');
  if (!(form instanceof HTMLFormElement)) return;
  void loadTemplates().then((templates) => {
    const requested = lastTemplateId();
    const template = templates.find((item) => Number(item.id) === requested) || templates.at(-1);
    if (template) editTemplate(template);
  }).catch((error) => setMessage('template-message', error.message));
  element('refresh-templates')?.addEventListener('click', () => { void loadTemplates(); });
  element('cancel-template-edit')?.addEventListener('click', resetTemplateForm);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = element('template-submit');
    setPending(submit, true, 'Сохраняем…');
    try {
      const payload = { name: element('template-name').value, description: element('template-description').value, active: element('template-active').checked, settings: normaliseEditorSettings({ background_color: element('template-background-color').value, accent_color: element('template-accent-color').value, text_color: element('template-text-color').value, font_scale: element('template-font-scale').value, table_width: element('template-table-width').value, title: element('template-menu-title').value.trim() }) };
      const saved = state.editingTemplateId ? await api.put(`${API.templates}/${state.editingTemplateId}`, payload) : await api.post(API.templates, payload);
      rememberTemplate(saved.id);
      await loadTemplates();
      editTemplate(state.templates.find((item) => item.id === saved.id) || saved);
      await loadNotifications();
      setMessage('template-message', 'Шаблон сохранён.', 'success');
    } catch (error) { setMessage('template-message', error.message); }
    finally { setPending(submit, false, 'Сохраняем…'); }
  });
}
