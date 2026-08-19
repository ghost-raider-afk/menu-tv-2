const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const HEX = /^#[0-9a-f]{6}$/i;

export const MENU_REFERENCE = Object.freeze({
  width: 2048,
  height: 1152,
  tableX: 15,
  tableRight: 1605,
  tableWidth: 1590,
  primaryBoundary: 1231,
  secondaryBoundary: 1417,
  tableTop: 64,
  tableBottom: 1032,
  firstSectionHeight: 62,
  sectionHeight: 54,
  sectionGap: 15,
  itemHeight: 48,
  packagingHeight: 54,
  fontScaleMinPercent: 55,
  fontScaleMaxPercent: 130
});

export const MENU_TABLE_STYLE = Object.freeze({
  defaultBackground: '#101828',
  defaultAccent: '#F4C915',
  defaultText: '#F4F7FA',
  darkText: '#101317',
  separator: '#E2E6EA',
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

function priceParts(value) {
  if (!value) return null;
  const normalized = String(value).replace(',', '.');
  const [whole = '0', decimal = ''] = normalized.split('.');
  return { whole, cents: decimal.padEnd(2, '0').slice(0, 2) };
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
  return Object.freeze({
    background,
    accent,
    sectionText: foregroundFor(accent),
    primaryText: readableColor(settings.text_color, background),
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
        strength: product?.strength || '',
        producer: product?.producer || '',
        characteristics: row.characteristics || product?.characteristics || '',
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
  const effectivePercent = Math.max(
    MENU_REFERENCE.fontScaleMinPercent,
    Math.min(requestedPercent, fitPercent)
  );
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
    palette: buildMenuPalette(model.settings)
  });
}

function separatorMarkup(y, horizontal, scale) {
  return `<line x1="${horizontal.left}" y1="${y}" x2="${horizontal.right}" y2="${y}" class="separator" stroke-width="${Math.max(1.8, 2.6 * scale)}"/>`;
}

function verticalSeparatorsMarkup(box, horizontal, scale) {
  const width = Math.max(1.8, 2.6 * scale);
  return `<line x1="${horizontal.primaryBoundary}" y1="${box.top}" x2="${horizontal.primaryBoundary}" y2="${box.bottom}" class="separator" stroke-width="${width}"/>
    <line x1="${horizontal.secondaryBoundary}" y1="${box.top}" x2="${horizontal.secondaryBoundary}" y2="${box.bottom}" class="separator" stroke-width="${width}"/>`;
}

function bottleMarkup(x, y, scale) {
  return `<g transform="translate(${x} ${y}) scale(${scale})" class="bottle" aria-hidden="true">
    <path d="M8 0h10v6l-2 3v4c5 3 7 7 7 13v24c0 5-3 8-8 8H11c-5 0-8-3-8-8V26c0-6 2-10 7-13V9L8 6Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M7 20h12M5 43h16" fill="none" stroke="currentColor" stroke-width="1.8"/>
  </g>`;
}

function priceMarkup(value, x, baseline, scale, tone) {
  const parts = priceParts(value);
  if (!parts) return `<text x="${x}" y="${baseline}" class="price tone-${tone}">—</text>`;
  return `<text x="${x}" y="${baseline}" class="price tone-${tone}">${escapeXml(parts.whole)}<tspan class="cents" dx="2" dy="${-17 * scale}">${escapeXml(parts.cents)}</tspan></text>`;
}

function promotionMarkup(line, x, box, scale) {
  if (!line.promotion || !line.promotionText) return { markup: '', width: 0 };
  const text = truncateText(line.promotionText, 12);
  const width = Math.min(132 * scale, Math.max(72 * scale, (text.length * 9 + 24) * scale));
  const height = 27 * scale;
  const top = box.top + (box.height - height) / 2;
  const notch = 9 * scale;
  return {
    width,
    markup: `<path d="M${x} ${top}H${x + width - notch}L${x + width} ${top + height / 2}L${x + width - notch} ${top + height}H${x}Z" fill="${MENU_TABLE_STYLE.promotion}"/>
      <text x="${x + (width - notch) / 2}" y="${top + 18.5 * scale}" class="promotion" text-anchor="middle">${escapeXml(text)}</text>`
  };
}

function sectionMarkup(line, box, horizontal, palette, scale) {
  const title = String(line.name || 'Меню').toUpperCase();
  const titleMax = Math.max(12, Math.floor((horizontal.nameWidth - 18) / (27 * scale)));
  const baseline = box.top + box.height * 0.76;
  const labelY = box.top + box.height * 0.72;
  const primaryCenter = (horizontal.primaryBoundary + horizontal.secondaryBoundary) / 2;
  const secondaryCenter = (horizontal.secondaryBoundary + horizontal.right) / 2;
  const labelMarkup = line.showPriceLabels ? `
      ${bottleMarkup(horizontal.primaryBoundary + 27 * scale, box.top + 4 * scale, 0.72 * scale)}
      <text x="${primaryCenter + 18 * scale}" y="${labelY}" class="price-label" text-anchor="middle">1,0л.</text>
      ${bottleMarkup(horizontal.secondaryBoundary + 28 * scale, box.top + 4 * scale, 0.72 * scale)}
      <text x="${secondaryCenter + 18 * scale}" y="${labelY}" class="price-label" text-anchor="middle">1,5л.</text>` : '';
  return `<g class="table-section">
    <rect x="${horizontal.left}" y="${box.top}" width="${horizontal.tableWidth}" height="${box.height}" fill="${palette.accent}"/>
    <text x="${horizontal.left + 1 * scale}" y="${baseline}" class="section-title">${escapeXml(truncateText(title, titleMax))}</text>
    ${verticalSeparatorsMarkup(box, horizontal, scale)}
    ${separatorMarkup(box.bottom, horizontal, scale)}
    ${labelMarkup}
  </g>`;
}

function itemMarkup(line, box, horizontal, scale) {
  const tone = line.tone === 'accent' ? 'accent' : 'light';
  const nameX = horizontal.left + 1 * scale;
  const promotion = promotionMarkup(line, nameX, box, scale);
  const contentX = nameX + (promotion.width ? promotion.width + 11 * scale : 0);
  const mainLabel = line.strength ? `${line.name} - ${line.strength}` : line.name;
  const producerReserve = line.producer ? 290 * scale : 0;
  const mainMaxChars = Math.max(10, Math.floor((horizontal.primaryBoundary - contentX - producerReserve - 12) / (19 * scale)));
  const fittedMain = truncateText(String(mainLabel || '').toUpperCase(), mainMaxChars);
  const estimatedMainWidth = fittedMain.length * 19 * scale;
  const producerX = Math.min(horizontal.primaryBoundary - 40 * scale, contentX + estimatedMainWidth + 14 * scale);
  const hasDetails = Boolean(line.characteristics);
  const mainBaseline = box.top + (hasDetails ? 27 : 36) * scale;
  const detailBaseline = box.top + 44 * scale;
  const priceBaseline = box.top + 38 * scale;
  const detailMax = Math.max(18, Math.floor((horizontal.primaryBoundary - contentX - 15) / (9 * scale)));
  const producerMax = Math.max(8, Math.floor((horizontal.primaryBoundary - producerX - 12) / (8.5 * scale)));

  return `<g class="table-item tone-${tone}">
    ${promotion.markup}
    <text x="${contentX}" y="${mainBaseline}" class="item-name tone-${tone}">${escapeXml(fittedMain)}</text>
    ${line.producer ? `<text x="${producerX}" y="${mainBaseline}" class="producer tone-${tone}">${escapeXml(truncateText(line.producer, producerMax))}</text>` : ''}
    ${line.characteristics ? `<text x="${contentX}" y="${detailBaseline}" class="details tone-${tone}">${escapeXml(truncateText(line.characteristics, detailMax))}</text>` : ''}
    ${priceMarkup(line.pricePrimary, horizontal.primaryBoundary + 3 * scale, priceBaseline, scale, tone)}
    ${priceMarkup(line.priceSecondary, horizontal.secondaryBoundary + 3 * scale, priceBaseline, scale, tone)}
    ${verticalSeparatorsMarkup(box, horizontal, scale)}
    ${separatorMarkup(box.bottom, horizontal, scale)}
  </g>`;
}

function packagingMarkup(line, box, horizontal, scale) {
  const gap = 12 * scale;
  const cellWidth = (horizontal.tableWidth - gap) / 2;
  const top = box.top + 3 * scale;
  const height = box.height - 6 * scale;
  const cells = line.items.map((item, index) => {
    const x = horizontal.left + index * (cellWidth + gap);
    const tone = item.tone === 'accent' ? 'accent' : 'light';
    const nameMax = Math.max(8, Math.floor((cellWidth - 190 * scale) / (12 * scale)));
    const parts = priceParts(item.unitPrice);
    const price = parts ? `${parts.whole},${parts.cents}` : '—';
    return `<g class="packaging-cell tone-${tone}">
      <rect x="${x}" y="${top}" width="${cellWidth}" height="${height}" rx="4" fill="${MENU_TABLE_STYLE.packagingBackground}" stroke="currentColor" stroke-width="${Math.max(1.5, 2 * scale)}"/>
      <text x="${x + 14 * scale}" y="${box.top + 36 * scale}" class="packaging-name tone-${tone}">${escapeXml(truncateText(item.name, nameMax))}</text>
      <text x="${x + cellWidth - 14 * scale}" y="${box.top + 36 * scale}" class="packaging-price tone-${tone}" text-anchor="end">${escapeXml(price)}</text>
    </g>`;
  }).join('\n');
  return `<g class="table-packaging">${cells}${separatorMarkup(box.bottom, horizontal, scale)}</g>`;
}

export function buildTableSvg(model, lines, layout = buildRenderLayout(model, lines)) {
  const { palette, horizontal, vertical } = layout;
  const scale = vertical.scale;
  const content = lines.map((line, index) => {
    const box = vertical.boxes[index];
    if (line.kind === 'section') return sectionMarkup(line, box, horizontal, palette, scale);
    if (line.kind === 'packaging') return packagingMarkup(line, box, horizontal, scale);
    return itemMarkup(line, box, horizontal, scale);
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" class="menu-table-svg" width="${model.viewport.width}" height="${model.viewport.height}" viewBox="0 0 ${MENU_REFERENCE.width} ${MENU_REFERENCE.height}" preserveAspectRatio="xMinYMin meet" aria-label="Предпросмотр таблицы меню">
    <style>
      text{font-family:"Arial Narrow","Liberation Sans Narrow","DejaVu Sans Condensed",Arial,sans-serif;font-stretch:condensed}
      .separator{stroke:${MENU_TABLE_STYLE.separator};stroke-dasharray:${8 * scale} ${7 * scale};opacity:.92}
      .section-title{font-size:${50 * scale}px;font-weight:900;letter-spacing:-1.1px;fill:${palette.sectionText}}
      .price-label{font-size:${36 * scale}px;font-weight:900;letter-spacing:-.6px;fill:${palette.sectionText}}
      .bottle{color:${palette.sectionText}}
      .item-name{font-size:${39 * scale}px;font-weight:900;letter-spacing:-.65px}
      .producer{font-size:${17 * scale}px;font-weight:800;letter-spacing:-.15px}
      .details{font-size:${15 * scale}px;font-weight:750;opacity:.82}
      .price{font-size:${43 * scale}px;font-weight:900;letter-spacing:-.7px}
      .cents{font-size:${22 * scale}px;font-weight:900}
      .promotion{font-size:${15 * scale}px;font-weight:900;fill:#fff;letter-spacing:.1px}
      .packaging-name,.packaging-price{font-size:${23 * scale}px;font-weight:900}
      .tone-light{fill:${palette.primaryText};color:${palette.primaryText}}
      .tone-accent{fill:${palette.accentText};color:${palette.accentText}}
    </style>
    ${content}
  </svg>`;
}

export function renderFingerprint(model) {
  return JSON.stringify({ viewport: model.viewport, settings: model.settings, rows: model.rows });
}
