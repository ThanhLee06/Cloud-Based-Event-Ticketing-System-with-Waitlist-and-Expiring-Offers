import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId?: string;
  jobId?: string;
}

const context = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(requestId: string, callback: () => T): T {
  return context.run({ requestId }, callback);
}

export function runWithJobContext<T>(jobId: string, callback: () => T): T {
  return context.run({ ...context.getStore(), jobId }, callback);
}

export function getRequestId(): string | undefined {
  return context.getStore()?.requestId;
}

export function getJobId(): string | undefined {
  return context.getStore()?.jobId;
}
