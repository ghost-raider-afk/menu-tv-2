export function isoNow() {
  return new Date().toISOString();
}

export function normaliseRow(row) {
  if (!row) return null;
  return {
    ...row,
    ...(row.id === undefined ? {} : { id: Number(row.id) }),
    ...(row.location_id === undefined ? {} : { location_id: Number(row.location_id) }),
    ...(row.template_id === undefined || row.template_id === null ? {} : { template_id: Number(row.template_id) }),
    ...(row.session_version === undefined || row.session_version === null ? {} : { session_version: Number(row.session_version) }),
    ...(row.screen_count === undefined ? {} : { screen_count: Number(row.screen_count) }),
    ...(row.sftp_directory_id === undefined || row.sftp_directory_id === null ? {} : { sftp_directory_id: Number(row.sftp_directory_id) }),
    ...(row.bound_location_id === undefined || row.bound_location_id === null ? {} : { bound_location_id: Number(row.bound_location_id) })
  };
}

export function jsonValue(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  try { return JSON.parse(value); }
  catch { return fallback; }
}

export function normaliseMenuRecord(row) {
  const record = normaliseRow(row);
  if (!record) return null;
  return {
    ...record,
    rows: jsonValue(record.rows_json, []),
    settings: jsonValue(record.settings_json, {})
  };
}

export function normaliseActivityEvent(row) {
  const event = normaliseRow(row);
  if (!event) return null;
  return { ...event, metadata: jsonValue(event.metadata, {}) };
}
