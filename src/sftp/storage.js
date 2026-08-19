import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const STAGED_KEY = /^[1-9][0-9]*-[0-9a-f-]{36}\.jpg$/i;
const DELIVERY_FILE = /^[a-z0-9-]+\.jpg$/i;

function storageError(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function fileDigest(filename) {
  const bytes = await fs.readFile(filename);
  return {
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length
  };
}

export class SftpStorage {
  constructor(storageRoot) {
    this.root = path.resolve(storageRoot);
    this.stagingRoot = path.join(this.root, '.staging');
  }

  directoryPath(name) {
    const candidate = path.resolve(this.root, name);
    const relative = path.relative(this.root, candidate);
    if (relative === '' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw storageError('Недопустимый каталог SFTP.', 400);
    }
    return candidate;
  }

  stagedPath(key) {
    if (!STAGED_KEY.test(String(key || ''))) throw storageError('Недопустимый ключ подготовленного файла.', 400);
    return path.join(this.stagingRoot, key);
  }

  deliveryPath(directoryName, deliveryFilename) {
    if (!DELIVERY_FILE.test(String(deliveryFilename || ''))) throw storageError('Недопустимое имя файла публикации.', 400);
    return path.join(this.directoryPath(directoryName), deliveryFilename);
  }

  async directoryStatus(name) {
    try {
      return (await fs.stat(this.directoryPath(name))).isDirectory() ? 'ready' : 'missing';
    } catch (error) {
      if (error.code === 'ENOENT') return 'missing';
      throw storageError('Не удалось проверить каталог SFTP.');
    }
  }

  async provisionDirectory(name) {
    const directory = this.directoryPath(name);
    try {
      await fs.mkdir(directory, { recursive: false, mode: 0o750 });
      await fs.chmod(directory, 0o750);
      return 'created';
    } catch (error) {
      if (error.code === 'EEXIST' && (await fs.stat(directory)).isDirectory()) return 'exists';
      throw storageError('Не удалось создать каталог SFTP.');
    }
  }

  async stageJpeg(screenId, bytes) {
    if (!Buffer.isBuffer(bytes) || bytes.length < 5 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
      throw storageError('Нужен файл JPEG.', 400);
    }
    await fs.mkdir(this.stagingRoot, { recursive: true, mode: 0o750 });
    const key = `${screenId}-${crypto.randomUUID()}.jpg`;
    await fs.writeFile(this.stagedPath(key), bytes, { mode: 0o640 });
    return { key, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
  }

  async removeStaged(key) {
    if (!key) return false;
    const filename = this.stagedPath(key);
    try {
      await fs.unlink(filename);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw storageError('Не удалось удалить подготовленный JPEG.');
    }
  }

  async publishedInfo(directoryName, deliveryFilename) {
    try {
      return await fileDigest(this.deliveryPath(directoryName, deliveryFilename));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw storageError('Не удалось проверить опубликованный JPEG.');
    }
  }

  async cleanupStaging(keepKeys = [], { maxAgeMs = 60 * 60 * 1000 } = {}) {
    const keep = new Set((keepKeys || []).filter((key) => STAGED_KEY.test(String(key || ''))));
    let entries;
    try {
      entries = await fs.readdir(this.stagingRoot, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return { removed: 0 };
      throw storageError('Не удалось проверить временные JPEG.');
    }
    const cutoff = Date.now() - Math.max(0, Number(maxAgeMs) || 0);
    let removed = 0;
    for (const entry of entries) {
      if (!entry.isFile() || !STAGED_KEY.test(entry.name) || keep.has(entry.name)) continue;
      const filename = this.stagedPath(entry.name);
      const stat = await fs.stat(filename).catch(() => null);
      if (!stat || stat.mtimeMs > cutoff) continue;
      if (await this.removeStaged(entry.name)) removed += 1;
    }
    return { removed };
  }
}
