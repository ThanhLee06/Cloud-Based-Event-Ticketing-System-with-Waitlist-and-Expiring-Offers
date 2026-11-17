import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

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
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header('x-request-id');
    const requestId =
      incoming && incoming.length <= MAX_LEN && SAFE_ID.test(incoming) ? incoming : randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  }
}
