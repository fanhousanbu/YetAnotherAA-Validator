export default () => {
  // Validate required environment variables
  const requiredVars = ["ETH_RPC_URL", "VALIDATOR_CONTRACT_ADDRESS"];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(
      `Environment configuration validation failed:\n${missingVars.map(v => `  - ${v} is required`).join("\n")}`
    );
  }

  const port = parseInt(process.env.PORT || "3000", 10);

  console.log("✅ Environment configuration validated successfully");
  console.log(`   - Validator Contract: ${process.env.VALIDATOR_CONTRACT_ADDRESS}`);
  console.log(`   - ETH RPC URL: ${process.env.ETH_RPC_URL}`);
  console.log(`   - Port: ${port}`);
  console.log(`   - Node State File: node_state.json (fixed)`);

  return {
    // Server
    port,
    host: "0.0.0.0",
    publicUrl: process.env.PUBLIC_URL || `http://localhost:${port}`,

    // Blockchain
    ethRpcUrl: process.env.ETH_RPC_URL,
    ethPrivateKey: process.env.ETH_PRIVATE_KEY,
    validatorContractAddress: process.env.VALIDATOR_CONTRACT_ADDRESS,

    // Gossip Network
    gossipPublicUrl: process.env.GOSSIP_PUBLIC_URL || `ws://localhost:${port}/ws`,
    gossipBootstrapPeers: parseBootstrapPeers(process.env.GOSSIP_BOOTSTRAP_PEERS || ""),
    gossipInterval: parseInt(process.env.GOSSIP_INTERVAL || "5000", 10),
    gossipFanout: parseInt(process.env.GOSSIP_FANOUT || "3", 10),
    gossipMaxTtl: parseInt(process.env.GOSSIP_MAX_TTL || "5", 10),
    gossipHeartbeatInterval: parseInt(process.env.GOSSIP_HEARTBEAT_INTERVAL || "10000", 10),
    gossipSuspicionTimeout: parseInt(process.env.GOSSIP_SUSPICION_TIMEOUT || "30000", 10),
    gossipCleanupTimeout: parseInt(process.env.GOSSIP_CLEANUP_TIMEOUT || "60000", 10),
    gossipMaxMessageHistory: parseInt(process.env.GOSSIP_MAX_MESSAGE_HISTORY || "1000", 10),
  };
};

function parseBootstrapPeers(peersString: string): string[] {
  if (!peersString) return [];
  return peersString
    .split(",")
    .map(p => p.trim())
    .filter(p => p.length > 0);
}
