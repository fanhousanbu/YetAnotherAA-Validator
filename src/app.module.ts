import { Module } from "@nestjs/common";
import { BlsModule } from "./modules/bls/bls.module.js";
import { NodeModule } from "./modules/node/node.module.js";
import { SignatureModule } from "./modules/signature/signature.module.js";
import { BlockchainModule } from "./modules/blockchain/blockchain.module.js";
import { GossipModule } from "./modules/gossip/gossip.module.js";
import { AdminModule } from "./modules/admin/admin.module.js";
import { AppConfigModule } from "./config/config.module.js";

@Module({
  imports: [
    AppConfigModule, // This must be first to validate env vars on startup
    BlsModule,
    NodeModule,
    SignatureModule,
    BlockchainModule,
    GossipModule,
    AdminModule,
  ],
})
export class AppModule {}
