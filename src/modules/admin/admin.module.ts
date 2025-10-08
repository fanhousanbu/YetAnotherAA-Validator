import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";
import { BlsModule } from "../bls/bls.module.js";
import { BlockchainModule } from "../blockchain/blockchain.module.js";

@Module({
  imports: [BlsModule, BlockchainModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
