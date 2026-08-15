"use strict";

const API = {
  publicConfig: "/api/public/config",
  login: "/api/auth/login",
  logout: "/api/auth/logout",
  session: "/api/session",
  overview: "/api/overview",
  userSettings: "/api/settings/user",
  userPassword: "/api/settings/user/password",
  siteSettings: "/api/settings/site",
  notifications: "/api/notifications",
  locations: "/api/locations",
  screens: "/api/screens",
  templates: "/api/templates",
  products: "/api/catalog/products",
  packaging: "/api/catalog/packaging",
  sftpDirectories: "/api/sftp/directories",
  sftpConnection: "/api/sftp/connection"
};

const state = {
  session: null,
  user: null,
  site: null,
  notificationTimer: null,
  locations: [],
  screens: [],
  templates: [],
  products: [],
  packaging: [],
  sftpDirectories: [],
  editingLocationId: null,
  editingScreenId: null,
  editingTemplateId: null,
  editingProductId: null,
  editingPackagingId: null
};

const ICONS = Object.freeze({
  overview: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>',
  location: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5.2-8 11-8 11S4 15.2 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.6"/></svg>',
  screen: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>',
  template: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.55V20.3h-3v-.09a1.7 1.7 0 0 0-1.04-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 15a1.7 1.7 0 0 0-1.55-1.04h-.09v-3h.09A1.7 1.7 0 0 0 7 9.92a1.7 1.7 0 0 0-.34-1.88L6.6 7.98l2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.04-1.55v-.09h3v.09a1.7 1.7 0 0 0 1.04 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.55 1.04h.09v3h-.09A1.7 1.7 0 0 0 19.4 15Z"/></svg>',
  bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 10a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.1 15.5A8.4 8.4 0 0 1 8.5 3.9a8.4 8.4 0 1 0 11.6 11.6Z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>',
  logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5v14h5M14 8l4 4-4 4m4-4H9"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>'
});

function icon(name) { return ICONS[name] || ''; }

function setIcon(target, name) {
  if (!target) return;
  target.innerHTML = icon(name);
}

function pageName() {
  return document.body.dataset.page || "";
}

async function api(url, init = {}) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json().catch(() => null) : null;
  if (!response.ok) {
    if (response.status === 401 && pageName() !== "signin") window.location.replace("/signin.html");
    const error = new Error(body?.error || "Не удалось выполнить запрос.");
    error.status = response.status;
    throw error;
  }
  return body;
}

function element(id) { return document.getElementById(id); }

function setMessage(id, message, kind = "error") {
  const target = element(id);
  if (!target) return;
  target.textContent = message;
  target.className = `form-message ${kind === "success" ? "is-success" : "is-error"}`;
}

function clearMessage(id) {
  const target = element(id);
  if (!target) return;
  target.textContent = "";
  target.className = "form-message is-hidden";
}

function setPending(button, pending, pendingLabel) {
  if (!(button instanceof HTMLButtonElement)) return;
  if (!button.dataset.label) button.dataset.label = button.textContent.trim();
  button.disabled = pending;
  button.textContent = pending ? pendingLabel : button.dataset.label;
}

function imageElement(url, label) {
  const image = document.createElement("img");
  image.src = url;
  image.alt = label;
  image.className = "brand-image";
  return image;
}

function applyPresentation(site) {
  if (!site) return;
  document.title = site.app_name || "ТВ МЕНЮ";
  document.querySelectorAll("[data-app-name]").forEach((node) => { node.textContent = site.app_name || "ТВ МЕНЮ"; });
  if (site.accent_color) {
    document.documentElement.style.setProperty("--primary", site.accent_color);
    document.documentElement.style.setProperty("--primary-strong", site.accent_color);
  }
  document.querySelectorAll(".brand-mark").forEach((mark) => {
    mark.replaceChildren();
    if (site.logo_url) mark.append(imageElement(site.logo_url, "Логотип"));
    else mark.textContent = "ТВ";
  });
  let favicon = document.querySelector("link[rel='icon']");
  if (site.favicon_url) {
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      document.head.append(favicon);
    }
    favicon.href = site.favicon_url;
  } else if (favicon) {
    favicon.remove();
  }
  const logoPreview = document.querySelector("[data-logo-preview]");
  if (logoPreview) {
    logoPreview.src = site.logo_url || "";
    logoPreview.classList.toggle("is-hidden", !site.logo_url);
  }
  const faviconPreview = document.querySelector("[data-favicon-preview]");
  if (faviconPreview) {
    faviconPreview.src = site.favicon_url || "";
    faviconPreview.classList.toggle("is-hidden", !site.favicon_url);
  }
}

function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(theme) {
  const requested = theme || "system";
  const actual = requested === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : requested;
  document.documentElement.dataset.theme = actual;
  document.documentElement.dataset.themePreference = requested;
  try { window.localStorage.setItem("menu-tv-theme", requested); } catch { /* Storage can be disabled by the browser. */ }
  const toggle = element("theme-toggle");
  if (toggle) {
    setIcon(toggle, actual === "dark" ? "sun" : "moon");
    toggle.setAttribute("aria-label", actual === "dark" ? "Включить светлую тему" : "Включить тёмную тему");
  }
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const timezone = state.site?.timezone || undefined;
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
  }).formatToParts(date);
  const valueFor = (type) => parts.find((part) => part.type === type)?.value || "";
  const calendar = state.site?.date_format === "YYYY-MM-DD"
    ? `${valueFor("year")}-${valueFor("month")}-${valueFor("day")}`
    : `${valueFor("day")}.${valueFor("month")}.${valueFor("year")}`;
  return `${calendar}, ${valueFor("hour")}:${valueFor("minute")}`;
}

function eventRow(event) {
  const row = document.createElement("article");
  row.className = "event-row";
  const message = document.createElement("p");
  message.className = "event-message";
  message.textContent = event.message;
  const details = document.createElement("p");
  details.className = "event-details";
  details.textContent = `${event.actor_username} · ${formatDate(event.created_at)}`;
  row.append(message, details);
  return row;
}

function renderEvents(list, empty, events) {
  if (!list || !empty) return;
  list.replaceChildren(...events.map(eventRow));
  empty.classList.toggle("is-hidden", events.length !== 0);
}

function updateBadge(count) {
  const badge = document.querySelector("[data-notification-count]");
  if (!badge) return;
  const visible = state.user?.notifications_enabled === false ? 0 : count;
  badge.textContent = visible > 99 ? "99+" : String(visible);
  badge.classList.toggle("is-hidden", visible === 0);
}

async function loadNotifications(limit = 20) {
  const result = await api(`${API.notifications}?limit=${limit}`);
  renderEvents(document.querySelector("[data-notification-list]"), document.querySelector("[data-notification-empty]"), result.items);
  updateBadge(result.unread_count);
  return result;
}

async function loadActivity() {
  const result = await api(`${API.notifications}?limit=100`);
  renderEvents(document.querySelector("[data-activity-list]"), document.querySelector("[data-activity-empty]"), result.items);
  updateBadge(result.unread_count);
  return result;
}

function startNotificationPolling() {
  if (state.notificationTimer) window.clearInterval(state.notificationTimer);
  const seconds = Number(state.site?.dashboard_refresh_seconds) || 45;
  state.notificationTimer = window.setInterval(() => {
    if (state.user?.notifications_enabled !== false) void loadNotifications().catch(() => undefined);
  }, seconds * 1000);
}

function initialiseNotifications() {
  const button = element("notifications-button");
  const panel = element("notifications-panel");
  if (!(button instanceof HTMLButtonElement) || !panel) return;
  void loadNotifications().catch(() => undefined);
  startNotificationPolling();
  button.addEventListener("click", () => {
    const opens = panel.classList.contains("is-hidden");
    panel.classList.toggle("is-hidden", !opens);
    button.setAttribute("aria-expanded", String(opens));
    if (opens) void loadNotifications().catch(() => undefined);
  });
  document.addEventListener("click", (event) => {
    if (panel.classList.contains("is-hidden") || panel.contains(event.target) || button.contains(event.target)) return;
    panel.classList.add("is-hidden");
    button.setAttribute("aria-expanded", "false");
  });
  element("mark-notifications-read")?.addEventListener("click", async () => {
    try {
      await api(`${API.notifications}/read`, { method: "POST" });
      await loadNotifications();
      if (document.querySelector("[data-activity-list]")) await loadActivity();
    } catch {
      // The next scheduled refresh will retry the request.
    }
  });
}

function initials(value) {
  const parts = String(value || "ТВ").trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((part) => part[0]).join("") || "ТВ").toUpperCase();
}

function updateProfileMenu(user) {
  const displayName = user?.display_name || user?.username || state.session?.display_name || state.session?.username || "Пользователь";
  document.querySelectorAll("[data-profile-name], [data-session-user]").forEach((node) => { node.textContent = displayName; });
  document.querySelectorAll("[data-profile-email]").forEach((node) => { node.textContent = user?.email || "Настройки учётной записи"; });
  document.querySelectorAll("[data-profile-initials]").forEach((node) => { node.textContent = initials(displayName); });
}

function initialiseChrome() {
  const menu = document.querySelector(".profile-menu");
  const trigger = document.querySelector(".profile-trigger");
  const panel = document.querySelector(".profile-panel");
  if (menu && trigger && panel) {
    trigger.addEventListener("click", () => {
      const open = panel.classList.contains("is-hidden");
      panel.classList.toggle("is-hidden", !open);
      trigger.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", (event) => {
      if (!menu.contains(event.target)) {
        panel.classList.add("is-hidden");
        trigger.setAttribute("aria-expanded", "false");
      }
    });
  }
  document.querySelectorAll("[data-sidebar-toggle]").forEach((button) => button.addEventListener("click", () => {
    document.querySelector("[data-sidebar]")?.classList.toggle("is-open");
  }));
  document.querySelectorAll("[data-logout]").forEach((button) => button.addEventListener("click", async () => {
    try { await fetch(API.logout, { method: "POST", credentials: "same-origin" }); }
    finally { window.location.replace("/signin.html"); }
  }));
  element("theme-toggle")?.addEventListener("click", () => { void toggleTheme(); });
}

async function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  const preferences = state.user || await api(API.userSettings);
  const updated = await api(API.userSettings, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...preferences, theme: next })
  });
  state.user = updated;
  applyTheme(updated.theme);
  await loadNotifications();
}

function applySession(session) {
  state.session = session;
  updateProfileMenu(session);
}

function populateOverview(data) {
  Object.entries(data).forEach(([key, value]) => {
    document.querySelectorAll(`[data-overview="${key}"]`).forEach((node) => { node.textContent = String(value); });
  });
}

function makeButton(label, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `small-button ${className || ""}`.trim();
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function recordRow(title, details, actions = []) {
  const row = document.createElement("article");
  row.className = "record-row";
  const copy = document.createElement("div");
  const heading = document.createElement("p");
  heading.className = "record-title";
  heading.textContent = title;
  const meta = document.createElement("p");
  meta.className = "record-meta";
  meta.textContent = details;
  copy.append(heading, meta);
  const buttons = document.createElement("div");
  buttons.className = "record-actions";
  buttons.append(...actions);
  row.append(copy, buttons);
  return row;
}

function refreshList(list, empty, rows) {
  list.replaceChildren(...rows);
  empty.classList.toggle("is-hidden", rows.length !== 0);
}

async function loadLocations() {
  state.locations = await api(API.locations);
  const list = document.querySelector("[data-locations-list]");
  if (list) renderLocations();
  renderSftpLocationOptions();
  return state.locations;
}

function renderLocations() {
  const list = document.querySelector("[data-locations-list]");
  const empty = document.querySelector("[data-locations-empty]");
  if (!list || !empty) return;
  const rows = state.locations.map((location) => recordRow(
    location.name,
    `${location.address || "Адрес не указан"} · мониторов: ${location.screen_count} · ${location.sftp_directory_name ? `SFTP: ${location.sftp_directory_name} (${location.sftp_username})` : "SFTP не настроен"}`,
    [makeButton("Изменить", "", () => editLocation(location)), makeButton("Удалить", "danger", () => void deleteLocation(location))]
  ));
  refreshList(list, empty, rows);
}

function renderSftpLocationOptions() {
  const select = element("sftp-location");
  if (!(select instanceof HTMLSelectElement)) return;
  const selected = select.value;
  select.replaceChildren(new Option("Выберите торговую точку", ""), ...state.locations.map((location) => new Option(location.name, String(location.id))));
  select.value = selected;
  renderSftpBindingState();
}

async function loadSftpDirectories() {
  const [directories, connection] = await Promise.all([api(API.sftpDirectories), api(API.sftpConnection)]);
  state.sftpDirectories = directories;
  const connectionNode = element("sftp-connection");
  if (connectionNode) connectionNode.textContent = `${connection.host}:${connection.port}`;
  renderSftpDirectories();
  return directories;
}

function renderSftpDirectories() {
  const select = element("sftp-directory");
  if (select instanceof HTMLSelectElement) {
    const selected = select.value;
    select.replaceChildren(new Option("Выберите SFTP-папку", ""), ...state.sftpDirectories.map((directory) => {
      const suffix = directory.bound_location_name ? ` — занята: ${directory.bound_location_name}` : directory.storage_status === "ready" ? " — готова" : " — не создана";
      const option = new Option(`${directory.name}${suffix}`, String(directory.id));
      option.disabled = Boolean(directory.bound_location_id);
      return option;
    }));
    select.value = selected;
  }
  const list = document.querySelector("[data-sftp-directories-list]");
  const empty = document.querySelector("[data-sftp-directories-empty]");
  if (!list || !empty) return;
  const rows = state.sftpDirectories.map((directory) => recordRow(
    directory.name,
    `${directory.storage_status === "ready" ? "Папка создана" : "Папка ещё не создана"}${directory.bound_location_name ? ` · привязана к: ${directory.bound_location_name}` : " · не привязана"}`,
    [
      ...(directory.storage_status !== "ready" ? [makeButton("Создать папку", "", () => void provisionSftpDirectory(directory))] : []),
      ...(directory.bound_location_name ? [] : [makeButton("Удалить", "danger", () => void deleteSftpDirectory(directory))])
    ]
  ));
  refreshList(list, empty, rows);
}

function renderSftpBindingState() {
  const locationId = Number(element("sftp-location")?.value);
  const current = state.locations.find((location) => location.id === locationId);
  const details = element("sftp-binding-state");
  const submit = element("sftp-bind-submit");
  const reset = element("sftp-reset-password");
  const unbind = element("sftp-unbind");
  if (!current) {
    if (details) details.textContent = "Выберите торговую точку, затем вручную создайте и привяжите папку.";
    if (submit) submit.disabled = false;
    reset?.classList.add("is-hidden");
    unbind?.classList.add("is-hidden");
    return;
  }
  const bound = Boolean(current.sftp_directory_id);
  if (details) details.textContent = bound
    ? `Сейчас: ${current.sftp_directory_name} · логин ${current.sftp_username} · доступ только на чтение.`
    : "SFTP-папка и доступ для этой точки ещё не настроены.";
  if (submit) submit.disabled = bound;
  reset?.classList.toggle("is-hidden", !bound);
  unbind?.classList.toggle("is-hidden", !bound);
}

function setSftpCredentials(credentials) {
  const target = element("sftp-credentials");
  if (!target) return;
  target.textContent = credentials ? `Данные для CX Проводника — хост: ${credentials.host}, порт: ${credentials.port}, логин: ${credentials.username}, пароль: ${credentials.password}. Сохраните пароль: повторно он не показывается.` : "";
  target.className = credentials ? "form-message is-success field-full" : "form-message is-hidden field-full";
}

async function provisionSftpDirectory(directory) {
  try {
    await api(`${API.sftpDirectories}/${directory.id}/provision`, { method: "POST" });
    await loadSftpDirectories();
    await loadNotifications();
  } catch (error) { setMessage("sftp-message", error.message); }
}

async function deleteSftpDirectory(directory) {
  if (!window.confirm(`Удалить SFTP-папку «${directory.name}»?`)) return;
  try {
    await api(`${API.sftpDirectories}/${directory.id}`, { method: "DELETE" });
    await loadSftpDirectories();
  } catch (error) { setMessage("sftp-message", error.message); }
}

function resetLocationForm() {
  const form = element("location-form");
  if (!(form instanceof HTMLFormElement)) return;
  state.editingLocationId = null;
  form.reset();
  element("location-active").checked = true;
  element("location-form-title").textContent = "Новая точка";
  element("location-submit").textContent = "Создать точку";
  element("cancel-location-edit")?.classList.add("is-hidden");
  clearMessage("location-message");
}

function editLocation(location) {
  state.editingLocationId = location.id;
  element("location-name").value = location.name;
  element("location-address").value = location.address || "";
  element("location-active").checked = location.active;
  element("location-form-title").textContent = "Редактирование точки";
  element("location-submit").textContent = "Сохранить точку";
  element("cancel-location-edit")?.classList.remove("is-hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteLocation(location) {
  if (!window.confirm(`Удалить точку «${location.name}»?`)) return;
  try {
    await api(`${API.locations}/${location.id}`, { method: "DELETE" });
    await loadLocations();
  } catch (error) { setMessage("location-message", error.message); }
}

function initialiseLocations() {
  const form = element("location-form");
  if (!(form instanceof HTMLFormElement)) return;
  void Promise.all([loadLocations(), loadSftpDirectories()]).catch((error) => setMessage("location-message", error.message));
  element("refresh-locations")?.addEventListener("click", () => { void loadLocations(); });
  element("cancel-location-edit")?.addEventListener("click", resetLocationForm);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = element("location-submit");
    setPending(submit, true, "Сохраняем…");
    try {
      const payload = { name: element("location-name").value, address: element("location-address").value, active: element("location-active").checked };
      const url = state.editingLocationId ? `${API.locations}/${state.editingLocationId}` : API.locations;
      await api(url, { method: state.editingLocationId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      resetLocationForm();
      await loadLocations();
      renderSftpBindingState();
      await loadNotifications();
    } catch (error) { setMessage("location-message", error.message); }
    finally { setPending(submit, false, "Сохраняем…"); }
  });
  element("sftp-location")?.addEventListener("change", renderSftpBindingState);
  element("sftp-directory-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = element("sftp-directory-submit");
    setPending(submit, true, "Создаём…");
    try {
      const directory = await api(API.sftpDirectories, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: element("sftp-directory-name").value }) });
      element("sftp-directory-name").value = "";
      await provisionSftpDirectory(directory);
    } catch (error) { setMessage("sftp-message", error.message); }
    finally { setPending(submit, false, "Создаём…"); }
  });
  element("sftp-binding-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const locationId = Number(element("sftp-location").value);
    const submit = element("sftp-bind-submit");
    setPending(submit, true, "Привязываем…");
    try {
      const result = await api(`${API.locations}/${locationId}/sftp-binding`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        directory_id: Number(element("sftp-directory").value), username: element("sftp-username").value
      }) });
      setSftpCredentials(result.credentials);
      await Promise.all([loadLocations(), loadSftpDirectories(), loadNotifications()]);
    } catch (error) { setMessage("sftp-message", error.message); }
    finally { setPending(submit, false, "Привязываем…"); }
  });
  element("sftp-reset-password")?.addEventListener("click", async () => {
    const locationId = Number(element("sftp-location").value);
    if (!window.confirm("Сгенерировать новый пароль SFTP для этой точки?")) return;
    try {
      const result = await api(`${API.locations}/${locationId}/sftp-password`, { method: "POST" });
      setSftpCredentials(result.credentials);
      await loadNotifications();
    } catch (error) { setMessage("sftp-message", error.message); }
  });
  element("sftp-unbind")?.addEventListener("click", async () => {
    const locationId = Number(element("sftp-location").value);
    if (!window.confirm("Отключить SFTP-доступ выбранной точки?")) return;
    try {
      await api(`${API.locations}/${locationId}/sftp-binding`, { method: "DELETE" });
      setSftpCredentials(null);
      await Promise.all([loadLocations(), loadSftpDirectories(), loadNotifications()]);
    } catch (error) { setMessage("sftp-message", error.message); }
  });
}

async function loadTemplates() {
  state.templates = await api(API.templates);
  if (document.querySelector("[data-templates-list]")) renderTemplates();
  return state.templates;
}

function renderTemplates() {
  const list = document.querySelector("[data-templates-list]");
  const empty = document.querySelector("[data-templates-empty]");
  if (!list || !empty) return;
  const rows = state.templates.map((template) => recordRow(
    template.name,
    `${template.description || "Без описания"} · ${template.active ? "активен" : "неактивен"} · мониторов: ${template.assigned_screens || 0} · ${template.settings?.font_scale === "large" ? "крупный текст" : template.settings?.font_scale === "small" ? "компактный текст" : "обычный текст"}`,
    [makeButton("Изменить", "", () => editTemplate(template)), makeButton("Удалить", "danger", () => void deleteTemplate(template))]
  ));
  refreshList(list, empty, rows);
}

function resetTemplateForm() {
  const form = element("template-form");
  if (!(form instanceof HTMLFormElement)) return;
  state.editingTemplateId = null;
  form.reset();
  element("template-active").checked = true;
  element("template-background-color").value = "#101828";
  element("template-accent-color").value = "#2563EB";
  element("template-text-color").value = "#F8FAFC";
  element("template-font-scale").value = "medium";
  element("template-table-width").value = "normal";
  element("template-menu-title").value = "";
  element("template-form-title").textContent = "Новый шаблон";
  element("template-submit").textContent = "Создать шаблон";
  element("cancel-template-edit")?.classList.add("is-hidden");
  clearMessage("template-message");
}

function editTemplate(template) {
  state.editingTemplateId = template.id;
  element("template-name").value = template.name;
  element("template-description").value = template.description || "";
  element("template-active").checked = template.active;
  const settings = normaliseEditorSettings(template.settings || {});
  element("template-background-color").value = settings.background_color;
  element("template-accent-color").value = settings.accent_color;
  element("template-text-color").value = settings.text_color;
  element("template-font-scale").value = settings.font_scale;
  element("template-table-width").value = settings.table_width;
  element("template-menu-title").value = settings.title;
  element("template-form-title").textContent = "Редактирование шаблона";
  element("template-submit").textContent = "Сохранить шаблон";
  element("cancel-template-edit")?.classList.remove("is-hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteTemplate(template) {
  if (!window.confirm(`Удалить шаблон «${template.name}»?`)) return;
  try { await api(`${API.templates}/${template.id}`, { method: "DELETE" }); await loadTemplates(); }
  catch (error) { setMessage("template-message", error.message); }
}

function initialiseTemplates() {
  const form = element("template-form");
  if (!(form instanceof HTMLFormElement)) return;
  void loadTemplates().catch((error) => setMessage("template-message", error.message));
  element("refresh-templates")?.addEventListener("click", () => { void loadTemplates(); });
  element("cancel-template-edit")?.addEventListener("click", resetTemplateForm);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = element("template-submit");
    setPending(submit, true, "Сохраняем…");
    try {
      const payload = {
        name: element("template-name").value,
        description: element("template-description").value,
        active: element("template-active").checked,
        settings: normaliseEditorSettings({
          background_color: element("template-background-color").value,
          accent_color: element("template-accent-color").value,
          text_color: element("template-text-color").value,
          font_scale: element("template-font-scale").value,
          table_width: element("template-table-width").value,
          title: element("template-menu-title").value.trim()
        })
      };
      const url = state.editingTemplateId ? `${API.templates}/${state.editingTemplateId}` : API.templates;
      await api(url, { method: state.editingTemplateId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      resetTemplateForm();
      await loadTemplates();
      await loadNotifications();
    } catch (error) { setMessage("template-message", error.message); }
    finally { setPending(submit, false, "Сохраняем…"); }
  });
}

function price(value) {
  return `${String(value || "0").replace(".", ",")} ₽`;
}

async function loadCatalog() {
  const [products, packaging] = await Promise.all([api(API.products), api(API.packaging)]);
  state.products = products;
  state.packaging = packaging;
  renderCatalogProducts();
  renderCatalogPackaging();
}

function renderCatalogProducts() {
  const list = document.querySelector("[data-products-list]");
  const empty = document.querySelector("[data-products-empty]");
  if (!list || !empty) return;
  const rows = state.products.map((product) => recordRow(
    product.name,
    [
      product.producer || "Производитель не указан",
      product.characteristics || product.strength || "Без характеристик",
      `1 л: ${price(product.price_primary)} · 1,5 л: ${price(product.price_secondary)}`,
      product.active ? "активна" : "скрыта"
    ].join(" · "),
    [makeButton("Изменить", "", () => editProduct(product)), makeButton("Удалить", "danger", () => void deleteProduct(product))]
  ));
  refreshList(list, empty, rows);
}

function renderCatalogPackaging() {
  const list = document.querySelector("[data-packaging-list]");
  const empty = document.querySelector("[data-packaging-empty]");
  if (!list || !empty) return;
  const rows = state.packaging.map((item) => recordRow(
    item.name,
    `${price(item.unit_price)} · ${item.active ? "активна" : "скрыта"}`,
    [makeButton("Изменить", "", () => editPackaging(item)), makeButton("Удалить", "danger", () => void deletePackaging(item))]
  ));
  refreshList(list, empty, rows);
}

function resetProductForm() {
  const form = element("product-form");
  if (!(form instanceof HTMLFormElement)) return;
  state.editingProductId = null;
  form.reset();
  element("product-active").checked = true;
  element("product-alcoholic").checked = false;
  element("product-beverage-color").value = "none";
  element("product-filtration").value = "none";
  element("product-form-title").textContent = "Новая продукция";
  element("product-submit").textContent = "Добавить продукцию";
  element("cancel-product-edit")?.classList.add("is-hidden");
  clearMessage("product-message");
}

function editProduct(product) {
  state.editingProductId = product.id;
  element("product-name").value = product.name;
  element("product-producer").value = product.producer || "";
  element("product-characteristics").value = product.characteristics || "";
  element("product-strength").value = product.strength || "";
  element("product-price-primary").value = product.price_primary || "";
  element("product-alcoholic").checked = product.alcoholic === true;
  element("product-beverage-color").value = product.beverage_color || "none";
  element("product-filtration").value = product.filtration || "none";
  element("product-active").checked = product.active !== false;
  element("product-form-title").textContent = "Редактирование продукции";
  element("product-submit").textContent = "Сохранить продукцию";
  element("cancel-product-edit")?.classList.remove("is-hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteProduct(product) {
  if (!window.confirm(`Удалить продукцию «${product.name}»?`)) return;
  try {
    await api(`${API.products}/${product.id}`, { method: "DELETE" });
    await loadCatalog();
  } catch (error) { setMessage("product-message", error.message); }
}

function resetPackagingForm() {
  const form = element("packaging-form");
  if (!(form instanceof HTMLFormElement)) return;
  state.editingPackagingId = null;
  form.reset();
  element("packaging-active").checked = true;
  element("packaging-form-title").textContent = "Новая тара";
  element("packaging-submit").textContent = "Добавить тару";
  element("cancel-packaging-edit")?.classList.add("is-hidden");
  clearMessage("packaging-message");
}

function editPackaging(item) {
  state.editingPackagingId = item.id;
  element("packaging-name").value = item.name;
  element("packaging-price").value = item.unit_price || "";
  element("packaging-active").checked = item.active !== false;
  element("packaging-form-title").textContent = "Редактирование тары";
  element("packaging-submit").textContent = "Сохранить тару";
  element("cancel-packaging-edit")?.classList.remove("is-hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deletePackaging(item) {
  if (!window.confirm(`Удалить тару «${item.name}»?`)) return;
  try {
    await api(`${API.packaging}/${item.id}`, { method: "DELETE" });
    await loadCatalog();
  } catch (error) { setMessage("packaging-message", error.message); }
}

function initialiseCatalog() {
  const productForm = element("product-form");
  const packagingForm = element("packaging-form");
  if (!(productForm instanceof HTMLFormElement) || !(packagingForm instanceof HTMLFormElement)) return;
  void loadCatalog().catch((error) => setMessage("product-message", error.message));
  element("refresh-catalog")?.addEventListener("click", () => { void loadCatalog(); });
  element("cancel-product-edit")?.addEventListener("click", resetProductForm);
  element("cancel-packaging-edit")?.addEventListener("click", resetPackagingForm);
  productForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = element("product-submit");
    setPending(submit, true, "Сохраняем…");
    try {
      const payload = {
        name: element("product-name").value,
        producer: element("product-producer").value,
        characteristics: element("product-characteristics").value,
        strength: element("product-strength").value,
        price_primary: element("product-price-primary").value,
        alcoholic: element("product-alcoholic").checked,
        beverage_color: element("product-beverage-color").value,
        filtration: element("product-filtration").value,
        active: element("product-active").checked
      };
      const url = state.editingProductId ? `${API.products}/${state.editingProductId}` : API.products;
      await api(url, { method: state.editingProductId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      resetProductForm();
      await Promise.all([loadCatalog(), loadNotifications()]);
    } catch (error) { setMessage("product-message", error.message); }
    finally { setPending(submit, false, "Сохраняем…"); }
  });
  packagingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = element("packaging-submit");
    setPending(submit, true, "Сохраняем…");
    try {
      const payload = { name: element("packaging-name").value, unit_price: element("packaging-price").value, active: element("packaging-active").checked };
      const url = state.editingPackagingId ? `${API.packaging}/${state.editingPackagingId}` : API.packaging;
      await api(url, { method: state.editingPackagingId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      resetPackagingForm();
      await Promise.all([loadCatalog(), loadNotifications()]);
    } catch (error) { setMessage("packaging-message", error.message); }
    finally { setPending(submit, false, "Сохраняем…"); }
  });
}

async function loadScreens() {
  const [locations, screens] = await Promise.all([api(API.locations), api(API.screens)]);
  state.locations = locations;
  state.screens = screens;
  renderScreens();
  return screens;
}

function renderScreens() {
  const list = document.querySelector("[data-screen-hierarchy]");
  const empty = document.querySelector("[data-screens-empty]");
  if (!list || !empty) return;
  const groups = state.locations.map((location) => {
    const group = document.createElement("article");
    group.className = "screen-location-group";
    const header = document.createElement("header");
    header.className = "screen-location-header";
    const title = document.createElement("div");
    const heading = document.createElement("h2");
    heading.textContent = location.name;
    const details = document.createElement("p");
    details.textContent = location.address || "Адрес не указан";
    title.append(heading, details);
    const add = makeButton("+ Добавить ТВ", "", () => void createScreenAtLocation(location));
    header.append(title, add);
    const screens = state.screens.filter((screen) => screen.location_id === location.id);
    const items = document.createElement("div");
    items.className = "screen-location-items";
    screens.forEach((screen) => {
      const row = document.createElement("div");
      row.className = "screen-location-item";
      const link = document.createElement("a");
      link.href = `/screen-editor.html?id=${screen.id}`;
      const name = document.createElement("strong");
      name.textContent = screen.name;
      const info = document.createElement("span");
      const status = screen.status === "published" ? "опубликовано" : screen.status === "ready" ? "готово" : "черновик";
      info.textContent = `${screen.resolution} · ${status}${screen.template_name ? ` · ${screen.template_name}` : " · без шаблона"}`;
      link.append(name, info);
      row.append(link, makeButton("Удалить", "danger", () => void deleteScreen(screen)));
      items.append(row);
    });
    if (screens.length === 0) {
      const hint = document.createElement("p");
      hint.className = "empty-state compact-empty";
      hint.textContent = "Мониторов пока нет. Добавьте ТВ для этой точки.";
      items.append(hint);
    }
    group.append(header, items);
    return group;
  });
  list.replaceChildren(...groups);
  empty.classList.toggle("is-hidden", state.locations.length !== 0);
}

async function deleteScreen(screen) {
  if (!window.confirm(`Удалить монитор «${screen.name}»?`)) return;
  try { await api(`${API.screens}/${screen.id}`, { method: "DELETE" }); await loadScreens(); }
  catch (error) { setMessage("screens-message", error.message); }
}

async function createScreenAtLocation(location) {
  try {
    const screen = await api(`${API.locations}/${location.id}/screens`, { method: "POST" });
    window.location.assign(`/screen-editor.html?id=${screen.id}`);
  } catch (error) { setMessage("screens-message", error.message); }
}

function initialiseScreens() {
  if (!document.querySelector("[data-screen-hierarchy]")) return;
  void loadScreens().catch((error) => setMessage("screens-message", error.message));
  element("refresh-screens")?.addEventListener("click", () => { void loadScreens(); });
}

function editorScreenId() {
  const id = Number(new URLSearchParams(window.location.search).get("id"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function setEditorMessage(message, kind = "error") { setMessage("screen-editor-message", message, kind); }

function newEditorRow(kind) {
  return { id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind, enabled: true, ...(kind === "section" ? { name: "Новый раздел" } : kind === "item" ? { product_id: "", characteristics: "", promotion: false, promotion_text: "" } : { packaging_id: "" }) };
}

function normaliseEditorSettings(settings = {}) {
  return {
    background_color: /^#[0-9a-f]{6}$/i.test(settings.background_color || "") ? settings.background_color : "#101828",
    accent_color: /^#[0-9a-f]{6}$/i.test(settings.accent_color || "") ? settings.accent_color : "#2563eb",
    text_color: /^#[0-9a-f]{6}$/i.test(settings.text_color || "") ? settings.text_color : "#f8fafc",
    font_scale: ["small", "medium", "large"].includes(settings.font_scale) ? settings.font_scale : "medium",
    table_width: ["compact", "normal", "wide"].includes(settings.table_width) ? settings.table_width : "normal",
    title: typeof settings.title === "string" ? settings.title.slice(0, 80) : ""
  };
}

function editorSettingsFromForm() {
  return normaliseEditorSettings({
    background_color: element("editor-background-color").value,
    accent_color: element("editor-accent-color").value,
    text_color: element("editor-text-color").value,
    font_scale: element("editor-font-scale").value,
    table_width: element("editor-table-width").value,
    title: element("editor-menu-title").value.trim()
  });
}

function populateScreenEditor(screen, templates, settings) {
  element("editor-location").value = screen.location_name;
  element("editor-name").value = screen.name;
  element("editor-resolution").value = screen.resolution;
  element("editor-status").value = screen.status === "published" ? "ready" : screen.status;
  element("editor-active").checked = screen.active !== false;
  element("editor-sftp-path").textContent = screen.sftp_path || "Для точки ещё не настроен SFTP-каталог";
  const select = element("editor-template");
  select.replaceChildren(new Option("Без шаблона", ""), ...templates.filter((template) => template.active || Number(template.id) === Number(screen.template_id)).map((template) => new Option(template.name, String(template.id))));
  select.value = screen.template_id ? String(screen.template_id) : "";
  element("editor-template-current").textContent = screen.template_name || "Без шаблона";
  element("editor-background-color").value = settings.background_color;
  element("editor-accent-color").value = settings.accent_color;
  element("editor-text-color").value = settings.text_color;
  element("editor-font-scale").value = settings.font_scale;
  element("editor-table-width").value = settings.table_width;
  element("editor-menu-title").value = settings.title;
  element("editor-publish").disabled = !screen.prepared_asset_key || !screen.sftp_directory_name;
}

function initialiseScreenEditor() {
  const form = element("screen-editor-form");
  const screenId = editorScreenId();
  if (!(form instanceof HTMLFormElement) || !screenId) {
    window.location.replace("/screens.html");
    return;
  }
  let screen;
  let templates = [];
  let products = [];
  let packaging = [];
  let rows = [];
  let settings = normaliseEditorSettings();
  let pendingTemplateId = null;

  const productById = (id) => products.find((item) => Number(item.id) === Number(id));
  const packagingById = (id) => packaging.find((item) => Number(item.id) === Number(id));
  const displayRowName = (row) => row.kind === "item" ? productById(row.product_id)?.name || "Продукция не выбрана" : row.kind === "packaging" ? packagingById(row.packaging_id)?.name || "Тара не выбрана" : row.name;

  const renderPreview = () => {
    settings = editorSettingsFromForm();
    const preview = element("editor-menu-preview");
    if (!preview) return;
    preview.style.setProperty("--menu-background", settings.background_color);
    preview.style.setProperty("--menu-accent", settings.accent_color);
    preview.style.setProperty("--menu-text", settings.text_color);
    preview.dataset.fontScale = settings.font_scale;
    preview.dataset.tableWidth = settings.table_width;
    preview.replaceChildren();
    const title = document.createElement("h3");
    title.textContent = settings.title || screen?.name || "Меню";
    preview.append(title);
    const table = document.createElement("div");
    table.className = "menu-preview-table";
    rows.filter((row) => row.enabled !== false).forEach((row) => {
      const view = document.createElement("div");
      view.className = `menu-preview-row menu-preview-${row.kind}`;
      if (row.kind === "section") {
        view.textContent = row.name || "Раздел";
      } else if (row.kind === "item") {
        const product = productById(row.product_id);
        const name = document.createElement("strong");
        name.textContent = product?.name || "Продукция не выбрана";
        const details = document.createElement("span");
        details.textContent = row.promotion && row.promotion_text ? row.promotion_text : (row.characteristics || product?.characteristics || product?.strength || "");
        const prices = document.createElement("em");
        prices.textContent = product ? `${price(product.price_primary)} / ${price(product.price_secondary)}` : "—";
        view.append(name, details, prices);
      } else {
        const item = packagingById(row.packaging_id);
        const name = document.createElement("strong");
        name.textContent = item?.name || "Тара не выбрана";
        const value = document.createElement("em");
        value.textContent = item ? price(item.unit_price) : "—";
        view.append(name, value);
      }
      table.append(view);
    });
    if (!table.childElementCount) {
      const empty = document.createElement("p");
      empty.textContent = "Добавьте продукцию, тару или раздел слева.";
      table.append(empty);
    }
    preview.append(table);
  };

  const moveRow = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    [rows[index], rows[target]] = [rows[target], rows[index]];
    renderRows();
  };
  const renderRows = () => {
    const target = element("editor-menu-rows");
    if (!target) return;
    target.replaceChildren();
    rows.forEach((row, index) => {
      const card = document.createElement("article");
      card.className = `editor-menu-row editor-menu-row-${row.kind}${row.enabled === false ? " is-disabled" : ""}`;
      const head = document.createElement("div");
      head.className = "editor-menu-row-head";
      const label = document.createElement("strong");
      label.textContent = row.kind === "section" ? "Раздел" : row.kind === "item" ? "Продукция" : "Тара";
      const controls = document.createElement("div");
      controls.className = "editor-row-actions";
      controls.append(makeButton("↑", "", () => moveRow(index, -1)), makeButton("↓", "", () => moveRow(index, 1)));
      const hide = makeButton(row.enabled === false ? "Показать" : "Скрыть", "", () => { row.enabled = row.enabled === false; renderRows(); });
      controls.append(hide, makeButton("Удалить", "danger", () => { rows.splice(index, 1); renderRows(); }));
      head.append(label, controls);
      card.append(head);
      if (row.kind === "section") {
        const input = document.createElement("input");
        input.maxLength = 100;
        input.value = row.name || "";
        input.placeholder = "Название раздела";
        input.addEventListener("input", () => { row.name = input.value; renderPreview(); });
        card.append(input);
      } else if (row.kind === "item") {
        const select = document.createElement("select");
        select.append(new Option("Выберите продукцию", ""), ...products.filter((item) => item.active || Number(item.id) === Number(row.product_id)).map((item) => new Option(`${item.name} · 1 л ${price(item.price_primary)}`, String(item.id))));
        select.value = row.product_id ? String(row.product_id) : "";
        select.addEventListener("change", () => { row.product_id = select.value; renderPreview(); });
        const subtitle = document.createElement("input");
        subtitle.maxLength = 180;
        subtitle.value = row.characteristics || "";
        subtitle.placeholder = "Подпись в меню (необязательно)";
        subtitle.addEventListener("input", () => { row.characteristics = subtitle.value; renderPreview(); });
        const promotion = document.createElement("label");
        promotion.className = "editor-inline-toggle";
        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = row.promotion === true;
        const caption = document.createElement("span"); caption.textContent = "Акция";
        const promotionText = document.createElement("input");
        promotionText.maxLength = 80;
        promotionText.value = row.promotion_text || "";
        promotionText.placeholder = "Текст акции";
        promotionText.disabled = !check.checked;
        check.addEventListener("change", () => { row.promotion = check.checked; promotionText.disabled = !check.checked; renderPreview(); });
        promotionText.addEventListener("input", () => { row.promotion_text = promotionText.value; renderPreview(); });
        promotion.append(check, caption, promotionText);
        card.append(select, subtitle, promotion);
      } else {
        const select = document.createElement("select");
        select.append(new Option("Выберите тару", ""), ...packaging.filter((item) => item.active || Number(item.id) === Number(row.packaging_id)).map((item) => new Option(`${item.name} · ${price(item.unit_price)}`, String(item.id))));
        select.value = row.packaging_id ? String(row.packaging_id) : "";
        select.addEventListener("change", () => { row.packaging_id = select.value; renderPreview(); });
        card.append(select);
      }
      target.append(card);
    });
    element("editor-menu-empty")?.classList.toggle("is-hidden", rows.length !== 0);
    renderPreview();
  };

  const load = async () => {
    const editor = await api(`${API.screens}/${screenId}/editor`);
    screen = editor.screen;
    templates = editor.templates;
    products = editor.products;
    packaging = editor.packaging;
    rows = Array.isArray(editor.draft?.rows) ? editor.draft.rows.map((row) => ({ ...row })) : [];
    settings = normaliseEditorSettings(editor.draft?.settings || {});
    pendingTemplateId = screen.template_id || null;
    populateScreenEditor(screen, templates, settings);
    renderRows();
  };
  void load().catch((error) => setEditorMessage(error.message));
  ["editor-background-color", "editor-accent-color", "editor-text-color", "editor-font-scale", "editor-table-width", "editor-menu-title"].forEach((id) => element(id)?.addEventListener("input", renderPreview));
  element("editor-add-section")?.addEventListener("click", () => { rows.push(newEditorRow("section")); renderRows(); });
  element("editor-add-item")?.addEventListener("click", () => { rows.push(newEditorRow("item")); renderRows(); });
  element("editor-add-packaging")?.addEventListener("click", () => { rows.push(newEditorRow("packaging")); renderRows(); });
  element("editor-template-apply")?.addEventListener("click", () => {
    const selected = Number(element("editor-template").value) || null;
    const template = templates.find((item) => Number(item.id) === selected);
    pendingTemplateId = template?.id || null;
    settings = normaliseEditorSettings(template?.settings || {});
    element("editor-template-current").textContent = template?.name || "Без шаблона";
    populateScreenEditor(screen, templates, settings);
    renderPreview();
    setEditorMessage(template ? `Шаблон «${template.name}» применён в редакторе. Сохраните монитор, чтобы закрепить оформление.` : "Шаблон отключён в редакторе. Сохраните монитор, чтобы закрепить изменения.", "success");
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = element("editor-save");
    setPending(submit, true, "Сохраняем…");
    try {
      screen = await api(`${API.screens}/${screenId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location_id: screen.location_id, name: element("editor-name").value, resolution: element("editor-resolution").value, status: element("editor-status").value, active: element("editor-active").checked, template_id: pendingTemplateId }) });
      const result = await api(`${API.screens}/${screenId}/draft`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows, settings: editorSettingsFromForm(), template_id: pendingTemplateId }) });
      rows = result.draft.rows;
      settings = normaliseEditorSettings(result.draft.settings);
      pendingTemplateId = result.screen.template_id || null;
      populateScreenEditor(result.screen, templates, settings);
      renderRows();
      setEditorMessage("Монитор, меню и оформление сохранены как черновик.", "success");
      await loadNotifications();
    } catch (error) { setEditorMessage(error.message); }
    finally { setPending(submit, false, "Сохраняем…"); }
  });
  element("editor-upload")?.addEventListener("click", async () => {
    const file = element("editor-source-file")?.files?.[0];
    if (!file) return setEditorMessage("Выберите JPEG-файл меню.");
    const button = element("editor-upload");
    setPending(button, true, "Загружаем…");
    try {
      screen = await api(`${API.screens}/${screenId}/source`, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: file });
      populateScreenEditor(screen, templates, editorSettingsFromForm());
      setEditorMessage("JPEG подготовлен. После проверки опубликуйте его на телевизор.", "success");
      await loadNotifications();
    } catch (error) { setEditorMessage(error.message); }
    finally { setPending(button, false, "Загружаем…"); }
  });
  element("editor-publish")?.addEventListener("click", async () => {
    const button = element("editor-publish");
    setPending(button, true, "Публикуем…");
    try {
      screen = await api(`${API.screens}/${screenId}/publish`, { method: "POST" });
      populateScreenEditor(screen, templates, editorSettingsFromForm());
      setEditorMessage("JPEG опубликован в папке SFTP торговой точки.", "success");
      await loadNotifications();
    } catch (error) { setEditorMessage(error.message); }
    finally { setPending(button, false, "Публикуем…"); }
  });
}

function populateUserForm(user) {
  element("profile-username").value = user.username;
  element("display-name").value = user.display_name;
  element("profile-email").value = user.email || "";
  element("profile-phone").value = user.phone || "";
  element("profile-job-title").value = user.job_title || "";
  const theme = document.querySelector(`input[name="theme"][value="${user.theme}"]`);
  if (theme) theme.checked = true;
  element("notifications-enabled").checked = user.notifications_enabled;
}

function initialiseProfile() {
  const userForm = element("user-settings-form");
  const passwordForm = element("password-change-form");
  if (!(userForm instanceof HTMLFormElement)) return;
  populateUserForm(state.user);
  userForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = element("user-settings-submit");
    setPending(submit, true, "Сохраняем…");
    try {
      const theme = document.querySelector("input[name='theme']:checked")?.value || "system";
      const user = await api(API.userSettings, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        display_name: element("display-name").value, email: element("profile-email").value,
        phone: element("profile-phone").value, job_title: element("profile-job-title").value,
        theme, notifications_enabled: element("notifications-enabled").checked
      }) });
      state.user = user;
      applyTheme(user.theme);
      updateProfileMenu(user);
      setMessage("user-settings-message", "Настройки пользователя сохранены.", "success");
      await loadNotifications();
    } catch (error) { setMessage("user-settings-message", error.message); }
    finally { setPending(submit, false, "Сохраняем…"); }
  });
  if (passwordForm instanceof HTMLFormElement) passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const currentPassword = element("current-password").value;
    const newPassword = element("new-password").value;
    const confirmation = element("new-password-confirmation").value;
    if (newPassword !== confirmation) return setMessage("password-change-message", "Новый пароль и его подтверждение не совпадают.");
    const submit = element("password-change-submit");
    setPending(submit, true, "Сохраняем…");
    try {
      await api(API.userPassword, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
      });
      passwordForm.reset();
      setMessage("password-change-message", "Пароль изменён. Все другие активные сессии завершены.", "success");
      await loadNotifications();
    } catch (error) { setMessage("password-change-message", error.message); }
    finally { setPending(submit, false, "Сохраняем…"); }
  });
}

function populateSiteForm(site) {
  element("site-app-name").value = site.app_name;
  element("site-domain").value = site.domain;
  element("site-accent-color").value = site.accent_color;
  element("site-timezone").value = site.timezone;
  element("site-date-format").value = site.date_format;
  element("site-refresh-seconds").value = String(site.dashboard_refresh_seconds);
  element("site-default-resolution").value = site.default_screen_resolution;
  element("site-session-ttl").textContent = `${site.session_ttl_hours} ч`;
  element("site-sftp-port").textContent = String(site.sftp_port);
}

function uploadSiteAsset(kind) {
  const fileInput = element(kind === "logo" ? "site-logo-file" : "site-favicon-file");
  const button = element(kind === "logo" ? "upload-logo" : "upload-favicon");
  const file = fileInput?.files?.[0];
  if (!file) { setMessage("site-settings-message", "Сначала выберите файл."); return; }
  setPending(button, true, "Загружаем…");
  void api(`${API.siteSettings}/${kind}`, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file })
    .then((site) => {
      state.site = site;
      applyPresentation(site);
      populateSiteForm(site);
      setMessage("site-settings-message", `${kind === "logo" ? "Логотип" : "Favicon"} сохранён.`, "success");
      return loadNotifications();
    })
    .catch((error) => setMessage("site-settings-message", error.message))
    .finally(() => setPending(button, false, "Загружаем…"));
}

function initialiseSettings() {
  const siteForm = element("site-settings-form");
  if (!(siteForm instanceof HTMLFormElement)) return;
  populateSiteForm(state.site);
  void loadActivity().catch(() => undefined);
  element("refresh-activity")?.addEventListener("click", () => { void loadActivity(); });
  element("upload-logo")?.addEventListener("click", () => uploadSiteAsset("logo"));
  element("upload-favicon")?.addEventListener("click", () => uploadSiteAsset("favicon"));

  siteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = element("site-settings-submit");
    setPending(submit, true, "Сохраняем…");
    try {
      const site = await api(API.siteSettings, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        application_name: element("site-app-name").value, accent_color: element("site-accent-color").value,
        timezone: element("site-timezone").value, date_format: element("site-date-format").value,
        dashboard_refresh_seconds: Number(element("site-refresh-seconds").value),
        default_screen_resolution: element("site-default-resolution").value
      }) });
      state.site = site;
      applyPresentation(site);
      populateSiteForm(site);
      startNotificationPolling();
      setMessage("site-settings-message", "Настройки сайта сохранены.", "success");
      await loadNotifications();
      await loadActivity();
    } catch (error) { setMessage("site-settings-message", error.message); }
    finally { setPending(submit, false, "Сохраняем…"); }
  });
}

function initialiseSignIn() {
  const form = element("signin-form");
  if (!(form instanceof HTMLFormElement)) return;
  void api(API.publicConfig).then((site) => applyPresentation(site)).catch(() => undefined);
  void fetch(API.session, { credentials: "same-origin" }).then((response) => {
    if (response.ok) window.location.replace("/");
  }).catch(() => undefined);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = element("signin-submit");
    setPending(submit, true, "Выполняется вход…");
    try {
      const response = await fetch(API.login, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: element("username").value.trim(), password: element("password").value }) });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Не удалось выполнить вход.");
      }
      window.location.replace("/");
    } catch (error) { setMessage("signin-message", error.message); }
    finally { setPending(submit, false, "Выполняется вход…"); }
  });
}

async function initialiseApplication() {
  if (pageName() === "signin") return initialiseSignIn();
  try {
    const [session, user, site] = await Promise.all([api(API.session), api(API.userSettings), api(API.siteSettings)]);
    applySession(session);
    state.user = user;
    state.site = site;
    updateProfileMenu(user);
    applyTheme(user.theme);
    applyPresentation(site);
    initialiseChrome();
    initialiseNotifications();
    if (pageName() === "overview") void api(API.overview).then(populateOverview).catch(() => undefined);
    if (pageName() === "settings") initialiseSettings();
    if (pageName() === "profile") initialiseProfile();
    if (pageName() === "locations") initialiseLocations();
    if (pageName() === "screens") initialiseScreens();
    if (pageName() === "screen-editor") initialiseScreenEditor();
    if (pageName() === "templates") initialiseTemplates();
    if (pageName() === "catalog") initialiseCatalog();
  } catch {
    window.location.replace("/signin.html");
  }
}

void initialiseApplication();
