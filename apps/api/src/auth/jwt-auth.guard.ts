import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { IS_PUBLIC_KEY } from "./public.decorator";
import type { AuthUser } from "./current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwt: JwtService,
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: AuthUser }>();
    const [kind, token] = request.headers.authorization?.split(" ") ?? [];
    if (kind !== "Bearer" || !token)
      throw new UnauthorizedException("Sesión requerida");
    try {
      const payload = this.jwt.verify<AuthUser>(token, {
        secret: this.config.getOrThrow("JWT_SECRET"),
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { active: true, sessionVersion: true },
      });
      if (!user?.active || user.sessionVersion !== payload.sessionVersion)
        throw new UnauthorizedException("Sesión revocada");
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException("Sesión inválida o vencida");
    }
  }
}
