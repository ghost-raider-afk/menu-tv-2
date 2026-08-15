import { bootstrapAdministrator, generatedValue, integer, required } from './env.js';

export function loadConfig(env = process.env) {
  const passwordMinLength = integer('PASSWORD_MIN_LENGTH', env.PASSWORD_MIN_LENGTH, '10', { minimum: 10, maximum: 64 });
  const passwordMaxLength = integer('PASSWORD_MAX_LENGTH', env.PASSWORD_MAX_LENGTH, '32', { minimum: passwordMinLength, maximum: 128 });
  const dashboardRefreshMinSeconds = integer('DASHBOARD_REFRESH_MIN_SECONDS', env.DASHBOARD_REFRESH_MIN_SECONDS, '15', { minimum: 5, maximum: 3600 });
  const dashboardRefreshMaxSeconds = integer('DASHBOARD_REFRESH_MAX_SECONDS', env.DASHBOARD_REFRESH_MAX_SECONDS, '300', { minimum: dashboardRefreshMinSeconds, maximum: 86400 });

  return Object.freeze({
    appName: env.APP_NAME?.trim() || 'ТВ МЕНЮ',
    host: env.HOST?.trim() || '0.0.0.0',
    port: integer('PORT', env.PORT, '8080'),
    bootstrapAdmin: bootstrapAdministrator(env, passwordMinLength),
    sessionSecret: generatedValue('SESSION_SECRET', env.SESSION_SECRET, 32),
    sessionTtlHours: integer('SESSION_TTL_HOURS', env.SESSION_TTL_HOURS, '12', { minimum: 1, maximum: 168 }),
    secureCookies: env.SECURE_COOKIES !== 'false',
    passwordMinLength,
    passwordMaxLength,
    generatedPasswordLength: integer('GENERATED_PASSWORD_LENGTH', env.GENERATED_PASSWORD_LENGTH, '10', { minimum: 10, maximum: 64 }),
    loginMaxAttempts: integer('LOGIN_MAX_ATTEMPTS', env.LOGIN_MAX_ATTEMPTS, '8', { minimum: 1, maximum: 100 }),
    loginWindowMinutes: integer('LOGIN_WINDOW_MINUTES', env.LOGIN_WINDOW_MINUTES, '15', { minimum: 1, maximum: 1440 }),
    loginLimiterMaxEntries: integer('LOGIN_LIMITER_MAX_ENTRIES', env.LOGIN_LIMITER_MAX_ENTRIES, '500', { minimum: 10, maximum: 100000 }),
    jsonBodyMaxBytes: integer('JSON_BODY_MAX_BYTES', env.JSON_BODY_MAX_BYTES, '65536', { minimum: 1024, maximum: 10485760 }),
    menuDraftMaxBytes: integer('MENU_DRAFT_MAX_BYTES', env.MENU_DRAFT_MAX_BYTES, '49152', { minimum: 1024, maximum: 10485760 }),
    screenSourceMaxBytes: integer('SCREEN_SOURCE_MAX_BYTES', env.SCREEN_SOURCE_MAX_BYTES, '12582912', { minimum: 1024, maximum: 52428800 }),
    dashboardRefreshMinSeconds,
    dashboardRefreshMaxSeconds,
    screenMaxWidth: integer('SCREEN_MAX_WIDTH', env.SCREEN_MAX_WIDTH, '1920', { minimum: 320, maximum: 7680 }),
    screenMaxHeight: integer('SCREEN_MAX_HEIGHT', env.SCREEN_MAX_HEIGHT, '1080', { minimum: 240, maximum: 4320 }),
    siteAssetsRoot: env.SITE_ASSETS_ROOT?.trim() || '/srv/menu-tv-site-assets',
    siteLogoMaxBytes: integer('SITE_LOGO_MAX_BYTES', env.SITE_LOGO_MAX_BYTES, '2097152', { minimum: 1024, maximum: 10485760 }),
    siteFaviconMaxBytes: integer('SITE_FAVICON_MAX_BYTES', env.SITE_FAVICON_MAX_BYTES, '524288', { minimum: 1024, maximum: 5242880 }),
    templateBackgroundMaxBytes: integer('TEMPLATE_BACKGROUND_MAX_BYTES', env.TEMPLATE_BACKGROUND_MAX_BYTES, '12582912', { minimum: 1024, maximum: 52428800 }),
    db: Object.freeze({
      host: env.POSTGRES_HOST?.trim() || 'db',
      port: integer('POSTGRES_PORT', env.POSTGRES_PORT, '5432'),
      database: required('POSTGRES_DB', env.POSTGRES_DB),
      user: required('POSTGRES_USER', env.POSTGRES_USER),
      password: generatedValue('POSTGRES_PASSWORD', env.POSTGRES_PASSWORD, 16)
    }),
    sftp: Object.freeze({
      apiUrl: env.SFTP_API_URL?.trim() || 'http://sftp:8080',
      adminUsername: required('SFTP_ADMIN_USERNAME', env.SFTP_ADMIN_USERNAME),
      adminPassword: generatedValue('SFTP_ADMIN_PASSWORD', env.SFTP_ADMIN_PASSWORD, 32),
      storageRoot: env.SFTP_STORAGE_ROOT?.trim() || '/srv/menu-tv-sftp',
      publicHost: required('SFTP_PUBLIC_HOST', env.SFTP_PUBLIC_HOST || env.MENU_TV_2_DOMAIN),
      port: integer('SFTP_PORT', env.SFTP_PORT, '2022')
    }),
    seedDemoData: env.SEED_DEMO_DATA === 'true'
  });
}
