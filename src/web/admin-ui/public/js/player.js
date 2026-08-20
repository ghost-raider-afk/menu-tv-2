import { AnimationPreviewPlayer } from './motion/preview-player.js';
import { renderAnimationScreenEmpty, renderAnimationScreenPreview } from './motion/screen-preview.js';

const stage = document.getElementById('player-stage');
const status = document.getElementById('player-status');
let player = null;
let wakeLock = null;

function tokenFromPath() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts[0] === 'player' && parts[1] ? parts[1] : '';
}

function showStatus(message, error = false) {
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('is-hidden', !message);
  status.classList.toggle('is-error', error);
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    wakeLock = null;
  }
}

async function loadScene() {
  const token = tokenFromPath();
  if (!token) throw new Error('Не указана ссылка рабочего места телевизора.');
  const response = await fetch(`/api/player/${encodeURIComponent(token)}/scene`, {
    credentials: 'omit',
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(response.status === 404 ? 'Рабочее место телевизора не найдено или отключено.' : 'Не удалось загрузить экран.');
  const bundle = await response.json();
  const rendered = renderAnimationScreenPreview(stage, bundle);
  if (!rendered || rendered.invalidResolution) throw new Error('У монитора некорректное разрешение.');

  const { width, height } = rendered.model.viewport;
  stage.style.setProperty('--player-aspect', String(width / height));
  document.title = `${bundle.screen.location_name || ''} ${bundle.screen.name || 'TV Player'}`.trim();

  player?.destroy();
  player = new AnimationPreviewPlayer({ stage });
  const animationProfile = bundle.animation_profile;
  if (animationProfile?.enabled === true && animationProfile.profile) {
    player.restart(animationProfile.profile);
  } else {
    stage.dataset.motionMode = 'static';
  }
  showStatus('');
}

document.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('dragstart', (event) => event.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (!wakeLock || wakeLock.released)) void requestWakeLock();
});

void Promise.all([loadScene(), requestWakeLock()]).catch((error) => {
  player?.destroy();
  renderAnimationScreenEmpty(stage, error.message);
  showStatus(error.message, true);
});
