let readiness = {
  ready: true,
  phase: 'ready',
  failure: null,
  updatedAt: new Date().toISOString(),
};

function setReadiness({ ready, phase, failure = null }) {
  readiness = {
    ready: Boolean(ready),
    phase,
    failure: failure ? String(failure) : null,
    updatedAt: new Date().toISOString(),
  };
}

/** Mark the production entrypoint as still starting critical runtime services. */
export function markRuntimeStarting() {
  setReadiness({ ready: false, phase: 'starting' });
}

/** Mark the process ready only after critical startup work has completed. */
export function markRuntimeReady() {
  setReadiness({ ready: true, phase: 'ready' });
}

/** Keep readiness closed when post-listen startup fails. */
export function markRuntimeFailed(error) {
  setReadiness({
    ready: false,
    phase: 'failed',
    failure: error?.code || error?.message || 'startup_failed',
  });
}

/**
 * Read a copy so callers cannot mutate the module state.
 * The failure is intentionally not sent to public health callers.
 */
export function getRuntimeReadiness() {
  return { ...readiness };
}
