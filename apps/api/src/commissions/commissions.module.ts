import { Module } from "@nestjs/common";
import { FinanceService } from "../operations/finance.service";
import { CommissionsController } from "./commissions.controller";
import { CommissionsService } from "./commissions.service";

@Module({ controllers: [CommissionsController], providers: [CommissionsService, FinanceService] })
export class CommissionsModule {}
