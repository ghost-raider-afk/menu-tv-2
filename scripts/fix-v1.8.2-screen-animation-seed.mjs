import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/db/screens.js';
const source = await readFile(path, 'utf8');
const from = `      await pool.query(
        \`INSERT INTO screen_animation_settings (
           screen_id, enabled, preset_id, profile_json, entity_json, announcement_json, brand_json, aquarium_json, updated_by, updated_at
         )
         SELECT $1, enabled, preset_id, profile_json, entity_json, announcement_json, brand_json, aquarium_json, updated_by, $2
         FROM animation_settings WHERE id = 1
         ON CONFLICT (screen_id) DO NOTHING\`,
        [id, now]
      );`;
const to = `      const { rows: animationRows } = await pool.query(
        'SELECT enabled, preset_id, profile_json, entity_json, announcement_json, brand_json, aquarium_json, updated_by FROM animation_settings WHERE id = 1'
      );
      const animation = animationRows[0];
      if (animation) {
        await pool.query(
          \`INSERT INTO screen_animation_settings (
             screen_id, enabled, preset_id, profile_json, entity_json, announcement_json, brand_json, aquarium_json, updated_by, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (screen_id) DO NOTHING\`,
          [
            Number(id), animation.enabled === true, animation.preset_id || 'cinematic-live-menu', animation.profile_json || '{}', animation.entity_json || '{}',
            animation.announcement_json || '{}', animation.brand_json || '{}', animation.aquarium_json || '{}', animation.updated_by || '', now
          ]
        );
      }`;
if (!source.includes(from)) throw new Error('Generated new-screen animation seed block not found.');
await writeFile(path, source.replace(from, to));
