import { API } from './config.js';
import { api } from './api.js';
import { state } from './state.js';
import { applyPresentation, applyTheme } from './presentation.js';
import { updateProfileMenu } from '../components/chrome.js';

export async function loadAuthenticatedContext() {
  const [session, user, site] = await Promise.all([
    api.get(API.session),
    api.get(API.userSettings),
    api.get(API.siteSettings)
  ]);
  state.session = session;
  state.user = user;
  state.site = site;
  updateProfileMenu(user);
  applyTheme(user.theme);
  applyPresentation(site);
  return { session, user, site };
}
