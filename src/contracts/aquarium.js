import { ValidationError } from '../shared/errors.js';

export const AQUARIUM_STYLES = Object.freeze(['premium', 'neon', 'reef']);

export const DEFAULT_AQUARIUM = Object.freeze({
  enabled: false,
  style: 'premium',
  intro_fill: true,
  intensity: 45,
  fish_count: 3,
  bubble_density: 35,
  plant_density: 45,
  caustics: 50,
  speed: 35
});

function sourceObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clamp(value, fallback, min, max, integer = false) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const result = Math.max(min, Math.min(max, parsed));
  return integer ? Math.round(result) : result;
}

export function completeAquarium(value = {}) {
  const source = sourceObject(value);
  return {
    enabled: source.enabled === true,
    style: AQUARIUM_STYLES.includes(source.style) ? source.style : DEFAULT_AQUARIUM.style,
    intro_fill: source.intro_fill !== false,
    intensity: clamp(source.intensity, DEFAULT_AQUARIUM.intensity, 0, 100, true),
    fish_count: clamp(source.fish_count, DEFAULT_AQUARIUM.fish_count, 0, 8, true),
    bubble_density: clamp(source.bubble_density, DEFAULT_AQUARIUM.bubble_density, 0, 100, true),
    plant_density: clamp(source.plant_density, DEFAULT_AQUARIUM.plant_density, 0, 100, true),
    caustics: clamp(source.caustics, DEFAULT_AQUARIUM.caustics, 0, 100, true),
    speed: clamp(source.speed, DEFAULT_AQUARIUM.speed, 10, 100, true)
  };
}

export function aquariumInput(value) {
  if (value !== undefined && (value === null || typeof value !== 'object' || Array.isArray(value))) {
    throw new ValidationError('Настройки аквариума должны быть объектом.');
  }
  return completeAquarium(value);
}
