import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { PermissionsGuard } from "./auth/permissions.guard";
import { AuthModule } from "./auth/auth.module";
import { HealthController } from "./health.controller";
import { OperationsModule } from "./operations/operations.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ReturnsModule } from "./returns/returns.module";
import { ProcurementModule } from "./procurement/procurement.module";
import { CommissionsModule } from "./commissions/commissions.module";
import { DocumentsModule } from "./documents/documents.module";
import { PerformanceModule } from "./performance/performance.module";
import { EvidenceModule } from "./evidence/evidence.module";
import { UsersModule } from "./users/users.module";
import { AssistantModule } from "./assistant/assistant.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    DocumentsModule,
    PerformanceModule,
    EvidenceModule,
    UsersModule,
    AssistantModule,
    OperationsModule,
    ReturnsModule,
    ProcurementModule,
    CommissionsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
