import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { ValidationError } from '../shared/errors.js';

const scrypt = promisify(crypto.scrypt);

function passwordInput(value, field, config) {
  if (typeof value !== 'string' || value.length < config.passwordMinLength || value.length > config.passwordMaxLength) {
    throw new ValidationError(`Поле «${field}» должно содержать от ${config.passwordMinLength} до ${config.passwordMaxLength} символов.`);
  }
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    throw new ValidationError('Пароль должен содержать строчную и прописную латинскую букву, цифру и специальный символ.');
  }
  return value;
}

export function passwordChangeInput(body, config) {
  const currentPassword = passwordInput(body.current_password, 'Текущий пароль', config);
  const newPassword = passwordInput(body.new_password, 'Новый пароль', config);
  if (currentPassword === newPassword) throw new ValidationError('Новый пароль должен отличаться от текущего.');
  return { currentPassword, newPassword };
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}

export async function verifyPassword(password, passwordHash) {
  const [algorithm, encodedSalt, encodedHash] = String(passwordHash || '').split('$');
  if (algorithm !== 'scrypt' || !encodedSalt || !encodedHash) return false;
  try {
    const expected = Buffer.from(encodedHash, 'base64url');
    if (expected.length !== 64) return false;
    const actual = Buffer.from(await scrypt(password, Buffer.from(encodedSalt, 'base64url'), expected.length));
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
