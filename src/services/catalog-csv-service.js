import { TextDecoder } from 'node:util';
import { normalisePrice, productInput, positiveId } from '../contracts/input.js';
import { ValidationError } from '../shared/errors.js';

const EXPORT_HEADERS = Object.freeze([
  ['id', 'ID'],
  ['name', 'Название'],
  ['producer', 'Производитель'],
  ['characteristics', 'Характеристики'],
  ['strength', 'Крепость'],
  ['price_primary', 'Цена 1 л'],
  ['price_secondary', 'Цена 1,5 л'],
  ['alcoholic', 'Алкогольная'],
  ['beverage_color', 'Цвет напитка'],
  ['filtration', 'Фильтрация'],
  ['active', 'Активна']
]);

const HEADER_ALIASES = new Map([
  ['id', 'id'], ['название', 'name'], ['name', 'name'], ['производитель', 'producer'], ['producer', 'producer'],
  ['характеристики', 'characteristics'], ['characteristics', 'characteristics'], ['крепость', 'strength'], ['strength', 'strength'],
  ['цена 1 л', 'price_primary'], ['цена за 1 л', 'price_primary'], ['price_primary', 'price_primary'],
  ['цена 1,5 л', 'price_secondary'], ['цена за 1,5 л', 'price_secondary'], ['price_secondary', 'price_secondary'],
  ['алкогольная', 'alcoholic'], ['алкогольная продукция', 'alcoholic'], ['alcoholic', 'alcoholic'],
  ['цвет напитка', 'beverage_color'], ['beverage_color', 'beverage_color'], ['фильтрация', 'filtration'], ['filtration', 'filtration'],
  ['активна', 'active'], ['active', 'active']
]);

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'да', 'д']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'нет', 'н']);
const UPDATE_OPTIONAL_FIELDS = Object.freeze([
  'producer', 'characteristics', 'strength', 'alcoholic', 'beverage_color', 'filtration', 'active'
]);
const UTF8 = new TextDecoder('utf-8', { fatal: true });
const UTF16_LE = new TextDecoder('utf-16le');
const UTF16_BE = new TextDecoder('utf-16be');
const WINDOWS_1251 = new TextDecoder('windows-1251');

function csvValue(value) {
  const text = String(value ?? '');
  if (!/[;"\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function readableBoolean(value) {
  return value === true ? 'да' : 'нет';
}

function readableColor(value) {
  if (value === 'light') return 'светлый';
  if (value === 'dark') return 'тёмный';
  if (value === 'white') return 'белое';
  if (value === 'semi_dark') return 'полутёмное';
  if (value === 'amber') return 'янтарное';
  if (value === 'red') return 'красное';
  return '';
}

function readableFiltration(value) {
  if (value === 'filtered') return 'фильтрованное';
  if (value === 'unfiltered') return 'нефильтрованное';
  return '';
}

function readablePrice(value) {
  return String(value ?? '').replace('.', ',');
}

export function productsToCsv(products) {
  const header = EXPORT_HEADERS.map(([, label]) => csvValue(label)).join(';');
  const rows = products.map((product) => [
    product.id,
    product.name,
    product.producer,
    product.characteristics,
    product.strength,
    readablePrice(product.price_primary),
    readablePrice(product.price_secondary),
    readableBoolean(product.alcoholic),
    readableColor(product.beverage_color),
    readableFiltration(product.filtration),
    readableBoolean(product.active)
  ].map(csvValue).join(';'));
  return `\uFEFF${[header, ...rows].join('\r\n')}\r\n`;
}

function byteSource(source) {
  if (Buffer.isBuffer(source)) return source;
  if (source instanceof Uint8Array) return Buffer.from(source.buffer, source.byteOffset, source.byteLength);
  return null;
}

export function decodeProductsCsvSource(source) {
  if (typeof source === 'string') return source;
  const bytes = byteSource(source);
  if (!bytes || bytes.length === 0) throw new ValidationError('CSV-файл пуст.');

  let text;
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    text = UTF16_LE.decode(bytes);
  } else if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    text = UTF16_BE.decode(bytes);
  } else {
    try {
      text = UTF8.decode(bytes);
    } catch {
      text = WINDOWS_1251.decode(bytes);
    }
  }

  if (text.includes('\u0000')) throw new ValidationError('CSV-файл имеет неподдерживаемое текстовое форматирование.');
  return text;
}

function delimiterFromHeader(source) {
  const counts = new Map([[';', 0], [',', 0], ['\t', 0]]);
  let quoted = false;
  const text = source.replace(/^\uFEFF/, '');
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        index += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (!quoted && counts.has(char)) counts.set(char, counts.get(char) + 1);
    if (!quoted && (char === '\n' || char === '\r')) break;
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0][0];
}

function parseRows(source) {
  const decoded = decodeProductsCsvSource(source);
  if (decoded.trim().length === 0) throw new ValidationError('CSV-файл пуст.');
  const text = decoded.replace(/^\uFEFF/, '');
  const delimiter = delimiterFromHeader(text);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"' && field.length === 0) {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      row.push(field);
      field = '';
      continue;
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += char;
  }
  if (quoted) throw new ValidationError('CSV содержит незакрытое поле в кавычках.');
  row.push(field);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  if (!rows.length) throw new ValidationError('CSV-файл пуст.');
  return rows;
}

function normaliseHeader(value) {
  return String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ');
}

function headerMap(headerRow) {
  const map = new Map();
  headerRow.forEach((heading, index) => {
    const source = normaliseHeader(heading);
    const field = HEADER_ALIASES.get(source);
    if (!field) throw new ValidationError(`Неизвестный столбец CSV: «${String(heading).trim()}».`);
    if (map.has(field)) throw new ValidationError(`Столбец «${String(heading).trim()}» указан в CSV несколько раз.`);
    map.set(field, index);
  });
  for (const required of ['name', 'price_primary']) {
    if (!map.has(required)) throw new ValidationError(required === 'name' ? 'В CSV отсутствует столбец «Название».' : 'В CSV отсутствует столбец «Цена 1 л».');
  }
  return map;
}

function cell(row, columns, field) {
  const index = columns.get(field);
  return index === undefined ? '' : String(row[index] ?? '').trim();
}

function booleanValue(value, field, fallback) {
  const text = String(value || '').trim().toLocaleLowerCase('ru-RU');
  if (!text) return fallback;
  if (TRUE_VALUES.has(text)) return true;
  if (FALSE_VALUES.has(text)) return false;
  throw new ValidationError(`Поле «${field}» должно содержать да/нет.`);
}

function beverageColorValue(value) {
  const text = String(value || '').trim().toLocaleLowerCase('ru-RU');
  if (!text || text === 'none' || text === 'не указан') return 'none';
  if (text === 'light' || text === 'светлый' || text === 'светлое') return 'light';
  if (text === 'dark' || text === 'тёмный' || text === 'темный' || text === 'тёмное' || text === 'темное') return 'dark';
  if (text === 'white' || text === 'белое' || text === 'белый') return 'white';
  if (text === 'semi_dark' || text === 'semi-dark' || text === 'полутёмное' || text === 'полутемное') return 'semi_dark';
  if (text === 'amber' || text === 'янтарное' || text === 'янтарный') return 'amber';
  if (text === 'red' || text === 'красное' || text === 'красный') return 'red';
  throw new ValidationError('Поле «Цвет напитка» содержит неизвестное значение.');
}

function filtrationValue(value) {
  const text = String(value || '').trim().toLocaleLowerCase('ru-RU');
  if (!text || text === 'none' || text === 'не указана') return 'none';
  if (text === 'filtered' || text === 'фильтрованное' || text === 'фильтрованная') return 'filtered';
  if (text === 'unfiltered' || text === 'нефильтрованное' || text === 'нефильтрованная') return 'unfiltered';
  throw new ValidationError('Поле «Фильтрация» содержит неизвестное значение.');
}

function validateSecondaryPrice(row, columns, product) {
  const source = cell(row, columns, 'price_secondary');
  if (!source) return;
  const supplied = normalisePrice(source, 'Цена за 1,5 л');
  if (supplied !== product.price_secondary) {
    throw new ValidationError(`Цена за 1,5 л рассчитывается автоматически из цены за 1 л. Ожидается ${readablePrice(product.price_secondary)}.`);
  }
}

function productForExistingEntry(existing, entry) {
  const source = {
    ...existing,
    name: entry.product.name,
    price_primary: entry.product.price_primary
  };
  for (const field of UPDATE_OPTIONAL_FIELDS) {
    if (entry.providedFields.includes(field)) source[field] = entry.product[field];
  }
  return productInput(source);
}

export function productsFromCsv(source) {
  const rows = parseRows(source);
  const columns = headerMap(rows[0]);
  const columnCount = rows[0].length;
  const providedFields = Object.freeze([...columns.keys()]);
  const entries = [];
  const usedIds = new Set();

  rows.slice(1).forEach((sourceRow, offset) => {
    const line = offset + 2;
    try {
      if (sourceRow.length > columnCount) {
        throw new ValidationError(`обнаружено ${sourceRow.length} столбцов, ожидалось ${columnCount}. Проверьте разделитель и кавычки.`);
      }
      const row = sourceRow.length < columnCount
        ? [...sourceRow, ...Array(columnCount - sourceRow.length).fill('')]
        : sourceRow;
      const rawId = cell(row, columns, 'id');
      const id = rawId ? positiveId(rawId, 'ID') : null;
      if (id && usedIds.has(id)) throw new ValidationError(`ID ${id} встречается в CSV несколько раз.`);
      if (id) usedIds.add(id);
      const product = productInput({
        name: cell(row, columns, 'name'),
        producer: cell(row, columns, 'producer'),
        characteristics: cell(row, columns, 'characteristics'),
        strength: cell(row, columns, 'strength'),
        price_primary: cell(row, columns, 'price_primary'),
        alcoholic: booleanValue(cell(row, columns, 'alcoholic'), 'Алкогольная', false),
        beverage_color: beverageColorValue(cell(row, columns, 'beverage_color')),
        filtration: filtrationValue(cell(row, columns, 'filtration')),
        active: booleanValue(cell(row, columns, 'active'), 'Активна', true)
      });
      validateSecondaryPrice(row, columns, product);
      entries.push({ line, id, product, providedFields });
    } catch (error) {
      if (error instanceof ValidationError) throw new ValidationError(`Строка ${line}: ${error.message}`);
      throw error;
    }
  });

  if (!entries.length) throw new ValidationError('В CSV нет строк продукции.');
  return entries;
}

export async function importProductsCsv(store, source) {
  const entries = productsFromCsv(source);
  return store.transaction(async (transaction) => {
    let created = 0;
    let updated = 0;
    for (const entry of entries) {
      if (entry.id) {
        const existing = await transaction.getProduct(entry.id);
        if (!existing) throw new ValidationError(`Строка ${entry.line}: продукция с ID ${entry.id} не найдена. Удалите ID, чтобы создать новую запись.`);
        await transaction.updateProduct(entry.id, productForExistingEntry(existing, entry));
        updated += 1;
      } else {
        await transaction.createProduct(entry.product);
        created += 1;
      }
    }
    return { created, updated, total: created + updated };
  });
}
