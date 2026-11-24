/**
 * ST-036 — Kiểm thử xác minh token Amazon Cognito và liên kết tài khoản.
 *
 * Không gọi AWS: tự tạo cặp khóa RSA, ký JWT giống hệt định dạng Cognito và nạp khóa công khai
 * vào bộ nhớ đệm JWKS của aws-jwt-verify. Nhờ vậy kiểm tra được đủ các điều kiện mà issue yêu cầu:
 * chữ ký (JWKS), hạn dùng, nơi cấp (iss) và ứng dụng được cấp (client_id / aud).
 */
// @nestjs/jwt là ESM, Jest (CommonJS) không nạp trực tiếp được — mock giống các spec khác.
// Ở chế độ cognito, AuthTokenService không dùng tới JwtService.
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createSign, generateKeyPairSync, KeyObject } from 'crypto';
import { AuthTokenService } from '../src/auth/auth-token.service';
import { CognitoSessionService } from '../src/auth/cognito-session.service';
import { validateEnv } from '../src/config/env.validation';

const REGION = 'ap-southeast-2';
const POOL_ID = `${REGION}_TestPool1`;
const CLIENT_ID = 'testclientid1234567890';
const ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${POOL_ID}`;
const KID = 'test-key-1';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

function sign(payload: Record<string, unknown>, key: KeyObject = privateKey, kid = KID): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${body}`);
  return `${header}.${body}.${signer.sign(key).toString('base64url')}`;
}

const now = () => Math.floor(Date.now() / 1000);

function accessToken(sub: string, overrides: Record<string, unknown> = {}): string {
  return sign({
    sub,
    iss: ISSUER,
    client_id: CLIENT_ID,
    token_use: 'access',
    scope: 'openid email profile',
    auth_time: now(),
    iat: now(),
    exp: now() + 3600,
    jti: 'j1',
    username: sub,
    ...overrides,
  });
}

function idToken(sub: string, email: string, overrides: Record<string, unknown> = {}): string {
  return sign({
    sub,
    iss: ISSUER,
    aud: CLIENT_ID,
    token_use: 'id',
    email,
    email_verified: true,
    name: 'Người Dùng Cognito',
    'cognito:username': sub,
    auth_time: now(),
    iat: now(),
    exp: now() + 3600,
    at_hash: 'x',
    origin_jti: 'o',
    event_id: 'e',
    jti: 'j2',
    ...overrides,
  });
}

interface FakeUser {
  id: string;
  name: string;
  email: string;
  role: 'CUSTOMER' | 'ORGANIZER' | 'ADMIN';
  status: 'ACTIVE' | 'LOCKED';
  cognitoSub: string | null;
  emailVerifiedAt: Date | null;
  passwordHash: string;
  avatar: null;
  phone: null;
  createdAt: Date;
  updatedAt: Date;
}

/** PrismaService giả: chỉ các truy vấn mà AuthTokenService / CognitoSessionService dùng. */
function createPrismaMock(seed: FakeUser[]) {
  const users = [...seed];
  const audits: unknown[] = [];
  const pick = (u: FakeUser | undefined, select?: Record<string, boolean>) => {
    if (!u) return null;
    if (!select) return { ...u };
    return Object.fromEntries(Object.keys(select).map((k) => [k, (u as unknown as Record<string, unknown>)[k]]));
  };
  const userApi = {
    findUnique: jest.fn(async ({ where, select }: { where: Partial<FakeUser>; select?: Record<string, boolean> }) => {
      const u = users.find((x) =>
        where.id ? x.id === where.id : where.cognitoSub ? x.cognitoSub === where.cognitoSub : x.email === where.email
      );
      return pick(u, select);
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeUser> }) => {
      const u = users.find((x) => x.id === where.id)!;
      Object.assign(u, data);
      return { ...u };
    }),
    create: jest.fn(async ({ data }: { data: Partial<FakeUser> }) => {
      const u = { id: `u-${users.length + 1}`, avatar: null, phone: null, createdAt: new Date(), updatedAt: new Date(), ...data } as FakeUser;
      users.push(u);
      return { ...u };
    }),
  };
  const auditLog = { create: jest.fn(async ({ data }: { data: unknown }) => audits.push(data)) };
  const prisma = {
    user: userApi,
    auditLog,
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({ user: userApi, auditLog })),
  };
  return { prisma, users, audits };
}

function seedUser(overrides: Partial<FakeUser>): FakeUser {
  return {
    id: 'seed-1',
    name: 'Sinh viên 001',
    email: 'student001@eventflow.vn',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    cognitoSub: null,
    emailVerifiedAt: new Date(),
    passwordHash: 'x',
    avatar: null,
    phone: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function build(seed: FakeUser[]) {
  const { prisma, users, audits } = createPrismaMock(seed);
  const config = {
    get: (k: string) => ({ AUTH_MODE: 'cognito' })[k],
    getOrThrow: (k: string) => ({ COGNITO_USER_POOL_ID: POOL_ID, COGNITO_CLIENT_ID: CLIENT_ID })[k],
  } as unknown as ConfigService;
  const tokens = new AuthTokenService(new JwtService(), prisma as never, config);
  tokens.cacheJwks({
    keys: [{ ...(publicKey.export({ format: 'jwk' }) as Record<string, string>), kid: KID, alg: 'RS256', use: 'sig' } as never],
  });
  const session = new CognitoSessionService(prisma as never, tokens);
  return { tokens, session, users, audits };
}

describe('ST-036 · AuthTokenService (AUTH_MODE=cognito)', () => {
  const organizer = seedUser({ id: 'org-1', email: 'organizer01@eventflow.vn', role: 'ORGANIZER', cognitoSub: 'sub-org' });
  const admin = seedUser({ id: 'adm-1', email: 'admin@eventflow.vn', role: 'ADMIN', cognitoSub: 'sub-admin' });
  const student = seedUser({ id: 'stu-1', cognitoSub: 'sub-student' });
  const locked = seedUser({ id: 'lck-1', email: 'locked@x.vn', status: 'LOCKED', cognitoSub: 'sub-locked' });

  it.each([
    ['Sinh viên', 'sub-student', 'CUSTOMER'],
    ['Ban tổ chức', 'sub-org', 'ORGANIZER'],
    ['Quản trị viên', 'sub-admin', 'ADMIN'],
  ])('%s: access token hợp lệ → nạp đúng user và vai trò từ DB', async (_label, sub, role) => {
    const { tokens } = build([student, organizer, admin]);
    const user = await tokens.authenticate(accessToken(sub));
    expect(user.role).toBe(role);
  });

  it.each([
    ['sai App Client (client_id)', () => accessToken('sub-student', { client_id: 'other-client' })],
    ['hết hạn', () => accessToken('sub-student', { iat: now() - 7200, exp: now() - 3600 })],
    ['sai nơi cấp (iss)', () => accessToken('sub-student', { iss: `https://cognito-idp.${REGION}.amazonaws.com/${REGION}_Other` })],
    ['dùng ID token thay cho access token', () => idToken('sub-student', 'student001@eventflow.vn')],
    ['chữ ký bởi khóa lạ', () => sign({ sub: 'sub-student', iss: ISSUER, client_id: CLIENT_ID, token_use: 'access', exp: now() + 60, iat: now() }, other.privateKey)],
    ['không phải JWT', () => 'not-a-jwt'],
  ])('token %s → 401', async (_label, makeToken) => {
    const { tokens } = build([student]);
    await expect(tokens.authenticate(makeToken())).rejects.toMatchObject({ status: 401 });
  });

  it('token hợp lệ nhưng chưa liên kết → 401 ACCOUNT_NOT_LINKED', async () => {
    const { tokens } = build([student]);
    await expect(tokens.authenticate(accessToken('sub-unknown'))).rejects.toMatchObject({
      status: 401,
      response: expect.objectContaining({ code: 'ACCOUNT_NOT_LINKED' }),
    });
  });

  it('tài khoản bị khóa → 403 dù token còn hạn', async () => {
    const { tokens } = build([locked]);
    await expect(tokens.authenticate(accessToken('sub-locked'))).rejects.toMatchObject({ status: 403 });
  });
});

describe('ST-036 · CognitoSessionService.link', () => {
  it('gắn sub vào tài khoản seed có sẵn theo email (giữ nguyên users.id và vai trò)', async () => {
    const seed = seedUser({ id: 'org-1', email: 'organizer01@eventflow.vn', role: 'ORGANIZER' });
    const { session, tokens, users, audits } = build([seed]);
    const user = await session.link(idToken('sub-new-org', 'Organizer01@EventFlow.vn'));
    expect(user).toMatchObject({ id: 'org-1', role: 'ORGANIZER' });
    expect(users[0].cognitoSub).toBe('sub-new-org');
    expect(audits).toHaveLength(1);
    // Từ đây chỉ cần access token.
    await expect(tokens.authenticate(accessToken('sub-new-org'))).resolves.toMatchObject({ id: 'org-1' });
  });

  it('người mới tự đăng ký → tạo user vai trò CUSTOMER', async () => {
    const { session, users } = build([]);
    const user = await session.link(idToken('sub-brand-new', 'newbie@example.com'));
    expect(user).toMatchObject({ role: 'CUSTOMER', email: 'newbie@example.com', name: 'Người Dùng Cognito' });
    expect(users[0].cognitoSub).toBe('sub-brand-new');
  });

  it('đã liên kết → trả về user, không ghi thêm', async () => {
    const seed = seedUser({ cognitoSub: 'sub-student' });
    const { session, audits } = build([seed]);
    await expect(session.link(idToken('sub-student', 'student001@eventflow.vn'))).resolves.toMatchObject({ id: 'seed-1' });
    expect(audits).toHaveLength(0);
  });

  it('email chưa được Cognito xác thực → 403', async () => {
    const { session } = build([seedUser({})]);
    await expect(
      session.link(idToken('sub-x', 'student001@eventflow.vn', { email_verified: false }))
    ).rejects.toMatchObject({ status: 403 });
  });

  it('email đã gắn với sub khác → 409, không cướp tài khoản', async () => {
    const { session } = build([seedUser({ cognitoSub: 'sub-original' })]);
    await expect(session.link(idToken('sub-attacker', 'student001@eventflow.vn'))).rejects.toMatchObject({ status: 409 });
  });

  it('ID token sai App Client → 401', async () => {
    const { session } = build([]);
    await expect(session.link(idToken('sub-x', 'a@b.vn', { aud: 'other-client' }))).rejects.toMatchObject({ status: 401 });
  });

  it('tài khoản bị khóa → 403 khi liên kết', async () => {
    const { session } = build([seedUser({ status: 'LOCKED' })]);
    await expect(session.link(idToken('sub-y', 'student001@eventflow.vn'))).rejects.toMatchObject({ status: 403 });
  });
});

describe('ST-036 · cấu hình môi trường', () => {
  const base = { DATABASE_URL: 'postgresql://x', JWT_SECRET: '0123456789abcdef' };

  it.each([
    [undefined, 0],
    ['false', 0],
    ['true', 1],
    ['1', 1],
    ['2', 2],
  ])('TRUST_PROXY=%s → %s lớp proxy', (value, hops) => {
    expect(validateEnv({ ...base, TRUST_PROXY: value }).TRUST_PROXY).toBe(hops);
  });

  it('TRUST_PROXY không hợp lệ → dừng khởi động', () => {
    expect(() => validateEnv({ ...base, TRUST_PROXY: 'abc' })).toThrow();
  });

  it('AUTH_MODE=cognito thiếu cấu hình → dừng khởi động', () => {
    expect(() => validateEnv({ ...base, AUTH_MODE: 'cognito' })).toThrow(/COGNITO_USER_POOL_ID/);
  });

  it('AUTH_MODE=cognito đủ cấu hình → lấy region từ User Pool ID', () => {
    const env = validateEnv({
      ...base,
      AUTH_MODE: 'cognito',
      COGNITO_USER_POOL_ID: POOL_ID,
      COGNITO_CLIENT_ID: CLIENT_ID,
      COGNITO_DOMAIN: 'https://eventflow.auth.ap-southeast-2.amazoncognito.com/',
    });
    expect(env).toMatchObject({ AUTH_MODE: 'cognito', COGNITO_REGION: REGION, COGNITO_DOMAIN: 'https://eventflow.auth.ap-southeast-2.amazoncognito.com' });
  });

  it('mặc định AUTH_MODE=local (máy dev không cần AWS)', () => {
    expect(validateEnv(base).AUTH_MODE).toBe('local');
  });
});
