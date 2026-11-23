#!/usr/bin/env node
/**
 * ST-037: Kiểm thử quyền truy cập trực tiếp vào API.
 *
 * Gọi thẳng các đường dẫn xử lý trên máy chủ bằng tài khoản thử (không qua giao diện web)
 * rồi so mã phản hồi HTTP với kết quả mong đợi. Kết quả xuất thành bảng Markdown.
 * Bảng CHỈ lưu mã phản hồi — không in/ghi access token, ID token hay mật khẩu.
 *
 * Cách chạy (Node 18+ — không cần cài thêm thư viện):
 *   node scripts/st037-access-check.mjs
 *   node scripts/st037-access-check.mjs --base https://<preview-url> --out ../ST-037-ket-qua.md
 *
 * Biến môi trường:
 *   API_BASE        Gốc API, mặc định http://127.0.0.1:4000 (script tự thêm /api)
 *   TEST_PASSWORD   Mật khẩu tài khoản thử, mặc định lấy SEED_PASSWORD hoặc "Eventflow@123"
 *   ADMIN_PASSWORD  Mật khẩu admin (để trống = TEST_PASSWORD)
 *   STUDENT_EMAIL / ORG_A_EMAIL / ORG_B_EMAIL / ADMIN_EMAIL  Đổi tài khoản thử nếu cần
 *
 * Chế độ đăng nhập được tự nhận biết qua GET /api/auth/config:
 *   - local   → POST /api/auth/login
 *   - cognito → Cognito InitiateAuth (USER_PASSWORD_AUTH) rồi POST /api/auth/cognito/session.
 *               Cần bật tạm enable_password_auth_flow = true ở module infra/modules/auth-access.
 */
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// ------------------------------------------------------------------ cấu hình
const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const BASE = (argValue('--base') ?? process.env.API_BASE ?? 'http://127.0.0.1:4000').replace(/\/+$/, '');
const API = BASE.endsWith('/api') ? BASE : `${BASE}/api`;
const OUT = argValue('--out') ?? process.env.OUT_FILE ?? null;
const PASSWORD = process.env.TEST_PASSWORD || process.env.SEED_PASSWORD || 'Eventflow@123';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD || PASSWORD;

const ACCOUNTS = {
  student: { label: 'Sinh viên', email: process.env.STUDENT_EMAIL || 'student001@eventflow.vn', password: PASSWORD },
  orgA: { label: 'BTC A', email: process.env.ORG_A_EMAIL || 'organizer01@eventflow.vn', password: PASSWORD },
  orgB: { label: 'BTC B', email: process.env.ORG_B_EMAIL || 'organizer02@eventflow.vn', password: PASSWORD },
  admin: { label: 'Quản trị viên', email: process.env.ADMIN_EMAIL || 'admin@eventflow.vn', password: ADMIN_PASSWORD },
};

// ------------------------------------------------------------------ HTTP
async function call(method, path, { token, body, headers = {} } = {}) {
  const h = { Accept: 'application/json, text/csv', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* CSV hoặc rỗng */
  }
  return { status: res.status, json, text, contentType: res.headers.get('content-type') ?? '' };
}

// ------------------------------------------------------------------ đăng nhập
async function loginLocal(acc) {
  const r = await call('POST', '/auth/login', { body: { email: acc.email, password: acc.password } });
  if (r.status !== 200 || !r.json?.accessToken) {
    throw new Error(`Đăng nhập ${acc.email} thất bại (HTTP ${r.status}): ${r.json?.message ?? ''}`);
  }
  return { token: r.json.accessToken, user: r.json.user };
}

async function loginCognito(acc, cognito) {
  const res = await fetch(`https://cognito-idp.${cognito.region}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: cognito.clientId,
      AuthParameters: { USERNAME: acc.email, PASSWORD: acc.password },
    }),
  });
  const data = await res.json().catch(() => ({}));
  const result = data.AuthenticationResult;
  if (!res.ok || !result?.AccessToken) {
    const hint =
      data.__type?.includes('InvalidParameter') || data.message?.includes('USER_PASSWORD_AUTH')
        ? ' (hãy bật enable_password_auth_flow = true cho app client)'
        : '';
    throw new Error(`Cognito từ chối ${acc.email}: ${data.__type ?? res.status} ${data.message ?? ''}${hint}`);
  }
  // Liên kết/tra cứu tài khoản trong bảng users (lần đầu sẽ gắn cognito_sub theo email).
  const link = await call('POST', '/auth/cognito/session', { body: { idToken: result.IdToken } });
  if (link.status !== 200 || !link.json?.user) {
    throw new Error(`Liên kết ${acc.email} thất bại (HTTP ${link.status}): ${link.json?.message ?? ''}`);
  }
  return { token: result.AccessToken, user: link.json.user };
}

// ------------------------------------------------------------------ kiểm thử
const results = [];

/**
 * @param {string} who      Tài khoản thử (nhãn hiển thị)
 * @param {string} action   Mô tả thao tác bằng tiếng Việt
 * @param {string} method
 * @param {string} path     Đường dẫn hiển thị trong bảng (đã thay ID bằng tên gợi nhớ)
 * @param {object} opts     { token, body, headers, realPath, expect, check }
 */
async function check(who, action, method, path, opts) {
  const { expect, realPath = path, check: extra, ...req } = opts;
  let status;
  let note = '';
  try {
    const r = await call(method, realPath, req);
    status = r.status;
    if (extra && r.status === expect) {
      const problem = extra(r);
      if (problem) note = problem;
    }
  } catch (err) {
    status = 'Lỗi mạng';
    note = err instanceof Error ? err.message : String(err);
  }
  const pass = status === expect && !note;
  results.push({ who, action, method, path, expect, status, pass, note });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`${mark}  [${who}] ${method} ${path} → ${status} (mong đợi ${expect})${note ? ` — ${note}` : ''}`);
}

const STATUS_TEXT = { 200: 'OK', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found' };
const fmt = (s) => (typeof s === 'number' ? `${s} ${STATUS_TEXT[s] ?? ''}`.trim() : s);

async function main() {
  console.log(`ST-037 · Kiểm thử quyền truy cập trực tiếp\nAPI: ${API}\n`);

  const health = await call('GET', '/health').catch((e) => ({ status: 0, error: e }));
  if (health.status !== 200) {
    const cause = health.error?.cause?.code ?? health.error?.message ?? health.status;
    throw new Error(`Không gọi được ${API}/health (${cause}). Backend đã chạy chưa?`);
  }
  const cfg = await call('GET', '/auth/config');
  const mode = cfg.json?.mode === 'cognito' ? 'cognito' : 'local';
  console.log(`Chế độ đăng nhập: ${mode}\n`);

  const sessions = {};
  for (const [key, acc] of Object.entries(ACCOUNTS)) {
    sessions[key] = mode === 'cognito' ? await loginCognito(acc, cfg.json.cognito) : await loginLocal(acc);
    const role = sessions[key].user.role;
    console.log(`Đăng nhập ${acc.label}: ${acc.email} → vai trò ${role}`);
  }
  const expectedRoles = { student: 'CUSTOMER', orgA: 'ORGANIZER', orgB: 'ORGANIZER', admin: 'ADMIN' };
  for (const [key, role] of Object.entries(expectedRoles)) {
    if (sessions[key].user.role !== role) {
      throw new Error(`${ACCOUNTS[key].email} có vai trò ${sessions[key].user.role}, cần ${role}. Hãy chạy lại seed.`);
    }
  }

  // Lấy một sự kiện của BTC A và một của BTC B bằng chính tài khoản của họ.
  const eventsOf = async (s) => {
    const r = await call('GET', '/organizer/events', { token: s.token });
    return Array.isArray(r.json) ? r.json : [];
  };
  const evA = (await eventsOf(sessions.orgA))[0];
  const evB = (await eventsOf(sessions.orgB))[0];
  if (!evA || !evB) throw new Error('BTC A hoặc BTC B chưa có sự kiện nào. Hãy chạy seed (pnpm prisma db seed).');
  console.log(`\nSự kiện A: ${evA.title} (${evA.id})\nSự kiện B: ${evB.title} (${evB.id})\n`);

  const t = Object.fromEntries(Object.entries(sessions).map(([k, s]) => [k, s.token]));
  const studentId = sessions.student.user.id;
  const csv = (id) => `/organizer/events/${id}/attendees/csv`;
  const isCsv = (r) => (r.contentType.includes('text/csv') ? null : `Content-Type là "${r.contentType}", không phải CSV`);
  const onlyOwn = (ownerId) => (r) =>
    Array.isArray(r.json) && r.json.every((e) => e.organizerId === ownerId)
      ? null
      : 'Danh sách có sự kiện của BTC khác';

  // 1) Chưa đăng nhập
  const anon = 'Chưa đăng nhập';
  await check(anon, 'Xem hồ sơ cá nhân', 'GET', '/users/me', { expect: 401 });
  await check(anon, 'Xem vé của tôi', 'GET', '/reservations/me', { expect: 401 });
  await check(anon, 'Vào kênh Ban tổ chức', 'GET', '/organizer/events', { expect: 401 });
  await check(anon, 'Tải danh sách người tham dự (CSV)', 'GET', csv('{sự kiện A}'), { realPath: csv(evA.id), expect: 401 });
  await check(anon, 'Xem trang quản trị', 'GET', '/admin/overview', { expect: 401 });
  await check(anon, 'Dùng token giả mạo', 'GET', '/admin/users', {
    token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJoYWNrIn0.invalid',
    expect: 401,
  });
  await check(anon, 'Gọi tác vụ nội bộ không có khoá bí mật', 'POST', '/internal/jobs/expire-sweep', { expect: 401 });

  // 2) Sinh viên
  const st = `Sinh viên (${ACCOUNTS.student.email})`;
  await check(st, 'Xem hồ sơ cá nhân', 'GET', '/users/me', { token: t.student, expect: 200 });
  await check(st, 'Xem tổng quan quản trị', 'GET', '/admin/overview', { token: t.student, expect: 403 });
  await check(st, 'Xem danh sách người dùng', 'GET', '/admin/users', { token: t.student, expect: 403 });
  await check(st, 'Gọi API đổi vai trò người dùng', 'PATCH', '/admin/users/{chính mình}/role', {
    realPath: `/admin/users/${studentId}/role`,
    token: t.student,
    body: { role: 'CUSTOMER' },
    expect: 403,
  });
  await check(st, 'Vào kênh Ban tổ chức', 'GET', '/organizer/events', { token: t.student, expect: 403 });
  await check(st, 'Tải danh sách người tham dự (CSV)', 'GET', csv('{sự kiện A}'), {
    realPath: csv(evA.id),
    token: t.student,
    expect: 403,
  });

  // 3) Quản trị viên
  const ad = `Quản trị viên (${ACCOUNTS.admin.email})`;
  await check(ad, 'Xem tổng quan quản trị', 'GET', '/admin/overview', { token: t.admin, expect: 200 });
  await check(ad, 'Xem danh sách người dùng', 'GET', '/admin/users', { token: t.admin, expect: 200 });
  await check(ad, 'Tải CSV sự kiện của BTC A', 'GET', csv('{sự kiện A}'), {
    realPath: csv(evA.id), token: t.admin, expect: 200, check: isCsv,
  });
  await check(ad, 'Tải CSV sự kiện của BTC B', 'GET', csv('{sự kiện B}'), {
    realPath: csv(evB.id), token: t.admin, expect: 200, check: isCsv,
  });

  // 4) Ban tổ chức A — đúng sự kiện của mình được, của B bị chặn
  const a = `BTC A (${ACCOUNTS.orgA.email})`;
  await check(a, 'Xem danh sách sự kiện (chỉ thấy của mình)', 'GET', '/organizer/events', {
    token: t.orgA, expect: 200, check: onlyOwn(sessions.orgA.user.id),
  });
  await check(a, 'Xem người tham dự sự kiện A', 'GET', '/organizer/events/{sự kiện A}/attendees', {
    realPath: `/organizer/events/${evA.id}/attendees`, token: t.orgA, expect: 200,
  });
  await check(a, 'Tải CSV người tham dự sự kiện A', 'GET', csv('{sự kiện A}'), {
    realPath: csv(evA.id), token: t.orgA, expect: 200, check: isCsv,
  });
  await check(a, 'Tải CSV người tham dự sự kiện B', 'GET', csv('{sự kiện B}'), {
    realPath: csv(evB.id), token: t.orgA, expect: 403,
  });
  await check(a, 'Xem người tham dự sự kiện B', 'GET', '/organizer/events/{sự kiện B}/attendees', {
    realPath: `/organizer/events/${evB.id}/attendees`, token: t.orgA, expect: 403,
  });
  await check(a, 'Xem danh sách chờ sự kiện B', 'GET', '/organizer/events/{sự kiện B}/waitlist', {
    realPath: `/organizer/events/${evB.id}/waitlist`, token: t.orgA, expect: 403,
  });
  await check(a, 'Sửa sự kiện B', 'PATCH', '/organizer/events/{sự kiện B}', {
    realPath: `/organizer/events/${evB.id}`, token: t.orgA, body: {}, expect: 403,
  });
  await check(a, 'Tải CSV của sự kiện không tồn tại', 'GET', csv('{UUID ngẫu nhiên}'), {
    realPath: csv(randomUUID()), token: t.orgA, expect: 404,
  });
  await check(a, 'Xem tổng quan quản trị', 'GET', '/admin/overview', { token: t.orgA, expect: 403 });

  // 5) Ban tổ chức B — chiều ngược lại
  const b = `BTC B (${ACCOUNTS.orgB.email})`;
  await check(b, 'Tải CSV người tham dự sự kiện B', 'GET', csv('{sự kiện B}'), {
    realPath: csv(evB.id), token: t.orgB, expect: 200, check: isCsv,
  });
  await check(b, 'Tải CSV người tham dự sự kiện A', 'GET', csv('{sự kiện A}'), {
    realPath: csv(evA.id), token: t.orgB, expect: 403,
  });

  // ------------------------------------------------------------ báo cáo
  const passed = results.filter((r) => r.pass).length;
  const now = new Date();
  const md = [
    '# ST-037 · Kết quả kiểm thử quyền truy cập trực tiếp vào API',
    '',
    `- Thời điểm chạy: ${now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} (giờ Việt Nam)`,
    `- API: \`${API}\` · chế độ đăng nhập: \`${mode}\``,
    `- Sự kiện A (của BTC A): ${evA.title} · Sự kiện B (của BTC B): ${evB.title}`,
    `- Kết quả: **${passed}/${results.length} trường hợp đạt**`,
    '- Bảng chỉ ghi mã phản hồi HTTP; không lưu access token, ID token hay mật khẩu.',
    '',
    '| # | Tài khoản thử | Thao tác | Yêu cầu | Mong đợi | Thực tế | Đạt |',
    '|---|---|---|---|---|---|---|',
    ...results.map(
      (r, i) =>
        `| ${i + 1} | ${r.who} | ${r.action} | \`${r.method} /api${r.path}\` | ${fmt(r.expect)} | ${fmt(r.status)}${
          r.note ? ` — ${r.note}` : ''
        } | ${r.pass ? '✅' : '❌'} |`,
    ),
    '',
  ].join('\n');

  console.log(`\nKết quả: ${passed}/${results.length} đạt`);
  if (OUT) {
    writeFileSync(OUT, md, 'utf8');
    console.log(`Đã ghi bảng minh chứng: ${OUT}`);
  } else {
    console.log('\n' + md);
  }
  process.exitCode = passed === results.length ? 0 : 1;
}

main().catch((err) => {
  console.error(`\nDừng kiểm thử: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 2;
});
