export interface SignatureResult {
  nodeId: string;
  signature: string;
  signatureCompact?: string; // Optional compact format for backward compatibility
  publicKey: string;
  message: string;
}

export interface AggregateSignatureResult {
  signature: string;
  signatureCompact?: string; // Optional compact format for backward compatibility
}
