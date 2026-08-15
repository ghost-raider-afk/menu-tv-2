import "../css/style.css";
import Alpine from "alpinejs";

window.Alpine = Alpine;
Alpine.start();

const LOGIN_URL = "/api/auth/login";
const LOGOUT_URL = "/api/auth/logout";
const SESSION_URL = "/api/session";

async function currentSession() {
  const response = await fetch(SESSION_URL, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) return null;
  return response.json();
}

function showLoginMessage(message, isError = true) {
  const element = document.getElementById("signin-message");
  if (!element) return;
  element.textContent = message;
  element.className = `rounded-lg border px-3 py-2 text-sm ${isError
    ? "border-error-200 bg-error-50 text-error-600 dark:border-error-500/30 dark:bg-error-500/15 dark:text-error-400"
    : "border-success-200 bg-success-50 text-success-600 dark:border-success-500/30 dark:bg-success-500/15 dark:text-success-400"}`;
}

function setLoginPending(pending) {
  const submit = document.getElementById("signin-submit");
  if (!submit) return;
  submit.disabled = pending;
  submit.textContent = pending ? "Выполняется вход…" : "Войти";
}

async function initialiseSignIn() {
  const form = document.getElementById("signin-form");
  if (!(form instanceof HTMLFormElement)) return;

  try {
    if (await currentSession()) {
      window.location.replace("/");
      return;
    }
  } catch {
    // The form remains available and will show a clear message on submit.
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = form.elements.username.value.trim();
    const password = form.elements.password.value;
    if (!username || !password) {
      showLoginMessage("Введите логин и пароль.");
      return;
    }

    setLoginPending(true);
    try {
      const response = await fetch(LOGIN_URL, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        showLoginMessage(payload.error || "Не удалось выполнить вход.");
        return;
      }
      showLoginMessage("Вход выполнен. Открываем панель управления…", false);
      window.location.replace("/");
    } catch {
      showLoginMessage("Не удалось подключиться к серверу. Повторите попытку.");
    } finally {
      setLoginPending(false);
    }
  });
}

async function initialiseApplication() {
  const userElement = document.querySelector("[data-session-user]");
  const logoutButton = document.getElementById("logout-button");
  if (!userElement && !logoutButton) return;

  try {
    const session = await currentSession();
    if (!session) {
      window.location.replace("/signin.html");
      return;
    }
    if (userElement) userElement.textContent = session.username;
  } catch {
    window.location.replace("/signin.html");
    return;
  }

  logoutButton?.addEventListener("click", async () => {
    logoutButton.disabled = true;
    try {
      await fetch(LOGOUT_URL, { method: "POST", credentials: "same-origin" });
    } finally {
      window.location.replace("/signin.html");
    }
  });
}

void initialiseSignIn();
void initialiseApplication();
