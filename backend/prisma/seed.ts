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
          update: {},
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

interface SeedEventInput {
  slug: string;
  title: string;
  category: string;
  description: string;
  venue: string;
  address: string;
  city: string;
  poster: string;
  priceVnd: number;
  daysFromNow: number;
  durationDaysBeforeClose?: number;
  capacity: number;
  reservedCount: number;
  soldCount: number;
  organizerEmail: 'organizer01@eventflow.vn' | 'organizer02@eventflow.vn';
  featured: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function buildSeedEvents(): SeedEventInput[] {
  return [
    {
      slug: 'eventflow-load-test-concert-2026',
      title: 'Đêm Nhạc Indie Sinh Viên — Phiên Bản Test Tải',
      category: 'Âm nhạc',
      description:
        'Sự kiện chuẩn 20 ghế trống phục vụ kiểm thử tải đồng thời (100 người dùng đặt vé cùng lúc).',
      venue: 'Nhà Văn Hóa Sinh Viên',
      address: 'Khu đô thị ĐHQG, Phường Đông Hòa, TP. Dĩ An',
      city: 'TP. Hồ Chí Minh',
      poster: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?auto=format&fit=crop&w=1200&q=80',
      priceVnd: 150000,
      daysFromNow: 10,
      capacity: 20,
      reservedCount: 0,
      soldCount: 0,
      organizerEmail: 'organizer01@eventflow.vn',
      featured: true,
    },
    {
      slug: 'workshop-cloud-waitlist-sold-out-2026',
      title: 'Workshop Kiến Trúc Cloud & Distributed Systems (Hết vé)',
      category: 'Công nghệ',
      description:
        'Sự kiện đã bán hết 20/20 vé để kiểm thử luồng đăng ký hàng chờ FIFO và Expiring Offer.',
      venue: 'Không Gian Sáng Tạo Saigon Innovation Hub',
      address: '273 Điện Biên Phủ, Quận 3',
      city: 'TP. Hồ Chí Minh',
      poster: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80',
      priceVnd: 250000,
      daysFromNow: 14,
      capacity: 20,
      reservedCount: 0,
      soldCount: 20,
      organizerEmail: 'organizer01@eventflow.vn',
      featured: true,
    },
    {
      slug: 'hanoi-tech-summit-2026',
      title: 'Hanoi Tech & AI Summit 2026',
      category: 'Hội thảo',
      description:
        'Hội thảo chuyên sâu về Trí tuệ nhân tạo, Cloud Native và bảo mật hệ thống quy mô lớn.',
      venue: 'Trung Tâm Hội Nghị Quốc Gia',
      address: 'Đại lộ Thăng Long, Mễ Trì, Nam Từ Liêm',
      city: 'Hà Nội',
      poster: 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=1200&q=80',
      priceVnd: 500000,
      daysFromNow: 21,
      capacity: 200,
      reservedCount: 5,
      soldCount: 85,
      organizerEmail: 'organizer02@eventflow.vn',
      featured: true,
    },
    {
      slug: 'danang-acoustic-night-2026',
      title: 'Đêm Nhạc Acoustic Bên Bờ Sông Hàn',
      category: 'Âm nhạc',
      description:
        'Không gian âm nhạc acoustic ngoài trời với các ban nhạc trẻ và nghệ sĩ khách mời.',
      venue: 'Công Viên Bờ Đông Cầu Rồng',
      address: 'Đường Trần Hưng Đạo, Sơn Trà',
      city: 'Đà Nẵng',
      poster: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=80',
      priceVnd: 350000,
      daysFromNow: 18,
      capacity: 150,
      reservedCount: 2,
      soldCount: 60,
      organizerEmail: 'organizer02@eventflow.vn',
      featured: false,
    },
    {
      slug: 'dalat-contemporary-art-exhibition-2026',
      title: 'Triển Lãm Nghệ Thuật Đương Đại — Sắc Màu Cao Nguyên',
      category: 'Nghệ thuật',
      description:
        'Triển lãm tranh, điêu khắc và nghệ thuật sắp đặt ánh sáng dành cho người yêu nghệ thuật.',
      venue: 'Bảo Tàng Nghệ Thuật Đà Lạt',
      address: '04 Hùng Vương, Phường 10',
      city: 'Đà Lạt',
      poster: 'https://images.unsplash.com/photo-1518998053901-5348d3961a04?auto=format&fit=crop&w=1200&q=80',
      priceVnd: 0,
      daysFromNow: 25,
      capacity: 120,
      reservedCount: 0,
      soldCount: 40,
      organizerEmail: 'organizer01@eventflow.vn',
      featured: false,
    },
    {
      slug: 'saigon-night-run-10k-2026',
      title: 'Giải Chạy Đêm Saigon Night Run 10K',
      category: 'Thể thao',
      description:
        'Giải chạy phong trào qua các cung đường trung tâm thành phố vào ban đêm.',
      venue: 'Khu Đô Thị Sala',
      address: '10 Mai Chí Thọ, TP. Thủ Đức',
      city: 'TP. Hồ Chí Minh',
      poster: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1200&q=80',
      priceVnd: 750000,
      daysFromNow: 30,
      capacity: 300,
      reservedCount: 10,
      soldCount: 140,
      organizerEmail: 'organizer02@eventflow.vn',
      featured: true,
    },
    {
      slug: 'cantho-mekong-food-festival-2026',
      title: 'Lễ Hội Ẩm Thực Miền Tây — Hương Vị Phù Sa',
      category: 'Ẩm thực',
      description:
        'Khám phá hơn 50 gian hàng đặc sản đồng bằng sông Cửu Long cùng các màn trình diễn dân gian.',
      venue: 'Bến Ninh Kiều',
      address: 'Đường Hai Bà Trưng, Tân An, Ninh Kiều',
      city: 'Cần Thơ',
      poster: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1200&q=80',
      priceVnd: 100000,
      daysFromNow: 35,
      capacity: 250,
      reservedCount: 0,
      soldCount: 75,
      organizerEmail: 'organizer01@eventflow.vn',
      featured: false,
    },
    {
      slug: 'hanoi-career-bootcamp-2026',
      title: 'Bootcamp Định Hướng Nghề Nghiệp Kỹ Sư Phần Mềm',
      category: 'Giáo dục',
      description:
        'Chương trình chia sẻ kinh nghiệm phỏng vấn, thiết kế hệ thống và phát triển sự nghiệp IT.',
      venue: 'Đại Học Bách Khoa Hà Nội — Hội Trường C2',
      address: '01 Đại Cồ Việt, Hai Bà Trưng',
      city: 'Hà Nội',
      poster: 'https://images.unsplash.com/photo-1523580494863-6f3031224c94?auto=format&fit=crop&w=1200&q=80',
      priceVnd: 1200000,
      daysFromNow: 42,
      capacity: 80,
      reservedCount: 4,
      soldCount: 30,
      organizerEmail: 'organizer02@eventflow.vn',
      featured: false,
    },
  ];
}

/**
 * ST-008 — Seed 8 sự kiện mẫu đa dạng category, city, thời gian và priceVnd.
 * Dùng upsert theo slug để chạy lại nhiều lần không tạo bản ghi trùng.
 */
async function seedEvents(): Promise<void> {
  const [organizer01, organizer02] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { email: 'organizer01@eventflow.vn' },
      select: { id: true },
    }),
    prisma.user.findUniqueOrThrow({
      where: { email: 'organizer02@eventflow.vn' },
      select: { id: true },
    }),
  ]);

  const organizerMap: Record<SeedEventInput['organizerEmail'], string> = {
    'organizer01@eventflow.vn': organizer01.id,
    'organizer02@eventflow.vn': organizer02.id,
  };

  const now = Date.now();
  const events = buildSeedEvents();

  await prisma.$transaction(
    events.map((ev) => {
      const startsAt = new Date(now + ev.daysFromNow * DAY_MS);
      const salesCloseAt = new Date(
        startsAt.getTime() - (ev.durationDaysBeforeClose ?? 1) * DAY_MS
      );
      const organizerId = organizerMap[ev.organizerEmail];

      const payload = {
        slug: ev.slug,
        title: ev.title,
        category: ev.category,
        description: ev.description,
        venue: ev.venue,
        address: ev.address,
        city: ev.city,
        poster: ev.poster,
        priceVnd: ev.priceVnd,
        startsAt,
        salesCloseAt,
        capacity: ev.capacity,
        reservedCount: ev.reservedCount,
        soldCount: ev.soldCount,
        organizerId,
        nextWaitlistSeq: 1,
        featured: ev.featured,
      };

      return prisma.event.upsert({
        where: { slug: ev.slug },
        update: {},
        create: payload,
      });
    })
  );

  const total = await prisma.event.count({
    where: { slug: { in: events.map((e) => e.slug) } },
  });
  process.stdout.write(`[seed] Events: ${total}/${events.length} sự kiện mẫu\n`);
}

async function main(): Promise<void> {
  await prisma.appHealth.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  await seedUsers();
  await seedEvents();
}

main()
  .catch((err) => {
    process.stderr.write(`Seed failed: ${String(err)}\n`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
