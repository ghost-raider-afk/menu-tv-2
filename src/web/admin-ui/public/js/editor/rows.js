import { addRow, moveRow, removeRow, updateRow } from './commands.js';
import { makeButton, price } from '../core/dom.js';

export function createEditorRow(kind) {
  return { id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind, enabled: true, ...(kind === 'section' ? { name: 'Новый раздел' } : kind === 'item' ? { product_id: '', characteristics: '', promotion: false, promotion_text: '' } : { packaging_id: '' }) };
}

export function renderRows(editorState, { target, empty, products, packaging, onChange }) {
  if (!target) return;
  target.replaceChildren();
  const refresh = () => { renderRows(editorState, { target, empty, products, packaging, onChange }); onChange?.(); };
  editorState.rows.forEach((row, index) => {
    const card = document.createElement('article'); card.className = `editor-menu-row editor-menu-row-${row.kind}${row.enabled === false ? ' is-disabled' : ''}`;
    const head = document.createElement('div'); head.className = 'editor-menu-row-head'; const label = document.createElement('strong'); label.textContent = row.kind === 'section' ? 'Раздел' : row.kind === 'item' ? 'Продукция' : 'Тара'; const controls = document.createElement('div'); controls.className = 'editor-row-actions'; controls.append(makeButton('↑', '', () => { moveRow(editorState, row.id, index - 1); refresh(); }), makeButton('↓', '', () => { moveRow(editorState, row.id, index + 1); refresh(); }), makeButton(row.enabled === false ? 'Показать' : 'Скрыть', '', () => { updateRow(editorState, row.id, { enabled: row.enabled === false }); refresh(); }), makeButton('Удалить', 'danger', () => { removeRow(editorState, row.id); refresh(); })); head.append(label, controls); card.append(head);
    if (row.kind === 'section') { const input = document.createElement('input'); input.maxLength = 100; input.value = row.name || ''; input.placeholder = 'Название раздела'; input.addEventListener('input', () => { updateRow(editorState, row.id, { name: input.value }); onChange?.(); }); card.append(input); }
    else if (row.kind === 'item') { const select = document.createElement('select'); select.append(new Option('Выберите продукцию', ''), ...products.filter((item) => item.active || Number(item.id) === Number(row.product_id)).map((item) => new Option(`${item.name} · 1 л ${price(item.price_primary)}`, String(item.id)))); select.value = row.product_id ? String(row.product_id) : ''; select.addEventListener('change', () => { updateRow(editorState, row.id, { product_id: select.value }); onChange?.(); }); const subtitle = document.createElement('input'); subtitle.maxLength = 180; subtitle.value = row.characteristics || ''; subtitle.placeholder = 'Подпись в меню (необязательно)'; subtitle.addEventListener('input', () => { updateRow(editorState, row.id, { characteristics: subtitle.value }); onChange?.(); }); const promotion = document.createElement('label'); promotion.className = 'editor-inline-toggle'; const check = document.createElement('input'); check.type = 'checkbox'; check.checked = row.promotion === true; const caption = document.createElement('span'); caption.textContent = 'Акция'; const promotionText = document.createElement('input'); promotionText.maxLength = 80; promotionText.value = row.promotion_text || ''; promotionText.placeholder = 'Текст акции'; promotionText.disabled = !check.checked; check.addEventListener('change', () => { updateRow(editorState, row.id, { promotion: check.checked }); promotionText.disabled = !check.checked; onChange?.(); }); promotionText.addEventListener('input', () => { updateRow(editorState, row.id, { promotion_text: promotionText.value }); onChange?.(); }); promotion.append(check, caption, promotionText); card.append(select, subtitle, promotion); }
    else if (row.kind === 'packaging') { const select = document.createElement('select'); select.append(new Option('Выберите тару', ''), ...packaging.filter((item) => item.active || Number(item.id) === Number(row.packaging_id)).map((item) => new Option(`${item.name} · ${price(item.unit_price)}`, String(item.id)))); select.value = row.packaging_id ? String(row.packaging_id) : ''; select.addEventListener('change', () => { updateRow(editorState, row.id, { packaging_id: select.value }); onChange?.(); }); card.append(select); }
    target.append(card);
  });
  empty?.classList.toggle('is-hidden', editorState.rows.length !== 0);
}

export function appendRow(editorState, kind) { addRow(editorState, createEditorRow(kind)); }
