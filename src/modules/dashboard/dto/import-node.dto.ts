import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsOptional, Matches } from "class-validator";

export class ImportNodeDto {
  @ApiProperty({ description: "Node ID (bytes32 hex)", example: "0xc300..." })
  @IsString()
  @Matches(/^0x[0-9a-fA-F]{64}$/, { message: "nodeId must be a 0x-prefixed 32-byte hex string" })
  nodeId: string;

  @ApiProperty({ description: "BLS private key (hex)" })
  @IsString()
  privateKey: string;

  @ApiProperty({ description: "BLS public key in EIP2537 format (hex)" })
  @IsString()
  publicKey: string;

  @ApiProperty({ description: "Node name", required: false })
  @IsOptional()
  @IsString()
  nodeName?: string;

  @ApiProperty({ description: "Node description", required: false })
  @IsOptional()
  @IsString()
  description?: string;
}
