import { Controller, Get, Post } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { NodeService } from "./node.service.js";

@ApiTags("node")
@Controller("node")
export class NodeController {
  constructor(private readonly nodeService: NodeService) {}

  @ApiOperation({ summary: "Get current node information" })
  @ApiResponse({
    status: 200,
    description: "Current node information with hidden private key",
    schema: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description: "Unique identifier of the node",
        },
        nodeName: { type: "string", description: "Name of the node" },
        publicKey: { type: "string", description: "Public key in hex format" },
        privateKey: {
          type: "string",
          description: "Always hidden for security",
        },
        createdAt: { type: "string", description: "Node creation timestamp" },
      },
    },
  })
  @Get("info")
  getCurrentNodeInfo() {
    const nodeState = this.nodeService.getCurrentNode();
    return {
      ...nodeState,
      privateKey: "***HIDDEN***",
    };
  }

  @ApiOperation({ summary: "Register current node on-chain" })
  @ApiResponse({
    status: 200,
    description: "Node registration result",
    schema: {
      type: "object",
      properties: {
        success: {
          type: "boolean",
          description: "Registration success status",
        },
        message: { type: "string", description: "Result message" },
        nodeId: { type: "string", description: "Node ID that was registered" },
        txHash: {
          type: "string",
          description: "Transaction hash (if new registration)",
        },
      },
    },
  })
  @Post("register")
  async registerOnChain() {
    const nodeState = this.nodeService.getCurrentNode();
    const result = await this.nodeService.registerOnChain();

    return {
      ...result,
      nodeId: nodeState.nodeId,
    };
  }

  @ApiOperation({ summary: "Health check endpoint" })
  @ApiResponse({
    status: 200,
    description: "Node health status",
    schema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Node status" },
        timestamp: { type: "number", description: "Current timestamp" },
        nodeId: { type: "string", description: "Node identifier" },
        uptime: { type: "number", description: "Uptime in milliseconds" },
      },
    },
  })
  @Get("health")
  getHealth() {
    const nodeState = this.nodeService.getCurrentNode();
    return {
      status: "active",
      timestamp: Date.now(),
      nodeId: nodeState?.nodeId || "unknown",
      uptime: process.uptime() * 1000,
    };
  }
}
