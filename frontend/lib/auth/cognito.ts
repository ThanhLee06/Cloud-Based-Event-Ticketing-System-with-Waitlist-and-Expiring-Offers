/**
 * ST-036 — Đăng nhập qua Amazon Cognito (trang đăng nhập do Cognito cung cấp).
 *
 * Luồng OAuth 2.0 Authorization Code + PKCE (chuẩn cho web chạy trên trình duyệt, không cần
 * client secret):
 *   1. startCognitoLogin(): tạo code_verifier + state, chuyển sang <domain>/oauth2/authorize.
 *   2. Cognito xác thực xong → quay về /auth/callback?code=...&state=...
 *   3. completeCognitoLogin(): kiểm tra state, đổi code lấy token tại <domain>/oauth2/token.
 *   4. Frontend gửi ID token cho backend (POST /api/auth/cognito/session) để liên kết user;
 *      từ đó mọi API chỉ dùng access token.
 */
import { tokenStorage } from '@lib/api/client';

export interface CognitoClientConfig {
  domain: string;
  clientId: string;
  region: string;
}

interface TokenResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

const PENDING_KEY = 'ef_cognito_pending';
const REFRESH_KEY = 'ef_refresh_token';
const NEXT_KEY = 'ef_login_next';
const SCOPES = 'openid email profile';

const isBrowser = () => typeof window !== 'undefined';

const safeStorage = (kind: 'local' | 'session'): Storage | null => {
  if (!isBrowser()) return null;
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const randomString = (byteLength = 32): string => {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
};

const sha256 = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return base64url(new Uint8Array(digest));
};

/** Địa chỉ Cognito quay về sau đăng nhập. Phải khớp với callback_urls khai báo trong Terraform. */
export const cognitoRedirectUri = (): string => `${window.location.origin}/auth/callback`;
/** Địa chỉ quay về sau đăng xuất. Phải khớp với logout_urls khai báo trong Terraform. */
export const cognitoLogoutUri = (): string => `${window.location.origin}/login`;

/** Chỉ chấp nhận đường dẫn nội bộ (chống open-redirect). */
export const sanitizeNextPath = (next: string | null | undefined): string | null =>
  next &&
  next.startsWith('/') &&
  !next.startsWith('//') &&
  !next.startsWith('/login') &&
  !next.startsWith('/auth/')
    ? next
    : null;

/** Ghi nhớ trang cần quay lại sau khi đăng nhập (giữ qua lần chuyển sang Cognito). */
export const rememberNextPath = (next: string | null | undefined): void => {
  const safe = sanitizeNextPath(next);
  const store = safeStorage('session');
  if (!store) return;
  if (safe) store.setItem(NEXT_KEY, safe);
  else store.removeItem(NEXT_KEY);
};

export const takeRememberedNextPath = (): string | null => {
  const store = safeStorage('session');
  const value = store?.getItem(NEXT_KEY) ?? null;
  store?.removeItem(NEXT_KEY);
  return sanitizeNextPath(value);
};

/** Chuyển sang trang đăng nhập (hoặc đăng ký) của Cognito. */
export async function startCognitoLogin(
  config: CognitoClientConfig,
  options: { screen?: 'login' | 'signup'; next?: string | null } = {}
): Promise<void> {
  const verifier = randomString(48);
  const state = randomString(24);
  const pending = { state, verifier, next: sanitizeNextPath(options.next) };
  safeStorage('session')?.setItem(PENDING_KEY, JSON.stringify(pending));

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: cognitoRedirectUri(),
    scope: SCOPES,
    state,
    code_challenge: await sha256(verifier),
    code_challenge_method: 'S256',
  });
  const path = options.screen === 'signup' ? '/signup' : '/oauth2/authorize';
  window.location.assign(`${config.domain}${path}?${params.toString()}`);
}

export class CognitoLoginError extends Error {}

/** Xử lý /auth/callback: kiểm tra state, đổi code lấy token, lưu access + refresh token. */
export async function completeCognitoLogin(
  config: CognitoClientConfig,
  search: URLSearchParams
): Promise<{ idToken: string; next: string | null }> {
  const error = search.get('error');
  if (error) {
    throw new CognitoLoginError(
      search.get('error_description') || 'Đăng nhập bị hủy hoặc không thành công.'
    );
  }
  const code = search.get('code');
  const state = search.get('state');
  const store = safeStorage('session');
  const raw = store?.getItem(PENDING_KEY);
  store?.removeItem(PENDING_KEY);
  const pending = raw
    ? (JSON.parse(raw) as { state: string; verifier: string; next: string | null })
    : null;

  if (!code || !state || !pending || pending.state !== state) {
    // state không khớp = có thể bị giả mạo (CSRF) hoặc người dùng mở lại link cũ.
    throw new CognitoLoginError(
      'Phiên đăng nhập không hợp lệ hoặc đã dùng. Vui lòng đăng nhập lại.'
    );
  }

  const tokens = await requestTokens(config, {
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code,
    redirect_uri: cognitoRedirectUri(),
    code_verifier: pending.verifier,
  });
  if (!tokens.id_token) {
    throw new CognitoLoginError('Cognito không trả về ID token.');
  }
  saveTokens(tokens);
  return { idToken: tokens.id_token, next: pending.next };
}

/** Lấy access token mới bằng refresh token (access token Cognito chỉ sống 60 phút). */
export async function refreshCognitoTokens(config: CognitoClientConfig): Promise<string | null> {
  const refreshToken = safeStorage('local')?.getItem(REFRESH_KEY);
  if (!refreshToken) return null;
  try {
    const tokens = await requestTokens(config, {
      grant_type: 'refresh_token',
      client_id: config.clientId,
      refresh_token: refreshToken,
    });
    saveTokens(tokens);
    return tokens.access_token;
  } catch {
    clearCognitoTokens();
    return null;
  }
}

export function clearCognitoTokens(): void {
  tokenStorage.clear();
  safeStorage('local')?.removeItem(REFRESH_KEY);
}

/** Đăng xuất cả phiên Cognito (nếu không, lần đăng nhập sau Cognito tự đăng nhập lại ngay). */
export function cognitoLogoutUrl(config: CognitoClientConfig): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    logout_uri: cognitoLogoutUri(),
  });
  return `${config.domain}/logout?${params.toString()}`;
}

async function requestTokens(
  config: CognitoClientConfig,
  body: Record<string, string>
): Promise<TokenResponse> {
  const res = await fetch(`${config.domain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) {
    throw new CognitoLoginError('Không đổi được mã đăng nhập lấy token. Vui lòng đăng nhập lại.');
  }
  return (await res.json()) as TokenResponse;
}

function saveTokens(tokens: TokenResponse): void {
  tokenStorage.set(tokens.access_token);
  if (tokens.refresh_token) {
    safeStorage('local')?.setItem(REFRESH_KEY, tokens.refresh_token);
  }
}
