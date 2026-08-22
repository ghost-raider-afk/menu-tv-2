let generation = 0;
let active = null;

function abortRuntime(runtime, reason = 'route-disposed') {
  if (!runtime || runtime.controller.signal.aborted) return;
  try { runtime.controller.abort(reason); }
  catch { runtime.controller.abort(); }
}

export function beginRouteRuntime(page) {
  abortRuntime(active, 'route-replaced');
  generation += 1;
  const controller = new AbortController();
  const runtime = Object.freeze({
    page: String(page || ''),
    generation,
    controller,
    signal: controller.signal,
    isCurrent() {
      return active === runtime && !controller.signal.aborted;
    }
  });
  active = runtime;
  return runtime;
}

export function currentRouteRuntime() {
  return active;
}

export function currentRouteSignal() {
  return active?.signal || null;
}

export function endRouteRuntime(runtime, reason = 'route-disposed') {
  if (!runtime) return;
  abortRuntime(runtime, reason);
  if (active === runtime) active = null;
}
