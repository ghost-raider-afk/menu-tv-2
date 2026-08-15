"use strict";

const API = {
  publicConfig: "/api/public/config",
  login: "/api/auth/login",
  logout: "/api/auth/logout",
  session: "/api/session",
  overview: "/api/overview",
  userSettings: "/api/settings/user",
  siteSettings: "/api/settings/site",
  notifications: "/api/notifications",
  locations: "/api/locations",
  screens: "/api/screens",
  templates: "/api/templates"
};

const state = {
  session: null,
  user: null,
  site: null,
  notificationTimer: null,
  locations: [],
  screens: [],
  templates: [],
  editingLocationId: null,
  editingScreenId: null,
  editingTemplateId: null
};

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

function initialiseChrome() {
  document.querySelectorAll("[data-sidebar-toggle]").forEach((button) => button.addEventListener("click", () => {
    document.querySelector("[data-sidebar]")?.classList.toggle("is-open");
  }));
  element("logout-button")?.addEventListener("click", async () => {
    try { await fetch(API.logout, { method: "POST", credentials: "same-origin" }); }
    finally { window.location.replace("/signin.html"); }
  });
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
  document.querySelectorAll("[data-session-user]").forEach((node) => { node.textContent = session.display_name || session.username; });
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
  return state.locations;
}

function renderLocations() {
  const list = document.querySelector("[data-locations-list]");
  const empty = document.querySelector("[data-locations-empty]");
  if (!list || !empty) return;
  const rows = state.locations.map((location) => recordRow(
    location.name,
    `${location.address || "Адрес не указан"} · мониторов: ${location.screen_count} · ${location.active ? "активна" : "неактивна"}`,
    [makeButton("Изменить", "", () => editLocation(location)), makeButton("Удалить", "danger", () => void deleteLocation(location))]
  ));
  refreshList(list, empty, rows);
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
  void loadLocations().catch((error) => setMessage("location-message", error.message));
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
      await loadNotifications();
    } catch (error) { setMessage("location-message", error.message); }
    finally { setPending(submit, false, "Сохраняем…"); }
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
    `${template.description || "Без описания"} · ${template.active ? "активен" : "неактивен"}`,
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
      const payload = { name: element("template-name").value, description: element("template-description").value, active: element("template-active").checked };
      const url = state.editingTemplateId ? `${API.templates}/${state.editingTemplateId}` : API.templates;
      await api(url, { method: state.editingTemplateId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      resetTemplateForm();
      await loadTemplates();
      await loadNotifications();
    } catch (error) { setMessage("template-message", error.message); }
    finally { setPending(submit, false, "Сохраняем…"); }
  });
}

async function loadScreens() {
  const [locations, screens] = await Promise.all([api(API.locations), api(API.screens)]);
  state.locations = locations;
  state.screens = screens;
  populateScreenLocations();
  renderScreens();
  return screens;
}

function populateScreenLocations() {
  const select = element("screen-location");
  if (!(select instanceof HTMLSelectElement)) return;
  const selected = select.value;
  select.replaceChildren(...state.locations.map((location) => {
    const option = document.createElement("option");
    option.value = String(location.id);
    option.textContent = location.name;
    return option;
  }));
  if (selected && [...select.options].some((option) => option.value === selected)) select.value = selected;
}

function renderScreens() {
  const list = document.querySelector("[data-screens-list]");
  const empty = document.querySelector("[data-screens-empty]");
  if (!list || !empty) return;
  const rows = state.screens.map((screen) => {
    const actions = [];
    if (screen.status !== "published") actions.push(makeButton("Изменить", "", () => editScreen(screen)));
    actions.push(makeButton("Изображение", "", () => uploadScreenImage(screen)));
    if (screen.status === "ready" || screen.status === "published") actions.push(makeButton("Опубликовать", "", () => void publishScreen(screen)));
    actions.push(makeButton("Удалить", "danger", () => void deleteScreen(screen)));
    return recordRow(screen.name, `${screen.location_name} · ${screen.resolution} · ${screen.status === "published" ? "опубликовано" : screen.status === "ready" ? "готово" : "черновик"}`, actions);
  });
  refreshList(list, empty, rows);
}

function resetScreenForm() {
  const form = element("screen-form");
  if (!(form instanceof HTMLFormElement)) return;
  state.editingScreenId = null;
  form.reset();
  element("screen-resolution").value = state.site?.default_screen_resolution || "1920×1080";
  element("screen-active").checked = true;
  element("screen-form-title").textContent = "Новый монитор";
  element("screen-submit").textContent = "Создать монитор";
  element("cancel-screen-edit")?.classList.add("is-hidden");
  clearMessage("screen-message");
}

function editScreen(screen) {
  state.editingScreenId = screen.id;
  element("screen-location").value = String(screen.location_id);
  element("screen-name").value = screen.name;
  element("screen-resolution").value = screen.resolution;
  element("screen-status").value = screen.status === "published" ? "ready" : screen.status;
  element("screen-active").checked = screen.active;
  element("screen-form-title").textContent = "Редактирование монитора";
  element("screen-submit").textContent = "Сохранить монитор";
  element("cancel-screen-edit")?.classList.remove("is-hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function uploadScreenImage(screen) {
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "image/jpeg";
  picker.className = "inline-upload";
  document.body.append(picker);
  picker.addEventListener("change", async () => {
    const file = picker.files?.[0];
    picker.remove();
    if (!file) return;
    try {
      await api(`${API.screens}/${screen.id}/source`, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: file });
      await loadScreens();
      await loadNotifications();
    } catch (error) { setMessage("screen-message", error.message); }
  }, { once: true });
  picker.click();
}

async function publishScreen(screen) {
  try {
    await api(`${API.screens}/${screen.id}/publish`, { method: "POST" });
    await loadScreens();
    await loadNotifications();
  } catch (error) { setMessage("screen-message", error.message); }
}

async function deleteScreen(screen) {
  if (!window.confirm(`Удалить монитор «${screen.name}»?`)) return;
  try { await api(`${API.screens}/${screen.id}`, { method: "DELETE" }); await loadScreens(); }
  catch (error) { setMessage("screen-message", error.message); }
}

function initialiseScreens() {
  const form = element("screen-form");
  if (!(form instanceof HTMLFormElement)) return;
  void loadScreens().then(resetScreenForm).catch((error) => setMessage("screen-message", error.message));
  element("refresh-screens")?.addEventListener("click", () => { void loadScreens(); });
  element("cancel-screen-edit")?.addEventListener("click", resetScreenForm);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = element("screen-submit");
    setPending(submit, true, "Сохраняем…");
    try {
      const payload = {
        location_id: Number(element("screen-location").value), name: element("screen-name").value,
        resolution: element("screen-resolution").value, status: element("screen-status").value,
        active: element("screen-active").checked
      };
      const url = state.editingScreenId ? `${API.screens}/${state.editingScreenId}` : API.screens;
      await api(url, { method: state.editingScreenId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      resetScreenForm();
      await loadScreens();
      await loadNotifications();
    } catch (error) { setMessage("screen-message", error.message); }
    finally { setPending(submit, false, "Сохраняем…"); }
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
  const userForm = element("user-settings-form");
  const siteForm = element("site-settings-form");
  if (!(userForm instanceof HTMLFormElement) || !(siteForm instanceof HTMLFormElement)) return;
  populateUserForm(state.user);
  populateSiteForm(state.site);
  void loadActivity().catch(() => undefined);
  element("refresh-activity")?.addEventListener("click", () => { void loadActivity(); });
  element("upload-logo")?.addEventListener("click", () => uploadSiteAsset("logo"));
  element("upload-favicon")?.addEventListener("click", () => uploadSiteAsset("favicon"));

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
      document.querySelectorAll("[data-session-user]").forEach((node) => { node.textContent = user.display_name; });
      setMessage("user-settings-message", "Настройки пользователя сохранены.", "success");
      await loadNotifications();
      await loadActivity();
    } catch (error) { setMessage("user-settings-message", error.message); }
    finally { setPending(submit, false, "Сохраняем…"); }
  });

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
    applyTheme(user.theme);
    applyPresentation(site);
    initialiseChrome();
    initialiseNotifications();
    if (pageName() === "overview") void api(API.overview).then(populateOverview).catch(() => undefined);
    if (pageName() === "settings") initialiseSettings();
    if (pageName() === "locations") initialiseLocations();
    if (pageName() === "screens") initialiseScreens();
    if (pageName() === "templates") initialiseTemplates();
  } catch {
    window.location.replace("/signin.html");
  }
}

void initialiseApplication();
