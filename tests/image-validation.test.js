import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { inspectImage, validateImage, validateScreenJpeg } from '../src/services/image-validation.js';

function jpegHeaderFor(width, height) {
  const bytes = Buffer.alloc(17);
  let offset = 0;
  bytes[offset++] = 0xff; bytes[offset++] = 0xd8;
  bytes[offset++] = 0xff; bytes[offset++] = 0xc0;
  bytes.writeUInt16BE(11, offset); offset += 2;
  bytes[offset++] = 8;
  bytes.writeUInt16BE(height, offset); offset += 2;
  bytes.writeUInt16BE(width, offset); offset += 2;
  bytes[offset++] = 1; bytes[offset++] = 1; bytes[offset++] = 0x11; bytes[offset++] = 0;
  bytes[offset++] = 0xff; bytes[offset++] = 0xd9;
  return bytes;
}

function pngHeader(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 4, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

async function jpegFor(width, height) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 30, b: 40 } }
  }).jpeg({ quality: 85 }).toBuffer();
}

test('image inspector reads JPEG and PNG dimensions without decoding', () => {
  assert.deepEqual(inspectImage(jpegHeaderFor(1920, 1080)), { type: 'jpeg', width: 1920, height: 1080 });
  assert.deepEqual(inspectImage(pngHeader(640, 360)), { type: 'png', width: 640, height: 360 });
});

test('screen JPEG must fully decode and exactly match monitor resolution', async () => {
  const valid = await jpegFor(320, 180);
  assert.equal((await validateScreenJpeg(valid, '320×180', 40000000)).width, 320);
  await assert.rejects(() => validateScreenJpeg(valid, '640×360', 40000000), /должен иметь разрешение 640×360|максимальный размер/);
  await assert.rejects(() => validateScreenJpeg(jpegHeaderFor(320, 180), '320×180', 40000000), /полностью декодировать/);
});

test('image limits reject decompression-bomb dimensions before decode', async () => {
  await assert.rejects(() => validateImage(pngHeader(100000, 100000), {
    allowedTypes: ['png'],
    maxWidth: 1920,
    maxHeight: 1080,
    maxPixels: 1920 * 1080,
    label: 'Тест'
  }), /максимальный размер/);
});
