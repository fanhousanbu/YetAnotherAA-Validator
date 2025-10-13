import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class CreateNodeDto {
  @ApiProperty({
    description: "Custom node name",
    required: false,
    example: "validator-node-1",
  })
  @IsOptional()
  @IsString()
  nodeName?: string;

  @ApiProperty({
    description: "Node description",
    required: false,
    example: "Production validator node",
  })
  @IsOptional()
  @IsString()
  description?: string;
}
