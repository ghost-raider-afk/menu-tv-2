import { buildDisplayLines, buildRenderLayout, buildRenderModel } from './renderer.js';
import { parseResolution } from './settings.js';

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
  const content = document.createElement('div');
  content.className = 'menu-preview-packaging-content';
  line.items.forEach((item) => {
    const card = document.createElement('div');
    card.className = `menu-preview-packaging tone-${item.tone}`;
    card.append(textNode('strong', '', item.name), priceNode(item.unitPrice));
    content.append(card);
  });
  row.append(content, textNode('span', 'menu-preview-price-spacer', ''), textNode('span', 'menu-preview-price-spacer', ''));
  return row;
}

function applyPreviewTypography(target, scale, viewportWidth) {
  const width = Math.max(1, Number(viewportWidth) || 1920);
  const unit = (base) => `${((base * scale) / width) * 100}cqw`;
  target.style.setProperty('--menu-section-font', unit(31));
  target.style.setProperty('--menu-price-label-font', unit(23));
  target.style.setProperty('--menu-item-font', unit(27));
  target.style.setProperty('--menu-producer-font', unit(13));
  target.style.setProperty('--menu-detail-font', unit(12));
  target.style.setProperty('--menu-price-whole-font', unit(32));
  target.style.setProperty('--menu-price-cents-font', unit(17));
  target.style.setProperty('--menu-packaging-font', unit(20));
  target.style.setProperty('--menu-promotion-font', unit(12));
}

export function renderPreview(editorState, { screen, products, packaging, target }) {
  if (!target) return null;
  const resolution = parseResolution(screen?.resolution);
  const model = buildRenderModel(editorState, resolution);
  const settings = model.settings;
  const lines = buildDisplayLines(model, { products, packaging, fallbackTitle: screen?.name || 'Меню' });
  const renderLayout = buildRenderLayout(model, lines);
  const palette = renderLayout.palette;

  target.style.setProperty('--menu-background', palette.background);
  target.style.setProperty('--menu-accent', palette.accent);
  target.style.setProperty('--menu-section-text', palette.sectionText);
  target.style.setProperty('--menu-text-readable', palette.primaryText);
  target.style.setProperty('--menu-accent-readable', palette.accentText);
  target.style.setProperty('--menu-table-overlay', String(palette.imageBackdropOpacity));
  target.style.backgroundColor = palette.background;
  target.style.backgroundImage = settings.background_image_url ? `url("${settings.background_image_url}")` : '';
  target.style.backgroundSize = 'cover';
  target.style.backgroundPosition = 'center';
  target.style.aspectRatio = `${model.viewport.width} / ${model.viewport.height}`;
  target.dataset.fontScale = settings.font_scale || 'medium';
  target.dataset.tableWidth = settings.table_width || 'normal';
  target.dataset.menuFits = renderLayout.vertical.fits ? 'true' : 'false';
  target.classList.toggle('is-overflowing', !renderLayout.vertical.fits);
  applyPreviewTypography(target, renderLayout.vertical.scale, model.viewport.width);
  target.replaceChildren();

  const table = document.createElement('div');
  table.className = 'menu-preview-table tv-board-table';
  table.style.top = `${(renderLayout.vertical.top / model.viewport.height) * 100}%`;
  table.style.height = `${(renderLayout.vertical.usedHeight / model.viewport.height) * 100}%`;
  table.style.gridTemplateRows = `repeat(${Math.max(lines.length, 1)}, minmax(0, 1fr))`;
  lines.forEach((line) => {
    if (line.kind === 'section') table.append(renderSection(line));
    else if (line.kind === 'item') table.append(renderItem(line));
    else if (line.kind === 'packaging') table.append(renderPackaging(line));
  });
  target.append(table);
  return { model, lines, layout: renderLayout };
}
