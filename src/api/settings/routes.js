import express from 'express';
import { positiveId, siteSettingsInput, userPreferencesInput } from '../../contracts/input.js';
import { animationProfileRecordInput, animationSettingsInput } from '../../contracts/animation.js';
import { activity, conflict, notFound } from '../helpers.js';
import { hashPassword, passwordChangeInput, verifyPassword } from '../../services/password-service.js';
import { issueSession, sessionCookie, themeCookie } from '../../services/session-service.js';
import { replaceSiteImage, siteSettingsResponse } from '../../services/site-assets-service.js';

async function primaryAnimationProfile(store) {
  const profiles = await store.listAnimationProfiles();
  return profiles[0] || null;
}

export function createSettingsRouter({ store, config }) {
  const router = express.Router();

  router.get('/user', async (request, response) => response.json(await store.getUserPreferences(request.session.sub)));
  router.put('/user', async (request, response) => {
    const preferences = await store.updateUserPreferences(request.session.sub, userPreferencesInput(request.body));
    await activity(store, request, { action: 'settings.user.updated', entity_type: 'user_preferences', entity_id: request.session.sub, message: 'Обновлены личные настройки пользователя.' });
    response.setHeader('Set-Cookie', themeCookie(preferences.theme, config));
    response.json(preferences);
  });
  router.put('/user/password', async (request, response) => {
    const { currentPassword, newPassword } = passwordChangeInput(request.body, config);
    if (!await verifyPassword(currentPassword, request.session.user.password_hash)) return response.status(400).json({ error: 'Текущий пароль введён неверно.' });
    const user = await store.updateUserPassword(request.session.sub, await hashPassword(newPassword));
    if (!user) throw notFound();
    const preferences = await store.getUserPreferences(user.username);
    await activity(store, request, { action: 'settings.user.password_updated', entity_type: 'user', entity_id: user.username, message: 'Изменён пароль пользователя.' });
    response.setHeader('Set-Cookie', [sessionCookie(issueSession(user, config), config), themeCookie(preferences.theme, config)]);
    response.status(204).end();
  });

  router.get('/site', async (_request, response) => {
    response.json(siteSettingsResponse(await store.getSiteSettings(), config));
  });
  router.put('/site', async (request, response) => {
    const settings = await store.updateSiteSettings({ ...siteSettingsInput(request.body, config), updated_by: request.session.sub });
    await activity(store, request, { action: 'settings.site.updated', entity_type: 'site_settings', entity_id: settings.id, message: 'Обновлены настройки сайта.' });
    response.json(siteSettingsResponse(settings, config));
  });

  router.get('/animation/profiles', async (_request, response) => {
    response.json(await store.listAnimationProfiles());
  });
  router.post('/animation/profiles', async (request, response) => {
    const profile = await store.createAnimationProfile({
      ...animationProfileRecordInput(request.body),
      updated_by: request.session.sub
    });
    await activity(store, request, {
      action: 'settings.animation_profile.created',
      entity_type: 'animation_profile',
      entity_id: profile.id,
      message: `Создан профиль анимации «${profile.name}».`
    });
    response.status(201).json(profile);
  });
  router.put('/animation/profiles/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const profile = await store.updateAnimationProfile(id, {
      ...animationProfileRecordInput(request.body),
      updated_by: request.session.sub
    });
    if (!profile) throw notFound();
    await activity(store, request, {
      action: 'settings.animation_profile.updated',
      entity_type: 'animation_profile',
      entity_id: profile.id,
      message: `Обновлён профиль анимации «${profile.name}».`
    });
    response.json(profile);
  });
  router.delete('/animation/profiles/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const profile = await store.getAnimationProfile(id);
    if (!profile) throw notFound();
    if (profile.assigned_screen_count > 0) throw conflict('Профиль назначен мониторам. Сначала переназначьте или отключите его на этих экранах.');
    if (!await store.deleteAnimationProfile(id)) throw conflict('Профиль сейчас нельзя удалить.');
    await activity(store, request, {
      action: 'settings.animation_profile.deleted',
      entity_type: 'animation_profile',
      entity_id: id,
      message: `Удалён профиль анимации «${profile.name}».`
    });
    response.status(204).end();
  });

  // Compatibility endpoint for clients from the global-animation era. It now addresses the first library profile.
  router.get('/animation', async (_request, response) => {
    const profile = await primaryAnimationProfile(store);
    if (!profile) throw notFound();
    response.json(profile);
  });
  router.put('/animation', async (request, response) => {
    const current = await primaryAnimationProfile(store);
    if (!current) throw notFound();
    const profile = await store.updateAnimationProfile(current.id, {
      name: current.name,
      ...animationSettingsInput(request.body),
      updated_by: request.session.sub
    });
    await activity(store, request, { action: 'settings.animation.updated', entity_type: 'animation_profile', entity_id: profile.id, message: 'Обновлён основной профиль анимации экранов.' });
    response.json(profile);
  });

  router.put('/site/logo', express.raw({ type: '*/*', limit: config.siteLogoMaxBytes }), async (request, response) => {
    const settings = await replaceSiteImage({ kind: 'logo', bytes: request.body, config, store, username: request.session.sub });
    await activity(store, request, { action: 'settings.site.logo_updated', entity_type: 'site_settings', entity_id: settings.id, message: 'Обновлён логотип сайта.' });
    response.json(siteSettingsResponse(settings, config));
  });
  router.put('/site/favicon', express.raw({ type: '*/*', limit: config.siteFaviconMaxBytes }), async (request, response) => {
    const settings = await replaceSiteImage({ kind: 'favicon', bytes: request.body, config, store, username: request.session.sub });
    await activity(store, request, { action: 'settings.site.favicon_updated', entity_type: 'site_settings', entity_id: settings.id, message: 'Обновлён favicon сайта.' });
    response.json(siteSettingsResponse(settings, config));
  });

  return router;
}
