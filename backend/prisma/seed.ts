import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * ST-001 — Seed tài khoản chuẩn cho cả nhóm.
 * - 100 Student (CUSTOMER): student001@eventflow.vn → student100@eventflow.vn
 * - 2 Organizer: organizer01@eventflow.vn, organizer02@eventflow.vn
 * - 1 Admin: admin@eventflow.vn
 * Mật khẩu: Student + Organizer dùng SEED_PASSWORD (mặc định "Eventflow@123");
 * Admin dùng SEED_ADMIN_PASSWORD (nếu không đặt thì dùng SEED_PASSWORD). Khi deploy thật,
 * đặt 2 biến này bằng mật khẩu mạnh (lưu trong AWS Secrets Manager), không dùng mặc định.
 * Email seed là địa chỉ giả nên được đánh dấu sẵn "đã xác thực" (không cần OTP).
 * Dùng upsert theo email nên chạy lại bao nhiêu lần cũng không lỗi trùng khóa
 * và luôn đưa các tài khoản demo về trạng thái chuẩn (ACTIVE, đúng role, đúng mật khẩu).
 */
const SALT_ROUNDS = 10;
const STUDENT_COUNT = 100;

interface SeedUser {
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
}

function buildSeedUsers(): SeedUser[] {
  const users: SeedUser[] = [];
  for (let i = 1; i <= STUDENT_COUNT; i++) {
    const no = String(i).padStart(3, '0');
    users.push({
      name: `Sinh viên ${no}`,
      email: `student${no}@eventflow.vn`,
      role: UserRole.CUSTOMER,
    });
  }
  users.push(
    { name: 'Ban tổ chức 01', email: 'organizer01@eventflow.vn', role: UserRole.ORGANIZER },
    { name: 'Ban tổ chức 02', email: 'organizer02@eventflow.vn', role: UserRole.ORGANIZER },
    { name: 'Quản trị viên', email: 'admin@eventflow.vn', role: UserRole.ADMIN }
  );
  return users;
}

async function seedUsers(): Promise<void> {
  const password = process.env.SEED_PASSWORD || 'Eventflow@123';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || password;
  // Cùng một mật khẩu → hash một lần rồi dùng lại, seed 103 tài khoản chỉ mất vài trăm ms.
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const adminPasswordHash =
    adminPassword === password ? passwordHash : await bcrypt.hash(adminPassword, SALT_ROUNDS);
  const verifiedAt = new Date();
  const users = buildSeedUsers();

  // Chia lô để không mở quá nhiều kết nối cùng lúc.
  const BATCH = 20;
  for (let i = 0; i < users.length; i += BATCH) {
    await prisma.$transaction(
      users.slice(i, i + BATCH).map((u) => {
        const hash = u.role === UserRole.ADMIN ? adminPasswordHash : passwordHash;
        return prisma.user.upsert({
          where: { email: u.email },
          update: {
            name: u.name,
            role: u.role,
            status: UserStatus.ACTIVE,
            passwordHash: hash,
            emailVerifiedAt: verifiedAt,
          },
          create: { ...u, status: UserStatus.ACTIVE, passwordHash: hash, emailVerifiedAt: verifiedAt },
        });
      })
    );
  }

  const total = await prisma.user.count({
    where: { email: { in: users.map((u) => u.email) } },
  });
  process.stdout.write(
    `[seed] Users: ${total}/${users.length} tài khoản chuẩn (mật khẩu: SEED_PASSWORD)\n`
  );
}

async function main(): Promise<void> {
  await prisma.appHealth.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  await seedUsers();
  // TODO (ST-008 - TV2): Bổ sung seed 8 sự kiện mẫu (có sự kiện 20 ghế cho test tải 100 người).
}

main()
  .catch((err) => {
    process.stderr.write(`Seed failed: ${String(err)}\n`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
