const BASE = Object.freeze({
  entrance: 'cascade',
  direction: 'left',
  easing: 'smooth',
  duration_ms: 900,
  stagger_ms: 70,
  distance_px: 54,
  scale_from: 0.98,
  opacity_from: 0,
  blur_px: 0,
  section_delay_ms: 0,
  item_delay_ms: 150,
  price_delay_ms: 220,
  section_emphasis: 'slide',
  price_emphasis: 'fade',
  shimmer: false,
  glow: false,
  background_motion: true,
  ambient_speed_seconds: 28,
  intensity: 55,
  hold_seconds: 8
});

function preset(id, name, category, description, overrides = {}) {
  return Object.freeze({ id, name, category, description, profile: Object.freeze({ ...BASE, ...overrides }) });
}

export const ANIMATION_PRESETS = Object.freeze([
  preset('fade-soft', 'Мягкое появление', 'Спокойный', 'Чистый fade без лишнего движения.', { entrance: 'fade', direction: 'none', duration_ms: 1200, stagger_ms: 35, distance_px: 0, section_emphasis: 'none', background_motion: false, intensity: 35 }),
  preset('slide-left', 'Слайд слева', 'Динамичный', 'Разделы и строки уверенно входят слева.', { entrance: 'slide', direction: 'left', duration_ms: 760, stagger_ms: 55, distance_px: 86, easing: 'snappy', section_emphasis: 'slide', intensity: 62 }),
  preset('slide-up', 'Слайд снизу', 'Динамичный', 'Меню поднимается снизу с мягким каскадом.', { entrance: 'slide', direction: 'up', duration_ms: 820, stagger_ms: 60, distance_px: 74, easing: 'smooth', intensity: 58 }),
  preset('cascade-soft', 'Каскадная сборка', 'Универсальный', 'Разделы, строки и цены собираются по слоям.', { entrance: 'cascade', direction: 'left', duration_ms: 880, stagger_ms: 78, section_delay_ms: 0, item_delay_ms: 170, price_delay_ms: 320, section_emphasis: 'slide', price_emphasis: 'fade', intensity: 58 }),
  preset('zoom-focus', 'Масштаб + фокус', 'Премиум', 'Лёгкий zoom и фокусировка без резкого движения.', { entrance: 'focus', direction: 'none', duration_ms: 1050, stagger_ms: 42, distance_px: 0, scale_from: 0.92, blur_px: 9, easing: 'cinematic', section_emphasis: 'glow', glow: true, intensity: 48 }),
  preset('light-wave', 'Световая волна', 'Премиум', 'Каскад с золотым световым проходом.', { entrance: 'reveal', direction: 'left', duration_ms: 980, stagger_ms: 66, section_emphasis: 'glow', shimmer: true, glow: true, background_motion: true, ambient_speed_seconds: 22, intensity: 72 }),
  preset('sections-first', 'Сначала разделы', 'Навигационный', 'Плашки разделов появляются первыми, затем позиции.', { entrance: 'cascade', direction: 'left', duration_ms: 780, stagger_ms: 54, section_delay_ms: 0, item_delay_ms: 520, price_delay_ms: 700, section_emphasis: 'wipe', price_emphasis: 'fade', intensity: 60 }),
  preset('ambient-reveal', 'Живой фон + проявление', 'Премиум', 'Параллакс фона и спокойное раскрытие меню.', { entrance: 'reveal', direction: 'up', duration_ms: 1250, stagger_ms: 52, distance_px: 42, scale_from: 0.96, blur_px: 3, background_motion: true, ambient_speed_seconds: 18, easing: 'cinematic', intensity: 50 }),
  preset('accent-pulse', 'Акцент разделов', 'Промо', 'Разделы мягко подсвечиваются после появления.', { entrance: 'cascade', direction: 'left', duration_ms: 760, stagger_ms: 52, section_emphasis: 'pulse', price_emphasis: 'pop', glow: true, intensity: 78 }),
  preset('diagonal-cut', 'Диагональный переход', 'Динамичный', 'Контент открывается диагональным движением.', { entrance: 'diagonal', direction: 'diagonal', duration_ms: 900, stagger_ms: 60, distance_px: 96, easing: 'snappy', section_emphasis: 'wipe', intensity: 75 }),
  preset('fast-retail', 'Fast Retail', 'Динамичный', 'Быстрая ритмичная сборка в стиле digital menu board.', { entrance: 'cascade', direction: 'left', duration_ms: 520, stagger_ms: 32, distance_px: 68, easing: 'snappy', section_emphasis: 'slide', price_emphasis: 'pop', intensity: 82 }),
  preset('soft-premium', 'Soft Premium', 'Премиум', 'Медленное дорогое движение с деликатным glow.', { entrance: 'focus', direction: 'up', duration_ms: 1450, stagger_ms: 70, distance_px: 34, scale_from: 0.95, blur_px: 7, easing: 'cinematic', section_emphasis: 'glow', glow: true, background_motion: true, ambient_speed_seconds: 34, intensity: 44 }),
  preset('stagger-lines', 'Строка за строкой', 'Навигационный', 'Чёткий последовательный проход по всем строкам.', { entrance: 'cascade', direction: 'right', duration_ms: 640, stagger_ms: 115, distance_px: 46, easing: 'standard', section_emphasis: 'none', price_emphasis: 'fade', intensity: 55 }),
  preset('price-reveal', 'Акцент на ценах', 'Промо', 'Названия появляются первыми, цены догоняют отдельным движением.', { entrance: 'cascade', direction: 'left', duration_ms: 720, stagger_ms: 48, item_delay_ms: 120, price_delay_ms: 780, price_emphasis: 'slide', section_emphasis: 'slide', intensity: 68 }),
  preset('split-columns', 'Разделение колонок', 'Динамичный', 'Текст и цены сходятся с разных направлений.', { entrance: 'split', direction: 'left', duration_ms: 820, stagger_ms: 46, distance_px: 92, price_delay_ms: 120, price_emphasis: 'slide', easing: 'smooth', intensity: 70 }),
  preset('depth-parallax', 'Глубина / Parallax', 'Премиум', 'Фон и меню движутся с разной глубиной.', { entrance: 'focus', direction: 'up', duration_ms: 1180, stagger_ms: 44, distance_px: 52, scale_from: 0.94, blur_px: 4, background_motion: true, ambient_speed_seconds: 14, easing: 'cinematic', intensity: 56 }),
  preset('glow-sweep', 'Золотой блик', 'Промо', 'После сборки по акцентам проходит световой блик.', { entrance: 'reveal', direction: 'left', duration_ms: 850, stagger_ms: 48, section_emphasis: 'glow', shimmer: true, glow: true, ambient_speed_seconds: 24, intensity: 88 }),
  preset('quick-snap', 'Quick Snap', 'Динамичный', 'Очень быстрый и собранный старт без долгих задержек.', { entrance: 'slide', direction: 'up', duration_ms: 420, stagger_ms: 24, distance_px: 52, easing: 'snappy', section_emphasis: 'slide', price_emphasis: 'pop', background_motion: false, intensity: 86 }),
  preset('cinema-build', 'Cinema Build', 'Премиум', 'Медленная кинематографичная сборка с blur и глубиной.', { entrance: 'focus', direction: 'none', duration_ms: 1750, stagger_ms: 95, distance_px: 0, scale_from: 1.07, blur_px: 14, easing: 'cinematic', section_delay_ms: 120, item_delay_ms: 360, price_delay_ms: 540, glow: true, background_motion: true, ambient_speed_seconds: 40, intensity: 46 }),
  preset('signature-gold', 'Signature Gold', 'Фирменный', 'Сбалансированный золотой пресет для ТВ МЕНЮ.', { entrance: 'cascade', direction: 'left', duration_ms: 840, stagger_ms: 58, distance_px: 64, easing: 'smooth', section_emphasis: 'wipe', price_emphasis: 'pop', shimmer: true, glow: true, background_motion: true, ambient_speed_seconds: 26, intensity: 74 })
]);

export const PRESET_BY_ID = new Map(ANIMATION_PRESETS.map((item) => [item.id, item]));
export const DEFAULT_PRESET_ID = 'cascade-soft';

export function profileForPreset(id) {
  return { ...(PRESET_BY_ID.get(id) || PRESET_BY_ID.get(DEFAULT_PRESET_ID)).profile };
}
