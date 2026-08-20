const APP_ROUTE_PATHS = new Set([
  '/',
  '/index.html',
  '/locations.html',
  '/screens.html',
  '/screen-editor.html',
  '/catalog.html',
  '/settings.html',
  '/profile.html'
]);

const PREFETCH_PATHS = Object.freeze([
  '/screens.html',
  '/locations.html',
  '/catalog.html',
  '/settings.html',
  '/profile.html',
  '/screen-editor.html'
]);

let activeRouter = null;

function canonicalUrl(value) {
  const url = value instanceof URL ? new URL(value.href) : new URL(String(value), window.location.href);
  if (url.pathname === '/index.html') url.pathname = '/';
  return url;
}

function routeIdentity(url) {
  return `${url.pathname}${url.search}${url.hash}`;
}

function isAppRoute(url) {
  return url.origin === window.location.origin && APP_ROUTE_PATHS.has(url.pathname);
}

function shouldHandleAnchor(event, anchor) {
  if (!anchor || event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  if (anchor.hasAttribute('download')) return false;
  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#')) return false;
  return isAppRoute(canonicalUrl(anchor.href));
}

function normaliseLifecycle(value) {
  if (!value) return null;
  if (typeof value === 'function') return { dispose: value };
  if (typeof value === 'object') return value;
  return null;
}

function currentViewSnapshot() {
  const main = document.querySelector('.main-content');
  if (!main) throw new Error('Рабочая область приложения не найдена.');
  return {
    page: document.body.dataset.page || '',
    mainClassName: main.className,
    mainHtml: main.innerHTML,
    documentTitle: document.title
  };
}

function parseViewDocument(html, responseUrl) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const page = parsed.body?.dataset?.page || '';
  if (page === 'signin') {
    window.location.replace('/signin.html');
    return null;
  }
  const main = parsed.querySelector('.main-content');
  if (!main || !page) throw new Error(`Маршрут ${responseUrl} не содержит рабочую область.`);
  return {
    page,
    mainClassName: main.className,
    mainHtml: main.innerHTML,
    documentTitle: parsed.title || document.title
  };
}

export function navigate(url, options = {}) {
  if (activeRouter) return activeRouter.navigate(url, options);
  const target = canonicalUrl(url);
  if (options.replace) window.location.replace(target.href);
  else window.location.assign(target.href);
  return Promise.resolve(false);
}

export function createAppRouter({ mountPage, syncShell }) {
  if (typeof mountPage !== 'function') throw new TypeError('mountPage is required');

  const viewCache = new Map();
  let lifecycle = null;
  let navigationSequence = 0;
  let activeIdentity = routeIdentity(canonicalUrl(window.location.href));
  let started = false;

  viewCache.set(canonicalUrl(window.location.href).pathname, currentViewSnapshot());

  async function loadView(target) {
    const cacheKey = target.pathname;
    if (viewCache.has(cacheKey)) return viewCache.get(cacheKey);

    const response = await fetch(cacheKey, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-cache',
      headers: { 'X-TV-Menu-View': '1' }
    });

    if (response.redirected && canonicalUrl(response.url).pathname === '/signin.html') {
      window.location.replace('/signin.html');
      return null;
    }
    if (!response.ok) throw new Error(`Не удалось открыть раздел (${response.status}).`);

    const view = parseViewDocument(await response.text(), response.url || cacheKey);
    if (view) viewCache.set(cacheKey, view);
    return view;
  }

  async function canLeaveCurrentPage() {
    if (typeof lifecycle?.canLeave !== 'function') return true;
    return (await lifecycle.canLeave()) !== false;
  }

  async function disposeCurrentPage() {
    if (typeof lifecycle?.dispose === 'function') await lifecycle.dispose();
    lifecycle = null;
  }

  async function commit(target, view, { replace = false, fromHistory = false } = {}) {
    if (!view) return false;
    if (!await canLeaveCurrentPage()) {
      if (fromHistory) window.history.pushState({ tvMenu: true }, '', activeIdentity);
      return false;
    }

    await disposeCurrentPage();

    if (!fromHistory) {
      const href = routeIdentity(target);
      if (replace) window.history.replaceState({ tvMenu: true }, '', href);
      else window.history.pushState({ tvMenu: true }, '', href);
    }

    document.body.dataset.page = view.page;
    const main = document.querySelector('.main-content');
    if (!main) throw new Error('Рабочая область приложения не найдена.');
    main.className = view.mainClassName;
    main.innerHTML = view.mainHtml;
    document.title = view.documentTitle;

    if (typeof syncShell === 'function') syncShell();
    lifecycle = normaliseLifecycle(await mountPage(view.page));
    activeIdentity = routeIdentity(target);
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    return true;
  }

  async function navigateInternal(value, options = {}) {
    const target = canonicalUrl(value);
    if (!isAppRoute(target)) {
      window.location.assign(target.href);
      return false;
    }

    const targetIdentity = routeIdentity(target);
    if (!options.force && !options.fromHistory && targetIdentity === activeIdentity) {
      if (typeof syncShell === 'function') syncShell();
      return true;
    }

    const sequence = ++navigationSequence;
    try {
      const view = await loadView(target);
      if (sequence !== navigationSequence) return false;
      return await commit(target, view, options);
    } catch (error) {
      console.error('Client-side navigation failed', error);
      window.location.assign(target.href);
      return false;
    }
  }

  function onDocumentClick(event) {
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!shouldHandleAnchor(event, anchor)) return;
    event.preventDefault();
    void navigateInternal(anchor.href);
  }

  function onPopState() {
    void navigateInternal(window.location.href, { fromHistory: true, force: true });
  }

  function prefetch() {
    const run = () => {
      PREFETCH_PATHS.forEach((path) => {
        if (path === window.location.pathname) return;
        void loadView(canonicalUrl(path)).catch(() => undefined);
      });
    };
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 1500 });
    else window.setTimeout(run, 120);
  }

  const router = Object.freeze({
    async start() {
      if (started) return;
      started = true;
      activeRouter = router;
      window.history.replaceState({ tvMenu: true }, '', routeIdentity(canonicalUrl(window.location.href)));
      lifecycle = normaliseLifecycle(await mountPage(document.body.dataset.page || ''));
      document.addEventListener('click', onDocumentClick);
      window.addEventListener('popstate', onPopState);
      prefetch();
    },
    navigate: navigateInternal,
    async stop() {
      document.removeEventListener('click', onDocumentClick);
      window.removeEventListener('popstate', onPopState);
      await disposeCurrentPage();
      if (activeRouter === router) activeRouter = null;
      started = false;
    }
  });

  return router;
}
