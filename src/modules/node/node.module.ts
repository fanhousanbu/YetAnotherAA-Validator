import { Module, forwardRef } from "@nestjs/common";
import { NodeService } from "./node.service.js";
import { NodeController } from "./node.controller.js";
import { BlsModule } from "../bls/bls.module.js";
import { BlockchainModule } from "../blockchain/blockchain.module.js";

@Module({
  imports: [forwardRef(() => BlsModule), BlockchainModule],
  providers: [NodeService],
  controllers: [NodeController],
  exports: [NodeService],
})
export class NodeModule {}
