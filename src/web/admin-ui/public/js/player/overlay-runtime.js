import { renderAquariumLayer } from '../motion/aquarium.js';
import { renderBrandTitleLayer } from '../motion/brand-title.js';
import { ensurePlayerSceneLayer } from './scene-layer-composer.js';

const PLAYER_CONTEXT_STORAGE_KEY = 'tv-menu.player-context.v1';
const stage = document.querySelector('[data-player-stage]');
let rendering = false;

function cachedContext() {
  try {
    const record = JSON.parse(localStorage.getItem(PLAYER_CONTEXT_STORAGE_KEY) || 'null');
    return record?.context || null;
  } catch {
    return null;
  }
}

function renderOverlays() {
  if (!(stage instanceof HTMLElement) || rendering) return;
  const context = cachedContext();
  if (!context) return;
  rendering = true;
  try {
    const aquariumLayer = ensurePlayerSceneLayer(stage, 'aquarium', { ariaLabel: 'Аквариум' });
    const brandLayer = ensurePlayerSceneLayer(stage, 'brand', { ariaLabel: 'Название бренда' });
    renderAquariumLayer(aquariumLayer, context.aquarium, { allowIntro: true });
    renderBrandTitleLayer(brandLayer, context.brand);
  } finally {
    rendering = false;
  }
}

if (stage instanceof HTMLElement) {
  const observer = new MutationObserver(() => queueMicrotask(renderOverlays));
  observer.observe(stage, { childList: true });
  window.addEventListener('storage', (event) => {
    if (event.key === PLAYER_CONTEXT_STORAGE_KEY) renderOverlays();
  });
  renderOverlays();
}
