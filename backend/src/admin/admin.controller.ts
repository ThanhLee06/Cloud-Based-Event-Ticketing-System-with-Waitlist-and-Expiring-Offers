import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser, PublicUser } from '../auth/auth.types';
import { CurrentUser, RequestId } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminOverview, AdminService, PaginatedUsers } from './admin.service';
import { ListUsersQueryDto, UpdateUserRoleDto, UpdateUserStatusDto } from './dto/admin.dto';

/** ST-005: API chỉ dành cho ADMIN. Customer/Organizer gọi vào → 403. */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /** ST-006 (phần 1): Tổng quan toàn sàn + 50 audit log gần nhất. */
  @Get('overview')
  getOverview(): Promise<AdminOverview> {
    return this.admin.getOverview();
  }

  @Get('users')
  listUsers(@Query() query: ListUsersQueryDto): Promise<PaginatedUsers> {
    return this.admin.listUsers(query);
  }

  @Patch('users/:id/role')
  updateRole(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateUserRoleDto,
    @RequestId() requestId: string | null
  ): Promise<PublicUser> {
    return this.admin.updateRole(actor, id, dto.role, requestId);
  }

  @Patch('users/:id/status')
  updateStatus(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateUserStatusDto,
    @RequestId() requestId: string | null
  ): Promise<PublicUser> {
    return this.admin.updateStatus(actor, id, dto.status, requestId);
  }

  // TODO (ST-006 phần 2): POST /admin/events/:id/force-close — làm sau khi TV2 merge bảng Event (ST-008).
}
