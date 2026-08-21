export const CHARACTER_STORY_VERSION = 1;

const point = (x, y) => Object.freeze({ x, y });
const route = (...points) => Object.freeze(points.map((entry) => Object.freeze(entry)));
const common = ({ interval = 90, duration = 10, intensity = 70, layer = 'front' } = {}) => Object.freeze({
  interval_seconds: interval,
  interval_jitter_seconds: 15,
  duration_seconds: duration,
  intensity,
  layer,
  return_to_anchor: true,
  avoid_menu_critical_zones: true
});

export const CHARACTER_STORY_PRESETS = Object.freeze([
  Object.freeze({
    id: 'short-swim', name: 'Короткое плавание', category: 'Движение',
    description: 'Рыбка выплывает из anchor, делает спокойный круг и возвращается.',
    phases: Object.freeze(['wake', 'exit-anchor', 'swim', 'return', 'idle']),
    settings_schema: Object.freeze(['anchor', 'route', 'speed', 'turn_smoothness', 'layer', 'interval', 'intensity']),
    defaults: Object.freeze({ ...common({ interval: 75, duration: 9 }), anchor: point(84, 22), route: route(point(78, 31), point(67, 38), point(76, 48), point(84, 22)), speed: 52, turn_smoothness: 72 })
  }),
  Object.freeze({
    id: 'menu-explore', name: 'Исследование меню', category: 'Движение',
    description: 'Персонаж проходит по нескольким безопасным зонам и задерживается возле разделов.',
    phases: Object.freeze(['wake', 'exit-anchor', 'visit-zones', 'pause', 'return', 'idle']),
    settings_schema: Object.freeze(['anchor', 'waypoints', 'stop_duration', 'speed', 'safe_zones', 'layer', 'interval', 'intensity']),
    defaults: Object.freeze({ ...common({ interval: 120, duration: 14 }), anchor: point(84, 22), waypoints: route(point(73, 30), point(70, 50), point(80, 63)), stop_duration_ms: 900, speed: 46 })
  }),
  Object.freeze({
    id: 'bubble-chase', name: 'Пузырёк', category: 'Мини-сюжет',
    description: 'Рыбка преследует пузырёк, пузырёк лопается, персонаж возвращается.',
    phases: Object.freeze(['wake', 'bubble-spawn', 'chase', 'bubble-pop', 'return', 'idle']),
    settings_schema: Object.freeze(['anchor', 'bubble_start', 'bubble_route', 'chase_distance', 'speed', 'bubble_size', 'interval', 'intensity']),
    defaults: Object.freeze({ ...common({ interval: 130, duration: 11 }), anchor: point(84, 22), bubble_start: point(79, 34), bubble_route: route(point(74, 40), point(68, 51), point(72, 61)), chase_distance: 4, speed: 58, bubble_size: 3.2 })
  }),
  Object.freeze({
    id: 'hook-catch', name: 'Крючок', category: 'Сюжет',
    description: 'Крючок подхватывает рыбку, тянет вверх, она срывается и возвращается.',
    phases: Object.freeze(['wake', 'swim', 'hook-enter', 'catch', 'lift', 'escape', 'return', 'idle']),
    settings_schema: Object.freeze(['anchor', 'swim_route', 'hook_x', 'hook_depth', 'lift_height', 'escape_point', 'speed', 'interval', 'intensity']),
    defaults: Object.freeze({ ...common({ interval: 180, duration: 16, intensity: 78 }), anchor: point(84, 22), swim_route: route(point(74, 35), point(68, 45)), hook_x: 69, hook_depth: 47, lift_height: 12, escape_point: point(77, 34), speed: 55 })
  }),
  Object.freeze({
    id: 'hook-escape', name: 'Побег от крючка', category: 'Сюжет',
    description: 'Крючок появляется первым, рыбка резко меняет маршрут и прячется.',
    phases: Object.freeze(['wake', 'hook-enter', 'notice', 'dash', 'hide', 'idle']),
    settings_schema: Object.freeze(['anchor', 'hook_x', 'danger_point', 'escape_route', 'reaction_delay', 'dash_speed', 'interval', 'intensity']),
    defaults: Object.freeze({ ...common({ interval: 170, duration: 9, intensity: 82 }), anchor: point(84, 22), hook_x: 72, danger_point: point(74, 34), escape_route: route(point(80, 39), point(87, 28), point(84, 22)), reaction_delay_ms: 380, dash_speed: 82 })
  }),
  Object.freeze({
    id: 'golden-wave', name: 'Золотая волна', category: 'Motion sync',
    description: 'Рыбка следует за световым проходом Motion Engine и возвращается к anchor.',
    phases: Object.freeze(['wake', 'sync-wave', 'follow', 'return', 'idle']),
    settings_schema: Object.freeze(['anchor', 'route', 'wave_offset', 'speed', 'motion_sync', 'layer', 'interval', 'intensity']),
    defaults: Object.freeze({ ...common({ interval: 110, duration: 12 }), anchor: point(84, 22), route: route(point(78, 32), point(66, 42), point(72, 57), point(84, 22)), wave_offset_ms: 240, speed: 50, motion_sync: true })
  }),
  Object.freeze({
    id: 'beer-foam', name: 'Пивная пена', category: 'Мини-сюжет',
    description: 'Рыбка ныряет через зону бокала и пены с коротким всплеском пузырьков.',
    phases: Object.freeze(['wake', 'foam-rise', 'dive', 'bubbles', 'surface', 'idle']),
    settings_schema: Object.freeze(['anchor', 'foam_zone', 'dive_depth', 'bubble_count', 'speed', 'interval', 'intensity']),
    defaults: Object.freeze({ ...common({ interval: 145, duration: 8 }), anchor: point(84, 22), foam_zone: Object.freeze({ x: 79, y: 17, width: 12, height: 16 }), dive_depth: 17, bubble_count: 8, speed: 60 })
  }),
  Object.freeze({
    id: 'promo-route', name: 'Промо-маршрут', category: 'Промо',
    description: 'Персонаж приводит взгляд к выбранной позиции или разделу без перекрытия цены.',
    phases: Object.freeze(['wake', 'travel', 'point', 'hold', 'return', 'idle']),
    settings_schema: Object.freeze(['anchor', 'target', 'approach_side', 'hold_duration', 'pointer_effect', 'safe_zones', 'speed', 'interval', 'intensity']),
    defaults: Object.freeze({ ...common({ interval: 95, duration: 10, intensity: 76 }), anchor: point(84, 22), target: point(62, 48), approach_side: 'right', hold_duration_ms: 1500, pointer_effect: 'glow', speed: 54 })
  }),
  Object.freeze({
    id: 'net-escape', name: 'Сеть', category: 'Сюжет',
    description: 'На экране появляется сеть, рыбка меняет маршрут и уходит обратно в безопасную зону.',
    phases: Object.freeze(['wake', 'swim', 'net-enter', 'evade', 'net-exit', 'return', 'idle']),
    settings_schema: Object.freeze(['anchor', 'swim_route', 'net_entry', 'net_size', 'escape_route', 'dash_speed', 'interval', 'intensity']),
    defaults: Object.freeze({ ...common({ interval: 210, duration: 15, intensity: 84 }), anchor: point(84, 22), swim_route: route(point(76, 34), point(67, 44)), net_entry: point(58, 18), net_size: 17, escape_route: route(point(74, 55), point(84, 22)), dash_speed: 80 })
  }),
  Object.freeze({
    id: 'free-swim', name: 'Свободное плавание', category: 'Движение',
    description: 'Выбирается один из безопасных маршрутов, после чего персонаж возвращается.',
    phases: Object.freeze(['wake', 'choose-route', 'swim', 'return', 'idle']),
    settings_schema: Object.freeze(['anchor', 'routes', 'route_randomness', 'speed_min', 'speed_max', 'safe_zones', 'interval', 'intensity']),
    defaults: Object.freeze({ ...common({ interval: 105, duration: 13 }), anchor: point(84, 22), routes: Object.freeze([route(point(78, 31), point(68, 39), point(73, 51)), route(point(80, 38), point(74, 57), point(84, 65))]), route_randomness: 80, speed_min: 42, speed_max: 62 })
  }),
  Object.freeze({
    id: 'speech-dive', name: 'Говорящая рыбка', category: 'Информация',
    description: 'Персонаж выплывает вниз, останавливается и запускает бегущую строку из точки рта.',
    phases: Object.freeze(['wake', 'exit-anchor', 'travel-to-stop', 'settle', 'speak', 'ticker', 'close-mouth', 'return', 'idle']),
    settings_schema: Object.freeze(['anchor', 'stop_point', 'route', 'character_scale', 'mouth_point', 'speech_zone', 'ticker_direction', 'ticker_speed', 'text_source', 'custom_text', 'speak_duration', 'speed', 'interval', 'intensity', 'layer']),
    defaults: Object.freeze({
      ...common({ interval: 90, duration: 14, intensity: 78, layer: 'front' }),
      anchor: point(84, 22), stop_point: point(72, 54), route: route(point(82, 30), point(78, 41), point(72, 54)), character_scale: 1,
      mouth_point: point(78, 48), speech_zone: Object.freeze({ x: 38, y: 48, width: 34, height: 10 }), ticker_direction: 'right-to-left', ticker_speed: 58,
      text_source: 'custom', custom_text: 'Сегодня отличный день попробовать что-нибудь новое!', speak_duration_ms: 6500, speed: 52
    })
  }),
  Object.freeze({
    id: 'layer-dive', name: 'Нырок между строками', category: 'Сюжет',
    description: 'Рыбка проходит перед меню, ныряет за таблицу и появляется в другой безопасной зоне.',
    phases: Object.freeze(['wake', 'front-swim', 'dive-behind', 'behind-menu', 'surface-front', 'return', 'idle']),
    settings_schema: Object.freeze(['anchor', 'entry_point', 'hidden_route', 'exit_point', 'front_route', 'layer_transition_ms', 'speed', 'interval', 'intensity']),
    defaults: Object.freeze({ ...common({ interval: 160, duration: 13, intensity: 74 }), anchor: point(84, 22), entry_point: point(76, 39), hidden_route: route(point(64, 47), point(58, 58)), exit_point: point(69, 66), front_route: route(point(78, 56), point(84, 22)), layer_transition_ms: 420, speed: 55 })
  })
]);

export const CHARACTER_STORY_PRESET_BY_ID = new Map(CHARACTER_STORY_PRESETS.map((preset) => [preset.id, preset]));
export const DEFAULT_CHARACTER_STORY_ID = 'speech-dive';

export function characterStoryPreset(id) {
  return CHARACTER_STORY_PRESET_BY_ID.get(id) || CHARACTER_STORY_PRESET_BY_ID.get(DEFAULT_CHARACTER_STORY_ID);
}

export function characterStoryDefaults(id) {
  return structuredClone(characterStoryPreset(id).defaults);
}
