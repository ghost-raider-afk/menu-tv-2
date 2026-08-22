import assert from 'node:assert/strict';
import test from 'node:test';
import { importProductsCsv } from '../src/services/catalog-csv-service.js';

const existing = Object.freeze({
  id: 7,
  name: 'Старое название',
  producer: 'Старый завод',
  characteristics: 'Особая характеристика',
  strength: '4,5%',
  price_primary: '200',
  price_secondary: '300',
  alcoholic: true,
  beverage_color: 'dark',
  filtration: 'unfiltered',
  active: false
});

test('CSV update changes required columns but preserves optional columns omitted from the file', async () => {
  let updated = null;
  const store = {
    async transaction(run) {
      return run({
        async getProduct(id) { return id === 7 ? existing : null; },
        async updateProduct(id, product) { updated = { id, ...product }; return updated; },
        async createProduct() { throw new Error('must not create'); }
      });
    }
  };

  await importProductsCsv(store, 'ID;Название;Цена 1 л\r\n7;Новое название;240\r\n');

  assert.deepEqual(updated, {
    id: 7,
    name: 'Новое название',
    producer: 'Старый завод',
    characteristics: 'Особая характеристика',
    strength: '4,5%',
    price_primary: '240',
    price_secondary: '360',
    alcoholic: true,
    beverage_color: 'dark',
    filtration: 'unfiltered',
    active: false
  });
});

test('present blank optional text column intentionally clears that field', async () => {
  let updated = null;
  const store = {
    async transaction(run) {
      return run({
        async getProduct() { return existing; },
        async updateProduct(id, product) { updated = { id, ...product }; return updated; },
        async createProduct() { throw new Error('must not create'); }
      });
    }
  };

  await importProductsCsv(store, 'ID;Название;Цена 1 л;Производитель\r\n7;Название;200;\r\n');
  assert.equal(updated.producer, '');
  assert.equal(updated.characteristics, existing.characteristics);
});
