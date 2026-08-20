import express from 'express';
import { positiveId } from '../../contracts/input.js';
import {
  clearPlayerDeviceCookie,
  expiresAfterDays,
  expiresAfterMinutes,
  opaqueToken,
  pairingCode,
  playerDeviceCookie,
  playerDeviceToken,
  playerSessionState,
  shouldRefreshPlayerSession,
  tokenHash
} from '../../services/player-auth-service.js';
import { activity, conflict, notFound } from '../helpers.js';

function pairingToken(value) {
  const token = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9_-]{20,96}$/.test(token)) throw notFound();
  return token;
}

function displayCode(value) {
  const code = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{6}$/.test(code)) throw notFound();
  return code;
}

function referencedCatalog(draft, products, packaging) {
  const rows = Array.isArray(draft?.rows) ? draft.rows : [];
  const productIds = new Set(rows.map((row) => Number(row?.product_id)).filter(Number.isSafeInteger));
  const packagingIds = new Set(rows.map((row) => Number(row?.packaging_id)).filter(Number.isSafeInteger));
  return {
    products: products.filter((item) => productIds.has(Number(item.id))),
    packaging: packaging.filter((item) => packagingIds.has(Number(item.id)))
  };
}

async function resolveDeviceSession(store, request) {
  const rawToken = playerDeviceToken(request);
  if (!rawToken) return { rawToken: '', session: null, state: 'missing' };
  const session = await store.getPlayerDeviceSessionByTokenHash(tokenHash(rawToken));
  return { rawToken, session, state: playerSessionState(session) };
}

async function createPairing(store, config) {
  await store.cleanupPlayerPairings();
  if (await store.countPendingPlayerPairings() >= config.player.pairingMaxPending) {
    const error = new Error('Слишком много ожидающих подключений телевизоров. Повторите попытку позже.');
    error.status = 429;
    throw error;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const deviceToken = opaqueToken(32);
    const pairToken = opaqueToken(18);
    const code = pairingCode();
    try {
      const pairing = await store.transaction((tx) => tx.createPlayerPairing({
        token_hash: tokenHash(deviceToken),
        pair_token_hash: tokenHash(pairToken),
        display_code: code,
        session_expires_at: expiresAfterDays(config.player.deviceSessionTtlDays),
        pairing_expires_at: expiresAfterMinutes(config.player.pairingTtlMinutes)
      }));
      return { pairing, deviceToken, pairToken };
    } catch (error) {
      if (error?.code !== '23505' || attempt === 7) throw error;
    }
  }
  throw new Error('Не удалось создать уникальный код подключения телевизора.');
}

async function lookupPairing(store, body = {}) {
  if (body.token) return store.getPlayerPairingByTokenHash(tokenHash(pairingToken(body.token)));
  if (body.code) return store.getPlayerPairingByDisplayCode(displayCode(body.code));
  throw notFound();
}

function pairingResponse(pairing) {
  if (!pairing) throw notFound();
  const now = Date.now();
  return {
    id: pairing.id,
    display_code: pairing.display_code,
    expires_at: pairing.expires_at,
    status: pairing.approved_at ? 'approved' : new Date(pairing.expires_at).getTime() <= now ? 'expired' : 'pending',
    screen_id: pairing.screen_id,
    screen_name: pairing.screen_name,
    location_id: pairing.location_id,
    location_name: pairing.location_name
  };
}

async function sceneBundle(store, session) {
  const screen = await store.getScreen(session.screen_id);
  if (!screen || screen.active === false) throw notFound();
  const [draft, allProducts, allPackaging, animationProfile] = await Promise.all([
    store.getScreenDraft(screen.id),
    store.listProducts(),
    store.listPackaging(),
    screen.animation_profile_id ? store.getAnimationProfile(screen.animation_profile_id) : Promise.resolve(null)
  ]);
  const catalog = referencedCatalog(draft, allProducts, allPackaging);
  return {
    device: { id: session.id, screen_id: screen.id },
    screen: {
      id: screen.id,
      name: screen.name,
      resolution: screen.resolution,
      location_name: screen.location_name,
      active: screen.active
    },
    draft,
    products: catalog.products,
    packaging: catalog.packaging,
    animation_profile: animationProfile ? {
      id: animationProfile.id,
      name: animationProfile.name,
      enabled: animationProfile.enabled,
      preset_id: animationProfile.preset_id,
      profile: animationProfile.profile
    } : null
  };
}

export function createPublicPlayerRouter({ store, config }) {
  const router = express.Router();

  router.get('/session', async (request, response) => {
    const resolved = await resolveDeviceSession(store, request);
    if (resolved.state === 'expired' || resolved.state === 'revoked') {
      response.setHeader('Set-Cookie', clearPlayerDeviceCookie(config));
      return response.json({ status: 'unpaired' });
    }
    if (resolved.state === 'missing') return response.json({ status: 'unpaired' });
    if (resolved.state === 'pending') return response.json({ status: 'pending', expires_at: resolved.session.expires_at });

    let session = resolved.session;
    if (shouldRefreshPlayerSession(session, config)) {
      session = await store.refreshPlayerDeviceSession(session.id, expiresAfterDays(config.player.deviceSessionTtlDays));
      response.setHeader('Set-Cookie', playerDeviceCookie(resolved.rawToken, config));
    }
    response.setHeader('Cache-Control', 'no-store');
    return response.json({
      status: 'authorized',
      device: {
        id: session.id,
        screen_id: session.screen_id,
        screen_name: session.screen_name,
        location_name: session.location_name,
        expires_at: session.expires_at,
        last_seen_at: session.last_seen_at
      }
    });
  });

  router.post('/pairings', async (request, response) => {
    const current = await resolveDeviceSession(store, request);
    if (current.state === 'authorized') return response.status(409).json({ error: 'Этот телевизор уже авторизован.' });

    const created = await createPairing(store, config);
    const pairUrl = `${request.protocol}://${request.get('host')}/pair.html?token=${encodeURIComponent(created.pairToken)}`;
    response.setHeader('Set-Cookie', playerDeviceCookie(created.deviceToken, config));
    response.setHeader('Cache-Control', 'no-store');
    response.status(201).json({
      status: 'pending',
      token: created.pairToken,
      code: created.pairing.display_code,
      pair_url: pairUrl,
      expires_at: created.pairing.expires_at
    });
  });

  router.get('/scene', async (request, response) => {
    const resolved = await resolveDeviceSession(store, request);
    if (resolved.state !== 'authorized') {
      if (resolved.state === 'expired' || resolved.state === 'revoked') response.setHeader('Set-Cookie', clearPlayerDeviceCookie(config));
      return response.status(401).json({ error: 'Телевизор не авторизован.' });
    }

    let session = resolved.session;
    if (shouldRefreshPlayerSession(session, config)) {
      session = await store.refreshPlayerDeviceSession(session.id, expiresAfterDays(config.player.deviceSessionTtlDays));
      response.setHeader('Set-Cookie', playerDeviceCookie(resolved.rawToken, config));
    } else {
      await store.touchPlayerDeviceSession(session.id);
    }
    response.setHeader('Cache-Control', 'no-store');
    response.json(await sceneBundle(store, session));
  });

  return router;
}

export function createPlayerAdminRouter({ store, config }) {
  const router = express.Router();

  router.post('/pairings/lookup', async (request, response) => {
    response.json(pairingResponse(await lookupPairing(store, request.body)));
  });

  router.post('/pairings/authorize', async (request, response) => {
    const pairing = await lookupPairing(store, request.body);
    const state = pairingResponse(pairing);
    if (state.status === 'expired') throw conflict('Код подключения телевизора истёк. На телевизоре создайте новый QR-код.');
    if (state.status === 'approved') throw conflict('Этот код уже использован.');

    const screenId = positiveId(request.body?.screen_id, 'screen_id');
    const screen = await store.getScreen(screenId);
    if (!screen) throw notFound();
    if (screen.active === false) throw conflict('Нельзя подключить телевизор к отключённому монитору.');

    const device = await store.transaction((tx) => tx.authorizePlayerPairing(
      pairing.id,
      screenId,
      request.session.sub,
      expiresAfterDays(config.player.deviceSessionTtlDays)
    ));
    if (!device) throw conflict('Код подключения уже истёк или был использован.');

    await activity(store, request, {
      action: 'player.device.authorized',
      entity_type: 'screen',
      entity_id: screenId,
      message: `Телевизор авторизован для монитора «${screen.name}» точки «${screen.location_name}».`
    });
    response.json(device);
  });

  router.get('/screens/:id/device', async (request, response) => {
    const screenId = positiveId(request.params.id, 'id');
    if (!await store.getScreen(screenId)) throw notFound();
    response.json({ device: await store.getActivePlayerDeviceForScreen(screenId) });
  });

  router.post('/screens/:id/device/revoke', async (request, response) => {
    const screenId = positiveId(request.params.id, 'id');
    const screen = await store.getScreen(screenId);
    if (!screen) throw notFound();
    const revoked = await store.revokePlayerDevicesForScreen(screenId);
    await activity(store, request, {
      action: 'player.device.revoked',
      entity_type: 'screen',
      entity_id: screenId,
      message: `Отозвана авторизация TV Player монитора «${screen.name}». Сессий: ${revoked}.`
    });
    response.json({ revoked });
  });

  return router;
}
