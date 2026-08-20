import express from 'express';
import { positiveId } from '../../contracts/input.js';
import { activity, notFound } from '../helpers.js';

function playerToken(value) {
  const token = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9_-]{24,96}$/.test(token)) throw notFound();
  return token;
}

export function createPublicPlayerRouter({ store }) {
  const router = express.Router();

  router.get('/:token/scene', async (request, response) => {
    const workspace = await store.getPlayerWorkspaceByToken(playerToken(request.params.token));
    if (!workspace) throw notFound();
    const screen = await store.getScreen(workspace.screen_id);
    if (!screen || screen.active === false) throw notFound();
    const [draft, products, packaging, animationProfile] = await Promise.all([
      store.getScreenDraft(screen.id),
      store.listProducts(),
      store.listPackaging(),
      screen.animation_profile_id ? store.getAnimationProfile(screen.animation_profile_id) : Promise.resolve(null)
    ]);
    response.setHeader('Cache-Control', 'no-store');
    response.json({
      workspace: { id: workspace.id, screen_id: screen.id },
      screen,
      draft,
      products,
      packaging,
      animation_profile: animationProfile
    });
  });

  return router;
}

export function createPlayerAdminRouter({ store }) {
  const router = express.Router();

  router.get('/screens/:id/player-workspace', async (request, response) => {
    const screenId = positiveId(request.params.id, 'id');
    if (!await store.getScreen(screenId)) throw notFound();
    response.json(await store.ensurePlayerWorkspace(screenId));
  });

  router.post('/screens/:id/player-workspace/rotate', async (request, response) => {
    const screenId = positiveId(request.params.id, 'id');
    const screen = await store.getScreen(screenId);
    if (!screen) throw notFound();
    await store.ensurePlayerWorkspace(screenId);
    const workspace = await store.rotatePlayerWorkspaceToken(screenId);
    await activity(store, request, {
      action: 'player.workspace.token_rotated',
      entity_type: 'screen',
      entity_id: screenId,
      message: `Обновлена ссылка fullscreen-плеера монитора «${screen.name}».`
    });
    response.json(workspace);
  });

  router.put('/screens/:id/player-workspace', async (request, response) => {
    const screenId = positiveId(request.params.id, 'id');
    const screen = await store.getScreen(screenId);
    if (!screen) throw notFound();
    if (typeof request.body?.enabled !== 'boolean') return response.status(400).json({ error: 'Поле «enabled» должно быть логическим значением.' });
    await store.ensurePlayerWorkspace(screenId);
    const workspace = await store.setPlayerWorkspaceEnabled(screenId, request.body.enabled);
    await activity(store, request, {
      action: 'player.workspace.updated',
      entity_type: 'screen',
      entity_id: screenId,
      message: request.body.enabled
        ? `Fullscreen-плеер монитора «${screen.name}» включён.`
        : `Fullscreen-плеер монитора «${screen.name}» отключён.`
    });
    response.json(workspace);
  });

  return router;
}
