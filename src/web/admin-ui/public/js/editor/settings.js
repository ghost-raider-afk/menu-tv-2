import { MENU_REFERENCE } from './renderer.js';

const TEMPLATE_BACKGROUND_URL = /^\/site-assets\/templates\/background-[0-9a-f-]{36}\.(?:jpg|png|webp)$/i;
const HEX = /^#[0-9a-f]{6}$/i;

function fontScalePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 100;
  return Math.max(MENU_REFERENCE.fontScaleMinPercent, Math.min(MENU_REFERENCE.fontScaleMaxPercent, Math.round(number)));
}

export function normaliseEditorSettings(settings = {}) {
  return {
    background_color: HEX.test(settings.background_color || '') ? String(settings.background_color).toUpperCase() : '#101828',
    background_image_url: TEMPLATE_BACKGROUND_URL.test(settings.background_image_url || '') ? settings.background_image_url : '',
    accent_color: HEX.test(settings.accent_color || '') ? String(settings.accent_color).toUpperCase() : '#F4C915',
    text_color: HEX.test(settings.text_color || '') ? String(settings.text_color).toUpperCase() : '#F8FAFC',
    font_scale_percent: fontScalePercent(settings.font_scale_percent)
  };
}

export function parseResolution(value) {
  const match = String(value || '').match(/^(\d{3,5})[×x](\d{3,5})$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) return null;
  return { width, height };
}
