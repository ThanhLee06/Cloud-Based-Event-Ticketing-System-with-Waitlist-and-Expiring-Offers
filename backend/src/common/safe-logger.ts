import type { LoggerService } from '@nestjs/common';

const REDACTED = '[REDACTED]';
const SENSITIVE_KEY = /^(password|passwordhash|authorization|token|accesstoken|refreshtoken|jwtsecret|databaseurl|signedurl|presignedurl|xinternalsecret)$/i;
const URL_PATTERN = /\bhttps?:\/\/[^\s"'<>]+/gi;
const SECRET_ASSIGNMENT = /\b(password(?:hash)?|authorization|access[_-]?token|refresh[_-]?token|token|jwt[_-]?secret|database[_-]?url|signed[_-]?url|presigned[_-]?url|x-internal-secret)\s*([=:])\s*(?:"[^"]*"|'[^']*'|[^\s,;&]+)/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

/** Remove query strings from URLs and redact sensitive fields before a log reaches an output. */
export function redactLogValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactLogString(value);
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactLogString(value.message),
      ...(value.stack ? { stack: redactLogString(value.stack) } : {}),
    };
  }
  if (Array.isArray(value)) return value.map((item) => redactLogValue(item, seen));
  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = SENSITIVE_KEY.test(key.replace(/[^a-z]/gi, '')) ? REDACTED : redactLogValue(item, seen);
    }
    seen.delete(value);
    return output;
  }
  return value;
}

export function redactLogString(value: string): string {
  return value
    .replace(URL_PATTERN, (url) => url.replace(/[?#].*$/, ''))
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi, '$1[REDACTED]@')
    .replace(/\bauthorization\s*([=:])\s*Bearer\s+[^\s,;&]+/gi, `authorization$1${REDACTED}`)
    .replace(BEARER, `Bearer ${REDACTED}`)
    .replace(SECRET_ASSIGNMENT, (_match, key: string, separator: string) => `${key}${separator}${REDACTED}`);
}

/** Nest application logger that emits one sanitized JSON record per event. */
export class SafeLogger implements LoggerService {
  log(message: unknown, ...optionalParams: unknown[]): void { this.write('log', message, optionalParams); }
  error(message: unknown, ...optionalParams: unknown[]): void { this.write('error', message, optionalParams); }
  warn(message: unknown, ...optionalParams: unknown[]): void { this.write('warn', message, optionalParams); }
  debug(message: unknown, ...optionalParams: unknown[]): void { this.write('debug', message, optionalParams); }
  verbose(message: unknown, ...optionalParams: unknown[]): void { this.write('verbose', message, optionalParams); }
  fatal(message: unknown, ...optionalParams: unknown[]): void { this.write('fatal', message, optionalParams); }

  private write(level: string, message: unknown, optionalParams: unknown[]): void {
    const context = optionalParams.find((param) => typeof param === 'string');
    const details = optionalParams.filter((param) => param !== context);
    const record = redactLogValue({ timestamp: new Date().toISOString(), level, context, message, ...(details.length ? { details } : {}) });
    const line = `${JSON.stringify(record)}\n`;
    if (level === 'error' || level === 'fatal') process.stderr.write(line);
    else process.stdout.write(line);
  }
}
