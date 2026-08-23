export async function migrateEventJournal(pool) {
  await pool.query(`
    ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'info';
    ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'system';
    ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS details TEXT NOT NULL DEFAULT '';

    UPDATE activity_events
    SET
      severity = 'success',
      category = CASE
        WHEN action LIKE 'auth.%' THEN 'auth'
        WHEN action LIKE 'catalog.%' THEN 'catalog'
        WHEN action LIKE 'sftp.%' THEN 'sftp'
        WHEN action LIKE 'screen.%' OR action LIKE 'location.%' THEN 'monitors'
        WHEN action LIKE 'device.%' THEN 'tv'
        WHEN action LIKE 'settings.%' OR action LIKE 'profile.%' THEN 'settings'
        ELSE 'system'
      END;

    INSERT INTO activity_events (
      actor_username, action, entity_type, entity_id, message, metadata, read_at, created_at, severity, category, details
    )
    SELECT
      COALESCE(NULLIF(username, ''), 'system'),
      'frontend.' || error_type,
      'frontend_error',
      id::text,
      message,
      json_build_object(
        'page', page,
        'source', source,
        'line_number', line_number,
        'column_number', column_number,
        'user_agent', user_agent
      )::text,
      NULL,
      created_at,
      'error',
      'interface',
      stack
    FROM frontend_error_events;

    DROP TABLE IF EXISTS frontend_error_events;

    CREATE INDEX IF NOT EXISTS activity_events_severity_created_at_index
      ON activity_events(severity, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS activity_events_category_created_at_index
      ON activity_events(category, created_at DESC, id DESC);
  `);
}
