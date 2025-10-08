import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BlockchainService } from "../blockchain/blockchain.service.js";
import { BlsService } from "../bls/bls.service.js";
import { randomBytes } from "crypto";
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, mkdirSync } from "fs";
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
  };
}

interface PrivateKeyStorage {
  nodeId: string;
  privateKey: string;
  nodeName?: string;
  description?: string;
  createdAt: string;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly keysDirectory: string;
  private readonly contractAddress: string;

  constructor(
    private readonly blsService: BlsService,
    private readonly blockchainService: BlockchainService,
    private readonly configService: ConfigService
  ) {
    this.keysDirectory = join(process.cwd(), ".keys");
    this.contractAddress = this.configService.get<string>("validatorContractAddress")!;

    // Create .keys directory if it doesn't exist
    if (!existsSync(this.keysDirectory)) {
      mkdirSync(this.keysDirectory, { recursive: true });
      this.logger.log(`Created keys directory: ${this.keysDirectory}`);
    }
  }

  /**
   * Create a new BLS node with generated keys
   * Only stores private key locally, does NOT register on-chain
   */
  async createNode(dto: CreateNodeDto = {}): Promise<NodeInfo> {
    this.logger.log("Creating new BLS node...");

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

    // Save only private key locally (public key is derived when needed)
    const privateKeyData: PrivateKeyStorage = {
      nodeId,
      privateKey,
      nodeName,
      description,
      createdAt: new Date().toISOString(),
    };

    const fileName = `${nodeId}.json`;
    const filePath = join(this.keysDirectory, fileName);

    writeFileSync(filePath, JSON.stringify(privateKeyData, null, 2), "utf8");

    this.logger.log(`Node created successfully: ${nodeId} (not yet registered on-chain)`);

    return {
      nodeId,
      publicKey,
      isRegistered: false, // Not registered until explicitly done
      hasPrivateKey: true,
      metadata: {
        nodeName,
        description,
        createdAt: privateKeyData.createdAt,
      },
    };
  }

  /**
   * List all nodes from blockchain (primary source)
   * Enriches with local private key availability
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

        // Check if we have private key locally
        const privateKeyData = this.getPrivateKeyData(nodeId);

        nodes.push({
          nodeId,
          publicKey,
          isRegistered: true,
          hasPrivateKey: !!privateKeyData,
          metadata: privateKeyData
            ? {
                nodeName: privateKeyData.nodeName,
                description: privateKeyData.description,
                createdAt: privateKeyData.createdAt,
              }
            : undefined,
        });
      }
    }

    // Also include locally created nodes that are not yet registered
    const localNodes = await this.getLocalUnregisteredNodes();
    nodes.push(...localNodes);

    return nodes.sort((a, b) => {
      // Registered first, then by creation date
      if (a.isRegistered !== b.isRegistered) {
        return a.isRegistered ? -1 : 1;
      }
      const dateA = a.metadata?.createdAt ? new Date(a.metadata.createdAt).getTime() : 0;
      const dateB = b.metadata?.createdAt ? new Date(b.metadata.createdAt).getTime() : 0;
      return dateB - dateA;
    });
  }

  /**
   * Get locally created nodes that are not registered on-chain
   */
  private async getLocalUnregisteredNodes(): Promise<NodeInfo[]> {
    const localNodes: NodeInfo[] = [];

    try {
      const files = readdirSync(this.keysDirectory);
      const keyFiles = files.filter(f => f.endsWith(".json"));

      for (const file of keyFiles) {
        const filePath = join(this.keysDirectory, file);
        const data = JSON.parse(readFileSync(filePath, "utf8")) as PrivateKeyStorage;

        // Check if registered on-chain
        const isRegistered = await this.blockchainService.checkNodeRegistration(
          this.contractAddress,
          data.nodeId
        );

        if (!isRegistered) {
          // Get public key from private key
          const publicKey = await this.blsService.getPublicKeyFromPrivateKey(data.privateKey);
          const { sigs } = await import("../../utils/bls.util.js");
          const privateKeyBytes = this.hexToBytes(data.privateKey.substring(2));
          const publicKeyPoint = sigs.getPublicKey(privateKeyBytes);
          const eip2537PublicKey = this.blsService.encodePublicKeyToEIP2537(publicKeyPoint);

          localNodes.push({
            nodeId: data.nodeId,
            publicKey: eip2537PublicKey,
            isRegistered: false,
            hasPrivateKey: true,
            metadata: {
              nodeName: data.nodeName,
              description: data.description,
              createdAt: data.createdAt,
            },
          });
        }
      }
    } catch (error) {
      this.logger.warn(`Error reading local keys: ${error}`);
    }

    return localNodes;
  }

  /**
   * Get a specific node by ID (from chain first)
   */
  async getNode(nodeId: string): Promise<NodeInfo> {
    // Check if registered on-chain
    const isRegistered = await this.blockchainService.checkNodeRegistration(
      this.contractAddress,
      nodeId
    );

    let publicKey: string;

    if (isRegistered) {
      // Get public key from chain
      publicKey = await this.blockchainService.getNodePublicKey(this.contractAddress, nodeId);
    } else {
      // Get from local private key
      const privateKeyData = this.getPrivateKeyData(nodeId);
      if (!privateKeyData) {
        throw new NotFoundException(`Node not found: ${nodeId}`);
      }

      const { sigs } = await import("../../utils/bls.util.js");
      const privateKeyBytes = this.hexToBytes(privateKeyData.privateKey.substring(2));
      const publicKeyPoint = sigs.getPublicKey(privateKeyBytes);
      publicKey = this.blsService.encodePublicKeyToEIP2537(publicKeyPoint);
    }

    const privateKeyData = this.getPrivateKeyData(nodeId);

    return {
      nodeId,
      publicKey,
      isRegistered,
      hasPrivateKey: !!privateKeyData,
      metadata: privateKeyData
        ? {
            nodeName: privateKeyData.nodeName,
            description: privateKeyData.description,
            createdAt: privateKeyData.createdAt,
          }
        : undefined,
    };
  }

  /**
   * Get private key for a node (if available locally)
   */
  getPrivateKey(nodeId: string): string {
    const data = this.getPrivateKeyData(nodeId);
    if (!data) {
      throw new NotFoundException(`Private key not found for node: ${nodeId}`);
    }
    return data.privateKey;
  }

  /**
   * Delete local private key file
   * Note: This does NOT revoke the node on-chain
   */
  async deletePrivateKey(nodeId: string): Promise<{ success: boolean; message: string }> {
    const filePath = join(this.keysDirectory, `${nodeId}.json`);

    if (!existsSync(filePath)) {
      throw new NotFoundException(`Private key file not found for node: ${nodeId}`);
    }

    try {
      unlinkSync(filePath);
      this.logger.log(`Private key deleted for node: ${nodeId}`);

      return {
        success: true,
        message: `Private key deleted for ${nodeId}. Node may still be registered on-chain.`,
      };
    } catch (error: any) {
      this.logger.error(`Failed to delete private key: ${error.message}`);
      throw new Error(`Failed to delete private key: ${error.message}`);
    }
  }

  /**
   * Get private key data from local storage
   */
  private getPrivateKeyData(nodeId: string): PrivateKeyStorage | null {
    const filePath = join(this.keysDirectory, `${nodeId}.json`);

    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const content = readFileSync(filePath, "utf8");
      return JSON.parse(content) as PrivateKeyStorage;
    } catch (error) {
      this.logger.warn(`Failed to read private key file for ${nodeId}: ${error}`);
      return null;
    }
  }

  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }
}
