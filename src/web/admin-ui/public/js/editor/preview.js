import { buildDisplayLines, buildRenderModel } from './renderer.js';
import { price } from '../core/dom.js';

function textNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function renderSection(line) {
  const row = document.createElement('div');
  row.className = 'menu-preview-section';
  row.append(textNode('strong', 'menu-preview-section-title', line.name || 'Меню'));
  if (line.showPriceLabels) {
    row.append(
      textNode('span', 'menu-preview-price-label menu-preview-price-primary', '1 л'),
      textNode('span', 'menu-preview-price-label menu-preview-price-secondary', '1,5 л')
    );
  }
  return row;
}

function renderItem(line) {
  const row = document.createElement('div');
  row.className = `menu-preview-item tone-${line.tone}`;
  const content = document.createElement('div');
  content.className = 'menu-preview-item-content';
  const heading = document.createElement('div');
  heading.className = 'menu-preview-item-heading';
  if (line.promotion && line.promotionText) heading.append(textNode('span', 'menu-preview-promotion', line.promotionText));
  heading.append(textNode('strong', '', line.name));
  content.append(heading);
  if (line.characteristics) content.append(textNode('span', 'menu-preview-details', line.characteristics));
  row.append(
    content,
    textNode('em', 'menu-preview-price menu-preview-price-primary', line.pricePrimary ? price(line.pricePrimary) : '—'),
    textNode('em', 'menu-preview-price menu-preview-price-secondary', line.priceSecondary ? price(line.priceSecondary) : '—')
  );
  return row;
}

function renderPackaging(line) {
  const row = document.createElement('div');
  row.className = 'menu-preview-packaging-line';
  line.items.forEach((item) => {
    const card = document.createElement('div');
    card.className = `menu-preview-packaging tone-${item.tone}`;
    card.append(
      textNode('strong', '', item.name),
      textNode('em', '', item.unitPrice ? `${price(item.unitPrice)} / шт.` : '—')
    );
    row.append(card);
  });
  return row;
}

export function renderPreview(editorState, { screen, products, packaging, target }) {
  if (!target) return;
  const model = buildRenderModel(editorState);
  const settings = model.settings;
  const lines = buildDisplayLines(model, { products, packaging, fallbackTitle: screen?.name || 'Меню' });

  target.style.setProperty('--menu-background', settings.background_color || '#101828');
  target.style.setProperty('--menu-accent', settings.accent_color || '#F4C915');
  target.style.setProperty('--menu-text', settings.text_color || '#F8FAFC');
  target.style.backgroundColor = settings.background_color || '#101828';
  target.style.backgroundImage = settings.background_image_url ? `url("${settings.background_image_url}")` : '';
  target.style.backgroundSize = '100% 100%';
  target.style.backgroundPosition = 'center';
  target.dataset.fontScale = settings.font_scale || 'medium';
  target.dataset.tableWidth = settings.table_width || 'normal';
  target.replaceChildren();

  const title = document.createElement('h3');
  title.textContent = settings.title || screen?.name || 'Меню';
  target.append(title);

  const table = document.createElement('div');
  table.className = 'menu-preview-table tv1-menu-table';
  lines.forEach((line) => {
    if (line.kind === 'section') table.append(renderSection(line));
    else if (line.kind === 'item') table.append(renderItem(line));
    else if (line.kind === 'packaging') table.append(renderPackaging(line));
  });
  target.append(table);
}
