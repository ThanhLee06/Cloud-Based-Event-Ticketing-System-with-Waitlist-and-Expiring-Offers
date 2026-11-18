import { InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const DEFAULT_TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  timeout: 10_000,
  maxWait: 5_000,
} as const;

export function isTransientPgConflict(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const sqlState = typeof err.meta?.code === 'string' ? err.meta.code : '';
    if (err.code === 'P2034' || sqlState === '40001' || sqlState === '40P01' || sqlState === '55P03') {
      return true;
    }
  }
  const code = (err as { code?: string })?.code;
  return code === '40001' || code === '40P01' || code === '55P03';
}

export async function runWithPgRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  mapError?: (err: unknown) => Error
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt < maxRetries && isTransientPgConflict(err)) {
        await new Promise((r) => setTimeout(r, 15 + Math.floor(Math.random() * 25)));
        continue;
      }
      throw mapError ? mapError(err) : err;
    }
  }
  throw new InternalServerErrorException('Không thể xử lý giao dịch đồng thời.');
}
