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
import { DashboardService, NodeInfo } from "./dashboard.service.js";
import { BlockchainService } from "../blockchain/blockchain.service.js";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import { CreateNodeDto } from "./dto/create-node.dto.js";

@ApiTags("dashboard")
@Controller("dashboard")
export class DashboardController {
  private readonly contractAddress: string;

  constructor(
    private readonly dashboardService: DashboardService,
    private readonly blockchainService: BlockchainService,
    private readonly configService: ConfigService
  ) {
    this.contractAddress = this.configService.get<string>("validatorContractAddress")!;
  }

  @Get()
  @ApiOperation({ summary: "Get dashboard page" })
  async getDashboardPage(@Res() res: Response) {
    const nodes = await this.dashboardService.listNodes();
    const currentNode = await this.dashboardService.getCurrentRunningNode();
    const registeredCount = await this.blockchainService.getRegisteredNodeCount(
      this.contractAddress
    );
    const walletAddress = this.blockchainService.getWalletAddress();

    // Return HTML page
    const html = this.generateDashboardHTML(nodes, currentNode, registeredCount, walletAddress);
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  }

  @Get("nodes")
  @ApiOperation({ summary: "List all nodes from blockchain" })
  @ApiResponse({ status: 200, description: "List of all nodes" })
  async listNodes(): Promise<NodeInfo[]> {
    return this.dashboardService.listNodes();
  }

  @Get("current-node")
  @ApiOperation({ summary: "Get current running node" })
  @ApiResponse({ status: 200, description: "Current node information" })
  async getCurrentNode(): Promise<NodeInfo | null> {
    return this.dashboardService.getCurrentRunningNode();
  }

  @Post("nodes")
  @ApiOperation({ summary: "Create a new BLS node (writes to node_state.json)" })
  @ApiBody({ type: CreateNodeDto })
  @ApiResponse({ status: 201, description: "Node created successfully" })
  async createNode(@Body() dto: CreateNodeDto): Promise<NodeInfo> {
    return this.dashboardService.createNode(dto);
  }

  @Delete("current-node")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete the current running node (only if not registered on-chain)" })
  @ApiResponse({ status: 200, description: "Node deleted successfully" })
  @ApiResponse({ status: 400, description: "Cannot delete registered node" })
  async deleteCurrentNode(): Promise<{ success: boolean; message: string }> {
    return this.dashboardService.deleteCurrentNode();
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

  private generateDashboardHTML(
    nodes: NodeInfo[],
    currentNode: NodeInfo | null,
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
  <title>Dashboard - AAStarValidator</title>
  <script src="https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.umd.min.js"></script>
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

    /* Modal styles */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      animation: fadeIn 0.2s;
    }
    .modal-overlay.show { display: flex; }

    .modal {
      background: white;
      border-radius: 12px;
      padding: 32px;
      max-width: 500px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      animation: slideUp 0.3s;
    }

    .modal-title {
      font-size: 24px;
      font-weight: 600;
      color: #1a202c;
      margin-bottom: 24px;
    }

    .form-group {
      margin-bottom: 20px;
    }

    .form-label {
      display: block;
      font-size: 14px;
      font-weight: 500;
      color: #4a5568;
      margin-bottom: 8px;
    }

    .form-input {
      width: 100%;
      padding: 12px;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      font-size: 14px;
      transition: border-color 0.2s;
      box-sizing: border-box;
    }

    .form-input:focus {
      outline: none;
      border-color: #667eea;
    }

    .form-hint {
      font-size: 12px;
      color: #718096;
      margin-top: 4px;
    }

    .modal-actions {
      display: flex;
      gap: 12px;
      margin-top: 24px;
    }

    .modal-actions .btn {
      flex: 1;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    /* Mobile responsive */
    @media (max-width: 640px) {
      .modal {
        padding: 24px;
        width: 95%;
      }

      .modal-title {
        font-size: 20px;
      }

      .stats {
        grid-template-columns: 1fr;
      }

      table {
        font-size: 12px;
      }

      th, td {
        padding: 8px;
      }

      .btn-sm {
        padding: 4px 8px;
        font-size: 11px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 Dashboard - Signer Management</h1>
      <p>AAStarValidator - ERC-4337 Account Abstraction</p>
    </div>

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">👛 Connect Wallet</h2>
      </div>
      <div style="padding: 24px;">
        <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
          <button id="connectWalletBtn" onclick="connectWallet()" class="btn btn-primary">
            Connect MetaMask
          </button>
          <span id="walletStatus" style="color: #718096;">Not connected</span>
        </div>
        <div id="walletInfo" style="display: none;">
          <p style="margin-bottom: 12px;">
            <strong>Connected Wallet:</strong> <span id="connectedAddress" style="font-family: monospace;"></span>
          </p>
          <button id="registerWalletBtn" onclick="registerWallet()" class="btn btn-success">
            Register Wallet On-Chain
          </button>
        </div>
      </div>
    </div>

    ${
      currentNode
        ? `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">🚀 Current Running Node</h2>
      </div>
      <div style="padding: 24px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div>
            <p style="margin-bottom: 8px;"><strong>Node ID:</strong></p>
            <p style="font-family: monospace; color: #4a5568;">${currentNode.nodeId}</p>
          </div>
          <div>
            <p style="margin-bottom: 8px;"><strong>Node Name:</strong></p>
            <p style="color: #4a5568;">${currentNode.metadata?.nodeName || "N/A"}</p>
          </div>
          <div>
            <p style="margin-bottom: 8px;"><strong>Registration Status:</strong></p>
            <span class="status-badge ${currentNode.isRegistered ? "status-registered" : currentNode.metadata?.registrationStatus === "failed" ? "status-failed" : "status-pending"}">
              ${currentNode.isRegistered ? "✓ Registered On-Chain" : currentNode.metadata?.registrationStatus === "failed" ? "✗ Failed" : "⏳ Not Registered"}
            </span>
          </div>
          <div>
            <p style="margin-bottom: 8px;"><strong>Stake Status:</strong></p>
            <span class="status-badge ${currentNode.metadata?.stakeStatus === "staked" ? "status-registered" : "status-pending"}">
              ${currentNode.metadata?.stakeStatus === "staked" ? "✓ Staked" : currentNode.metadata?.stakeStatus === "unstaking" ? "⏳ Unstaking" : "✗ Not Staked"}
            </span>
          </div>
          ${
            currentNode.metadata?.stakeAmount
              ? `
          <div>
            <p style="margin-bottom: 8px;"><strong>Stake Amount:</strong></p>
            <p style="color: #4a5568;">${currentNode.metadata.stakeAmount} ETH</p>
          </div>
          `
              : ""
          }
          <div>
            <p style="margin-bottom: 8px;"><strong>Created At:</strong></p>
            <p style="color: #4a5568;">${currentNode.metadata?.createdAt ? new Date(currentNode.metadata.createdAt).toLocaleString() : "N/A"}</p>
          </div>
          ${
            currentNode.metadata?.registeredAt
              ? `
          <div>
            <p style="margin-bottom: 8px;"><strong>Registered At:</strong></p>
            <p style="color: #4a5568;">${new Date(currentNode.metadata.registeredAt).toLocaleString()}</p>
          </div>
          `
              : ""
          }
        </div>
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
          <p style="margin-bottom: 8px;"><strong>Actions:</strong></p>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${
              !currentNode.isRegistered
                ? `
            <button onclick="registerCurrentNode('${currentNode.nodeId}')" class="btn btn-primary btn-sm">
              Register On-Chain
            </button>
            <button onclick="deleteCurrentNode()" class="btn btn-danger btn-sm">
              Delete Node
            </button>
            `
                : ""
            }
            ${
              currentNode.isRegistered && currentNode.metadata?.stakeStatus !== "staked"
                ? `
            <button onclick="stakeCurrentNode('${currentNode.nodeId}')" class="btn btn-success btn-sm" disabled title="Stake功能即将推出">
              Stake Node (Coming Soon)
            </button>
            `
                : ""
            }
          </div>
        </div>
      </div>
    </div>
    `
        : `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">🚀 Current Running Node</h2>
      </div>
      <div style="padding: 24px; text-align: center; color: #718096;">
        <p>No running node detected. Start a node with NODE_ID or NODE_STATE_FILE environment variable.</p>
      </div>
    </div>
    `
    }

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

  <!-- Create Node Modal -->
  <div id="createNodeModal" class="modal-overlay">
    <div class="modal">
      <h2 class="modal-title">🔐 Create New BLS Node</h2>
      <form id="createNodeForm">
        <div class="form-group">
          <label class="form-label" for="nodeName">Node Name</label>
          <input type="text" id="nodeName" class="form-input" placeholder="e.g., my-validator-node" />
          <div class="form-hint">Optional: A friendly name for your node</div>
        </div>
        <div class="form-group">
          <label class="form-label" for="nodeDescription">Description</label>
          <input type="text" id="nodeDescription" class="form-input" placeholder="e.g., Production validator node" />
          <div class="form-hint">Optional: Description of this node's purpose</div>
        </div>
        <div class="modal-actions">
          <button type="button" onclick="closeCreateNodeModal()" class="btn btn-warning">Cancel</button>
          <button type="submit" class="btn btn-primary">Create Node</button>
        </div>
      </form>
    </div>
  </div>

  <script>
    let userWalletAddress = null;
    const contractAddress = '${this.contractAddress}';

    // Contract ABI for registerSigner and isSignerRegistered
    const contractABI = [
      'function registerSigner(address signer) external',
      'function isSignerRegistered(address signer) external view returns (bool)'
    ];

    function showToast(message, duration = 3000) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), duration);
    }

    async function connectWallet() {
      if (typeof window.ethereum === 'undefined') {
        showToast('❌ Please install MetaMask!');
        return;
      }

      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        userWalletAddress = accounts[0];

        document.getElementById('walletStatus').textContent = 'Connected ✅';
        document.getElementById('walletStatus').style.color = '#48bb78';
        document.getElementById('connectedAddress').textContent = userWalletAddress;
        document.getElementById('walletInfo').style.display = 'block';
        document.getElementById('connectWalletBtn').disabled = true;

        showToast('✅ Wallet connected successfully!');
      } catch (error) {
        showToast('❌ Failed to connect wallet: ' + error.message);
      }
    }

    async function registerWallet() {
      if (!userWalletAddress) {
        showToast('❌ Please connect wallet first!');
        return;
      }

      if (!confirm('Register wallet ' + userWalletAddress + ' on-chain? You will pay gas fees.')) return;

      try {
        document.getElementById('registerWalletBtn').disabled = true;
        document.getElementById('registerWalletBtn').textContent = 'Registering...';

        // Use ethers.js to interact with the contract directly
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        const contract = new ethers.Contract(contractAddress, contractABI, signer);

        // Check if already registered
        const isRegistered = await contract.isSignerRegistered(userWalletAddress);
        if (isRegistered) {
          showToast('ℹ️ Wallet is already registered on-chain');
          document.getElementById('registerWalletBtn').textContent = 'Already Registered';
          return;
        }

        // Call registerSigner - user pays gas
        showToast('📝 Please confirm transaction in MetaMask...');
        const tx = await contract.registerSigner(userWalletAddress);

        showToast('⏳ Transaction submitted, waiting for confirmation...');
        const receipt = await tx.wait();

        showToast('✅ Wallet registered successfully! Block: ' + receipt.blockNumber);
        console.log('Transaction hash:', tx.hash);
        console.log('Transaction receipt:', receipt);

        document.getElementById('registerWalletBtn').textContent = 'Registered ✅';
      } catch (error) {
        console.error('Registration error:', error);
        let errorMessage = 'Failed to register wallet';

        if (error.code === 4001) {
          errorMessage = 'Transaction rejected by user';
        } else if (error.code === -32603) {
          errorMessage = 'Insufficient funds for gas';
        } else if (error.message) {
          errorMessage = error.message;
        }

        showToast('❌ ' + errorMessage);
        document.getElementById('registerWalletBtn').disabled = false;
        document.getElementById('registerWalletBtn').textContent = 'Register Wallet On-Chain';
      }
    }

    async function registerCurrentNode(nodeId) {
      if (!userWalletAddress) {
        showToast('❌ Please connect your wallet first!');
        return;
      }

      if (!confirm('Register current node on-chain using your connected wallet? You will pay gas fees.')) return;

      try {
        console.log('Starting node registration...');

        // Get node details from backend
        const nodeResponse = await fetch('/dashboard/current-node');
        const nodeData = await nodeResponse.json();

        console.log('Node data:', nodeData);

        if (!nodeData || !nodeData.nodeId || !nodeData.publicKey) {
          showToast('❌ Failed to get node details');
          return;
        }

        // Use MetaMask to sign and send transaction
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const network = await provider.getNetwork();
        console.log('Connected to network:', network.name, 'Chain ID:', network.chainId);

        const signer = provider.getSigner();
        const signerAddress = await signer.getAddress();
        console.log('Signer address:', signerAddress);

        // Contract ABI for node registration
        const nodeABI = [
          'function registerPublicKey(bytes32 nodeId, bytes calldata publicKey) external',
          'function isRegistered(bytes32 nodeId) external view returns (bool)'
        ];

        const contract = new ethers.Contract(contractAddress, nodeABI, signer);
        console.log('Contract address:', contractAddress);

        // Check if already registered
        showToast('🔍 Checking registration status...');
        const isRegistered = await contract.isRegistered(nodeData.nodeId);
        console.log('Is registered:', isRegistered);

        if (isRegistered) {
          showToast('ℹ️ Node is already registered on-chain');
          setTimeout(() => location.reload(), 2000);
          return;
        }

        // Estimate gas before sending
        showToast('⚙️ Estimating gas...');
        try {
          const gasEstimate = await contract.estimateGas.registerPublicKey(nodeData.nodeId, nodeData.publicKey);
          console.log('Gas estimate:', gasEstimate.toString());
        } catch (gasError) {
          console.error('Gas estimation failed:', gasError);
          showToast('❌ Gas estimation failed: ' + gasError.message);
          return;
        }

        // Call registerPublicKey - user pays gas
        showToast('📝 Please confirm transaction in MetaMask...');
        console.log('Calling registerPublicKey with:', {
          nodeId: nodeData.nodeId,
          publicKey: nodeData.publicKey
        });

        const tx = await contract.registerPublicKey(nodeData.nodeId, nodeData.publicKey);
        console.log('Transaction sent:', tx.hash);

        showToast('⏳ Transaction submitted: ' + tx.hash.substring(0, 10) + '...');
        const receipt = await tx.wait();
        console.log('Transaction confirmed:', receipt);

        showToast('✅ Node registered successfully! Block: ' + receipt.blockNumber);

        // Reload page after successful registration
        setTimeout(() => location.reload(), 2000);
      } catch (error) {
        console.error('Registration error:', error);
        console.error('Error details:', {
          code: error.code,
          message: error.message,
          data: error.data
        });

        let errorMessage = 'Failed to register node';

        if (error.code === 4001) {
          errorMessage = 'Transaction rejected by user';
        } else if (error.code === -32603) {
          errorMessage = 'Insufficient funds for gas';
        } else if (error.code === 'CALL_EXCEPTION') {
          errorMessage = 'Contract call failed: ' + (error.reason || error.message);
        } else if (error.message) {
          errorMessage = error.message;
        }

        showToast('❌ ' + errorMessage);
      }
    }

    async function stakeCurrentNode(nodeId) {
      showToast('ℹ️ Stake功能即将推出...');
      // TODO: Implement stake functionality
      // This will be implemented when staking is ready
    }

    async function deleteCurrentNode() {
      console.log('deleteCurrentNode called');

      if (!confirm('⚠️ Delete current node?\\n\\nThis will permanently delete node_state.json.\\nThe node is not registered on-chain, so it is safe to delete.\\n\\nYou will need to restart the service after deletion.')) {
        console.log('User cancelled deletion');
        return;
      }

      try {
        console.log('Sending DELETE request...');
        const response = await fetch('/dashboard/current-node', { method: 'DELETE' });
        console.log('Response status:', response.status);

        const result = await response.json();
        console.log('Result:', result);

        if (response.ok && result.success) {
          showToast('✅ ' + result.message);
          setTimeout(() => location.reload(), 2000);
        } else {
          showToast('❌ ' + (result.message || 'Failed to delete node'));
        }
      } catch (error) {
        console.error('Delete error:', error);
        showToast('❌ Error: ' + error.message);
      }
    }

    function openCreateNodeModal() {
      document.getElementById('createNodeModal').classList.add('show');
      document.getElementById('nodeName').value = '';
      document.getElementById('nodeDescription').value = '';
      document.getElementById('nodeName').focus();
    }

    function closeCreateNodeModal() {
      document.getElementById('createNodeModal').classList.remove('show');
    }

    // Close modal when clicking outside
    document.getElementById('createNodeModal').addEventListener('click', (e) => {
      if (e.target.id === 'createNodeModal') {
        closeCreateNodeModal();
      }
    });

    // Handle form submission
    document.getElementById('createNodeForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const nodeName = document.getElementById('nodeName').value.trim();
      const description = document.getElementById('nodeDescription').value.trim();

      try {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';

        const response = await fetch('/dashboard/nodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nodeName: nodeName || undefined,
            description: description || undefined
          })
        });

        if (response.ok) {
          closeCreateNodeModal();
          showToast('✅ Node created successfully!');
          setTimeout(() => location.reload(), 1000);
        } else {
          const error = await response.json();
          showToast('❌ Failed to create node: ' + error.message);
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Node';
        }
      } catch (error) {
        showToast('❌ Error: ' + error.message);
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Node';
      }
    });

    // Keep the old function name for button click
    function createNode() {
      openCreateNodeModal();
    }

    async function registerNode(nodeId) {
      showToast('ℹ️ Chain nodes cannot be registered from dashboard. Use the running node instead.');
    }

    async function revokeNode(nodeId) {
      showToast('ℹ️ Revoke operation is not available for chain nodes.');
    }

    async function deletePrivateKey(nodeId) {
      showToast('ℹ️ Private key management is only available for the current running node.');
    }
  </script>
</body>
</html>`;
  }
}
