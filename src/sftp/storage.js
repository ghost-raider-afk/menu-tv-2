import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function storageError(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  return error;
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
    return path.join(this.stagingRoot, key);
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
}
