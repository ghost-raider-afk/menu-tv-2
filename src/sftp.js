import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const SFTP_PERMISSIONS = Object.freeze({ '/': ['list', 'download'] });

function sftpError(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function safePath(root, directoryName) {
  const candidate = path.resolve(root, directoryName);
  const relative = path.relative(root, candidate);
  if (relative === '' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw sftpError('Недопустимый каталог SFTP.', 400);
  }
  return candidate;
}

export function generateSftpPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const alphabet = `${upper}${lower}${digits}`;
  const take = (characters) => characters[crypto.randomInt(characters.length)];
  const password = [take(upper), take(lower), take(digits)];
  while (password.length < 10) password.push(take(alphabet));
  for (let index = password.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [password[index], password[swapIndex]] = [password[swapIndex], password[index]];
  }
  return password.join('');
}

class SftpGoClient {
  constructor({ apiUrl, adminUsername, adminPassword }) {
    this.apiUrl = apiUrl.replace(/\/+$/, '');
    this.adminUsername = adminUsername;
    this.adminPassword = adminPassword;
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  async #token() {
    if (this.token && this.tokenExpiresAt > Date.now()) return this.token;
    const basic = Buffer.from(`${this.adminUsername}:${this.adminPassword}`).toString('base64');
    const response = await fetch(`${this.apiUrl}/api/v2/token`, { headers: { Authorization: `Basic ${basic}` } });
    if (!response.ok) throw sftpError('Сервис SFTP недоступен для управления учётными записями.');
    const body = await response.json();
    if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
      throw sftpError('Сервис SFTP вернул некорректный токен управления.');
    }
    this.token = body.access_token;
    this.tokenExpiresAt = Date.now() + 14 * 60 * 1000;
    return this.token;
  }

  async #request(method, pathname, body) {
    const token = await this.#token();
    const response = await fetch(`${this.apiUrl}${pathname}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (response.ok) return response.status === 204 ? null : response.json().catch(() => null);
    if (response.status === 401) {
      this.token = null;
      this.tokenExpiresAt = 0;
    }
    if (method === 'DELETE' && response.status === 404) return null;
    if (response.status === 409) throw sftpError('Такой логин SFTP уже занят.', 409);
    throw sftpError('Не удалось изменить учётную запись SFTP.');
  }

  async createReadOnlyUser({ username, password, homeDir }) {
    return this.#request('POST', '/api/v2/users', {
      status: 1,
      username,
      password,
      home_dir: homeDir,
      permissions: SFTP_PERMISSIONS,
      max_sessions: 0
    });
  }

  async resetPassword(username, password) {
    const encoded = encodeURIComponent(username);
    const user = await this.#request('GET', `/api/v2/users/${encoded}`);
    if (!user) throw sftpError('Учётная запись SFTP не найдена.', 404);
    return this.#request('PUT', `/api/v2/users/${encoded}`, { ...user, password, permissions: SFTP_PERMISSIONS });
  }

  async removeUser(username) {
    return this.#request('DELETE', `/api/v2/users/${encodeURIComponent(username)}`);
  }
}

export class SftpService {
  constructor(config) {
    this.root = path.resolve(config.storageRoot);
    this.stagingRoot = path.join(this.root, '.staging');
    this.client = new SftpGoClient(config);
  }

  async directoryStatus(name) {
    try {
      return (await fs.stat(safePath(this.root, name))).isDirectory() ? 'ready' : 'missing';
    } catch (error) {
      if (error.code === 'ENOENT') return 'missing';
      throw sftpError('Не удалось проверить каталог SFTP.');
    }
  }

  async provisionDirectory(name) {
    const directory = safePath(this.root, name);
    try {
      await fs.mkdir(directory, { recursive: false, mode: 0o750 });
      await fs.chmod(directory, 0o750);
      return 'created';
    } catch (error) {
      if (error.code === 'EEXIST') {
        if ((await fs.stat(directory)).isDirectory()) return 'exists';
      }
      throw sftpError('Не удалось создать каталог SFTP.');
    }
  }

  async createReadOnlyUser({ username, password, directoryName }) {
    const homeDir = safePath(this.root, directoryName);
    if (await this.directoryStatus(directoryName) !== 'ready') {
      throw sftpError('Сначала явно создайте физический каталог SFTP.', 409);
    }
    return this.client.createReadOnlyUser({ username, password, homeDir });
  }

  async resetPassword({ username, password }) {
    return this.client.resetPassword(username, password);
  }

  async removeUser(username) {
    return this.client.removeUser(username);
  }

  async stageJpeg(screenId, bytes) {
    if (!Buffer.isBuffer(bytes) || bytes.length < 5 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
      throw sftpError('Нужен файл JPEG.', 400);
    }
    await fs.mkdir(this.stagingRoot, { recursive: true, mode: 0o750 });
    const key = `${screenId}-${crypto.randomUUID()}.jpg`;
    const target = path.join(this.stagingRoot, key);
    await fs.writeFile(target, bytes, { mode: 0o640 });
    return { key, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
  }

  async publish({ directoryName, deliveryFilename, stagedKey }) {
    if (await this.directoryStatus(directoryName) !== 'ready') {
      throw sftpError('Физический каталог SFTP не найден.', 409);
    }
    if (!/^[a-z0-9-]+\.jpg$/i.test(deliveryFilename) || !/^[a-z0-9-]+\.jpg$/i.test(stagedKey)) {
      throw sftpError('Недопустимое имя файла публикации.', 400);
    }
    const source = path.join(this.stagingRoot, stagedKey);
    const directory = safePath(this.root, directoryName);
    const temporary = path.join(directory, `.${crypto.randomUUID()}.tmp`);
    const target = path.join(directory, deliveryFilename);
    try {
      await fs.copyFile(source, temporary);
      await fs.chmod(temporary, 0o640);
      await fs.rename(temporary, target);
    } catch (error) {
      await fs.unlink(temporary).catch(() => undefined);
      if (error.code === 'ENOENT') throw sftpError('Подготовленный JPEG не найден. Загрузите файл снова.', 409);
      throw sftpError('Не удалось опубликовать JPEG в SFTP-каталог.');
    }
  }
}
