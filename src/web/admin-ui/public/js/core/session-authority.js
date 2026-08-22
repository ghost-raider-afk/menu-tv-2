export const SESSION_AUTHORITY_URL = '/api/session/context';

const SESSION_STATE_HEADER = 'x-session-state';
const AUTHENTICATED = 'authenticated';
const UNAUTHENTICATED = 'unauthenticated';
const UNKNOWN = 'unknown';

let verificationPromise = null;

function pathname(value) {
  try {
    return new URL(String(value), window.location.origin).pathname;
  } catch {
    return '';
  }
}

export function isSessionAuthorityUrl(value) {
  return pathname(value) === SESSION_AUTHORITY_URL;
}

export function transitionToSignIn() {
  if (document.body?.dataset?.page === 'signin') return;
  if (window.location.pathname === '/signin.html') return;
  window.location.replace('/signin.html');
}

async function verifySessionNow() {
  try {
    const response = await fetch(SESSION_AUTHORITY_URL, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'X-TV-Menu-Session-Probe': '1'
      }
    });
    const state = String(response.headers.get(SESSION_STATE_HEADER) || '').toLowerCase();
    if (response.ok && state === AUTHENTICATED) return AUTHENTICATED;
    if (response.status === 401 && state === UNAUTHENTICATED) return UNAUTHENTICATED;
    return UNKNOWN;
  } catch {
    return UNKNOWN;
  }
}

export function verifySessionAuthority() {
  if (!verificationPromise) {
    verificationPromise = verifySessionNow().finally(() => {
      verificationPromise = null;
    });
  }
  return verificationPromise;
}

export const SESSION_AUTHORITY_STATES = Object.freeze({
  AUTHENTICATED,
  UNAUTHENTICATED,
  UNKNOWN
});
