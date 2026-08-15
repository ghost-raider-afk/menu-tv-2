const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

function numeric(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function enabledRows(rows) {
  return rows.filter((row) => row && row.enabled !== false);
}

/**
 * Builds a renderer-neutral visual model. Both browser preview and final-image
 * generation should consume this model instead of implementing layout rules
 * independently.
 */
export function buildRenderModel(editorState, viewport = {}) {
  const width = Math.max(1, Math.round(numeric(viewport.width, DEFAULT_WIDTH)));
  const height = Math.max(1, Math.round(numeric(viewport.height, DEFAULT_HEIGHT)));
  const settings = structuredClone(editorState?.settings || {});
  const rows = enabledRows(Array.isArray(editorState?.rows) ? editorState.rows : []);

  return Object.freeze({
    viewport: Object.freeze({ width, height, aspectRatio: width / height }),
    settings: Object.freeze(settings),
    rows: Object.freeze(rows.map((row, index) => Object.freeze({
      ...structuredClone(row),
      renderIndex: index
    })))
  });
}

export function renderFingerprint(model) {
  return JSON.stringify({ viewport: model.viewport, settings: model.settings, rows: model.rows });
}
