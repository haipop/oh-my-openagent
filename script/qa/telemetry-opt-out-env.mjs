// The one place a QA driver decides what a child it launches may report. Every driver that boots a
// runtime passes the child environment through withTelemetryOptOut, so QA traffic never reaches the
// production analytics project.
const TELEMETRY_OPT_OUT_ENV = Object.freeze({ DO_NOT_TRACK: "1", OMO_DISABLE_TELEMETRY: "1" })

/** `env` with telemetry forced off, whatever the caller exported. */
export function withTelemetryOptOut(env) {
  return { ...env, ...TELEMETRY_OPT_OUT_ENV }
}
