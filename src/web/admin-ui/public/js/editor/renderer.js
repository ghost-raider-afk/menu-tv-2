const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

export const MENU_TABLE_STYLE = Object.freeze({
  defaultAccent: '#F4C915',
  lightText: '#F4F7FA',
  darkText: '#101317',
  mutedText: '#C5CBD2',
  separator: '#D8DDE2',
  packagingBackground: '#121820',
  promotion: '#D92D35',
  leftMarginFactor: 0.008,
  nameColumnFactor: 0.76,
  primaryPriceFactor: 0.12,
  secondaryPriceFactor: 0.12
});

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

/**
 * Builds a renderer-neutral visual model. Both browser preview and final-image
 * generation consume this model instead of implementing layout rules independently.
 */
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

/**
 * Canonical TV table lines. Preview and JPEG consume exactly the same structure.
 * The first section is the table header; there is no separate title above it.
 */
export function buildDisplayLines(model, { products = [], packaging = [], fallbackTitle = 'Меню' } = {}) {
  const lines = [];
  let toneIndex = 0;
  let firstSectionSeen = false;

  const sourceRows = model.rows.length
    ? model.rows
    : [{ id: 'render-base-section', kind: 'section', name: model.settings.title || fallbackTitle, enabled: true, renderIndex: -1 }];

  if (sourceRows[0]?.kind !== 'section') {
    lines.push(Object.freeze({
      kind: 'section',
      name: model.settings.title || fallbackTitle,
      showPriceLabels: true,
      virtual: true
    }));
    firstSectionSeen = true;
  }

  for (const row of sourceRows) {
    if (row.kind === 'section') {
      lines.push(Object.freeze({
        kind: 'section',
        name: row.name || model.settings.title || fallbackTitle,
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

export function renderFingerprint(model) {
  return JSON.stringify({ viewport: model.viewport, settings: model.settings, rows: model.rows });
}
