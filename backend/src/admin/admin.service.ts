import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, PUBLIC_USER_SELECT, PublicUser } from '../auth/auth.types';
import { ListUsersQueryDto } from './dto/admin.dto';

export interface AdminAuditLogItem {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Prisma.JsonValue;
  requestId: string | null;
  createdAt: Date;
  actor: { id: string; name: string; email: string } | null;
}

/**
 * ST-006 (phần 1): Số liệu toàn sàn.
 * Các chỉ số sự kiện/vé/hàng chờ đang là null cho đến khi TV2/TV3/TV4 merge bảng
 * Event, Reservation, WaitlistEntry, Offer — khi đó chỉ cần bổ sung truy vấn trong getOverview().
 */
export interface AdminOverview {
  users: {
    total: number;
    customers: number;
    organizers: number;
    admins: number;
    locked: number;
  };
  totalEvents: number | null;
  confirmedTickets: number | null;
  activeHolds: number | null;
  waitingEntries: number | null;
  offeredEntries: number | null;
  recentAuditLogs: AdminAuditLogItem[];
  generatedAt: Date;
}

export interface PaginatedUsers {
  items: PublicUser[];
  total: number;
  page: number;
  pageSize: number;
}

/** Tên action ghi vào audit_logs — các module khác có thể bổ sung action riêng. */
export const AuditAction = {
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_LOCKED: 'USER_LOCKED',
  USER_UNLOCKED: 'USER_UNLOCKED',
} as const;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(): Promise<AdminOverview> {
    const [byRole, locked, recentAuditLogs] = await this.prisma.$transaction([
      this.prisma.user.groupBy({ by: ['role'], orderBy: { role: 'asc' }, _count: { _all: true } }),
      this.prisma.user.count({ where: { status: 'LOCKED' } }),
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          action: true,
          targetType: true,
          targetId: true,
          details: true,
          requestId: true,
          createdAt: true,
          actor: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    const countOf = (role: UserRole): number => {
      const row = byRole.find((r) => r.role === role);
      const count = row?._count;
      return typeof count === 'object' && count ? (count._all ?? 0) : 0;
    };
    const customers = countOf('CUSTOMER');
    const organizers = countOf('ORGANIZER');
    const admins = countOf('ADMIN');

    return {
      users: { total: customers + organizers + admins, customers, organizers, admins, locked },
      // TODO (ST-006 phần 2): thay null bằng truy vấn thật sau khi có bảng Event/Reservation/Waitlist/Offer.
      totalEvents: null,
      confirmedTickets: null,
      activeHolds: null,
      waitingEntries: null,
      offeredEntries: null,
      recentAuditLogs,
      generatedAt: new Date(),
    };
  }

  async listUsers(query: ListUsersQueryDto): Promise<PaginatedUsers> {
    const where: Prisma.UserWhereInput = {};
    if (query.role) where.role = query.role;
    if (query.status) where.status = query.status;
    if (query.q) {
      where.OR = [
        { email: { contains: query.q, mode: 'insensitive' } },
        { name: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: PUBLIC_USER_SELECT,
        orderBy: [{ createdAt: 'asc' }, { email: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** ST-005: Đổi vai trò (vd. nâng Student lên Organizer). Cập nhật + audit log trong cùng transaction. */
  async updateRole(
    actor: AuthUser,
    targetId: string,
    role: UserRole,
    requestId: string | null
  ): Promise<PublicUser> {
    if (targetId === actor.id) {
      throw new BadRequestException('Bạn không thể tự thay đổi vai trò của chính mình.');
    }

    return this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({
        where: { id: targetId },
        select: PUBLIC_USER_SELECT,
      });
      if (!target) throw new NotFoundException('Không tìm thấy người dùng.');
      if (target.role === role) return target;

      const updated = await tx.user.update({
        where: { id: targetId },
        data: { role },
        select: PUBLIC_USER_SELECT,
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: AuditAction.USER_ROLE_CHANGED,
          targetType: 'USER',
          targetId,
          details: { email: target.email, from: target.role, to: role },
          requestId,
        },
      });
      return updated;
    });
  }

  /** ST-005: Khóa / mở khóa tài khoản. Cập nhật + audit log trong cùng transaction. */
  async updateStatus(
    actor: AuthUser,
    targetId: string,
    status: UserStatus,
    requestId: string | null
  ): Promise<PublicUser> {
    if (targetId === actor.id) {
      throw new BadRequestException('Bạn không thể tự khóa hoặc mở khóa tài khoản của chính mình.');
    }

    return this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({
        where: { id: targetId },
        select: PUBLIC_USER_SELECT,
      });
      if (!target) throw new NotFoundException('Không tìm thấy người dùng.');
      if (target.status === status) return target;

      const updated = await tx.user.update({
        where: { id: targetId },
        data: { status },
        select: PUBLIC_USER_SELECT,
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: status === 'LOCKED' ? AuditAction.USER_LOCKED : AuditAction.USER_UNLOCKED,
          targetType: 'USER',
          targetId,
          details: { email: target.email, from: target.status, to: status },
          requestId,
        },
      });
      return updated;
    });
  }
}
