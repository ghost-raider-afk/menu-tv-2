import { pageName } from './core/config.js';
import { loadAuthenticatedContext } from './core/session.js';
import { initialiseNavigation } from './core/navigation.js';
import { initialiseNotifications } from './core/notifications.js';
import { initialiseChrome } from './components/chrome.js';
import { initialiseShell } from './components/shell.js';

async function initialisePage(name) {
  switch (name) {
    case 'overview': {
      const { initialiseDashboard } = await import('./pages/dashboard.js');
      return initialiseDashboard();
    }
    case 'settings': {
      const { initialiseSettings } = await import('./pages/settings.js');
      return initialiseSettings();
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
    case 'screen-editor': {
      const { initialiseScreenEditor } = await import('./editor/editor.js');
      return initialiseScreenEditor();
    }
    case 'templates': {
      const { initialiseTemplates } = await import('./pages/templates.js');
      return initialiseTemplates();
    }
    case 'catalog': {
      const { initialiseCatalog } = await import('./pages/catalog.js');
      return initialiseCatalog();
    }
    default:
      return undefined;
  }
}

async function initialiseApplication() {
  const current = pageName();
  if (current === 'signin') {
    document.body.classList.add('ui-v319');
    const { initialiseSignIn } = await import('./pages/signin.js');
    initialiseSignIn();
    return;
  }

  try {
    await loadAuthenticatedContext();
    initialiseShell();
    initialiseNavigation();
    initialiseChrome();
    initialiseNotifications();
    await initialisePage(current);
  } catch (error) {
    console.error('Application initialization failed', error);
    window.location.replace('/signin.html');
  }
}

void initialiseApplication();
