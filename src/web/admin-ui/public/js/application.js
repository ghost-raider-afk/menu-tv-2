import { pageName } from './core/config.js';
import { loadAuthenticatedContext } from './core/session.js';
import { initialiseNotifications } from './core/notifications.js';
import { createAppRouter } from './core/router.js';
import { state } from './core/state.js';
import { initialiseShell, refreshShellRoute } from './components/shell.js';

function resetTransientPageState(name) {
  if (name === 'locations') state.editingLocationId = null;
  if (name === 'catalog') {
    state.editingProductId = null;
    state.editingPackagingId = null;
  }
}

async function initialisePage(name) {
  resetTransientPageState(name);
  switch (name) {
    case 'overview': {
      const { initialiseDashboard } = await import('./pages/dashboard.js');
      return initialiseDashboard();
    }
    case 'settings': {
      const { initialiseSettings } = await import('./pages/settings.js');
      return initialiseSettings();
    }
    case 'sftp-settings': {
      const { initialiseSftpSettings } = await import('./pages/sftp-settings.js');
      return initialiseSftpSettings();
    }
    case 'animation': {
      const { initialiseAnimationStudio } = await import('./pages/animation.js');
      return initialiseAnimationStudio();
    }
    case 'activity': {
      const { initialiseActivityLog } = await import('./pages/activity.js');
      return initialiseActivityLog();
    }
    case 'profile': {
      const { initialiseProfile } = await import('./pages/profile.js');
      return initialiseProfile();
    }
    case 'locations': {
      const { initialiseLocations } = await import('./pages/locations.js');
      return initialiseLocations();
    }
    case 'screens': {
      const { initialiseScreens } = await import('./pages/screens.js');
      return initialiseScreens();
    }
    case 'connect-tv': {
      const { initialiseConnectTv } = await import('./pages/connect-tv.js');
      return initialiseConnectTv();
    }
    case 'screen-editor': {
      const { initialiseScreenEditor } = await import('./editor/editor.js');
      return initialiseScreenEditor();
    }
    case 'catalog': {
      const { initialiseCatalog } = await import('./pages/catalog.js');
      return initialiseCatalog();
    }
    default:
      return undefined;
  }
}

function showApplicationFailure(error) {
  const message = error instanceof Error && error.message
    ? error.message
    : 'Не удалось открыть раздел.';
  const main = document.querySelector('.main-content');
  if (main) {
    main.removeAttribute('inert');
    main.removeAttribute('aria-busy');
    main.dataset.routeState = 'error';
    main.innerHTML = `<section class="settings-card app-route-error" role="alert"><div class="card-heading"><div><p class="eyebrow">ОШИБКА РАЗДЕЛА</p><h2>Раздел не удалось загрузить</h2></div></div><p class="muted-copy">${String(message).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</p><div class="form-actions"><button class="button button-primary" type="button" data-reload-page>Повторить</button></div></section>`;
    main.querySelector('[data-reload-page]')?.addEventListener('click', () => window.location.reload());
    return;
  }
  document.body.dataset.appState = 'error';
}

async function initialiseApplication() {
  const current = pageName();
  if (current === 'signin') {
    const { initialiseSignIn } = await import('./pages/signin.js');
    initialiseSignIn();
    return;
  }

  try {
    await loadAuthenticatedContext();
    initialiseShell();
    initialiseNotifications();
    const router = createAppRouter({ mountPage: initialisePage, syncShell: refreshShellRoute });
    await router.start();
  } catch (error) {
    console.error('Application initialization failed', error);
    showApplicationFailure(error);
  }
}

void initialiseApplication();
