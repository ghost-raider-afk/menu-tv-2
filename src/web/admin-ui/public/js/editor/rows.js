import { addRow, moveRow, removeRow, updateRow } from './commands.js';
import { makeButton, price } from '../core/dom.js';

export function createEditorRow(kind) {
  return {
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    enabled: true,
    ...(kind === 'section'
      ? { name: 'Новый раздел' }
      : kind === 'item'
        ? { product_id: '', characteristics: '', promotion: false, promotion_text: '' }
        : { packaging_id: '' })
  };
}

function cell(className, ...children) {
  const node = document.createElement('div');
  node.className = className;
  node.append(...children.filter(Boolean));
  return node;
}

function tableHeader() {
  const header = document.createElement('div');
  header.className = 'editor-menu-table-head';
  ['Позиция', 'Подпись / акция', '1 л', '1,5 л', 'Управление'].forEach((label) => {
    const span = document.createElement('span');
    span.textContent = label;
    header.append(span);
  });
  return header;
}

function actionButtons(editorState, row, index, refresh) {
  const controls = document.createElement('div');
  controls.className = 'editor-row-actions';
  controls.append(
    makeButton('↑', '', () => { moveRow(editorState, row.id, index - 1); refresh(); }),
    makeButton('↓', '', () => { moveRow(editorState, row.id, index + 1); refresh(); }),
    makeButton(row.enabled === false ? 'Показать' : 'Скрыть', '', () => { updateRow(editorState, row.id, { enabled: row.enabled === false }); refresh(); }),
    makeButton('×', 'danger', () => { removeRow(editorState, row.id); refresh(); })
  );
  return controls;
}

function sectionRow(editorState, row, index, refresh, onChange) {
  const line = document.createElement('article');
  line.className = `editor-menu-table-row editor-menu-table-section${row.enabled === false ? ' is-disabled' : ''}`;
  const input = document.createElement('input');
  input.maxLength = 100;
  input.value = row.name || '';
  input.placeholder = 'Название раздела';
  input.addEventListener('input', () => { updateRow(editorState, row.id, { name: input.value }); onChange?.(); });
  const badge = document.createElement('span');
  badge.className = 'editor-row-kind';
  badge.textContent = 'Раздел';
  line.append(
    cell('editor-menu-cell editor-menu-position', badge, input),
    cell('editor-menu-cell editor-menu-details'),
    cell('editor-menu-cell editor-menu-price editor-menu-price-label', document.createTextNode(index === 0 ? '1 л' : '')),
    cell('editor-menu-cell editor-menu-price editor-menu-price-label', document.createTextNode(index === 0 ? '1,5 л' : '')),
    cell('editor-menu-cell editor-menu-actions', actionButtons(editorState, row, index, refresh))
  );
  return line;
}

function itemRow(editorState, row, index, products, refresh, onChange) {
  const line = document.createElement('article');
  line.className = `editor-menu-table-row editor-menu-table-item${row.enabled === false ? ' is-disabled' : ''}`;
  const product = products.find((item) => Number(item.id) === Number(row.product_id));

  const select = document.createElement('select');
  select.append(
    new Option('Выберите продукцию', ''),
    ...products
      .filter((item) => item.active || Number(item.id) === Number(row.product_id))
      .map((item) => new Option(item.name, String(item.id)))
  );
  select.value = row.product_id ? String(row.product_id) : '';
  select.addEventListener('change', () => {
    updateRow(editorState, row.id, { product_id: select.value });
    refresh();
  });

  const subtitle = document.createElement('input');
  subtitle.maxLength = 180;
  subtitle.value = row.characteristics || '';
  subtitle.placeholder = product?.characteristics || 'Подпись / характеристики';
  subtitle.addEventListener('input', () => { updateRow(editorState, row.id, { characteristics: subtitle.value }); onChange?.(); });

  const promotion = document.createElement('label');
  promotion.className = 'editor-inline-toggle editor-promotion-control';
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = row.promotion === true;
  const caption = document.createElement('span');
  caption.textContent = 'Акция';
  const promotionText = document.createElement('input');
  promotionText.maxLength = 80;
  promotionText.value = row.promotion_text || '';
  promotionText.placeholder = 'Текст акции';
  promotionText.disabled = !check.checked;
  check.addEventListener('change', () => {
    updateRow(editorState, row.id, { promotion: check.checked });
    promotionText.disabled = !check.checked;
    onChange?.();
  });
  promotionText.addEventListener('input', () => { updateRow(editorState, row.id, { promotion_text: promotionText.value }); onChange?.(); });
  promotion.append(check, caption, promotionText);

  const kind = document.createElement('span');
  kind.className = 'editor-row-kind';
  kind.textContent = 'Продукция';
  line.append(
    cell('editor-menu-cell editor-menu-position', kind, select),
    cell('editor-menu-cell editor-menu-details', subtitle, promotion),
    cell('editor-menu-cell editor-menu-price', document.createTextNode(product?.price_primary ? price(product.price_primary) : '—')),
    cell('editor-menu-cell editor-menu-price', document.createTextNode(product?.price_secondary ? price(product.price_secondary) : '—')),
    cell('editor-menu-cell editor-menu-actions', actionButtons(editorState, row, index, refresh))
  );
  return line;
}

function packagingRow(editorState, row, index, packaging, refresh) {
  const line = document.createElement('article');
  line.className = `editor-menu-table-row editor-menu-table-packaging${row.enabled === false ? ' is-disabled' : ''}`;
  const selected = packaging.find((item) => Number(item.id) === Number(row.packaging_id));
  const select = document.createElement('select');
  select.append(
    new Option('Выберите тару', ''),
    ...packaging
      .filter((item) => item.active || Number(item.id) === Number(row.packaging_id))
      .map((item) => new Option(item.name, String(item.id)))
  );
  select.value = row.packaging_id ? String(row.packaging_id) : '';
  select.addEventListener('change', () => {
    updateRow(editorState, row.id, { packaging_id: select.value });
    refresh();
  });
  const kind = document.createElement('span');
  kind.className = 'editor-row-kind';
  kind.textContent = 'Тара';
  const note = document.createElement('span');
  note.className = 'editor-packaging-note';
  note.textContent = 'Цена за штуку';
  line.append(
    cell('editor-menu-cell editor-menu-position', kind, select),
    cell('editor-menu-cell editor-menu-details', note),
    cell('editor-menu-cell editor-menu-price', document.createTextNode(selected?.unit_price ? `${price(selected.unit_price)} / шт.` : '—')),
    cell('editor-menu-cell editor-menu-price', document.createTextNode('—')),
    cell('editor-menu-cell editor-menu-actions', actionButtons(editorState, row, index, refresh))
  );
  return line;
}

export function renderRows(editorState, { target, empty, products, packaging, onChange }) {
  if (!target) return;
  target.replaceChildren();
  const refresh = () => {
    renderRows(editorState, { target, empty, products, packaging, onChange });
    onChange?.();
  };

  if (editorState.rows.length) target.append(tableHeader());
  editorState.rows.forEach((row, index) => {
    if (row.kind === 'section') target.append(sectionRow(editorState, row, index, refresh, onChange));
    else if (row.kind === 'item') target.append(itemRow(editorState, row, index, products, refresh, onChange));
    else if (row.kind === 'packaging') target.append(packagingRow(editorState, row, index, packaging, refresh));
  });
  empty?.classList.toggle('is-hidden', editorState.rows.length !== 0);
}

export function appendRow(editorState, kind) {
  addRow(editorState, createEditorRow(kind));
}
