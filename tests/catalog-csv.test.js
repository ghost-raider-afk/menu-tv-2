import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { importProductsCsv, productsFromCsv, productsToCsv } from '../src/services/catalog-csv-service.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const PRODUCT = Object.freeze({
  id: 7,
  name: 'СНЕЖНЫЙ ЭЛЬ; особый',
  producer: 'ООО "Пивоварня"',
  characteristics: 'светлое, фильтрованное',
  strength: '4,5%',
  price_primary: '240',
  price_secondary: '360',
  alcoholic: true,
  beverage_color: 'light',
  filtration: 'filtered',
  active: true
});

test('product CSV export is Excel-friendly UTF-8 and round-trips all catalog fields', () => {
  const csv = productsToCsv([PRODUCT]);
  assert.ok(csv.startsWith('\uFEFFID;Название;Производитель;'));
  assert.match(csv, /"СНЕЖНЫЙ ЭЛЬ; особый"/);
  assert.match(csv, /"ООО ""Пивоварня"""/);
  assert.match(csv, /;240;360;да;светлый;фильтрованное;да/);
  assert.ok(csv.endsWith('\r\n'));

  const [entry] = productsFromCsv(csv);
  assert.equal(entry.id, 7);
  assert.deepEqual(entry.product, {
    name: PRODUCT.name,
    producer: PRODUCT.producer,
    characteristics: PRODUCT.characteristics,
    strength: PRODUCT.strength,
    price_primary: '240',
    price_secondary: '360',
    alcoholic: true,
    beverage_color: 'light',
    filtration: 'filtered',
    active: true
  });
});

test('product CSV import accepts new rows without ID and validates required columns', () => {
  const [entry] = productsFromCsv('Название;Цена 1 л;Активна\r\nНовая позиция;199,50;нет\r\n');
  assert.equal(entry.id, null);
  assert.equal(entry.product.name, 'Новая позиция');
  assert.equal(entry.product.price_primary, '199.50');
  assert.equal(entry.product.price_secondary, '299.25');
  assert.equal(entry.product.active, false);

  assert.throws(() => productsFromCsv('Название;Производитель\nТест;Завод\n'), /отсутствует столбец «Цена 1 л»/);
});

test('product CSV accepts comma-delimited files when comma-bearing headers are quoted', () => {
  const [entry] = productsFromCsv('"Название","Цена 1 л","Цена 1,5 л"\r\n"Новая позиция",199.50,299.25\r\n');
  assert.equal(entry.product.name, 'Новая позиция');
  assert.equal(entry.product.price_primary, '199.50');
  assert.equal(entry.product.price_secondary, '299.25');
});

test('product CSV decodes Windows-1251 files produced by legacy Excel', () => {
  const source = Buffer.from('cde0e7e2e0ede8e53bd6e5ede0203120eb3bc0eaf2e8e2ede00d0ad2e5f1f23b3139392c35303be4e00d0a', 'hex');
  const [entry] = productsFromCsv(source);
  assert.equal(entry.product.name, 'Тест');
  assert.equal(entry.product.price_primary, '199.50');
  assert.equal(entry.product.active, true);
});

test('product CSV decodes UTF-16LE files with BOM', () => {
  const source = Buffer.from('\uFEFFНазвание;Цена 1 л\r\nЮникод;100\r\n', 'utf16le');
  const [entry] = productsFromCsv(source);
  assert.equal(entry.product.name, 'Юникод');
  assert.equal(entry.product.price_primary, '100');
});

test('automatic 1.5 litre price cannot be silently overridden by CSV formatting', () => {
  assert.throws(
    () => productsFromCsv('Название;Цена 1 л;Цена 1,5 л\r\nТест;200;999\r\n'),
    /Цена за 1,5 л рассчитывается автоматически.*Ожидается 300/
  );
});

test('extra unquoted CSV separators are rejected instead of shifting columns', () => {
  assert.throws(
    () => productsFromCsv('Название;Цена 1 л\r\nТест;100;лишний столбец\r\n'),
    /обнаружено 3 столбцов, ожидалось 2.*разделитель и кавычки/
  );
});

test('product CSV rejects duplicate IDs before changing the database', () => {
  const csv = 'ID;Название;Цена 1 л\n4;Один;100\n4;Два;200\n';
  assert.throws(() => productsFromCsv(csv), /ID 4 встречается в CSV несколько раз/);
});

test('product CSV import updates existing IDs, creates blank IDs and uses one transaction', async () => {
  const calls = [];
  let transactions = 0;
  const store = {
    async transaction(run) {
      transactions += 1;
      return run({
        async getProduct(id) { return id === 7 ? PRODUCT : null; },
        async updateProduct(id, product) { calls.push(['update', id, product.name]); return { id, ...product }; },
        async createProduct(product) { calls.push(['create', product.name]); return { id: 8, ...product }; }
      });
    }
  };
  const csv = 'ID;Название;Цена 1 л\n7;Обновлённая;250\n;Новая;100\n';
  const result = await importProductsCsv(store, csv);
  assert.deepEqual(result, { created: 1, updated: 1, total: 2 });
  assert.equal(transactions, 1);
  assert.deepEqual(calls, [['update', 7, 'Обновлённая'], ['create', 'Новая']]);
});

test('unknown CSV ID is rejected instead of silently changing product identity', async () => {
  const store = {
    async transaction(run) {
      return run({
        async getProduct() { return null; },
        async updateProduct() { throw new Error('must not update'); },
        async createProduct() { throw new Error('must not create'); }
      });
    }
  };
  await assert.rejects(importProductsCsv(store, 'ID;Название;Цена 1 л\n999;Тест;100\n'), /ID 999 не найдена/);
});

test('catalog file upload bypasses the small JSON body limit and has its own env limit', async () => {
  const [routes, page, config, env] = await Promise.all([
    read('src/api/catalog/routes.js'),
    read('src/web/admin-ui/public/js/pages/catalog.js'),
    read('src/config/index.js'),
    read('.env.example')
  ]);

  assert.match(routes, /express\.raw\([\s\S]*catalogCsvMaxBytes/);
  assert.match(routes, /application\/octet-stream/);
  assert.match(page, /api\.post\(API\.productsImport, file/);
  assert.match(page, /Content-Type': 'application\/octet-stream'/);
  assert.doesNotMatch(page, /file\.text\(\)/);
  assert.match(config, /catalogCsvMaxBytes: integer\('CATALOG_CSV_MAX_BYTES'/);
  assert.match(env, /^CATALOG_CSV_MAX_BYTES=5242880$/m);
});
