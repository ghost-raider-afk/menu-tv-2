const BASE = Object.freeze({
  motion_version: 2,
  pattern: 'ambient',
  flow_direction: 'left-to-right',
  easing: 'smooth',
  cycle_seconds: 10,
  event_duration_ms: 1800,
  wave_stagger_ms: 180,
  travel_px: 12,
  scale_amount: 0.024,
  brightness_amount: 0.26,
  section_effect: 'shimmer',
  item_effect: 'focus',
  price_effect: 'glow',
  visual_effect: 'none',
  intensity: 68
});

function preset(id, name, category, description, overrides = {}) {
  return Object.freeze({ id, name, category, description, profile: Object.freeze({ ...BASE, ...overrides }) });
}

export const ANIMATION_PRESETS = Object.freeze([
  preset('fade-soft', 'Тихое дыхание', 'Ambient', 'Спокойное дыхание строк и акцентов без движения фонового изображения.', { pattern:'ambient',flow_direction:'none',cycle_seconds:14,event_duration_ms:3000,wave_stagger_ms:0,travel_px:0,scale_amount:0.018,brightness_amount:0.16,section_effect:'glow',item_effect:'breathe',price_effect:'none',intensity:48 }),
  preset('slide-left', 'Световая волна слева', 'Wave', 'Выраженная горизонтальная волна проходит по строкам и ценам слева направо.', { pattern:'wave',flow_direction:'left-to-right',cycle_seconds:8.5,event_duration_ms:1650,wave_stagger_ms:170,travel_px:18,scale_amount:0.022,brightness_amount:0.3,section_effect:'wave',item_effect:'wave',price_effect:'glow',intensity:76 }),
  preset('slide-up', 'Вертикальная волна', 'Wave', 'Заметный вертикальный импульс поднимается снизу вверх по всему меню.', { pattern:'wave',flow_direction:'bottom-to-top',cycle_seconds:9,event_duration_ms:1700,wave_stagger_ms:145,travel_px:16,scale_amount:0.024,brightness_amount:0.28,section_effect:'lift',item_effect:'lift',price_effect:'wave',intensity:74 }),
  preset('cascade-soft', 'Каскад витрины', 'Universal', 'Последовательный акцент по разделам, строкам и ценам — универсальный режим для ТВ.', { pattern:'wave',flow_direction:'top-to-bottom',cycle_seconds:9.5,event_duration_ms:1850,wave_stagger_ms:190,travel_px:11,scale_amount:0.03,brightness_amount:0.28,section_effect:'glow',item_effect:'focus',price_effect:'glow',intensity:72 }),
  preset('zoom-focus', 'Фокус по строкам', 'Focus', 'Строки по очереди получают хорошо заметный масштабный фокус без потери читаемости.', { pattern:'focus',flow_direction:'top-to-bottom',cycle_seconds:10.5,event_duration_ms:2100,wave_stagger_ms:300,travel_px:0,scale_amount:0.048,brightness_amount:0.34,section_effect:'none',item_effect:'focus',price_effect:'pulse',intensity:76 }),
  preset('light-wave', 'Золотая волна', 'Premium', 'Яркий золотой проход по разделам и ценам, хорошо заметный на большом экране.', { pattern:'spark',flow_direction:'left-to-right',cycle_seconds:9,event_duration_ms:1700,wave_stagger_ms:190,travel_px:10,scale_amount:0.026,brightness_amount:0.42,section_effect:'shimmer',item_effect:'breathe',price_effect:'glow',intensity:84 }),
  preset('sections-first', 'Ритм разделов', 'Navigation', 'Крупные заголовки разделов дают отчётливый навигационный импульс.', { pattern:'pulse',flow_direction:'none',cycle_seconds:7.5,event_duration_ms:1450,wave_stagger_ms:0,travel_px:0,scale_amount:0.04,brightness_amount:0.32,section_effect:'pulse',item_effect:'none',price_effect:'none',intensity:78 }),
  preset('ambient-reveal', 'Спокойная витрина', 'Ambient', 'Мягкое последовательное дыхание контента при полностью неподвижном фоне.', { pattern:'ambient',flow_direction:'none',cycle_seconds:15,event_duration_ms:4200,wave_stagger_ms:0,travel_px:0,scale_amount:0.018,brightness_amount:0.14,section_effect:'glow',item_effect:'breathe',price_effect:'none',intensity:58 }),
  preset('accent-pulse', 'Пульс акцентов', 'Promo', 'Разделы и цены синхронно дают заметный короткий рекламный импульс.', { pattern:'pulse',flow_direction:'none',cycle_seconds:6.5,event_duration_ms:1250,wave_stagger_ms:0,travel_px:0,scale_amount:0.05,brightness_amount:0.38,section_effect:'pulse',item_effect:'none',price_effect:'pulse',intensity:86 }),
  preset('diagonal-cut', 'Диагональный ритм', 'Wave', 'Контрастная встречная диагональная волна создаёт движение по всей площади меню.', { pattern:'wave',flow_direction:'alternate',cycle_seconds:8.5,event_duration_ms:1550,wave_stagger_ms:150,travel_px:20,scale_amount:0.026,brightness_amount:0.3,section_effect:'wave',item_effect:'wave',price_effect:'wave',intensity:80 }),
  preset('fast-retail', 'Retail Energy', 'Dynamic', 'Энергичный retail-ритм: быстрый блик, фокус строк и короткий pop цен.', { pattern:'spark',flow_direction:'left-to-right',easing:'snappy',cycle_seconds:5.5,event_duration_ms:1050,wave_stagger_ms:95,travel_px:15,scale_amount:0.05,brightness_amount:0.44,section_effect:'shimmer',item_effect:'focus',price_effect:'pop',intensity:92 }),
  preset('soft-premium', 'Soft Premium', 'Premium', 'Спокойная премиальная пластика с читаемым glow и мягким дыханием контента.', { pattern:'ambient',flow_direction:'none',easing:'cinematic',cycle_seconds:15,event_duration_ms:3200,wave_stagger_ms:0,travel_px:0,scale_amount:0.022,brightness_amount:0.2,section_effect:'glow',item_effect:'breathe',price_effect:'glow',intensity:56 }),
  preset('stagger-lines', 'Волна по строкам', 'Navigation', 'Чёткий последовательный проход по каждой строке помогает вести взгляд по меню.', { pattern:'wave',flow_direction:'top-to-bottom',cycle_seconds:9,event_duration_ms:1450,wave_stagger_ms:210,travel_px:14,scale_amount:0.024,brightness_amount:0.28,section_effect:'none',item_effect:'wave',price_effect:'glow',intensity:74 }),
  preset('price-reveal', 'Ценовой ритм', 'Promo', 'Цены дают крупный читаемый импульс — заметно с расстояния без движения строк.', { pattern:'spark',flow_direction:'right-to-left',cycle_seconds:6.5,event_duration_ms:950,wave_stagger_ms:125,travel_px:0,scale_amount:0.06,brightness_amount:0.46,section_effect:'none',item_effect:'none',price_effect:'pulse',intensity:90 }),
  preset('split-columns', 'Двойной поток', 'Dynamic', 'Левая и правая части меню получают заметный встречный ритм.', { pattern:'wave',flow_direction:'alternate',cycle_seconds:8.5,event_duration_ms:1600,wave_stagger_ms:160,travel_px:18,scale_amount:0.03,brightness_amount:0.32,section_effect:'wave',item_effect:'wave',price_effect:'wave',intensity:82 }),
  preset('depth-parallax', 'Глубина строк', 'Premium', 'Мягкое разнофазное движение элементов создаёт глубину без изменения фонового изображения.', { pattern:'parallax',flow_direction:'none',easing:'cinematic',cycle_seconds:14,event_duration_ms:3000,wave_stagger_ms:0,travel_px:13,scale_amount:0.022,brightness_amount:0.18,section_effect:'lift',item_effect:'breathe',price_effect:'none',intensity:64 }),
  preset('glow-sweep', 'Золотой блик', 'Promo', 'Сильный световой проход по акцентным зонам и ценам без смещения текста.', { pattern:'spark',flow_direction:'left-to-right',cycle_seconds:7.5,event_duration_ms:1550,wave_stagger_ms:180,travel_px:5,scale_amount:0.022,brightness_amount:0.5,section_effect:'shimmer',item_effect:'none',price_effect:'glow',intensity:94 }),
  preset('quick-snap', 'Quick Pulse', 'Dynamic', 'Короткий мощный импульс разделов и цен с выраженной спокойной паузой.', { pattern:'pulse',flow_direction:'none',easing:'snappy',cycle_seconds:5,event_duration_ms:700,wave_stagger_ms:60,travel_px:0,scale_amount:0.07,brightness_amount:0.46,section_effect:'pulse',item_effect:'none',price_effect:'pop',intensity:94 }),
  preset('cinema-build', 'Cinema Ambient', 'Premium', 'Кинематографичный медленный ритм строк, разделов и света на неподвижной сцене.', { pattern:'ambient',flow_direction:'none',easing:'cinematic',cycle_seconds:18,event_duration_ms:4000,wave_stagger_ms:360,travel_px:6,scale_amount:0.026,brightness_amount:0.2,section_effect:'glow',item_effect:'focus',price_effect:'glow',intensity:56 }),
  preset('signature-gold', 'Signature Gold', 'Signature', 'Фирменный режим: золотой блик, фокус строк и уверенный пульс цен.', { pattern:'spark',flow_direction:'left-to-right',cycle_seconds:8.5,event_duration_ms:1700,wave_stagger_ms:170,travel_px:13,scale_amount:0.036,brightness_amount:0.4,section_effect:'shimmer',item_effect:'focus',price_effect:'pulse',intensity:86 }),

  preset('ocean-wave', 'Морской прибой', 'Visual FX', 'Два световых слоя проходят снизу как мягкий прибой, не двигая фоновое изображение.', { visual_effect:'ocean-wave',pattern:'ambient',flow_direction:'left-to-right',cycle_seconds:9,event_duration_ms:2600,wave_stagger_ms:0,travel_px:10,scale_amount:0.018,brightness_amount:0.22,section_effect:'glow',item_effect:'breathe',price_effect:'glow',intensity:78 }),
  preset('aurora-flow', 'Северное сияние', 'Visual FX', 'Медленные широкие световые ленты проходят отдельным слоем поверх статичного фона.', { visual_effect:'aurora',pattern:'parallax',flow_direction:'alternate',easing:'cinematic',cycle_seconds:15,event_duration_ms:4200,wave_stagger_ms:0,travel_px:15,scale_amount:0.018,brightness_amount:0.18,section_effect:'glow',item_effect:'none',price_effect:'glow',intensity:72 }),
  preset('water-ripple', 'Круги на воде', 'Visual FX', 'Из центра расходятся крупные световые кольца, периодически подчёркивая цены и разделы.', { visual_effect:'ripple',pattern:'pulse',flow_direction:'none',cycle_seconds:8,event_duration_ms:2200,wave_stagger_ms:0,travel_px:0,scale_amount:0.032,brightness_amount:0.28,section_effect:'pulse',item_effect:'none',price_effect:'pulse',intensity:82 }),
  preset('sun-sweep', 'Солнечный блик', 'Visual FX', 'Широкий диагональный луч проходит через весь экран и оставляет короткий световой акцент.', { visual_effect:'sun-sweep',pattern:'spark',flow_direction:'left-to-right',cycle_seconds:7,event_duration_ms:1500,wave_stagger_ms:100,travel_px:8,scale_amount:0.024,brightness_amount:0.42,section_effect:'shimmer',item_effect:'none',price_effect:'glow',intensity:90 }),
  preset('spotlight-tour', 'Spotlight', 'Visual FX', 'Большое мягкое световое пятно путешествует поверх сцены и ведёт взгляд покупателя.', { visual_effect:'spotlight',pattern:'focus',flow_direction:'alternate',easing:'cinematic',cycle_seconds:12,event_duration_ms:3600,wave_stagger_ms:240,travel_px:8,scale_amount:0.032,brightness_amount:0.3,section_effect:'glow',item_effect:'focus',price_effect:'glow',intensity:76 }),
  preset('liquid-glass', 'Liquid Glass', 'Visual FX', 'Полупрозрачный стеклянный поток пересекает сцену, не масштабируя и не смещая фон.', { visual_effect:'liquid-glass',pattern:'spark',flow_direction:'left-to-right',easing:'smooth',cycle_seconds:9,event_duration_ms:1900,wave_stagger_ms:150,travel_px:6,scale_amount:0.026,brightness_amount:0.34,section_effect:'glow',item_effect:'breathe',price_effect:'pop',intensity:86 })
]);

export const PRESET_BY_ID = new Map(ANIMATION_PRESETS.map((item) => [item.id, item]));
export const DEFAULT_PRESET_ID = 'cascade-soft';
export function profileForPreset(id) { return { ...(PRESET_BY_ID.get(id) || PRESET_BY_ID.get(DEFAULT_PRESET_ID)).profile }; }
