export interface GossipMessage {
  type: "gossip" | "sync" | "heartbeat" | "join" | "leave";
  from: string;
  to?: string; // Optional: for directed messages
  data: any;
  timestamp: number;
  ttl: number; // Time to live for message propagation
  messageId: string; // Unique message identifier
  version: number; // Version for conflict resolution
}

export interface PeerInfo {
  nodeId: string;
  publicKey: string;
  apiEndpoint: string;
  gossipEndpoint: string;
  status: "active" | "inactive" | "suspected";
  lastSeen: Date;
  region?: string;
  capabilities?: string[];
  version?: string;
  heartbeatCount: number; // For failure detection
}

export interface NodeState {
  nodeId: string;
  data: Map<string, any>; // Key-value store for gossip data
  version: number; // Version vector for consistency
  lastUpdated: Date;
}

export interface GossipConfig {
  gossipInterval: number; // How often to gossip (ms)
  fanout: number; // Number of peers to gossip to each round
  maxTTL: number; // Maximum TTL for messages
  heartbeatInterval: number; // Heartbeat frequency (ms)
  suspicionTimeout: number; // Time before marking peer as suspected (ms)
  cleanupTimeout: number; // Time before removing inactive peers (ms)
  maxMessageHistory: number; // Maximum messages to keep in history
}

export interface GossipStats {
  totalPeers: number;
  activePeers: number;
  suspectedPeers: number;
  messagesSent: number;
  messagesReceived: number;
  gossipRounds: number;
  lastGossipTime: Date | null;
}

export interface MessageHistory {
  messageId: string;
  timestamp: number;
  propagatedTo: Set<string>; // Track which peers we've sent this message to
}
