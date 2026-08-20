import crypto from 'node:crypto';
import { parseCookies } from './session-service.js';

export const PLAYER_DEVICE_COOKIE = 'menu_tv_2_player_device';

export function opaqueToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

export function pairingCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function expiresAfterDays(days, now = Date.now()) {
  return new Date(now + Number(days) * 86_400_000).toISOString();
}

export function expiresAfterMinutes(minutes, now = Date.now()) {
  return new Date(now + Number(minutes) * 60_000).toISOString();
}

export function playerDeviceCookie(token, config) {
  const maxAge = config.player.deviceSessionTtlDays * 86_400;
  return `${PLAYER_DEVICE_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${config.secureCookies ? '; Secure' : ''}`;
}

export function clearPlayerDeviceCookie(config) {
  return `${PLAYER_DEVICE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${config.secureCookies ? '; Secure' : ''}`;
}

export function playerDeviceToken(request) {
  return parseCookies(request)[PLAYER_DEVICE_COOKIE] || '';
}

export function playerSessionState(session, now = Date.now()) {
  if (!session) return 'missing';
  if (session.revoked_at) return 'revoked';
  if (new Date(session.expires_at).getTime() <= now) return 'expired';
  if (!session.screen_id || !session.authorized_at) return 'pending';
  return 'authorized';
}

export function shouldRefreshPlayerSession(session, config, now = Date.now()) {
  if (playerSessionState(session, now) !== 'authorized') return false;
  const lastSeen = session.last_seen_at ? new Date(session.last_seen_at).getTime() : 0;
  return !lastSeen || now - lastSeen >= config.player.deviceSessionRefreshHours * 3_600_000;
}
