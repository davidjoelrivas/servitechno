import { Module } from "@nestjs/common";
import { FinanceService } from "../operations/finance.service";
import { ProcurementController } from "./procurement.controller";
import { ProcurementService } from "./procurement.service";

@Module({
  controllers: [ProcurementController],
  providers: [ProcurementService, FinanceService],
  exports: [ProcurementService],
})
export class ProcurementModule {}
