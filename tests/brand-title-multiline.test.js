import test from 'node:test';
import assert from 'node:assert/strict';
import { completeBrandTitle } from '../src/contracts/brand-title.js';

test('Brand title preserves intentional line breaks and canonicalises CRLF', () => {
  const brand = completeBrandTitle({ enabled: true, text: '  БАР\r\nСЕВЕР  ' });
  assert.equal(brand.text, 'БАР\nСЕВЕР');
});
