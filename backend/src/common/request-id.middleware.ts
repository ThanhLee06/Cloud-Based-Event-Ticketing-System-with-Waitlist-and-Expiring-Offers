import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from './request-context';

const MAX_LEN = 64;
const SAFE_ID = /^[A-Za-z0-9._:-]+$/;

/**
 * Gắn requestId cho mọi request để đối soát log và ghi vào audit_logs.
 * - Nhận x-request-id do Frontend (lib/api/client.ts) sinh ra nếu hợp lệ.
 * - Nếu thiếu hoặc không hợp lệ thì tự sinh UUID v4.
 * - Trả lại header x-request-id cho client.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HttpRequest');

  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header('x-request-id');
    const requestId =
      incoming && incoming.length <= MAX_LEN && SAFE_ID.test(incoming) ? incoming : randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    const startedAt = Date.now();
    res.once('finish', () => {
      this.logger.log({
        event: 'http_request',
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });
    runWithRequestContext(requestId, () => next());
  }
}
