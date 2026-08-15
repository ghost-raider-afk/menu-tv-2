export function normaliseEditorSettings(settings = {}) {
  return {
    background_color: /^#[0-9a-f]{6}$/i.test(settings.background_color || '') ? settings.background_color : '#101828',
    accent_color: /^#[0-9a-f]{6}$/i.test(settings.accent_color || '') ? settings.accent_color : '#2563eb',
    text_color: /^#[0-9a-f]{6}$/i.test(settings.text_color || '') ? settings.text_color : '#f8fafc',
    font_scale: ['small', 'medium', 'large'].includes(settings.font_scale) ? settings.font_scale : 'medium',
    table_width: ['compact', 'normal', 'wide'].includes(settings.table_width) ? settings.table_width : 'normal',
    title: typeof settings.title === 'string' ? settings.title.slice(0, 80) : ''
  };
}

export function parseResolution(value, fallback = { width: 1920, height: 1080 }) {
  const match = String(value || '').match(/^(\d{3,5})[×x](\d{3,5})$/);
  if (!match) return { ...fallback };
  return { width: Math.min(1920, Math.max(1, Number(match[1]))), height: Math.min(1080, Math.max(1, Number(match[2]))) };
}
