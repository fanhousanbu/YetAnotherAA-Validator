import { Module } from "@nestjs/common";
import { BlsService } from "./bls.service.js";

@Module({
  providers: [BlsService],
  exports: [BlsService],
})
export class BlsModule {}
