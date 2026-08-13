const state = {
  authenticated: sessionStorage.getItem('menu-tv-2-authenticated') === 'true',
  page: 'dashboard',
  locations: [],
  screens: [],
  templates: [],
  overview: { locations: 0, screens: 0, published: 0, templates: 0 }
};

const app = document.querySelector('#app');
const icons = {
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.6"/></svg>',
  screen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8m-4-4v4"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m9 18 6-6-6-6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4 4L19 6"/></svg>',
  exit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 17l5-5-5-5M15 12H3m10 7v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1"/></svg>'
};

function icon(name, classes = 'h-5 w-5') {
  return icons[name].replace('<svg ', `<svg class="${classes}" `);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  if (response.status === 401) {
    state.authenticated = false;
    sessionStorage.removeItem('menu-tv-2-authenticated');
    render();
    throw new Error('Сессия истекла. Войдите снова.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Не удалось выполнить запрос.');
  }
  return response.status === 204 ? null : response.json();
}

async function refreshData() {
  [state.overview, state.locations, state.screens, state.templates] = await Promise.all([
    api('/api/overview'), api('/api/locations'), api('/api/screens'), api('/api/templates')
  ]);
}

function loginView() {
  return `
    <section class="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10">
      <div class="w-full max-w-md rounded-3xl bg-white p-7 shadow-panel sm:p-10">
        <div class="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white">${icon('screen', 'h-6 w-6')}</div>
        <p class="text-sm font-semibold text-indigo-600">MENU TV 2.0</p>
        <h1 class="mt-2 text-3xl font-bold tracking-tight text-slate-950">Независимая версия</h1>
        <p class="mt-3 text-sm leading-6 text-slate-500">Новый интерфейс и собственное хранилище. Текущий TV Menu не используется.</p>
        <form id="login-form" class="mt-8 space-y-5">
          <label class="block"><span class="field-label">Логин администратора</span><input class="field" name="username" autocomplete="username" required autofocus /></label>
          <label class="block"><span class="field-label">Пароль администратора</span><input class="field" name="password" type="password" autocomplete="current-password" required /></label>
          <p id="login-error" class="hidden text-sm font-medium text-rose-600"></p>
          <button class="btn-primary w-full" type="submit">Открыть управление ${icon('arrow', 'h-4 w-4')}</button>
        </form>
      </div>
    </section>`;
}

function sidebarLink(page, label, glyph) {
  const active = state.page === page ? 'is-active' : '';
  return `<button data-page="${page}" class="nav-link ${active}">${icon(glyph, 'h-5 w-5')}<span>${label}</span></button>`;
}

function shell(content) {
  return `
    <div class="min-h-screen lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside class="border-b border-slate-200 bg-white px-4 py-5 lg:min-h-screen lg:border-b-0 lg:border-r lg:px-5 lg:py-7">
        <div class="flex items-center gap-3 px-2"><span class="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">${icon('screen', 'h-5 w-5')}</span><span><strong class="block text-sm text-slate-950">Menu TV</strong><small class="text-xs font-medium text-slate-500">Версия 2.0</small></span></div>
        <nav class="mt-8 space-y-1"><p class="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Управление</p>${sidebarLink('dashboard', 'Обзор', 'grid')}${sidebarLink('locations', 'Точки', 'pin')}${sidebarLink('screens', 'Телевизоры', 'screen')}${sidebarLink('templates', 'Шаблоны', 'layers')}</nav>
        <div class="mt-8 rounded-2xl bg-slate-950 p-4 text-white"><p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Изоляция</p><p class="mt-2 text-sm font-semibold">Отдельные данные</p><p class="mt-1 text-xs leading-5 text-slate-400">Собственная база, контейнер и окружение.</p></div>
      </aside>
      <div class="min-w-0">
        <header class="flex h-20 items-center justify-between border-b border-slate-200 bg-white px-5 sm:px-8"><div><p class="text-xs font-medium text-slate-400">MENU TV 2.0</p><p class="mt-0.5 text-sm font-semibold text-slate-800">Панель управления</p></div><button data-action="logout" class="btn-secondary !px-3">${icon('exit', 'h-4 w-4')}<span class="hidden sm:inline">Выйти</span></button></header>
        <main class="p-5 sm:p-8">${content}</main>
      </div>
    </div>`;
}

function heading(title, description, action = '') {
  return `<div class="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 class="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">${title}</h1><p class="mt-2 text-sm text-slate-500">${description}</p></div>${action}</div>`;
}

function statCard(label, value, kind) {
  return `<article class="card p-5"><div class="flex items-start justify-between"><span class="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">${icon(kind, 'h-5 w-5')}</span><span class="text-xs font-semibold text-emerald-600">${icon('check', 'mr-1 inline h-3.5 w-3.5')}готово</span></div><p class="mt-5 text-3xl font-bold tracking-tight text-slate-950">${value}</p><p class="mt-1 text-sm font-medium text-slate-500">${label}</p></article>`;
}

function dashboardView() {
  return shell(`
    ${heading('Обзор', 'Новая независимая среда Menu TV 2.0.')}
    <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">${statCard('Точек', state.overview.locations, 'pin')}${statCard('Телевизоров', state.overview.screens, 'screen')}${statCard('Опубликовано', state.overview.published, 'check')}${statCard('Шаблонов', state.overview.templates, 'layers')}</section>
    <section class="card mt-6 overflow-hidden"><div class="border-b border-slate-100 px-6 py-5"><h2 class="font-semibold text-slate-900">Начните с новой структуры</h2><p class="mt-1 text-sm text-slate-500">Данные создаются только в Menu TV 2.0 и остаются в его отдельном хранилище.</p></div><div class="grid divide-y divide-slate-100 md:grid-cols-3 md:divide-x md:divide-y-0"><button data-page="locations" class="group p-6 text-left hover:bg-slate-50"><span class="text-indigo-600">${icon('pin', 'h-6 w-6')}</span><h3 class="mt-4 font-semibold text-slate-900">1. Добавьте точку</h3><p class="mt-1 text-sm leading-6 text-slate-500">Заведение или отдельная локация.</p></button><button data-page="screens" class="group p-6 text-left hover:bg-slate-50"><span class="text-indigo-600">${icon('screen', 'h-6 w-6')}</span><h3 class="mt-4 font-semibold text-slate-900">2. Подключите ТВ</h3><p class="mt-1 text-sm leading-6 text-slate-500">Экраны и их состояние публикации.</p></button><button data-page="templates" class="group p-6 text-left hover:bg-slate-50"><span class="text-indigo-600">${icon('layers', 'h-6 w-6')}</span><h3 class="mt-4 font-semibold text-slate-900">3. Создайте шаблон</h3><p class="mt-1 text-sm leading-6 text-slate-500">Основа будущего редактора меню.</p></button></div></section>`);
}

function emptyState(title, text, action) {
  return `<div class="px-6 py-16 text-center"><div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">${icon('plus', 'h-5 w-5')}</div><h3 class="mt-4 font-semibold text-slate-900">${title}</h3><p class="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">${text}</p><button data-action="${action}" class="btn-primary mt-5">Добавить</button></div>`;
}

function listView(type) {
  const config = {
    locations: { title: 'Точки', description: 'Заведения и отдельные локации.', rows: state.locations, action: 'location', columns: ['Название', 'Адрес', 'Телевизоры', 'Статус'] },
    screens: { title: 'Телевизоры', description: 'Все экраны независимой версии.', rows: state.screens, action: 'screen', columns: ['Телевизор', 'Точка', 'Разрешение', 'Публикация'] },
    templates: { title: 'Шаблоны', description: 'Основа внешнего вида будущих меню.', rows: state.templates, action: 'template', columns: ['Название', 'Описание', 'Статус'] }
  }[type];
  const action = `<button data-action="new-${config.action}" class="btn-primary">${icon('plus', 'h-4 w-4')}Добавить</button>`;
  const rows = config.rows.map((row) => {
    if (type === 'locations') return `<tr><td><button data-action="edit-location" data-id="${row.id}" class="font-semibold text-slate-900 hover:text-indigo-600">${escapeHtml(row.name)}</button></td><td class="text-slate-500">${escapeHtml(row.address || '—')}</td><td class="text-slate-700">${row.screen_count}</td><td>${row.active ? '<span class="pill-green">Активна</span>' : '<span class="pill-slate">Неактивна</span>'}</td><td>${rowMenu('location', row.id)}</td></tr>`;
    if (type === 'screens') return `<tr><td><button data-action="edit-screen" data-id="${row.id}" class="font-semibold text-slate-900 hover:text-indigo-600">${escapeHtml(row.name)}</button></td><td class="text-slate-500">${escapeHtml(row.location_name)}</td><td class="text-slate-600">${escapeHtml(row.resolution)}</td><td>${statusPill(row.status)}</td><td>${rowMenu('screen', row.id)}</td></tr>`;
    return `<tr><td><button data-action="edit-template" data-id="${row.id}" class="font-semibold text-slate-900 hover:text-indigo-600">${escapeHtml(row.name)}</button></td><td class="max-w-md text-slate-500">${escapeHtml(row.description || '—')}</td><td>${row.active ? '<span class="pill-green">Активен</span>' : '<span class="pill-slate">Неактивен</span>'}</td><td>${rowMenu('template', row.id)}</td></tr>`;
  }).join('');
  return shell(`${heading(config.title, config.description, action)}<section class="card overflow-hidden">${config.rows.length ? `<div class="overflow-x-auto"><table class="w-full min-w-[680px] text-left text-sm"><thead class="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr>${config.columns.map((column) => `<th class="px-6 py-4">${column}</th>`).join('')}<th class="w-14 px-4 py-4"><span class="sr-only">Действия</span></th></tr></thead><tbody class="divide-y divide-slate-100">${rows}</tbody></table></div>` : emptyState(`Пока нет: ${config.title.toLowerCase()}`, 'Создайте первую запись в новой изолированной версии.', `new-${config.action}`)}</section>`);
}

function statusPill(status) {
  return status === 'published' ? '<span class="pill-green">Опубликован</span>' : status === 'ready' ? '<span class="pill-indigo">Готов</span>' : '<span class="pill-slate">Черновик</span>';
}

function rowMenu(type, id) {
  return `<div class="flex justify-end gap-2"><button data-action="edit-${type}" data-id="${id}" class="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Изменить">${icon('more', 'h-5 w-5')}</button><button data-action="delete-${type}" data-id="${id}" class="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Удалить">×</button></div>`;
}

function modal(title, body) {
  return `<div id="modal" class="fixed inset-0 z-20 flex items-end bg-slate-950/40 p-0 sm:items-center sm:justify-center sm:p-5"><div class="w-full rounded-t-3xl bg-white p-6 shadow-panel sm:max-w-lg sm:rounded-3xl"><div class="mb-6 flex items-center justify-between"><h2 class="text-lg font-bold text-slate-950">${title}</h2><button data-action="close-modal" class="rounded-lg px-2 py-1 text-2xl leading-none text-slate-400 hover:bg-slate-100">×</button></div>${body}</div></div>`;
}

function formFor(type, record = {}) {
  if (type === 'location') return modal(record.id ? 'Изменить точку' : 'Новая точка', `<form data-form="location" data-id="${record.id || ''}" class="space-y-4"><label class="block"><span class="field-label">Название</span><input class="field" name="name" maxlength="120" required value="${escapeHtml(record.name || '')}" /></label><label class="block"><span class="field-label">Адрес</span><input class="field" name="address" maxlength="300" value="${escapeHtml(record.address || '')}" /></label><label class="flex items-center gap-3 text-sm font-medium text-slate-700"><input name="active" type="checkbox" ${record.active !== false ? 'checked' : ''} />Активна</label><div class="flex justify-end gap-3 pt-3"><button type="button" data-action="close-modal" class="btn-secondary">Отмена</button><button class="btn-primary">Сохранить</button></div></form>`);
  if (type === 'screen') {
    const options = state.locations.map((location) => `<option value="${location.id}" ${Number(record.location_id) === location.id ? 'selected' : ''}>${escapeHtml(location.name)}</option>`).join('');
    return modal(record.id ? 'Изменить телевизор' : 'Новый телевизор', `<form data-form="screen" data-id="${record.id || ''}" class="space-y-4"><label class="block"><span class="field-label">Название</span><input class="field" name="name" maxlength="120" required value="${escapeHtml(record.name || '')}" /></label><label class="block"><span class="field-label">Точка</span><select class="field" name="location_id" required><option value="">Выберите точку</option>${options}</select></label><div class="grid gap-4 sm:grid-cols-2"><label class="block"><span class="field-label">Разрешение</span><input class="field" name="resolution" maxlength="32" value="${escapeHtml(record.resolution || '1920×1080')}" /></label><label class="block"><span class="field-label">Состояние</span><select class="field" name="status"><option value="draft" ${record.status === 'draft' ? 'selected' : ''}>Черновик</option><option value="ready" ${record.status === 'ready' ? 'selected' : ''}>Готов</option><option value="published" ${record.status === 'published' ? 'selected' : ''}>Опубликован</option></select></label></div><label class="flex items-center gap-3 text-sm font-medium text-slate-700"><input name="active" type="checkbox" ${record.active !== false ? 'checked' : ''} />Активен</label><div class="flex justify-end gap-3 pt-3"><button type="button" data-action="close-modal" class="btn-secondary">Отмена</button><button class="btn-primary">Сохранить</button></div></form>`);
  }
  return modal(record.id ? 'Изменить шаблон' : 'Новый шаблон', `<form data-form="template" data-id="${record.id || ''}" class="space-y-4"><label class="block"><span class="field-label">Название</span><input class="field" name="name" maxlength="120" required value="${escapeHtml(record.name || '')}" /></label><label class="block"><span class="field-label">Описание</span><textarea class="field min-h-28" name="description" maxlength="500">${escapeHtml(record.description || '')}</textarea></label><label class="flex items-center gap-3 text-sm font-medium text-slate-700"><input name="active" type="checkbox" ${record.active !== false ? 'checked' : ''} />Активен</label><div class="flex justify-end gap-3 pt-3"><button type="button" data-action="close-modal" class="btn-secondary">Отмена</button><button class="btn-primary">Сохранить</button></div></form>`);
}

function notice(message, type = 'success') {
  const colour = type === 'error' ? 'bg-rose-600' : 'bg-slate-950';
  document.querySelector('#notice')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div id="notice" class="fixed bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-xl ${colour} px-4 py-3 text-sm font-medium text-white shadow-lg">${escapeHtml(message)}</div>`);
  window.setTimeout(() => document.querySelector('#notice')?.remove(), 3500);
}

function render() {
  if (!state.authenticated) {
    app.innerHTML = loginView();
    return;
  }
  app.innerHTML = state.page === 'dashboard' ? dashboardView() : listView(state.page);
}

async function loadAndRender() {
  try {
    await refreshData();
    render();
  } catch (error) {
    if (state.authenticated) notice(error.message, 'error');
  }
}

document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action], [data-page]');
  if (!target) return;
  if (target.dataset.page) {
    state.page = target.dataset.page;
    render();
    return;
  }
  const action = target.dataset.action;
  if (action === 'logout') {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* Session may already be expired. */ }
    state.authenticated = false;
    sessionStorage.removeItem('menu-tv-2-authenticated');
    render();
    return;
  }
  if (action === 'close-modal') return document.querySelector('#modal')?.remove();
  const [verb, type] = action.split('-');
  if (verb === 'new') {
    if (type === 'screen' && state.locations.length === 0) return notice('Сначала добавьте точку.', 'error');
    document.body.insertAdjacentHTML('beforeend', formFor(type));
    return;
  }
  const collection = `${type}s`;
  const record = state[collection]?.find((item) => item.id === Number(target.dataset.id));
  if (verb === 'edit' && record) document.body.insertAdjacentHTML('beforeend', formFor(type, record));
  if (verb === 'delete' && record && window.confirm(`Удалить «${record.name}»?`)) {
    try {
      await api(`/api/${collection}/${record.id}`, { method: 'DELETE' });
      await loadAndRender();
      notice('Удалено.');
    } catch (error) { notice(error.message, 'error'); }
  }
});

document.addEventListener('submit', async (event) => {
  if (event.target.id === 'login-form') {
    event.preventDefault();
    const form = new FormData(event.target);
    try {
      await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) });
      state.authenticated = true;
      sessionStorage.setItem('menu-tv-2-authenticated', 'true');
      await loadAndRender();
    } catch (error) { document.querySelector('#login-error').textContent = error.message; document.querySelector('#login-error').classList.remove('hidden'); }
    return;
  }
  const type = event.target.dataset.form;
  if (!type) return;
  event.preventDefault();
  const form = new FormData(event.target);
  const data = Object.fromEntries(form.entries());
  data.active = form.get('active') === 'on';
  if (type === 'screen') data.location_id = Number(data.location_id);
  const id = event.target.dataset.id;
  try {
    await api(`/api/${type}s${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) });
    document.querySelector('#modal')?.remove();
    await loadAndRender();
    notice('Сохранено.');
  } catch (error) { notice(error.message, 'error'); }
});

if (state.authenticated) loadAndRender(); else render();
