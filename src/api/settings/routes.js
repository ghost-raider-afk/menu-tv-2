import express from 'express';
import { siteSettingsInput, userPreferencesInput } from '../../contracts/input.js';
import { animationSettingsInput, customAnimationPresetInput } from '../../contracts/animation.js';
import { activity, notFound } from '../helpers.js';
import { hashPassword, passwordChangeInput, verifyPassword } from '../../services/password-service.js';
import { issueSession, sessionCookie, themeCookie } from '../../services/session-service.js';
import { replaceSiteImage, siteSettingsResponse } from '../../services/site-assets-service.js';

function presetId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw notFound();
  return id;
}
function duplicatePreset(error, response) {
  if (error?.code !== '23505') return false;
  response.status(409).json({ error: 'Пресет с таким названием уже существует.' });
  return true;
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

  router.get('/site', async (_request, response) => response.json(siteSettingsResponse(await store.getSiteSettings(), config)));
  router.put('/site', async (request, response) => {
    const settings = await store.updateSiteSettings({ ...siteSettingsInput(request.body, config), updated_by: request.session.sub });
    await activity(store, request, { action: 'settings.site.updated', entity_type: 'site_settings', entity_id: settings.id, message: 'Обновлены настройки сайта.' });
    response.json(siteSettingsResponse(settings, config));
  });

  router.get('/animation', async (_request, response) => response.json(await store.getAnimationSettings()));
  router.put('/animation', async (request, response) => {
    const settings = await store.updateAnimationSettings({ ...animationSettingsInput(request.body), updated_by: request.session.sub });
    await activity(store, request, { action: 'settings.animation.updated', entity_type: 'animation_settings', entity_id: settings.id, message: 'Обновлены настройки анимации экранов.' });
    response.json(settings);
  });

  router.get('/animation/presets', async (_request, response) => response.json(await store.listAnimationPresets()));
  router.post('/animation/presets', async (request, response) => {
    try {
      const input = customAnimationPresetInput(request.body);
      const saved = await store.createAnimationPreset({ ...input, created_by: request.session.sub });
      await activity(store, request, { action: 'settings.animation_preset.created', entity_type: 'animation_preset', entity_id: saved.id, message: `Создан пресет анимации «${saved.name}».` });
      response.status(201).json(saved);
    } catch (error) {
      if (duplicatePreset(error, response)) return;
      throw error;
    }
  });
  router.put('/animation/presets/:id', async (request, response) => {
    try {
      const id = presetId(request.params.id);
      if (!await store.getAnimationPreset(id)) throw notFound();
      const saved = await store.updateAnimationPreset(id, customAnimationPresetInput(request.body));
      await activity(store, request, { action: 'settings.animation_preset.updated', entity_type: 'animation_preset', entity_id: saved.id, message: `Обновлён пресет анимации «${saved.name}».` });
      response.json(saved);
    } catch (error) {
      if (duplicatePreset(error, response)) return;
      throw error;
    }
  });
  router.delete('/animation/presets/:id', async (request, response) => {
    const id = presetId(request.params.id);
    const existing = await store.getAnimationPreset(id);
    if (!existing) throw notFound();
    await store.deleteAnimationPreset(id);
    await activity(store, request, { action: 'settings.animation_preset.deleted', entity_type: 'animation_preset', entity_id: id, message: `Удалён пресет анимации «${existing.name}».` });
    response.status(204).end();
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
