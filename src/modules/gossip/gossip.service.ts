import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import WebSocket, { WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import { NodeService } from "../node/node.service.js";
import {
  GossipMessage,
  PeerInfo,
  NodeState,
  GossipConfig,
  GossipStats,
  MessageHistory,
} from "./gossip.interfaces.js";
import { GossipWhitelistValidator } from "./gossip-whitelist-validator.js";

@Injectable()
export class GossipService implements OnModuleInit, OnModuleDestroy {
  private server: WebSocketServer;
  private peers = new Map<string, PeerInfo>();
  private connections = new Map<string, WebSocket>();
  private nodeState: NodeState;
  private messageHistory = new Map<string, MessageHistory>();
  private gossipInterval: NodeJS.Timeout;
  private heartbeatInterval: NodeJS.Timeout;
  private cleanupInterval: NodeJS.Timeout;

  private readonly config: GossipConfig;
  private readonly port: number;
  private httpServer: http.Server | null = null;
  private bootstrapPeers: string[] = [];
  private isNodeReady = false;
  private reconnectInterval: NodeJS.Timeout;
  private knownPeersFile: string;

  private stats: GossipStats = {
    totalPeers: 0,
    activePeers: 0,
    suspectedPeers: 0,
    messagesSent: 0,
    messagesReceived: 0,
    gossipRounds: 0,
    lastGossipTime: null,
  };

  constructor(
    private configService: ConfigService,
    private nodeService: NodeService
  ) {
    this.port = parseInt(this.configService.get("PORT") || "3000", 10);

    const rawBootstrapPeers = this.configService.get("GOSSIP_BOOTSTRAP_PEERS")
      ? this.configService
          .get("GOSSIP_BOOTSTRAP_PEERS")
          .split(",")
          .map((p: string) => p.trim())
      : [];

    console.log(`📝 Raw bootstrap peers: ${rawBootstrapPeers.join(", ")}`);

    // Validate bootstrap peers using whitelist mechanism
    this.bootstrapPeers = GossipWhitelistValidator.validateEndpoints(rawBootstrapPeers);

    console.log(`✅ Validated bootstrap peers: ${this.bootstrapPeers.join(", ")}`);

    // Set up known peers file path (will be updated after node initialization)
    this.knownPeersFile = path.join(process.cwd(), "data/gossip-peers-temp.json");

    // Gossip protocol configuration
    this.config = {
      gossipInterval: parseInt(this.configService.get("GOSSIP_INTERVAL") || "5000", 10),
      fanout: parseInt(this.configService.get("GOSSIP_FANOUT") || "3", 10),
      maxTTL: parseInt(this.configService.get("GOSSIP_MAX_TTL") || "5", 10),
      heartbeatInterval: parseInt(
        this.configService.get("GOSSIP_HEARTBEAT_INTERVAL") || "10000",
        10
      ),
      suspicionTimeout: parseInt(this.configService.get("GOSSIP_SUSPICION_TIMEOUT") || "30000", 10),
      cleanupTimeout: parseInt(this.configService.get("GOSSIP_CLEANUP_TIMEOUT") || "60000", 10),
      maxMessageHistory: parseInt(
        this.configService.get("GOSSIP_MAX_MESSAGE_HISTORY") || "1000",
        10
      ),
    };

    this.nodeState = {
      nodeId: "",
      data: new Map(),
      version: 0,
      lastUpdated: new Date(),
    };
  }

  async onModuleInit() {
    console.log(`🗣️  Starting BLS Signer Gossip Service on port ${this.port}...`);

    // Wait a bit for the HTTP server to be set
    let retries = 0;
    while (!this.httpServer && retries < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      retries++;
    }

    await this.startGossipServer();
    await this.waitForNodeReady();
    this.isNodeReady = true;
    this.nodeState.nodeId = this.getNodeId();

    // Update known peers file path with actual node ID
    this.knownPeersFile = path.join(
      process.cwd(),
      `data/gossip-peers-${this.nodeState.nodeId}.json`
    );

    // Load known peers from previous sessions
    await this.loadKnownPeers();

    // Connect to bootstrap peers and known peers
    await this.connectToBootstrapPeers();
    await this.connectToKnownPeers();

    this.startGossipProtocol();
    this.startHeartbeat();
    this.startCleanup();
    this.startReconnectMechanism();
    this.joinNetwork();
  }

  async onModuleDestroy() {
    this.stopGossipProtocol();
    this.stopHeartbeat();
    this.stopCleanup();
    this.stopReconnectMechanism();

    // Save known peers for future sessions
    await this.saveKnownPeers();

    this.leaveNetwork();
    this.disconnectFromPeers();
    this.server?.close();
  }

  /**
   * Set HTTP server instance for WebSocket upgrade
   */
  setHttpServer(httpServer: http.Server): void {
    this.httpServer = httpServer;
  }

  /**
   * Start the gossip WebSocket server
   */
  private async startGossipServer(): Promise<void> {
    if (!this.httpServer) {
      console.error("❌ HTTP server not set, cannot start WebSocket server");
      return;
    }

    this.server = new WebSocketServer({
      server: this.httpServer,
      path: "/ws",
    });

    this.server.on("connection", (ws: WebSocket, request) => {
      const clientIP = request.socket.remoteAddress || "unknown";
      console.log(`🔗 New gossip connection from ${clientIP}`);

      ws.on("message", (data: WebSocket.RawData) => {
        try {
          const message = JSON.parse(data.toString()) as GossipMessage;
          this.handleGossipMessage(ws, message);
        } catch (error) {
          console.error("Failed to parse gossip message:", error);
        }
      });

      ws.on("close", () => {
        console.log(`❌ Gossip connection closed from ${clientIP}`);
        this.cleanupConnection(ws);
      });

      ws.on("error", (error: Error) => {
        console.error(`Gossip connection error from ${clientIP}:`, error);
      });
    });

    const gossipPublicUrl =
      this.configService.get("GOSSIP_PUBLIC_URL") || `ws://localhost:${this.port}/ws`;
    console.log(`✅ Gossip Server listening on ${gossipPublicUrl}`);
  }

  /**
   * Connect to bootstrap peers
   */
  private async connectToBootstrapPeers(): Promise<void> {
    if (this.bootstrapPeers.length === 0) {
      console.log("⚠️  No gossip bootstrap peers configured, will rely on known peers");
      return;
    }

    const myGossipEndpoint =
      this.configService.get("GOSSIP_PUBLIC_URL") || `ws://localhost:${this.port}/ws`;
    const validBootstrapPeers = this.bootstrapPeers.filter(peer => peer !== myGossipEndpoint);

    if (validBootstrapPeers.length === 0) {
      console.log("⚠️  All gossip bootstrap peers are self-references");
      return;
    }

    console.log(`🔗 Connecting to ${validBootstrapPeers.length} gossip bootstrap peers...`);
    const results = await Promise.allSettled(
      validBootstrapPeers
        .filter(peer => !this.connections.has(peer))
        .map(peer => this.connectToPeer(peer))
    );

    const successCount = results.filter(r => r.status === "fulfilled").length;
    console.log(
      `✅ Successfully connected to ${successCount}/${validBootstrapPeers.length} bootstrap peers`
    );
  }

  /**
   * Connect to a specific peer
   *
   * @param endpoint The WebSocket endpoint to connect to
   */
  private async connectToPeer(endpoint: string): Promise<void> {
    try {
      // Validate endpoint using whitelist mechanism
      // Currently allows all nodes, will check on-chain staking in the future
      const validatedEndpoint = GossipWhitelistValidator.validateEndpoint(endpoint);
      console.log(`🔗 Connecting to gossip peer: ${validatedEndpoint}`);

      const ws = new WebSocket(validatedEndpoint);

      ws.on("open", () => {
        console.log(`✅ Connected to gossip peer: ${endpoint}`);
        this.connections.set(endpoint, ws);

        // Send join message to announce ourselves
        this.sendJoinMessage(ws);
      });

      ws.on("message", (data: WebSocket.RawData) => {
        try {
          const message = JSON.parse(data.toString()) as GossipMessage;
          this.handleGossipMessage(ws, message);
        } catch (error) {
          console.error("Failed to parse message from %s:", endpoint, error);
        }
      });

      ws.on("close", () => {
        console.log(`❌ Disconnected from gossip peer: ${endpoint}`);
        this.connections.delete(endpoint);
      });

      ws.on("error", (error: Error) => {
        console.error("❌ WebSocket error for %s:", endpoint, error.message);
        console.error(`    Error details:`, error);
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to connect to ${endpoint}: ${errorMessage}`);
      if (error instanceof Error && error.stack) {
        console.error(`    Stack trace:`, error.stack);
      }
      throw error; // Re-throw to properly handle in Promise.allSettled
    }
  }

  /**
   * Handle incoming gossip messages
   */
  private handleGossipMessage(ws: WebSocket, message: GossipMessage): void {
    this.stats.messagesReceived++;

    // Check if we've already processed this message
    if (this.messageHistory.has(message.messageId)) {
      return;
    }

    // Add to message history
    this.messageHistory.set(message.messageId, {
      messageId: message.messageId,
      timestamp: message.timestamp,
      propagatedTo: new Set(),
    });

    // Cleanup old messages
    if (this.messageHistory.size > this.config.maxMessageHistory) {
      this.cleanupMessageHistory();
    }

    console.log(`📨 Received gossip message: ${message.type} from ${message.from}`);

    switch (message.type) {
      case "join":
        this.handleJoinMessage(message, ws);
        break;

      case "leave":
        this.handleLeaveMessage(message);
        break;

      case "gossip":
        this.handleGossipDataMessage(message);
        break;

      case "sync":
        this.handleSyncMessage(message, ws);
        break;

      case "heartbeat":
        this.handleHeartbeatMessage(message);
        break;

      default:
        console.log(`Unknown gossip message type: ${message.type}`);
    }

    // Propagate message to other peers if TTL > 0
    if (message.ttl > 0) {
      this.propagateMessage(message, ws);
    }
  }

  /**
   * Handle join messages from new peers
   */
  private handleJoinMessage(message: GossipMessage, ws: WebSocket): void {
    const peerData = message.data;
    const peerId = message.from;

    if (peerId === this.getNodeId()) {
      return; // Ignore our own messages
    }

    // Handle special peer discovery messages
    if (peerData.type === "peer_discovery") {
      this.handlePeerDiscoveryMessage(peerData.peers);
      return;
    }

    if (peerData.type === "peer_announcement") {
      this.handlePeerAnnouncementMessage(peerData.peer);
      return;
    }

    const existingPeer = this.peers.get(peerId);

    // Get endpoints from peer data or existing peer
    const validatedApiEndpoint = peerData.apiEndpoint || existingPeer?.apiEndpoint;
    let validatedGossipEndpoint = peerData.gossipEndpoint || existingPeer?.gossipEndpoint;

    // Only validate gossip endpoint (WebSocket), not API endpoint (HTTP)
    try {
      // API endpoint can be HTTP/HTTPS, no validation needed for protocol
      // Just store it as-is since it's for API calls, not WebSocket connections

      // Validate gossip endpoint using whitelist mechanism
      if (validatedGossipEndpoint) {
        validatedGossipEndpoint =
          GossipWhitelistValidator.validateEndpoint(validatedGossipEndpoint);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`⚠️ Rejected peer ${peerId} due to invalid gossip endpoint: ${errorMessage}`);
      return; // Reject peer with invalid endpoints
    }

    const peer: PeerInfo = {
      nodeId: peerId,
      publicKey: peerData.publicKey || existingPeer?.publicKey,
      apiEndpoint: validatedApiEndpoint,
      gossipEndpoint: validatedGossipEndpoint,
      status: "active",
      lastSeen: new Date(),
      region: peerData.region || existingPeer?.region,
      capabilities: peerData.capabilities || existingPeer?.capabilities || ["bls-signing"],
      version: peerData.version || existingPeer?.version,
      heartbeatCount: 0,
    };

    const isNewPeer = !existingPeer;
    this.peers.set(peerId, peer);

    // Update connection mapping
    if (peer.gossipEndpoint && !this.connections.has(peer.gossipEndpoint)) {
      this.connections.set(peer.gossipEndpoint, ws);
    }

    console.log(`👋 Peer joined: ${peerId} (${peer.apiEndpoint}). Total peers: ${this.peers.size}`);

    // Send sync response with our current state only for new peers
    if (isNewPeer) {
      this.sendSyncMessage(ws);

      // Send information about other known peers to the new peer
      this.sendKnownPeersToNewPeer(ws, peerId);

      // Announce the new peer to other existing peers
      this.announceNewPeerToOthers(peer, ws);
    }

    // Connect to the new peer if we don't have a connection
    const myEndpoint =
      this.configService.get("GOSSIP_PUBLIC_URL") || `ws://localhost:${this.port}/ws`;
    if (isNewPeer && peer.gossipEndpoint && peer.gossipEndpoint !== myEndpoint) {
      setTimeout(() => this.connectToPeer(peer.gossipEndpoint!), 1000);
    }

    this.updateStats();

    // Auto-save known peers when new peers join
    if (isNewPeer) {
      setTimeout(() => this.saveKnownPeers(), 1000);
    }
  }

  /**
   * Handle leave messages from departing peers
   */
  private handleLeaveMessage(message: GossipMessage): void {
    const peerId = message.from;
    const peer = this.peers.get(peerId);

    if (peer) {
      peer.status = "inactive";
      console.log(`👋 Peer left: ${peerId}`);

      // Clean up connection
      if (peer.gossipEndpoint) {
        const ws = this.connections.get(peer.gossipEndpoint);
        if (ws) {
          ws.close();
          this.connections.delete(peer.gossipEndpoint);
        }
      }

      this.updateStats();
    }
  }

  /**
   * Handle gossip data messages
   */
  private handleGossipDataMessage(message: GossipMessage): void {
    const { key, value, version } = message.data;

    // Update our state if the incoming version is newer
    const currentData = this.nodeState.data.get(key);
    const currentVersion = currentData?.version || 0;

    if (version > currentVersion) {
      this.nodeState.data.set(key, {
        value,
        version,
        timestamp: message.timestamp,
      });
      this.nodeState.version++;
      this.nodeState.lastUpdated = new Date();

      console.log(`📝 Updated gossip data: ${key} = ${JSON.stringify(value)} (v${version})`);
    }
  }

  /**
   * Handle sync messages for state synchronization
   */
  private handleSyncMessage(message: GossipMessage, ws: WebSocket): void {
    // Process incoming sync data and update our state
    const syncData = message.data;
    if (Array.isArray(syncData)) {
      syncData.forEach(item => {
        const { key, value, version, timestamp } = item;
        const currentData = this.nodeState.data.get(key);
        const currentVersion = currentData?.version || 0;

        if (version > currentVersion) {
          this.nodeState.data.set(key, { value, version, timestamp });
          this.nodeState.version++;
          this.nodeState.lastUpdated = new Date();
          console.log(`🔄 Synced data: ${key} = ${JSON.stringify(value)} (v${version})`);
        }
      });
    }
  }

  /**
   * Handle heartbeat messages
   */
  private handleHeartbeatMessage(message: GossipMessage): void {
    const peerId = message.from;
    const peer = this.peers.get(peerId);

    if (peer) {
      peer.lastSeen = new Date();
      peer.status = "active";
      peer.heartbeatCount++;
    }
  }

  /**
   * Propagate message to random subset of peers
   */
  private propagateMessage(message: GossipMessage, sender: WebSocket): void {
    const messageHistory = this.messageHistory.get(message.messageId);
    if (!messageHistory) return;

    // Decrease TTL
    message.ttl--;

    // Select random peers for gossip (excluding sender)
    const availablePeers = Array.from(this.connections.entries())
      .filter(([_, ws]) => ws !== sender && ws.readyState === WebSocket.OPEN)
      .filter(([endpoint, _]) => !messageHistory.propagatedTo.has(endpoint));

    const peersToGossip = this.selectRandomPeers(availablePeers, this.config.fanout);

    peersToGossip.forEach(([endpoint, ws]) => {
      this.sendMessage(ws, message);
      messageHistory.propagatedTo.add(endpoint);
      this.stats.messagesSent++;
    });
  }

  /**
   * Start the gossip protocol loop
   */
  private startGossipProtocol(): void {
    this.gossipInterval = setInterval(() => {
      this.performGossipRound();
    }, this.config.gossipInterval);
  }

  /**
   * Perform a single gossip round
   */
  private performGossipRound(): void {
    if (this.connections.size === 0) return;

    this.stats.gossipRounds++;
    this.stats.lastGossipTime = new Date();

    // Select random peers for this gossip round
    const availableConnections = Array.from(this.connections.entries()).filter(
      ([_, ws]) => ws.readyState === WebSocket.OPEN
    );

    if (availableConnections.length === 0) return;

    const selectedPeers = this.selectRandomPeers(availableConnections, this.config.fanout);

    // Gossip some data to selected peers
    selectedPeers.forEach(([_, ws]) => {
      this.gossipRandomData(ws);
    });

    console.log(`🗣️  Performed gossip round to ${selectedPeers.length} peers`);
  }

  /**
   * Gossip random data to a peer
   */
  private gossipRandomData(ws: WebSocket): void {
    const dataEntries = Array.from(this.nodeState.data.entries());
    if (dataEntries.length === 0) return;

    // Select a random piece of data to gossip
    const randomIndex = Math.floor(Math.random() * dataEntries.length);
    const [key, data] = dataEntries[randomIndex];

    const gossipMessage: GossipMessage = {
      type: "gossip",
      from: this.getNodeId(),
      data: {
        key,
        value: data.value,
        version: data.version,
      },
      timestamp: Date.now(),
      ttl: this.config.maxTTL,
      messageId: uuidv4(),
      version: this.nodeState.version,
    };

    this.sendMessage(ws, gossipMessage);
    this.stats.messagesSent++;

    // Track this message
    this.messageHistory.set(gossipMessage.messageId, {
      messageId: gossipMessage.messageId,
      timestamp: gossipMessage.timestamp,
      propagatedTo: new Set(),
    });
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
      this.checkPeerHealth();
    }, this.config.heartbeatInterval);
  }

  /**
   * Send heartbeat to all connected peers
   */
  private sendHeartbeat(): void {
    const heartbeat: GossipMessage = {
      type: "heartbeat",
      from: this.getNodeId(),
      data: {
        timestamp: Date.now(),
        status: "active",
        version: this.nodeState.version,
      },
      timestamp: Date.now(),
      ttl: 1, // Heartbeats have low TTL
      messageId: uuidv4(),
      version: this.nodeState.version,
    };

    this.broadcastMessage(heartbeat);
  }

  /**
   * Check peer health and mark suspected peers
   */
  private checkPeerHealth(): void {
    const now = Date.now();

    this.peers.forEach((peer, peerId) => {
      const timeSinceLastSeen = now - peer.lastSeen.getTime();

      if (timeSinceLastSeen > this.config.suspicionTimeout && peer.status === "active") {
        peer.status = "suspected";
        console.log(`⚠️  Peer suspected: ${peerId} (last seen ${timeSinceLastSeen}ms ago)`);
      }
    });

    this.updateStats();
  }

  /**
   * Start cleanup mechanism
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactivePeers();
      this.cleanupMessageHistory();
    }, this.config.cleanupTimeout);
  }

  /**
   * Clean up inactive peers
   */
  private cleanupInactivePeers(): void {
    const now = Date.now();
    const peersToRemove: string[] = [];

    this.peers.forEach((peer, peerId) => {
      const timeSinceLastSeen = now - peer.lastSeen.getTime();

      if (timeSinceLastSeen > this.config.cleanupTimeout && peer.status !== "active") {
        peersToRemove.push(peerId);
      }
    });

    peersToRemove.forEach(peerId => {
      const peer = this.peers.get(peerId);
      if (peer?.gossipEndpoint) {
        const ws = this.connections.get(peer.gossipEndpoint);
        if (ws) {
          ws.close();
          this.connections.delete(peer.gossipEndpoint);
        }
      }
      this.peers.delete(peerId);
      console.log(`🧹 Cleaned up inactive peer: ${peerId}`);
    });

    if (peersToRemove.length > 0) {
      this.updateStats();
    }
  }

  /**
   * Clean up old message history
   */
  private cleanupMessageHistory(): void {
    const now = Date.now();
    const oldMessages: string[] = [];

    this.messageHistory.forEach((history, messageId) => {
      if (now - history.timestamp > this.config.cleanupTimeout) {
        oldMessages.push(messageId);
      }
    });

    oldMessages.forEach(messageId => {
      this.messageHistory.delete(messageId);
    });

    if (oldMessages.length > 0) {
      console.log(`🧹 Cleaned up ${oldMessages.length} old messages`);
    }
  }

  /**
   * Join the network
   */
  private joinNetwork(): void {
    const joinMessage: GossipMessage = {
      type: "join",
      from: this.getNodeId(),
      data: this.getNodeInfo(),
      timestamp: Date.now(),
      ttl: this.config.maxTTL,
      messageId: uuidv4(),
      version: this.nodeState.version,
    };

    this.broadcastMessage(joinMessage);
    console.log(`👋 Announced join to gossip network`);
  }

  /**
   * Leave the network
   */
  private leaveNetwork(): void {
    const leaveMessage: GossipMessage = {
      type: "leave",
      from: this.getNodeId(),
      data: { reason: "shutdown" },
      timestamp: Date.now(),
      ttl: this.config.maxTTL,
      messageId: uuidv4(),
      version: this.nodeState.version,
    };

    this.broadcastMessage(leaveMessage);
    console.log(`👋 Announced leave from gossip network`);
  }

  /**
   * Send join message to a specific peer
   */
  private sendJoinMessage(ws: WebSocket): void {
    const joinMessage: GossipMessage = {
      type: "join",
      from: this.getNodeId(),
      data: this.getNodeInfo(),
      timestamp: Date.now(),
      ttl: 0, // Direct message, don't propagate
      messageId: uuidv4(),
      version: this.nodeState.version,
    };

    this.sendMessage(ws, joinMessage);
  }

  /**
   * Send sync message to a specific peer
   */
  private sendSyncMessage(ws: WebSocket): void {
    const syncData = Array.from(this.nodeState.data.entries()).map(([key, data]) => ({
      key,
      value: data.value,
      version: data.version,
      timestamp: data.timestamp,
    }));

    const syncMessage: GossipMessage = {
      type: "sync",
      from: this.getNodeId(),
      data: syncData,
      timestamp: Date.now(),
      ttl: 0, // Direct message, don't propagate
      messageId: uuidv4(),
      version: this.nodeState.version,
    };

    this.sendMessage(ws, syncMessage);
  }

  /**
   * Send information about known peers to a newly joined peer
   */
  private sendKnownPeersToNewPeer(ws: WebSocket, newPeerId: string): void {
    const knownPeers = Array.from(this.peers.values())
      .filter(peer => peer.nodeId !== newPeerId && peer.status === "active")
      .map(peer => ({
        id: peer.nodeId,
        publicKey: peer.publicKey,
        apiEndpoint: peer.apiEndpoint,
        gossipEndpoint: peer.gossipEndpoint,
        region: peer.region,
        capabilities: peer.capabilities,
        version: peer.version,
      }));

    if (knownPeers.length > 0) {
      const peerInfoMessage: GossipMessage = {
        type: "join",
        from: this.getNodeId(),
        data: {
          type: "peer_discovery",
          peers: knownPeers,
        },
        timestamp: Date.now(),
        ttl: 0, // Direct message, don't propagate
        messageId: uuidv4(),
        version: this.nodeState.version,
      };

      this.sendMessage(ws, peerInfoMessage);
      console.log(`📋 Sent ${knownPeers.length} known peers to ${newPeerId}`);
    }
  }

  /**
   * Announce new peer to other existing peers
   */
  private announceNewPeerToOthers(newPeer: PeerInfo, excludeWs: WebSocket): void {
    const announcement: GossipMessage = {
      type: "join",
      from: this.getNodeId(),
      data: {
        type: "peer_announcement",
        peer: {
          id: newPeer.nodeId,
          publicKey: newPeer.publicKey,
          apiEndpoint: newPeer.apiEndpoint,
          gossipEndpoint: newPeer.gossipEndpoint,
          region: newPeer.region,
          capabilities: newPeer.capabilities,
          version: newPeer.version,
        },
      },
      timestamp: Date.now(),
      ttl: 1, // Allow one hop propagation
      messageId: uuidv4(),
      version: this.nodeState.version,
    };

    // Send to all connected peers except the new one
    this.connections.forEach(ws => {
      if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
        this.sendMessage(ws, announcement);
        this.stats.messagesSent++;
      }
    });

    console.log(`📢 Announced new peer ${newPeer.nodeId} to other peers`);
  }

  /**
   * Handle peer discovery messages (list of known peers)
   */
  private handlePeerDiscoveryMessage(peers: any[]): void {
    console.log(`📋 Received ${peers.length} peer discoveries`);

    peers.forEach(peerInfo => {
      if (peerInfo.id !== this.getNodeId() && !this.peers.has(peerInfo.id)) {
        const peer: PeerInfo = {
          nodeId: peerInfo.id,
          publicKey: peerInfo.publicKey,
          apiEndpoint: peerInfo.apiEndpoint,
          gossipEndpoint: peerInfo.gossipEndpoint,
          status: "active",
          lastSeen: new Date(),
          region: peerInfo.region || "local",
          capabilities: peerInfo.capabilities || ["bls-signing"],
          version: peerInfo.version || "1.0.0",
          heartbeatCount: 0,
        };

        this.peers.set(peerInfo.id, peer);
        console.log(`🔍 Discovered new peer: ${peerInfo.id} (${peerInfo.apiEndpoint})`);

        // Try to connect to the discovered peer
        const myEndpoint =
          this.configService.get("GOSSIP_PUBLIC_URL") || `ws://localhost:${this.port}/ws`;
        if (peer.gossipEndpoint && peer.gossipEndpoint !== myEndpoint) {
          setTimeout(() => this.connectToPeer(peer.gossipEndpoint!), 2000);
        }
      }
    });

    this.updateStats();
  }

  /**
   * Handle peer announcement messages (single peer info)
   */
  private handlePeerAnnouncementMessage(peerInfo: any): void {
    if (peerInfo.id !== this.getNodeId() && !this.peers.has(peerInfo.id)) {
      const peer: PeerInfo = {
        nodeId: peerInfo.id,
        publicKey: peerInfo.publicKey,
        apiEndpoint: peerInfo.apiEndpoint,
        gossipEndpoint: peerInfo.gossipEndpoint,
        status: "active",
        lastSeen: new Date(),
        region: peerInfo.region || "local",
        capabilities: peerInfo.capabilities || ["bls-signing"],
        version: peerInfo.version || "1.0.0",
        heartbeatCount: 0,
      };

      this.peers.set(peerInfo.id, peer);
      console.log(`📢 Announced peer discovered: ${peerInfo.id} (${peerInfo.apiEndpoint})`);

      // Try to connect to the announced peer
      const myEndpoint =
        this.configService.get("GOSSIP_PUBLIC_URL") || `ws://localhost:${this.port}/ws`;
      if (peer.gossipEndpoint && peer.gossipEndpoint !== myEndpoint) {
        setTimeout(() => this.connectToPeer(peer.gossipEndpoint!), 2000);
      }

      this.updateStats();
    }
  }

  /**
   * Broadcast message to all connected peers
   */
  private broadcastMessage(message: GossipMessage): void {
    this.connections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        this.sendMessage(ws, message);
        this.stats.messagesSent++;
      }
    });
  }

  /**
   * Send message to a specific peer
   */
  private sendMessage(ws: WebSocket, message: GossipMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Select random peers from available connections
   */
  private selectRandomPeers(peers: [string, WebSocket][], count: number): [string, WebSocket][] {
    const shuffled = [...peers].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, peers.length));
  }

  /**
   * Clean up connection references
   */
  private cleanupConnection(ws: WebSocket): void {
    this.connections.forEach((conn, endpoint) => {
      if (conn === ws) {
        this.connections.delete(endpoint);
      }
    });
  }

  /**
   * Update statistics
   */
  private updateStats(): void {
    this.stats.totalPeers = this.peers.size;
    this.stats.activePeers = Array.from(this.peers.values()).filter(
      p => p.status === "active"
    ).length;
    this.stats.suspectedPeers = Array.from(this.peers.values()).filter(
      p => p.status === "suspected"
    ).length;
  }

  /**
   * Wait for node to be ready
   */
  private async waitForNodeReady(timeoutMs: number = 8000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const nodeState = this.nodeService.getNodeState();
      if (nodeState && nodeState.nodeId) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.warn("GossipService: waitForNodeReady timed out; proceeding with limited node info");
  }

  /**
   * Disconnect from all peers
   */
  private disconnectFromPeers(): void {
    this.connections.forEach((ws, endpoint) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });
    this.connections.clear();
  }

  /**
   * Stop gossip protocol
   */
  private stopGossipProtocol(): void {
    if (this.gossipInterval) {
      clearInterval(this.gossipInterval);
    }
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }

  /**
   * Stop cleanup
   */
  private stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * Start reconnect mechanism for resilience
   */
  private startReconnectMechanism(): void {
    this.reconnectInterval = setInterval(() => {
      this.attemptReconnections();
    }, 30000); // Try reconnecting every 30 seconds
  }

  /**
   * Stop reconnect mechanism
   */
  private stopReconnectMechanism(): void {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
    }
  }

  /**
   * Attempt to reconnect to disconnected peers
   */
  private async attemptReconnections(): Promise<void> {
    const disconnectedPeers = Array.from(this.peers.values())
      .filter(peer => peer.status !== "active" || !this.connections.has(peer.gossipEndpoint!))
      .filter(peer => {
        const myEndpoint =
          this.configService.get("GOSSIP_PUBLIC_URL") || `ws://localhost:${this.port}/ws`;
        return peer.gossipEndpoint && peer.gossipEndpoint !== myEndpoint;
      });

    if (disconnectedPeers.length > 0) {
      console.log(`🔄 Attempting to reconnect to ${disconnectedPeers.length} peers...`);

      for (const peer of disconnectedPeers) {
        if (peer.gossipEndpoint) {
          try {
            await this.connectToPeer(peer.gossipEndpoint);
          } catch (error) {
            console.log(
              `❌ Failed to reconnect to ${peer.nodeId}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }
    }

    // If we have no active connections, try bootstrap peers again
    if (this.connections.size === 0) {
      console.log("🆘 No active connections, attempting bootstrap reconnection...");
      await this.connectToBootstrapPeers();
      await this.connectToKnownPeers();
    }
  }

  /**
   * Load known peers from persistent storage
   */
  private async loadKnownPeers(): Promise<void> {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.knownPeersFile);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(this.knownPeersFile)) {
        const data = fs.readFileSync(this.knownPeersFile, "utf8");
        const knownPeers = JSON.parse(data) as PeerInfo[];

        knownPeers.forEach(peer => {
          if (peer.nodeId !== this.getNodeId()) {
            // Mark as inactive initially, will be updated when we connect
            peer.status = "inactive";
            peer.lastSeen = new Date(peer.lastSeen);
            this.peers.set(peer.nodeId, peer);
          }
        });

        console.log(`📚 Loaded ${knownPeers.length} known peers from previous session`);
      }
    } catch (error) {
      console.warn(
        `⚠️  Failed to load known peers: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Save known peers to persistent storage
   */
  private async saveKnownPeers(): Promise<void> {
    try {
      const peersToSave = Array.from(this.peers.values())
        .filter(peer => peer.status === "active")
        .map(peer => ({
          ...peer,
          lastSeen: peer.lastSeen.toISOString(), // Convert Date to string for JSON
        }));

      const dataDir = path.dirname(this.knownPeersFile);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      fs.writeFileSync(this.knownPeersFile, JSON.stringify(peersToSave, null, 2));
      console.log(`💾 Saved ${peersToSave.length} known peers for future sessions`);
    } catch (error) {
      console.warn(
        `⚠️  Failed to save known peers: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Connect to known peers from previous sessions
   */
  private async connectToKnownPeers(): Promise<void> {
    const knownPeers = Array.from(this.peers.values())
      .filter(peer => {
        const myEndpoint =
          this.configService.get("GOSSIP_PUBLIC_URL") || `ws://localhost:${this.port}/ws`;
        return peer.gossipEndpoint && peer.gossipEndpoint !== myEndpoint;
      })
      .filter(peer => !this.connections.has(peer.gossipEndpoint!));

    if (knownPeers.length > 0) {
      console.log(`🔗 Connecting to ${knownPeers.length} known peers from previous sessions...`);

      await Promise.allSettled(knownPeers.map(peer => this.connectToPeer(peer.gossipEndpoint!)));
    }
  }

  /**
   * Get current node ID
   */
  private getNodeId(): string {
    const nodeState = this.nodeService.getNodeState();
    return nodeState?.nodeId || process.env.NODE_ID || "unknown-node";
  }

  /**
   * Get node information
   */
  private getNodeInfo(): any {
    const nodeState = this.nodeService.getNodeState();
    const nodeId = this.getNodeId();

    return {
      nodeId: nodeId, // Changed from 'id' to 'nodeId' to match peer data structure
      publicKey: nodeState?.publicKey,
      apiEndpoint: this.configService.get("PUBLIC_URL") || `http://localhost:${this.port}`,
      gossipEndpoint:
        this.configService.get("GOSSIP_PUBLIC_URL") || `ws://localhost:${this.port}/ws`,
      region: "local",
      capabilities: ["bls-signing", "message-aggregation"],
      version: "1.0.0",
      status: "active",
    };
  }

  // Public API methods

  /**
   * Get all known peers
   */
  getPeers(): PeerInfo[] {
    return Array.from(this.peers.values()).filter(peer => peer.status === "active");
  }

  /**
   * Get all peers including self
   */
  getAllPeersIncludingSelf(): PeerInfo[] {
    const nodeInfo = this.getNodeInfo();
    const selfPeer: PeerInfo = {
      nodeId: nodeInfo.nodeId, // Changed from nodeInfo.id to nodeInfo.nodeId
      publicKey: nodeInfo.publicKey,
      apiEndpoint: nodeInfo.apiEndpoint,
      gossipEndpoint: nodeInfo.gossipEndpoint,
      status: "active",
      lastSeen: new Date(),
      region: nodeInfo.region,
      capabilities: nodeInfo.capabilities,
      version: nodeInfo.version,
      heartbeatCount: 0,
    };

    const otherPeers = this.getPeers();
    return [selfPeer, ...otherPeers];
  }

  /**
   * Get gossip statistics
   */
  getStats(): GossipStats {
    return { ...this.stats };
  }

  /**
   * Set a key-value pair in the gossip state
   */
  setData(key: string, value: any): void {
    const version = Date.now(); // Use timestamp as version
    this.nodeState.data.set(key, { value, version, timestamp: Date.now() });
    this.nodeState.version++;
    this.nodeState.lastUpdated = new Date();

    console.log(`📝 Set gossip data: ${key} = ${JSON.stringify(value)} (v${version})`);
  }

  /**
   * Get a value from the gossip state
   */
  getData(key: string): any {
    const data = this.nodeState.data.get(key);
    return data?.value;
  }

  /**
   * Get all gossip data
   */
  getAllData(): Map<string, any> {
    const result = new Map();
    this.nodeState.data.forEach((data, key) => {
      result.set(key, data.value);
    });
    return result;
  }

  /**
   * Get node state
   */
  getNodeState(): NodeState {
    return {
      ...this.nodeState,
      data: new Map(this.nodeState.data),
    };
  }
}
