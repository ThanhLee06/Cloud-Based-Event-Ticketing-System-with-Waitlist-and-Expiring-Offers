'use client';

/**
 * ST-007 — Phiên đăng nhập JWT thật (thay phần Auth của MockStoreProvider).
 *
 * - Khi tải trang: nếu có token → gọi GET /users/me để lấy user thật (token hết hạn → tự đăng xuất).
 * - login / register / logout gọi API ST-002.
 * - Đồng bộ user thật sang mock store (syncAuthUser) để các màn hình còn dùng dữ liệu mẫu
 *   (vé, hàng chờ, ban tổ chức) hiển thị theo đúng người đang đăng nhập.
 *
 * Dùng trong component:  const { user, status, login, logout } = useAuth();
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useMockStore } from '@lib/mock/store';
import type { DemoUser } from '@lib/mock/types';
import { onUnauthorized, setTokenRefresher, tokenStorage } from '@lib/api/client';
import * as authApi from '@lib/api/auth';
import type { AuthConfig, PublicUser, RegisterResponse, UserRole } from '@lib/api/auth';
import {
  clearCognitoTokens,
  cognitoLogoutUrl,
  completeCognitoLogin,
  refreshCognitoTokens,
  rememberNextPath,
  startCognitoLogin,
} from './cognito';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  user: PublicUser | null;
  status: AuthStatus;
  /** ST-036: 'local' (JWT tự ký, dev) hoặc 'cognito' (AWS). null khi đang tải cấu hình. */
  mode: AuthConfig['mode'] | null;
  /** ST-036: chuyển sang trang đăng nhập / đăng ký của Cognito. */
  startCognito: (screen: 'login' | 'signup', next?: string | null) => Promise<void>;
  /** ST-036: xử lý /auth/callback → trả về user và trang cần quay lại. */
  finishCognito: (search: URLSearchParams) => Promise<{ user: PublicUser; next: string | null }>;
  /** true ngay sau khi người dùng tự bấm Đăng xuất — trang bảo vệ không gắn ?next= khi chuyển về /login. */
  loggedOutByUser: boolean;
  login: (email: string, password: string) => Promise<PublicUser>;
  /** Tạo tài khoản và gửi mã OTP — chưa đăng nhập, phải gọi verifyEmail sau đó. */
  register: (name: string, email: string, password: string) => Promise<RegisterResponse>;
  /** Nhập đúng mã OTP → đăng nhập luôn. */
  verifyEmail: (email: string, code: string) => Promise<PublicUser>;
  /** Đăng xuất. `nextAfterLogin`: trang muốn mở sau khi đăng nhập lại (vd. /organizer). */
  logout: (nextAfterLogin?: string) => void;
  /** Tải lại user từ server (sau khi Admin đổi quyền, sau khi sửa hồ sơ...). */
  refreshUser: () => Promise<PublicUser | null>;
  /** Cập nhật user trong phiên ngay sau khi gọi API thành công (không cần tải lại). */
  setUser: (user: PublicUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const ROLE_LABELS: Record<UserRole, string> = {
  CUSTOMER: 'Người mua',
  ORGANIZER: 'Ban tổ chức',
  ADMIN: 'Quản trị viên',
};

/** Trang mặc định sau khi đăng nhập theo vai trò. */
export const homePathForRole = (role: UserRole): string =>
  role === 'ADMIN' ? '/admin' : role === 'ORGANIZER' ? '/organizer' : '/';

const toDemoUser = (u: PublicUser): DemoUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  avatar: u.avatar ?? undefined,
  phone: u.phone ?? undefined,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUserState] = useState<PublicUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [loggedOutByUser, setLoggedOutByUser] = useState(false);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const { currentUser, isHydrated, syncAuthUser } = useMockStore();

  // ST-036: hỏi backend đang dùng local hay Cognito. Với Cognito, đăng ký hàm làm mới token cho client.ts.
  useEffect(() => {
    let cancelled = false;
    void authApi.getAuthConfig().then((cfg) => {
      if (cancelled) return;
      setConfig(cfg);
      const cognito = cfg.mode === 'cognito' ? cfg.cognito : null;
      setTokenRefresher(cognito ? () => refreshCognitoTokens(cognito) : null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setUser = useCallback((u: PublicUser) => {
    setUserState(u);
    setStatus('authenticated');
    setLoggedOutByUser(false);
  }, []);

  const clearSession = useCallback(() => {
    tokenStorage.clear();
    clearCognitoTokens();
    setUserState(null);
    setStatus('anonymous');
  }, []);

  const refreshUser = useCallback(async (): Promise<PublicUser | null> => {
    if (!tokenStorage.get()) {
      setUserState(null);
      setStatus('anonymous');
      return null;
    }
    try {
      const me = await authApi.getMe();
      setUser(me);
      return me;
    } catch {
      // 401 (hết hạn) / 403 (bị khóa) / mất mạng → coi như chưa đăng nhập.
      clearSession();
      return null;
    }
  }, [setUser, clearSession]);

  // Khôi phục phiên khi tải trang (sau khi biết chế độ, để client.ts làm mới được token Cognito).
  // Riêng /auth/callback tự xử lý đăng nhập nên không khôi phục ở đây.
  useEffect(() => {
    if (!config) return;
    if (typeof window !== 'undefined' && window.location.pathname === '/auth/callback') return;
    void refreshUser();
  }, [config, refreshUser]);

  // client.ts gặp 401 ở bất kỳ API nào → xóa phiên trong React state.
  useEffect(
    () =>
      onUnauthorized(() => {
        setUserState(null);
        setStatus('anonymous');
      }),
    []
  );

  // Đồng bộ danh tính thật sang mock store cho các màn hình chưa nối API.
  useEffect(() => {
    if (!isHydrated || status === 'loading') return;
    if (user) {
      if (
        currentUser.id !== user.id ||
        currentUser.role !== user.role ||
        currentUser.name !== user.name ||
        (currentUser.phone ?? null) !== user.phone
      ) {
        syncAuthUser(toDemoUser(user));
      }
    }
  }, [user, status, isHydrated, currentUser, syncAuthUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const u = await authApi.login(email, password);
      setUser(u);
      return u;
    },
    [setUser]
  );

  const register = useCallback(
    (name: string, email: string, password: string) => authApi.register(name, email, password),
    []
  );

  const verifyEmail = useCallback(
    async (email: string, code: string) => {
      const u = await authApi.verifyEmail(email, code);
      setUser(u);
      return u;
    },
    [setUser]
  );

  const startCognito = useCallback(
    async (screen: 'login' | 'signup', next?: string | null) => {
      if (config?.mode !== 'cognito' || !config.cognito) {
        throw new Error('Hệ thống không dùng Cognito.');
      }
      await startCognitoLogin(config.cognito, { screen, next });
    },
    [config]
  );

  const finishCognito = useCallback(
    async (search: URLSearchParams) => {
      const cfg = config ?? (await authApi.getAuthConfig());
      if (cfg.mode !== 'cognito' || !cfg.cognito) {
        throw new Error('Hệ thống không dùng Cognito.');
      }
      const { idToken, next } = await completeCognitoLogin(cfg.cognito, search);
      try {
        const u = await authApi.linkCognitoSession(idToken);
        setUser(u);
        return { user: u, next };
      } catch (err) {
        clearCognitoTokens();
        throw err;
      }
    },
    [config, setUser]
  );

  const logout = useCallback(
    (nextAfterLogin?: string) => {
      setLoggedOutByUser(true);
      clearSession();
      syncAuthUser(null);
      rememberNextPath(nextAfterLogin);
      // Cognito: kết thúc cả phiên trên trang Cognito, nếu không lần sau sẽ tự đăng nhập lại
      // đúng tài khoản cũ (không đổi được sang tài khoản Ban tổ chức).
      if (config?.mode === 'cognito' && config.cognito && typeof window !== 'undefined') {
        window.location.assign(cognitoLogoutUrl(config.cognito));
      }
    },
    [clearSession, syncAuthUser, config]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      mode: config?.mode ?? null,
      startCognito,
      finishCognito,
      loggedOutByUser,
      login,
      register,
      verifyEmail,
      logout,
      refreshUser,
      setUser,
    }),
    [
      user,
      status,
      config,
      startCognito,
      finishCognito,
      loggedOutByUser,
      login,
      register,
      verifyEmail,
      logout,
      refreshUser,
      setUser,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * Dùng trong trang cần đăng nhập: chưa đăng nhập → chuyển về /login?next=<trang hiện tại>.
 * (Nếu vừa tự đăng xuất thì về /login không kèm next.)
 */
export const loginRedirectPath = (currentPath: string, loggedOutByUser: boolean): string =>
  loggedOutByUser ? '/login' : `/login?next=${encodeURIComponent(currentPath)}`;

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải được dùng bên trong <AuthProvider>.');
  return ctx;
};
