(function () {
  'use strict';

  var MODERN_WATCHDOG_MS = 12000;
  var NETWORK_TIMEOUT_MS = 5000;
  var RETRY_MS = 3000;
  var ACTIVATION_RETRY_MS = 5000;
  var CONTEXT_KEY = 'tv-menu.player-context.legacy.v1';
  var ACTIVATION_KEY = 'tv-menu.device-activation.legacy.v1';
  var started = false;
  var refreshTimer = null;
  var pollTimer = null;
  var countdownTimer = null;
  var renewTimer = null;

  function by(selector) { return document.querySelector(selector); }
  function setHidden(element, hidden) {
    if (!element) return;
    element.hidden = !!hidden;
    if (hidden) element.classList.add('is-hidden');
    else element.classList.remove('is-hidden');
  }
  function boot(message) {
    var node = by('[data-player-boot-message]');
    if (node) node.textContent = message || 'Проверяем авторизацию телевизора…';
    setHidden(by('[data-player-boot]'), false);
    setHidden(by('[data-activation-view]'), true);
    setHidden(by('[data-tv-player]'), true);
    setHidden(by('[data-player-message]'), true);
  }
  function activationScreen() {
    setHidden(by('[data-player-boot]'), true);
    setHidden(by('[data-tv-player]'), true);
    setHidden(by('[data-activation-view]'), false);
    setHidden(by('[data-player-message]'), true);
  }
  function message(text) {
    var node = by('[data-player-message]');
    if (!node) return;
    node.textContent = text || '';
    setHidden(node, !text);
  }
  function request(method, url, headers, body, done) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.timeout = NETWORK_TIMEOUT_MS;
    xhr.setRequestHeader('Accept', 'application/json');
    if (headers) {
      Object.keys(headers).forEach(function (key) { xhr.setRequestHeader(key, headers[key]); });
    }
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      var json = null;
      try { json = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch (_error) {}
      done(null, xhr.status, json, xhr);
    };
    xhr.ontimeout = function () { done(new Error('network-timeout'), 0, null, xhr); };
    xhr.onerror = function () { done(new Error('network-error'), 0, null, xhr); };
    try { xhr.send(body == null ? null : body); }
    catch (error) { done(error, 0, null, xhr); }
  }
  function safeParse(value) {
    try { return JSON.parse(value || 'null'); } catch (_error) { return null; }
  }
  function saveContext(context) {
    try { localStorage.setItem(CONTEXT_KEY, JSON.stringify(context)); } catch (_error) {}
  }
  function cachedContext() {
    try { return safeParse(localStorage.getItem(CONTEXT_KEY)); } catch (_error) { return null; }
  }
  function clearContext() {
    try { localStorage.removeItem(CONTEXT_KEY); } catch (_error) {}
  }
  function saveActivation(record) {
    try { sessionStorage.setItem(ACTIVATION_KEY, JSON.stringify(record)); } catch (_error) {}
  }
  function storedActivation() {
    var record = null;
    try { record = safeParse(sessionStorage.getItem(ACTIVATION_KEY)); } catch (_error) {}
    if (!record || !record.expires_at || Date.parse(record.expires_at) <= Date.now()) return null;
    return record;
  }
  function clearActivation() {
    try { sessionStorage.removeItem(ACTIVATION_KEY); } catch (_error) {}
  }
  function clearActivationTimers() {
    if (pollTimer) clearTimeout(pollTimer);
    if (countdownTimer) clearInterval(countdownTimer);
    if (renewTimer) clearTimeout(renewTimer);
    pollTimer = null;
    countdownTimer = null;
    renewTimer = null;
  }
  function formatCode(value) {
    var code = String(value || '').replace(/\D/g, '').slice(0, 6);
    return code.length === 6 ? code.slice(0, 3) + ' ' + code.slice(3) : '—— ——';
  }
  function remaining(expiresAt) {
    var ms = Math.max(0, Date.parse(expiresAt || '') - Date.now());
    var seconds = Math.ceil(ms / 1000);
    var rest = seconds % 60;
    return Math.floor(seconds / 60) + ':' + (rest < 10 ? '0' : '') + rest;
  }
  function fxMarkup() {
    return '<div class="animation-screen-fx" data-motion-fx aria-hidden="true">' +
      '<div class="motion-fx motion-fx-ocean"><i></i><i></i></div>' +
      '<div class="motion-fx motion-fx-aurora"><i></i><i></i><i></i></div>' +
      '<div class="motion-fx motion-fx-ripple"><i></i><i></i><i></i></div>' +
      '<div class="motion-fx motion-fx-sun"><i></i></div>' +
      '<div class="motion-fx motion-fx-spotlight"><i></i></div>' +
      '<div class="motion-fx motion-fx-glass"><i></i></div>' +
      '</div>';
  }
  function renderContext(context, offline) {
    var player = by('[data-tv-player]');
    var stage = by('[data-player-stage]');
    var frame = context && context.rendered_frame;
    if (!player || !stage || !frame) return false;
    clearActivationTimers();
    if (frame.invalid_resolution) {
      stage.innerHTML = '<p class="animation-screen-empty">У экрана некорректное разрешение.</p>';
    } else {
      var background = document.createElement('div');
      var canvas = document.createElement('div');
      background.className = 'animation-screen-background';
      background.setAttribute('data-motion-background', '');
      background.style.backgroundColor = frame.background_color || '#101828';
      background.style.backgroundSize = '100% 100%';
      background.style.backgroundPosition = 'center';
      background.style.backgroundRepeat = 'no-repeat';
      if (frame.background_url) background.style.backgroundImage = 'url("' + String(frame.background_url).replace(/"/g, '%22') + '")';
      canvas.className = 'animation-screen-canvas';
      canvas.innerHTML = frame.svg || '';
      stage.innerHTML = '';
      stage.appendChild(background);
      stage.appendChild(canvas);
      stage.insertAdjacentHTML('beforeend', fxMarkup() + '<div class="animation-screen-vignette" aria-hidden="true"></div><div class="animation-screen-shimmer" aria-hidden="true"></div>');
      stage.setAttribute('data-legacy-player', 'true');
      if (context.animation && context.animation.enabled === true && context.animation.profile) {
        stage.setAttribute('data-legacy-motion', context.animation.profile.pattern || 'ambient');
        stage.setAttribute('data-visual-effect', context.animation.profile.visual_effect || 'none');
      } else {
        stage.removeAttribute('data-legacy-motion');
        stage.setAttribute('data-visual-effect', 'none');
      }
      var svg = stage.querySelector('svg.menu-table-svg');
      if (svg) {
        svg.style.fontFamily = frame.font_family || 'Arial, sans-serif';
        svg.style.fontWeight = String(frame.font_weight || 400);
      }
    }
    setHidden(by('[data-player-boot]'), true);
    setHidden(by('[data-activation-view]'), true);
    setHidden(player, false);
    message(offline ? 'Нет связи с сервером. ТВ работает по последней сохранённой версии меню.' : '');
    return true;
  }
  function scheduleRefresh(delay) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(loadContext, Math.max(2000, Number(delay) || 5000));
  }
  function loadContext() {
    request('GET', '/api/device/player-context', null, null, function (error, status, context) {
      if (!error && status === 200 && context) {
        saveContext(context);
        renderContext(context, false);
        scheduleRefresh(context.refresh_interval_ms);
        return;
      }
      if (status === 401 || status === 403) {
        clearContext();
        clearActivation();
        activationScreen();
        setHidden(by('[data-activation-pairing]'), true);
        return;
      }
      var cached = cachedContext();
      if (cached && renderContext(cached, true)) {
        scheduleRefresh(5000);
        return;
      }
      boot('Нет связи с сервером. Проверяем повторно…');
      scheduleRefresh(RETRY_MS);
    });
  }
  function expireActivation() {
    clearActivationTimers();
    clearActivation();
    var qr = by('[data-activation-qr]');
    var code = by('[data-reserve-code]');
    var countdown = by('[data-activation-countdown]');
    var status = by('[data-activation-status]');
    if (qr) qr.innerHTML = '';
    if (code) code.textContent = '—— ——';
    if (countdown) countdown.textContent = '00:00';
    if (status) status.textContent = 'Срок действия истёк. Обновляем код…';
    renewTimer = setTimeout(createActivation, 300);
  }
  function startCountdown(record) {
    var node = by('[data-activation-countdown]');
    if (countdownTimer) clearInterval(countdownTimer);
    function tick() {
      if (Date.parse(record.expires_at) <= Date.now()) { expireActivation(); return; }
      if (node) node.textContent = remaining(record.expires_at);
    }
    tick();
    countdownTimer = setInterval(tick, 500);
  }
  function showPairing(record) {
    activationScreen();
    var qr = by('[data-activation-qr]');
    var code = by('[data-reserve-code]');
    var status = by('[data-activation-status]');
    if (qr) qr.innerHTML = record.qr_svg || '';
    if (code) code.textContent = formatCode(record.reserve_code);
    if (status) status.textContent = 'Ожидание авторизации…';
    setHidden(by('[data-activation-pairing]'), false);
    startCountdown(record);
  }
  function schedulePoll(record) {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(function () { pollActivation(record); }, Math.max(1000, Number(record.poll_interval_ms) || 2000));
  }
  function pollActivation(record) {
    if (!record || Date.parse(record.expires_at) <= Date.now()) { expireActivation(); return; }
    request('GET', '/api/device/activations/' + encodeURIComponent(record.activation_id) + '/status', {
      'x-device-activation-secret': record.poll_secret
    }, null, function (error, status, body) {
      if (status === 404 || status === 410) { expireActivation(); return; }
      if (!error && status === 200 && body && body.status === 'authorized') {
        clearActivationTimers();
        clearActivation();
        loadContext();
        return;
      }
      var node = by('[data-activation-status]');
      if (node) node.textContent = error ? 'Нет связи с сервером. Повторяем…' : 'Ожидание авторизации…';
      schedulePoll(record);
    });
  }
  function createActivation() {
    var button = by('[data-show-activation]');
    var statusNode = by('[data-activation-status]');
    if (button) button.disabled = true;
    if (statusNode) statusNode.textContent = 'Создаём код подключения…';
    request('POST', '/api/device/activations', { 'Content-Type': 'application/json' }, '{}', function (error, status, record) {
      if (button) button.disabled = false;
      if (status === 409) { loadContext(); return; }
      if (error || status !== 201 || !record) {
        setHidden(by('[data-activation-pairing]'), false);
        if (statusNode) statusNode.textContent = 'Не удалось получить код. Повторяем…';
        renewTimer = setTimeout(createActivation, ACTIVATION_RETRY_MS);
        return;
      }
      saveActivation(record);
      showPairing(record);
      schedulePoll(record);
    });
  }
  function resolveState() {
    boot();
    request('GET', '/api/device/session', null, null, function (error, status) {
      if (!error && status === 200) { loadContext(); return; }
      if (status === 401) {
        clearContext();
        var pending = storedActivation();
        activationScreen();
        if (pending) { showPairing(pending); schedulePoll(pending); }
        else setHidden(by('[data-activation-pairing]'), true);
        return;
      }
      var cached = cachedContext();
      if (cached && renderContext(cached, true)) { scheduleRefresh(5000); return; }
      boot('Нет связи с сервером. Проверяем повторно…');
      refreshTimer = setTimeout(resolveState, RETRY_MS);
    });
  }
  function startLegacy() {
    if (started || window.__TV_MENU_PLAYER_MODERN_READY__ === true) return;
    started = true;
    window.__TV_MENU_PLAYER_LEGACY__ = true;
    var button = by('[data-show-activation]');
    if (button) button.addEventListener('click', createActivation);
    resolveState();
  }
  function bootStillVisible() {
    var node = by('[data-player-boot]');
    return !!node && !node.hidden && !node.classList.contains('is-hidden');
  }

  var moduleCapable = false;
  var modernScript = by('script[data-modern-player]');
  try { moduleCapable = 'noModule' in document.createElement('script'); } catch (_error) {}
  if (modernScript) {
    modernScript.addEventListener('load', function () { window.__TV_MENU_PLAYER_MODERN_READY__ = true; });
    modernScript.addEventListener('error', function () { startLegacy(); });
  }
  if (!moduleCapable) startLegacy();
  else setTimeout(function () {
    if (window.__TV_MENU_PLAYER_MODERN_READY__ !== true && bootStillVisible()) startLegacy();
  }, MODERN_WATCHDOG_MS);
}());
