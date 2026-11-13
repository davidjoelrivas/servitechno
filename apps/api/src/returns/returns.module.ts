import { Module } from "@nestjs/common";
import { FinanceService } from "../operations/finance.service";
import { ReturnsController } from "./returns.controller";
import { ReturnsService } from "./returns.service";

@Module({ controllers: [ReturnsController], providers: [ReturnsService, FinanceService] })
export class ReturnsModule {}
