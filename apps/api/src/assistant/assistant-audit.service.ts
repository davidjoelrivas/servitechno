import { Injectable } from "@nestjs/common";
import { Prisma, type AuditLog } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AssistantAuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: {
    userId: string;
    action: string;
    entityType: string;
    entityId?: string;
    after?: Prisma.InputJsonValue;
  }): Promise<AuditLog> {
    return this.prisma.auditLog.create({ data: input });
  }
}

