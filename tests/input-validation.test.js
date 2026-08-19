import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config/index.js';
import { positiveId, siteSettingsInput } from '../src/contracts/input.js';
import { passwordChangeInput } from '../src/services/password-service.js';

function config() {
  return {
    passwordMinLength: 10,
    passwordMaxLength: 32,
    dashboardRefreshMinSeconds: 15,
    dashboardRefreshMaxSeconds: 300,
    screenMaxWidth: 1920,
    screenMaxHeight: 1080
  };
}

test('positive ids reject trailing characters and unsafe integers', () => {
  assert.equal(positiveId('42', 'id'), 42);
  assert.equal(positiveId(42, 'id'), 42);
  assert.throws(() => positiveId('42abc', 'id'), /положительным целым/);
  assert.throws(() => positiveId('1.5', 'id'), /положительным целым/);
  assert.throws(() => positiveId('9007199254740993', 'id'), /положительным целым/);
});

test('site refresh interval rejects numeric prefixes with junk suffixes', () => {
  const base = {
    application_name: 'ТВ МЕНЮ',
    accent_color: '#F4C915',
    timezone: 'Europe/Moscow',
    date_format: 'DD.MM.YYYY',
    default_screen_resolution: '1920×1080'
  };
  assert.equal(siteSettingsInput({ ...base, dashboard_refresh_seconds: '30' }, config()).dashboard_refresh_seconds, 30);
  assert.throws(() => siteSettingsInput({ ...base, dashboard_refresh_seconds: '30seconds' }, config()), /Интервал обновления/);
});

test('current password is verified as entered while complexity applies only to the new password', () => {
  const result = passwordChangeInput({ current_password: 'legacy', new_password: 'New-Password1!' }, config());
  assert.equal(result.currentPassword, 'legacy');
  assert.throws(() => passwordChangeInput({ current_password: 'legacy', new_password: 'weakpassword' }, config()), /строчную и прописную/);
});

test('environment integer parser rejects partial numeric strings', () => {
  const env = {
    SESSION_SECRET: 's'.repeat(48),
    POSTGRES_DB: 'menu_tv_2',
    POSTGRES_USER: 'menu_tv_2',
    POSTGRES_PASSWORD: 'p'.repeat(32),
    SFTP_PUBLIC_HOST: 'menu.example.test',
    SFTP_ADMIN_USERNAME: 'menu_tv_2_service',
    SFTP_ADMIN_PASSWORD: 'a'.repeat(40),
    SFTP_API_TIMEOUT_MS: '5000ms'
  };
  assert.throws(() => loadConfig(env), /SFTP_API_TIMEOUT_MS.*целым числом/);
});
