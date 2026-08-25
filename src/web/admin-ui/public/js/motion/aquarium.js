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

let introPlayed = false;

function clamp(value, fallback, min, max, integer = false) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const result = Math.max(min, Math.min(max, number));
  return integer ? Math.round(result) : result;
}

export function normaliseAquarium(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    enabled: source.enabled === true,
    style: ['premium', 'neon', 'reef'].includes(source.style) ? source.style : DEFAULT_AQUARIUM.style,
    intro_fill: source.intro_fill !== false,
    intensity: clamp(source.intensity, DEFAULT_AQUARIUM.intensity, 0, 100, true),
    fish_count: clamp(source.fish_count, DEFAULT_AQUARIUM.fish_count, 0, 8, true),
    bubble_density: clamp(source.bubble_density, DEFAULT_AQUARIUM.bubble_density, 0, 100, true),
    plant_density: clamp(source.plant_density, DEFAULT_AQUARIUM.plant_density, 0, 100, true),
    caustics: clamp(source.caustics, DEFAULT_AQUARIUM.caustics, 0, 100, true),
    speed: clamp(source.speed, DEFAULT_AQUARIUM.speed, 10, 100, true)
  };
}

function createFish(index, count) {
  const fish = document.createElement('span');
  fish.className = `aquarium-fish aquarium-fish-${(index % 3) + 1}`;
  fish.style.setProperty('--fish-index', String(index));
  fish.style.setProperty('--fish-y', `${14 + ((index * 19) % 64)}%`);
  fish.style.setProperty('--fish-delay', `${-(index * 3.7)}s`);
  fish.style.setProperty('--fish-duration-factor', String(0.86 + ((index % 4) * 0.11)));
  fish.setAttribute('aria-hidden', 'true');
  return fish;
}

function createBubble(index) {
  const bubble = document.createElement('span');
  bubble.className = 'aquarium-bubble';
  bubble.style.setProperty('--bubble-x', `${3 + ((index * 37) % 94)}%`);
  bubble.style.setProperty('--bubble-size', `${4 + ((index * 7) % 12)}px`);
  bubble.style.setProperty('--bubble-delay', `${-(index * 0.83)}s`);
  bubble.style.setProperty('--bubble-drift', `${-16 + ((index * 11) % 32)}px`);
  bubble.setAttribute('aria-hidden', 'true');
  return bubble;
}

function createPlant(index, side) {
  const plant = document.createElement('span');
  plant.className = `aquarium-plant aquarium-plant-${side}`;
  plant.style.setProperty('--plant-index', String(index));
  plant.style.setProperty('--plant-offset', `${3 + index * 4.8}%`);
  plant.style.setProperty('--plant-height', `${13 + (index % 4) * 5}%`);
  plant.style.setProperty('--plant-delay', `${-(index * 0.9)}s`);
  plant.setAttribute('aria-hidden', 'true');
  return plant;
}

export function renderAquariumLayer(layer, value, { allowIntro = true } = {}) {
  if (!(layer instanceof Element)) return null;
  const aquarium = normaliseAquarium(value);
  layer.replaceChildren();
  layer.className = 'scene-aquarium-layer';
  layer.classList.toggle('is-enabled', aquarium.enabled);
  if (!aquarium.enabled) return aquarium;

  layer.classList.add(`aquarium-style-${aquarium.style}`);
  layer.style.setProperty('--aquarium-intensity', String(aquarium.intensity / 100));
  layer.style.setProperty('--aquarium-caustics', String(aquarium.caustics / 100));
  layer.style.setProperty('--aquarium-speed', String(aquarium.speed / 100));

  const water = document.createElement('div');
  water.className = 'aquarium-water';
  if (allowIntro && aquarium.intro_fill && !introPlayed) {
    water.classList.add('aquarium-water-intro');
    introPlayed = true;
  }
  water.innerHTML = '<span class="aquarium-caustics aquarium-caustics-a"></span><span class="aquarium-caustics aquarium-caustics-b"></span><span class="aquarium-depth-haze"></span>';

  const scenery = document.createElement('div');
  scenery.className = 'aquarium-scenery';
  const plantCount = Math.round((aquarium.plant_density / 100) * 5);
  for (let index = 0; index < plantCount; index += 1) {
    scenery.append(createPlant(index, 'left'), createPlant(index, 'right'));
  }

  const fishLayer = document.createElement('div');
  fishLayer.className = 'aquarium-fish-layer';
  for (let index = 0; index < aquarium.fish_count; index += 1) fishLayer.append(createFish(index, aquarium.fish_count));

  const bubbles = document.createElement('div');
  bubbles.className = 'aquarium-bubbles';
  const bubbleCount = Math.round((aquarium.bubble_density / 100) * 18);
  for (let index = 0; index < bubbleCount; index += 1) bubbles.append(createBubble(index));

  layer.append(water, scenery, fishLayer, bubbles);
  return aquarium;
}

export function resetAquariumIntro() {
  introPlayed = false;
}
