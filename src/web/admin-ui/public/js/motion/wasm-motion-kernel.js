const DEFAULT_WASM_URL = '/wasm/mira-motion-kernel.wasm';
let sharedPromise = null;

function assertExports(exports) {
  const required = [
    '_mira_row_x', '_mira_row_y', '_mira_row_scale', '_mira_row_brightness',
    '_mira_promo_scale', '_mira_promo_glow', '_mira_promo_wave_progress', '_mira_promo_wave_opacity'
  ];
  for (const name of required) {
    if (typeof exports?.[name] !== 'function') throw new Error(`MIRA motion kernel is missing ${name}.`);
  }
  return exports;
}

async function instantiate(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`MIRA motion kernel HTTP ${response.status}.`);
  let result;
  if (typeof WebAssembly.instantiateStreaming === 'function') {
    try {
      result = await WebAssembly.instantiateStreaming(response.clone(), {});
    } catch {
      result = await WebAssembly.instantiate(await response.arrayBuffer(), {});
    }
  } else {
    result = await WebAssembly.instantiate(await response.arrayBuffer(), {});
  }
  return assertExports(result.instance?.exports || result.exports);
}

export function loadMotionKernel(url = DEFAULT_WASM_URL) {
  if (!sharedPromise) sharedPromise = instantiate(url);
  return sharedPromise;
}

export function resetMotionKernelForTests() {
  sharedPromise = null;
}
