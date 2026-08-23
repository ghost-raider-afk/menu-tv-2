import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { element, setMessage, clearMessage, setPending, makeButton, recordRow, refreshList, price } from '../core/dom.js';
import { loadNotifications } from '../core/notifications.js';

const IMPORT_STATUS_LABELS = Object.freeze({ new: 'Новая', changed: 'Изменена', unchanged: 'Без изменений', error: 'Ошибка', excluded: 'Исключена' });
const IMPORT_FIELDS = Object.freeze(['id', 'name', 'producer', 'characteristics', 'strength', 'price_primary', 'alcoholic', 'beverage_color', 'filtration', 'active']);
let importPreview = null;
let importValidationTimer = null;
let importEditRevision = 0;
let importValidationSequence = 0;

function normalizedQuery(id) {
  return String(element(id)?.value || '').trim().toLocaleLowerCase('ru-RU');
}

function matchesQuery(values, query) {
  if (!query) return true;
  return values.some((value) => String(value || '').toLocaleLowerCase('ru-RU').includes(query));
}

async function loadCatalog() {
  const [products, packaging] = await Promise.all([api.get(API.products), api.get(API.packaging)]);
  state.products = products;
  state.packaging = packaging;
  renderCatalogProducts();
  renderCatalogPackaging();
}

function renderCatalogProducts() {
  const list = document.querySelector('[data-products-list]');
  const empty = document.querySelector('[data-products-empty]');
  if (!list || !empty) return;
  const query = normalizedQuery('product-filter');
  const products = state.products.filter((product) => matchesQuery([
    product.name, product.producer, product.characteristics, product.strength
  ], query));
  const rows = products.map((product) => recordRow(
    product.name,
    [product.producer || 'Производитель не указан', product.characteristics || product.strength || 'Без характеристик', `1 л: ${price(product.price_primary)} · 1,5 л: ${price(product.price_secondary)}`, product.active ? 'активна' : 'скрыта'].join(' · '),
    [makeButton('Изменить', '', () => editProduct(product)), makeButton('Удалить', 'danger', () => void deleteProduct(product))]
  ));
  empty.textContent = query && state.products.length ? 'По запросу ничего не найдено.' : 'Продукции пока нет.';
  refreshList(list, empty, rows);
}

function renderCatalogPackaging() {
  const list = document.querySelector('[data-packaging-list]');
  const empty = document.querySelector('[data-packaging-empty]');
  if (!list || !empty) return;
  const query = normalizedQuery('packaging-filter');
  const packaging = state.packaging.filter((item) => matchesQuery([item.name], query));
  const rows = packaging.map((item) => recordRow(item.name, `${price(item.unit_price)} · ${item.active ? 'активна' : 'скрыта'}`, [makeButton('Изменить', '', () => editPackaging(item)), makeButton('Удалить', 'danger', () => void deletePackaging(item))]));
  empty.textContent = query && state.packaging.length ? 'По запросу ничего не найдено.' : 'Тара пока не добавлена.';
  refreshList(list, empty, rows);
}

function resetProductForm() {
  const form = element('product-form');
  if (!(form instanceof HTMLFormElement)) return;
  state.editingProductId = null;
  form.reset();
  element('product-active').checked = true;
  element('product-alcoholic').checked = false;
  element('product-beverage-color').value = 'none';
  element('product-filtration').value = 'none';
  element('product-form-title').textContent = 'Новая продукция';
  element('product-submit').textContent = 'Добавить продукцию';
  element('cancel-product-edit')?.classList.add('is-hidden');
  clearMessage('product-message');
}

function editProduct(product) {
  state.editingProductId = product.id;
  element('product-name').value = product.name;
  element('product-producer').value = product.producer || '';
  element('product-characteristics').value = product.characteristics || '';
  element('product-strength').value = product.strength || '';
  element('product-price-primary').value = product.price_primary || '';
  element('product-alcoholic').checked = product.alcoholic === true;
  element('product-beverage-color').value = product.beverage_color || 'none';
  element('product-filtration').value = product.filtration || 'none';
  element('product-active').checked = product.active !== false;
  element('product-form-title').textContent = 'Редактирование продукции';
  element('product-submit').textContent = 'Сохранить продукцию';
  element('cancel-product-edit')?.classList.remove('is-hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteProduct(product) {
  if (!window.confirm(`Удалить продукцию «${product.name}»?`)) return;
  try { await api.delete(`${API.products}/${product.id}`); await loadCatalog(); }
  catch (error) { setMessage('product-message', error.message); }
}

function downloadCsv(csv) {
  const content = csv.startsWith('\uFEFF') ? csv : `\uFEFF${csv}`;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'products.csv';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function exportProducts() {
  const button = element('product-export');
  setPending(button, true, 'Выгружаем…');
  clearMessage('product-message');
  try {
    const csv = await api.get(API.productsExport);
    downloadCsv(csv);
    setMessage('product-message', `CSV выгружен. Записей: ${state.products.length}.`, 'success');
  } catch (error) {
    setMessage('product-message', error.message);
  } finally {
    setPending(button, false, 'Выгружаем…');
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function importDisplayValue(field, value) {
  if (field === 'alcoholic' || field === 'active') return value === true ? 'да' : value === false ? 'нет' : String(value ?? '');
  if (field === 'beverage_color') return ({ none: 'не указан', light: 'светлый', dark: 'тёмный', white: 'белое', semi_dark: 'полутёмное', amber: 'янтарное', red: 'красное' })[value] || String(value ?? '');
  if (field === 'filtration') return ({ none: 'не указана', filtered: 'фильтрованное', unfiltered: 'нефильтрованное' })[value] || String(value ?? '');
  return String(value ?? '');
}

function importError(row, field) {
  return row.errors?.find((item) => item.field === field) || null;
}

function importChange(row, field) {
  return row.changes?.find((item) => item.field === field) || null;
}

function importHintMarkup(row, field) {
  const error = importError(row, field);
  if (error) return `<small class="catalog-import-error">${escapeHtml(error.message)}</small>`;
  const change = importChange(row, field);
  if (!change) return '';
  return `<small class="catalog-import-change">${escapeHtml(importDisplayValue(field, change.before))} → ${escapeHtml(importDisplayValue(field, change.after))}</small>`;
}

function importTextCell(row, field, { max = 180, inputmode = '' } = {}) {
  const error = importError(row, field);
  const value = row.values?.[field] ?? '';
  return `<td class="catalog-import-edit-cell${error ? ' has-error' : ''}"><input data-import-field="${field}" value="${escapeHtml(value)}" maxlength="${max}"${inputmode ? ` inputmode="${inputmode}"` : ''} ${row.excluded ? 'disabled' : ''}/>${importHintMarkup(row, field)}</td>`;
}

function selectOptions(current, options) {
  const source = String(current ?? '');
  const known = options.some(([value]) => String(value) === source);
  const all = known || source === '' ? options : [[source, `${source} — исправьте`], ...options];
  return all.map(([value, label]) => `<option value="${escapeHtml(value)}"${String(value) === source ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('');
}

function importSelectCell(row, field, options) {
  const error = importError(row, field);
  const value = row.values?.[field];
  return `<td class="catalog-import-edit-cell${error ? ' has-error' : ''}"><select data-import-field="${field}" ${row.excluded ? 'disabled' : ''}>${selectOptions(value, options)}</select>${importHintMarkup(row, field)}</td>`;
}

function importStatusMarkup(row) {
  const rowError = row.errors?.find((item) => item.field === '_row');
  return `<td class="catalog-import-status-cell"><span class="catalog-import-status is-${row.status}">${escapeHtml(IMPORT_STATUS_LABELS[row.status] || row.status)}</span><small>Строка ${row.line}</small>${rowError ? `<small class="catalog-import-error">${escapeHtml(rowError.message)}</small>` : ''}</td>`;
}

function importRowMarkup(row) {
  const secondary = row.normalized?.price_secondary || '—';
  return `<tr data-import-key="${escapeHtml(row.key)}" class="is-${row.status}${row.excluded ? ' is-excluded' : ''}">
    ${importStatusMarkup(row)}
    ${importTextCell(row, 'id', { max: 20, inputmode: 'numeric' })}
    ${importTextCell(row, 'name', { max: 120 })}
    ${importTextCell(row, 'producer', { max: 120 })}
    ${importTextCell(row, 'characteristics', { max: 180 })}
    ${importTextCell(row, 'strength', { max: 20 })}
    ${importTextCell(row, 'price_primary', { max: 16, inputmode: 'decimal' })}
    <td class="catalog-import-calculated">${escapeHtml(secondary)}</td>
    ${importSelectCell(row, 'alcoholic', [['false', 'нет'], ['true', 'да']])}
    ${importSelectCell(row, 'beverage_color', [['none', 'не указан'], ['light', 'светлый'], ['dark', 'тёмный'], ['white', 'белое'], ['semi_dark', 'полутёмное'], ['amber', 'янтарное'], ['red', 'красное']])}
    ${importSelectCell(row, 'filtration', [['none', 'не указана'], ['filtered', 'фильтрованное'], ['unfiltered', 'нефильтрованное']])}
    ${importSelectCell(row, 'active', [['true', 'да'], ['false', 'нет']])}
    <td class="catalog-import-exclude"><label><input type="checkbox" data-import-excluded ${row.excluded ? 'checked' : ''}/><span>${row.excluded ? 'Не импортировать' : 'Импортировать'}</span></label></td>
  </tr>`;
}

function focusSnapshot() {
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement || active instanceof HTMLSelectElement)) return null;
  const row = active.closest('[data-import-key]');
  const field = active.dataset.importField;
  if (!row || !field) return null;
  return {
    key: row.dataset.importKey,
    field,
    start: active instanceof HTMLInputElement ? active.selectionStart : null,
    end: active instanceof HTMLInputElement ? active.selectionEnd : null
  };
}

function restoreFocus(snapshot) {
  if (!snapshot) return;
  const row = [...document.querySelectorAll('[data-import-key]')].find((item) => item.dataset.importKey === snapshot.key);
  const control = row?.querySelector(`[data-import-field="${snapshot.field}"]`);
  if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return;
  control.focus({ preventScroll: true });
  if (control instanceof HTMLInputElement && snapshot.start !== null) {
    control.setSelectionRange(snapshot.start, snapshot.end ?? snapshot.start);
  }
}

function renderImportPreview(snapshot = null) {
  const section = element('product-import-preview');
  const body = element('product-import-body');
  if (!section || !body || !importPreview) return;
  section.classList.remove('is-hidden');
  body.innerHTML = importPreview.rows.map(importRowMarkup).join('');
  for (const [name, value] of Object.entries(importPreview.summary || {})) {
    const target = document.querySelector(`[data-import-count="${name}"]`);
    if (target) target.textContent = String(value);
  }
  const apply = element('product-import-apply');
  if (apply instanceof HTMLButtonElement) apply.disabled = !importPreview.canApply;
  const hint = element('product-import-hint');
  if (hint) {
    if (importPreview.summary?.error) hint.textContent = 'Исправьте ошибки или исключите проблемные строки.';
    else if (!(importPreview.summary?.new || importPreview.summary?.changed)) hint.textContent = 'Изменений для применения нет.';
    else hint.textContent = 'Все строки проверены. Можно применить изменения.';
  }
  restoreFocus(snapshot);
}

function controlValue(row, field) {
  const control = row?.querySelector(`[data-import-field="${field}"]`);
  if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return '';
  if ((field === 'alcoholic' || field === 'active') && (control.value === 'true' || control.value === 'false')) return control.value === 'true';
  return control.value;
}

function snapshotImportRows() {
  if (!importPreview) return [];
  const domRows = [...document.querySelectorAll('#product-import-body [data-import-key]')];
  return importPreview.rows.map((source) => {
    const row = domRows.find((item) => item.dataset.importKey === source.key);
    const excluded = row?.querySelector('[data-import-excluded]');
    return {
      key: source.key,
      line: source.line,
      excluded: excluded instanceof HTMLInputElement ? excluded.checked : source.excluded === true,
      values: Object.fromEntries(IMPORT_FIELDS.map((field) => [field, row ? controlValue(row, field) : source.values?.[field] ?? '']))
    };
  });
}

async function validateImportRows(revision) {
  const rows = snapshotImportRows();
  const snapshot = focusSnapshot();
  const sequence = ++importValidationSequence;
  try {
    const result = await api.post(API.productsImportPreview, { rows });
    if (revision !== importEditRevision || sequence !== importValidationSequence) return;
    importPreview = result;
    clearMessage('product-import-message');
    renderImportPreview(snapshot);
  } catch (error) {
    if (revision === importEditRevision) setMessage('product-import-message', error.message);
  }
}

function scheduleImportValidation(delay = 320) {
  importEditRevision += 1;
  clearTimeout(importValidationTimer);
  const revision = importEditRevision;
  const apply = element('product-import-apply');
  if (apply instanceof HTMLButtonElement) apply.disabled = true;
  const hint = element('product-import-hint');
  if (hint) hint.textContent = 'Проверяем изменения…';
  importValidationTimer = setTimeout(() => { void validateImportRows(revision); }, delay);
}

function closeImportPreview() {
  clearTimeout(importValidationTimer);
  importPreview = null;
  importEditRevision += 1;
  importValidationSequence += 1;
  element('product-import-preview')?.classList.add('is-hidden');
  const body = element('product-import-body');
  if (body) body.replaceChildren();
  clearMessage('product-import-message');
  const input = element('product-import-file');
  if (input instanceof HTMLInputElement) input.value = '';
}

async function previewProductsFile(file) {
  const button = element('product-import');
  const input = element('product-import-file');
  setPending(button, true, 'Читаем файл…');
  clearMessage('product-message');
  try {
    const csv = await file.text();
    importPreview = await api.post(API.productsImportPreview, { csv });
    importEditRevision += 1;
    renderImportPreview();
    element('product-import-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    closeImportPreview();
    setMessage('product-message', error.message);
  } finally {
    if (input instanceof HTMLInputElement) input.value = '';
    setPending(button, false, 'Читаем файл…');
  }
}

async function applyImportProducts() {
  if (!importPreview) return;
  const button = element('product-import-apply');
  setPending(button, true, 'Применяем…');
  clearMessage('product-import-message');
  try {
    const rows = snapshotImportRows();
    const checked = await api.post(API.productsImportPreview, { rows });
    importPreview = checked;
    if (!checked.canApply) {
      renderImportPreview();
      setMessage('product-import-message', checked.summary?.error ? 'Исправьте ошибки перед применением.' : 'В файле нет изменений для базы.');
      return;
    }
    const result = await api.post(API.productsImport, { rows });
    closeImportPreview();
    resetProductForm();
    await Promise.all([loadCatalog(), loadNotifications()]);
    setMessage('product-message', `Импорт применён: создано ${result.created}, обновлено ${result.updated}, без изменений ${result.unchanged || 0}.`, 'success');
  } catch (error) {
    setMessage('product-import-message', error.message);
    try {
      importPreview = await api.post(API.productsImportPreview, { rows: snapshotImportRows() });
      renderImportPreview();
    } catch { /* keep the original apply error visible */ }
  } finally {
    setPending(button, false, 'Применяем…');
    if (button instanceof HTMLButtonElement && importPreview) button.disabled = !importPreview.canApply;
  }
}

function resetPackagingForm() {
  const form = element('packaging-form');
  if (!(form instanceof HTMLFormElement)) return;
  state.editingPackagingId = null;
  form.reset();
  element('packaging-active').checked = true;
  element('packaging-form-title').textContent = 'Новая тара';
  element('packaging-submit').textContent = 'Добавить тару';
  element('cancel-packaging-edit')?.classList.add('is-hidden');
  clearMessage('packaging-message');
}

function editPackaging(item) {
  state.editingPackagingId = item.id;
  element('packaging-name').value = item.name;
  element('packaging-price').value = item.unit_price || '';
  element('packaging-active').checked = item.active !== false;
  element('packaging-form-title').textContent = 'Редактирование тары';
  element('packaging-submit').textContent = 'Сохранить тару';
  element('cancel-packaging-edit')?.classList.remove('is-hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deletePackaging(item) {
  if (!window.confirm(`Удалить тару «${item.name}»?`)) return;
  try { await api.delete(`${API.packaging}/${item.id}`); await loadCatalog(); }
  catch (error) { setMessage('packaging-message', error.message); }
}

export function initialiseCatalog() {
  const productForm = element('product-form');
  const packagingForm = element('packaging-form');
  if (!(productForm instanceof HTMLFormElement) || !(packagingForm instanceof HTMLFormElement)) return;
  void loadCatalog().catch((error) => setMessage('product-message', error.message));
  element('refresh-catalog')?.addEventListener('click', () => { void loadCatalog(); });
  element('product-filter')?.addEventListener('input', renderCatalogProducts);
  element('packaging-filter')?.addEventListener('input', renderCatalogPackaging);
  element('cancel-product-edit')?.addEventListener('click', resetProductForm);
  element('cancel-packaging-edit')?.addEventListener('click', resetPackagingForm);
  element('product-export')?.addEventListener('click', () => { void exportProducts(); });
  element('product-import')?.addEventListener('click', () => { element('product-import-file')?.click(); });
  element('product-import-file')?.addEventListener('change', (event) => {
    const file = event.target?.files?.[0];
    if (file) void previewProductsFile(file);
  });
  element('product-import-cancel')?.addEventListener('click', closeImportPreview);
  element('product-import-apply')?.addEventListener('click', () => { void applyImportProducts(); });
  element('product-import-body')?.addEventListener('input', (event) => {
    if (event.target?.matches?.('[data-import-field], [data-import-excluded]')) scheduleImportValidation();
  });
  element('product-import-body')?.addEventListener('change', (event) => {
    if (event.target?.matches?.('select[data-import-field], [data-import-excluded]')) scheduleImportValidation(80);
  });
  productForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = element('product-submit');
    setPending(submit, true, 'Сохраняем…');
    try {
      const payload = { name: element('product-name').value, producer: element('product-producer').value, characteristics: element('product-characteristics').value, strength: element('product-strength').value, price_primary: element('product-price-primary').value, alcoholic: element('product-alcoholic').checked, beverage_color: element('product-beverage-color').value, filtration: element('product-filtration').value, active: element('product-active').checked };
      if (state.editingProductId) await api.put(`${API.products}/${state.editingProductId}`, payload); else await api.post(API.products, payload);
      resetProductForm();
      await Promise.all([loadCatalog(), loadNotifications()]);
    } catch (error) { setMessage('product-message', error.message); }
    finally { setPending(submit, false, 'Сохраняем…'); }
  });
  packagingForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = element('packaging-submit');
    setPending(submit, true, 'Сохраняем…');
    try {
      const payload = { name: element('packaging-name').value, unit_price: element('packaging-price').value, active: element('packaging-active').checked };
      if (state.editingPackagingId) await api.put(`${API.packaging}/${state.editingPackagingId}`, payload); else await api.post(API.packaging, payload);
      resetPackagingForm();
      await Promise.all([loadCatalog(), loadNotifications()]);
    } catch (error) { setMessage('packaging-message', error.message); }
    finally { setPending(submit, false, 'Сохраняем…'); }
  });
}
