import { buildDisplayLines, buildRenderLayout, buildRenderModel, MENU_TABLE_STYLE } from './renderer.js';
import { parseResolution } from './settings.js';

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

function drawImageCover(ctx, image, width, height) {
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

async function drawBackground(ctx, settings, palette, width, height) {
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);
  if (!settings.background_image_url) return;
  const image = await loadImage(settings.background_image_url);
  drawImageCover(ctx, image, width, height);
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

function drawCompactPriceRight(ctx, value, rightX, centerY, tone, scale) {
  const parts = priceParts(value);
  ctx.fillStyle = tone;
  if (!parts) {
    ctx.font = `900 ${Math.max(15, Math.round(20 * scale))}px Arial, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('—', rightX, centerY);
    return;
  }
  const wholeSize = Math.max(15, Math.round(20 * scale));
  const centsSize = Math.max(9, Math.round(11 * scale));
  ctx.font = `900 ${centsSize}px Arial, sans-serif`;
  const centsWidth = ctx.measureText(parts.cents).width;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(parts.cents, rightX, centerY - 5 * scale);
  ctx.font = `900 ${wholeSize}px Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(parts.whole, rightX - centsWidth - 2 * scale, centerY);
}

function drawSection(ctx, line, layout, palette) {
  const { left, top, tableWidth, rowHeight, scale, primaryBoundary, secondaryBoundary, right } = layout;
  ctx.fillStyle = palette.accent;
  ctx.fillRect(left, top + 1, tableWidth, rowHeight - 3);

  ctx.fillStyle = palette.sectionText;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `900 ${Math.max(23, Math.round(31 * scale))}px Arial, sans-serif`;
  ctx.fillText(fitText(ctx, line.name || 'Меню', primaryBoundary - left - 22 * scale), left + 10 * scale, top + rowHeight / 2 + 1);

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

function drawItem(ctx, line, layout, palette) {
  const { left, right, top, rowHeight, scale, primaryBoundary, secondaryBoundary } = layout;
  const centerY = top + rowHeight / 2;
  const tone = line.tone === 'accent' ? palette.accentText : palette.primaryText;
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

function drawPackaging(ctx, line, layout, palette) {
  const { left, right, top, rowHeight, scale, primaryBoundary } = layout;
  drawDashedLine(ctx, left, top + rowHeight - 2, right, top + rowHeight - 2, scale, 0.82);
  drawColumnSeparators(ctx, layout);

  const gap = Math.max(8, 12 * scale);
  const contentWidth = primaryBoundary - left;
  const cellWidth = (contentWidth - gap) / 2;
  line.items.forEach((item, index) => {
    const x = left + index * (cellWidth + gap);
    const tone = item.tone === 'accent' ? palette.accentText : palette.primaryText;
    ctx.fillStyle = 'rgba(18,24,32,.92)';
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = Math.max(1, 1.4 * scale);
    roundedRect(ctx, x + 2, top + 5, cellWidth - 4, rowHeight - 10, 4 * scale);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = tone;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `900 ${Math.max(17, Math.round(20 * scale))}px Arial, sans-serif`;
    ctx.fillText(fitText(ctx, item.name, cellWidth - 145 * scale), x + 12 * scale, top + rowHeight / 2);
    drawCompactPriceRight(ctx, item.unitPrice, x + cellWidth - 12 * scale, top + rowHeight / 2, tone, scale);
  });
}

export async function renderFinalJpeg(editorState, { screen, products, packaging }) {
  const resolution = parseResolution(screen?.resolution);
  if (!resolution) throw new Error('Укажите разрешение в формате 1920×1080.');
  const model = buildRenderModel(editorState, resolution);
  const lines = buildDisplayLines(model, { products, packaging, fallbackTitle: screen?.name || 'Меню' });
  const renderLayout = buildRenderLayout(model, lines);
  if (!renderLayout.vertical.fits) {
    throw new Error(`Меню не помещается в ${model.viewport.width}×${model.viewport.height}. Уменьшите размер текста или количество строк.`);
  }

  const { width, height } = model.viewport;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Браузер не поддерживает Canvas 2D.');

  const settings = model.settings || {};
  const table = renderLayout.horizontal;
  const vertical = renderLayout.vertical;
  const palette = renderLayout.palette;

  await drawBackground(ctx, settings, palette, width, height);
  if (palette.imageBackdropOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = palette.imageBackdropOpacity;
    ctx.fillStyle = MENU_TABLE_STYLE.imageBackdrop;
    ctx.fillRect(table.left, vertical.top, table.tableWidth, vertical.usedHeight);
    ctx.restore();
  }

  lines.forEach((line, index) => {
    const layout = {
      ...table,
      top: vertical.top + index * vertical.rowHeight,
      rowHeight: vertical.rowHeight,
      scale: vertical.scale
    };
    if (line.kind === 'section') drawSection(ctx, line, layout, palette);
    else if (line.kind === 'item') drawItem(ctx, line, layout, palette);
    else if (line.kind === 'packaging') drawPackaging(ctx, line, layout, palette);
  });

  return canvasBlob(canvas);
}
