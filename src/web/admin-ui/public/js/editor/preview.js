import { buildDisplayLines, buildRenderModel } from './renderer.js';

function textNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function priceNode(value, className = '') {
  const node = document.createElement('em');
  node.className = `menu-preview-price ${className}`.trim();
  if (!value) {
    node.textContent = '—';
    return node;
  }
  const normalized = String(value).replace(',', '.');
  const [whole = '0', decimal = ''] = normalized.split('.');
  node.append(
    textNode('span', 'menu-preview-price-whole', whole),
    textNode('sup', 'menu-preview-price-cents', decimal.padEnd(2, '0').slice(0, 2))
  );
  return node;
}

function renderSection(line) {
  const row = document.createElement('div');
  row.className = 'menu-preview-section';
  row.append(textNode('strong', 'menu-preview-section-title', line.name || 'Меню'));
  row.append(
    textNode('span', `menu-preview-price-label menu-preview-price-primary${line.showPriceLabels ? '' : ' is-empty'}`, line.showPriceLabels ? '1,0 л.' : ''),
    textNode('span', `menu-preview-price-label menu-preview-price-secondary${line.showPriceLabels ? '' : ' is-empty'}`, line.showPriceLabels ? '1,5 л.' : '')
  );
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

  const mainLabel = line.strength ? `${line.name} - ${line.strength}` : line.name;
  heading.append(textNode('strong', 'menu-preview-product-name', mainLabel));
  if (line.producer) heading.append(textNode('span', 'menu-preview-producer', line.producer));
  content.append(heading);
  if (line.characteristics) content.append(textNode('span', 'menu-preview-details', line.characteristics));

  row.append(
    content,
    priceNode(line.pricePrimary, 'menu-preview-price-primary'),
    priceNode(line.priceSecondary, 'menu-preview-price-secondary')
  );
  return row;
}

function renderPackaging(line) {
  const row = document.createElement('div');
  row.className = 'menu-preview-packaging-line';
  line.items.forEach((item) => {
    const card = document.createElement('div');
    card.className = `menu-preview-packaging tone-${item.tone}`;
    card.append(textNode('strong', '', item.name), priceNode(item.unitPrice));
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

  const table = document.createElement('div');
  table.className = 'menu-preview-table tv-board-table';
  lines.forEach((line) => {
    if (line.kind === 'section') table.append(renderSection(line));
    else if (line.kind === 'item') table.append(renderItem(line));
    else if (line.kind === 'packaging') table.append(renderPackaging(line));
  });
  target.append(table);
}
