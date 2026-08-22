import { canonicalRoutePath, isAppRoutePath, PREFETCH_ROUTE_PATHS } from './navigation.js';
import {
  SESSION_AUTHORITY_STATES,
  transitionToSignIn,
  verifySessionAuthority
} from './session-authority.js';
import { createClientRequestId, reportClientDiagnosticSoon } from './diagnostics.js';

let activeRouter = null;

function canonicalUrl(value) {
  const url = value instanceof URL ? new URL(value.href) : new URL(String(value), window.location.href);
  url.pathname = canonicalRoutePath(url.pathname);
  return url;
}

function routeIdentity(url) {
  return `${url.pathname}${url.search}${url.hash}`;
}

function documentIdentity(url) {
  return `${url.pathname}${url.search}`;
}

function isAppRoute(url) {
  return url.origin === window.location.origin && isAppRoutePath(url.pathname);
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

function currentMain() {
  const main = document.querySelector('.main-content');
  if (!main) throw new Error('Рабочая область приложения не найдена.');
  return main;
}

function setRouteMountState(main, mounting) {
  main.inert = mounting;
  if (mounting) {
    main.setAttribute('aria-busy', 'true');
    main.dataset.routeState = 'mounting';
  } else {
    main.removeAttribute('aria-busy');
    main.dataset.routeState = 'ready';
  }
}

function currentViewSnapshot() {
  const main = currentMain();
  return {
    page: document.body.dataset.page || '',
    mainClassName: main.className,
    mainHtml: main.innerHTML,
    documentTitle: document.title
  };
}

function applyViewSnapshot(view) {
  document.body.dataset.page = view.page;
  const main = currentMain();
  main.className = view.mainClassName;
  main.innerHTML = view.mainHtml;
  document.title = view.documentTitle;
  return main;
}

function parseViewDocument(html, responseUrl) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const page = parsed.body?.dataset?.page || '';
  if (page === 'signin') return { authChallenge: true };
  const main = parsed.querySelector('.main-content');
  if (!main || !page) throw new Error(`Маршрут ${responseUrl} не содержит рабочую область.`);
  return {
    authChallenge: false,
    view: {
      page,
      mainClassName: main.className,
      mainHtml: main.innerHTML,
      documentTitle: parsed.title || document.title
    }
  };
}

function scrollToRouteTarget(target) {
  if (!target.hash) {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    return;
  }

  let id = target.hash.slice(1);
  try { id = decodeURIComponent(id); } catch {}
  const targetNode = document.getElementById(id);
  if (targetNode) targetNode.scrollIntoView({ block: 'start', behavior: 'auto' });
  else window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
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

  const prefetchedViews = new Map();
  let lifecycle = null;
  let activeIdentity = routeIdentity(canonicalUrl(window.location.href));
  let started = false;
  let navigationQueue = Promise.resolve();

  async function fetchViewAttempt(cacheKey) {
    const requestId = createClientRequestId();
    const response = await fetch(cacheKey, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-cache',
      headers: { 'X-TV-Menu-View': '1', 'X-Request-Id': requestId }
    });

    if (response.redirected && canonicalUrl(response.url).pathname === '/signin.html') {
      return { authChallenge: true, requestId };
    }
    if (!response.ok) {
      reportClientDiagnosticSoon({
        severity: response.status >= 500 ? 'error' : 'warn',
        category: 'router.fetch',
        code: `router.http_${response.status}`,
        message: `Не удалось загрузить HTML раздела (${response.status}).`,
        method: 'GET',
        route: cacheKey,
        status: response.status,
        request_id: response.headers.get('x-request-id') || requestId
      });
      throw new Error(`Не удалось открыть раздел (${response.status}).`);
    }
    return parseViewDocument(await response.text(), response.url || cacheKey);
  }

  async function loadView(target, { cacheResult = false } = {}) {
    const cacheKey = target.pathname;
    if (prefetchedViews.has(cacheKey)) {
      const cached = prefetchedViews.get(cacheKey);
      prefetchedViews.delete(cacheKey);
      return cached;
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await fetchViewAttempt(cacheKey);
      if (!result.authChallenge) {
        if (cacheResult) prefetchedViews.set(cacheKey, result.view);
        return result.view;
      }

      const sessionState = await verifySessionAuthority();
      if (sessionState === SESSION_AUTHORITY_STATES.UNAUTHENTICATED) {
        transitionToSignIn();
        return null;
      }
      if (sessionState === SESSION_AUTHORITY_STATES.UNKNOWN) {
        reportClientDiagnosticSoon({
          severity: 'warn',
          category: 'router.session',
          code: 'router.session_unknown',
          message: 'HTML-раздел вернул страницу входа, но состояние сессии не подтверждено.',
          route: cacheKey,
          request_id: result.requestId
        });
        throw new Error('Не удалось подтвердить состояние сессии. Раздел не переключён.');
      }
      reportClientDiagnosticSoon({
        severity: 'error',
        category: 'router.session',
        code: 'router.false_auth_challenge',
        message: 'Сервер вернул страницу входа для защищённого раздела при активной сессии.',
        route: cacheKey,
        request_id: result.requestId
      }, { dedupeMs: 2000 });
      if (attempt === 1) {
        throw new Error('Сессия активна, но сервер ошибочно вернул страницу входа. Раздел не переключён.');
      }
    }
    return null;
  }

  async function canLeaveCurrentPage() {
    if (typeof lifecycle?.canLeave !== 'function') return true;
    return (await lifecycle.canLeave()) !== false;
  }

  async function disposeCurrentPage() {
    if (typeof lifecycle?.dispose === 'function') await lifecycle.dispose();
    lifecycle = null;
  }

  async function mountCurrentPage(page, main = currentMain()) {
    setRouteMountState(main, true);
    try {
      lifecycle = normaliseLifecycle(await mountPage(page));
    } catch (error) {
      reportClientDiagnosticSoon({
        severity: 'error',
        category: 'router.mount',
        code: 'route.mount_failed',
        message: error?.message || `Не удалось инициализировать страницу ${page}.`,
        page,
        details: { name: error?.name || '', stack: error?.stack || '' }
      }, { dedupeMs: 1000 });
      throw error;
    } finally {
      setRouteMountState(main, false);
    }
  }

  async function restorePreviousView(previousView, previousIdentity, { fromHistory = false } = {}) {
    applyViewSnapshot(previousView);
    if (typeof syncShell === 'function') syncShell();
    await mountCurrentPage(previousView.page, currentMain());
    activeIdentity = previousIdentity;
    if (fromHistory) window.history.pushState({ tvMenu: true }, '', previousIdentity);
  }

  async function commit(target, view, { replace = false, fromHistory = false } = {}) {
    if (!view) return false;
    if (!await canLeaveCurrentPage()) {
      if (fromHistory) window.history.pushState({ tvMenu: true }, '', activeIdentity);
      return false;
    }

    const previousView = currentViewSnapshot();
    const previousIdentity = activeIdentity;
    await disposeCurrentPage();

    const main = applyViewSnapshot(view);
    if (typeof syncShell === 'function') syncShell();
    try {
      await mountCurrentPage(view.page, main);
    } catch (error) {
      try {
        await restorePreviousView(previousView, previousIdentity, { fromHistory });
      } catch (restoreError) {
        reportClientDiagnosticSoon({
          severity: 'error',
          category: 'router.rollback',
          code: 'route.rollback_failed',
          message: restoreError?.message || 'Не удалось восстановить предыдущий раздел после ошибки.',
          page: previousView.page,
          details: { stack: restoreError?.stack || '' }
        }, { dedupeMs: 1000 });
      }
      throw error;
    }

    if (!fromHistory) {
      const href = routeIdentity(target);
      if (replace) window.history.replaceState({ tvMenu: true }, '', href);
      else window.history.pushState({ tvMenu: true }, '', href);
    }
    activeIdentity = routeIdentity(target);
    reportClientDiagnosticSoon({
      severity: 'info',
      category: 'client.lifecycle',
      code: 'route.enter',
      message: `Открыт раздел «${view.page}».`,
      page: view.page,
      route: activeIdentity,
      details: { previous_route: previousIdentity }
    }, { dedupeMs: 0 });
    scrollToRouteTarget(target);
    return true;
  }

  async function performNavigation(value, options = {}) {
    const target = canonicalUrl(value);
    if (!isAppRoute(target)) {
      window.location.assign(target.href);
      return false;
    }

    const targetIdentity = routeIdentity(target);
    const activeUrl = canonicalUrl(activeIdentity);

    if (!options.force && documentIdentity(target) === documentIdentity(activeUrl) && target.hash !== activeUrl.hash) {
      if (!options.fromHistory) {
        const href = targetIdentity;
        if (options.replace) window.history.replaceState({ tvMenu: true }, '', href);
        else window.history.pushState({ tvMenu: true }, '', href);
      }
      activeIdentity = targetIdentity;
      if (typeof syncShell === 'function') syncShell();
      scrollToRouteTarget(target);
      return true;
    }

    if (!options.force && !options.fromHistory && targetIdentity === activeIdentity) {
      if (typeof syncShell === 'function') syncShell();
      scrollToRouteTarget(target);
      return true;
    }

    try {
      const view = await loadView(target);
      return await commit(target, view, options);
    } catch (error) {
      console.error('Client-side navigation failed', error);
      reportClientDiagnosticSoon({
        severity: 'error',
        category: 'router.navigation',
        code: 'route.navigation_failed',
        message: error?.message || 'Не удалось переключить раздел.',
        route: targetIdentity,
        details: { active_route: activeIdentity, stack: error?.stack || '' }
      }, { dedupeMs: 1000 });
      return false;
    }
  }

  function navigateInternal(value, options = {}) {
    const targetHref = canonicalUrl(value).href;
    const requestOptions = { ...options };
    const run = () => performNavigation(targetHref, requestOptions);
    const result = navigationQueue.then(run, run);
    navigationQueue = result.catch(() => false);
    return result;
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
      PREFETCH_ROUTE_PATHS.forEach((path) => {
        if (path === canonicalRoutePath(window.location.pathname)) return;
        void loadView(canonicalUrl(path), { cacheResult: true }).catch(() => undefined);
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
      await mountCurrentPage(document.body.dataset.page || '');
      reportClientDiagnosticSoon({
        severity: 'info',
        category: 'client.lifecycle',
        code: 'route.initial',
        message: `Инициализирован раздел «${document.body.dataset.page || ''}».`,
        route: activeIdentity
      }, { dedupeMs: 0 });
      document.addEventListener('click', onDocumentClick);
      window.addEventListener('popstate', onPopState);
      prefetch();
    },
    navigate: navigateInternal,
    async stop() {
      document.removeEventListener('click', onDocumentClick);
      window.removeEventListener('popstate', onPopState);
      await navigationQueue.catch(() => undefined);
      await disposeCurrentPage();
      prefetchedViews.clear();
      if (activeRouter === router) activeRouter = null;
      started = false;
    }
  });

  return router;
}
