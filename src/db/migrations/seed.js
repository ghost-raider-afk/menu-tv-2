import { isoNow } from '../helpers.js';

export async function seedDemoData(pool) {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM locations');
  if (Number(rows[0].count) > 0) return false;
  const now = isoNow();
  const location = await pool.query(
    'INSERT INTO locations (name, address, active, created_at, updated_at) VALUES ($1, $2, TRUE, $3, $3) RETURNING id',
    ['Демонстрационная точка', 'Пример адреса', now]
  );
  await pool.query(
    'INSERT INTO screens (location_id, name, resolution, status, active, created_at, updated_at) VALUES ($1, $2, $3, $4, TRUE, $5, $5)',
    [location.rows[0].id, 'Экран у кассы', '1920×1080', 'ready', now]
  );
  await pool.query(
    'INSERT INTO templates (name, description, active, created_at, updated_at) VALUES ($1, $2, TRUE, $3, $3)',
    ['Светлое меню', 'Базовый демонстрационный шаблон', now]
  );
  return true;
}
