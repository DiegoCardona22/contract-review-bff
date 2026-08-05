import { Module } from "@nestjs/common";
import { ContractsModule } from "./contracts/contracts.module.js";
import { HealthController } from "./health/health.controller.js";

@Module({
  imports: [ContractsModule],
  controllers: [HealthController],
})
export class AppModule {}
