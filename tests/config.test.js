import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config/index.js';
import { generateSftpPassword } from '../src/sftp/index.js';

function validEnv(overrides = {}) {
  return {
    APP_NAME: 'ТВ МЕНЮ',
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '8080',
    MENU_TV_2_DOMAIN: 'menu.example.test',
    SESSION_SECRET: 's'.repeat(48),
    SESSION_TTL_HOURS: '12',
    SECURE_COOKIES: 'false',
    PASSWORD_MIN_LENGTH: '10',
    PASSWORD_MAX_LENGTH: '32',
    GENERATED_PASSWORD_LENGTH: '10',
    LOGIN_MAX_ATTEMPTS: '8',
    LOGIN_IP_MAX_ATTEMPTS: '32',
    LOGIN_WINDOW_MINUTES: '15',
    LOGIN_LIMITER_MAX_ENTRIES: '500',
    JSON_BODY_MAX_BYTES: '65536',
    MENU_DRAFT_MAX_BYTES: '49152',
    SCREEN_SOURCE_MAX_BYTES: '12582912',
    DASHBOARD_REFRESH_MIN_SECONDS: '15',
    DASHBOARD_REFRESH_MAX_SECONDS: '300',
    SCREEN_MAX_WIDTH: '1920',
    SCREEN_MAX_HEIGHT: '1080',
    IMAGE_MAX_PIXELS: '40000000',
    SITE_ASSETS_ROOT: '/tmp/menu-tv-site-assets',
    SITE_LOGO_MAX_BYTES: '2097152',
    SITE_FAVICON_MAX_BYTES: '524288',
    TEMPLATE_BACKGROUND_MAX_BYTES: '12582912',
    HEALTH_READINESS_CACHE_MS: '2000',
    POSTGRES_HOST: 'db',
    POSTGRES_PORT: '5432',
    POSTGRES_DB: 'menu_tv_2',
    POSTGRES_USER: 'menu_tv_2',
    POSTGRES_PASSWORD: 'p'.repeat(32),
    POSTGRES_POOL_MAX: '5',
    POSTGRES_CONNECTION_TIMEOUT_MS: '5000',
    POSTGRES_IDLE_TIMEOUT_MS: '30000',
    SFTP_PUBLIC_HOST: 'menu.example.test',
    SFTP_PORT: '2022',
    SFTP_API_URL: 'http://sftp:8080',
    SFTP_API_TIMEOUT_MS: '5000',
    SFTP_STORAGE_ROOT: '/srv/menu-tv-sftp',
    SFTP_STAGING_MAX_AGE_HOURS: '24',
    SFTP_ADMIN_USERNAME: 'menu_tv_2_service',
    SFTP_ADMIN_PASSWORD: 'a'.repeat(40),
    SEED_DEMO_DATA: 'false',
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
    IMAGE_MAX_PIXELS: '12000000',
    LOGIN_MAX_ATTEMPTS: '6',
    LOGIN_IP_MAX_ATTEMPTS: '24',
    LOGIN_WINDOW_MINUTES: '10',
    LOGIN_LIMITER_MAX_ENTRIES: '700',
    GENERATED_PASSWORD_LENGTH: '18',
    SFTP_API_TIMEOUT_MS: '4200',
    SFTP_STAGING_MAX_AGE_HOURS: '36',
    POSTGRES_POOL_MAX: '9',
    POSTGRES_CONNECTION_TIMEOUT_MS: '4100',
    POSTGRES_IDLE_TIMEOUT_MS: '28000',
    HEALTH_READINESS_CACHE_MS: '1500'
  }));

  assert.equal(config.jsonBodyMaxBytes, 70000);
  assert.equal(config.menuDraftMaxBytes, 50000);
  assert.equal(config.screenSourceMaxBytes, 13000000);
  assert.equal(config.templateBackgroundMaxBytes, 9000000);
  assert.equal(config.dashboardRefreshMinSeconds, 20);
  assert.equal(config.dashboardRefreshMaxSeconds, 240);
  assert.equal(config.screenMaxWidth, 1600);
  assert.equal(config.screenMaxHeight, 900);
  assert.equal(config.imageMaxPixels, 12000000);
  assert.equal(config.loginMaxAttempts, 6);
  assert.equal(config.loginIpMaxAttempts, 24);
  assert.equal(config.loginWindowMinutes, 10);
  assert.equal(config.loginLimiterMaxEntries, 700);
  assert.equal(config.generatedPasswordLength, 18);
  assert.equal(config.sftp.apiTimeoutMs, 4200);
  assert.equal(config.sftp.stagingMaxAgeHours, 36);
  assert.equal(config.db.poolMax, 9);
  assert.equal(config.db.connectionTimeoutMs, 4100);
  assert.equal(config.db.idleTimeoutMs, 28000);
  assert.equal(config.healthReadinessCacheMs, 1500);
});

test('runtime config refuses missing env values instead of using code fallbacks', () => {
  const env = validEnv();
  delete env.LOGIN_MAX_ATTEMPTS;
  assert.throws(() => loadConfig(env), /LOGIN_MAX_ATTEMPTS/);
});

test('runtime booleans must be explicit true or false', () => {
  assert.throws(() => loadConfig(validEnv({ SECURE_COOKIES: 'yes' })), /SECURE_COOKIES/);
  assert.equal(loadConfig(validEnv({ SECURE_COOKIES: 'true' })).secureCookies, true);
});

test('generated SFTP password respects configured length and character classes', () => {
  const password = generateSftpPassword(18);
  assert.equal(password.length, 18);
  assert.match(password, /[A-Z]/);
  assert.match(password, /[a-z]/);
  assert.match(password, /\d/);
});
