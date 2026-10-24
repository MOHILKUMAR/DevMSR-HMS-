import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { Env } from '../config/env.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Personal fields that must never reach a log line, wherever they appear in a logged object. */
const PERSONAL_FIELDS = [
  'password',
  'fullName',
  'name',
  'phone',
  'email',
  'dateOfBirth',
  'address',
  'aadhaar',
  'aadhaarNumber',
  'abha',
  'abhaNumber',
  'token',
  'csrfToken',
];

const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  ...PERSONAL_FIELDS.flatMap((field) => [field, `*.${field}`, `*.*.${field}`]),
];

/** Reuses a caller's UUID request ID (for tracing through Caddy) or makes a new one, and echoes it back. */
export function requestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && UUID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

interface SerializedRequest {
  id: string;
  method: string;
  url: string;
  remoteAddress?: string;
}

export function loggerOptions(env: Env): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      genReqId: requestId,
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      serializers: {
        // Method and path only: no headers, no query string (it could carry a search term), never the body.
        req: (req: SerializedRequest) => ({
          id: req.id,
          method: req.method,
          path: req.url.split('?')[0],
          remoteAddress: req.remoteAddress,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (_req, res, err) => {
        if (err !== undefined || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      autoLogging: {
        ignore: (req) => req.url === '/api/v1/health',
      },
    },
  };
}
