import "../css/style.css";
import Alpine from "alpinejs";

window.Alpine = Alpine;
Alpine.start();

const LOGIN_URL = "/api/auth/login";
const LOGOUT_URL = "/api/auth/logout";
const SESSION_URL = "/api/session";
const PUBLIC_CONFIG_URL = "/api/public/config";
const USER_SETTINGS_URL = "/api/settings/user";
const SITE_SETTINGS_URL = "/api/settings/site";
const NOTIFICATIONS_URL = "/api/notifications";
let notificationsEnabled = true;

async function apiJson(url, init = {}) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error || "Не удалось выполнить запрос.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function currentSession() {
  const response = await fetch(SESSION_URL, { credentials: "same-origin", cache: "no-store" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Не удалось проверить сессию.");
  return response.json();
}

function showMessage(id, message, isError = true) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message;
  element.className = `rounded-lg border px-3 py-2 text-sm ${isError
    ? "border-error-200 bg-error-50 text-error-600 dark:border-error-500/30 dark:bg-error-500/15 dark:text-error-400"
    : "border-success-200 bg-success-50 text-success-600 dark:border-success-500/30 dark:bg-success-500/15 dark:text-success-400"}`;
}

function setButtonPending(button, pending, pendingLabel) {
  if (!(button instanceof HTMLButtonElement)) return;
  if (!button.dataset.defaultLabel) button.dataset.defaultLabel = button.textContent.trim();
  button.disabled = pending;
  button.textContent = pending ? pendingLabel : button.dataset.defaultLabel;
}

function setApplicationName(appName) {
  if (!appName) return;
  document.querySelectorAll("[data-app-name]").forEach((element) => { element.textContent = appName; });
  document.title = appName;
}

function formatEventDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function eventRow(event, compact = false) {
  const row = document.createElement("article");
  row.className = compact ? "px-4 py-3" : "py-4 first:pt-0 last:pb-0";

  const message = document.createElement("p");
  message.className = "text-sm font-medium leading-5 text-gray-800 dark:text-white/90";
  message.textContent = event.message;
  row.append(message);

  const details = document.createElement("p");
  details.className = "mt-1 text-xs text-gray-500 dark:text-gray-400";
  details.textContent = `${event.actor_username} · ${formatEventDate(event.created_at)}`;
  row.append(details);
  return row;
}

function renderEvents({ list, empty }, items, compact = false) {
  if (!list || !empty) return;
  list.replaceChildren(...items.map((event) => eventRow(event, compact)));
  empty.classList.toggle("hidden", items.length !== 0);
}

function updateNotificationCount(count) {
  const badge = document.querySelector("[data-notification-count]");
  if (!badge) return;
  const visibleCount = notificationsEnabled ? count : 0;
  badge.textContent = visibleCount > 99 ? "99+" : String(visibleCount);
  badge.classList.toggle("hidden", visibleCount === 0);
}

async function loadNotifications(limit = 20) {
  const payload = await apiJson(`${NOTIFICATIONS_URL}?limit=${limit}`);
  renderEvents({
    list: document.querySelector("[data-notification-list]"),
    empty: document.querySelector("[data-notification-empty]")
  }, payload.items, true);
  updateNotificationCount(payload.unread_count);
  return payload;
}

async function loadActivity() {
  const payload = await apiJson(`${NOTIFICATIONS_URL}?limit=100`);
  renderEvents({
    list: document.querySelector("[data-activity-list]"),
    empty: document.querySelector("[data-activity-empty]")
  }, payload.items);
  updateNotificationCount(payload.unread_count);
  return payload;
}

function initialiseNotifications() {
  const button = document.getElementById("notifications-button");
  const panel = document.getElementById("notifications-panel");
  if (!(button instanceof HTMLButtonElement) || !panel) return;

  const refresh = () => loadNotifications().catch(() => undefined);
  void refresh();
  window.setInterval(() => {
    if (notificationsEnabled) void refresh();
  }, 45_000);

  button.addEventListener("click", () => {
    const isOpen = panel.classList.contains("hidden");
    panel.classList.toggle("hidden", !isOpen);
    button.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) void refresh();
  });

  document.addEventListener("click", (event) => {
    if (panel.classList.contains("hidden") || panel.contains(event.target) || button.contains(event.target)) return;
    panel.classList.add("hidden");
    button.setAttribute("aria-expanded", "false");
  });

  document.getElementById("mark-notifications-read")?.addEventListener("click", async () => {
    try {
      await apiJson("/api/notifications/read", { method: "POST" });
      await refresh();
      if (document.querySelector("[data-activity-list]")) await loadActivity();
    } catch {
      // The notification list remains available for the next refresh.
    }
  });
}

function initialiseSignIn() {
  const form = document.getElementById("signin-form");
  if (!(form instanceof HTMLFormElement)) return;

  void apiJson(PUBLIC_CONFIG_URL).then(({ app_name: appName }) => setApplicationName(appName)).catch(() => undefined);
  void currentSession().then((session) => {
    if (session) window.location.replace("/");
  }).catch(() => undefined);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = form.elements.username.value.trim();
    const password = form.elements.password.value;
    if (!username || !password) {
      showMessage("signin-message", "Введите логин и пароль.");
      return;
    }

    const submit = document.getElementById("signin-submit");
    setButtonPending(submit, true, "Выполняется вход…");
    try {
      const response = await fetch(LOGIN_URL, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        showMessage("signin-message", payload.error || "Не удалось выполнить вход.");
        return;
      }
      showMessage("signin-message", "Вход выполнен. Открываем панель управления…", false);
      window.location.replace("/");
    } catch {
      showMessage("signin-message", "Не удалось подключиться к серверу. Повторите попытку.");
    } finally {
      setButtonPending(submit, false, "Выполняется вход…");
    }
  });
}

function initialiseSettings() {
  const userForm = document.getElementById("user-settings-form");
  const siteForm = document.getElementById("site-settings-form");
  if (!(userForm instanceof HTMLFormElement) || !(siteForm instanceof HTMLFormElement)) return;

  const displayName = document.getElementById("display-name");
  const notifications = document.getElementById("notifications-enabled");
  const appName = document.getElementById("site-app-name");
  const domain = document.getElementById("site-domain");
  const timezone = document.getElementById("site-timezone");

  const load = async () => {
    const [user, site] = await Promise.all([apiJson(USER_SETTINGS_URL), apiJson(SITE_SETTINGS_URL)]);
    displayName.value = user.display_name;
    notifications.checked = user.notifications_enabled;
    appName.value = site.app_name;
    domain.value = site.domain;
    timezone.value = site.timezone;
    notificationsEnabled = user.notifications_enabled;
    setApplicationName(site.app_name);
  };

  void load().catch((error) => showMessage("user-settings-message", error.message));

  userForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = document.getElementById("user-settings-submit");
    setButtonPending(submit, true, "Сохраняем…");
    try {
      const preferences = await apiJson(USER_SETTINGS_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName.value, notifications_enabled: notifications.checked })
      });
      notificationsEnabled = preferences.notifications_enabled;
      document.querySelectorAll("[data-session-user]").forEach((element) => { element.textContent = preferences.display_name; });
      showMessage("user-settings-message", "Настройки пользователя сохранены.", false);
      await loadNotifications();
      await loadActivity();
    } catch (error) {
      showMessage("user-settings-message", error.message);
    } finally {
      setButtonPending(submit, false, "Сохраняем…");
    }
  });

  siteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = document.getElementById("site-settings-submit");
    setButtonPending(submit, true, "Сохраняем…");
    try {
      const site = await apiJson(SITE_SETTINGS_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: timezone.value })
      });
      timezone.value = site.timezone;
      setApplicationName(site.app_name);
      showMessage("site-settings-message", "Настройки сайта сохранены.", false);
      await loadNotifications();
      await loadActivity();
    } catch (error) {
      showMessage("site-settings-message", error.message);
    } finally {
      setButtonPending(submit, false, "Сохраняем…");
    }
  });

  document.getElementById("refresh-activity")?.addEventListener("click", () => { void loadActivity(); });
  void loadActivity().catch(() => undefined);
}

async function initialiseApplication() {
  const userElement = document.querySelector("[data-session-user]");
  const logoutButton = document.getElementById("logout-button");
  if (!userElement && !logoutButton) return;

  let session;
  try {
    session = await currentSession();
    if (!session) {
      window.location.replace("/signin.html");
      return;
    }
  } catch {
    window.location.replace("/signin.html");
    return;
  }

  notificationsEnabled = session.notifications_enabled;
  setApplicationName(session.app_name);
  if (userElement) userElement.textContent = session.display_name || session.username;

  logoutButton?.addEventListener("click", async () => {
    logoutButton.disabled = true;
    try {
      await fetch(LOGOUT_URL, { method: "POST", credentials: "same-origin" });
    } finally {
      window.location.replace("/signin.html");
    }
  });

  initialiseNotifications();
  initialiseSettings();
}

initialiseSignIn();
void initialiseApplication();
