import { buildRenderModel } from './renderer.js';
import { price } from '../core/dom.js';

export function renderPreview(editorState, { screen, products, packaging, target }) {
  if (!target) return;
  const productById = (id) => products.find((item) => Number(item.id) === Number(id));
  const packagingById = (id) => packaging.find((item) => Number(item.id) === Number(id));
  const model = buildRenderModel(editorState);
  const settings = model.settings;
  target.style.setProperty('--menu-background', settings.background_color || '#101828');
  target.style.setProperty('--menu-accent', settings.accent_color || '#2563eb');
  target.style.setProperty('--menu-text', settings.text_color || '#f8fafc');
  target.dataset.fontScale = settings.font_scale || 'medium';
  target.dataset.tableWidth = settings.table_width || 'normal';
  target.replaceChildren();
  const title = document.createElement('h3');
  title.textContent = settings.title || screen?.name || 'Меню';
  target.append(title);
  const table = document.createElement('div');
  table.className = 'menu-preview-table';
  model.rows.forEach((row) => {
    const view = document.createElement('div');
    view.className = `menu-preview-row menu-preview-${row.kind}`;
    if (row.kind === 'section') view.textContent = row.name || 'Раздел';
    else if (row.kind === 'item') {
      const product = productById(row.product_id);
      const name = document.createElement('strong'); name.textContent = product?.name || 'Продукция не выбрана';
      const details = document.createElement('span'); details.textContent = row.promotion && row.promotion_text ? row.promotion_text : (row.characteristics || product?.characteristics || product?.strength || '');
      const prices = document.createElement('em'); prices.textContent = product ? `${price(product.price_primary)} / ${price(product.price_secondary)}` : '—';
      view.append(name, details, prices);
    } else if (row.kind === 'packaging') {
      const item = packagingById(row.packaging_id);
      const name = document.createElement('strong'); name.textContent = item?.name || 'Тара не выбрана';
      const value = document.createElement('em'); value.textContent = item ? price(item.unit_price) : '—';
      view.append(name, value);
    }
    table.append(view);
  });
  if (!table.childElementCount) { const empty = document.createElement('p'); empty.textContent = 'Добавьте продукцию, тару или раздел слева.'; table.append(empty); }
  target.append(table);
}
