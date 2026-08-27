import { readFile, writeFile } from 'node:fs/promises';

async function replace(path, from, to, label) {
  const source = await readFile(path, 'utf8');
  if (!source.includes(from)) throw new Error(`${path}: missing ${label}`);
  await writeFile(path, source.replace(from, to));
}

async function append(path, marker, extra, label) {
  const source = await readFile(path, 'utf8');
  if (source.includes(marker)) return;
  await writeFile(path, `${source.trimEnd()}\n${extra}\n`);
}

await replace(
  'src/db/screens.js',
  `      await pool.query(\n        'INSERT INTO screen_drafts (screen_id, rows_json, settings_json, revision, updated_at) VALUES ($1, $2, $3, 1, $4)',\n        [id, '[]', '{}', now]\n      );\n      return getScreen(id);`,
  `      await pool.query(\n        'INSERT INTO screen_drafts (screen_id, rows_json, settings_json, revision, updated_at) VALUES ($1, $2, $3, 1, $4)',\n        [id, '[]', '{}', now]\n      );\n      await pool.query(\n        \`INSERT INTO screen_animation_settings (\n           screen_id, enabled, preset_id, profile_json, entity_json, announcement_json, brand_json, aquarium_json, updated_by, updated_at\n         )\n         SELECT $1, enabled, preset_id, profile_json, entity_json, announcement_json, brand_json, aquarium_json, updated_by, $2\n         FROM animation_settings WHERE id = 1\n         ON CONFLICT (screen_id) DO NOTHING\`,\n        [id, now]\n      );\n      return getScreen(id);`,
  'screen animation snapshot seed'
);

await replace(
  'src/api/device/public-routes.js',
  `      store.getAnimationSettings()`,
  `      store.getScreenAnimationSettings(session.screen_id)`,
  'player per-screen animation lookup'
);

await replace(
  'src/services/entity-assets-service.js',
  `  if (previousFile && previousFile !== filename) await unlink(path.join(path.dirname(target), previousFile)).catch(() => undefined);`,
  `  if (previousFile && previousFile !== filename) {\n    const previousUrl = \`/site-assets/${ENTITY_DIR}/${previousFile}\`;\n    if (!await store.isAnimationEntityAssetReferenced(previousUrl)) {\n      await unlink(path.join(path.dirname(target), previousFile)).catch(() => undefined);\n    }\n  }`,
  'per-screen Entity asset retention'
);

await replace(
  'src/web/admin-ui/public/animation.html',
  `<label class="field"><span>Анимация</span><select id="animation-brand-effect"><option value="neon-pulse">Neon Pulse</option><option value="breathe">Breathe</option><option value="float">Float</option><option value="none">Статично</option></select></label>`,
  `<label class="field"><span>Вход</span><select id="animation-brand-entrance-effect"><option value="blur-reveal">Blur Reveal</option><option value="pop-up">Pop Up</option><option value="zoom-in">Zoom In</option><option value="tracking-expand">Tracking Expand</option><option value="neon-reveal">Neon Reveal</option><option value="none">Без входа</option></select></label>\n                <label class="field"><span>Движение букв</span><select id="animation-brand-effect"><option value="wave">Wave</option><option value="neon-pulse">Neon Pulse</option><option value="stretch">Stretch</option><option value="float">Float</option><option value="breathe">Breathe</option><option value="none">Статично</option></select></label>\n                <label class="field"><span>Выход</span><select id="animation-brand-exit-effect"><option value="fade-out">Fade Out</option><option value="blur-out">Blur Out</option><option value="zoom-out">Zoom Out</option><option value="none">Без выхода</option></select></label>`,
  'Brand Entity CapCut effect selectors'
);

await replace(
  'src/web/admin-ui/public/animation.html',
  `<label class="field animation-range-field"><span>Сила glow</span><div><input id="animation-brand-glow-strength" type="range" min="0" max="48" step="1" /><output id="animation-brand-glow-strength-output">18 px</output></div></label>\n                <label class="field animation-range-field"><span>Период анимации</span><div><input id="animation-brand-cycle" type="range" min="2" max="30" step="0.5" /><output id="animation-brand-cycle-output">5.5 с</output></div></label>`,
  `<label class="field animation-range-field"><span>Сила glow</span><div><input id="animation-brand-glow-strength" type="range" min="0" max="48" step="1" /><output id="animation-brand-glow-strength-output">18 px</output></div></label>\n                <label class="field animation-range-field"><span>Вход, длительность</span><div><input id="animation-brand-entrance-duration" type="range" min="200" max="3000" step="50" /><output id="animation-brand-entrance-duration-output">900 мс</output></div></label>\n                <label class="field animation-range-field"><span>Задержка между буквами</span><div><input id="animation-brand-stagger" type="range" min="0" max="250" step="5" /><output id="animation-brand-stagger-output">55 мс</output></div></label>\n                <label class="field animation-range-field"><span>Амплитуда букв</span><div><input id="animation-brand-amplitude" type="range" min="0" max="80" step="1" /><output id="animation-brand-amplitude-output">12 px</output></div></label>\n                <label class="field animation-range-field"><span>Overshoot</span><div><input id="animation-brand-overshoot" type="range" min="0" max="0.45" step="0.01" /><output id="animation-brand-overshoot-output">12%</output></div></label>\n                <label class="field animation-range-field"><span>Выход, длительность</span><div><input id="animation-brand-exit-duration" type="range" min="150" max="2000" step="50" /><output id="animation-brand-exit-duration-output">550 мс</output></div></label>\n                <label class="field animation-range-field"><span>Период движения</span><div><input id="animation-brand-cycle" type="range" min="2" max="30" step="0.5" /><output id="animation-brand-cycle-output">5.5 с</output></div></label>`,
  'Brand Entity per-letter controls'
);

await replace(
  'src/web/admin-ui/public/js/pages/animation.js',
  `let screenLoadSequence = 0;`,
  `let screenLoadSequence = 0;\nlet availableScreens = [];\nconst selectedTargetScreenIds = new Set();`,
  'Motion Studio target state'
);

await replace(
  'src/web/admin-ui/public/js/pages/animation.js',
  `    glow_strength: number('animation-brand-glow-strength'),\n    effect: value('animation-brand-effect'),\n    cycle_seconds: number('animation-brand-cycle')`,
  `    glow_strength: number('animation-brand-glow-strength'),\n    entrance_effect: value('animation-brand-entrance-effect'),\n    loop_effect: value('animation-brand-effect'),\n    effect: value('animation-brand-effect'),\n    exit_effect: value('animation-brand-exit-effect'),\n    entrance_duration_ms: number('animation-brand-entrance-duration'),\n    exit_duration_ms: number('animation-brand-exit-duration'),\n    letter_stagger_ms: number('animation-brand-stagger'),\n    amplitude_px: number('animation-brand-amplitude'),\n    overshoot: number('animation-brand-overshoot'),\n    cycle_seconds: number('animation-brand-cycle')`,
  'Brand Entity control payload'
);

await replace(
  'src/web/admin-ui/public/js/pages/animation.js',
  `  setValue('animation-brand-glow-strength', current.glow_strength);\n  setValue('animation-brand-effect', current.effect);\n  setValue('animation-brand-cycle', current.cycle_seconds);`,
  `  setValue('animation-brand-glow-strength', current.glow_strength);\n  setValue('animation-brand-entrance-effect', current.entrance_effect);\n  setValue('animation-brand-effect', current.loop_effect || current.effect);\n  setValue('animation-brand-exit-effect', current.exit_effect);\n  setValue('animation-brand-entrance-duration', current.entrance_duration_ms);\n  setValue('animation-brand-exit-duration', current.exit_duration_ms);\n  setValue('animation-brand-stagger', current.letter_stagger_ms);\n  setValue('animation-brand-amplitude', current.amplitude_px);\n  setValue('animation-brand-overshoot', current.overshoot);\n  setValue('animation-brand-cycle', current.cycle_seconds);`,
  'Brand Entity control sync'
);

await replace(
  'src/web/admin-ui/public/js/pages/animation.js',
  `    'animation-brand-glow-strength-output': \`${'${Math.round(current.glow_strength)}'} px\`,\n    'animation-brand-cycle-output': \`${'${current.cycle_seconds.toFixed(1)}'} с\``,
  `    'animation-brand-glow-strength-output': \`${'${Math.round(current.glow_strength)}'} px\`,\n    'animation-brand-entrance-duration-output': \`${'${Math.round(current.entrance_duration_ms)}'} мс\`,\n    'animation-brand-exit-duration-output': \`${'${Math.round(current.exit_duration_ms)}'} мс\`,\n    'animation-brand-stagger-output': \`${'${Math.round(current.letter_stagger_ms)}'} мс\`,\n    'animation-brand-amplitude-output': \`${'${Math.round(current.amplitude_px)}'} px\`,\n    'animation-brand-overshoot-output': \`${'${Math.round(current.overshoot * 100)}'}%\`,\n    'animation-brand-cycle-output': \`${'${current.cycle_seconds.toFixed(1)}'} с\``,
  'Brand Entity output sync'
);

await replace(
  'src/web/admin-ui/public/js/pages/animation.js',
  `    'animation-brand-glow-strength', 'animation-brand-effect', 'animation-brand-cycle'`,
  `    'animation-brand-glow-strength', 'animation-brand-entrance-effect', 'animation-brand-effect', 'animation-brand-exit-effect',\n    'animation-brand-entrance-duration', 'animation-brand-exit-duration', 'animation-brand-stagger',\n    'animation-brand-amplitude', 'animation-brand-overshoot', 'animation-brand-cycle'`,
  'Brand Entity bind list'
);

await replace(
  'src/web/admin-ui/public/js/pages/animation.js',
  `  const screens = await api.get(API.screens);`,
  `  const screens = await api.get(API.screens);\n  availableScreens = Array.isArray(screens) ? screens : [];`,
  'Motion Studio screen cache'
);

await replace(
  'src/web/admin-ui/public/js/pages/animation.js',
  `  const selected = screenFromUrl(screens);\n  select.value = String(selected.id);`,
  `  const selected = screenFromUrl(screens);\n  if (selectedTargetScreenIds.size === 0 && selected?.id) selectedTargetScreenIds.add(Number(selected.id));\n  renderTargetScreens();\n  select.value = String(selected.id);`,
  'Motion Studio default targets'
);

const studioFunctions = `
function setInspectorTab(name) {
  document.querySelectorAll('[data-animation-inspector-tab]').forEach((button) => button.classList.toggle('active', button.dataset.animationInspectorTab === name));
  document.querySelectorAll('[data-animation-inspector-panel]').forEach((panel) => { panel.hidden = panel.dataset.animationInspectorPanel !== name; });
}

function targetScreenIds() {
  return [...selectedTargetScreenIds].filter((id) => availableScreens.some((screen) => Number(screen.id) === id));
}

function updateTargetSummary() {
  const ids = targetScreenIds();
  const node = element('animation-target-summary');
  if (node) node.textContent = ids.length ? \`${'${ids.length}'} ${'${ids.length === 1 ? \'монитор\' : ids.length < 5 ? \'монитора\' : \'мониторов\'}'}\` : 'Мониторы не выбраны';
  const apply = element('animation-apply-screens');
  if (apply) apply.disabled = ids.length === 0;
}

function renderTargetScreens() {
  const list = element('animation-target-list');
  if (!list) return;
  list.replaceChildren();
  for (const screen of availableScreens) {
    const label = document.createElement('label');
    label.className = 'animation-target-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = String(screen.id);
    checkbox.checked = selectedTargetScreenIds.has(Number(screen.id));
    checkbox.addEventListener('change', () => {
      const id = Number(screen.id);
      if (checkbox.checked) selectedTargetScreenIds.add(id); else selectedTargetScreenIds.delete(id);
      updateTargetSummary();
    });
    const text = document.createElement('span');
    text.innerHTML = \`<strong>${'${screen.name}'}</strong><small>${'${screen.location_name || \'Без точки\'}'}</small>\`;
    label.append(checkbox, text);
    list.append(label);
  }
  updateTargetSummary();
}

function buildStudioWorkspace() {
  const content = document.querySelector('.animation-content');
  const previewCard = content?.querySelector('.animation-player-card-full');
  if (!(content instanceof HTMLElement) || !(previewCard instanceof HTMLElement) || content.querySelector('.animation-studio-workspace')) return;

  const workspace = document.createElement('section');
  workspace.className = 'animation-studio-workspace';
  const previewPane = document.createElement('div');
  previewPane.className = 'animation-preview-pane';
  const inspector = document.createElement('aside');
  inspector.className = 'animation-inspector';
  inspector.setAttribute('aria-label', 'Панель настроек анимации');
  inspector.innerHTML = \`
    <div class="animation-inspector-head"><div><p class="eyebrow">MOTION CONTROLS</p><h2>Настройки</h2></div><div id="animation-inspector-master"></div></div>
    <div class="animation-inspector-tabs" role="tablist">
      <button type="button" class="active" data-animation-inspector-tab="menu">Меню</button>
      <button type="button" data-animation-inspector-tab="text">Текст</button>
      <button type="button" data-animation-inspector-tab="scene">Сцена</button>
    </div>
    <div class="animation-inspector-panels">
      <div data-animation-inspector-panel="menu"></div>
      <div data-animation-inspector-panel="text" hidden></div>
      <div data-animation-inspector-panel="scene" hidden></div>
    </div>
    <div class="animation-targets">
      <div class="animation-targets-head"><div><strong>Применить к мониторам</strong><small id="animation-target-summary">Мониторы не выбраны</small></div><div><button class="button button-secondary" id="animation-target-all" type="button">Все</button><button class="button button-secondary" id="animation-target-none" type="button">Снять</button></div></div>
      <div class="animation-target-list" id="animation-target-list"></div>
    </div>
    <div class="animation-inspector-actions" id="animation-inspector-actions"></div>\`;

  previewPane.append(previewCard);
  const menuPanel = inspector.querySelector('[data-animation-inspector-panel="menu"]');
  const textPanel = inspector.querySelector('[data-animation-inspector-panel="text"]');
  const scenePanel = inspector.querySelector('[data-animation-inspector-panel="scene"]');
  const motionGrid = content.querySelector('.animation-motion-grid');
  const announcement = content.querySelector('.animation-announcement-card');
  const overlayGrid = content.querySelector('.animation-overlay-grid');
  const brand = overlayGrid?.querySelector('.animation-brand-card');
  const aquarium = overlayGrid?.querySelector('.animation-aquarium-card');
  const entity = content.querySelector('.animation-entity-card');
  if (motionGrid) menuPanel?.append(motionGrid);
  if (announcement) textPanel?.append(announcement);
  if (brand) textPanel?.append(brand);
  if (aquarium) scenePanel?.append(aquarium);
  if (entity) scenePanel?.append(entity);
  overlayGrid?.remove();

  const master = content.querySelector('.animation-master-toggle');
  if (master) inspector.querySelector('#animation-inspector-master')?.append(master);
  const save = element('animation-save');
  if (save) { save.textContent = 'Сохранить пресет'; inspector.querySelector('#animation-inspector-actions')?.append(save); }
  const apply = document.createElement('button');
  apply.className = 'button button-primary';
  apply.id = 'animation-apply-screens';
  apply.type = 'button';
  apply.textContent = 'Применить к выбранным';
  inspector.querySelector('#animation-inspector-actions')?.append(apply);

  workspace.append(previewPane, inspector);
  const heading = content.querySelector('.animation-heading');
  (heading || content.firstElementChild)?.after(workspace);
  document.querySelectorAll('[data-animation-inspector-tab]').forEach((button) => button.addEventListener('click', () => setInspectorTab(button.dataset.animationInspectorTab)));
  element('animation-target-all')?.addEventListener('click', () => { availableScreens.forEach((screen) => selectedTargetScreenIds.add(Number(screen.id))); renderTargetScreens(); });
  element('animation-target-none')?.addEventListener('click', () => { selectedTargetScreenIds.clear(); renderTargetScreens(); });
  setInspectorTab('menu');
}

function animationPayload() {
  currentAnnouncement = announcementFromControls();
  currentBrand = brandFromControls();
  currentAquarium = aquariumFromControls();
  return {
    enabled: checked('animation-enabled'), preset_id: PROFILE_ID, profile: readMotionProfile(),
    entity: currentEntity, announcement: currentAnnouncement, brand: currentBrand, aquarium: currentAquarium
  };
}

function applySavedSettings(saved) {
  writeMotionProfile(saved.profile);
  currentAnnouncement = normaliseAnnouncement(saved.announcement);
  currentBrand = normaliseBrandTitle(saved.brand);
  currentAquarium = normaliseAquarium(saved.aquarium);
  syncAnnouncementControls(currentAnnouncement);
  syncBrandControls(currentBrand);
  syncAquariumControls(currentAquarium);
  applyEntity(saved.entity);
  renderAnnouncementPreview();
  renderBrandPreview();
  renderAquariumPreview(false);
}

async function applySettingsToScreens() {
  const button = element('animation-apply-screens');
  const screenIds = targetScreenIds();
  if (!screenIds.length) { setMessage('animation-message', 'Выберите хотя бы один монитор.', 'error'); return; }
  setPending(button, true, 'Применяем…');
  try {
    const result = await api.put(API.animationApply, { screen_ids: screenIds, settings: animationPayload() });
    applySavedSettings(result.settings);
    setMessage('animation-message', \`Анимация применена к мониторам: ${'${result.applied_screen_ids.length}'}.\`, 'success');
  } catch (error) { setMessage('animation-message', error.message); }
  finally { setPending(button, false, 'Применяем…'); updateTargetSummary(); }
}
`;

await replace(
  'src/web/admin-ui/public/js/pages/animation.js',
  `async function loadSettings() {`,
  `${studioFunctions}\nasync function loadSettings() {`,
  'Motion Studio workspace controller'
);

const oldSave = `async function saveSettings() {
  const button = element('animation-save');
  setPending(button, true, 'Сохраняем…');
  try {
    currentAnnouncement = announcementFromControls();
    currentBrand = brandFromControls();
    currentAquarium = aquariumFromControls();
    const saved = await api.put(API.animationSettings, {
      enabled: checked('animation-enabled'), preset_id: PROFILE_ID, profile: readMotionProfile(),
      entity: currentEntity, announcement: currentAnnouncement, brand: currentBrand, aquarium: currentAquarium
    });
    writeMotionProfile(saved.profile);
    currentAnnouncement = normaliseAnnouncement(saved.announcement);
    currentBrand = normaliseBrandTitle(saved.brand);
    currentAquarium = normaliseAquarium(saved.aquarium);
    syncAnnouncementControls(currentAnnouncement);
    syncBrandControls(currentBrand);
    syncAquariumControls(currentAquarium);
    applyEntity(saved.entity);
    renderAnnouncementPreview();
    renderBrandPreview();
    renderAquariumPreview(false);
    setMessage('animation-message', 'Настройки живого меню сохранены.', 'success');
  } catch (error) { setMessage('animation-message', error.message); }
  finally { setPending(button, false, 'Сохраняем…'); }
}`;
const newSave = `async function saveSettings() {
  const button = element('animation-save');
  setPending(button, true, 'Сохраняем…');
  try {
    const saved = await api.put(API.animationSettings, animationPayload());
    applySavedSettings(saved);
    setMessage('animation-message', 'Пресет сохранён. Мониторы не изменены — используйте «Применить к выбранным».', 'success');
  } catch (error) { setMessage('animation-message', error.message); }
  finally { setPending(button, false, 'Сохраняем…'); }
}`;
await replace('src/web/admin-ui/public/js/pages/animation.js', oldSave, newSave, 'Motion Studio save/apply split');

await replace(
  'src/web/admin-ui/public/js/pages/animation.js',
  `  if (!stage) return;\n  player?.destroy();`,
  `  if (!stage) return;\n  buildStudioWorkspace();\n  player?.destroy();`,
  'Motion Studio workspace bootstrap'
);

await replace(
  'src/web/admin-ui/public/js/pages/animation.js',
  `  element('animation-save')?.addEventListener('click', () => { void saveSettings(); });\n  void Promise.all([loadSettings(), loadScreenOptions()])`,
  `  element('animation-save')?.addEventListener('click', () => { void saveSettings(); });\n  element('animation-apply-screens')?.addEventListener('click', () => { void applySettingsToScreens(); });\n  void Promise.all([loadSettings(), loadScreenOptions()])`,
  'Motion Studio action bindings'
);

await append(
  'src/web/admin-ui/public/css/pages/animation.css',
  '.animation-studio-workspace{',
  `.animation-content{max-width:none}.animation-heading-actions:empty{display:none}.animation-studio-workspace{display:grid;grid-template-columns:minmax(0,1fr) 430px;gap:14px;align-items:start;margin-top:12px}.animation-preview-pane{min-width:0;position:sticky;top:12px}.animation-inspector{min-width:0;max-height:calc(100dvh - 24px);overflow:auto;border:1px solid var(--ui-border);border-radius:14px;background:var(--ui-panel);box-shadow:var(--ui-shadow-sm);padding:12px;display:grid;gap:10px}.animation-inspector-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.animation-inspector-head h2{margin:0;font-size:18px}.animation-inspector-head .animation-master-toggle{padding:7px 9px}.animation-inspector-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;padding:4px;border:1px solid var(--ui-border);border-radius:10px;background:var(--ui-panel-raised)}.animation-inspector-tabs button{border:0;border-radius:7px;background:transparent;color:var(--ui-text-muted);min-height:32px;font:inherit;font-size:11px;font-weight:800;cursor:pointer}.animation-inspector-tabs button.active{background:var(--ui-panel);color:var(--ui-text);box-shadow:0 1px 4px rgba(0,0,0,.14)}.animation-inspector-panels{min-width:0}.animation-inspector-panels [data-animation-inspector-panel]{display:grid;gap:9px}.animation-inspector .settings-card{margin-top:0;padding:11px;border-radius:10px}.animation-inspector .card-heading{gap:8px}.animation-inspector .card-heading h2{font-size:17px}.animation-inspector .card-heading p:not(.eyebrow){font-size:10px;line-height:1.4}.animation-inspector .animation-motion-grid,.animation-inspector .animation-control-grid,.animation-inspector .animation-slider-grid,.animation-inspector .animation-announcement-grid,.animation-inspector .animation-entity-grid,.animation-inspector .animation-entity-main-fields,.animation-inspector .animation-entity-transform-grid{grid-template-columns:1fr!important;gap:8px}.animation-inspector .animation-entity-transform-grid .field:nth-child(n+5){grid-column:auto}.animation-inspector .animation-entity-asset-panel{grid-template-columns:82px 1fr}.animation-targets{display:grid;gap:8px;padding:10px;border:1px solid var(--ui-border);border-radius:10px;background:var(--ui-panel-raised)}.animation-targets-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.animation-targets-head>div:first-child{display:grid;gap:2px}.animation-targets-head strong{font-size:11px}.animation-targets-head small{font-size:9px;color:var(--ui-text-muted)}.animation-targets-head>div:last-child{display:flex;gap:4px}.animation-targets-head .button{min-height:27px;padding:4px 7px;font-size:9px}.animation-target-list{display:grid;gap:4px;max-height:160px;overflow:auto}.animation-target-item{display:grid;grid-template-columns:auto 1fr;gap:7px;align-items:center;padding:6px 7px;border-radius:7px;cursor:pointer}.animation-target-item:hover{background:color-mix(in srgb,var(--ui-accent) 7%,transparent)}.animation-target-item input{width:16px;height:16px;accent-color:var(--ui-accent)}.animation-target-item span{display:grid;gap:1px}.animation-target-item strong{font-size:10px}.animation-target-item small{font-size:9px;color:var(--ui-text-muted)}.animation-inspector-actions{position:sticky;bottom:-12px;display:grid;grid-template-columns:1fr 1.35fr;gap:7px;padding:10px 0 2px;background:linear-gradient(180deg,transparent,var(--ui-panel) 18%)}.animation-inspector-actions .button{min-height:38px}.animation-preview-pane .animation-player-card-full{margin:0}@media(max-width:1180px){.animation-studio-workspace{grid-template-columns:1fr}.animation-preview-pane{position:static}.animation-inspector{max-height:none}.animation-inspector .animation-control-grid,.animation-inspector .animation-slider-grid,.animation-inspector .animation-announcement-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}@media(max-width:760px){.animation-inspector .animation-control-grid,.animation-inspector .animation-slider-grid,.animation-inspector .animation-announcement-grid{grid-template-columns:1fr!important}.animation-inspector-actions{grid-template-columns:1fr}.animation-target-list{max-height:220px}}`,
  'Motion Studio compact inspector styles'
);

console.log('Motion Studio v1.8.2 patch applied');
