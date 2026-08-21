import assert from 'node:assert/strict';
import test from 'node:test';
import { createActivationQrSvg } from '../src/services/qr-code-service.js';
import { decodeTvActivationQr, recommendedQrFrameSize } from '../src/web/admin-ui/public/js/device/qr-decoder.js';

function qrSvgToImageData(svg, scale = 10) {
  const viewBox = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  assert.ok(viewBox, 'QR SVG viewBox missing');
  const modulesWide = Number(viewBox[1]);
  const modulesHigh = Number(viewBox[2]);
  const width = modulesWide * scale;
  const height = modulesHigh * scale;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = 255;
    data[offset + 1] = 255;
    data[offset + 2] = 255;
    data[offset + 3] = 255;
  }

  const path = svg.match(/<path d="([^"]+)"/)?.[1] || '';
  const modulePattern = /M(\d+),(\d+)h1v1h-1z/g;
  let match;
  while ((match = modulePattern.exec(path))) {
    const moduleX = Number(match[1]);
    const moduleY = Number(match[2]);
    for (let y = moduleY * scale; y < (moduleY + 1) * scale; y += 1) {
      for (let x = moduleX * scale; x < (moduleX + 1) * scale; x += 1) {
        const offset = (y * width + x) * 4;
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
      }
    }
  }
  return { data, width, height };
}

test('local camera decoder reads the exact server-generated TV activation QR', () => {
  const scanToken = 'AbCdEfGhIjKlMnOpQrStUv';
  const imageData = qrSvgToImageData(createActivationQrSvg(scanToken));
  assert.equal(decodeTvActivationQr(imageData), `TV2:${scanToken}`);
});

test('local camera decoder rejects a frame without a TV activation QR', () => {
  const width = 330;
  const height = 330;
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);
  assert.equal(decodeTvActivationQr({ data, width, height }), null);
});

test('camera frame downscaling keeps aspect ratio and caps work size', () => {
  assert.deepEqual(recommendedQrFrameSize(1920, 1080), { width: 720, height: 405 });
  assert.deepEqual(recommendedQrFrameSize(640, 480), { width: 640, height: 480 });
});
