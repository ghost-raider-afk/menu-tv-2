import { buildRenderModel } from './renderer.js';
import { parseResolution } from './settings.js';

const FONT_SCALE = { small: 0.88, medium: 1, large: 1.15 };
const TABLE_WIDTH = { compact: 0.68, normal: 0.8, wide: 0.9 };
const displayPrice = (value) => `${String(value || '0').replace('.', ',')} ₽`;
function fitText(ctx, text, maxWidth) { const source = String(text || ''); if (ctx.measureText(source).width <= maxWidth) return source; let result = source; while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1); return `${result}…`; }
function canvasBlob(canvas) { return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Не удалось сформировать JPEG.')), 'image/jpeg', 0.92)); }

export async function renderFinalJpeg(editorState, { screen, products, packaging }) {
  const resolution = parseResolution(screen?.resolution);
  const model = buildRenderModel(editorState, resolution);
  const { width, height } = model.viewport;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false }); if (!ctx) throw new Error('Браузер не поддерживает Canvas 2D.');
  const settings = model.settings || {}; const scale = FONT_SCALE[settings.font_scale] || 1; const tableFactor = TABLE_WIDTH[settings.table_width] || TABLE_WIDTH.normal; const tableWidth = Math.round(width * tableFactor); const left = Math.round((width - tableWidth) / 2); const right = left + tableWidth; const padding = Math.max(18, Math.round(width * 0.012));
  ctx.fillStyle = settings.background_color || '#101828'; ctx.fillRect(0, 0, width, height);
  const titleSize = Math.max(34, Math.round(width * 0.032 * scale)); ctx.fillStyle = settings.text_color || '#f8fafc'; ctx.font = `700 ${titleSize}px system-ui, -apple-system, Segoe UI, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(fitText(ctx, settings.title || screen?.name || 'Меню', tableWidth), width / 2, Math.round(height * 0.09));
  if (!model.rows.length) return canvasBlob(canvas);
  const top = Math.round(height * 0.17); const bottom = Math.round(height * 0.06); const rowHeight = Math.max(34, Math.floor((height - top - bottom) / model.rows.length)); const bodySize = Math.max(22, Math.min(Math.round(rowHeight * 0.42 * scale), Math.round(width * 0.023 * scale))); const detailSize = Math.max(17, Math.round(bodySize * 0.7)); const sectionSize = Math.max(bodySize, Math.round(bodySize * 1.08));
  model.rows.forEach((row, index) => {
    const y = top + index * rowHeight; const centerY = y + rowHeight / 2;
    if (row.kind === 'section') { ctx.fillStyle = settings.accent_color || '#2563eb'; ctx.fillRect(left, y + Math.round(rowHeight * 0.12), tableWidth, Math.round(rowHeight * 0.76)); ctx.fillStyle = settings.text_color || '#f8fafc'; ctx.textAlign = 'left'; ctx.font = `700 ${sectionSize}px system-ui, -apple-system, Segoe UI, sans-serif`; ctx.fillText(fitText(ctx, row.name || 'Раздел', tableWidth - padding * 2), left + padding, centerY); return; }
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, y + rowHeight); ctx.lineTo(right, y + rowHeight); ctx.stroke();
    if (row.kind === 'item') { const product = products.find((item) => Number(item.id) === Number(row.product_id)); const details = row.promotion && row.promotion_text ? row.promotion_text : (row.characteristics || product?.characteristics || product?.strength || ''); const prices = product ? `${displayPrice(product.price_primary)} / ${displayPrice(product.price_secondary)}` : '—'; const priceWidth = Math.round(tableWidth * 0.28); const nameWidth = tableWidth - priceWidth - padding * 3; ctx.fillStyle = settings.text_color || '#f8fafc'; ctx.textAlign = 'left'; ctx.font = `700 ${bodySize}px system-ui, -apple-system, Segoe UI, sans-serif`; ctx.fillText(fitText(ctx, product?.name || 'Продукция не выбрана', nameWidth), left + padding, centerY - (details ? detailSize * 0.42 : 0)); if (details) { ctx.globalAlpha = 0.75; ctx.font = `400 ${detailSize}px system-ui, -apple-system, Segoe UI, sans-serif`; ctx.fillText(fitText(ctx, details, nameWidth), left + padding, centerY + detailSize * 0.72); ctx.globalAlpha = 1; } ctx.textAlign = 'right'; ctx.font = `700 ${bodySize}px system-ui, -apple-system, Segoe UI, sans-serif`; ctx.fillText(fitText(ctx, prices, priceWidth), right - padding, centerY); return; }
    if (row.kind === 'packaging') { const item = packaging.find((entry) => Number(entry.id) === Number(row.packaging_id)); ctx.fillStyle = settings.text_color || '#f8fafc'; ctx.textAlign = 'left'; ctx.font = `600 ${bodySize}px system-ui, -apple-system, Segoe UI, sans-serif`; ctx.fillText(fitText(ctx, item?.name || 'Тара не выбрана', tableWidth * 0.68), left + padding, centerY); ctx.textAlign = 'right'; ctx.font = `700 ${bodySize}px system-ui, -apple-system, Segoe UI, sans-serif`; ctx.fillText(item ? displayPrice(item.unit_price) : '—', right - padding, centerY); }
  });
  return canvasBlob(canvas);
}
