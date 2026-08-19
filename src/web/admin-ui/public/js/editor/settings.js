const TEMPLATE_BACKGROUND_URL = /^\/site-assets\/templates\/background-[0-9a-f-]{36}\.(?:jpg|png|webp)$/i;

export function normaliseEditorSettings(settings = {}) {
  return {
    background_color: /^#[0-9a-f]{6}$/i.test(settings.background_color || '') ? settings.background_color : '#101828',
    background_image_url: TEMPLATE_BACKGROUND_URL.test(settings.background_image_url || '') ? settings.background_image_url : '',
    accent_color: /^#[0-9a-f]{6}$/i.test(settings.accent_color || '') ? settings.accent_color : '#F4C915',
    text_color: /^#[0-9a-f]{6}$/i.test(settings.text_color || '') ? settings.text_color : '#f8fafc',
    font_scale: ['small', 'medium', 'large'].includes(settings.font_scale) ? settings.font_scale : 'medium',
    table_width: ['compact', 'normal', 'wide'].includes(settings.table_width) ? settings.table_width : 'normal',
    title: typeof settings.title === 'string' ? settings.title.slice(0, 80) : ''
  };
}

export function parseResolution(value, fallback = { width: 1920, height: 1080 }) {
  const match = String(value || '').match(/^(\d{3,5})[×x](\d{3,5})$/);
  if (!match) return { ...fallback };
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) return { ...fallback };
  return { width, height };
}
