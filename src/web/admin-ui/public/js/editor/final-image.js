import { buildDisplayLines, buildRenderModel, MENU_TABLE_STYLE, tableWidthFactor } from './renderer.js';
import { parseResolution } from './settings.js';

const FONT_SCALE = { small: 0.88, medium: 1, large: 1.15 };
const displayPrice = (value) => value ? `${String(value).replace('.', ',')} ₽` : '—';

function fitText(ctx, text, maxWidth) {
  const source = String(text || '');
  if (ctx.measureText(source).width <= maxWidth) return source;
  let result = source;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1);
  return `${result}…`;
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

function drawSection(ctx, line, layout) {
  const { left, top, tableWidth, rowHeight, scale, accent, primaryPriceX, secondaryPriceX, padding } = layout;
  const height = Math.max(28, rowHeight - 4);
  ctx.fillStyle = accent;
  roundedRect(ctx, left, top + 2, tableWidth, height - 4, Math.max(5, 5 * scale));
  ctx.fill();

  const fontSize = Math.max(20, Math.round(28 * scale));
  ctx.fillStyle = MENU_TABLE_STYLE.darkText;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `700 ${fontSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
  const labelReserve = line.showPriceLabels ? Math.max(240 * scale, tableWidth * 0.27) : 0;
  ctx.fillText(fitText(ctx, line.name || 'Меню', tableWidth - padding * 2 - labelReserve), left + padding, top + rowHeight / 2);

  if (line.showPriceLabels) {
    ctx.textAlign = 'right';
    ctx.font = `700 ${Math.max(16, Math.round(22 * scale))}px system-ui, -apple-system, Segoe UI, sans-serif`;
    ctx.fillText('1 л', primaryPriceX, top + rowHeight / 2);
    ctx.fillText('1,5 л', secondaryPriceX, top + rowHeight / 2);
  }
}

function drawPromotion(ctx, text, x, centerY, scale) {
  const fontSize = Math.max(10, Math.round(12 * scale));
  ctx.font = `800 ${fontSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
  const width = Math.min(130 * scale, Math.max(68 * scale, ctx.measureText(text).width + 24 * scale));
  const height = Math.max(22, 27 * scale);
  ctx.fillStyle = MENU_TABLE_STYLE.promotion;
  roundedRect(ctx, x, centerY - height / 2, width, height, 4 * scale);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitText(ctx, text, width - 14 * scale), x + width / 2, centerY);
  return width;
}

function drawItem(ctx, line, layout) {
  const { left, right, top, rowHeight, scale, accent, primaryPriceX, secondaryPriceX, padding } = layout;
  const centerY = top + rowHeight / 2;
  const tone = line.tone === 'accent' ? accent : MENU_TABLE_STYLE.lightText;
  const bodySize = Math.max(18, Math.round(25 * scale));
  const detailSize = Math.max(12, Math.round(14 * scale));

  ctx.save();
  ctx.strokeStyle = MENU_TABLE_STYLE.separator;
  ctx.globalAlpha = 0.65;
  ctx.lineWidth = Math.max(1, scale);
  ctx.setLineDash([6 * scale, 7 * scale]);
  ctx.beginPath();
  ctx.moveTo(left + 9, top + rowHeight - 2);
  ctx.lineTo(right, top + rowHeight - 2);
  ctx.stroke();
  ctx.restore();

  let nameX = left + padding;
  if (line.promotion && line.promotionText) {
    nameX += drawPromotion(ctx, line.promotionText, nameX, line.characteristics ? centerY - detailSize * 0.35 : centerY, scale) + 11 * scale;
  }

  const nameMaxWidth = Math.max(80, primaryPriceX - nameX - padding);
  ctx.fillStyle = tone;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${bodySize}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.fillText(fitText(ctx, line.name, nameMaxWidth), nameX, line.characteristics ? centerY - detailSize * 0.45 : centerY);

  if (line.characteristics) {
    ctx.globalAlpha = 0.78;
    ctx.font = `400 ${detailSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
    ctx.fillText(fitText(ctx, line.characteristics, primaryPriceX - left - padding * 2), left + padding, centerY + detailSize * 0.8);
    ctx.globalAlpha = 1;
  }

  ctx.textAlign = 'right';
  ctx.font = `700 ${Math.max(19, Math.round(27 * scale))}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.fillStyle = tone;
  ctx.fillText(displayPrice(line.pricePrimary), primaryPriceX, centerY);
  ctx.fillText(displayPrice(line.priceSecondary), secondaryPriceX, centerY);
}

function drawPackaging(ctx, line, layout) {
  const { left, top, tableWidth, rowHeight, scale, accent, padding } = layout;
  const gap = Math.max(8, 12 * scale);
  const cellWidth = (tableWidth - gap) / 2;
  line.items.forEach((item, index) => {
    const x = left + index * (cellWidth + gap);
    const tone = item.tone === 'accent' ? accent : MENU_TABLE_STYLE.lightText;
    ctx.fillStyle = MENU_TABLE_STYLE.packagingBackground;
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1, 1.5 * scale);
    roundedRect(ctx, x, top + 3, cellWidth, rowHeight - 7, Math.max(5, 7 * scale));
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = tone;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `700 ${Math.max(17, Math.round(21 * scale))}px system-ui, -apple-system, Segoe UI, sans-serif`;
    const priceReserve = Math.max(130, cellWidth * 0.32);
    ctx.fillText(fitText(ctx, item.name, cellWidth - priceReserve - padding * 2), x + padding, top + rowHeight / 2);
    ctx.textAlign = 'right';
    ctx.font = `700 ${Math.max(18, Math.round(24 * scale))}px system-ui, -apple-system, Segoe UI, sans-serif`;
    ctx.fillText(item.unitPrice ? `${displayPrice(item.unitPrice)} / шт.` : '—', x + cellWidth - padding, top + rowHeight / 2);
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
  const tableWidth = Math.round(width * tableWidthFactor(settings.table_width));
  const left = Math.round((width - tableWidth) / 2);
  const right = left + tableWidth;
  const padding = Math.max(18, Math.round(width * 0.012));
  const accent = settings.accent_color || MENU_TABLE_STYLE.defaultAccent;

  await drawBackground(ctx, settings, width, height);

  const titleSize = Math.max(34, Math.round(width * 0.032 * scale));
  ctx.fillStyle = settings.text_color || MENU_TABLE_STYLE.lightText;
  ctx.font = `700 ${titleSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitText(ctx, settings.title || screen?.name || 'Меню', tableWidth), width / 2, Math.round(height * 0.09));

  const tableTop = Math.round(height * 0.17);
  const tableBottom = Math.round(height * 0.055);
  const availableHeight = height - tableTop - tableBottom;
  const rowHeight = Math.max(38, Math.floor(availableHeight / Math.max(lines.length, 1)));
  const secondaryPriceX = right - padding;
  const primaryPriceX = secondaryPriceX - Math.max(125, 140 * scale);

  lines.forEach((line, index) => {
    const layout = {
      left,
      right,
      top: tableTop + index * rowHeight,
      tableWidth,
      rowHeight,
      scale,
      accent,
      padding,
      primaryPriceX,
      secondaryPriceX
    };
    if (line.kind === 'section') drawSection(ctx, line, layout);
    else if (line.kind === 'item') drawItem(ctx, line, layout);
    else if (line.kind === 'packaging') drawPackaging(ctx, line, layout);
  });

  return canvasBlob(canvas);
}
