export function required(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`Параметр ${name} должен быть задан.`);
  return value.trim();
}

export function integer(name, value, fallback, { minimum = 1, maximum = 65535 } = {}) {
  const parsed = Number.parseInt(value ?? fallback, 10);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Параметр ${name} должен быть целым числом от ${minimum} до ${maximum}.`);
  }
  return parsed;
}

export function generatedValue(name, value, minimum) {
  const parsed = required(name, value);
  if (parsed.length < minimum || parsed.startsWith('replace-with-generated-')) {
    throw new Error(`Параметр ${name} должен содержать сгенерированное значение длиной не менее ${minimum} символов.`);
  }
  return parsed;
}

export function bootstrapAdministrator(env, passwordMinimumLength) {
  const username = (env.BOOTSTRAP_ADMIN_USERNAME ?? env.ADMIN_USERNAME ?? '').trim();
  const password = env.BOOTSTRAP_ADMIN_PASSWORD ?? env.ADMIN_PASSWORD ?? '';
  if (!username && !password) return null;
  if (!username || !password) throw new Error('Для начального администратора должны быть заданы одновременно логин и пароль.');
  if (!/^[a-z][a-z0-9_.-]{2,63}$/i.test(username)) {
    throw new Error('Логин начального администратора: 3–64 латинских букв, цифр, точка, дефис или подчёркивание.');
  }
  return Object.freeze({ username, password: generatedValue('BOOTSTRAP_ADMIN_PASSWORD', password, passwordMinimumLength) });
}
