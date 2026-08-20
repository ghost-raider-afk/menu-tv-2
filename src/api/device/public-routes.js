import crypto from 'node:crypto';
import express from 'express';
import { createActivationQrSvg } from '../../services/qr-code-service.js';
import {
  createActivationCredentials,
  deterministicDeviceSessionToken,
  deviceSessionCookie,
  deviceSessionTokenFromRequest,
  remoteAddress,
  tokenHash,
  userAgent
} from '../../services/device-session-service.js';

function activationId(value) {
  const id = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

function activationSecret(request) {
  const value = request.get('x-device-activation-secret');
  return typeof value === 'string' && value.length >= 32 && value.length <= 128 ? value : null;
}

function publicScreen(session) {
  return {
    id: session.screen_id,
    name: session.screen_name,
    resolution: session.resolution,
    status: session.screen_status,
    location_id: session.location_id,
    location_name: session.location_name,
    location_number: session.location_number
  };
}

function filterPlayerCatalog(draft, products, packaging) {
  const productIds = new Set();
  const packagingIds = new Set();
  for (const row of draft?.rows || []) {
    const productId = Number(row?.product_id ?? row?.productId);
    const packagingId = Number(row?.packaging_id ?? row?.packagingId);
    if (Number.isSafeInteger(productId) && productId > 0) productIds.add(productId);
    if (Number.isSafeInteger(packagingId) && packagingId > 0) packagingIds.add(packagingId);
  }
  return {
    products: products.filter((item) => productIds.has(Number(item.id))),
    packaging: packaging.filter((item) => packagingIds.has(Number(item.id)))
  };
}

async function createPendingActivation(store, config, request) {
  const expiresAt = new Date(Date.now() + config.deviceActivationTtlMinutes * 60_000).toISOString();
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const credentials = createActivationCredentials();
    try {
      await store.createDeviceActivation({
        id: credentials.id,
        scanTokenHash: tokenHash(credentials.scanToken),
        pollSecretHash: tokenHash(credentials.pollSecret),
        reserveCodeHash: tokenHash(credentials.reserveCode),
        expiresAt,
        userAgent: userAgent(request),
        remoteAddress: remoteAddress(request)
      });
      return { credentials, expiresAt };
    } catch (error) {
      lastError = error;
      if (error?.code !== '23505') throw error;
    }
  }
  throw lastError || new Error('Не удалось создать уникальный код подключения телевизора.');
}

async function resolveDeviceSession(store, config, request, response) {
  const rawToken = deviceSessionTokenFromRequest(request);
  if (!rawToken) return null;
  const session = await store.getActiveDeviceSessionByHash(tokenHash(rawToken));
  if (!session) {
    response.setHeader('Set-Cookie', deviceSessionCookie('', config, 0));
    return null;
  }

  const now = Date.now();
  const staleBeforeMs = now - config.deviceHeartbeatWriteSeconds * 1000;
  const lastSeenMs = Date.parse(session.session_last_seen_at || '');
  if (!Number.isFinite(lastSeenMs) || lastSeenMs < staleBeforeMs) {
    await store.touchDeviceSession(
      session.session_id,
      session.device_id,
      new Date(now).toISOString(),
      new Date(staleBeforeMs).toISOString()
    );
  }
  return session;
}

export function createDevicePublicRouter({ store, config }) {
  const router = express.Router();
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.post('/activations', async (request, response) => {
    const existingSession = await resolveDeviceSession(store, config, request, response);
    if (existingSession) {
      return response.status(409).json({
        error: 'Телевизор уже авторизован.',
        authorized: true,
        screen: publicScreen(existingSession)
      });
    }

    const { credentials, expiresAt } = await createPendingActivation(store, config, request);
    response.status(201).json({
      activation_id: credentials.id,
      qr_svg: createActivationQrSvg(credentials.scanToken),
      reserve_code: credentials.reserveCode,
      poll_secret: credentials.pollSecret,
      expires_at: expiresAt,
      poll_interval_ms: config.deviceActivationPollSeconds * 1000
    });
  });

  router.get('/activations/:id/status', async (request, response) => {
    const id = activationId(request.params.id);
    const secret = activationSecret(request);
    if (!id || !secret) return response.status(404).json({ error: 'Активация не найдена.' });

    const result = await store.transaction(async (tx) => {
      const activation = await tx.getDeviceActivationForPoll(id, tokenHash(secret), { lock: true });
      if (!activation) return { status: 'missing' };
      if (Date.parse(activation.expires_at) <= Date.now()) return { status: 'expired' };
      if (activation.status === 'pending') return { status: 'pending', expiresAt: activation.expires_at };

      const rawToken = deterministicDeviceSessionToken(activation.id, secret, config);
      const rawTokenHash = tokenHash(rawToken);

      if (activation.status === 'consumed') {
        const session = await tx.getActiveDeviceSessionByHash(rawTokenHash);
        if (!session) return { status: 'expired' };
        return { status: 'authorized', rawToken, session };
      }

      if (activation.status !== 'approved' || !activation.approved_screen_id) return { status: 'expired' };
      const screen = await tx.getScreen(activation.approved_screen_id);
      if (!screen || screen.active === false) return { status: 'expired' };

      await tx.deactivateDevicesForScreen(screen.id);
      const device = await tx.createDevice({
        screenId: screen.id,
        label: screen.name,
        userAgent: activation.user_agent,
        remoteAddress: activation.remote_address,
        authorizedBy: activation.approved_by
      });
      const sessionId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + config.deviceSessionTtlDays * 86_400_000).toISOString();
      await tx.createDeviceSession({ id: sessionId, deviceId: device.id, tokenHash: rawTokenHash, expiresAt });
      const consumed = await tx.markDeviceActivationConsumed(activation.id, device.id, sessionId);
      if (!consumed) throw new Error('Не удалось завершить авторизацию телевизора.');
      const session = await tx.getActiveDeviceSessionByHash(rawTokenHash);
      if (!session) throw new Error('Созданная Device Session недоступна.');
      return { status: 'authorized', rawToken, session };
    });

    if (result.status === 'missing') return response.status(404).json({ error: 'Активация не найдена.' });
    if (result.status === 'expired') return response.status(410).json({ status: 'expired' });
    if (result.status === 'pending') return response.json({ status: 'pending', expires_at: result.expiresAt });

    response.setHeader('Set-Cookie', deviceSessionCookie(result.rawToken, config));
    return response.json({ status: 'authorized', screen: publicScreen(result.session) });
  });

  router.get('/session', async (request, response) => {
    const session = await resolveDeviceSession(store, config, request, response);
    if (!session) return response.status(401).json({ authorized: false });
    return response.json({
      authorized: true,
      device_id: session.device_id,
      session_expires_at: session.expires_at,
      screen: publicScreen(session)
    });
  });

  router.get('/player-context', async (request, response) => {
    const session = await resolveDeviceSession(store, config, request, response);
    if (!session) return response.status(401).json({ error: 'Телевизор не авторизован.' });

    const [screen, draft, products, packaging, animation] = await Promise.all([
      store.getScreen(session.screen_id),
      store.getScreenDraft(session.screen_id),
      store.listProducts(),
      store.listPackaging(),
      store.getAnimationSettings()
    ]);
    if (!screen || screen.active === false) {
      response.setHeader('Set-Cookie', deviceSessionCookie('', config, 0));
      return response.status(401).json({ error: 'Привязка телевизора больше не активна.' });
    }
    const catalog = filterPlayerCatalog(draft, products, packaging);

    return response.json({
      screen: {
        id: screen.id,
        name: screen.name,
        resolution: screen.resolution,
        status: screen.status,
        location_id: screen.location_id,
        location_name: screen.location_name,
        location_number: screen.location_number
      },
      draft: { rows: draft.rows || [], settings: draft.settings || {}, revision: draft.revision },
      products: catalog.products,
      packaging: catalog.packaging,
      animation: animation || { enabled: false, preset_id: '', profile: {} },
      refresh_interval_ms: config.playerRefreshSeconds * 1000
    });
  });

  return router;
}
