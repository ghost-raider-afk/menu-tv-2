function normalizeUsername(request) {
  return typeof request.body?.username === 'string' ? request.body.username.trim().toLowerCase() : '';
}

export function createLoginLimiter({ maxAttempts, windowMinutes, maxEntries }) {
  const entries = new Map();
  const windowMs = windowMinutes * 60 * 1000;

  function keyFor(request) {
    return `${request.ip || request.socket?.remoteAddress || 'unknown'}|${normalizeUsername(request)}`;
  }

  function prune(now) {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key);
    }
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
  }

  function middleware(request, response, next) {
    const now = Date.now();
    prune(now);
    const key = keyFor(request);
    const entry = entries.get(key);
    request.loginLimiterKey = key;
    if (entry && entry.attempts >= maxAttempts && entry.expiresAt > now) {
      const retryAfter = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
      response.setHeader('Retry-After', String(retryAfter));
      return response.status(429).json({ error: 'Слишком много неудачных попыток входа. Повторите позже.' });
    }
    return next();
  }

  function recordFailure(request) {
    const now = Date.now();
    prune(now);
    const key = request.loginLimiterKey || keyFor(request);
    const current = entries.get(key);
    entries.set(key, current && current.expiresAt > now
      ? { attempts: current.attempts + 1, expiresAt: current.expiresAt }
      : { attempts: 1, expiresAt: now + windowMs });
    prune(now);
  }

  function recordSuccess(request) {
    entries.delete(request.loginLimiterKey || keyFor(request));
  }

  return Object.freeze({ middleware, recordFailure, recordSuccess });
}
