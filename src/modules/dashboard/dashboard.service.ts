import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BlockchainService } from "../blockchain/blockchain.service.js";
import { BlsService } from "../bls/bls.service.js";
import { NodeService } from "../node/node.service.js";
import { NodeState } from "../../interfaces/node.interface.js";
import { randomBytes } from "crypto";
import { writeFileSync, existsSync } from "fs";
import { join } from "path";
import { CreateNodeDto } from "./dto/create-node.dto.js";

export interface NodeInfo {
  nodeId: string;
  publicKey: string;
  isRegistered: boolean; // Always from chain
  hasPrivateKey: boolean; // Whether we have the private key locally
  metadata?: {
    nodeName?: string;
    description?: string;
    createdAt?: string;
    registrationStatus?: "pending" | "registered" | "failed";
    registeredAt?: string;
    stakeStatus?: "not_staked" | "staked" | "unstaking";
    stakeAmount?: string;
    stakedAt?: string;
  };
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);
  private readonly contractAddress: string;
  private readonly nodeStateFilePath: string;

  constructor(
    private readonly blsService: BlsService,
    private readonly blockchainService: BlockchainService,
    private readonly nodeService: NodeService,
    private readonly configService: ConfigService
  ) {
    this.contractAddress = this.configService.get<string>("validatorContractAddress")!;
    this.nodeStateFilePath = join(process.cwd(), "node_state.json");
  }

  /**
   * Get the current running node information with comprehensive status
   */
  async getCurrentRunningNode(): Promise<NodeInfo | null> {
    try {
      const nodeState = this.nodeService.getNodeState();

      if (!nodeState) {
        return null;
      }

      // Check registration status on-chain
      const isRegistered = await this.blockchainService.checkNodeRegistration(
        this.contractAddress,
        nodeState.nodeId
      );

      // Check if we have the private key locally
      const privateKeyData = this.getPrivateKeyData(nodeState.nodeId);
      const hasPrivateKey = !!privateKeyData;

      return {
        nodeId: nodeState.nodeId,
        publicKey: nodeState.publicKey,
        isRegistered,
        hasPrivateKey,
        metadata: {
          nodeName: nodeState.nodeName,
          description: nodeState.description,
          createdAt: nodeState.createdAt,
          registrationStatus: nodeState.registrationStatus,
          registeredAt: nodeState.registeredAt,
          stakeStatus: nodeState.stakeStatus || "not_staked",
          stakeAmount: nodeState.stakeAmount,
          stakedAt: nodeState.stakedAt,
        },
      };
    } catch (error) {
      this.logger.warn(`Failed to get current running node: ${error}`);
      return null;
    }
  }

  /**
   * Create a new BLS node with generated keys
   * Writes to node_state.json - this becomes the running node
   */
  async createNode(dto: CreateNodeDto = {}): Promise<NodeInfo> {
    this.logger.log("Creating new BLS node...");

    // Check if node already exists
    if (existsSync(this.nodeStateFilePath)) {
      throw new Error("Node already exists. Delete node_state.json first to create a new one.");
    }

    // Generate random node ID (32 bytes)
    const nodeId = "0x" + randomBytes(32).toString("hex");

    // Generate BLS key pair
    const privateKeyBytes = randomBytes(32);
    const privateKey = "0x" + privateKeyBytes.toString("hex");

    // Get public key in EIP2537 format
    const { sigs } = await import("../../utils/bls.util.js");
    const privateKeyBytesArray = this.hexToBytes(privateKey.substring(2));
    const publicKeyPoint = sigs.getPublicKey(privateKeyBytesArray);
    const publicKey = this.blsService.encodePublicKeyToEIP2537(publicKeyPoint);

    const nodeName = dto.nodeName || `node_${nodeId.substring(2, 10)}`;
    const description = dto.description || `BLS Node ${nodeId.substring(0, 12)}...`;

    // Create NodeState object
    const nodeState: NodeState = {
      nodeId,
      nodeName,
      privateKey,
      publicKey,
      registrationStatus: "pending",
      createdAt: new Date().toISOString(),
      description,
    };

    // Write to node_state.json
    writeFileSync(this.nodeStateFilePath, JSON.stringify(nodeState, null, 2), "utf8");

    this.logger.log(`Node created successfully: ${nodeId} (saved to node_state.json)`);

    // Reload NodeService state to reflect the new node
    this.nodeService.reloadNodeState();

    return {
      nodeId,
      publicKey,
      isRegistered: false,
      hasPrivateKey: true,
      metadata: {
        nodeName,
        description,
        createdAt: nodeState.createdAt,
        registrationStatus: "pending",
      },
    };
  }

  /**
   * List all nodes from blockchain
   * Since we only have one local node now (node_state.json),
   * just return registered nodes from chain
   */
  async listNodes(): Promise<NodeInfo[]> {
    const nodes: NodeInfo[] = [];

    // Get registered nodes from chain
    const registeredCount = await this.blockchainService.getRegisteredNodeCount(
      this.contractAddress
    );

    if (registeredCount > 0) {
      const { nodeIds, publicKeys } = await this.blockchainService.getRegisteredNodes(
        this.contractAddress,
        0,
        registeredCount
      );

      for (let i = 0; i < nodeIds.length; i++) {
        const nodeId = nodeIds[i];
        const publicKey = publicKeys[i];

        // Check if this is our local node
        const localNode = this.nodeService.getNodeState();
        const hasPrivateKey = !!(localNode && localNode.nodeId === nodeId);

        nodes.push({
          nodeId,
          publicKey,
          isRegistered: true,
          hasPrivateKey,
          metadata:
            hasPrivateKey && localNode
              ? {
                  nodeName: localNode.nodeName,
                  description: localNode.description,
                  createdAt: localNode.createdAt,
                  registrationStatus: localNode.registrationStatus,
                  registeredAt: localNode.registeredAt,
                }
              : undefined,
        });
      }
    }

    return nodes;
  }

  /**
   * Delete the current running node (node_state.json)
   * Only allowed if the node is not registered on-chain
   */
  async deleteCurrentNode(): Promise<{ success: boolean; message: string }> {
    const currentNode = this.nodeService.getNodeState();

    if (!currentNode) {
      throw new Error("No node exists to delete");
    }

    // Fast check: if local status shows registered, deny immediately
    // No need to check chain - registered nodes cannot be deleted
    if (currentNode.registrationStatus === "registered") {
      return {
        success: false,
        message: "Cannot delete: Node is registered on-chain. Revoke it first.",
      };
    }

    // For pending/failed nodes, they are definitely not on-chain, proceed with deletion

    // Delete the node_state.json file
    try {
      const fs = await import("fs");
      const path = await import("path");
      const filePath = path.join(process.cwd(), "node_state.json");

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.logger.log(`Deleted node_state.json for node: ${currentNode.nodeId}`);

        // Reload NodeService state to clear the deleted node
        this.nodeService.reloadNodeState();
      }

      return {
        success: true,
        message: "Node deleted successfully.",
      };
    } catch (error: any) {
      this.logger.error(`Failed to delete node: ${error.message}`);
      return {
        success: false,
        message: `Failed to delete node: ${error.message}`,
      };
    }
  }

  /**
   * Check if a private key exists for a given node ID
   * Since we only support one node (node_state.json), check if it matches the current node
   */
  private getPrivateKeyData(nodeId: string): { privateKey: string } | null {
    const nodeState = this.nodeService.getNodeState();
    if (nodeState && nodeState.nodeId === nodeId) {
      return { privateKey: nodeState.privateKey };
    }
    return null;
  }

  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }
}
