import { Module } from "@nestjs/common";
import { OperationsController } from "./operations.controller";
import { OperationsService } from "./operations.service";
import { FinanceService } from "./finance.service";
import { DocumentsModule } from "../documents/documents.module";

@Module({
  imports: [DocumentsModule],
  controllers: [OperationsController],
  providers: [OperationsService, FinanceService],
  exports: [OperationsService],
})
export class OperationsModule {}
