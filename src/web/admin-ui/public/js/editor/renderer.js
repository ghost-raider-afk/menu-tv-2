const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const HEX = /^#[0-9a-f]{6}$/i;
const DEFAULT_FONT_KEY = 'arial-narrow';

export const MENU_FONT_OPTIONS = Object.freeze([
  Object.freeze({ key: 'arial-narrow', label: 'Arial Narrow', family: 'Arial Narrow, Liberation Sans Narrow, DejaVu Sans Condensed, Arial, sans-serif', weightFloor: 400 }),
  Object.freeze({ key: 'tahoma-bold', label: 'Tahoma Bold', family: 'Tahoma, Arial, sans-serif', weightFloor: 700 }),
  Object.freeze({ key: 'arial', label: 'Arial', family: 'Arial, Liberation Sans, sans-serif', weightFloor: 400 }),
  Object.freeze({ key: 'dejavu-condensed', label: 'DejaVu Sans Condensed', family: 'DejaVu Sans Condensed, DejaVu Sans, sans-serif', weightFloor: 400 }),
  Object.freeze({ key: 'liberation-narrow', label: 'Liberation Sans Narrow', family: 'Liberation Sans Narrow, Liberation Sans, Arial, sans-serif', weightFloor: 400 }),
  Object.freeze({ key: 'system-sans', label: 'Системный sans-serif', family: 'Arial, sans-serif', weightFloor: 400 })
]);

export const MENU_REFERENCE = Object.freeze({
  width: 2048,
  height: 1152,
  tableX: 15,
  tableRight: 1605,
  tableWidth: 1590,
  primaryBoundary: 1231,
  secondaryBoundary: 1417,
  tableTop: 28,
  tableBottom: 1120,
  firstSectionHeight: 80,
  sectionHeight: 64,
  sectionGap: 12,
  itemHeight: 72,
  packagingHeight: 58,
  fontScaleMinPercent: 55,
  fontScaleMaxPercent: 130
});

export const MENU_TABLE_STYLE = Object.freeze({
  defaultBackground: '#101828',
  defaultAccent: '#F4C915',
  defaultText: '#F4F7FA',
  darkText: '#101317',
  separator: '#C8D0DA',
  secondaryText: '#C7CED8',
  packagingBackground: '#101419',
  promotion: '#D92D35'
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function numeric(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function enabledRows(rows) {
  return rows.filter((row) => row && row.enabled !== false);
}

function recordById(records, id) {
  return records.find((record) => Number(record.id) === Number(id));
}

function normalizeHex(value, fallback) {
  return HEX.test(String(value || '')) ? String(value).toUpperCase() : fallback;
}

function rgb(value) {
  const parsed = Number.parseInt(normalizeHex(value, '#000000').slice(1), 16);
  return { r: (parsed >> 16) & 255, g: (parsed >> 8) & 255, b: parsed & 255 };
}

function hex({ r, g, b }) {
  return `#${[r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function mix(source, target, amount) {
  const left = rgb(source);
  const right = rgb(target);
  return hex({
    r: left.r + (right.r - left.r) * amount,
    g: left.g + (right.g - left.g) * amount,
    b: left.b + (right.b - left.b) * amount
  });
}

function luminance(value) {
  const color = rgb(value);
  const channel = (input) => {
    const normalized = input / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

function contrast(left, right) {
  const a = luminance(left);
  const b = luminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function foregroundFor(background) {
  return contrast(background, MENU_TABLE_STYLE.darkText) >= contrast(background, '#FFFFFF')
    ? MENU_TABLE_STYLE.darkText
    : '#FFFFFF';
}

function readableColor(source, background) {
  const color = normalizeHex(source, MENU_TABLE_STYLE.defaultText);
  if (contrast(color, background) >= 4.5) return color;
  const target = contrast('#FFFFFF', background) >= contrast(MENU_TABLE_STYLE.darkText, background)
    ? '#FFFFFF'
    : MENU_TABLE_STYLE.darkText;
  for (let step = 1; step <= 10; step += 1) {
    const candidate = mix(color, target, step / 10);
    if (contrast(candidate, background) >= 4.5) return candidate;
  }
  return target;
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function truncateText(value, maximum) {
  const text = String(value ?? '');
  return text.length > maximum ? `${text.slice(0, Math.max(1, maximum - 1))}…` : text;
}

function fitCharacters(width, fontSize, factor = 0.56) {
  return Math.max(8, Math.floor(width / Math.max(1, fontSize * factor)));
}

function priceParts(value) {
  if (!value && value !== 0) return null;
  const normalized = String(value).replace(',', '.');
  const [whole = '0', decimal = ''] = normalized.split('.');
  return { whole, cents: decimal.padEnd(2, '0').slice(0, 2) };
}

export function formatStrength(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const compact = text.replace(/\s+/g, '');
  const numericStrength = compact.match(/^(\d+(?:[.,]\d+)?)(?:°|%|об\.?%?)?$/i);
  if (numericStrength) return `${numericStrength[1]}%`;
  return text.replaceAll('°', '%');
}

function beverageColorLabel(value) {
  if (value === 'light') return 'светлое';
  if (value === 'dark') return 'тёмное';
  return '';
}

function filtrationLabel(value) {
  if (value === 'filtered') return 'фильтрованное';
  if (value === 'unfiltered') return 'нефильтрованное';
  return '';
}

export function formatProductMetadata(product) {
  return [
    product?.producer || '',
    formatStrength(product?.strength || ''),
    beverageColorLabel(product?.beverage_color),
    filtrationLabel(product?.filtration)
  ].filter(Boolean).join(' · ');
}

function fontDefinition(value) {
  return MENU_FONT_OPTIONS.find((font) => font.key === value)
    || MENU_FONT_OPTIONS.find((font) => font.key === DEFAULT_FONT_KEY);
}

function lineBaseHeight(line) {
  if (line.kind === 'section') return line.showPriceLabels ? MENU_REFERENCE.firstSectionHeight : MENU_REFERENCE.sectionHeight;
  if (line.kind === 'packaging') return MENU_REFERENCE.packagingHeight;
  return MENU_REFERENCE.itemHeight;
}

function lineBaseGap(line, index) {
  return line.kind === 'section' && index > 0 ? MENU_REFERENCE.sectionGap : 0;
}

function baseContentHeight(lines) {
  return lines.reduce((total, line, index) => total + lineBaseGap(line, index) + lineBaseHeight(line), 0);
}

export function buildMenuPalette(settings = {}) {
  const background = normalizeHex(settings.background_color, MENU_TABLE_STYLE.defaultBackground);
  const accent = normalizeHex(settings.accent_color, MENU_TABLE_STYLE.defaultAccent);
  const primaryText = readableColor(settings.text_color, background);
  return Object.freeze({
    background,
    accent,
    sectionText: foregroundFor(accent),
    primaryText,
    secondaryText: mix(primaryText, background, 0.22),
    accentText: readableColor(accent, background)
  });
}

export function requestedFontScalePercent(settings = {}) {
  return clamp(
    numeric(settings.font_scale_percent, 100),
    MENU_REFERENCE.fontScaleMinPercent,
    MENU_REFERENCE.fontScaleMaxPercent
  );
}

export function buildRenderModel(editorState, viewport = {}) {
  const width = Math.max(1, Math.round(numeric(viewport.width, DEFAULT_WIDTH)));
  const height = Math.max(1, Math.round(numeric(viewport.height, DEFAULT_HEIGHT)));
  const settings = structuredClone(editorState?.settings || {});
  const rows = enabledRows(Array.isArray(editorState?.rows) ? editorState.rows : []);
  return Object.freeze({
    viewport: Object.freeze({ width, height, aspectRatio: width / height }),
    settings: Object.freeze(settings),
    rows: Object.freeze(rows.map((row, index) => Object.freeze({ ...structuredClone(row), renderIndex: index })))
  });
}

export function buildDisplayLines(model, { products = [], packaging = [], fallbackTitle = 'Меню' } = {}) {
  const lines = [];
  let toneIndex = 0;
  let firstSectionSeen = false;
  const sourceRows = model.rows.length
    ? model.rows
    : [{ id: 'render-base-section', kind: 'section', name: fallbackTitle, enabled: true, renderIndex: -1 }];

  if (sourceRows[0]?.kind !== 'section') {
    lines.push(Object.freeze({ kind: 'section', name: fallbackTitle, showPriceLabels: true, virtual: true }));
    firstSectionSeen = true;
  }

  for (const row of sourceRows) {
    if (row.kind === 'section') {
      lines.push(Object.freeze({
        kind: 'section',
        name: row.name || fallbackTitle,
        showPriceLabels: !firstSectionSeen,
        virtual: row.renderIndex === -1
      }));
      firstSectionSeen = true;
      toneIndex = 0;
      continue;
    }

    if (row.kind === 'item') {
      const product = recordById(products, row.product_id ?? row.productId);
      const tone = toneIndex % 2 === 0 ? 'light' : 'accent';
      toneIndex += 1;
      lines.push(Object.freeze({
        kind: 'item',
        tone,
        name: product?.name || row.name || 'Продукция не выбрана',
        strength: formatStrength(product?.strength || ''),
        producer: product?.producer || '',
        metadata: formatProductMetadata(product),
        promotion: row.promotion === true,
        promotionText: row.promotion_text || row.promotionText || '',
        pricePrimary: product?.price_primary || row.price_primary || row.pricePrimary || '',
        priceSecondary: product?.price_secondary || row.price_secondary || row.priceSecondary || ''
      }));
      continue;
    }

    if (row.kind === 'packaging') {
      const item = recordById(packaging, row.packaging_id ?? row.packagingId);
      const entry = Object.freeze({
        name: item?.name || row.name || 'Тара не выбрана',
        unitPrice: item?.unit_price || row.unit_price || row.unitPrice || '',
        tone: toneIndex % 2 === 0 ? 'light' : 'accent'
      });
      toneIndex += 1;
      const previous = lines.at(-1);
      if (previous?.kind === 'packaging' && previous.items.length < 2) {
        lines[lines.length - 1] = Object.freeze({ ...previous, items: Object.freeze([...previous.items, entry]) });
      } else {
        lines.push(Object.freeze({ kind: 'packaging', items: Object.freeze([entry]) }));
      }
    }
  }

  return Object.freeze(lines);
}

export function buildRenderLayout(model, lines) {
  const available = MENU_REFERENCE.tableBottom - MENU_REFERENCE.tableTop;
  const baseHeight = Math.max(1, baseContentHeight(lines));
  const requestedPercent = requestedFontScalePercent(model.settings);
  const fitPercent = (available / baseHeight) * 100;
  const effectivePercent = Math.max(MENU_REFERENCE.fontScaleMinPercent, Math.min(requestedPercent, fitPercent));
  const scale = effectivePercent / 100;
  const fits = baseHeight * scale <= available + 0.5;
  let cursor = MENU_REFERENCE.tableTop;
  const boxes = lines.map((line, index) => {
    const gap = lineBaseGap(line, index) * scale;
    cursor += gap;
    const height = lineBaseHeight(line) * scale;
    const box = Object.freeze({ top: cursor, height, bottom: cursor + height, gapBefore: gap });
    cursor += height;
    return box;
  });

  return Object.freeze({
    horizontal: Object.freeze({
      left: MENU_REFERENCE.tableX,
      right: MENU_REFERENCE.tableRight,
      tableWidth: MENU_REFERENCE.tableWidth,
      primaryBoundary: MENU_REFERENCE.primaryBoundary,
      secondaryBoundary: MENU_REFERENCE.secondaryBoundary,
      nameWidth: MENU_REFERENCE.primaryBoundary - MENU_REFERENCE.tableX,
      primaryWidth: MENU_REFERENCE.secondaryBoundary - MENU_REFERENCE.primaryBoundary,
      secondaryWidth: MENU_REFERENCE.tableRight - MENU_REFERENCE.secondaryBoundary
    }),
    vertical: Object.freeze({
      top: MENU_REFERENCE.tableTop,
      bottom: MENU_REFERENCE.tableBottom,
      availableHeight: available,
      baseContentHeight: baseHeight,
      requestedPercent: Math.round(requestedPercent * 10) / 10,
      fitPercent: Math.round(fitPercent * 10) / 10,
      effectivePercent: Math.round(effectivePercent * 10) / 10,
      scale,
      usedHeight: cursor - MENU_REFERENCE.tableTop,
      fits,
      autoReduced: effectivePercent + 0.05 < requestedPercent,
      boxes: Object.freeze(boxes)
    }),
    palette: buildMenuPalette(model.settings),
    typography: fontDefinition(model.settings.font_family)
  });
}

function textAttributes({ size, weight = 400, fill, letterSpacing = 0, anchor = null, opacity = null }, typography) {
  const resolvedWeight = Math.max(weight, typography?.weightFloor || 400);
  return [
    `font-size="${size}"`,
    `font-weight="${resolvedWeight}"`,
    fill ? `fill="${fill}"` : '',
    letterSpacing ? `letter-spacing="${letterSpacing}"` : '',
    anchor ? `text-anchor="${anchor}"` : '',
    opacity !== null ? `opacity="${opacity}"` : ''
  ].filter(Boolean).join(' ');
}

function separatorMarkup(y, horizontal, scale) {
  const width = Math.max(1.35, 1.8 * scale);
  const dash = `${8 * scale} ${7 * scale}`;
  return `<line x1="${horizontal.left}" y1="${y}" x2="${horizontal.right}" y2="${y}" class="separator" stroke="${MENU_TABLE_STYLE.separator}" stroke-width="${width}" stroke-dasharray="${dash}" opacity="0.72"/>`;
}

function verticalSeparatorsMarkup(box, horizontal, scale) {
  const width = Math.max(1.35, 1.8 * scale);
  const dash = `${8 * scale} ${7 * scale}`;
  return `<line x1="${horizontal.primaryBoundary}" y1="${box.top}" x2="${horizontal.primaryBoundary}" y2="${box.bottom}" class="separator" stroke="${MENU_TABLE_STYLE.separator}" stroke-width="${width}" stroke-dasharray="${dash}" opacity="0.72"/>
    <line x1="${horizontal.secondaryBoundary}" y1="${box.top}" x2="${horizontal.secondaryBoundary}" y2="${box.bottom}" class="separator" stroke="${MENU_TABLE_STYLE.separator}" stroke-width="${width}" stroke-dasharray="${dash}" opacity="0.72"/>`;
}

function bottleMarkup(x, y, scale, stroke) {
  return `<g transform="translate(${x} ${y}) scale(${scale})" class="bottle" aria-hidden="true">
    <path d="M8 0h10v6l-2 3v4c5 3 7 7 7 13v24c0 5-3 8-8 8H11c-5 0-8-3-8-8V26c0-6 2-10 7-13V9L8 6Z" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M7 20h12M5 43h16" fill="none" stroke="${stroke}" stroke-width="1.8"/>
  </g>`;
}

function priceMarkup(value, x, baseline, scale, toneColor, typography) {
  const parts = priceParts(value);
  const attributes = textAttributes({ size: 48 * scale, weight: 900, fill: toneColor, letterSpacing: -0.8 * scale }, typography);
  if (!parts) return `<text x="${x}" y="${baseline}" class="price" ${attributes}>—</text>`;
  return `<text x="${x}" y="${baseline}" class="price" ${attributes}>${escapeXml(parts.whole)}<tspan class="cents" dx="2" dy="${-18 * scale}" font-size="${22 * scale}" font-weight="900" fill="${toneColor}">${escapeXml(parts.cents)}</tspan></text>`;
}

function promotionMarkup(line, x, box, scale, typography) {
  if (!line.promotion || !line.promotionText) return { markup: '', width: 0 };
  const text = truncateText(line.promotionText, 14);
  const width = Math.min(160 * scale, Math.max(84 * scale, (text.length * 9 + 24) * scale));
  const height = 28 * scale;
  const top = box.top + 6 * scale;
  const notch = 9 * scale;
  return {
    width,
    markup: `<path d="M${x} ${top}H${x + width - notch}L${x + width} ${top + height / 2}L${x + width - notch} ${top + height}H${x}Z" fill="${MENU_TABLE_STYLE.promotion}"/>
      <text x="${x + (width - notch) / 2}" y="${top + 20 * scale}" class="promotion" ${textAttributes({ size: 16 * scale, weight: 900, fill: '#FFFFFF', letterSpacing: 0.1 * scale, anchor: 'middle' }, typography)}>${escapeXml(text)}</text>`
  };
}

function sectionMarkup(line, box, horizontal, palette, scale, typography) {
  const title = String(line.name || 'Меню').toUpperCase();
  const titleSize = 50 * scale;
  const titleMax = fitCharacters(horizontal.nameWidth - 34 * scale, titleSize, 0.54);
  const baseline = box.top + box.height * 0.70;
  const labelY = box.top + box.height * 0.69;
  const primaryCenter = (horizontal.primaryBoundary + horizontal.secondaryBoundary) / 2;
  const secondaryCenter = (horizontal.secondaryBoundary + horizontal.right) / 2;
  const radius = Math.max(6, 11 * scale);
  const labelMarkup = line.showPriceLabels ? `
      ${bottleMarkup(horizontal.primaryBoundary + 25 * scale, box.top + 8 * scale, 0.66 * scale, palette.sectionText)}
      <text x="${primaryCenter + 18 * scale}" y="${labelY}" class="price-label" ${textAttributes({ size: 36 * scale, weight: 900, fill: palette.sectionText, letterSpacing: -0.4 * scale, anchor: 'middle' }, typography)}>1 л</text>
      ${bottleMarkup(horizontal.secondaryBoundary + 25 * scale, box.top + 8 * scale, 0.66 * scale, palette.sectionText)}
      <text x="${secondaryCenter + 18 * scale}" y="${labelY}" class="price-label" ${textAttributes({ size: 36 * scale, weight: 900, fill: palette.sectionText, letterSpacing: -0.4 * scale, anchor: 'middle' }, typography)}>1,5 л</text>` : '';
  return `<g class="table-section">
    <rect x="${horizontal.left}" y="${box.top}" width="${horizontal.tableWidth}" height="${box.height}" rx="${radius}" ry="${radius}" fill="${palette.accent}"/>
    <text x="${horizontal.left + 18 * scale}" y="${baseline}" class="section-title" ${textAttributes({ size: titleSize, weight: 900, fill: palette.sectionText, letterSpacing: -0.9 * scale }, typography)}>${escapeXml(truncateText(title, titleMax))}</text>
    ${verticalSeparatorsMarkup(box, horizontal, scale)}
    ${labelMarkup}
  </g>`;
}

function itemMarkup(line, box, horizontal, palette, scale, typography) {
  const toneColor = line.tone === 'accent' ? palette.accentText : palette.primaryText;
  const metaColor = line.tone === 'accent'
    ? mix(toneColor, palette.background, 0.10)
    : mix(toneColor, palette.background, 0.20);
  const nameX = horizontal.left + 18 * scale;
  const promotion = promotionMarkup(line, nameX, box, scale, typography);
  const contentX = nameX + (promotion.width ? promotion.width + 12 * scale : 0);
  const titleSize = 42 * scale;
  const metaSize = 22 * scale;
  const availableNameWidth = horizontal.primaryBoundary - contentX - 20 * scale;
  const mainMax = fitCharacters(availableNameWidth, titleSize, 0.54);
  const metaMax = fitCharacters(availableNameWidth, metaSize, 0.51);
  const mainBaseline = box.top + 34 * scale;
  const metaBaseline = box.top + 65 * scale;
  const priceBaseline = box.top + 50 * scale;

  return `<g class="table-item tone-${line.tone === 'accent' ? 'accent' : 'light'}">
    ${promotion.markup}
    <text x="${contentX}" y="${mainBaseline}" class="item-name" ${textAttributes({ size: titleSize, weight: 900, fill: toneColor, letterSpacing: -0.7 * scale }, typography)}>${escapeXml(truncateText(String(line.name || '').toUpperCase(), mainMax))}</text>
    ${line.metadata ? `<text x="${contentX}" y="${metaBaseline}" class="item-meta" ${textAttributes({ size: metaSize, weight: 650, fill: metaColor, letterSpacing: 0.02 * scale }, typography)}>${escapeXml(truncateText(line.metadata, metaMax))}</text>` : ''}
    ${priceMarkup(line.pricePrimary, horizontal.primaryBoundary + 12 * scale, priceBaseline, scale, toneColor, typography)}
    ${priceMarkup(line.priceSecondary, horizontal.secondaryBoundary + 12 * scale, priceBaseline, scale, toneColor, typography)}
    ${verticalSeparatorsMarkup(box, horizontal, scale)}
    ${separatorMarkup(box.bottom, horizontal, scale)}
  </g>`;
}

function packagingMarkup(line, box, horizontal, palette, scale, typography) {
  const gap = 14 * scale;
  const cellWidth = (horizontal.tableWidth - gap) / 2;
  const top = box.top + 4 * scale;
  const height = box.height - 8 * scale;
  const cells = line.items.map((item, index) => {
    const x = horizontal.left + index * (cellWidth + gap);
    const toneColor = item.tone === 'accent' ? palette.accentText : palette.primaryText;
    const nameMax = fitCharacters(cellWidth - 220 * scale, 24 * scale, 0.56);
    const parts = priceParts(item.unitPrice);
    const price = parts ? `${parts.whole},${parts.cents}` : '—';
    return `<g class="packaging-cell tone-${item.tone === 'accent' ? 'accent' : 'light'}">
      <rect x="${x}" y="${top}" width="${cellWidth}" height="${height}" rx="7" fill="${MENU_TABLE_STYLE.packagingBackground}" stroke="${toneColor}" stroke-width="${Math.max(1.4, 1.8 * scale)}"/>
      <text x="${x + 16 * scale}" y="${box.top + 38 * scale}" class="packaging-name" ${textAttributes({ size: 24 * scale, weight: 850, fill: toneColor }, typography)}>${escapeXml(truncateText(item.name, nameMax))}</text>
      <text x="${x + cellWidth - 16 * scale}" y="${box.top + 38 * scale}" class="packaging-price" ${textAttributes({ size: 24 * scale, weight: 900, fill: toneColor, anchor: 'end' }, typography)}>${escapeXml(price)}</text>
    </g>`;
  }).join('\n');
  return `<g class="table-packaging">${cells}${separatorMarkup(box.bottom, horizontal, scale)}</g>`;
}

export function buildTableSvg(model, lines, layout = buildRenderLayout(model, lines)) {
  const { palette, horizontal, vertical, typography } = layout;
  const scale = vertical.scale;
  const content = lines.map((line, index) => {
    const box = vertical.boxes[index];
    if (line.kind === 'section') return sectionMarkup(line, box, horizontal, palette, scale, typography);
    if (line.kind === 'packaging') return packagingMarkup(line, box, horizontal, palette, scale, typography);
    return itemMarkup(line, box, horizontal, palette, scale, typography);
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" class="menu-table-svg" width="${model.viewport.width}" height="${model.viewport.height}" viewBox="0 0 ${MENU_REFERENCE.width} ${MENU_REFERENCE.height}" preserveAspectRatio="xMinYMin meet" aria-label="Предпросмотр таблицы меню" font-family="${escapeXml(typography.family)}">
    ${content}
  </svg>`;
}

export function renderFingerprint(model) {
  return JSON.stringify({ viewport: model.viewport, settings: model.settings, rows: model.rows });
}
