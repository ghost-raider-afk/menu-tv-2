import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function publishError(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export class SftpPublisher {
  constructor(storage) {
    this.storage = storage;
  }

  async publish({ directoryName, deliveryFilename, stagedKey }) {
    if (await this.storage.directoryStatus(directoryName) !== 'ready') {
      throw publishError('Физический каталог SFTP не найден.', 409);
    }
    if (!/^[a-z0-9-]+\.jpg$/i.test(deliveryFilename) || !/^[a-z0-9-]+\.jpg$/i.test(stagedKey)) {
      throw publishError('Недопустимое имя файла публикации.', 400);
    }
    const source = this.storage.stagedPath(stagedKey);
    const directory = this.storage.directoryPath(directoryName);
    const temporary = path.join(directory, `.${crypto.randomUUID()}.tmp`);
    const target = path.join(directory, deliveryFilename);
    try {
      await fs.copyFile(source, temporary);
      await fs.chmod(temporary, 0o640);
      await fs.rename(temporary, target);
    } catch (error) {
      await fs.unlink(temporary).catch(() => undefined);
      if (error.code === 'ENOENT') throw publishError('Подготовленный JPEG не найден. Загрузите файл снова.', 409);
      throw publishError('Не удалось опубликовать JPEG в SFTP-каталог.');
    }
  }
}
