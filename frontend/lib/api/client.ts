/**
 * ST-004 — HTTP Client dùng chung cho toàn bộ Frontend EventFlow.
 *
 * Mọi request gọi Backend PHẢI đi qua file này để:
 *  - Tự đính kèm `Authorization: Bearer <token>` khi đã đăng nhập.
 *  - Sinh `x-request-id` (UUID v4) cho mỗi request → đối soát với log Backend / audit_logs.
 *  - Lỗi 401 (thiếu/hết hạn token) → xóa phiên và đẩy về /login.
 *  - Hỗ trợ `Idempotency-Key` giữ nguyên qua các lần retry (dùng cho đặt vé, hủy vé, accept offer...).
 *
 * Cách dùng:
 *   import { api, getApiErrorMessage, postIdempotent } from '@lib/api/client';
 *   const { data } = await api.get<PublicUser>('/users/me');
 *   const { data } = await postIdempotent('/reservations', { eventId });
 */
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'
).replace(/\/+$/, '');

const TOKEN_KEY = 'ef_access_token';
const LOGIN_PATH = '/login';
/** Các route xác thực: 401 ở đây là "sai mật khẩu", không phải "hết phiên" → không tự redirect. */
const AUTH_ENDPOINTS = ['/auth/login', '/auth/register'];

// ----------------------------- Token storage -----------------------------

const isBrowser = (): boolean => typeof window !== 'undefined';

export const tokenStorage = {
  get(): string | null {
    if (!isBrowser()) return null;
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string): void {
    if (!isBrowser()) return;
    try {
      window.localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* localStorage có thể bị chặn (private mode) — bỏ qua */
    }
  },
  clear(): void {
    if (!isBrowser()) return;
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* bỏ qua */
    }
  },
};

// ----------------------------- UUID v4 -----------------------------

export const uuidv4 = (): string => {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant RFC 4122
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

// ----------------------------- Axios instance -----------------------------

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token && !config.headers.has('Authorization')) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  if (!config.headers.has('x-request-id')) {
    config.headers.set('x-request-id', uuidv4());
  }
  return config;
});

/** Gọi khi phiên hết hạn — các màn hình có thể đăng ký để reset state đăng nhập. */
type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();
export const onUnauthorized = (listener: UnauthorizedListener): (() => void) => {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
};

// ----------------------------- Server time (ST-007) -----------------------------
// Đồng hồ máy người dùng có thể lệch vài phút. Mọi hạn giữ vé / offer (expiresAt) do server quyết định
// theo UTC, nên Countdown phải đếm theo giờ server: lấy từ header `Date` của mỗi response.

let serverTimeOffsetMs = 0;
let hasServerTime = false;

const recordServerTime = (headers: unknown): void => {
  const raw =
    headers && typeof (headers as { get?: unknown }).get === 'function'
      ? (headers as { get: (k: string) => unknown }).get('date')
      : (headers as Record<string, unknown> | undefined)?.date;
  if (typeof raw !== 'string') return;
  const serverMs = Date.parse(raw);
  if (Number.isNaN(serverMs)) return;
  // Header Date chỉ chính xác tới giây → cộng 500ms để lấy giá trị trung bình.
  const offset = serverMs + 500 - Date.now();
  // Lệch dưới 1 giây coi như khớp, tránh đồng hồ nhảy qua lại.
  serverTimeOffsetMs = Math.abs(offset) < 1000 ? 0 : offset;
  hasServerTime = true;
};

/** Thời điểm hiện tại theo giờ server (ms). Dùng thay cho Date.now() khi so với expiresAt. */
export const getServerNow = (): number => Date.now() + serverTimeOffsetMs;
export const getServerTimeOffset = (): { offsetMs: number; synced: boolean } => ({
  offsetMs: serverTimeOffsetMs,
  synced: hasServerTime,
});

const isAuthEndpoint = (url?: string): boolean =>
  !!url && AUTH_ENDPOINTS.some((path) => url.split('?')[0].endsWith(path));

api.interceptors.response.use(
  (response) => {
    recordServerTime(response.headers);
    return response;
  },
  (error: AxiosError) => {
    if (error.response) recordServerTime(error.response.headers);
    if (error.response?.status === 401 && !isAuthEndpoint(error.config?.url)) {
      tokenStorage.clear();
      unauthorizedListeners.forEach((fn) => fn());
      if (isBrowser() && window.location.pathname !== LOGIN_PATH) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.assign(`${LOGIN_PATH}?next=${next}`);
      }
    }
    return Promise.reject(error);
  }
);

// ----------------------------- Idempotency helpers -----------------------------

export const createIdempotencyKey = (): string => uuidv4();

export interface IdempotentOptions {
  /** Truyền key có sẵn nếu muốn người dùng bấm lại vẫn dùng đúng key cũ. Mặc định tự sinh. */
  idempotencyKey?: string;
  /** Số lần thử lại khi lỗi mạng / timeout / 5xx. Mặc định 2. */
  retries?: number;
  /** Thời gian chờ cơ sở giữa các lần thử (ms), tăng dần theo lũy thừa 2. Mặc định 400ms. */
  retryDelayMs?: number;
  config?: AxiosRequestConfig;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryable = (error: unknown): boolean => {
  if (!axios.isAxiosError(error)) return false;
  if (!error.response) return true; // lỗi mạng / timeout: chưa biết server đã xử lý chưa → retry cùng key
  return error.response.status >= 500;
};

/**
 * Gửi request có `Idempotency-Key` và tự retry với CÙNG key.
 * Server (TV3/TV4) dựa vào key để trả lại đúng kết quả cũ, không tạo thêm vé.
 */
export async function requestIdempotent<T = unknown>(
  method: 'post' | 'put' | 'patch' | 'delete',
  url: string,
  data?: unknown,
  options: IdempotentOptions = {}
): Promise<AxiosResponse<T>> {
  const key = options.idempotencyKey ?? createIdempotencyKey();
  const retries = options.retries ?? 2;
  const baseDelay = options.retryDelayMs ?? 400;

  for (let attempt = 0; ; attempt++) {
    try {
      return await api.request<T>({
        ...options.config,
        method,
        url,
        data,
        headers: { ...(options.config?.headers ?? {}), 'Idempotency-Key': key },
      });
    } catch (error) {
      if (attempt >= retries || !isRetryable(error)) throw error;
      await sleep(baseDelay * 2 ** attempt);
    }
  }
}

export const postIdempotent = <T = unknown>(
  url: string,
  data?: unknown,
  options?: IdempotentOptions
) => requestIdempotent<T>('post', url, data, options);

// ----------------------------- Error helpers -----------------------------

interface NestErrorBody {
  statusCode?: number;
  message?: string | string[];
  error?: string;
}

/** Lấy thông báo lỗi tiếng Việt từ response NestJS để hiển thị lên UI. */
export const getApiErrorMessage = (
  error: unknown,
  fallback = 'Đã có lỗi xảy ra. Vui lòng thử lại.'
): string => {
  if (axios.isAxiosError<NestErrorBody>(error)) {
    if (!error.response) return 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.';
    const message = error.response.data?.message;
    if (Array.isArray(message) && message.length > 0) return message[0];
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
};

export const getApiErrorStatus = (error: unknown): number | undefined =>
  axios.isAxiosError(error) ? error.response?.status : undefined;
