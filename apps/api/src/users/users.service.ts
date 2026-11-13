import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CreateUserDto,
  ResetPasswordDto,
  UpdateUserDto,
  UserFiltersDto,
} from "./users.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  meta() {
    return Promise.all([
      this.prisma.role.findMany({
        include: { permissions: { include: { permission: true } } },
        orderBy: { name: "asc" },
      }),
      this.prisma.permission.findMany({ orderBy: { code: "asc" } }),
    ]).then(([roles, permissions]) => ({ roles, permissions }));
  }

  async list(filters: UserFiltersDto) {
    const where: Prisma.UserWhereInput = {
      ...(filters.q
        ? {
            OR: [
              { name: { contains: filters.q, mode: "insensitive" as const } },
              { email: { contains: filters.q, mode: "insensitive" as const } },
              {
                employee: {
                  name: { contains: filters.q, mode: "insensitive" as const },
                },
              },
            ],
          }
        : {}),
      ...(filters.role
        ? { roles: { some: { role: { name: filters.role } } } }
        : {}),
      ...(filters.active === undefined ? {} : { active: filters.active }),
    };
    const users = await this.prisma.user.findMany({
      where,
      include: this.include(),
      orderBy: [{ active: "desc" }, { name: "asc" }],
      take: 200,
    });
    return users.map((user) => this.present(user));
  }

  async create(dto: CreateUserDto, actorId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const roles = await this.roles(tx, dto.roleNames);
        const user = await tx.user.create({
          data: {
            name: dto.name.trim(),
            email: dto.email.toLowerCase().trim(),
            phone: dto.phone?.trim(),
            active: dto.active ?? true,
            passwordHash: await argon2.hash(dto.password),
            roles: { create: roles.map((role) => ({ roleId: role.id })) },
          },
        });
        const employee = await this.upsertEmployee(
          tx,
          user.id,
          dto,
          dto.roleNames,
          dto.active ?? true,
        );
        await this.setPermissions(tx, user.id, roles, dto.permissionCodes);
        await tx.auditLog.create({
          data: {
            userId: actorId,
            action: "users.create",
            entityType: "User",
            entityId: user.id,
            after: {
              email: user.email,
              roles: dto.roleNames,
              employeeId: employee?.id ?? null,
            },
          },
        });
        return this.findOne(tx, user.id);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException("El correo ya está registrado");
      throw error;
    }
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({
          where: { id },
          include: { roles: { include: { role: true } }, employee: true },
        });
        if (!existing) throw new NotFoundException("Usuario no encontrado");
        const roleNames =
          dto.roleNames ?? existing.roles.map(({ role }) => role.name);
        const active = dto.active ?? existing.active;
        await this.protectLastAdmin(tx, existing, roleNames, active);
        const roles = await this.roles(tx, roleNames);
        await tx.user.update({
          where: { id },
          data: {
            name: dto.name?.trim(),
            email: dto.email?.toLowerCase().trim(),
            phone: dto.phone?.trim(),
            active,
            sessionVersion: { increment: 1 },
            ...(dto.roleNames
              ? {
                  roles: {
                    deleteMany: {},
                    create: roles.map((role) => ({ roleId: role.id })),
                  },
                }
              : {}),
          },
        });
        await this.upsertEmployee(tx, id, dto, roleNames, active);
        if (dto.permissionCodes)
          await this.setPermissions(tx, id, roles, dto.permissionCodes);
        await tx.auditLog.create({
          data: {
            userId: actorId,
            action: "users.update",
            entityType: "User",
            entityId: id,
            before: {
              name: existing.name,
              email: existing.email,
              active: existing.active,
              roles: existing.roles.map(({ role }) => role.name),
              commissionPercentage:
                existing.employee?.commissionPercentage?.toString() ?? null,
            },
            after: {
              name: dto.name ?? existing.name,
              email: dto.email ?? existing.email,
              active,
              roles: roleNames,
              commissionPercentage:
                dto.commissionPercentage ??
                existing.employee?.commissionPercentage?.toString() ??
                null,
            },
          },
        });
        return this.findOne(tx, id);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException("El correo ya está registrado");
      throw error;
    }
  }

  async resetPassword(id: string, dto: ResetPasswordDto, actorId: string) {
    if (!(await this.prisma.user.count({ where: { id } })))
      throw new NotFoundException("Usuario no encontrado");
    const passwordHash = await argon2.hash(dto.password);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { passwordHash, sessionVersion: { increment: 1 } },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: actorId,
          action: "users.password.reset",
          entityType: "User",
          entityId: id,
        },
      }),
    ]);
    return { ok: true };
  }

  async activity(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { employee: true },
    });
    if (!user) throw new NotFoundException("Usuario no encontrado");
    const employeeAudit = user.employee
      ? [{ entityType: "Employee", entityId: user.employee.id }]
      : [];
    const [
      logs,
      sales,
      receivedRepairs,
      payments,
      assignedRepairs,
      commissions,
    ] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: {
          OR: [
            { userId: id },
            { entityType: "User", entityId: id },
            ...employeeAudit,
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.prisma.sale.count({ where: { userId: id } }),
      this.prisma.repairOrder.count({ where: { receivedById: id } }),
      this.prisma.payment.count({ where: { receivedById: id } }),
      user.employee
        ? this.prisma.repairOrder.count({
            where: { technicianId: user.employee.id },
          })
        : 0,
      user.employee
        ? this.prisma.commissionAllocation.count({
            where: { employeeId: user.employee.id },
          })
        : 0,
    ]);
    return {
      summary: {
        sales,
        receivedRepairs,
        assignedRepairs,
        payments,
        commissions,
      },
      logs,
    };
  }

  private include() {
    return {
      roles: {
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
        },
      },
      permissionOverrides: { include: { permission: true } },
      employee: true,
      _count: { select: { auditLogs: true, repairEvidence: true } },
    } as const;
  }

  private async findOne(tx: Prisma.TransactionClient, id: string) {
    return this.present(
      await tx.user.findUniqueOrThrow({
        where: { id },
        include: this.include(),
      }),
    );
  }

  private present(user: any) {
    const base = new Set<string>(
      user.roles.flatMap(({ role }: any) =>
        role.permissions.map(({ permission }: any) => permission.code),
      ),
    );
    for (const override of user.permissionOverrides)
      override.allowed
        ? base.add(override.permission.code)
        : base.delete(override.permission.code);
    const {
      passwordHash: _passwordHash,
      sessionVersion: _sessionVersion,
      permissionOverrides: _overrides,
      ...safe
    } = user;
    return {
      ...safe,
      roles: user.roles.map(({ role }: any) => ({
        id: role.id,
        name: role.name,
      })),
      permissionCodes: [...base].sort(),
    };
  }

  private async roles(tx: Prisma.TransactionClient, names: string[]) {
    const unique = [...new Set(names)];
    const roles = await tx.role.findMany({
      where: { name: { in: unique } },
      include: { permissions: { include: { permission: true } } },
    });
    if (roles.length !== unique.length)
      throw new BadRequestException("Uno o más roles no existen");
    return roles;
  }

  private async setPermissions(
    tx: Prisma.TransactionClient,
    userId: string,
    roles: any[],
    desired?: string[],
  ) {
    if (!desired) return;
    const permissions = await tx.permission.findMany();
    const valid = new Set(permissions.map((permission) => permission.code));
    if (desired.some((code) => !valid.has(code)))
      throw new BadRequestException("Uno o más permisos no existen");
    const base = new Set<string>(
      roles.flatMap((role) =>
        role.permissions.map(({ permission }: any) => permission.code),
      ),
    );
    const wanted = new Set(desired);
    await tx.userPermission.deleteMany({ where: { userId } });
    const overrides = permissions
      .filter(
        (permission) =>
          base.has(permission.code) !== wanted.has(permission.code),
      )
      .map((permission) => ({
        userId,
        permissionId: permission.id,
        allowed: wanted.has(permission.code),
      }));
    if (overrides.length)
      await tx.userPermission.createMany({ data: overrides });
  }

  private async upsertEmployee(
    tx: Prisma.TransactionClient,
    userId: string,
    dto: CreateUserDto | UpdateUserDto,
    roleNames: string[],
    active: boolean,
  ) {
    const needsEmployee = roleNames.some((role) =>
      ["TECHNICIAN", "SELLER"].includes(role),
    );
    const existing = await tx.employee.findUnique({ where: { userId } });
    if (!needsEmployee && !existing && !dto.position) return null;
    const position =
      dto.position?.trim() ||
      (roleNames.includes("TECHNICIAN")
        ? "Técnico"
        : roleNames.includes("SELLER")
          ? "Vendedor"
          : "Personal");
    const data = {
      name: dto.name?.trim(),
      position,
      active: active && needsEmployee,
      baseSalary: dto.baseSalary,
      commissionPercentage: dto.commissionPercentage,
      commissionBasis: dto.commissionBasis,
      commissionNote: dto.commissionNote?.trim(),
    };
    if (existing)
      return tx.employee.update({ where: { id: existing.id }, data });
    return tx.employee.create({
      data: {
        userId,
        name: dto.name!.trim(),
        position,
        active: active && needsEmployee,
        baseSalary: dto.baseSalary,
        commissionPercentage: dto.commissionPercentage,
        commissionBasis: dto.commissionBasis ?? "CONTRIBUTION_MARGIN",
        commissionNote: dto.commissionNote?.trim(),
      },
    });
  }

  private async protectLastAdmin(
    tx: Prisma.TransactionClient,
    existing: any,
    roleNames: string[],
    active: boolean,
  ) {
    const wasActiveAdmin =
      existing.active &&
      existing.roles.some(({ role }: any) => role.name === "ADMIN");
    if (!wasActiveAdmin || (active && roleNames.includes("ADMIN"))) return;
    if (
      !(await tx.user.count({
        where: {
          id: { not: existing.id },
          active: true,
          roles: { some: { role: { name: "ADMIN" } } },
        },
      }))
    )
      throw new ConflictException(
        "No se puede desactivar ni quitar el rol al último administrador activo",
      );
  }
}
