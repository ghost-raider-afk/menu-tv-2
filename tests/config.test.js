import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config/index.js';
import { generateSftpPassword } from '../src/sftp/index.js';

function validEnv(overrides = {}) {
  return {
    SESSION_SECRET: 's'.repeat(48),
    POSTGRES_DB: 'menu_tv_2',
    POSTGRES_USER: 'menu_tv_2',
    POSTGRES_PASSWORD: 'p'.repeat(32),
    SFTP_PUBLIC_HOST: 'menu.example.test',
    SFTP_ADMIN_USERNAME: 'menu_tv_2_service',
    SFTP_ADMIN_PASSWORD: 'a'.repeat(40),
    ...overrides
  };
}

test('runtime limits are controlled by environment values', () => {
  const config = loadConfig(validEnv({
    JSON_BODY_MAX_BYTES: '70000',
    MENU_DRAFT_MAX_BYTES: '50000',
    SCREEN_SOURCE_MAX_BYTES: '13000000',
    TEMPLATE_BACKGROUND_MAX_BYTES: '9000000',
    DASHBOARD_REFRESH_MIN_SECONDS: '20',
    DASHBOARD_REFRESH_MAX_SECONDS: '240',
    SCREEN_MAX_WIDTH: '1600',
    SCREEN_MAX_HEIGHT: '900',
    LOGIN_MAX_ATTEMPTS: '6',
    LOGIN_WINDOW_MINUTES: '10',
    LOGIN_LIMITER_MAX_ENTRIES: '700',
    GENERATED_PASSWORD_LENGTH: '18',
    SFTP_API_TIMEOUT_MS: '4200',
    SFTP_STAGING_MAX_AGE_HOURS: '36'
  }));

  assert.equal(config.jsonBodyMaxBytes, 70000);
  assert.equal(config.menuDraftMaxBytes, 50000);
  assert.equal(config.screenSourceMaxBytes, 13000000);
  assert.equal(config.templateBackgroundMaxBytes, 9000000);
  assert.equal(config.dashboardRefreshMinSeconds, 20);
  assert.equal(config.dashboardRefreshMaxSeconds, 240);
  assert.equal(config.screenMaxWidth, 1600);
  assert.equal(config.screenMaxHeight, 900);
  assert.equal(config.loginMaxAttempts, 6);
  assert.equal(config.loginWindowMinutes, 10);
  assert.equal(config.loginLimiterMaxEntries, 700);
  assert.equal(config.generatedPasswordLength, 18);
  assert.equal(config.sftp.apiTimeoutMs, 4200);
  assert.equal(config.sftp.stagingMaxAgeHours, 36);
});

test('generated SFTP password respects configured length and character classes', () => {
  const password = generateSftpPassword(18);
  assert.equal(password.length, 18);
  assert.match(password, /[A-Z]/);
  assert.match(password, /[a-z]/);
  assert.match(password, /\d/);
});
