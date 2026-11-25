/** Sanitization helpers for telemetry payloads. */

const SECRET_PATTERNS: RegExp[] = [
  /AIza[0-9A-Za-z_-]{20,}/g,
  /AQ[0-9A-Za-z_-]{20,}/g,
  /sk-[0-9A-Za-z_-]{20,}/g,
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /(api[_-]?key|secret|token|password)\s*[:=]\s*["']?[^"'\s]+/gi,
];

export function redactSecrets(input: string): string {
  let out = String(input ?? "");
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (match) => {
      // keep the key name if present
      const m = match.match(/^([A-Za-z_-]+)\s*[:=]/);
      return m ? `${m[1]}=[REDACTED]` : "[REDACTED]";
    });
  }
  return out;
}

export function sanitizeTelemetry(payload: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...payload };
  for (const key of ["message", "stack", "route"]) {
    if (typeof result[key] === "string") result[key] = redactSecrets(result[key] as string);
  }
  return result;
}
