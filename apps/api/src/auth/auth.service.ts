import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./auth.dto";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
        permissionOverrides: { include: { permission: true } },
      },
    });
    if (
      !user?.active ||
      !(await argon2.verify(user.passwordHash, dto.password))
    ) {
      throw new UnauthorizedException("Correo o contraseña incorrectos");
    }
    const roles = user.roles.map(({ role }) => role.name);
    const permissionSet = new Set(
      user.roles.flatMap(({ role }) =>
        role.permissions.map((rp) => rp.permission.code),
      ),
    );
    for (const override of user.permissionOverrides)
      override.allowed
        ? permissionSet.add(override.permission.code)
        : permissionSet.delete(override.permission.code);
    const permissions = [...permissionSet];
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      roles,
      permissions,
      sessionVersion: user.sessionVersion,
    };
    return {
      accessToken: await this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow("JWT_SECRET"),
        expiresIn: (this.config.get<string>("JWT_EXPIRES_IN") ??
          "8h") as JwtSignOptions["expiresIn"],
      }),
      user: payload,
    };
  }
}
