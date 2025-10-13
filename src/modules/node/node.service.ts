import { Injectable, OnModuleInit, Logger, Inject, forwardRef } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NodeKeyPair, NodeState } from "../../interfaces/node.interface.js";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { BlsService } from "../bls/bls.service.js";
import { BlockchainService } from "../blockchain/blockchain.service.js";
import { randomBytes, createHash } from "crypto";

@Injectable()
export class NodeService implements OnModuleInit {
  private readonly logger = new Logger(NodeService.name);
  private nodeState: NodeState | null;
  private nodeStateFilePath: string;
  private contractAddress: string;

  constructor(
    @Inject(forwardRef(() => BlsService))
    private blsService: BlsService,
    private blockchainService: BlockchainService,
    private configService: ConfigService
  ) {}

  async onModuleInit() {
    await this.initializeNode();
  }

  private async initializeNode(): Promise<void> {
    this.loadContractAddress();

    // Use fixed file name: node_state.json
    this.nodeStateFilePath = join(process.cwd(), "node_state.json");

    if (existsSync(this.nodeStateFilePath)) {
      this.loadExistingNodeState();
      if (this.nodeState) {
        this.logger.log(`Loaded node state: ${this.nodeState.nodeId}`);
      }
    } else {
      this.logger.log("No node state file found. Node is not created yet.");
      this.nodeState = null;
    }
  }

  private loadContractAddress(): void {
    this.contractAddress = this.configService.get<string>("validatorContractAddress")!;
    this.logger.log(`Using contract address from environment: ${this.contractAddress}`);
  }

  private loadExistingNodeState(): void {
    try {
      const stateData = readFileSync(this.nodeStateFilePath, "utf8");
      this.nodeState = JSON.parse(stateData);
    } catch (error: any) {
      throw new Error(`Failed to load node state: ${error.message}`);
    }
  }

  saveNodeState(): void {
    try {
      writeFileSync(this.nodeStateFilePath, JSON.stringify(this.nodeState, null, 2), "utf8");
    } catch (error: any) {
      throw new Error(`Failed to save node state: ${error.message}`);
    }
  }

  getCurrentNode(): NodeState {
    if (!this.nodeState) {
      throw new Error("Node not initialized");
    }
    return { ...this.nodeState };
  }

  getNodeForSigning(): NodeKeyPair {
    const currentNode = this.getCurrentNode();
    return {
      nodeId: currentNode.nodeId,
      nodeName: currentNode.nodeName,
      privateKey: currentNode.privateKey,
      publicKey: currentNode.publicKey,
      description: currentNode.description,
    };
  }

  async registerOnChain(): Promise<{
    success: boolean;
    txHash?: string;
    message: string;
  }> {
    if (!this.nodeState) {
      throw new Error("No node state loaded. Create a node first.");
    }

    if (!this.blockchainService.isConfigured()) {
      throw new Error(
        "Blockchain service not configured. Set ETH_PRIVATE_KEY and ETH_RPC_URL environment variables."
      );
    }

    try {
      // Check current registration status on-chain
      const isRegistered = await this.blockchainService.checkNodeRegistration(
        this.contractAddress,
        this.nodeState.nodeId
      );

      if (isRegistered) {
        this.nodeState.registeredAt = new Date().toISOString();
        this.saveNodeState();

        return {
          success: true,
          message: `Node ${this.nodeState.nodeId} is already registered on-chain`,
        };
      }

      // Perform actual registration
      this.logger.log(`Registering node ${this.nodeState.nodeId} on-chain...`);

      // Convert 48-byte public key to 128-byte EIP2537 format for contract registration
      const privateKeyHex = this.nodeState.privateKey.substring(2);
      const privateKeyBytes = new Uint8Array(privateKeyHex.length / 2);
      for (let i = 0; i < privateKeyHex.length; i += 2) {
        privateKeyBytes[i / 2] = parseInt(privateKeyHex.substr(i, 2), 16);
      }

      const { sigs } = await import("../../utils/bls.util.js");
      const publicKeyPoint = sigs.getPublicKey(privateKeyBytes);
      const eip2537PublicKey = this.blsService.encodePublicKeyToEIP2537(publicKeyPoint);

      const txHash = await this.blockchainService.registerNodeOnChain(
        this.contractAddress,
        this.nodeState.nodeId,
        eip2537PublicKey
      );

      if (txHash === "already_registered") {
        this.nodeState.registeredAt = new Date().toISOString();
        this.saveNodeState();

        return {
          success: true,
          message: "Node was already registered on-chain",
        };
      }

      // Update local state with registration time
      this.nodeState.registeredAt = new Date().toISOString();
      this.saveNodeState();

      this.logger.log(`Node ${this.nodeState.nodeId} registered successfully. TX: ${txHash}`);

      return {
        success: true,
        txHash,
        message: `Node registered successfully on-chain`,
      };
    } catch (error: any) {
      this.logger.error(`Failed to register node on-chain: ${error.message}`);

      return {
        success: false,
        message: `Registration failed: ${error.message}`,
      };
    }
  }

  getContractAddress(): string {
    return this.contractAddress;
  }

  getNodeState(): NodeState | null {
    return this.nodeState || null;
  }

  /**
   * Reload node state from file (useful after create/delete operations)
   */
  reloadNodeState(): void {
    if (existsSync(this.nodeStateFilePath)) {
      this.loadExistingNodeState();
      this.logger.log(`Reloaded node state: ${this.nodeState?.nodeId || "unknown"}`);
    } else {
      this.nodeState = null;
      this.logger.log("Node state file not found, cleared internal state");
    }
  }
}
