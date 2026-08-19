import assert from 'node:assert/strict';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { migrateLegacyMenuSettings } from '../src/db/migrations/menu-settings.js';

test('legacy menu settings are migrated once into canonical font scale percent', async () => {
  const memory = newDb();
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();
  await pool.query('CREATE TABLE templates (id BIGINT PRIMARY KEY, settings_json TEXT NOT NULL)');
  await pool.query('CREATE TABLE screen_drafts (screen_id BIGINT PRIMARY KEY, settings_json TEXT NOT NULL)');
  await pool.query("INSERT INTO templates VALUES (1, $1)", [JSON.stringify({ font_scale: 'large', table_width: 'wide', title: 'Старое', accent_color: '#F4C915' })]);
  await pool.query("INSERT INTO screen_drafts VALUES (2, $1)", [JSON.stringify({ font_scale: 'small', table_width: 'compact' })]);

  await migrateLegacyMenuSettings(pool);
  await migrateLegacyMenuSettings(pool);

  const template = JSON.parse((await pool.query('SELECT settings_json FROM templates WHERE id=1')).rows[0].settings_json);
  const draft = JSON.parse((await pool.query('SELECT settings_json FROM screen_drafts WHERE screen_id=2')).rows[0].settings_json);
  assert.equal(template.font_scale_percent, 115);
  assert.equal(draft.font_scale_percent, 88);
  assert.equal('font_scale' in template, false);
  assert.equal('table_width' in template, false);
  assert.equal('title' in template, false);
  await pool.end();
});
