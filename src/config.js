function required(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Параметр ${name} должен быть задан.`);
  }
  return value.trim();
}

function integer(name, value, fallback, { minimum = 1, maximum = 65535 } = {}) {
  const parsed = Number.parseInt(value ?? fallback, 10);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Параметр ${name} должен быть целым числом от ${minimum} до ${maximum}.`);
  }
  return parsed;
}

function generatedValue(name, value, minimum) {
  const parsed = required(name, value);
  if (parsed.length < minimum || parsed.startsWith('replace-with-generated-')) {
    throw new Error(`Параметр ${name} должен содержать сгенерированное значение длиной не менее ${minimum} символов.`);
  }
  return parsed;
}

export function loadConfig(env = process.env) {
  const adminUsername = required('ADMIN_USERNAME', env.ADMIN_USERNAME);
  if (!/^[a-z][a-z0-9_.-]{2,63}$/i.test(adminUsername)) {
    throw new Error('ADMIN_USERNAME: 3–64 латинских букв, цифр, точка, дефис или подчёркивание.');
  }

  return Object.freeze({
    appName: env.APP_NAME?.trim() || 'ТВ МЕНЮ',
    host: env.HOST?.trim() || '0.0.0.0',
    port: integer('PORT', env.PORT, '8080'),
    adminUsername,
    adminPassword: generatedValue('ADMIN_PASSWORD', env.ADMIN_PASSWORD, 10),
    sessionSecret: generatedValue('SESSION_SECRET', env.SESSION_SECRET, 32),
    sessionTtlHours: integer('SESSION_TTL_HOURS', env.SESSION_TTL_HOURS, '12', { minimum: 1, maximum: 168 }),
    secureCookies: env.SECURE_COOKIES !== 'false',
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
