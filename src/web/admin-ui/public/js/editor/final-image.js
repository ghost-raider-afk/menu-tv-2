import { buildDisplayLines, buildRenderModel, buildTableLayout, MENU_TABLE_STYLE } from './renderer.js';
import { parseResolution } from './settings.js';

const FONT_SCALE = { small: 0.88, medium: 1, large: 1.15 };

function fitText(ctx, text, maxWidth) {
  const source = String(text || '');
  if (ctx.measureText(source).width <= maxWidth) return source;
  let result = source;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1);
  return `${result}…`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Не удалось сформировать JPEG.')),
    'image/jpeg',
    0.92
  ));
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не удалось загрузить фоновое изображение шаблона.'));
    image.src = url;
  });
}

async function drawBackground(ctx, settings, width, height) {
  ctx.fillStyle = settings.background_color || '#101828';
  ctx.fillRect(0, 0, width, height);
  if (!settings.background_image_url) return;
  const image = await loadImage(settings.background_image_url);
  ctx.drawImage(image, 0, 0, width, height);
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawDashedLine(ctx, x1, y1, x2, y2, scale = 1, alpha = 0.82) {
  ctx.save();
  ctx.strokeStyle = MENU_TABLE_STYLE.separator;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = Math.max(1, 1.4 * scale);
  ctx.setLineDash([8 * scale, 7 * scale]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function drawColumnSeparators(ctx, layout) {
  drawDashedLine(ctx, layout.primaryBoundary, layout.top, layout.primaryBoundary, layout.top + layout.rowHeight, layout.scale, 0.92);
  drawDashedLine(ctx, layout.secondaryBoundary, layout.top, layout.secondaryBoundary, layout.top + layout.rowHeight, layout.scale, 0.92);
}

function priceParts(value) {
  if (!value) return null;
  const normalized = String(value).replace(',', '.');
  const [whole = '0', decimal = ''] = normalized.split('.');
  return { whole, cents: decimal.padEnd(2, '0').slice(0, 2) };
}

function drawPrice(ctx, value, x, centerY, tone, scale) {
  const parts = priceParts(value);
  ctx.fillStyle = tone;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  if (!parts) {
    ctx.font = `900 ${Math.max(21, Math.round(30 * scale))}px Arial, sans-serif`;
    ctx.fillText('—', x, centerY);
    return;
  }

  const wholeSize = Math.max(23, Math.round(32 * scale));
  const centsSize = Math.max(12, Math.round(17 * scale));
  ctx.font = `900 ${wholeSize}px Arial, sans-serif`;
  ctx.fillText(parts.whole, x, centerY);
  const wholeWidth = ctx.measureText(parts.whole).width;
  ctx.font = `900 ${centsSize}px Arial, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(parts.cents, x + wholeWidth + 2 * scale, centerY - 7 * scale);
}

function drawSection(ctx, line, layout) {
  const { left, top, tableWidth, rowHeight, scale, accent, primaryBoundary, secondaryBoundary, right } = layout;
  ctx.fillStyle = accent;
  ctx.fillRect(left, top + 1, tableWidth, rowHeight - 3);

  ctx.fillStyle = MENU_TABLE_STYLE.darkText;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `900 ${Math.max(23, Math.round(31 * scale))}px Arial, sans-serif`;
  const titleRight = line.showPriceLabels ? primaryBoundary : right;
  ctx.fillText(fitText(ctx, line.name || 'Меню', titleRight - left - 22 * scale), left + 10 * scale, top + rowHeight / 2 + 1);

  drawColumnSeparators(ctx, layout);

  if (line.showPriceLabels) {
    ctx.font = `900 ${Math.max(18, Math.round(23 * scale))}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('1,0 л.', (primaryBoundary + secondaryBoundary) / 2, top + rowHeight / 2 + 1);
    ctx.fillText('1,5 л.', (secondaryBoundary + right) / 2, top + rowHeight / 2 + 1);
  }
}

function drawPromotion(ctx, text, x, centerY, scale) {
  const fontSize = Math.max(10, Math.round(12 * scale));
  ctx.font = `900 ${fontSize}px Arial, sans-serif`;
  const width = Math.min(128 * scale, Math.max(64 * scale, ctx.measureText(text).width + 20 * scale));
  const height = Math.max(21, 25 * scale);
  ctx.fillStyle = MENU_TABLE_STYLE.promotion;
  roundedRect(ctx, x, centerY - height / 2, width, height, 3 * scale);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitText(ctx, text, width - 12 * scale), x + width / 2, centerY);
  return width;
}

function drawItem(ctx, line, layout) {
  const { left, right, top, rowHeight, scale, accent, primaryBoundary, secondaryBoundary } = layout;
  const centerY = top + rowHeight / 2;
  const tone = line.tone === 'accent' ? accent : MENU_TABLE_STYLE.lightText;
  const bodySize = Math.max(20, Math.round(27 * scale));
  const producerSize = Math.max(11, Math.round(13 * scale));
  const detailSize = Math.max(10, Math.round(12 * scale));
  const padding = Math.max(8, Math.round(10 * scale));

  drawDashedLine(ctx, left, top + rowHeight - 2, right, top + rowHeight - 2, scale, 0.82);
  drawColumnSeparators(ctx, layout);

  let contentX = left + padding;
  if (line.promotion && line.promotionText) {
    contentX += drawPromotion(ctx, line.promotionText, contentX, centerY - (line.characteristics ? 5 * scale : 0), scale) + 9 * scale;
  }

  const contentRight = primaryBoundary - padding;
  const mainLabel = line.strength ? `${line.name} - ${line.strength}` : line.name;
  const mainY = line.characteristics ? centerY - 7 * scale : centerY;

  ctx.fillStyle = tone;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${bodySize}px Arial, sans-serif`;

  const available = contentRight - contentX;
  const producerReserve = line.producer ? clamp(available * 0.34, 120 * scale, 330 * scale) : 0;
  const mainMaxWidth = Math.max(80, available - producerReserve - (line.producer ? 12 * scale : 0));
  const fittedMain = fitText(ctx, mainLabel, mainMaxWidth);
  ctx.fillText(fittedMain, contentX, mainY);

  if (line.producer) {
    const producerX = contentX + ctx.measureText(fittedMain).width + 12 * scale;
    if (producerX < contentRight - 28 * scale) {
      ctx.font = `800 ${producerSize}px Arial, sans-serif`;
      ctx.globalAlpha = 0.96;
      ctx.fillText(fitText(ctx, line.producer, contentRight - producerX), producerX, mainY + 1);
      ctx.globalAlpha = 1;
    }
  }

  if (line.characteristics) {
    ctx.font = `700 ${detailSize}px Arial, sans-serif`;
    ctx.globalAlpha = 0.76;
    ctx.fillText(fitText(ctx, line.characteristics, contentRight - contentX), contentX, centerY + 13 * scale);
    ctx.globalAlpha = 1;
  }

  drawPrice(ctx, line.pricePrimary, primaryBoundary + 13 * scale, centerY, tone, scale);
  drawPrice(ctx, line.priceSecondary, secondaryBoundary + 13 * scale, centerY, tone, scale);
}

function drawPackaging(ctx, line, layout) {
  const { left, right, top, rowHeight, scale, accent, primaryBoundary, secondaryBoundary } = layout;
  drawDashedLine(ctx, left, top + rowHeight - 2, right, top + rowHeight - 2, scale, 0.82);
  drawColumnSeparators(ctx, layout);

  const gap = Math.max(8, 12 * scale);
  const contentWidth = primaryBoundary - left;
  const cellWidth = (contentWidth - gap) / 2;
  line.items.forEach((item, index) => {
    const x = left + index * (cellWidth + gap);
    const tone = item.tone === 'accent' ? accent : MENU_TABLE_STYLE.lightText;
    ctx.fillStyle = 'rgba(18,24,32,.92)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1, 1.4 * scale);
    roundedRect(ctx, x + 2, top + 5, cellWidth - 4, rowHeight - 10, 4 * scale);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = tone;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `900 ${Math.max(17, Math.round(20 * scale))}px Arial, sans-serif`;
    ctx.fillText(fitText(ctx, item.name, cellWidth - 145 * scale), x + 12 * scale, top + rowHeight / 2);
    ctx.textAlign = 'right';
    const parts = priceParts(item.unitPrice);
    ctx.fillText(parts ? `${parts.whole},${parts.cents}` : '—', x + cellWidth - 12 * scale, top + rowHeight / 2);
  });
}

export async function renderFinalJpeg(editorState, { screen, products, packaging }) {
  const resolution = parseResolution(screen?.resolution);
  const model = buildRenderModel(editorState, resolution);
  const lines = buildDisplayLines(model, { products, packaging, fallbackTitle: screen?.name || 'Меню' });
  const { width, height } = model.viewport;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Браузер не поддерживает Canvas 2D.');

  const settings = model.settings || {};
  const scale = FONT_SCALE[settings.font_scale] || 1;
  const table = buildTableLayout(width, settings.table_width);
  const accent = settings.accent_color || MENU_TABLE_STYLE.defaultAccent;

  await drawBackground(ctx, settings, width, height);

  const tableTop = Math.round(height * 0.055);
  const tableBottom = Math.round(height * 0.12);
  const availableHeight = height - tableTop - tableBottom;
  const naturalHeight = Math.floor(availableHeight / Math.max(lines.length, 1));
  const rowHeight = clamp(naturalHeight, Math.round(38 * scale), Math.round(58 * scale));

  lines.forEach((line, index) => {
    const layout = {
      ...table,
      top: tableTop + index * rowHeight,
      rowHeight,
      scale,
      accent
    };
    if (line.kind === 'section') drawSection(ctx, line, layout);
    else if (line.kind === 'item') drawItem(ctx, line, layout);
    else if (line.kind === 'packaging') drawPackaging(ctx, line, layout);
  });

  return canvasBlob(canvas);
}
