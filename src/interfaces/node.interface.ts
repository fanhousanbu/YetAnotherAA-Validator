export interface NodeKeyPair {
  nodeId: string;
  nodeName: string;
  privateKey: string;
  publicKey: string;
  description: string;
}

export interface NodeState {
  nodeId: string;
  nodeName: string;
  privateKey: string;
  publicKey: string;
  stakeStatus?: "not_staked" | "staked" | "unstaking";
  stakeAmount?: string;
  stakedAt?: string;
  registeredAt?: string;
  createdAt: string;
  description: string;
}

export interface SignerConfig {
  description: string;
  contractAddress: string;
  registeredAt: string;
  totalNodes: number;
  owner: string;
  keyPairs: NodeKeyPair[];
  contractInfo: {
    name: string;
    address: string;
    network: string;
    owner: string;
    registeredNodes: number;
  };
}
