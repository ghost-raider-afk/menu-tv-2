const LEGACY_FONT_SCALE = Object.freeze({ small: 88, medium: 100, large: 115 });

function migrateSettings(raw) {
  let settings;
  try { settings = JSON.parse(raw || '{}'); }
  catch { settings = {}; }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) settings = {};

  const next = { ...settings };
  let changed = false;
  if (!Number.isFinite(Number(next.font_scale_percent))) {
    next.font_scale_percent = LEGACY_FONT_SCALE[next.font_scale] || 100;
    changed = true;
  }
  for (const key of ['font_scale', 'table_width', 'title']) {
    if (Object.hasOwn(next, key)) {
      delete next[key];
      changed = true;
    }
  }
  return changed ? JSON.stringify(next) : null;
}

async function migrateTable(pool, table, idColumn) {
  const result = await pool.query(`SELECT ${idColumn} AS id, settings_json FROM ${table}`);
  for (const row of result.rows) {
    const settingsJson = migrateSettings(row.settings_json);
    if (settingsJson === null) continue;
    await pool.query(`UPDATE ${table} SET settings_json = $1 WHERE ${idColumn} = $2`, [settingsJson, row.id]);
  }
}

export async function migrateLegacyMenuSettings(pool) {
  await migrateTable(pool, 'templates', 'id');
  await migrateTable(pool, 'screen_drafts', 'screen_id');
}
