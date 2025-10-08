import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Render,
  Res,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from "@nestjs/swagger";
import { AdminService, NodeInfo } from "./admin.service.js";
import { BlockchainService } from "../blockchain/blockchain.service.js";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import { CreateNodeDto } from "./dto/create-node.dto.js";

@ApiTags("admin")
@Controller("admin")
export class AdminController {
  private readonly contractAddress: string;

  constructor(
    private readonly adminService: AdminService,
    private readonly blockchainService: BlockchainService,
    private readonly configService: ConfigService
  ) {
    this.contractAddress = this.configService.get<string>("validatorContractAddress")!;
  }

  @Get()
  @ApiOperation({ summary: "Get admin dashboard page" })
  async getAdminPage(@Res() res: Response) {
    const nodes = await this.adminService.listNodes();
    const registeredCount = await this.blockchainService.getRegisteredNodeCount(
      this.contractAddress
    );
    const walletAddress = this.blockchainService.getWalletAddress();

    // Return HTML page
    const html = this.generateAdminHTML(nodes, registeredCount, walletAddress);
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  }

  @Get("nodes")
  @ApiOperation({ summary: "List all nodes" })
  @ApiResponse({ status: 200, description: "List of all nodes" })
  async listNodes(): Promise<NodeInfo[]> {
    return this.adminService.listNodes();
  }

  @Get("nodes/:nodeId")
  @ApiOperation({ summary: "Get node by ID" })
  @ApiParam({ name: "nodeId", description: "Node ID" })
  @ApiResponse({ status: 200, description: "Node information" })
  @ApiResponse({ status: 404, description: "Node not found" })
  async getNode(@Param("nodeId") nodeId: string): Promise<NodeInfo> {
    return this.adminService.getNode(nodeId);
  }

  @Post("nodes")
  @ApiOperation({ summary: "Create a new BLS node" })
  @ApiBody({ type: CreateNodeDto })
  @ApiResponse({ status: 201, description: "Node created successfully" })
  async createNode(@Body() dto: CreateNodeDto): Promise<NodeInfo> {
    return this.adminService.createNode(dto);
  }

  @Delete("nodes/:nodeId/private-key")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete local private key for a node" })
  @ApiParam({ name: "nodeId", description: "Node ID" })
  @ApiResponse({ status: 200, description: "Private key deleted successfully" })
  @ApiResponse({ status: 404, description: "Private key not found" })
  async deletePrivateKey(
    @Param("nodeId") nodeId: string
  ): Promise<{ success: boolean; message: string }> {
    return this.adminService.deletePrivateKey(nodeId);
  }

  @Get("nodes/:nodeId/private-key")
  @ApiOperation({ summary: "Get private key for a node (use with caution)" })
  @ApiParam({ name: "nodeId", description: "Node ID" })
  @ApiResponse({ status: 200, description: "Private key" })
  @ApiResponse({ status: 404, description: "Private key not found" })
  async getPrivateKey(
    @Param("nodeId") nodeId: string
  ): Promise<{ nodeId: string; privateKey: string }> {
    const privateKey = this.adminService.getPrivateKey(nodeId);
    return { nodeId, privateKey };
  }

  @Post("nodes/:nodeId/register")
  @ApiOperation({ summary: "Register node public key on-chain" })
  @ApiParam({ name: "nodeId", description: "Node ID" })
  @ApiResponse({ status: 200, description: "Node registered on-chain" })
  async registerNode(
    @Param("nodeId") nodeId: string
  ): Promise<{ success: boolean; txHash?: string; message: string }> {
    const node = await this.adminService.getNode(nodeId);

    const txHash = await this.blockchainService.registerNodeOnChain(
      this.contractAddress,
      node.nodeId,
      node.publicKey
    );

    if (txHash === "already_registered") {
      return {
        success: true,
        message: "Node was already registered on-chain",
      };
    }

    return {
      success: true,
      txHash,
      message: "Node registered successfully on-chain",
    };
  }

  @Post("nodes/:nodeId/revoke")
  @ApiOperation({ summary: "Revoke node registration on-chain" })
  @ApiParam({ name: "nodeId", description: "Node ID" })
  @ApiResponse({ status: 200, description: "Node revoked on-chain" })
  async revokeNode(
    @Param("nodeId") nodeId: string
  ): Promise<{ success: boolean; txHash?: string; message: string }> {
    const node = await this.adminService.getNode(nodeId);

    const txHash = await this.blockchainService.revokeNodeOnChain(
      this.contractAddress,
      node.nodeId
    );

    if (txHash === "not_registered") {
      return {
        success: true,
        message: "Node was not registered on-chain",
      };
    }

    return {
      success: true,
      txHash,
      message: "Node revoked successfully on-chain",
    };
  }

  @Post("batch-register")
  @ApiOperation({ summary: "Batch register multiple pending nodes on-chain" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        nodeIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of node IDs to register",
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: "Nodes registered on-chain" })
  async batchRegisterNodes(
    @Body() body: { nodeIds: string[] }
  ): Promise<{ success: boolean; txHash: string; message: string }> {
    const { nodeIds } = body;

    if (!nodeIds || nodeIds.length === 0) {
      throw new Error("No node IDs provided");
    }

    // Get node information
    const nodes = await Promise.all(nodeIds.map(id => this.adminService.getNode(id)));

    const nodeIdsArray = nodes.map(n => n.nodeId);
    const publicKeysArray = nodes.map(n => n.publicKey);

    const txHash = await this.blockchainService.batchRegisterNodesOnChain(
      this.contractAddress,
      nodeIdsArray,
      publicKeysArray
    );

    return {
      success: true,
      txHash,
      message: `${nodeIds.length} nodes registered successfully on-chain`,
    };
  }

  @Get("contract/info")
  @ApiOperation({ summary: "Get contract information" })
  @ApiResponse({ status: 200, description: "Contract information" })
  async getContractInfo(): Promise<{
    contractAddress: string;
    registeredCount: number;
    walletAddress: string | null;
    isConfigured: boolean;
  }> {
    const registeredCount = await this.blockchainService.getRegisteredNodeCount(
      this.contractAddress
    );
    const walletAddress = this.blockchainService.getWalletAddress();
    const isConfigured = this.blockchainService.isConfigured();

    return {
      contractAddress: this.contractAddress,
      registeredCount,
      walletAddress,
      isConfigured,
    };
  }

  @Get("contract/nodes")
  @ApiOperation({ summary: "Get registered nodes from contract" })
  @ApiResponse({ status: 200, description: "Registered nodes from contract" })
  async getContractNodes(): Promise<{ nodeIds: string[]; publicKeys: string[] }> {
    const count = await this.blockchainService.getRegisteredNodeCount(this.contractAddress);

    if (count === 0) {
      return { nodeIds: [], publicKeys: [] };
    }

    return this.blockchainService.getRegisteredNodes(this.contractAddress, 0, count);
  }

  private generateAdminHTML(
    nodes: NodeInfo[],
    registeredCount: number,
    walletAddress: string | null
  ): string {
    const nodeRows = nodes
      .map(
        node => `
      <tr>
        <td class="px-4 py-3 text-sm font-mono">${node.nodeId.substring(0, 20)}...</td>
        <td class="px-4 py-3 text-sm">${node.metadata?.nodeName || "N/A"}</td>
        <td class="px-4 py-3 text-sm text-center">
          <span class="status-badge ${node.isRegistered ? "status-registered" : "status-pending"}">
            ${node.isRegistered ? "✓ On-Chain" : "✗ Not Registered"}
          </span>
        </td>
        <td class="px-4 py-3 text-sm text-center">
          <span class="status-badge ${node.hasPrivateKey ? "status-registered" : "status-failed"}">
            ${node.hasPrivateKey ? "✓ Yes" : "✗ No"}
          </span>
        </td>
        <td class="px-4 py-3 text-sm">${node.metadata?.createdAt ? new Date(node.metadata.createdAt).toLocaleString() : "N/A"}</td>
        <td class="px-4 py-3 text-sm">
          <div class="flex space-x-2">
            <button onclick="registerNode('${node.nodeId}')"
                    class="btn btn-primary btn-sm"
                    ${node.isRegistered ? "disabled" : ""}>
              Register
            </button>
            <button onclick="revokeNode('${node.nodeId}')"
                    class="btn btn-warning btn-sm"
                    ${!node.isRegistered ? "disabled" : ""}>
              Revoke
            </button>
            <button onclick="deletePrivateKey('${node.nodeId}')"
                    class="btn btn-danger btn-sm"
                    ${!node.hasPrivateKey ? "disabled" : ""}>
              Delete Key
            </button>
          </div>
        </td>
      </tr>
    `
      )
      .join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BLS Node Management - AAStarValidator</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    .header {
      background: white;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    .header h1 {
      font-size: 28px;
      color: #1a202c;
      margin-bottom: 8px;
    }
    .header p { color: #718096; font-size: 14px; }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: white;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    .stat-label {
      font-size: 12px;
      color: #718096;
      text-transform: uppercase;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .stat-value {
      font-size: 24px;
      color: #1a202c;
      font-weight: bold;
    }
    .stat-value.small { font-size: 16px; font-family: monospace; }
    .card {
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      margin-bottom: 24px;
    }
    .card-header {
      background: #f7fafc;
      padding: 20px 24px;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .card-title {
      font-size: 18px;
      font-weight: 600;
      color: #1a202c;
    }
    table { width: 100%; border-collapse: collapse; }
    th {
      background: #f7fafc;
      padding: 12px 16px;
      text-align: left;
      font-size: 12px;
      font-weight: 600;
      color: #4a5568;
      text-transform: uppercase;
    }
    td {
      padding: 16px;
      border-top: 1px solid #e2e8f0;
    }
    tr:hover { background: #f7fafc; }
    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-primary {
      background: #667eea;
      color: white;
    }
    .btn-primary:hover:not(:disabled) {
      background: #5568d3;
    }
    .btn-warning {
      background: #f6ad55;
      color: white;
    }
    .btn-warning:hover:not(:disabled) {
      background: #ed8936;
    }
    .btn-danger {
      background: #fc8181;
      color: white;
    }
    .btn-danger:hover:not(:disabled) {
      background: #f56565;
    }
    .btn-success {
      background: #48bb78;
      color: white;
    }
    .btn-success:hover:not(:disabled) {
      background: #38a169;
    }
    .btn-sm {
      padding: 6px 12px;
      font-size: 12px;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .status-pending {
      background: #fef5e7;
      color: #d68910;
    }
    .status-registered {
      background: #d4edda;
      color: #155724;
    }
    .status-failed {
      background: #f8d7da;
      color: #721c24;
    }
    .flex { display: flex; }
    .space-x-2 > * + * { margin-left: 8px; }
    .toast {
      position: fixed;
      top: 20px;
      right: 20px;
      background: white;
      padding: 16px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      display: none;
      z-index: 1000;
    }
    .toast.show { display: block; animation: slideIn 0.3s; }
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 BLS Node Management</h1>
      <p>AAStarValidator - ERC-4337 Account Abstraction</p>
    </div>

    <div class="stats">
      <div class="stat-card">
        <div class="stat-label">Total Nodes</div>
        <div class="stat-value">${nodes.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">On-Chain Registered</div>
        <div class="stat-value">${registeredCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Contract Address</div>
        <div class="stat-value small">${this.contractAddress.substring(0, 20)}...</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Wallet Address</div>
        <div class="stat-value small">${walletAddress ? walletAddress.substring(0, 20) + "..." : "Not configured"}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Node List (Chain Data)</h2>
        <button onclick="createNode()" class="btn btn-success">➕ Create New Node</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Node ID</th>
            <th>Name</th>
            <th>On-Chain Status</th>
            <th>Has Private Key</th>
            <th>Created At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${nodeRows || '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #718096;">No nodes found on-chain. Create and register your first node!</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>

  <div id="toast" class="toast"></div>

  <script>
    function showToast(message, duration = 3000) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), duration);
    }

    async function createNode() {
      const nodeName = prompt('Enter node name (optional):');
      const description = prompt('Enter node description (optional):');

      try {
        const response = await fetch('/admin/nodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodeName, description })
        });

        if (response.ok) {
          showToast('✅ Node created successfully!');
          setTimeout(() => location.reload(), 1000);
        } else {
          const error = await response.json();
          showToast('❌ Failed to create node: ' + error.message);
        }
      } catch (error) {
        showToast('❌ Error: ' + error.message);
      }
    }

    async function registerNode(nodeId) {
      if (!confirm('Register this node on-chain?')) return;

      try {
        const response = await fetch(\`/admin/nodes/\${nodeId}/register\`, { method: 'POST' });
        const result = await response.json();

        if (response.ok) {
          showToast('✅ ' + result.message);
          setTimeout(() => location.reload(), 2000);
        } else {
          showToast('❌ Failed to register: ' + result.message);
        }
      } catch (error) {
        showToast('❌ Error: ' + error.message);
      }
    }

    async function revokeNode(nodeId) {
      if (!confirm('Revoke this node from the contract?')) return;

      try {
        const response = await fetch(\`/admin/nodes/\${nodeId}/revoke\`, { method: 'POST' });
        const result = await response.json();

        if (response.ok) {
          showToast('✅ ' + result.message);
          setTimeout(() => location.reload(), 2000);
        } else {
          showToast('❌ Failed to revoke: ' + result.message);
        }
      } catch (error) {
        showToast('❌ Error: ' + error.message);
      }
    }

    async function deletePrivateKey(nodeId) {
      if (!confirm('Delete private key for this node? The node will remain on-chain if registered.')) return;

      try {
        const response = await fetch(\`/admin/nodes/\${nodeId}/private-key\`, { method: 'DELETE' });
        const result = await response.json();

        if (response.ok) {
          showToast('✅ Private key deleted successfully');
          setTimeout(() => location.reload(), 1000);
        } else {
          showToast('❌ Failed to delete: ' + result.message);
        }
      } catch (error) {
        showToast('❌ Error: ' + error.message);
      }
    }
  </script>
</body>
</html>`;
  }
}
