import assert from 'node:assert/strict';
import test from 'node:test';
import { createEditorState, markEditorSaved } from '../../../src/web/admin-ui/public/js/editor/state.js';
import { addRow, applyTemplate, moveRow, removeRow, updateRow } from '../../../src/web/admin-ui/public/js/editor/commands.js';
import { buildRenderModel } from '../../../src/web/admin-ui/public/js/editor/renderer.js';

test('editor commands mutate only Editor State and track dirty revision', () => {
  const state = createEditorState();
  addRow(state, { id: 'section-1', kind: 'section', name: 'Пиво', enabled: true });
  addRow(state, { id: 'item-1', kind: 'item', product_id: 1, name: 'Тест', enabled: true });
  assert.equal(state.rows.length, 2);
  assert.equal(state.dirty, true);
  assert.equal(state.revision, 2);

  updateRow(state, 'item-1', { promotion: true });
  assert.equal(state.rows[1].promotion, true);
  moveRow(state, 'item-1', 0);
  assert.equal(state.rows[0].id, 'item-1');
  assert.equal(removeRow(state, 'section-1'), true);
  assert.equal(state.rows.length, 1);

  markEditorSaved(state);
  assert.equal(state.dirty, false);
});

test('template application replaces editor rows/settings locally', () => {
  const state = createEditorState({ rows: [{ id: 'old', kind: 'section', name: 'Старое', enabled: true }], settings: { font: 'old' } });
  applyTemplate(state, {
    id: 7,
    rows: [{ id: 'new', kind: 'section', name: 'Новое', enabled: true }],
    settings: { font: 'new' }
  });
  assert.equal(state.templateId, 7);
  assert.deepEqual(state.rows.map((row) => row.id), ['new']);
  assert.deepEqual(state.settings, { font: 'new' });
  assert.equal(state.dirty, true);
});

test('renderer model filters disabled rows and keeps 16:9 default viewport', () => {
  const state = createEditorState({
    rows: [
      { id: 'a', kind: 'section', name: 'A', enabled: true },
      { id: 'b', kind: 'section', name: 'B', enabled: false }
    ]
  });
  const model = buildRenderModel(state);
  assert.equal(model.viewport.width, 1920);
  assert.equal(model.viewport.height, 1080);
  assert.equal(model.viewport.aspectRatio, 16 / 9);
  assert.deepEqual(model.rows.map((row) => row.id), ['a']);
});
