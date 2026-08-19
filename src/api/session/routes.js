import express from 'express';
import { themeCookie } from '../../services/session-service.js';

export function createSessionRouter({ store, config }) {
  const router = express.Router();
  router.get('/session', async (request, response) => {
    const [preferences, settings] = await Promise.all([
      store.getUserPreferences(request.session.sub),
      store.getSiteSettings()
    ]);
    response.setHeader('Set-Cookie', themeCookie(preferences.theme, config));
    response.json({
      status: 'ok',
      app_name: settings.application_name || config.appName,
      username: request.session.sub,
      display_name: preferences.display_name,
      theme: preferences.theme,
      notifications_enabled: preferences.notifications_enabled
    });
  });
  return router;
}
