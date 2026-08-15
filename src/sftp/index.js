import crypto from 'node:crypto';
import { SftpGoClient } from './client.js';
import { SftpStorage } from './storage.js';
import { SftpPublisher } from './publisher.js';

export function generateSftpPassword(length = 10) {
  const requestedLength = Number.parseInt(length, 10);
  const targetLength = Number.isInteger(requestedLength) ? Math.max(10, Math.min(64, requestedLength)) : 10;
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const alphabet = `${upper}${lower}${digits}`;
  const take = (characters) => characters[crypto.randomInt(characters.length)];
  const password = [take(upper), take(lower), take(digits)];
  while (password.length < targetLength) password.push(take(alphabet));
  for (let index = password.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [password[index], password[swapIndex]] = [password[swapIndex], password[index]];
  }
  return password.join('');
}

export class SftpService {
  constructor(config) {
    this.storage = new SftpStorage(config.storageRoot);
    this.client = new SftpGoClient(config);
    this.publisher = new SftpPublisher(this.storage);
  }

  directoryStatus(name) {
    return this.storage.directoryStatus(name);
  }

  provisionDirectory(name) {
    return this.storage.provisionDirectory(name);
  }

  async createReadOnlyUser({ username, password, directoryName }) {
    const homeDir = this.storage.directoryPath(directoryName);
    if (await this.storage.directoryStatus(directoryName) !== 'ready') {
      const error = new Error('Сначала явно создайте физический каталог SFTP.');
      error.status = 409;
      throw error;
    }
    return this.client.createReadOnlyUser({ username, password, homeDir });
  }

  resetPassword({ username, password }) {
    return this.client.resetPassword(username, password);
  }

  removeUser(username) {
    return this.client.removeUser(username);
  }

  stageJpeg(screenId, bytes) {
    return this.storage.stageJpeg(screenId, bytes);
  }

  publish(input) {
    return this.publisher.publish(input);
  }
}
