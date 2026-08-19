const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

export const MENU_TABLE_STYLE = Object.freeze({
  defaultBackground: '#101828',
  defaultAccent: '#F4C915',
  defaultText: '#F4F7FA',
  darkText: '#101317',
  separator: '#D8DDE2',
  packagingBackground: '#121820',
  promotion: '#D92D35',
  imageBackdrop: '#0B1017',
  imageBackdropOpacity: 0.72,
  leftMarginFactor: 0.008,
  topFactor: 0.055,
  bottomFactor: 0.12,
  nameColumnFactor: 0.76,
  primaryPriceFactor: 0.12,
  secondaryPriceFactor: 0.12,
  minRowHeight: 38,
  maxRowHeight: 58
});

const FONT_SCALE = Object.freeze({ small: 0.88, medium: 1, large: 1.15 });
const HEX = /^#[0-9a-f]{6}$/i;

function numeric(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
  const hex = normalizeHex(value, '#000000').slice(1);
  const parsed = Number.parseInt(hex, 16);
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
  return contrast(background, '#101317') >= contrast(background, '#FFFFFF') ? '#101317' : '#FFFFFF';
}

function readableColor(source, background) {
  const color = normalizeHex(source, MENU_TABLE_STYLE.defaultText);
  if (contrast(color, background) >= 4.5) return color;
  const target = contrast('#FFFFFF', background) >= contrast('#101317', background) ? '#FFFFFF' : '#101317';
  for (let step = 1; step <= 10; step += 1) {
    const candidate = mix(color, target, step / 10);
    if (contrast(candidate, background) >= 4.5) return candidate;
  }
  return target;
}

export function buildMenuPalette(settings = {}) {
  const background = normalizeHex(settings.background_color, MENU_TABLE_STYLE.defaultBackground);
  const accent = normalizeHex(settings.accent_color, MENU_TABLE_STYLE.defaultAccent);
  const effectiveBodyBackground = settings.background_image_url ? MENU_TABLE_STYLE.imageBackdrop : background;
  return Object.freeze({
    background,
    accent,
    sectionText: foregroundFor(accent),
    primaryText: readableColor(settings.text_color, effectiveBodyBackground),
    accentText: readableColor(accent, effectiveBodyBackground),
    imageBackdropOpacity: settings.background_image_url ? MENU_TABLE_STYLE.imageBackdropOpacity : 0
  });
}

export function menuFontScale(value) {
  return FONT_SCALE[value] || 1;
}

export function tableWidthFactor(value) {
  return ({ compact: 0.68, normal: 0.78, wide: 0.88 })[value] || 0.78;
}

export function buildTableLayout(viewportWidth, tableWidthSetting = 'normal') {
  const tableWidth = Math.round(viewportWidth * tableWidthFactor(tableWidthSetting));
  const left = Math.max(8, Math.round(viewportWidth * MENU_TABLE_STYLE.leftMarginFactor));
  const primaryBoundary = left + Math.round(tableWidth * MENU_TABLE_STYLE.nameColumnFactor);
  const secondaryBoundary = primaryBoundary + Math.round(tableWidth * MENU_TABLE_STYLE.primaryPriceFactor);
  return Object.freeze({
    left,
    right: left + tableWidth,
    tableWidth,
    primaryBoundary,
    secondaryBoundary,
    primaryCenter: primaryBoundary + Math.round(tableWidth * MENU_TABLE_STYLE.primaryPriceFactor / 2),
    secondaryCenter: secondaryBoundary + Math.round(tableWidth * MENU_TABLE_STYLE.secondaryPriceFactor / 2)
  });
}

export function buildVerticalLayout(viewportHeight, lineCount, fontScaleSetting = 'medium') {
  const height = Math.max(1, Math.round(numeric(viewportHeight, DEFAULT_HEIGHT)));
  const count = Math.max(1, Number.isInteger(lineCount) ? lineCount : 1);
  const scale = menuFontScale(fontScaleSetting);
  const top = Math.round(height * MENU_TABLE_STYLE.topFactor);
  const bottom = Math.round(height * MENU_TABLE_STYLE.bottomFactor);
  const availableHeight = Math.max(1, height - top - bottom);
  const minRowHeight = Math.max(1, Math.round(MENU_TABLE_STYLE.minRowHeight * scale));
  const maxRowHeight = Math.max(minRowHeight, Math.round(MENU_TABLE_STYLE.maxRowHeight * scale));
  const naturalHeight = Math.floor(availableHeight / count);
  const fits = naturalHeight >= minRowHeight;
  const rowHeight = clamp(naturalHeight, minRowHeight, maxRowHeight);
  return Object.freeze({
    top,
    bottom,
    availableHeight,
    rowHeight,
    minRowHeight,
    maxRowHeight,
    usedHeight: rowHeight * count,
    lineCount: count,
    fits,
    scale
  });
}

export function buildRenderModel(editorState, viewport = {}) {
  const width = Math.max(1, Math.round(numeric(viewport.width, DEFAULT_WIDTH)));
  const height = Math.max(1, Math.round(numeric(viewport.height, DEFAULT_HEIGHT)));
  const settings = structuredClone(editorState?.settings || {});
  const rows = enabledRows(Array.isArray(editorState?.rows) ? editorState.rows : []);

  return Object.freeze({
    viewport: Object.freeze({ width, height, aspectRatio: width / height }),
    settings: Object.freeze(settings),
    rows: Object.freeze(rows.map((row, index) => Object.freeze({
      ...structuredClone(row),
      renderIndex: index
    })))
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
    lines.push(Object.freeze({
      kind: 'section',
      name: fallbackTitle,
      showPriceLabels: true,
      virtual: true
    }));
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
  return Object.freeze({
    horizontal: buildTableLayout(model.viewport.width, model.settings.table_width),
    vertical: buildVerticalLayout(model.viewport.height, lines.length, model.settings.font_scale),
    palette: buildMenuPalette(model.settings)
  });
}

export function renderFingerprint(model) {
  return JSON.stringify({ viewport: model.viewport, settings: model.settings, rows: model.rows });
}
